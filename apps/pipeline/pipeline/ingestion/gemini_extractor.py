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
MAX_INLINE_MB = 20       # PDFs under this use inline bytes
MAX_FILE_API_MB = 50     # PDFs between 20-50MB use File API upload
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
- Each distinct document should be its own entry (don't merge separate staff reports)
- The agenda/TOC pages at the start count as one "agenda" type document
- Delegation request forms should be type "form"
- key_facts: capture dollar amounts, addresses, dates, specific decisions/recommendations

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
    - 20-50MB: File API upload
    - > 50MB: raises ValueError (caller should split first)

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
        return uploaded


# ── Helper: split large PDFs ────────────────────────────────────────────

def _split_large_pdf(pdf_path: str, max_pages: int = 500) -> list[tuple[str, int]]:
    """Split a PDF into chunks of max_pages pages.

    Includes the first 4 pages (agenda/TOC) in every chunk so Gemini can
    always reference agenda items.

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

    if total_pages <= max_pages:
        doc.close()
        return [(pdf_path, 0)]

    logger.info(
        "Splitting %d-page PDF into chunks of %d pages", total_pages, max_pages
    )

    # First 4 pages = agenda/TOC overlap
    overlap_pages = min(4, total_pages)
    chunks = []

    # Start chunking from page overlap_pages onward
    chunk_start = overlap_pages
    while chunk_start < total_pages:
        chunk_end = min(chunk_start + max_pages - overlap_pages, total_pages)

        new_doc = fitz.open()
        # Always include the first overlap_pages (agenda/TOC)
        new_doc.insert_pdf(doc, from_page=0, to_page=overlap_pages - 1)
        # Then the chunk-specific pages
        new_doc.insert_pdf(doc, from_page=chunk_start, to_page=chunk_end - 1)

        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        new_doc.save(tmp.name)
        new_doc.close()
        tmp.close()

        # page_offset: the real page number that chunk_start corresponds to
        # In the chunk file, after the overlap_pages, the first new page
        # corresponds to chunk_start in the original
        chunks.append((tmp.name, chunk_start))
        logger.info(
            "  Chunk: pages %d-%d (file pages %d-%d + %d overlap)",
            chunk_start + 1, chunk_end, overlap_pages + 1,
            overlap_pages + (chunk_end - chunk_start), overlap_pages,
        )

        chunk_start = chunk_end

    doc.close()
    return chunks


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
    return merged


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

    return _parse_json_response(text)


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
