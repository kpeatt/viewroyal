"""
Matter matching module for deduplicating matters during ingestion.

Provides multi-signal matching (identifier + address + title similarity)
to correctly merge related matters and distinguish different ones.
"""

import difflib
import re
from collections import defaultdict
from typing import Optional

# --- Utility Functions ---


def parse_compound_identifier(raw: str) -> list[str]:
    """Split a compound identifier on ';' and return normalized parts.

    Example: "Bylaw No. 1160; REZ 2025-01" -> ["Bylaw 1160", "REZ 2025-01"]
    """
    if not raw:
        return []

    # Split on semicolons only (commas are used in "Bylaw No. X, 2024")
    parts = raw.split(";")
    result = []
    for part in parts:
        normalized = normalize_identifier(part.strip())
        if normalized and len(normalized) > 2:
            result.append(normalized)
    return result


def normalize_identifier(raw: str) -> str:
    """Normalize an identifier to a canonical short form.

    - "Bylaw No. 1160" -> "Bylaw 1160"
    - "Rezoning Application No. 2025-01" -> "REZ 2025-01"
    - "Temporary Use Permit No. 2025-03" -> "TUP 2025-03"
    - "Development Variance Permit No. 2024-01" -> "DVP 2024-01"
    - "Development Permit No. 2024-02" -> "DP 2024-02"
    """
    if not raw:
        return ""

    text = raw.strip()

    # Bylaw: "Bylaw No. 1160" -> "Bylaw 1160"
    m = re.match(
        r"(?:Amendment\s+)?Bylaw\s+(?:No\.?\s*)?(\d+(?:-\d+)?)", text, re.IGNORECASE
    )
    if m:
        return f"Bylaw {m.group(1)}"

    # Rezoning: various forms -> "REZ YYYY-NN"
    m = re.match(
        r"(?:Rezoning|REZ)\s+(?:Application\s+)?(?:No\.?\s*)?(\d{4}[\-\/]\d{2})",
        text,
        re.IGNORECASE,
    )
    if m:
        return f"REZ {m.group(1).replace('/', '-')}"

    # TUP: "Temporary Use Permit No. X" -> "TUP X"
    m = re.match(
        r"(?:Temporary\s+Use\s+Permit|TUP)\s+(?:No\.?\s*)?(\d{4}[\-\/]\d{2})",
        text,
        re.IGNORECASE,
    )
    if m:
        return f"TUP {m.group(1).replace('/', '-')}"

    # DVP: "Development Variance Permit No. X" -> "DVP X"
    m = re.match(
        r"(?:Development\s+Variance\s+Permit|DVP)\s+(?:No\.?\s*)?(\d{4}[\-\/]\d{2})",
        text,
        re.IGNORECASE,
    )
    if m:
        return f"DVP {m.group(1).replace('/', '-')}"

    # DP: "Development Permit No. X" -> "DP X"
    m = re.match(
        r"(?:Development\s+Permit|DP)\s+(?:No\.?\s*)?(\d{4}[\-\/]\d{2})",
        text,
        re.IGNORECASE,
    )
    if m:
        return f"DP {m.group(1).replace('/', '-')}"

    # Fallback: strip extra whitespace
    return " ".join(text.split())


def extract_addresses(text: str) -> list[str]:
    """Extract street addresses from text using regex.

    Matches patterns like "258 Helmcken Road", "1 Bate Road", etc.
    """
    if not text:
        return []

    # Match: number + street name + street type
    pattern = r"\b(\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Lane|Ln|Place|Pl|Crescent|Cres|Way|Boulevard|Blvd|Court|Ct|Terrace|Terr|Circle|Cir))\b"
    matches = re.findall(pattern, text, re.IGNORECASE)
    return [normalize_address(m) for m in matches]


def normalize_address(addr: str) -> str:
    """Normalize an address: lowercase, expand abbreviations."""
    if not addr:
        return ""

    text = addr.strip().lower()

    # Expand common abbreviations
    replacements = {
        r"\brd\b": "road",
        r"\bst\b": "street",
        r"\bave\b": "avenue",
        r"\bdr\b": "drive",
        r"\bln\b": "lane",
        r"\bpl\b": "place",
        r"\bcres\b": "crescent",
        r"\bblvd\b": "boulevard",
        r"\bct\b": "court",
        r"\bterr\b": "terrace",
        r"\bcir\b": "circle",
    }
    for pattern, replacement in replacements.items():
        text = re.sub(pattern, replacement, text)

    return " ".join(text.split())


def extract_numbers(text: str) -> set[str]:
    """Extract distinct numbers from text."""
    if not text:
        return set()
    return set(re.findall(r"\d+", text))


def check_number_mismatch(t1: str, t2: str) -> bool:
    """Returns True if t1 and t2 contain conflicting numbers.

    e.g. {1156} vs {1157} -> True (mismatch)
    e.g. {258} vs {258} -> False (match)
    e.g. {258} vs {258, 2025} -> False (subset)
    e.g. {2016, 7} vs {2016, 9} -> True (partial overlap but disjoint distincts)
    """
    nums1 = extract_numbers(t1)
    nums2 = extract_numbers(t2)

    if nums1 and nums2:
        # If disjoint, definite mismatch (e.g. 100 vs 101)
        if nums1.isdisjoint(nums2):
            return True
        # If overlap, check for conflicting distinct numbers (neither is subset of other)
        if not nums1.issubset(nums2) and not nums2.issubset(nums1):
            return True
    return False


# Category keywords for grouping matters
CATEGORY_KEYWORDS = {
    "rezoning": {"rezoning", "rezone", "rez"},
    "tup": {"temporary use permit", "tup"},
    "dvp": {"development variance permit", "dvp", "variance"},
    "dp": {"development permit"},
    "bylaw": {"bylaw"},
    "subdivision": {"subdivision"},
    "oc_plan": {"official community plan", "ocp"},
}


def _extract_category_keywords(text: str) -> set[str]:
    """Extract category keyword groups present in text."""
    if not text:
        return set()
    lower = text.lower()
    found = set()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            found.add(category)
    return found


# --- MatterMatcher Class ---


class MatterMatcher:
    """Matches incoming agenda items to existing matters using multi-signal logic.

    Loaded once per ingestion session with all matters cached in memory.
    """

    def __init__(self, supabase_client):
        self.supabase = supabase_client
        self.matters = []
        self.identifier_index = defaultdict(list)  # normalized_id -> [matter]
        self.address_index = defaultdict(list)  # normalized_addr -> [matter]
        self._loaded = False

    def load(self):
        """Load all matters and build indices."""
        print("  [MatterMatcher] Loading all matters...")
        self.matters = self._fetch_all_matters()
        self._build_identifier_index()
        self._build_address_index()
        self._loaded = True
        print(
            f"  [MatterMatcher] Loaded {len(self.matters)} matters, "
            f"{len(self.identifier_index)} unique identifiers, "
            f"{len(self.address_index)} unique addresses."
        )

    def _fetch_all_matters(self) -> list[dict]:
        """Fetch all matters with pagination."""
        all_data = []
        page = 0
        page_size = 1000
        while True:
            res = (
                self.supabase.table("matters")
                .select("id, title, identifier, status, category")
                .range(page * page_size, (page + 1) * page_size - 1)
                .execute()
            )
            if not res.data:
                break
            all_data.extend(res.data)
            if len(res.data) < page_size:
                break
            page += 1

        # Also fetch addresses from agenda_items
        addr_data = []
        page = 0
        while True:
            res = (
                self.supabase.table("agenda_items")
                .select("matter_id, related_address")
                .range(page * page_size, (page + 1) * page_size - 1)
                .execute()
            )
            if not res.data:
                break
            addr_data.extend(res.data)
            if len(res.data) < page_size:
                break
            page += 1

        # Attach addresses to matters
        matter_addrs = defaultdict(set)
        for row in addr_data:
            mid = row.get("matter_id")
            addrs = row.get("related_address")
            if not mid or not addrs:
                continue
            if isinstance(addrs, list):
                for a in addrs:
                    if a:
                        matter_addrs[mid].add(normalize_address(a))
            elif isinstance(addrs, str):
                matter_addrs[mid].add(normalize_address(addrs))

        for m in all_data:
            m["_addresses"] = matter_addrs.get(m["id"], set())

        return all_data

    def _build_identifier_index(self):
        """Build an index from normalized sub-identifiers to matters."""
        self.identifier_index.clear()
        for m in self.matters:
            if not m.get("identifier"):
                continue
            parts = parse_compound_identifier(m["identifier"])
            for part in parts:
                self.identifier_index[part.lower()].append(m)

    def _build_address_index(self):
        """Build an index from normalized addresses to matters."""
        self.address_index.clear()
        for m in self.matters:
            for addr in m.get("_addresses", set()):
                if addr:
                    self.address_index[addr].append(m)

    def _add_matter_to_indices(self, matter: dict):
        """Add a newly created matter to the in-memory indices."""
        self.matters.append(matter)
        if matter.get("identifier"):
            parts = parse_compound_identifier(matter["identifier"])
            for part in parts:
                self.identifier_index[part.lower()].append(matter)
        for addr in matter.get("_addresses", set()):
            if addr:
                self.address_index[addr].append(matter)

    def find_match(
        self,
        identifier: Optional[str],
        title: Optional[str],
        related_addresses: Optional[list[str]] = None,
    ) -> tuple[Optional[int], str, float]:
        """Find a matching matter using multi-signal matching.

        Returns: (matter_id, reason, confidence) or (None, reason, 0.0)
        """
        if not self._loaded:
            self.load()

        normalized_addrs = set()
        if related_addresses:
            normalized_addrs = {normalize_address(a) for a in related_addresses if a}

        # Also extract addresses from the title
        if title:
            title_addrs = extract_addresses(title)
            normalized_addrs.update(title_addrs)

        # --- Stage 1: Identifier matching ---
        if identifier:
            match = self._match_by_identifier(identifier, title, normalized_addrs)
            if match:
                return match

        # --- Stage 2: Address + category matching ---
        if normalized_addrs and title:
            match = self._match_by_address_and_category(title, normalized_addrs)
            if match:
                return match

        # No match found
        return None, "no_match", 0.0

    def _match_by_identifier(
        self,
        identifier: str,
        title: Optional[str],
        normalized_addrs: set[str],
    ) -> Optional[tuple[int, str, float]]:
        """Try to match by parsing and looking up identifier parts."""
        parts = parse_compound_identifier(identifier)
        if not parts:
            return None

        # Collect all candidate matters from all sub-identifiers
        candidates = {}  # matter_id -> matter
        for part in parts:
            key = part.lower()
            for m in self.identifier_index.get(key, []):
                candidates[m["id"]] = m

        if not candidates:
            return None

        if len(candidates) == 1:
            matter = list(candidates.values())[0]
            return matter["id"], f"identifier_exact:{parts[0]}", 1.0

        # Multiple candidates — disambiguation needed
        # Check if the incoming identifier has multiple sub-parts that narrow things down
        # e.g., "Bylaw 1160; REZ 2025-01" — a matter matching BOTH is a strong match
        best_match = None
        best_overlap = 0
        for m in candidates.values():
            m_parts = set(
                p.lower() for p in parse_compound_identifier(m.get("identifier", ""))
            )
            incoming_parts = set(p.lower() for p in parts)
            overlap = len(m_parts & incoming_parts)
            if overlap > best_overlap:
                best_overlap = overlap
                best_match = m

        # If one candidate has significantly more sub-identifier overlap, use it
        if best_match and best_overlap >= 2:
            return best_match["id"], f"identifier_multi_overlap:{best_overlap}", 0.98

        # Disambiguate with address
        if normalized_addrs:
            addr_matches = []
            for m in candidates.values():
                m_addrs = m.get("_addresses", set())
                if m_addrs & normalized_addrs:
                    addr_matches.append(m)

            if len(addr_matches) == 1:
                return (
                    addr_matches[0]["id"],
                    "identifier_ambiguous_resolved_by_address",
                    0.95,
                )

        # Disambiguate with title similarity
        if title:
            best_sim = 0.0
            best_title_match = None
            for m in candidates.values():
                sim = difflib.SequenceMatcher(
                    None, title.lower(), (m.get("title") or "").lower()
                ).ratio()
                if sim > best_sim:
                    best_sim = sim
                    best_title_match = m

            if best_title_match and best_sim > 0.7:
                return (
                    best_title_match["id"],
                    f"identifier_ambiguous_resolved_by_title:{best_sim:.2f}",
                    0.90,
                )

        # Still ambiguous — don't match (safer to create a new matter)
        return None

    def _match_by_address_and_category(
        self,
        title: str,
        normalized_addrs: set[str],
    ) -> Optional[tuple[int, str, float]]:
        """Match by shared address + title category keyword overlap."""
        incoming_categories = _extract_category_keywords(title)
        if not incoming_categories:
            return None

        candidates = []
        for addr in normalized_addrs:
            for m in self.address_index.get(addr, []):
                m_categories = _extract_category_keywords(m.get("title") or "")
                if m_categories & incoming_categories:
                    candidates.append(m)

        if not candidates:
            return None

        # Deduplicate
        seen_ids = set()
        unique_candidates = []
        for m in candidates:
            if m["id"] not in seen_ids:
                seen_ids.add(m["id"])
                unique_candidates.append(m)

        if len(unique_candidates) == 1:
            m = unique_candidates[0]
            # Safety: check number mismatch
            if check_number_mismatch(title, m.get("title") or ""):
                return None
            return m["id"], "address_category_match", 0.85

        # Multiple candidates — use title similarity to pick the best
        best_sim = 0.0
        best_match = None
        for m in unique_candidates:
            if check_number_mismatch(title, m.get("title") or ""):
                continue
            sim = difflib.SequenceMatcher(
                None, title.lower(), (m.get("title") or "").lower()
            ).ratio()
            if sim > best_sim:
                best_sim = sim
                best_match = m

        if best_match and best_sim > 0.6:
            return (
                best_match["id"],
                f"address_category_title:{best_sim:.2f}",
                0.85,
            )

        return None
