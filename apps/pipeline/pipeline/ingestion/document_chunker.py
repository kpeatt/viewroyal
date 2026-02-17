"""
Document chunker: splits PDF documents into searchable, embeddable sections.

Uses PyMuPDF dict-mode font analysis to detect headings and split documents
at heading boundaries. Falls back to fixed-size paragraph-boundary chunking
for headingless or scanned PDFs.

Integrated into the pipeline via ingester.py _ingest_document_sections().
"""

import logging
import re
from collections import Counter

import fitz  # PyMuPDF

import pipeline.parser as parser

logger = logging.getLogger(__name__)

MAX_SECTION_CHARS = 8000  # Match embed.py MAX_EMBED_CHARS
MIN_SECTION_CHARS = 150  # Skip trivially small sections

# Noise headings: motion results and procedural markers that should never be sections
NOISE_HEADINGS = {
    "CARRIED", "DEFEATED", "TABLED", "OPPOSED", "WITHDRAWN",
    "OR",
    "REVIEWED BY: INITIALS", "REVIEWED BY:",
    "(CONTINUED FROM PREVIOUS PAGE)", "(CONT'D)",
    "COMMENTS",
}

# Sub-headings: internal structure within staff reports, folded into parent section
SUB_HEADINGS = {
    "BACKGROUND:", "BACKGROUND",
    "PURPOSE:", "PURPOSE",
    "RECOMMENDATION:", "RECOMMENDATIONS:",
    "ANALYSIS:", "ANALYSIS",
    "ATTACHMENTS:", "ATTACHMENT:",
    "ALIGNMENT:", "ALIGNMENT",
    "PUBLIC PARTICIPATION GOAL:", "PUBLIC PARTICIPATION GOAL",
    "OPTIONS:", "OPTIONS",
    "FINANCIAL IMPLICATIONS:", "FINANCIAL IMPLICATIONS",
    "POLICY IMPLICATIONS:", "POLICY IMPLICATIONS",
    "DISCUSSION:", "DISCUSSION",
}

# Maximum times a heading can repeat before it's treated as a repeating table header
REPEAT_HEADING_THRESHOLD = 5


def chunk_document(pdf_path: str, doc_title: str) -> list[dict]:
    """
    Chunk a PDF into sections based on heading detection.

    Returns list of dicts with keys:
        section_title, section_text, section_order, page_start, page_end, token_count
    """
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        logger.warning("Failed to open PDF %s: %s", pdf_path, e)
        return []

    # Phase 1: Detect body font via frequency analysis
    body_size = _detect_body_font_size(doc)

    if body_size is None:
        # No text blocks found (scanned PDF) — fall back to fixed-size chunks
        doc.close()
        return _fixed_size_fallback(pdf_path, doc_title)

    # Phase 2: Walk pages, split at headings
    sections = _split_at_headings(doc, body_size)
    doc.close()

    if not sections:
        return _fixed_size_fallback(pdf_path, doc_title)

    # Phase 2b: Merge repeating table-row headings
    sections = _merge_repeating_headings(sections)

    # Phase 3: Enforce size cap and filter small/empty sections
    final_sections = []
    for section in sections:
        text = section["section_text"]
        title = section.get("section_title") or ""

        # Drop heading-only sections (text is just the heading with no body)
        text_stripped = text.strip()
        if title and text_stripped == title.strip():
            continue

        text_len = len(text)
        if text_len > MAX_SECTION_CHARS:
            parts = _split_oversized_section(section, MAX_SECTION_CHARS)
            final_sections.extend(parts)
        elif text_len >= MIN_SECTION_CHARS:
            final_sections.append(section)

    # Re-number section_order sequentially from 1
    for i, s in enumerate(final_sections):
        s["section_order"] = i + 1

    # Compute token_count (rough estimate: words * 1.3)
    for s in final_sections:
        s["token_count"] = int(len(s["section_text"].split()) * 1.3)

    return final_sections


def _detect_body_font_size(doc) -> float | None:
    """
    Analyze font sizes across all pages using PyMuPDF dict mode.
    Body font = most frequent by character count.
    Returns its size, or None if no text blocks found.
    """
    font_counts = Counter()  # font_id -> char count

    for page in doc:
        blocks = page.get_text("dict")["blocks"]
        for block in blocks:
            if block["type"] != 0:  # Skip image blocks
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    text = span["text"].strip()
                    if not text:
                        continue
                    size = round(span["size"] * 2) / 2  # Round to nearest 0.5
                    font_id = f"{span['font']}_{size}"
                    font_counts[font_id] += len(text)

    if not font_counts:
        return None

    body_font_id = font_counts.most_common(1)[0][0]
    body_size = float(body_font_id.split("_")[-1])
    return body_size


def _split_at_headings(doc, body_size: float) -> list[dict]:
    """
    Walk pages sequentially. Split at heading boundaries based on font size.

    A span is considered a heading if:
    - font size > body_size * 1.2, OR
    - bold AND (all-caps with len>3 OR size >= body_size)

    Consecutive heading-sized spans on same/adjacent lines are merged into one title.
    """
    sections = []
    current_title = None
    current_text_parts = []
    current_page_start = None
    current_page_end = None

    # Accumulator for merging consecutive heading spans
    heading_buffer = []
    heading_buffer_y = None  # y-position of last heading span

    def _finalize_heading_buffer():
        """Merge buffered heading spans into a single title string."""
        if heading_buffer:
            return " ".join(heading_buffer).strip()
        return None

    def _flush_section():
        """Save current section if it has content."""
        nonlocal current_title, current_text_parts, current_page_start, current_page_end
        if current_text_parts:
            text = "\n".join(current_text_parts).strip()
            if text:
                sections.append({
                    "section_title": current_title,
                    "section_text": text,
                    "section_order": len(sections) + 1,
                    "page_start": current_page_start,
                    "page_end": current_page_end,
                    "token_count": 0,  # Computed later
                })
        current_title = None
        current_text_parts = []
        current_page_start = None
        current_page_end = None

    for page_num in range(len(doc)):
        page = doc[page_num]
        blocks = page.get_text("dict")["blocks"]

        for block in blocks:
            if block["type"] != 0:
                continue

            for line in block["lines"]:
                line_y = line["bbox"][1]
                line_texts_heading = []
                line_texts_body = []

                for span in line["spans"]:
                    text = span["text"]
                    if not text.strip():
                        continue

                    size = round(span["size"] * 2) / 2
                    is_bold = bool(span["flags"] & (1 << 4))
                    is_larger = size > body_size * 1.2
                    is_all_caps = text.strip() == text.strip().upper() and len(text.strip()) > 3
                    is_heading = is_larger or (is_bold and (is_all_caps or size >= body_size))

                    # Clean the text
                    clean = parser._clean_extracted_text(text)

                    if is_heading:
                        line_texts_heading.append(clean.strip())
                    else:
                        line_texts_body.append(clean)

                # Process the line
                if line_texts_heading and not line_texts_body:
                    # Entire line is heading text
                    heading_text = " ".join(line_texts_heading)

                    # Check for noise headings — treat as body text
                    heading_upper = heading_text.strip().upper()
                    if heading_upper in NOISE_HEADINGS:
                        # Treat as body text instead of starting a new section
                        if heading_buffer:
                            merged_title = _finalize_heading_buffer()
                            _flush_section()
                            current_title = merged_title
                            current_page_start = page_num + 1
                            heading_buffer = []
                            heading_buffer_y = None
                        current_text_parts.append(heading_text.strip())
                        current_page_end = page_num + 1
                        continue

                    # Check for sub-headings — fold into parent section
                    if heading_upper in SUB_HEADINGS:
                        if heading_buffer:
                            merged_title = _finalize_heading_buffer()
                            _flush_section()
                            current_title = merged_title
                            current_page_start = page_num + 1
                            heading_buffer = []
                            heading_buffer_y = None
                        # Append as bold text within current section
                        current_text_parts.append(f"\n\n**{heading_text.strip()}**\n")
                        current_page_end = page_num + 1
                        continue

                    # Check if this is adjacent to the previous heading (merge)
                    if heading_buffer and heading_buffer_y is not None:
                        if abs(line_y - heading_buffer_y) < 5:
                            # Same line cluster — merge
                            heading_buffer.append(heading_text)
                            heading_buffer_y = line_y
                            continue

                    # New heading detected — flush previous section and heading buffer
                    if heading_buffer:
                        # Finalize previous heading, then flush section
                        merged_title = _finalize_heading_buffer()
                        _flush_section()
                        current_title = merged_title
                        current_page_start = page_num + 1
                        current_page_end = page_num + 1
                        heading_buffer = [heading_text]
                        heading_buffer_y = line_y
                    else:
                        # First heading encountered — flush any pre-heading content
                        _flush_section()
                        heading_buffer = [heading_text]
                        heading_buffer_y = line_y
                        current_page_start = page_num + 1
                        current_page_end = page_num + 1

                else:
                    # Body text (or mixed line — treat as body)
                    if heading_buffer:
                        # Heading buffer needs to be finalized as a new section title
                        merged_title = _finalize_heading_buffer()
                        _flush_section()
                        current_title = merged_title
                        current_page_start = page_num + 1
                        heading_buffer = []
                        heading_buffer_y = None

                    all_line_text = " ".join(line_texts_heading + line_texts_body)
                    clean_line = all_line_text.strip()
                    if clean_line:
                        current_text_parts.append(clean_line)
                        current_page_end = page_num + 1

    # Flush remaining heading buffer and section
    if heading_buffer:
        merged_title = _finalize_heading_buffer()
        _flush_section()
        current_title = merged_title
        heading_buffer = []

    _flush_section()

    return sections


def _merge_repeating_headings(sections: list[dict]) -> list[dict]:
    """
    Merge sections with the same title that appears 5+ times.

    These are typically repeating table headers on multi-page tables
    (e.g., "COUNCIL RESOLUTION FOLLOW UP LIST" appearing on every page).
    Concatenates their text in order, keeps first page_start and last page_end.
    """
    # Count title occurrences
    title_counts = Counter()
    for s in sections:
        t = s.get("section_title") or ""
        if t:
            title_counts[t] += 1

    # Find titles that repeat too many times
    repeating_titles = {t for t, c in title_counts.items() if c >= REPEAT_HEADING_THRESHOLD}

    if not repeating_titles:
        return sections

    logger.info("Merging repeating headings: %s", repeating_titles)

    # Group repeating sections; keep non-repeating in order
    merged = []
    repeat_groups = {}  # title -> accumulated section

    for s in sections:
        t = s.get("section_title") or ""
        if t in repeating_titles:
            if t not in repeat_groups:
                repeat_groups[t] = {
                    "section_title": t,
                    "section_text": s["section_text"],
                    "section_order": s["section_order"],
                    "page_start": s.get("page_start"),
                    "page_end": s.get("page_end"),
                    "token_count": 0,
                    "_placeholder_index": len(merged),
                }
                # Insert placeholder to maintain approximate position
                merged.append(repeat_groups[t])
            else:
                group = repeat_groups[t]
                group["section_text"] += "\n\n" + s["section_text"]
                if s.get("page_end"):
                    group["page_end"] = s["page_end"]
        else:
            merged.append(s)

    return merged


def _fixed_size_fallback(pdf_path: str, doc_title: str) -> list[dict]:
    """
    For headingless/image PDFs: extract text and split at paragraph boundaries.
    Titles each section: "{doc_title} - Section {i} of {total}".
    """
    text = parser.get_pdf_text(pdf_path)
    if len(text.strip()) < MIN_SECTION_CHARS:
        text = parser.get_pdf_text_ocr(pdf_path)

    if not text or len(text.strip()) < MIN_SECTION_CHARS:
        return []

    text = text.strip()
    chunks = _split_text_at_paragraphs(text, MAX_SECTION_CHARS)

    # Filter out tiny chunks
    chunks = [c for c in chunks if len(c.strip()) >= MIN_SECTION_CHARS]

    if not chunks:
        return []

    total = len(chunks)
    sections = []
    for i, chunk in enumerate(chunks):
        sections.append({
            "section_title": f"{doc_title} - Section {i + 1} of {total}",
            "section_text": chunk.strip(),
            "section_order": i + 1,
            "page_start": None,
            "page_end": None,
            "token_count": int(len(chunk.split()) * 1.3),
        })

    return sections


def _split_oversized_section(section: dict, max_chars: int) -> list[dict]:
    """
    Split a section exceeding max_chars at paragraph boundaries.
    If no paragraph boundaries, split at single newlines.
    Labels sub-sections: "{original_title} - Part {i} of {total}".
    """
    text = section["section_text"]
    original_title = section["section_title"] or "Untitled"

    chunks = _split_text_at_paragraphs(text, max_chars)

    # Filter trivially small chunks
    chunks = [c for c in chunks if len(c.strip()) >= MIN_SECTION_CHARS]

    if not chunks:
        return [section]  # Can't split meaningfully, return as-is

    if len(chunks) == 1:
        return [section]  # Didn't actually split

    total = len(chunks)
    parts = []
    for i, chunk in enumerate(chunks):
        parts.append({
            "section_title": f"{original_title} - Part {i + 1} of {total}",
            "section_text": chunk.strip(),
            "section_order": section["section_order"],  # Will be re-numbered later
            "page_start": section["page_start"],
            "page_end": section["page_end"],
            "token_count": int(len(chunk.split()) * 1.3),
        })

    return parts


def _split_text_at_paragraphs(text: str, max_chars: int) -> list[str]:
    """
    Split text into chunks of approximately max_chars at paragraph boundaries.
    Falls back to single newlines if no double-newline paragraphs.
    """
    # Try splitting at double newlines first (paragraph boundaries)
    paragraphs = re.split(r"\n\s*\n", text)

    if len(paragraphs) <= 1:
        # No paragraph boundaries — try single newlines
        paragraphs = text.split("\n")

    chunks = []
    current_chunk = []
    current_len = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        para_len = len(para)

        if current_len + para_len + 1 > max_chars and current_chunk:
            # Current chunk is full — finalize it
            chunks.append("\n\n".join(current_chunk))
            current_chunk = [para]
            current_len = para_len
        else:
            current_chunk.append(para)
            current_len += para_len + 1  # +1 for separator

    # Flush remaining
    if current_chunk:
        chunks.append("\n\n".join(current_chunk))

    return chunks


def _normalize_for_matching(text: str) -> str:
    """Normalize text for fuzzy matching: lowercase, strip punctuation, collapse whitespace."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", " ", text)  # Replace punctuation with spaces
    text = re.sub(r"\s+", " ", text).strip()  # Collapse whitespace
    return text


def _find_longest_common_word_sequence(text_a: str, text_b: str) -> int:
    """
    Find the length of the longest sequence of consecutive words from text_a
    that appears in text_b.

    Returns the character length of the longest matching word sequence.
    """
    words_a = text_a.split()
    words_b_str = " " + text_b + " "  # Pad for word boundary matching

    best_len = 0
    for start in range(len(words_a)):
        for end in range(start + 3, len(words_a) + 1):  # Minimum 3 words
            candidate = " ".join(words_a[start:end])
            if " " + candidate + " " in " " + words_b_str + " ":
                if len(candidate) > best_len:
                    best_len = len(candidate)
            else:
                break  # No point extending if shorter sequence doesn't match

    return best_len


def link_sections_to_agenda_items(
    sections: list[dict], meeting_id: int, supabase
) -> list[dict]:
    """
    For each section, attempt to link to an agenda item in the same meeting.

    Strategy 1 (number matching): Extract leading number pattern from section_title
    (e.g., "8.1" from "8.1 Staff Report"). Match against agenda_item.item_order.

    Strategy 2 (title matching): If no number match, compare section_title against
    agenda_item.title using case-insensitive containment. Requires title length > 10
    chars to avoid false positives.

    Strategy 3 (fuzzy title matching): For unlinked sections, find 3+ consecutive
    words from section_title that match an agenda_item.title (or vice versa).
    Requires 15+ char matching sequence to avoid false positives.

    After linking, a deduplication pass limits over-linked agenda items (>10 sections)
    to only their first 3 matches.

    Sets agenda_item_id on the section dict if a match is found.
    """
    if not sections:
        return sections

    # Fetch agenda items for this meeting
    try:
        result = (
            supabase.table("agenda_items")
            .select("id, item_order, title")
            .eq("meeting_id", meeting_id)
            .execute()
        )
        agenda_items = result.data or []
    except Exception as e:
        logger.warning("Failed to fetch agenda items for meeting %d: %s", meeting_id, e)
        return sections

    if not agenda_items:
        return sections

    # Build lookup maps
    # item_order -> agenda_item_id
    order_map = {}
    for ai in agenda_items:
        if ai.get("item_order"):
            # Normalize: strip trailing dots, lowercase
            normalized = ai["item_order"].strip().rstrip(".")
            order_map[normalized] = ai["id"]

    # Pre-compute normalized agenda item titles for fuzzy matching
    normalized_ai_titles = []
    for ai in agenda_items:
        ai_title = ai.get("title") or ""
        normalized_ai_titles.append(_normalize_for_matching(ai_title))

    # Number pattern: extract leading number like "8.1" from "8.1 Staff Report"
    number_pattern = re.compile(r"^(\d+(?:\.\d+)*)")

    for section in sections:
        title = section.get("section_title") or ""
        if not title:
            continue

        # Strategy 1: Number matching
        num_match = number_pattern.match(title.strip())
        if num_match:
            section_number = num_match.group(1)
            if section_number in order_map:
                section["agenda_item_id"] = order_map[section_number]
                continue

        # Strategy 2: Title containment matching (only for longer titles)
        if len(title) > 10:
            title_lower = title.lower().strip()
            matched = False
            for ai in agenda_items:
                ai_title = (ai.get("title") or "").lower().strip()
                if len(ai_title) > 10 and (
                    title_lower in ai_title or ai_title in title_lower
                ):
                    section["agenda_item_id"] = ai["id"]
                    matched = True
                    break
            if matched:
                continue

        # Strategy 3: Fuzzy title matching (3+ consecutive words, 15+ chars)
        if len(title) > 10:
            norm_section = _normalize_for_matching(title)
            best_match_id = None
            best_match_len = 0

            for i, ai in enumerate(agenda_items):
                norm_ai = normalized_ai_titles[i]
                if not norm_ai or len(norm_ai) < 10:
                    continue

                # Check both directions: section title words in AI title, and vice versa
                match_len = max(
                    _find_longest_common_word_sequence(norm_section, norm_ai),
                    _find_longest_common_word_sequence(norm_ai, norm_section),
                )

                if match_len >= 15 and match_len > best_match_len:
                    best_match_len = match_len
                    best_match_id = ai["id"]

            if best_match_id:
                section["agenda_item_id"] = best_match_id
                continue

        # Strategy 3b: Fuzzy match against start of section TEXT (first 300 chars)
        # Catches cases where section title is generic but text body mentions the agenda item
        section_text = section.get("section_text") or ""
        if len(section_text) > 50:
            norm_text_start = _normalize_for_matching(section_text[:300])
            best_match_id = None
            best_match_len = 0

            for i, ai in enumerate(agenda_items):
                norm_ai = normalized_ai_titles[i]
                if not norm_ai or len(norm_ai) < 15:
                    continue

                match_len = _find_longest_common_word_sequence(norm_ai, norm_text_start)

                if match_len >= 20 and match_len > best_match_len:
                    best_match_len = match_len
                    best_match_id = ai["id"]

            if best_match_id:
                section["agenda_item_id"] = best_match_id

    # Deduplication pass: if an agenda_item_id is linked to >10 sections,
    # it's likely a false positive from a generic parent heading.
    # Keep only the first 3 matches.
    link_counts = Counter()
    for section in sections:
        aid = section.get("agenda_item_id")
        if aid:
            link_counts[aid] += 1

    over_linked = {aid for aid, count in link_counts.items() if count > 10}
    if over_linked:
        logger.info("Deduplicating over-linked agenda items: %s", over_linked)
        seen_counts = Counter()
        for section in sections:
            aid = section.get("agenda_item_id")
            if aid in over_linked:
                seen_counts[aid] += 1
                if seen_counts[aid] > 3:
                    section["agenda_item_id"] = None

    # TODO: Strategy 4 (positional/sequential): For agenda packages, use document
    # structure position (page order) to link staff reports to nearby agenda items.
    # This would use the table of contents page numbers and section positions to
    # infer which agenda item a staff report belongs to. Not implemented in v1.

    return sections
