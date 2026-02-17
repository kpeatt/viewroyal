import glob
import hashlib
import json
import os
import re
import time

import requests as http_requests
from bs4 import BeautifulSoup
from google import genai
from supabase import Client, create_client

import pipeline.parser as parser
from pipeline import utils
from pipeline.alignment import align_meeting_items
from pipeline.names import CANONICAL_NAMES
from pipeline.ingestion.ai_refiner import refine_meeting_data
from pipeline.ingestion.matter_matching import MatterMatcher
from pipeline.video.vimeo import VimeoClient


def to_seconds(val):
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str) and ":" in val:
        try:
            parts = val.split(":")
            if len(parts) == 3:  # HH:MM:SS
                return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
            if len(parts) == 2:  # MM:SS
                return float(parts[0]) * 60 + float(parts[1])
        except:
            pass
    return None


class MeetingIngester:
    def __init__(self, supabase_url, supabase_key, gemini_key=None, municipality_id=None):
        if not supabase_url or not supabase_key:
            raise ValueError("Supabase credentials required")

        self.supabase: Client = create_client(supabase_url, supabase_key)
        self.municipality_id = municipality_id or 1  # Default to View Royal
        self.gemini_client = None
        if gemini_key:
            self.gemini_client = genai.Client(api_key=gemini_key)
        else:
            print(
                "Warning: GEMINI_API_KEY not provided. Embeddings/Refinement will be skipped."
            )

        self.matcher = MatterMatcher(self.supabase, municipality_id=self.municipality_id)
        self._canonical_names = None  # Lazy-loaded per municipality

    def _get_canonical_names(self):
        """Load canonical names for this municipality from the DB.

        Fetches all known people associated with this municipality's organizations.
        Falls back to hardcoded CANONICAL_NAMES for View Royal (municipality_id=1).
        """
        if self._canonical_names is not None:
            return self._canonical_names

        try:
            # Get all people linked to this municipality's organizations via memberships
            orgs = (
                self.supabase.table("organizations")
                .select("id")
                .eq("municipality_id", self.municipality_id)
                .execute()
            )
            if orgs.data:
                org_ids = [o["id"] for o in orgs.data]
                res = (
                    self.supabase.table("memberships")
                    .select("person:people(name)")
                    .in_("organization_id", org_ids)
                    .execute()
                )
                names = list({
                    m["person"]["name"]
                    for m in res.data
                    if m.get("person") and m["person"].get("name")
                })
                if names:
                    self._canonical_names = names
                    return self._canonical_names
        except Exception as e:
            print(f"  [!] Failed to load canonical names from DB: {e}")

        # Fallback to hardcoded list for View Royal
        self._canonical_names = CANONICAL_NAMES
        return self._canonical_names

    def _get_active_council_members(self, meeting_date):
        """Fetch names of council members active on the given date."""
        try:
            # 1. Get Council Org ID
            orgs = (
                self.supabase.table("organizations")
                .select("id")
                .eq("classification", "Council")
                .eq("municipality_id", self.municipality_id)
                .execute()
            )
            if not orgs.data:
                return []
            org_ids = [o["id"] for o in orgs.data]

            # 2. Get Memberships active on date
            res = (
                self.supabase.table("memberships")
                .select("person:people(name)")
                .in_("organization_id", org_ids)
                .lte("start_date", meeting_date)
                .or_(f"end_date.is.null,end_date.gte.{meeting_date}")
                .execute()
            )

            names = [
                m["person"]["name"]
                for m in res.data
                if m.get("person") and m["person"].get("name")
            ]
            # Deduplicate names by converting to a set and back to a list
            return list(set(names))
        except Exception as e:
            print(f"  [!] Failed to fetch active council members: {e}")
            return []

    def get_or_create_organization(self, name, classification, dry_run=False):
        if dry_run:
            return 999
        res = (
            self.supabase.table("organizations")
            .select("id")
            .eq("name", name)
            .eq("municipality_id", self.municipality_id)
            .execute()
        )
        if res.data:
            return res.data[0]["id"]

        print(f"Creating Organization: {name}")
        data = {
            "name": name,
            "classification": classification,
            "municipality_id": self.municipality_id,
        }
        res = self.supabase.table("organizations").insert(data).execute()
        return res.data[0]["id"]

    def get_or_create_person(self, name, dry_run=False):
        if not name:
            return None

        # 1. Basic Junk Filter
        if "Speaker_" in name or "Unknown" in name or name.lower().strip() == "speaker":
            return None

        # 2. Extract roles before cleaning
        roles = utils.extract_roles_from_name(name)

        # 3. Clean and Canonicalize
        clean_name = utils.normalize_person_name(name)

        # 4. Final Validation against Junk/Blocklist
        from pipeline.names import is_valid_name

        if not is_valid_name(clean_name):
            return None

        if dry_run:
            return 888

        # 5. Get or Create Person
        res = (
            self.supabase.table("people").select("id").eq("name", clean_name).execute()
        )
        is_new_person = False
        if res.data:
            person_id = res.data[0]["id"]
        else:
            # Match existing
            all_people = self.supabase.table("people").select("id, name").execute().data
            existing_id = utils.match_person(clean_name, all_people)

            if existing_id:
                person_id = existing_id
            else:
                # Strict Rule: Do not create new Council members from meeting ingestion.
                # They must exist in the DB via election seeding.
                is_council_related = any(org_type == "Council" for _, org_type in roles)
                if is_council_related:
                    print(
                        f"  [!] Skipping creation of potential Council member: {clean_name} (Not found in election DB)"
                    )
                    return None

                print(f"Creating Person: {clean_name}")
                p_res = (
                    self.supabase.table("people").insert({"name": clean_name}).execute()
                )
                person_id = p_res.data[0]["id"]
                is_new_person = True

        # 6. Record Memberships/Roles
        for role, org_type in roles:
            if not is_new_person and org_type != "Staff":
                continue

            org_id = self.get_or_create_organization(org_type, org_type, dry_run)

            m_exists = (
                self.supabase.table("memberships")
                .select("id")
                .eq("person_id", person_id)
                .eq("organization_id", org_id)
                .eq("role", role)
                .execute()
            )

            if not m_exists.data:
                print(f"  [+] Recording Role: {clean_name} as {role} ({org_type})")
                self.supabase.table("memberships").insert(
                    {"person_id": person_id, "organization_id": org_id, "role": role}
                ).execute()

        return person_id

    def get_or_create_matter(
        self, identifier, title, date=None, dry_run=False, related_addresses=None
    ):
        # Use new matcher logic
        matter_id, reason, confidence = self.matcher.find_match(
            identifier, title, related_addresses
        )

        if matter_id:
            # Update existing matter dates if provided
            if date and not dry_run:
                res = (
                    self.supabase.table("matters")
                    .select("first_seen, last_seen")
                    .eq("id", matter_id)
                    .execute()
                )
                if res.data:
                    first = res.data[0].get("first_seen")
                    last = res.data[0].get("last_seen")
                    updates = {}
                    if not first or str(date) < str(first):
                        updates["first_seen"] = date
                    if not last or str(date) > str(last):
                        updates["last_seen"] = date

                    if updates:
                        self.supabase.table("matters").update(updates).eq(
                            "id", matter_id
                        ).execute()
            return matter_id

        if not identifier:
            return None

        # No match found. Create new matter.
        final_identifier = identifier
        # Use first valid identifier part if compound for the stored identifier field
        if ";" in identifier:
            final_identifier = identifier.split(";")[0].strip()

        print(f"  [+] New Matter Identified: {final_identifier} - {title}")
        if dry_run:
            return 777

        # Guess category from identifier
        category = "General"
        if "Bylaw" in identifier:
            category = "Bylaw"
        elif "Permit" in identifier or "DVP" in identifier or "DP" in identifier:
            category = "Development"

        data = {
            "title": title,
            "identifier": identifier,
            "category": category,
            "status": "Active",
            "first_seen": date,
            "last_seen": date,
            "municipality_id": self.municipality_id,
        }
        res = self.supabase.table("matters").insert(data).execute()
        new_record = res.data[0]
        # Update matcher cache to avoid duplicates in the same run
        self.matcher._add_matter_to_indices(new_record)
        return new_record["id"]

    def find_transcript(self, base_folder):
        folder = os.path.join(base_folder, "Audio")
        if not os.path.exists(folder):
            return None
        files = glob.glob(os.path.join(folder, "*.json"))
        for f in files:
            if any(
                x in f
                for x in [
                    "_raw_transcript.json",
                    "_segments.json",
                    "shared_media.json",
                    "refinement.json",
                    "attendance.json",
                    "_benchmark.json",
                    "_gemini_speakers.json",
                ]
            ):
                continue
            return f
        return None

    def get_raw_texts(self, folder_path, skip_cache=False):
        # Support for shared media pointers
        source_folder = folder_path
        shared_path = os.path.join(folder_path, "shared_media.json")
        if os.path.exists(shared_path):
            try:
                with open(shared_path, "r", encoding="utf-8") as f:
                    shared_data = json.load(f)
                    # Resolve relative path
                    source_folder = os.path.abspath(
                        os.path.join(folder_path, shared_data["canonical_folder"])
                    )
                    print(
                        f"  [Shared Media] Using transcript from: {os.path.basename(source_folder)}"
                    )
            except Exception as e:
                print(f"  [!] Error reading shared_media.json: {e}")

        # Agenda
        agenda_text = ""
        cached_agenda_path = os.path.join(folder_path, "agenda.md")
        if not skip_cache and os.path.exists(cached_agenda_path):
            with open(cached_agenda_path, "r", encoding="utf-8") as f:
                agenda_text = f.read()
        else:
            # Fall back to PDF extraction
            agenda_folder = os.path.join(source_folder, "Agenda")
            pdf_files = sorted(glob.glob(os.path.join(agenda_folder, "*.pdf")))
            if pdf_files:
                all_texts = []
                for pdf_file in pdf_files:
                    text = parser.get_pdf_text(pdf_file)
                    if len(text.strip()) < 100:
                        text = parser.get_pdf_text_ocr(pdf_file)
                    if text.strip():
                        all_texts.append(text)
                agenda_text = "\n\n---\n\n".join(all_texts)

            if not agenda_text or len(agenda_text.strip()) < 100:
                print(f"  [Fallback] Trying HTML for Agenda...")
                html_files = glob.glob(os.path.join(agenda_folder, "*.html"))
                if html_files:
                    try:
                        html_content = utils.read_text_file(html_files[0])
                        agenda_text = BeautifulSoup(
                            html_content, "html.parser"
                        ).get_text("\n", strip=True)
                    except Exception as e:
                        print(f"  [!] HTML fallback failed: {e}")

        # Minutes - check for cached Marker markdown first (2700x faster)
        minutes_text = ""
        cached_minutes_path = os.path.join(folder_path, "minutes.md")
        if not skip_cache and os.path.exists(cached_minutes_path):
            with open(cached_minutes_path, "r", encoding="utf-8") as f:
                minutes_text = f.read()
        else:
            # Fall back to PDF extraction
            minutes_folder = os.path.join(folder_path, "Minutes")
            pdf_files = sorted(glob.glob(os.path.join(minutes_folder, "*.pdf")))
            if pdf_files:
                all_texts = []
                for pdf_file in pdf_files:
                    text = parser.get_pdf_text(pdf_file)
                    if len(text.strip()) < 100:
                        text = parser.get_pdf_text_ocr(pdf_file)
                    if text.strip():
                        all_texts.append(text)
                minutes_text = "\n\n---\n\n".join(all_texts)

            if not minutes_text or len(minutes_text.strip()) < 100:
                print(f"  [Fallback] Trying HTML for Minutes...")
                html_files = glob.glob(os.path.join(minutes_folder, "*.html"))
                if html_files:
                    try:
                        html_content = utils.read_text_file(html_files[0])
                        minutes_text = BeautifulSoup(
                            html_content, "html.parser"
                        ).get_text("\n", strip=True)
                    except Exception as e:
                        print(f"  [!] HTML fallback failed: {e}")

        # Transcript
        transcript_text = ""

        transcript_path = self.find_transcript(source_folder)
        # print(f"  [DEBUG] Selected transcript path: {transcript_path}")

        # Check for raw transcript if diarized one is missing
        raw_transcript_path = None
        if not transcript_path:
            raw_path_audio = os.path.join(source_folder, "Audio", "raw_transcript.json")
            if os.path.exists(raw_path_audio):
                raw_transcript_path = raw_path_audio

        if transcript_path and os.path.exists(transcript_path):
            with open(transcript_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    transcript_text = "\n".join(
                        [
                            f"{seg.get('speaker', 'Unknown')}: {seg.get('text', '')}"
                            for seg in data
                        ]
                    )
                elif isinstance(data, dict) and "segments" in data:
                    # Handle cases where structure is {"segments": [...]}
                    transcript_text = "\n".join(
                        [
                            f"{seg.get('speaker', 'Unknown')}: {seg.get('text', '')}"
                            for seg in data["segments"]
                        ]
                    )

        elif raw_transcript_path:
            try:
                with open(raw_transcript_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        transcript_text = "\n".join(
                            [
                                f"{seg.get('speaker', 'Unknown')}: {seg.get('text', '')}"
                                for seg in data
                            ]
                        )
                    elif isinstance(data, dict) and "text" in data:
                        transcript_text = data["text"]
            except Exception as e:
                print(f"  [!] Error reading raw transcript: {e}")

        # print(f"  [DEBUG] Final transcript text length: {len(transcript_text)}")

        return agenda_text, minutes_text, transcript_text

    def extract_identifier_from_text(self, text):
        if not text:
            return None

        # 1. Prioritize Amendment Bylaws (e.g. "Amendment Bylaw No. 1101")
        # This prevents aggregating all amendments into the base "Bylaw 900"
        amendment_pattern = r"(?:Amendment\s+)?Bylaw\s+(?:No\.?\s*)?(\d+)"
        if "amendment" in text.lower():
            amend_idx = text.lower().find("amendment")
            matches = list(re.finditer(amendment_pattern, text, re.IGNORECASE))
            for match in matches:
                if match.start() >= amend_idx:
                    return f"Bylaw {match.group(1)}"

        # 2. General patterns
        patterns = [
            r"(Bylaw\s+(?:No\.?\s*)?\d+(?:-\d+)?)",
            r"((?:Rezoning|REZ)\s+(?:Application\s+)?(?:No\.?\s*)?\d{4}[\-\/]\d{2})",
            r"((?:Temporary\s+Use\s+Permit|TUP)\s+(?:No\.?\s*)?\d{4}[\-\/]\d{2})",
            r"(Development\s+Variance\s+Permit\s+(?:No\.?\s*)?\d{4}[\-\/]\d{2})",
            r"(DVP\s+(?:No\.?\s*)?\d{4}[\-\/]\d{2})",
            r"(Development\s+Permit\s+(?:No\.?\s*)?\d{4}[\-\/]\d{2})",
            r"(DP\s+(?:No\.?\s*)?\d{4}[\-\/]\d{2})",
        ]
        for pat in patterns:
            match = re.search(pat, text, re.IGNORECASE)
            if match:
                # Normalize "Bylaw No. 123" to "Bylaw 123" for consistency
                val = match.group(1).strip()
                if val.lower().startswith("bylaw"):
                    num_match = re.search(r"\d+", val)
                    if num_match:
                        return f"Bylaw {num_match.group(0)}"
                return val
        return None

    def map_type_to_org(self, m_type):
        """Maps a meeting_type enum value to the official Organization name."""
        if m_type in [
            "Regular Council",
            "Special Council",
            "Committee of the Whole",
            "Public Hearing",
        ]:
            return "Council", "Council"

        if m_type == "Board of Variance":
            return "Board of Variance", "Board"

        # Advisory committees often have the type in their name
        if m_type == "Advisory Committee":
            # This is a fallback; usually the title has the specific committee name
            return "Advisory Committee", "Advisory Committee"

        return m_type, "Committee"

    def normalize_address_list(self, address_input):
        if not address_input:
            return []
        if isinstance(address_input, list):
            return [a.strip() for a in address_input if a and str(a).strip()]

        if not isinstance(address_input, str):
            return []

        # Logic from fix_related_addresses.py
        address_str = address_input.strip()

        # 1. Handle "105, 106, 107 and 108 Glentana Road" pattern
        multi_num_pattern = r"^((?:\d+,\s*)*)(\d+)\s+(?:and|&)\s+(\d+)\s+(.*)$"
        match = re.match(multi_num_pattern, address_str, re.IGNORECASE)
        if match:
            prev_nums = match.group(1).replace(",", " ").split()
            num1 = match.group(2)
            num2 = match.group(3)
            street = match.group(4)
            all_nums = prev_nums + [num1, num2]
            return [f"{n.strip()} {street.strip()}" for n in all_nums]

        # 2. Handle simple "Street A and Street B" or "Street A, Street B"
        parts = re.split(r",\s*|\s+and\s+", address_str, flags=re.IGNORECASE)
        if len(parts) > 1:
            return [p.strip() for p in parts if p.strip()]

        return [address_str]

    # ── Geocoding ──

    NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
    NOMINATIM_USER_AGENT = "ViewRoyal.ai/1.0 (civic platform)"
    VIEW_ROYAL_VIEWBOX = "-123.55,48.42,-123.40,48.48"
    # Patterns that indicate a non-geocodable address value
    NON_ADDRESS_PREFIXES = ("various", "n/a", "tbd", "none", "multiple", "all", "general")

    def geocode_address(self, address):
        """Geocode a single address using Nominatim, biased to View Royal, BC.
        Returns (lat, lng) tuple or None. Includes 1.1s rate-limit delay."""
        if not address or not address.strip():
            return None

        addr = address.strip()
        # Skip non-address values
        if addr.lower().startswith(self.NON_ADDRESS_PREFIXES):
            return None

        # Append city context if not present
        addr_lower = addr.lower()
        if "view royal" not in addr_lower and "victoria" not in addr_lower and "bc" not in addr_lower:
            addr = f"{addr}, View Royal, BC, Canada"

        try:
            resp = http_requests.get(
                self.NOMINATIM_URL,
                params={
                    "q": addr,
                    "format": "json",
                    "limit": 1,
                    "viewbox": self.VIEW_ROYAL_VIEWBOX,
                    "bounded": 0,  # Prefer but don't restrict to viewbox
                },
                headers={"User-Agent": self.NOMINATIM_USER_AGENT},
                timeout=10,
            )
            resp.raise_for_status()
            results = resp.json()

            if results:
                lat = float(results[0]["lat"])
                lng = float(results[0]["lon"])
                return (lat, lng)
        except Exception as e:
            print(f"    [!] Geocoding error for '{address}': {e}")

        return None

    def _geocode_agenda_items(self, meeting_id, items_data, dry_run=False):
        """Geocode agenda items that have related_address but no geo data.
        Updates the geo column via raw SQL (PostGIS geography)."""
        geocoded_count = 0
        geocode_cache = {}

        for item in items_data:
            addresses = item.get("related_address", [])
            if not addresses or not isinstance(addresses, list):
                continue

            item_id = item.get("_db_id")
            if not item_id:
                continue

            # Only geocode items that don't already have geo data
            try:
                existing = (
                    self.supabase.table("agenda_items")
                    .select("geo")
                    .eq("id", item_id)
                    .single()
                    .execute()
                )
                if existing.data and existing.data.get("geo"):
                    continue
            except Exception:
                continue

            # Try to geocode the first valid address
            for addr in addresses:
                if not addr or not addr.strip():
                    continue
                addr = addr.strip()
                if addr.lower().startswith(self.NON_ADDRESS_PREFIXES):
                    continue

                if addr in geocode_cache:
                    result = geocode_cache[addr]
                else:
                    result = self.geocode_address(addr)
                    geocode_cache[addr] = result
                    # Nominatim rate limit: 1 request per second
                    time.sleep(1.1)

                if result and not dry_run:
                    lat, lng = result
                    try:
                        self.supabase.table("agenda_items").update(
                            {"geo": f"SRID=4326;POINT({lng} {lat})"}
                        ).eq("id", item_id).execute()
                        geocoded_count += 1
                        print(f"    [Geo] {addr} -> ({lat:.6f}, {lng:.6f})")
                    except Exception as e:
                        print(f"    [!] Failed to update geo for item {item_id}: {e}")
                    break  # Only need one successful geocode per item

        if geocoded_count > 0:
            print(f"  [+] Geocoded {geocoded_count} agenda items")

        return geocoded_count

    def _normalize_archive_path(self, folder_path):
        """Normalize archive path to always be relative (viewroyal_archive/... or archive/slug/...)."""
        # Convert to absolute first for consistent handling
        abs_path = os.path.abspath(folder_path)

        # Try municipality archive path first (archive/slug/...)
        archive_marker = "/archive/"
        if archive_marker in abs_path:
            idx = abs_path.find(archive_marker) + 1  # Skip leading /
            return abs_path[idx:]  # Returns "archive/slug/..."

        # Legacy: viewroyal_archive/...
        marker = "viewroyal_archive"
        if marker in abs_path:
            idx = abs_path.find(marker)
            return abs_path[idx:]  # Returns "viewroyal_archive/..."

        # Fallback: return as-is if marker not found
        return folder_path

    def _classify_document(self, filename):
        """Classify a document by filename keywords."""
        lower = filename.lower()
        if "addend" in lower:
            return "Addendum"
        if "late" in lower and "item" in lower:
            return "Late Items"
        if "supplementa" in lower or "supplement" in lower:
            return "Supplementary"
        if "report" in lower:
            return "Report"
        if "agenda" in lower:
            return "Agenda"
        if "minute" in lower:
            return "Minutes"
        return "Other"

    def _ingest_documents(self, meeting_id, folder_path, dry_run=False):
        """Ingest PDF documents from Agenda/ and Minutes/ subfolders into the documents table."""
        import fitz  # PyMuPDF

        doc_count = 0

        for subfolder_name in ["Agenda", "Minutes"]:
            subfolder = os.path.join(folder_path, subfolder_name)
            if not os.path.isdir(subfolder):
                continue

            pdf_files = sorted(glob.glob(os.path.join(subfolder, "*.pdf")))
            for pdf_path in pdf_files:
                filename = os.path.basename(pdf_path)
                rel_path = os.path.relpath(pdf_path, folder_path)

                # Extract text (with OCR fallback)
                full_text = parser.get_pdf_text(pdf_path)
                if len(full_text.strip()) < 100:
                    full_text = parser.get_pdf_text_ocr(pdf_path)

                # Page count via PyMuPDF
                try:
                    doc = fitz.open(pdf_path)
                    page_count = len(doc)
                    doc.close()
                except Exception:
                    page_count = None

                # SHA256 hash
                sha256 = hashlib.sha256()
                with open(pdf_path, "rb") as f:
                    for chunk in iter(lambda: f.read(8192), b""):
                        sha256.update(chunk)
                file_hash = sha256.hexdigest()

                # Source URL from companion .url file
                source_url = None
                url_file = f"{pdf_path}.url"
                if os.path.exists(url_file):
                    try:
                        with open(url_file, "r", encoding="utf-8") as f:
                            source_url = f.read().strip() or None
                    except Exception:
                        pass

                # Classify
                category = self._classify_document(filename)

                # Title from filename (strip extension)
                title = os.path.splitext(filename)[0]

                doc_data = {
                    "meeting_id": meeting_id,
                    "title": title,
                    "category": category,
                    "source_url": source_url,
                    "file_path": rel_path,
                    "file_hash": file_hash,
                    "full_text": full_text.strip() if full_text else None,
                    "page_count": page_count,
                    "municipality_id": self.municipality_id,
                }

                if dry_run:
                    print(f"  [Dry Run] Document: {rel_path} ({category}, {page_count} pages)")
                else:
                    try:
                        self.supabase.table("documents").upsert(
                            doc_data, on_conflict="meeting_id,file_path"
                        ).execute()
                        doc_count += 1
                    except Exception as e:
                        print(f"  [!] Error ingesting document {rel_path}: {e}")

        if doc_count > 0:
            print(f"  [+] Ingested {doc_count} documents")

        return doc_count

    def process_meeting(
        self,
        folder_path,
        dry_run=False,
        precomputed_refinement=None,
        force_update=False,
        force_refine=False,
        ai_provider="gemini",
    ):
        # Normalize path to prevent duplicates from absolute vs relative paths
        normalized_path = self._normalize_archive_path(folder_path)
        print(
            f"Processing: {normalized_path} (Dry Run: {dry_run}, Provider: {ai_provider})"
        )

        # 0. Check if already exists (use normalized path for DB lookup)
        if not dry_run and not force_update and not precomputed_refinement:
            res = (
                self.supabase.table("meetings")
                .select("id")
                .eq("archive_path", normalized_path)
                .execute()
            )
            if res.data:
                print("  [->] Meeting already ingested. Skipping.")
                return None

        meta = parser.extract_meeting_metadata(
            folder_path
        )  # Use original path for file access
        if not meta:
            print("  Skipping: Could not parse date/type.")
            return None

        # 1. Organization & Meeting Upsert
        # Initial guess from filename metadata
        m_type_guess = utils.infer_meeting_type(meta["meeting_type"] or meta["title"])
        org_name, classification = self.map_type_to_org(m_type_guess or "Council")

        org_id = self.get_or_create_organization(org_name, classification, dry_run)

        meeting_data = {
            "title": meta["title"],
            "meeting_date": meta["meeting_date"],
            "organization_id": org_id,
            "archive_path": normalized_path,  # Always store normalized path
            "type": m_type_guess,
            "municipality_id": self.municipality_id,
        }

        # Look for agenda_url from companion .url file
        agenda_folder = os.path.join(folder_path, "Agenda")
        pdf_files = glob.glob(os.path.join(agenda_folder, "*.pdf"))
        if pdf_files:
            # Assuming there's only one PDF agenda per folder
            agenda_pdf_path = pdf_files[0]
            agenda_url_file = f"{agenda_pdf_path}.url"
            if os.path.exists(agenda_url_file):
                try:
                    with open(agenda_url_file, "r", encoding="utf-8") as f:
                        agenda_civicweb_url = f.read().strip()
                        if agenda_civicweb_url:
                            meeting_data["agenda_url"] = agenda_civicweb_url
                            print(f"  [+] Found agenda_url: {agenda_civicweb_url}")
                except Exception as e:
                    print(f"  [!] Error reading agenda .url file: {e}")
            else:
                print(f"  [i] No .url file found for agenda: {agenda_pdf_path}")
        # Check for pre-scheduled meeting (created by import_meeting_schedule.py)
        # These have matching date+type but no archive_path yet
        scheduled_meeting_id = None
        if not dry_run:
            scheduled_res = (
                self.supabase.table("meetings")
                .select("id, video_url")
                .eq("meeting_date", meta["meeting_date"])
                .eq("type", m_type_guess)
                .is_("archive_path", "null")
                .execute()
            )
            if scheduled_res.data:
                scheduled_meeting_id = scheduled_res.data[0]["id"]
                print(
                    f"  [+] Found pre-scheduled meeting (id={scheduled_meeting_id}), will update it"
                )
                # Check if it already has a video URL
                if scheduled_res.data[0].get("video_url"):
                    meeting_data["video_url"] = scheduled_res.data[0]["video_url"]

        if not dry_run:
            # Only search Vimeo if we don't already have a video URL
            if not meeting_data.get("video_url"):
                existing_meeting = (
                    self.supabase.table("meetings")
                    .select("video_url")
                    .eq("archive_path", normalized_path)
                    .execute()
                )
                if not existing_meeting.data or not existing_meeting.data[0].get(
                    "video_url"
                ):
                    print("  Searching Vimeo for matching video...")
                    v_client = VimeoClient()
                    v_match = v_client.search_video(meta["meeting_date"], meta["title"])
                    if v_match:
                        print(f"  [+] Found Vimeo match: {v_match['url']}")
                        meeting_data["video_url"] = v_match["url"]

        if precomputed_refinement and precomputed_refinement.get("chair_person_name"):
            chair_id = self.get_or_create_person(
                precomputed_refinement["chair_person_name"], dry_run
            )
            meeting_data["chair_person_id"] = chair_id

        meeting_id = 100
        if not dry_run:
            try:
                if scheduled_meeting_id:
                    # Update the pre-scheduled meeting instead of creating new
                    res = (
                        self.supabase.table("meetings")
                        .update(meeting_data)
                        .eq("id", scheduled_meeting_id)
                        .execute()
                    )
                    meeting_id = scheduled_meeting_id
                    print(f"  [+] Updated pre-scheduled meeting id={meeting_id}")
                else:
                    # Normal upsert by archive_path
                    res = (
                        self.supabase.table("meetings")
                        .upsert(meeting_data, on_conflict="archive_path")
                        .execute()
                    )
                    meeting_id = res.data[0]["id"]
            except Exception as e:
                print(f"  Error upserting meeting: {e}")
                return None
        else:
            print(f"  [Dry Run] Meeting Data: {meeting_data}")

        # 1b. Ingest PDF documents into documents table
        self._ingest_documents(meeting_id, folder_path, dry_run)

        # 2. Extract Raw Texts & Refine
        agenda_text, minutes_text, transcript_text = self.get_raw_texts(
            folder_path, skip_cache=force_refine
        )

        # Generate Markdown versions for local reference
        def clean_text(t):
            return t.replace("\u0000", "").replace("\x00", "") if t else t

        # If input looks like raw text (no H1), use the block-generated markdown.
        # If it already looks like our improved markdown (starts with #), use it as-is.
        minutes_md = (
            minutes_text
            if minutes_text.strip().startswith("#")
            else parser.blocks_to_markdown(
                parser.parse_minutes_into_blocks(minutes_text)
            )
        )
        agenda_md = (
            agenda_text
            if agenda_text.strip().startswith("#")
            else parser.blocks_to_markdown(
                parser.parse_minutes_into_blocks(agenda_text)
            )
        )

        # Calculate Ingestion Flags (before saving md files, so we can gate on them)
        has_agenda = len(agenda_text.strip()) > 100
        has_minutes = len(minutes_text.strip()) > 100

        if not dry_run:
            # Save local Markdown versions (keep local copies for reference)
            # Gate on has_minutes/has_agenda (raw text > 100 chars) to avoid creating
            # files from garbage PDF extraction that then get read back as "real" cache
            try:
                saved_files = []
                if has_minutes and minutes_md and len(minutes_md.strip()) > 100:
                    with open(
                        os.path.join(folder_path, "minutes.md"), "w", encoding="utf-8"
                    ) as f:
                        f.write(minutes_md)
                    saved_files.append("minutes.md")

                if has_agenda and agenda_md and len(agenda_md.strip()) > 100:
                    with open(
                        os.path.join(folder_path, "agenda.md"), "w", encoding="utf-8"
                    ) as f:
                        f.write(agenda_md)
                    saved_files.append("agenda.md")

                if saved_files:
                    print(
                        f"  [+] Saved Markdown source files: {', '.join(saved_files)}"
                    )
            except Exception as e:
                print(f"  [!] Warning: Failed to save local source files: {e}")

        # Check for transcript files on disk (in case text load failed or was skipped)
        has_transcript_file = (
            os.path.exists(os.path.join(folder_path, "transcript.json"))
            or os.path.exists(os.path.join(folder_path, "transcript.txt"))
            or os.path.exists(os.path.join(folder_path, "transcript_clean.md"))
            or (
                os.path.exists(os.path.join(folder_path, "Audio"))
                and len(glob.glob(os.path.join(folder_path, "Audio", "*Meeting*.json")))
                > 0
            )
        )
        has_transcript = len(transcript_text.strip()) > 100 or has_transcript_file

        # Determine Status
        from datetime import datetime

        meeting_status = "Planned"
        m_date = datetime.strptime(meta["meeting_date"], "%Y-%m-%d").date()
        if m_date <= datetime.now().date():
            if has_minutes and has_transcript:
                meeting_status = "Completed"
            elif has_transcript:
                meeting_status = "Occurred"  # Transcript available (motions allowed)
            else:
                meeting_status = "Occurred"  # Meeting happened but data is partial

        meeting_data["has_agenda"] = has_agenda
        meeting_data["has_minutes"] = has_minutes
        meeting_data["has_transcript"] = has_transcript
        meeting_data["status"] = meeting_status

        # Flag for preventing hallucinated data on planned meetings
        is_planned_meeting = meeting_status == "Planned"

        # If we have precomputed refinement, inject its main summary into meeting_data
        if precomputed_refinement and precomputed_refinement.get("summary"):
            meeting_data["summary"] = precomputed_refinement["summary"]

        # Initialize attendance modes
        self.local_attendance_modes = {}
        attendees_context = ""
        attendance_path = os.path.join(folder_path, "attendance.json")
        if os.path.exists(attendance_path):
            try:
                with open(attendance_path, "r", encoding="utf-8") as f:
                    att_data = json.load(f)

                lines = []
                for category in ["present", "regrets", "staff"]:
                    if category in att_data:
                        for p in att_data[category]:
                            name = p.get("name")
                            if name:
                                roles = p.get("roles", [])
                                role_str = f" ({', '.join(roles)})" if roles else ""
                                lines.append(
                                    f"{category.capitalize()}: {name}{role_str}"
                                )
                                self.local_attendance_modes[name] = p.get(
                                    "mode", "In Person"
                                )

                attendees_context = "\n".join(lines)
            except Exception as e:
                print(f"  [!] Error loading attendance.json: {e}")

        # 2.5 Final Meeting Update (Flags & Status)
        # We always do this update to ensure has_transcript etc are current
        if not dry_run:
            update_fields = {
                "status": meeting_data.get("status"),
                "has_agenda": meeting_data.get("has_agenda"),
                "has_minutes": meeting_data.get("has_minutes"),
                "has_transcript": meeting_data.get("has_transcript"),
            }
            if meeting_data.get("summary"):
                update_fields["summary"] = meeting_data["summary"]
            if meeting_data.get("chair_person_id"):
                update_fields["chair_person_id"] = meeting_data["chair_person_id"]

            try:
                self.supabase.table("meetings").update(update_fields).eq(
                    "id", meeting_id
                ).execute()
                print(
                    f"  [+] Updated meeting flags in DB (Status: {update_fields['status']}, Transcript: {update_fields['has_transcript']})"
                )
            except Exception as e:
                print(f"  [!] Error updating meeting flags: {e}")

        refined = precomputed_refinement

        if not refined:
            refinement_path = os.path.join(folder_path, "refinement.json")
            if os.path.exists(refinement_path):
                if not force_refine:
                    print(f"  [+] Found local refinement.json at {refinement_path}")
                    try:
                        with open(refinement_path, "r", encoding="utf-8") as f:
                            refined = json.load(f)
                    except Exception as e:
                        print(f"  [!] Error reading local refinement.json: {e}")
                else:
                    print(f"  [i] Ignoring local refinement.json (force_refine=True)")

        # Parse Scratchpad for Speaker Aliases if explicit aliases are missing
        if (
            refined
            and refined.get("scratchpad_speaker_map")
            and not refined.get("speaker_aliases")
        ):
            print("  [i] Parsing speaker aliases from scratchpad...")
            scratchpad = refined["scratchpad_speaker_map"]

            # More flexible regex to find mappings like "Speaker_01: John Doe", "Speaker_01 is John Doe", etc.
            # Looks for Speaker_XX followed by some separator and then a capitalized name
            matches = re.findall(
                r"(Speaker_\d+|Chair)\s*[:\-=is\s>]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)",
                scratchpad,
            )

            aliases = []
            seen_labels = set()
            for label, name in matches:
                if label in seen_labels:
                    continue
                # Clean up name (remove roles like "(Mayor)")
                clean_name = re.sub(r"\s*\(.*?\)", "", name).strip()
                # Remove leading titles that might have been caught
                clean_name = re.sub(
                    r"^(Mayor|Councillor|Cclr|Ccl|Mr|Ms|Mrs|Dr)\s+",
                    "",
                    clean_name,
                    flags=re.IGNORECASE,
                ).strip()

                if clean_name:
                    aliases.append({"label": label, "name": clean_name})
                    seen_labels.add(label)

            if aliases:
                print(
                    f"  [+] Extracted {len(aliases)} aliases from scratchpad: {aliases}"
                )
                refined["speaker_aliases"] = aliases

        # Parse Scratchpad for Timestamps (MM:SS or HH:MM:SS -> Seconds)
        if refined and refined.get("scratchpad_timeline") and refined.get("items"):
            print("  [i] Parsing timeline timestamps from scratchpad...")
            timeline_text = refined["scratchpad_timeline"]

            # Look for patterns like "7.a (1:23:45-1:25:00)" or "7.a Variance (17:59-29:32)"
            # This regex looks for an item-like number, then some text, then (text? TIME-TIME)
            time_matches = re.findall(
                r"(\d+(?:\.[a-z\d]+)*)\.?\s+.*?\(.*?([\d:]+)-([\d:]+)", timeline_text
            )

            timeline_map = {}
            for item_num, start_str, end_str in time_matches:
                start_sec = to_seconds(start_str)
                end_sec = to_seconds(end_str)
                if start_sec is not None:
                    timeline_map[item_num] = (start_sec, end_sec)

            if timeline_map:
                print(
                    f"  [+] Extracted {len(timeline_map)} timestamp ranges from scratchpad."
                )
                for item in refined["items"]:
                    # Try to match "7.a)" or "7.a" to "7.a"
                    clean_order = item.get("item_order", "").strip(".)")
                    if clean_order in timeline_map:
                        s, e = timeline_map[clean_order]
                        # Only override if the current value looks like a "hallucinated float"
                        # (e.g. 1.058 for 1:05:46) or if it's missing.
                        # Rule: If the difference is huge, trust the scratchpad.
                        item["discussion_start_time"] = s
                        if e:
                            item["discussion_end_time"] = e

        if not refined and (has_minutes or has_agenda):
            print(f"  Running AI Refinement ({ai_provider})...")
            canonical_str = ", ".join(self._get_canonical_names())

            # Extract fingerprint aliases from transcript (if diarizer matched known speakers)
            fingerprint_aliases = []
            source_folder_for_fp = folder_path
            shared_path_fp = os.path.join(folder_path, "shared_media.json")
            if os.path.exists(shared_path_fp):
                try:
                    with open(shared_path_fp, "r", encoding="utf-8") as f:
                        shared_data_fp = json.load(f)
                        source_folder_for_fp = os.path.abspath(
                            os.path.join(
                                folder_path, shared_data_fp["canonical_folder"]
                            )
                        )
                except:
                    pass
            transcript_path_for_fp = self.find_transcript(source_folder_for_fp)
            if transcript_path_for_fp:
                fingerprint_aliases = parser.extract_fingerprint_aliases(
                    transcript_path_for_fp
                )
                if fingerprint_aliases:
                    print(
                        f"  [Fingerprints] Found {len(fingerprint_aliases)} pre-identified speakers from voice matching."
                    )

            # Fetch active council members for AI validation
            active_council_members = self._get_active_council_members(
                meta["meeting_date"]
            )
            if active_council_members:
                print(
                    f"  [Context] Active Council Members: {', '.join(active_council_members)}"
                )

            refined_obj = refine_meeting_data(
                agenda_text,
                minutes_text,
                transcript_text,
                attendees_context=attendees_context,
                canonical_names_context=canonical_str,
                provider=ai_provider,
                meeting_date=meta.get("meeting_date"),
                fingerprint_aliases=fingerprint_aliases
                if fingerprint_aliases
                else None,
                active_council_members=active_council_members,
            )
            if refined_obj:
                refined = refined_obj.model_dump()
                print("  [+] AI Refinement Success!")

                # Update meeting type and organization based on AI
                ai_type = refined.get("meeting_type")
                ai_status = refined.get("status")
                ai_summary = refined.get("summary")

                update_fields = {}
                if ai_type:
                    # Map the AI-identified type to a canonical Organization
                    target_org_name, target_org_class = self.map_type_to_org(ai_type)

                    if ai_type == "Advisory Committee":
                        for candidate_org in [
                            "Official Community Plan Review Advisory Committee",
                            "Capital West Accessibility Advisory Committee",
                        ]:
                            if candidate_org.lower() in meeting_data["title"].lower():
                                target_org_name = candidate_org
                                target_org_class = "Advisory Committee"
                                break

                    org_id = self.get_or_create_organization(
                        target_org_name, target_org_class, dry_run
                    )
                    update_fields["organization_id"] = org_id
                    update_fields["type"] = ai_type

                # Only accept AI status if it doesn't downgrade a past meeting.
                # The ingester's date-based status (Occurred/Completed) is authoritative
                # over the AI's content-based guess (which may say "Planned" for
                # agenda-only meetings that already happened).
                status_rank = {"Planned": 0, "Occurred": 1, "Completed": 2}
                if ai_status and status_rank.get(ai_status, 0) >= status_rank.get(meeting_status, 0):
                    update_fields["status"] = ai_status

                if ai_summary:
                    update_fields["summary"] = ai_summary

                if update_fields and not dry_run:
                    self.supabase.table("meetings").update(update_fields).eq(
                        "id", meeting_id
                    ).execute()

                if refined.get("chair_person_name") and not dry_run:
                    chair_id = self.get_or_create_person(
                        refined["chair_person_name"], dry_run
                    )
                    self.supabase.table("meetings").update(
                        {"chair_person_id": chair_id}
                    ).eq("id", meeting_id).execute()
            else:
                print("  [!] AI Refinement Failed. Skipping meeting items.")
                return None
        elif refined and refined.get("summary") and not dry_run:
            # If we already have refinement but it wasn't in the initial meeting_data upsert
            self.supabase.table("meetings").update({"summary": refined["summary"]}).eq(
                "id", meeting_id
            ).execute()
        if not refined:
            print("  [!] No refined data available. Skipping meeting content.")
            return None

        # Parse Scratchpad for Timestamps (MM:SS or HH:MM:SS -> Seconds) - Run on FRESH or CACHED data
        if refined and refined.get("scratchpad_timeline") and refined.get("items"):
            # Only parse if we haven't already populated timestamps (or if we want to overwrite?)
            # Usually the AI puts timestamps in items directly, but scratchpad is a backup.
            # We'll run this if items are missing start times.
            has_times = any(i.get("discussion_start_time") for i in refined["items"])
            if not has_times:
                print("  [i] Parsing timeline timestamps from scratchpad...")
                timeline_text = refined["scratchpad_timeline"]
                time_matches = re.findall(
                    r"(\d+(?:\.[a-z\d]+)*)\.?\s+.*?\(.*?([\d:]+)-([\d:]+)",
                    timeline_text,
                )
                timeline_map = {}
                for item_num, start_str, end_str in time_matches:
                    start_sec = to_seconds(start_str)
                    end_sec = to_seconds(end_str)
                    if start_sec is not None:
                        timeline_map[item_num] = (start_sec, end_sec)

                if timeline_map:
                    print(
                        f"  [+] Extracted {len(timeline_map)} timestamp ranges from scratchpad."
                    )
                    for item in refined["items"]:
                        clean_order = item.get("item_order", "").strip(".)")
                        if clean_order in timeline_map:
                            s, e = timeline_map[clean_order]
                            item["discussion_start_time"] = s
                            if e:
                                item["discussion_end_time"] = e

        # Final Alignment using Transcript Markers (if available) - Run on FRESH or CACHED data
        if refined and refined.get("items") and has_transcript:
            print("  [i] Aligning items with transcript markers...")
            # We need the segments in a list of dicts for the aligner
            try:
                source_folder_for_align = folder_path
                shared_path_align = os.path.join(folder_path, "shared_media.json")
                if os.path.exists(shared_path_align):
                    try:
                        with open(shared_path_align, "r", encoding="utf-8") as f:
                            shared_data_align = json.load(f)
                            source_folder_for_align = os.path.abspath(
                                os.path.join(
                                    folder_path, shared_data_align["canonical_folder"]
                                )
                            )
                    except:
                        pass

                transcript_path_align = self.find_transcript(source_folder_for_align)
                if transcript_path_align:
                    segments_for_align = parser.extract_transcript_segments(
                        transcript_path_align
                    )
                    if segments_for_align:
                        # Map internal 'start_time' to 'start' for aligner
                        for sa in segments_for_align:
                            sa["start"] = sa["start_time"]
                            sa["end"] = sa["end_time"]

                        refined["items"] = align_meeting_items(
                            refined["items"], segments_for_align
                        )
                        print(
                            f"  [+] Successfully aligned {len(refined['items'])} items."
                        )
            except Exception as e:
                print(f"  [!] Alignment failed: {e}")

        refinement_path = os.path.join(folder_path, "refinement.json")
        if not dry_run and refined:
            # Save if it doesn't exist yet, OR if we just got it from an AI call (not from local disk)
            if not os.path.exists(refinement_path) or not precomputed_refinement:
                try:
                    with open(refinement_path, "w", encoding="utf-8") as f:
                        json.dump(refined, f, indent=2)
                    print(f"  [+] Saved refinement to {refinement_path}")
                except Exception as e:
                    print(f"  [!] Error saving refinement.json: {e}")

        # 3. Attendance (skip for planned meetings to prevent hallucinations)
        if refined.get("attendees") and not is_planned_meeting:
            print(f"  Found {len(refined['attendees'])} attendees.")
            for name in refined["attendees"]:
                person_id = self.get_or_create_person(name, dry_run)
                if person_id and not dry_run:
                    mode = self.local_attendance_modes.get(name, "In Person")
                    att_data = {
                        "meeting_id": meeting_id,
                        "person_id": person_id,
                        "attendance_mode": mode,
                    }
                    self.supabase.table("attendance").upsert(
                        att_data, on_conflict="meeting_id,person_id"
                    ).execute()

        # 4. Speaker Aliases (skip for planned meetings)
        if refined.get("speaker_aliases") and not is_planned_meeting:
            print(f"  Found {len(refined['speaker_aliases'])} speaker aliases.")
            for alias in refined["speaker_aliases"]:
                person_id = self.get_or_create_person(alias["name"], dry_run)
                if person_id and not dry_run:
                    alias_data = {
                        "meeting_id": meeting_id,
                        "speaker_label": alias["label"],
                        "person_id": person_id,
                    }
                    self.supabase.table("meeting_speaker_aliases").upsert(
                        alias_data, on_conflict="meeting_id,speaker_label"
                    ).execute()

        # 5. Transcript
        source_folder = folder_path
        shared_path = os.path.join(folder_path, "shared_media.json")
        if os.path.exists(shared_path):
            try:
                with open(shared_path, "r", encoding="utf-8") as f:
                    shared_data = json.load(f)
                    source_folder = os.path.abspath(
                        os.path.join(folder_path, shared_data["canonical_folder"])
                    )
            except:
                pass

        transcript_path = self.find_transcript(source_folder)
        is_shared = os.path.exists(shared_path)

        if transcript_path and os.path.exists(transcript_path):
            segments = parser.extract_transcript_segments(transcript_path)

            # Extract and save speaker centroids (voice fingerprints) to meeting meta
            speaker_centroids = parser.extract_speaker_centroids(transcript_path)
            speaker_samples = parser.extract_speaker_samples(transcript_path)
            if speaker_centroids and not dry_run:
                try:
                    # Get existing meta
                    existing = (
                        self.supabase.table("meetings")
                        .select("meta")
                        .eq("id", meeting_id)
                        .single()
                        .execute()
                    )
                    current_meta = (
                        existing.data.get("meta") or {} if existing.data else {}
                    )

                    # Update meta with centroids, samples, and fingerprint matches
                    current_meta["speaker_centroids"] = speaker_centroids
                    if speaker_samples:
                        current_meta["speaker_samples"] = speaker_samples

                    # Persist speaker mapping and fingerprint matches from diarizer
                    fingerprint_aliases = parser.extract_fingerprint_aliases(transcript_path)
                    if fingerprint_aliases:
                        speaker_mapping = {
                            a["label"]: a["name"]
                            for a in fingerprint_aliases if a.get("label") and a.get("name")
                        }
                        fingerprint_matches = {
                            a["label"]: {
                                "person_id": a.get("person_id"),
                                "person_name": a.get("name"),
                                "similarity": a.get("confidence"),
                            }
                            for a in fingerprint_aliases if a.get("label")
                        }
                        current_meta["speaker_mapping"] = speaker_mapping
                        current_meta["fingerprint_matches"] = fingerprint_matches

                    self.supabase.table("meetings").update({"meta": current_meta}).eq(
                        "id", meeting_id
                    ).execute()
                    print(
                        f"  [Fingerprints] Saved {len(speaker_centroids)} speaker centroids to meeting meta."
                    )
                except Exception as e:
                    print(f"  [!] Failed to save speaker centroids: {e}")

            if segments:
                m_start = 0
                m_end = 999999
                if is_shared and refined.get("items"):
                    starts = [
                        i.get("discussion_start_time")
                        for i in refined["items"]
                        if i.get("discussion_start_time") is not None
                    ]
                    ends = [
                        i.get("discussion_end_time")
                        for i in refined["items"]
                        if i.get("discussion_end_time") is not None
                    ]
                    if starts:
                        m_start = min(starts) - 10
                    if ends:
                        m_end = max(ends) + 10
                    print(
                        f"  [Shared Media] Filtering segments to meeting range {m_start}s - {m_end}s."
                    )
                else:
                    print(f"  Found {len(segments)} transcript segments.")

                if not dry_run:
                    # Only delete and re-insert segments if we are forcing a full update
                    if force_update:
                        print(
                            "  [!] force_update=True: Deleting unverified segments for re-insertion."
                        )
                        self.supabase.table("transcript_segments").delete().eq(
                            "meeting_id", meeting_id
                        ).eq("is_verified", False).execute()
                    else:
                        print(
                            "  [i] Skipping segment deletion/insertion (use --update to force)."
                        )
                        pass

                # 5a. Build Alias Map for this meeting
                alias_map = {}
                # Start with aliases from the refined data (just upserted in step 4)
                if refined.get("speaker_aliases"):
                    for alias in refined["speaker_aliases"]:
                        p_id = self.get_or_create_person(alias["name"], dry_run)
                        if p_id:
                            alias_map[alias["label"]] = {
                                "person_id": p_id,
                                "name": alias["name"],
                            }

                # Supplement with any existing aliases in the DB not in the current refinement
                if not dry_run:
                    db_aliases = (
                        self.supabase.table("meeting_speaker_aliases")
                        .select("speaker_label, person_id, people(name)")
                        .eq("meeting_id", meeting_id)
                        .execute()
                        .data
                    )
                    for a in db_aliases:
                        if a["speaker_label"] not in alias_map:
                            alias_map[a["speaker_label"]] = {
                                "person_id": a["person_id"],
                                "name": a["people"]["name"]
                                if a.get("people")
                                else a["speaker_label"],
                            }

                rows = []
                # Only prepare rows if we are going to insert them
                if force_update or dry_run:
                    for seg in segments:
                        if is_shared:
                            if seg["start_time"] < m_start or seg["start_time"] > m_end:
                                continue

                        label = seg["speaker"]
                        p_id = None
                        s_name = label

                        if label in alias_map:
                            p_id = alias_map[label]["person_id"]
                            s_name = alias_map[label]["name"]

                        rows.append(
                            {
                                "meeting_id": meeting_id,
                                "speaker_name": s_name,
                                "person_id": p_id,
                                "start_time": seg["start_time"],
                                "end_time": seg["end_time"],
                                "text_content": seg["text"],
                                "attribution_source": "AI_DIARIZATION",
                            }
                        )

                    # Apply AI Corrections
                    corrections = refined.get("transcript_corrections", [])
                    if corrections:
                        print(
                            f"  Applying {len(corrections)} transcript corrections..."
                        )
                        for row in rows:
                            current_text = row["text_content"]
                            for corr in corrections:
                                orig = corr.get("original_text")
                                fix = corr.get("corrected_text")
                                if orig and fix and orig in current_text:
                                    current_text = current_text.replace(orig, fix)
                            row["text_content"] = current_text

                    # Consolidate consecutive same-speaker segments
                    if len(rows) > 1:
                        consolidated = [rows[0]]
                        for row in rows[1:]:
                            prev = consolidated[-1]
                            if (
                                row["speaker_name"] == prev["speaker_name"]
                                and row["person_id"] == prev["person_id"]
                            ):
                                prev["text_content"] = prev["text_content"] + " " + row["text_content"]
                                prev["end_time"] = row["end_time"]
                            else:
                                consolidated.append(row)
                        if len(consolidated) < len(rows):
                            print(
                                f"  Consolidated {len(rows)} segments → {len(consolidated)} "
                                f"({len(rows) - len(consolidated)} merged)"
                            )
                            rows = consolidated

                    batch_size = 100  # Smaller batches to avoid statement timeout
                    if not dry_run and rows:
                        total_batches = (len(rows) + batch_size - 1) // batch_size
                        for i in range(0, len(rows), batch_size):
                            batch = rows[i : i + batch_size]
                            batch_num = i // batch_size + 1
                            self.supabase.table("transcript_segments").insert(
                                batch
                            ).execute()
                            if total_batches > 5:
                                print(f"    Inserted batch {batch_num}/{total_batches}")

        # 6. Items, Motions, Votes
        # SAFEGUARD: Don't process motions/votes for Planned meetings (prevent hallucinations)
        if is_planned_meeting:
            print(
                "  [!] Planned meeting - skipping motions/votes to prevent hallucinations"
            )

        if refined.get("items"):
            print(f"  Found {len(refined['items'])} agenda items.")
            if not dry_run:
                # Delete in order to avoid cascade timeout: votes -> motions -> agenda_items
                existing_items = (
                    self.supabase.table("agenda_items")
                    .select("id")
                    .eq("meeting_id", meeting_id)
                    .execute()
                )

                if existing_items.data:
                    item_ids = [i["id"] for i in existing_items.data]

                    # Delete key_statements for these items
                    for iid in item_ids:
                        self.supabase.table("key_statements").delete().eq(
                            "agenda_item_id", iid
                        ).execute()

                    # Get all motions for these items
                    existing_motions = (
                        self.supabase.table("motions")
                        .select("id")
                        .in_("agenda_item_id", item_ids)
                        .execute()
                    )

                    if existing_motions.data:
                        motion_ids = [m["id"] for m in existing_motions.data]

                        # Delete votes first (in batches)
                        for mid in motion_ids:
                            self.supabase.table("votes").delete().eq(
                                "motion_id", mid
                            ).execute()

                        # Delete motions
                        for mid in motion_ids:
                            self.supabase.table("motions").delete().eq(
                                "id", mid
                            ).execute()

                    # Finally delete agenda items
                    for iid in item_ids:
                        self.supabase.table("agenda_items").delete().eq(
                            "id", iid
                        ).execute()

        for item in refined["items"]:
            # Matter Linking Strategy:
            # 1. AI extracted identifier (e.g. "Bylaw 45")
            # 2. Regex from title
            matter_identifier = item.get("matter_identifier")
            if not matter_identifier:
                matter_identifier = self.extract_identifier_from_text(item.get("title"))

            matter_title = item.get("matter_title") or item.get("title")
            related_address = self.normalize_address_list(item.get("related_address"))

            matter_id = self.get_or_create_matter(
                matter_identifier,
                matter_title,
                meta["meeting_date"],
                dry_run,
                related_addresses=related_address,
            )

            tags = self.normalize_address_list(item.get("tags"))

            item_data = {
                "meeting_id": meeting_id,
                "matter_id": matter_id,
                "item_order": item.get("item_order"),
                "title": item.get("title"),
                "description": item.get("description"),
                "category": item.get("category"),
                "plain_english_summary": item.get("plain_english_summary"),
                "related_address": related_address,
                "debate_summary": item.get("debate_summary"),
                "is_controversial": item.get("is_controversial"),
                "discussion_start_time": to_seconds(item.get("discussion_start_time")),
                "discussion_end_time": to_seconds(item.get("discussion_end_time")),
                "financial_cost": item.get("financial_cost"),
                "funding_source": item.get("funding_source"),
                "keywords": tags,
                "meta": {"key_quotes": item.get("key_quotes")},
            }

            agenda_item_id = 200  # Placeholder for dry run
            if not dry_run:
                res = self.supabase.table("agenda_items").insert(item_data).execute()
                agenda_item_id = res.data[0]["id"]
                # Track for geocoding pass
                item["_db_id"] = agenda_item_id

            # Key Statements
            for ks in item.get("key_statements", []):
                speaker_name = ks.get("speaker")
                person_id = (
                    self.get_or_create_person(speaker_name, dry_run)
                    if speaker_name
                    else None
                )
                ks_data = {
                    "meeting_id": meeting_id,
                    "agenda_item_id": agenda_item_id,
                    "speaker_name": speaker_name,
                    "person_id": person_id,
                    "statement_type": ks.get("statement_type"),
                    "statement_text": ks.get("statement_text"),
                    "context": ks.get("context"),
                    "start_time": to_seconds(ks.get("timestamp")),
                    "municipality_id": self.municipality_id,
                }
                if not dry_run:
                    self.supabase.table("key_statements").insert(ks_data).execute()

            # Validation for Motion Timestamps
            item_start = item_data.get("discussion_start_time")

            # Skip motions for planned meetings
            if is_planned_meeting:
                continue

            for mot in item.get("motions", []):
                raw_ts = to_seconds(mot.get("timestamp"))

                # Logic: If motion timestamp looks like a "hallucinated float" (e.g. 1.05)
                # while the item starts much later (e.g. 3600s), it's better to have NO timestamp
                # than a wrong one at the beginning of the meeting.
                final_ts = raw_ts
                if (
                    item_start
                    and item_start > 100
                    and raw_ts is not None
                    and raw_ts < 100
                ):
                    # print(f"  [!] Dropping suspicious motion timestamp: {raw_ts} (Item starts at {item_start})")
                    final_ts = None

                mover_name = mot.get("mover")
                seconder_name = mot.get("seconder")

                mover_id = (
                    self.get_or_create_person(mover_name, dry_run)
                    if mover_name
                    else None
                )
                seconder_id = (
                    self.get_or_create_person(seconder_name, dry_run)
                    if seconder_name
                    else None
                )

                motion_data = {
                    "meeting_id": meeting_id,
                    "agenda_item_id": agenda_item_id,
                    "mover": mover_name,
                    "seconder": seconder_name,
                    "mover_id": mover_id,
                    "seconder_id": seconder_id,
                    "text_content": mot.get("motion_text"),
                    "plain_english_summary": mot.get("plain_english_summary"),
                    "disposition": mot.get("disposition"),
                    "result": mot.get("result"),
                    "time_offset_seconds": final_ts,
                    "financial_cost": mot.get("financial_cost"),
                    "funding_source": mot.get("funding_source"),
                }

                motion_id = 300
                if not dry_run:
                    m_res = self.supabase.table("motions").insert(motion_data).execute()
                    motion_id = m_res.data[0]["id"]

                    vote_records = mot.get("votes", [])
                    voting_attendees = [
                        a
                        for a in refined.get("attendees", [])
                        if "Mayor" in a or "Councillor" in a or "Councilor" in a
                    ]

                    if mot.get("result") == "CARRIED":
                        recorded_voters = {v["person_name"] for v in vote_records}
                        for attendee in voting_attendees:
                            if attendee not in recorded_voters:
                                vote_records.append(
                                    {
                                        "person_name": attendee,
                                        "vote": "Yes",
                                        "reason": None,
                                    }
                                )

                    for v in vote_records:
                        v_person_id = self.get_or_create_person(
                            v["person_name"], dry_run
                        )
                        if v_person_id and not dry_run:
                            vote_data = {
                                "motion_id": motion_id,
                                "person_id": v_person_id,
                                "vote": v["vote"],
                                "recusal_reason": v.get("reason"),
                            }
                            self.supabase.table("votes").insert(vote_data).execute()

        # 7. Geocode agenda items with related_address but no geo data
        if refined.get("items") and not dry_run:
            self._geocode_agenda_items(meeting_id, refined["items"], dry_run)

        return {
            "meeting": meeting_data,
            "attendance": refined.get("attendees", []) if refined else [],
            "items": refined.get("items", []) if refined else [],
        }

    def process_legistar_meeting(self, scraped_meeting, target_dir, force_update=False):
        """Fast-path ingestion for Legistar meetings using structured API data.

        Skips AI refinement since Legistar provides structured meeting data directly.
        """
        from pipeline.scrapers.base import ScrapedMeeting

        meeting_date = str(scraped_meeting.date)
        title = scraped_meeting.title
        source_id = scraped_meeting.source_id

        # Check if already ingested (by source_id in meta)
        if not force_update and source_id:
            res = (
                self.supabase.table("meetings")
                .select("id")
                .eq("municipality_id", self.municipality_id)
                .contains("meta", {"legistar_event_id": source_id})
                .execute()
            )
            if res.data:
                print(f"  [->] Legistar meeting {source_id} already ingested. Skipping.")
                return None

        print(f"  [Legistar] Ingesting: {meeting_date} - {title}")

        # Organization
        meeting_type = scraped_meeting.meeting_type or "Council"
        org_name, classification = self.map_type_to_org(meeting_type)
        org_id = self.get_or_create_organization(org_name, classification)

        # Meeting upsert
        meeting_data = {
            "title": title,
            "meeting_date": meeting_date,
            "organization_id": org_id,
            "type": utils.infer_meeting_type(meeting_type),
            "municipality_id": self.municipality_id,
            "agenda_url": scraped_meeting.agenda_url,
            "minutes_url": scraped_meeting.minutes_url,
            "video_url": scraped_meeting.video_url,
            "has_agenda": bool(scraped_meeting.agenda_url),
            "has_minutes": bool(scraped_meeting.minutes_url),
            "meta": {"legistar_event_id": source_id} if source_id else {},
        }

        res = (
            self.supabase.table("meetings")
            .upsert(meeting_data, on_conflict="municipality_id,meeting_date,type")
            .execute()
        )

        if not res.data:
            print(f"  [!] Failed to upsert Legistar meeting: {title}")
            return None

        meeting_id = res.data[0]["id"]
        print(f"  [+] Meeting ID: {meeting_id}")

        # Process agenda items from Legistar meta (if available)
        legistar_event = scraped_meeting.meta.get("legistar_event", {})
        event_items = legistar_event.get("EventItems") if legistar_event else None

        if event_items:
            for i, item in enumerate(event_items):
                item_title = item.get("EventItemTitle", "")
                if not item_title:
                    continue

                item_data = {
                    "meeting_id": meeting_id,
                    "title": item_title,
                    "item_order": str(i + 1),
                    "category": "Substantive",
                }

                # Try to link a matter
                matter_identifier = item.get("EventItemMatterFile")
                if matter_identifier:
                    matter_id = self.get_or_create_matter(
                        matter_identifier,
                        item_title,
                        date=meeting_date,
                    )
                    if matter_id:
                        item_data["matter_id"] = matter_id

                self.supabase.table("agenda_items").insert(item_data).execute()

        return {"meeting": meeting_data, "meeting_id": meeting_id}
