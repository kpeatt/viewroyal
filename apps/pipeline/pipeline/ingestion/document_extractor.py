"""
Document extraction orchestrator.

Coordinates Gemini boundary detection, Gemini content extraction,
PyMuPDF image extraction, and database insertion for agenda PDFs.

Replaces the old PyMuPDF font-analysis document_chunker.py as the
primary extraction path.
"""

import logging
import re

logger = logging.getLogger(__name__)


def extract_and_store_documents(
    pdf_path: str,
    document_id: int,
    meeting_id: int,
    supabase,
    municipality_id: int = 1,
) -> dict:
    """Extract documents from an agenda PDF and store in the database.

    Orchestrates the full pipeline:
    1. Gemini boundary detection (document boundaries, types, agenda links)
    2. Gemini content extraction (markdown per document)
    3. PyMuPDF image extraction + R2 upload
    4. Section splitting and database insertion

    Falls back to the old PyMuPDF font-analysis chunker if Gemini fails.

    Returns stats dict: {boundaries_found, documents_extracted, sections_created, images_extracted}
    """
    from pipeline.ingestion.gemini_extractor import detect_boundaries, extract_content
    from pipeline.ingestion.image_extractor import extract_images, upload_images_to_r2

    stats = {
        "boundaries_found": 0,
        "documents_extracted": 0,
        "sections_created": 0,
        "images_extracted": 0,
    }

    # Step 1: Detect document boundaries via Gemini
    try:
        boundaries = detect_boundaries(pdf_path)
    except Exception as e:
        logger.error("Gemini boundary detection failed for document %d: %s", document_id, e)
        boundaries = []

    stats["boundaries_found"] = len(boundaries)

    # Fallback: if Gemini fails, use old chunker
    if not boundaries:
        logger.warning(
            "No boundaries detected for document %d — falling back to PyMuPDF chunker",
            document_id,
        )
        return _fallback_to_chunker(pdf_path, document_id, meeting_id, supabase, municipality_id)

    # Step 2: Process each boundary document
    for boundary in boundaries:
        title = boundary.get("title", "Untitled")
        doc_type = boundary.get("type", "other")
        page_start = boundary.get("page_start")
        page_end = boundary.get("page_end")
        summary = boundary.get("summary")
        key_facts = boundary.get("key_facts")
        agenda_item_str = boundary.get("agenda_item")

        # Resolve agenda item
        agenda_item_id = None
        if agenda_item_str:
            agenda_item_id = _resolve_agenda_item(agenda_item_str, meeting_id, supabase)

        # Insert into extracted_documents
        try:
            ed_data = {
                "document_id": document_id,
                "agenda_item_id": agenda_item_id,
                "title": title,
                "document_type": doc_type,
                "page_start": page_start,
                "page_end": page_end,
                "summary": summary,
                "key_facts": key_facts,
                "municipality_id": municipality_id,
            }
            ed_result = supabase.table("extracted_documents").insert(ed_data).execute()
            extracted_doc_id = ed_result.data[0]["id"]
        except Exception as e:
            logger.error("Failed to insert extracted_document '%s': %s", title, e)
            continue

        stats["documents_extracted"] += 1

        # Step 3: Extract markdown content via Gemini
        markdown = ""
        if page_start and page_end:
            try:
                markdown = extract_content(pdf_path, page_start, page_end, title)
            except Exception as e:
                logger.error("Content extraction failed for '%s': %s", title, e)

        # Step 4: Split markdown into sections and insert
        if markdown:
            sections = _split_markdown_into_sections(markdown)
        else:
            # No content extracted — create a single section from summary
            sections = []
            if summary:
                sections = [{
                    "section_title": title,
                    "section_text": summary,
                    "section_order": 1,
                    "token_count": int(len(summary.split()) * 1.3),
                }]

        for section in sections:
            try:
                section_data = {
                    "document_id": document_id,
                    "extracted_document_id": extracted_doc_id,
                    "agenda_item_id": agenda_item_id,
                    "section_title": section["section_title"],
                    "section_text": section["section_text"],
                    "section_order": section["section_order"],
                    "page_start": page_start,
                    "page_end": page_end,
                    "token_count": section["token_count"],
                    "municipality_id": municipality_id,
                }
                supabase.table("document_sections").insert(section_data).execute()
                stats["sections_created"] += 1
            except Exception as e:
                logger.error(
                    "Failed to insert section '%s' for '%s': %s",
                    section.get("section_title", "?"), title, e,
                )

        # Step 5: Extract and upload images
        if page_start and page_end:
            try:
                images = extract_images(pdf_path, page_start, page_end)
            except Exception as e:
                logger.warning("Image extraction failed for '%s': %s", title, e)
                images = []

            if images:
                uploaded = upload_images_to_r2(images, meeting_id, extracted_doc_id)

                # Insert image metadata into document_images
                for img_meta in uploaded:
                    try:
                        img_data = {
                            "extracted_document_id": extracted_doc_id,
                            "r2_key": img_meta["r2_key"],
                            "page": img_meta["page"],
                            "width": img_meta["width"],
                            "height": img_meta["height"],
                            "format": img_meta["format"],
                            "file_size": img_meta["file_size"],
                            "municipality_id": municipality_id,
                        }
                        supabase.table("document_images").insert(img_data).execute()
                        stats["images_extracted"] += 1
                    except Exception as e:
                        logger.warning("Failed to insert image metadata: %s", e)

    logger.info(
        "Document extraction complete for document %d: %d boundaries, %d extracted, "
        "%d sections, %d images",
        document_id, stats["boundaries_found"], stats["documents_extracted"],
        stats["sections_created"], stats["images_extracted"],
    )

    return stats


def _split_markdown_into_sections(
    markdown: str, max_chars: int = 8000
) -> list[dict]:
    """Split Gemini's markdown output into sections at ## heading boundaries.

    If no headings found, uses the entire content as a single section.
    Sections exceeding max_chars get split at paragraph boundaries with
    "Part N of M" suffix on title.

    Returns list of dicts: {section_title, section_text, section_order, token_count}
    """
    if not markdown or not markdown.strip():
        return []

    # Split at ## headings
    # Pattern matches lines starting with ## (but not ### which is a sub-heading)
    parts = re.split(r"(?m)^## ", markdown)

    sections = []

    if len(parts) <= 1:
        # No ## headings found — treat entire content as single section
        text = markdown.strip()
        if text:
            sections_from_text = _enforce_size_limit(
                "Document Content", text, max_chars
            )
            sections.extend(sections_from_text)
    else:
        # First part is content before the first ## (if any)
        preamble = parts[0].strip()
        if preamble:
            sections_from_preamble = _enforce_size_limit(
                "Introduction", preamble, max_chars
            )
            sections.extend(sections_from_preamble)

        # Remaining parts each start with heading text
        for part in parts[1:]:
            lines = part.split("\n", 1)
            heading = lines[0].strip()
            body = lines[1].strip() if len(lines) > 1 else ""

            # Full section text includes heading context
            full_text = f"## {heading}\n\n{body}" if body else f"## {heading}"

            if full_text.strip():
                sections_from_heading = _enforce_size_limit(
                    heading, full_text, max_chars
                )
                sections.extend(sections_from_heading)

    # Assign section_order (1-indexed)
    for i, section in enumerate(sections):
        section["section_order"] = i + 1

    return sections


def _enforce_size_limit(
    title: str, text: str, max_chars: int
) -> list[dict]:
    """Enforce size limit on a section, splitting at paragraph boundaries if needed.

    Returns list of section dicts (usually 1, but multiple if text exceeds max_chars).
    """
    if len(text) <= max_chars:
        return [{
            "section_title": title,
            "section_text": text,
            "section_order": 0,  # Will be reassigned
            "token_count": int(len(text.split()) * 1.3),
        }]

    # Split at paragraph boundaries (double newline)
    paragraphs = re.split(r"\n\s*\n", text)

    chunks = []
    current_chunk = []
    current_len = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        para_len = len(para)

        if current_len + para_len + 2 > max_chars and current_chunk:
            chunks.append("\n\n".join(current_chunk))
            current_chunk = [para]
            current_len = para_len
        else:
            current_chunk.append(para)
            current_len += para_len + 2  # +2 for \n\n separator

    if current_chunk:
        chunks.append("\n\n".join(current_chunk))

    if len(chunks) <= 1:
        # Could not split meaningfully
        return [{
            "section_title": title,
            "section_text": text,
            "section_order": 0,
            "token_count": int(len(text.split()) * 1.3),
        }]

    total = len(chunks)
    return [
        {
            "section_title": f"{title} - Part {i + 1} of {total}",
            "section_text": chunk,
            "section_order": 0,  # Will be reassigned
            "token_count": int(len(chunk.split()) * 1.3),
        }
        for i, chunk in enumerate(chunks)
    ]


def _resolve_agenda_item(
    agenda_item_str: str, meeting_id: int, supabase
) -> int | None:
    """Resolve Gemini's agenda_item string to an agenda_item_id.

    Given a string like "6.1a", "3.a)", "8.1a)", finds the matching
    agenda_item row for this meeting.

    Returns agenda_item_id or None if no match.
    """
    if not agenda_item_str:
        return None

    try:
        result = (
            supabase.table("agenda_items")
            .select("id, item_order")
            .eq("meeting_id", meeting_id)
            .execute()
        )
        agenda_items = result.data or []
    except Exception as e:
        logger.warning("Failed to fetch agenda items for meeting %d: %s", meeting_id, e)
        return None

    if not agenda_items:
        return None

    # Normalize the input string
    normalized_input = _normalize_item_number(agenda_item_str)

    # Try exact match first
    for ai in agenda_items:
        item_order = ai.get("item_order") or ""
        normalized_order = _normalize_item_number(item_order)

        if normalized_input == normalized_order:
            return ai["id"]

    # Try containment match
    for ai in agenda_items:
        item_order = ai.get("item_order") or ""
        normalized_order = _normalize_item_number(item_order)

        if not normalized_input or not normalized_order:
            continue

        if normalized_input in normalized_order or normalized_order in normalized_input:
            return ai["id"]

    return None


def _normalize_item_number(s: str) -> str:
    """Normalize an item number for matching.

    Strips parentheses, periods, trailing dots, whitespace.
    Examples: "6.1a)" -> "6.1a", "3.a)" -> "3.a", "8.1a" -> "8.1a"
    """
    s = s.strip()
    s = s.rstrip(".)").lstrip("(")
    s = re.sub(r"\s+", "", s)
    s = s.lower()
    return s


def _fallback_to_chunker(
    pdf_path: str,
    document_id: int,
    meeting_id: int,
    supabase,
    municipality_id: int,
) -> dict:
    """Fall back to the old PyMuPDF font-analysis chunker.

    Used when Gemini boundary detection fails or returns no results.
    """
    from pipeline.ingestion.document_chunker import chunk_document, link_sections_to_agenda_items

    stats = {
        "boundaries_found": 0,
        "documents_extracted": 0,
        "sections_created": 0,
        "images_extracted": 0,
    }

    # Get document title
    try:
        doc_result = (
            supabase.table("documents")
            .select("title")
            .eq("id", document_id)
            .single()
            .execute()
        )
        doc_title = doc_result.data.get("title", "Untitled") if doc_result.data else "Untitled"
    except Exception:
        doc_title = "Untitled"

    try:
        sections = chunk_document(pdf_path, doc_title)
    except Exception as e:
        logger.error("Fallback chunker also failed for document %d: %s", document_id, e)
        return stats

    if not sections:
        return stats

    # Link sections to agenda items
    try:
        sections = link_sections_to_agenda_items(sections, meeting_id, supabase)
    except Exception as e:
        logger.warning("Failed to link sections for fallback: %s", e)

    # Insert sections
    rows = []
    for section in sections:
        rows.append({
            "document_id": document_id,
            "agenda_item_id": section.get("agenda_item_id"),
            "section_title": section.get("section_title"),
            "section_text": section["section_text"],
            "section_order": section["section_order"],
            "page_start": section.get("page_start"),
            "page_end": section.get("page_end"),
            "token_count": section.get("token_count"),
            "municipality_id": municipality_id,
        })

    try:
        batch_size = 50
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            supabase.table("document_sections").insert(batch).execute()
        stats["sections_created"] = len(rows)
        logger.info(
            "Fallback chunker: %d sections created for document %d",
            len(rows), document_id,
        )
    except Exception as e:
        logger.error("Failed to insert fallback sections: %s", e)

    return stats
