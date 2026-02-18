"""
Gemini 2.5 Flash two-pass document extraction.

Pass 1 (boundary detection): Send full agenda PDF, get structured JSON with
document boundaries, types, agenda item links, summaries, and key facts.

Pass 2 (content extraction): For each document boundary, extract clean
structured markdown content for those pages.
"""

import json
import logging
import os
import time

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────────

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
MAX_INLINE_MB = 50       # Inline payload supports up to 100MB (Jan 2026)
MAX_FILE_API_MB = 50     # Gemini PDF processing limit is 50MB
MAX_OUTPUT_TOKENS = 65536 # Gemini 2.5 Flash supports 64K output

# Pricing for cost estimation (Gemini 2.5 Flash)
_INPUT_COST_PER_M = 0.30
_OUTPUT_COST_PER_M = 2.50

# ── Singleton client ─────────────────────────────────────────────────────

_client = None


def get_gemini_client() -> genai.Client:
    """Return a lazily-initialized Gemini client singleton."""
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY not set. Set it in your environment or .env file."
            )
        _client = genai.Client(api_key=api_key)
        logger.info("Gemini client initialized (model: %s)", GEMINI_MODEL)
    return _client


# ── Prompts ──────────────────────────────────────────────────────────────

BOUNDARY_PROMPT = """You are analyzing a municipal council meeting agenda package PDF.
This PDF contains a table of contents/agenda listing at the start, followed by the actual
documents referenced by the agenda (staff reports, delegations, correspondence, minutes, etc.).

Your task: Identify every distinct document in this PDF and return a JSON array.
For each document, provide:

{
  "title": "Document title/heading as it appears",
  "page_start": 1,
  "page_end": 5,
  "type": "staff_report",
  "agenda_item": "6.1a",
  "summary": "1-2 sentence summary of what this document is about",
  "key_facts": ["dollar amounts", "addresses", "dates", "decisions"]
}

Guidelines:
- type: one of agenda, minutes, staff_report, delegation, correspondence, appendix, bylaw, presentation, form, other
- agenda_item: the agenda item number this document relates to (from the TOC/agenda pages), or null
- Be precise about page boundaries — where does each document start and end?
- CRITICAL: Page ranges MUST NOT overlap. Every page belongs to exactly one document. Do NOT create a parent entry spanning pages 4-22 AND separate child entries within that range. Choose the most specific/granular boundaries.
- Each distinct document should be its own entry (don't merge separate staff reports)
- The agenda/TOC pages at the start count as one "agenda" type document
- Delegation request forms should be type "form"
- key_facts: capture dollar amounts, addresses, dates, specific decisions/recommendations
- If a staff report spans pages 4-11 and has attached appendices on pages 12-15, the staff report is pages 4-11 and each appendix is a separate entry

Return ONLY a valid JSON array, no other text."""

CONTENT_PROMPT_TEMPLATE = """Extract the full content of the document on pages {page_start} to {page_end} from this PDF.

Output clean, well-structured markdown:
- Use ## for main headings, ### for sub-headings
- Render tables as markdown tables
- Preserve numbered/bulleted lists
- Include staff recommendations verbatim
- Skip headers/footers, page numbers, and watermarks
- Skip any images but note where they appear as [Image: brief description]
- Preserve all dollar amounts, dates, addresses, and bylaw numbers exactly

Return ONLY the markdown content, no commentary."""


# ── Helper: parse JSON from Gemini response ──────────────────────────────

def _parse_json_response(text: str) -> list[dict]:
    """Strip ```json fencing if present, parse JSON, validate required fields.

    Returns parsed list or empty list on failure (logs error).
    """
    cleaned = text.strip()

    # Remove ```json ... ``` fencing
    if cleaned.startswith("```"):
        # Strip first line (```json or ```) and last ```
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse boundary JSON: %s", e)
        logger.debug("Raw text (first 500 chars): %s", cleaned[:500])
        return []

    if not isinstance(data, list):
        logger.error("Expected JSON array, got %s", type(data).__name__)
        return []

    # Validate required fields
    required = {"title", "page_start", "page_end", "type"}
    validated = []
    for i, entry in enumerate(data):
        missing = required - set(entry.keys())
        if missing:
            logger.warning(
                "Boundary entry %d missing fields %s, skipping: %s",
                i, missing, entry.get("title", "?"),
            )
            continue
        validated.append(entry)

    return validated


# ── Helper: log token usage and cost ─────────────────────────────────────

def _log_usage(label: str, response) -> None:
    """Log token usage and estimated cost from a Gemini response."""
    try:
        usage = response.usage_metadata
        input_tokens = usage.prompt_token_count or 0
        output_tokens = usage.candidates_token_count or 0
        thinking_tokens = getattr(usage, "thoughts_token_count", 0) or 0
        total_output = output_tokens + thinking_tokens

        input_cost = input_tokens * _INPUT_COST_PER_M / 1_000_000
        output_cost = total_output * _OUTPUT_COST_PER_M / 1_000_000
        total_cost = input_cost + output_cost

        logger.info(
            "[%s] Tokens — input: %d, output: %d, thinking: %d | Cost: $%.4f",
            label, input_tokens, output_tokens, thinking_tokens, total_cost,
        )
    except Exception as e:
        logger.debug("Could not log token usage: %s", e)


# ── Helper: prepare PDF part for Gemini ──────────────────────────────────

def _prepare_pdf_part(pdf_path: str, client: genai.Client):
    """Prepare a PDF for sending to Gemini.

    - < 20MB: inline bytes
    - >= 20MB: File API upload (supports up to 2GB)

    Returns the part/file reference suitable for contents=[...].
    """
    file_size = os.path.getsize(pdf_path)
    size_mb = file_size / (1024 * 1024)

    if size_mb > MAX_FILE_API_MB:
        raise ValueError(
            f"PDF is {size_mb:.1f}MB (max {MAX_FILE_API_MB}MB for File API). "
            "Use _split_large_pdf() first."
        )

    if size_mb <= MAX_INLINE_MB:
        logger.info("PDF %.1fMB — sending inline", size_mb)
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()
        return types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")
    else:
        logger.info("PDF %.1fMB — uploading via File API", size_mb)
        uploaded = client.files.upload(file=pdf_path)

        # Wait for file processing to complete (required before use)
        max_wait = 300  # 5 minutes max
        waited = 0
        while waited < max_wait:
            file_info = client.files.get(name=uploaded.name)
            state = file_info.state.name if hasattr(file_info.state, 'name') else str(file_info.state)
            if state == "ACTIVE":
                logger.info("File API upload ready (waited %ds)", waited)
                break
            if state == "FAILED":
                raise ValueError(f"File API processing failed for {pdf_path}")
            time.sleep(3)
            waited += 3

        if waited >= max_wait:
            logger.warning("File API processing timed out after %ds", max_wait)

        return uploaded


# ── Helper: split large PDFs ────────────────────────────────────────────

def _split_large_pdf(pdf_path: str, max_pages: int = 500) -> list[tuple[str, int]]:
    """Split a PDF into chunks that each stay under MAX_FILE_API_MB.

    Includes the first 4 pages (agenda/TOC) in every chunk so Gemini can
    always reference agenda items.

    Uses adaptive chunking: starts with estimated page count, validates
    actual file size, and halves if a chunk exceeds the limit (PDF shared
    resources make file size unpredictable from page count alone).

    Returns list of (temp_file_path, page_offset) tuples.
    The caller is responsible for cleaning up temp files.
    """
    import tempfile

    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.error("PyMuPDF (fitz) required for splitting large PDFs")
        return []

    doc = fitz.open(pdf_path)
    total_pages = len(doc)

    # Estimate initial chunk size from average MB/page
    file_size_mb = os.path.getsize(pdf_path) / (1024 * 1024)
    if file_size_mb > MAX_FILE_API_MB and total_pages > 0:
        bytes_per_page = file_size_mb / total_pages
        # Target 30% of limit — very conservative because PDF shared
        # resources (fonts, images) inflate extracted chunks unpredictably
        target_mb = MAX_FILE_API_MB * 0.3
        size_based_max = max(5, int(target_mb / bytes_per_page))
        if size_based_max < max_pages:
            logger.info(
                "PDF is %.1fMB (%.1fMB/page avg) — targeting %d pages/chunk",
                file_size_mb, bytes_per_page, size_based_max,
            )
            max_pages = size_based_max

    if total_pages <= max_pages and file_size_mb <= MAX_FILE_API_MB:
        doc.close()
        return [(pdf_path, 0)]

    overlap_pages = min(4, total_pages)
    chunks = []

    chunk_start = overlap_pages
    while chunk_start < total_pages:
        # Try creating a chunk, validate size, halve if too large
        pages_to_take = min(max_pages - overlap_pages, total_pages - chunk_start)
        chunk_path = None

        while pages_to_take >= 5:
            chunk_end = chunk_start + pages_to_take

            new_doc = fitz.open()
            new_doc.insert_pdf(doc, from_page=0, to_page=overlap_pages - 1)
            new_doc.insert_pdf(doc, from_page=chunk_start, to_page=chunk_end - 1)

            # Downsample images to 72 DPI — Gemini only needs text readability
            try:
                new_doc.rewrite_images(dpi=72)
            except Exception:
                pass  # Some PDFs may not support this; continue anyway

            tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
            new_doc.ez_save(tmp.name)
            new_doc.close()
            tmp.close()

            chunk_mb = os.path.getsize(tmp.name) / (1024 * 1024)

            if chunk_mb <= MAX_FILE_API_MB:
                chunk_path = tmp.name
                logger.info(
                    "  Chunk: pages %d-%d → %.1fMB (%d pages + %d overlap)",
                    chunk_start + 1, chunk_end, chunk_mb,
                    pages_to_take, overlap_pages,
                )
                break
            else:
                # Too large — clean up and try fewer pages
                os.unlink(tmp.name)
                old_count = pages_to_take
                pages_to_take = pages_to_take // 2
                logger.info(
                    "  Chunk too large (%.1fMB) — reducing from %d to %d pages",
                    chunk_mb, old_count, pages_to_take,
                )

        if chunk_path:
            chunks.append((chunk_path, chunk_start))
            chunk_start += pages_to_take
        else:
            # Could not create a small enough chunk — skip these pages
            logger.warning(
                "  Skipping pages %d-%d: cannot reduce below 50MB",
                chunk_start + 1, chunk_start + pages_to_take,
            )
            chunk_start += pages_to_take

    doc.close()
    logger.info("Split into %d chunks", len(chunks))
    return chunks


# ── Helper: extract page range for content extraction of large PDFs ─────

def _extract_page_range(pdf_path: str, page_start: int, page_end: int, client):
    """Extract a page range from a large PDF into a temp file and prepare for Gemini.

    Used when the full PDF exceeds MAX_FILE_API_MB. Extracts just the needed
    pages so the chunk fits within the File API limit.

    Args:
        pdf_path: Path to the original large PDF
        page_start: 1-indexed start page
        page_end: 1-indexed end page
        client: Gemini client instance

    Returns the part/file reference, or None on failure.
    """
    import tempfile

    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.error("PyMuPDF required for page extraction")
        return None

    try:
        doc = fitz.open(pdf_path)
        new_doc = fitz.open()
        # Convert 1-indexed to 0-indexed
        new_doc.insert_pdf(doc, from_page=page_start - 1, to_page=page_end - 1)

        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        new_doc.save(tmp.name)
        new_doc.close()
        doc.close()
        tmp.close()

        part = _prepare_pdf_part(tmp.name, client)

        # Clean up temp file
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

        return part
    except Exception as e:
        logger.error("Failed to extract pages %d-%d: %s", page_start, page_end, e)
        return None


# ── Helper: merge boundaries from chunked PDFs ──────────────────────────

def _merge_chunk_boundaries(
    all_chunk_results: list[tuple[list[dict], int]],
    overlap_pages: int = 4,
) -> list[dict]:
    """Merge boundary results from multiple PDF chunks.

    Adjusts page numbers based on the chunk's page_offset and removes
    duplicates from the overlap pages.
    """
    merged = []
    seen_titles = set()

    for boundaries, page_offset in all_chunk_results:
        for entry in boundaries:
            # Entries from the overlap pages (1-4) — only keep from first chunk
            original_start = entry.get("page_start", 0)
            original_end = entry.get("page_end", 0)

            if page_offset > 0 and original_start <= overlap_pages:
                # This is a duplicate from the overlap — skip
                continue

            if page_offset > 0:
                # Adjust page numbers: subtract overlap pages, add offset
                entry["page_start"] = original_start - overlap_pages + page_offset
                entry["page_end"] = original_end - overlap_pages + page_offset

            # Deduplicate by title + page range
            key = f"{entry.get('title', '')}|{entry['page_start']}"
            if key not in seen_titles:
                seen_titles.add(key)
                merged.append(entry)

    # Sort by page_start
    merged.sort(key=lambda x: x.get("page_start", 0))
    return _dedup_overlapping_boundaries(merged)


def _dedup_overlapping_boundaries(boundaries: list[dict]) -> list[dict]:
    """Remove boundaries that are fully contained within other boundaries.

    When Gemini detects both a parent document (p4-22) and sub-documents
    within it (p4-11, p12, p13-19), keep the more granular children and
    drop the parent.
    """
    if len(boundaries) <= 1:
        return boundaries

    sorted_bounds = sorted(boundaries, key=lambda x: (x.get("page_start", 0), -x.get("page_end", 0)))
    to_remove = set()

    for i, parent in enumerate(sorted_bounds):
        if i in to_remove:
            continue
        p_start = parent.get("page_start", 0)
        p_end = parent.get("page_end", 0)
        span = p_end - p_start

        # Single-page entries can't contain children
        if span < 1:
            continue

        # Check if this parent fully contains any other entries
        children = []
        for j, child in enumerate(sorted_bounds):
            if i == j or j in to_remove:
                continue
            c_start = child.get("page_start", 0)
            c_end = child.get("page_end", 0)
            if c_start >= p_start and c_end <= p_end and (c_start, c_end) != (p_start, p_end):
                children.append(j)

        # If this parent contains any children, remove the parent
        if len(children) >= 1:
            to_remove.add(i)
            logger.debug(
                "Removing parent boundary '%s' p%d-%d (contains %d children)",
                parent.get("title", "?")[:50], p_start, p_end, len(children),
            )

    result = [b for i, b in enumerate(sorted_bounds) if i not in to_remove]
    if to_remove:
        logger.info(
            "Deduped %d overlapping parent boundaries (kept %d)",
            len(to_remove), len(result),
        )
    return result


# ── Gemini API call with retry ───────────────────────────────────────────

def _call_gemini(client, contents, label: str = "gemini") -> str | None:
    """Call Gemini with a single retry on transient errors.

    Returns the response text, or None on failure.
    """
    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=contents,
            )
            _log_usage(label, response)

            # Check for truncation
            if response.candidates:
                finish = response.candidates[0].finish_reason
                if hasattr(finish, 'name'):
                    finish_name = finish.name
                else:
                    finish_name = str(finish)
                if "MAX_TOKENS" in finish_name.upper():
                    logger.warning(
                        "[%s] Response truncated (MAX_TOKENS). Output may be incomplete.",
                        label,
                    )

            return response.text

        except Exception as e:
            error_str = str(e).lower()
            is_transient = any(
                kw in error_str
                for kw in ["rate limit", "429", "500", "503", "overloaded", "unavailable"]
            )
            if is_transient and attempt == 0:
                logger.warning("[%s] Transient error, retrying in 5s: %s", label, e)
                time.sleep(5)
                continue
            logger.error("[%s] Gemini API error: %s", label, e)
            return None

    return None


# ══════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════════════════


def detect_boundaries(pdf_path: str) -> list[dict]:
    """Pass 1: Send full agenda PDF to Gemini, get document boundaries.

    For PDFs > 50MB, splits into chunks and merges results.

    Returns list of dicts with keys:
        title, page_start, page_end, type, agenda_item, summary, key_facts
    """
    client = get_gemini_client()
    file_size_mb = os.path.getsize(pdf_path) / (1024 * 1024)

    logger.info("Detecting boundaries in %s (%.1fMB)", os.path.basename(pdf_path), file_size_mb)

    # Large PDF: split and process chunks
    if file_size_mb > MAX_FILE_API_MB:
        logger.info("PDF exceeds %dMB — splitting for boundary detection", MAX_FILE_API_MB)
        chunks = _split_large_pdf(pdf_path)
        if not chunks:
            return []

        all_results = []
        try:
            for chunk_path, page_offset in chunks:
                pdf_part = _prepare_pdf_part(chunk_path, client)
                text = _call_gemini(
                    client,
                    [pdf_part, BOUNDARY_PROMPT],
                    label=f"boundary-chunk-{page_offset}",
                )
                if text:
                    boundaries = _parse_json_response(text)
                    all_results.append((boundaries, page_offset))
        finally:
            # Clean up temp files (skip original)
            for chunk_path, _ in chunks:
                if chunk_path != pdf_path:
                    try:
                        os.unlink(chunk_path)
                    except OSError:
                        pass

        return _merge_chunk_boundaries(all_results)

    # Normal PDF: single request
    pdf_part = _prepare_pdf_part(pdf_path, client)
    text = _call_gemini(client, [pdf_part, BOUNDARY_PROMPT], label="boundary")
    if not text:
        return []

    return _dedup_overlapping_boundaries(_parse_json_response(text))


def extract_content(
    pdf_path: str,
    page_start: int,
    page_end: int,
    doc_title: str = "",
) -> str:
    """Pass 2: Extract clean markdown content for a page range from the PDF.

    Sends the full PDF with a page-specific prompt. Gemini handles the
    page selection natively.

    Returns markdown string, or empty string on failure.
    """
    client = get_gemini_client()

    logger.info(
        "Extracting content: '%s' (pages %d-%d)",
        doc_title[:50] if doc_title else "untitled",
        page_start,
        page_end,
    )

    file_size_mb = os.path.getsize(pdf_path) / (1024 * 1024)

    # For PDFs over 5MB, extract just the needed pages — avoids uploading
    # a 50MB PDF 45 times for 45 different page ranges. Individual document
    # page ranges are typically 1-20 pages and well under the inline limit.
    if file_size_mb > 5:
        pdf_part = _extract_page_range(pdf_path, page_start, page_end, client)
        if pdf_part is None:
            logger.error("Cannot extract pages %d-%d from PDF", page_start, page_end)
            return ""
        # Extracted pages are renumbered starting at 1
        prompt = CONTENT_PROMPT_TEMPLATE.format(
            page_start=1,
            page_end=page_end - page_start + 1,
        )
    else:
        try:
            pdf_part = _prepare_pdf_part(pdf_path, client)
        except ValueError as e:
            logger.error("Cannot extract content: %s", e)
            return ""

        prompt = CONTENT_PROMPT_TEMPLATE.format(
            page_start=page_start,
            page_end=page_end,
        )

    text = _call_gemini(
        client,
        [pdf_part, prompt],
        label=f"content-p{page_start}-{page_end}",
    )

    return text.strip() if text else ""
