"""
Gemini Batch API extraction for document backfill.

Uses the Gemini Batch API for 50% cost savings and no rate-limit concerns.
Two sequential batch phases, each processed in waves to stay within
the File API 20GB storage limit.

Phase 1: Boundary Detection - Upload agenda PDFs, submit batch, parse boundaries
Phase 2: Content Extraction - Extract page ranges, submit batch, parse markdown
Phase 3: DB Insertion - Create extracted_documents and document_sections rows
"""

import json
import logging
import os
import tempfile
import time
import urllib.request
from datetime import datetime, timezone

from tqdm import tqdm

logger = logging.getLogger(__name__)


# ── Push Notifications ──────────────────────────────────────────────────

MOSHI_TOKEN = "y4ralDJ6RzhwOMbdNyQAVYoN6VKPtrnJ"
MOSHI_URL = "https://api.getmoshi.app/api/webhook"


def _notify(title: str, message: str) -> None:
    """Send a push notification via Moshi webhook. Best-effort, never raises."""
    try:
        payload = json.dumps({"token": MOSHI_TOKEN, "title": title, "message": message})
        req = urllib.request.Request(
            MOSHI_URL,
            data=payload.encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass  # Non-critical


# ── Configuration ────────────────────────────────────────────────────────

STATE_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "batch_extraction_state.json",
)

MAX_WAVE_BYTES = 10 * 1024 * 1024 * 1024  # 10 GB per wave
POLL_INTERVAL = 60  # seconds between batch status checks
FILE_UPLOAD_RETRIES = 3
FILE_ACTIVE_TIMEOUT = 300  # 5 min max wait for file processing


# ── State Management ─────────────────────────────────────────────────────


def load_state(force: bool = False) -> dict:
    """Load or initialize the batch extraction state file."""
    if force and os.path.exists(STATE_FILE):
        os.remove(STATE_FILE)
        logger.info("Deleted existing state file (force mode)")

    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                state = json.load(f)
            phase = state.get("phase", "unknown")
            logger.info("Resuming from state file (phase: %s)", phase)
            return state
        except (json.JSONDecodeError, IOError):
            logger.warning("Could not read state file, starting fresh")

    return {
        "phase": "boundary_detection",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "meetings": {},
        "boundary_job": None,
        "boundary_results": {},
        "boundary_uploaded_files": [],
        "content_waves": [],
        "content_results": {},
        "content_uploaded_files": [],
        "meetings_inserted": [],
        "errors": {},
    }


def save_state(state: dict) -> None:
    """Persist state to disk."""
    state["last_updated"] = datetime.now(timezone.utc).isoformat()
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


# ── File API Helpers ─────────────────────────────────────────────────────


def upload_pdf(client, pdf_path: str, display_name: str) -> tuple[str, str]:
    """Upload a PDF to Gemini File API with retries.

    Returns (file_name, file_uri) tuple.
    """
    for attempt in range(FILE_UPLOAD_RETRIES):
        try:
            uploaded = client.files.upload(
                file=pdf_path,
                config={"display_name": display_name},
            )
            wait_for_file_active(client, uploaded.name)
            return uploaded.name, uploaded.uri
        except Exception as e:
            if attempt < FILE_UPLOAD_RETRIES - 1:
                wait = 2 ** (attempt + 1)
                logger.warning(
                    "Upload failed for %s (attempt %d/%d), retrying in %ds: %s",
                    display_name, attempt + 1, FILE_UPLOAD_RETRIES, wait, e,
                )
                time.sleep(wait)
            else:
                raise RuntimeError(
                    f"Failed to upload {display_name} after {FILE_UPLOAD_RETRIES} attempts: {e}"
                ) from e
    # Unreachable, but satisfies type checker
    raise RuntimeError("Upload failed")


def upload_jsonl(client, jsonl_str: str, display_name: str) -> str:
    """Upload JSONL content as a file to File API.

    Returns the file name (e.g. 'files/abc123').
    """
    # Write JSONL to a temp file, then upload
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".jsonl", delete=False, encoding="utf-8"
    ) as tmp:
        tmp.write(jsonl_str)
        tmp_path = tmp.name

    try:
        uploaded = client.files.upload(
            file=tmp_path,
            config={"display_name": display_name, "mime_type": "application/jsonl"},
        )
        wait_for_file_active(client, uploaded.name)
        return uploaded.name
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def wait_for_file_active(client, file_name: str, timeout: int = FILE_ACTIVE_TIMEOUT) -> None:
    """Poll until a File API file is in ACTIVE state."""
    waited = 0
    while waited < timeout:
        file_info = client.files.get(name=file_name)
        state_name = (
            file_info.state.name
            if hasattr(file_info.state, "name")
            else str(file_info.state)
        )
        if state_name == "ACTIVE":
            return
        if state_name == "FAILED":
            raise RuntimeError(f"File processing failed: {file_name}")
        time.sleep(3)
        waited += 3

    raise RuntimeError(f"File processing timed out after {timeout}s: {file_name}")


def delete_files(client, file_names: list[str]) -> None:
    """Delete files from File API, logging but not raising on errors."""
    for name in file_names:
        try:
            client.files.delete(name=name)
        except Exception as e:
            logger.warning("Failed to delete file %s: %s", name, e)


# ── PDF Preparation ──────────────────────────────────────────────────────


def _extract_pages_to_tempfile(pdf_path: str, page_start: int, page_end: int) -> str | None:
    """Extract a page range from a PDF to a temp file.

    Args:
        pdf_path: Source PDF path.
        page_start: 1-indexed start page.
        page_end: 1-indexed end page.

    Returns temp file path, or None on failure. Caller must clean up.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.error("PyMuPDF (fitz) required for page extraction")
        return None

    try:
        doc = fitz.open(pdf_path)
        new_doc = fitz.open()
        new_doc.insert_pdf(doc, from_page=page_start - 1, to_page=page_end - 1)

        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        new_doc.save(tmp.name)
        new_doc.close()
        doc.close()
        tmp.close()
        return tmp.name
    except Exception as e:
        logger.error("Failed to extract pages %d-%d from %s: %s", page_start, page_end, pdf_path, e)
        return None


def prepare_meeting_pdfs(
    client, meetings: dict[str, dict], state: dict
) -> dict[str, tuple[str, str]]:
    """Upload agenda PDFs for boundary detection.

    For PDFs > 50MB, splits into chunks first via _split_large_pdf().

    Args:
        client: Gemini client.
        meetings: {meeting_id_str: {pdf_path, doc_id, archive_path, ...}}.
        state: Current state dict (for tracking uploaded files).

    Returns {request_key: (file_name, file_uri)} mapping.
    """
    from pipeline.ingestion.gemini_extractor import _split_large_pdf, MAX_FILE_API_MB

    uploaded = {}
    all_file_names = list(state.get("boundary_uploaded_files", []))

    for mid, info in tqdm(meetings.items(), desc="Uploading PDFs for boundary detection"):
        pdf_path = info["pdf_path"]

        if not os.path.exists(pdf_path):
            logger.warning("PDF not found: %s (meeting %s)", pdf_path, mid)
            state["errors"][f"m_{mid}"] = f"PDF not found: {pdf_path}"
            continue

        file_size_mb = os.path.getsize(pdf_path) / (1024 * 1024)

        if file_size_mb > MAX_FILE_API_MB:
            # Split large PDF into chunks
            chunks = _split_large_pdf(pdf_path)
            if not chunks:
                state["errors"][f"m_{mid}"] = "Failed to split large PDF"
                continue

            for i, (chunk_path, page_offset) in enumerate(chunks):
                key = f"m_{mid}_chunk{i}"
                try:
                    display = f"boundary_m{mid}_chunk{i}"
                    fname, furi = upload_pdf(client, chunk_path, display)
                    uploaded[key] = (fname, furi)
                    all_file_names.append(fname)
                except Exception as e:
                    logger.error("Upload failed for %s: %s", key, e)
                    state["errors"][key] = str(e)
                finally:
                    # Clean up temp chunk files (but not the original)
                    if chunk_path != pdf_path:
                        try:
                            os.unlink(chunk_path)
                        except OSError:
                            pass

            # Store chunk metadata for later merging
            info["chunks"] = [
                {"key": f"m_{mid}_chunk{i}", "page_offset": offset}
                for i, (_, offset) in enumerate(chunks)
            ]
        else:
            key = f"m_{mid}"
            try:
                display = f"boundary_m{mid}"
                fname, furi = upload_pdf(client, pdf_path, display)
                uploaded[key] = (fname, furi)
                all_file_names.append(fname)
            except Exception as e:
                logger.error("Upload failed for %s: %s", key, e)
                state["errors"][key] = str(e)

    state["boundary_uploaded_files"] = all_file_names
    save_state(state)

    return uploaded


def prepare_content_pdfs(
    client,
    boundaries: dict[str, list[dict]],
    meetings: dict[str, dict],
    state: dict,
) -> list[tuple[str, str, str, int]]:
    """Prepare page-range PDFs for content extraction.

    For each boundary, extracts the relevant pages to a temp file.

    Returns list of (request_key, temp_path, pdf_path, file_size) tuples,
    sorted by file size for efficient wave packing.
    """
    items = []

    for mid, bounds in boundaries.items():
        info = meetings.get(mid)
        if not info:
            continue
        pdf_path = info["pdf_path"]

        for boundary in bounds:
            ps = boundary.get("page_start")
            pe = boundary.get("page_end")
            if not ps or not pe:
                continue

            key = f"m_{mid}_p{ps}-{pe}"

            # Extract pages to temp file
            tmp_path = _extract_pages_to_tempfile(pdf_path, ps, pe)
            if tmp_path is None:
                state["errors"][key] = f"Failed to extract pages {ps}-{pe}"
                continue

            file_size = os.path.getsize(tmp_path)
            items.append((key, tmp_path, pdf_path, file_size))

    # Sort by file size for better wave packing
    items.sort(key=lambda x: x[3])
    return items


# ── JSONL Generation ─────────────────────────────────────────────────────


def build_boundary_jsonl(uploaded: dict[str, tuple[str, str]]) -> str:
    """Build JSONL for boundary detection batch.

    Each line references an uploaded PDF + boundary detection prompt.
    """
    from pipeline.ingestion.gemini_extractor import BOUNDARY_PROMPT

    lines = []
    for key, (file_name, file_uri) in uploaded.items():
        request = {
            "key": key,
            "request": {
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {
                                "file_data": {
                                    "file_uri": file_uri,
                                    "mime_type": "application/pdf",
                                }
                            },
                            {"text": BOUNDARY_PROMPT},
                        ],
                    }
                ],
            },
        }
        lines.append(json.dumps(request, separators=(",", ":")))

    return "\n".join(lines) + "\n"


def build_content_jsonl(
    uploaded: dict[str, tuple[str, str]],
    page_ranges: dict[str, tuple[int, int]],
) -> str:
    """Build JSONL for content extraction batch.

    Each line references an uploaded page-range PDF + content prompt.
    """
    from pipeline.ingestion.gemini_extractor import CONTENT_PROMPT_TEMPLATE

    lines = []
    for key, (file_name, file_uri) in uploaded.items():
        ps, pe = page_ranges[key]
        # Pages are renumbered starting at 1 in the extracted PDF
        num_pages = pe - ps + 1
        prompt = CONTENT_PROMPT_TEMPLATE.format(page_start=1, page_end=num_pages)

        request = {
            "key": key,
            "request": {
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {
                                "file_data": {
                                    "file_uri": file_uri,
                                    "mime_type": "application/pdf",
                                }
                            },
                            {"text": prompt},
                        ],
                    }
                ],
            },
        }
        lines.append(json.dumps(request, separators=(",", ":")))

    return "\n".join(lines) + "\n"


# ── Batch Lifecycle ──────────────────────────────────────────────────────


def submit_batch(client, jsonl_file_name: str, model: str, display_name: str) -> str:
    """Submit a batch job. Returns the batch job name."""
    job = client.batches.create(
        model=model,
        src=jsonl_file_name,
        config={"display_name": display_name},
    )
    logger.info("Batch submitted: %s (name: %s)", display_name, job.name)
    return job.name


def poll_batch(client, job_name: str, poll_interval: int = POLL_INTERVAL):
    """Poll a batch job until completion. Returns the completed job."""
    start = time.time()
    last_log = 0

    while True:
        job = client.batches.get(name=job_name)
        state_name = (
            job.state.name if hasattr(job.state, "name") else str(job.state)
        )

        elapsed = time.time() - start
        # Log progress every 5 minutes
        if elapsed - last_log >= 300:
            logger.info(
                "Batch %s: state=%s, elapsed=%.0fm",
                job_name, state_name, elapsed / 60,
            )
            last_log = elapsed

        if state_name == "JOB_STATE_SUCCEEDED":
            logger.info(
                "Batch %s completed successfully in %.1f minutes",
                job_name, elapsed / 60,
            )
            return job

        if state_name in ("JOB_STATE_FAILED", "JOB_STATE_CANCELLED"):
            raise RuntimeError(
                f"Batch {job_name} ended with state: {state_name}"
            )

        time.sleep(poll_interval)


def collect_results(client, job) -> dict[str, str]:
    """Download and parse batch results.

    Returns {key: response_text} mapping.
    Logs per-request errors but continues.
    """
    results = {}

    # Try inline responses first
    if hasattr(job, "dest") and hasattr(job.dest, "inlined_responses") and job.dest.inlined_responses:
        for resp in job.dest.inlined_responses:
            key = resp.key if hasattr(resp, "key") else None
            if not key:
                continue

            if hasattr(resp, "error") and resp.error:
                logger.warning("Batch request %s failed: %s", key, resp.error)
                continue

            if hasattr(resp, "response") and resp.response:
                try:
                    text = resp.response.candidates[0].content.parts[0].text
                    results[key] = text
                except (IndexError, AttributeError) as e:
                    logger.warning("Could not extract text for %s: %s", key, e)

        if results:
            logger.info("Collected %d results from inline responses", len(results))
            return results

    # Fall back to file-based results
    if hasattr(job, "dest") and hasattr(job.dest, "file_name") and job.dest.file_name:
        try:
            result_bytes = client.files.download(file=job.dest.file_name)

            # result_bytes might be bytes or a file-like object
            if isinstance(result_bytes, bytes):
                content = result_bytes.decode("utf-8")
            elif hasattr(result_bytes, "read"):
                content = result_bytes.read()
                if isinstance(content, bytes):
                    content = content.decode("utf-8")
            else:
                content = str(result_bytes)

            for line in content.strip().split("\n"):
                if not line.strip():
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    logger.warning("Malformed result line: %s", line[:200])
                    continue

                key = entry.get("key")
                if not key:
                    continue

                if "error" in entry:
                    logger.warning("Batch request %s failed: %s", key, entry["error"])
                    continue

                # Extract response text
                try:
                    response = entry.get("response", {})
                    text = response["candidates"][0]["content"]["parts"][0]["text"]
                    results[key] = text
                except (KeyError, IndexError, TypeError) as e:
                    logger.warning("Could not extract text for %s: %s", key, e)

            logger.info("Collected %d results from file", len(results))
        except Exception as e:
            logger.error(
                "Failed to download result file %s: %s (known issue #1759)",
                job.dest.file_name, e,
            )

    return results


# ── Wave Planning ────────────────────────────────────────────────────────


def plan_waves(
    items: list[tuple[str, str, str, int]],
    max_bytes: int = MAX_WAVE_BYTES,
) -> list[list[tuple[str, str, str, int]]]:
    """Group items into waves by cumulative byte size.

    Args:
        items: List of (key, temp_path, source_pdf_path, file_size) tuples.
        max_bytes: Maximum bytes per wave.

    Returns list of waves, each a list of items.
    """
    waves = []
    current_wave = []
    current_bytes = 0

    for item in items:
        file_size = item[3]
        if current_bytes + file_size > max_bytes and current_wave:
            waves.append(current_wave)
            current_wave = [item]
            current_bytes = file_size
        else:
            current_wave.append(item)
            current_bytes += file_size

    if current_wave:
        waves.append(current_wave)

    return waves


# ── DB Insertion ─────────────────────────────────────────────────────────


def insert_meeting_results(
    meeting_id: int,
    boundaries: list[dict],
    content_results: dict[str, str],
    doc_id: int,
    pdf_path: str,
    supabase,
    municipality_id: int,
) -> dict:
    """Insert extraction results for a single meeting into the database.

    Creates extracted_documents, document_sections, and runs image extraction.

    Returns stats dict.
    """
    from pipeline.ingestion.document_extractor import (
        _resolve_agenda_item,
        _split_markdown_into_sections,
    )
    from pipeline.ingestion.image_extractor import extract_images, upload_images_to_r2

    stats = {
        "boundaries_found": len(boundaries),
        "documents_extracted": 0,
        "sections_created": 0,
        "images_extracted": 0,
    }

    mid = str(meeting_id)

    # Clean up existing data for this document to prevent duplicates on re-runs
    try:
        existing = (
            supabase.table("extracted_documents")
            .select("id")
            .eq("document_id", doc_id)
            .execute()
        )
        if existing.data:
            ed_ids = [row["id"] for row in existing.data]
            # Delete document_sections referencing these extracted_documents
            for ed_id in ed_ids:
                supabase.table("document_sections").delete().eq(
                    "extracted_document_id", ed_id
                ).execute()
            # Delete document_images referencing these extracted_documents
            for ed_id in ed_ids:
                supabase.table("document_images").delete().eq(
                    "extracted_document_id", ed_id
                ).execute()
            # Delete the extracted_documents themselves
            supabase.table("extracted_documents").delete().eq(
                "document_id", doc_id
            ).execute()
            logger.info(
                "Cleaned up %d existing extracted_documents for doc %d",
                len(ed_ids), doc_id,
            )
    except Exception as e:
        logger.warning("Cleanup before insert failed for doc %d: %s", doc_id, e)

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
                "document_id": doc_id,
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

        # Get markdown content from batch results
        content_key = f"m_{mid}_p{page_start}-{page_end}"
        markdown = content_results.get(content_key, "")

        # Split into sections
        if markdown:
            sections = _split_markdown_into_sections(markdown)
        else:
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
                    "document_id": doc_id,
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

        # Image extraction (synchronous, local PyMuPDF)
        if page_start and page_end and pdf_path:
            try:
                images = extract_images(pdf_path, page_start, page_end)
            except Exception as e:
                logger.warning("Image extraction failed for '%s': %s", title, e)
                images = []

            if images:
                uploaded_imgs = upload_images_to_r2(images, meeting_id, extracted_doc_id)
                for img_meta in uploaded_imgs:
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

    return stats


# ── Main Orchestration ───────────────────────────────────────────────────


def run_batch_extraction(
    meetings: dict[str, dict],
    supabase,
    municipality_id: int,
    force: bool = False,
) -> None:
    """Run the full batch extraction pipeline.

    State machine phases:
      boundary_detection → content_extraction → db_insertion → complete

    Args:
        meetings: {meeting_id_str: {pdf_path, doc_id, archive_path}}.
        supabase: Supabase client.
        municipality_id: Municipality ID.
        force: If True, reset state and start fresh.
    """
    from pipeline.ingestion.gemini_extractor import (
        GEMINI_MODEL,
        _dedup_overlapping_boundaries,
        _merge_chunk_boundaries,
        _parse_json_response,
        get_gemini_client,
    )

    state = load_state(force)
    state["meetings"] = meetings
    save_state(state)

    client = get_gemini_client()
    total_meetings = len(meetings)

    # ── Phase 1: Boundary Detection ──────────────────────────────────

    if state["phase"] == "boundary_detection":
        print(f"\n  === Phase 1: Boundary Detection ({total_meetings} meetings) ===")

        # Step 1a: Upload PDFs (skip if already done)
        if not state.get("boundary_job"):
            uploaded = prepare_meeting_pdfs(client, meetings, state)

            if not uploaded:
                print("  [!] No PDFs uploaded successfully. Aborting.")
                return

            print(f"  Uploaded {len(uploaded)} PDFs to File API")

            # Step 1b: Build and upload JSONL
            jsonl_content = build_boundary_jsonl(uploaded)
            jsonl_file = upload_jsonl(client, jsonl_content, "boundary_requests")
            print(f"  JSONL uploaded: {jsonl_file}")

            # Step 1c: Submit batch
            job_name = submit_batch(
                client, jsonl_file, GEMINI_MODEL, "boundary_detection"
            )
            state["boundary_job"] = {
                "name": job_name,
                "status": "submitted",
                "jsonl_file": jsonl_file,
                "uploaded_keys": {k: v for k, v in uploaded.items()},
            }
            save_state(state)
            print(f"  Batch submitted: {job_name}")
        else:
            print(f"  Resuming batch: {state['boundary_job']['name']}")

        # Step 1d: Poll for completion
        job_name = state["boundary_job"]["name"]
        print(f"  Polling batch job (checking every {POLL_INTERVAL}s)...")
        job = poll_batch(client, job_name)

        # Step 1e: Collect results
        raw_results = collect_results(client, job)
        print(f"  Collected {len(raw_results)} boundary results")

        # Parse and organize results by meeting
        boundary_results = {}
        for key, text in raw_results.items():
            boundaries = _parse_json_response(text)
            if not boundaries:
                logger.warning("No boundaries parsed for %s", key)
                state["errors"][key] = "No boundaries parsed"
                continue

            # Handle chunked PDFs — need to merge later
            if "_chunk" in key:
                # key format: m_520_chunk0
                parts = key.split("_chunk")
                mid = parts[0]  # m_520
                if mid not in boundary_results:
                    boundary_results[mid] = []
                # Store as (boundaries, page_offset) for merging
                chunk_idx = int(parts[1])
                # Find the page_offset from meeting info
                mid_num = mid.replace("m_", "")
                info = meetings.get(mid_num, {})
                chunks_meta = info.get("chunks", [])
                page_offset = 0
                for cm in chunks_meta:
                    if cm["key"] == key:
                        page_offset = cm["page_offset"]
                        break
                boundary_results.setdefault(f"{mid}_chunks", []).append(
                    (boundaries, page_offset)
                )
            else:
                # key format: m_520
                boundary_results[key] = _dedup_overlapping_boundaries(boundaries)

        # Merge chunk results
        for key in list(boundary_results.keys()):
            if key.endswith("_chunks"):
                mid = key.replace("_chunks", "")
                chunks_data = boundary_results.pop(key)
                merged = _merge_chunk_boundaries(chunks_data)
                boundary_results[mid] = merged

        # Convert keys from m_520 to 520
        clean_results = {}
        for key, bounds in boundary_results.items():
            mid = key.replace("m_", "")
            clean_results[mid] = bounds
            logger.info("Meeting %s: %d boundaries detected", mid, len(bounds))

        state["boundary_results"] = clean_results
        state["boundary_job"]["status"] = "complete"

        # Step 1f: Cleanup uploaded files
        print("  Cleaning up uploaded PDF files...")
        delete_files(client, state.get("boundary_uploaded_files", []))
        # Also clean up JSONL file
        jsonl_file = state["boundary_job"].get("jsonl_file")
        if jsonl_file:
            delete_files(client, [jsonl_file])
        state["boundary_uploaded_files"] = []

        state["phase"] = "content_extraction"
        save_state(state)

        total_boundaries = sum(len(b) for b in clean_results.values())
        msg = (
            f"Phase 1 complete: {len(clean_results)} meetings, "
            f"{total_boundaries} total boundaries"
        )
        print(f"  {msg}")
        _notify("Batch Phase 1 Done", msg)

    # ── Phase 2: Content Extraction ──────────────────────────────────

    if state["phase"] == "content_extraction":
        boundary_results = state["boundary_results"]
        total_boundaries = sum(len(b) for b in boundary_results.values())
        print(f"\n  === Phase 2: Content Extraction ({total_boundaries} documents) ===")

        # Prepare all content PDFs (extract page ranges)
        print("  Extracting page ranges from PDFs...")
        content_items = prepare_content_pdfs(client, boundary_results, meetings, state)
        print(f"  Prepared {len(content_items)} page-range PDFs")

        if not content_items:
            print("  [!] No content items to process. Skipping to DB insertion.")
            state["phase"] = "db_insertion"
            save_state(state)
        else:
            # Plan waves
            waves = plan_waves(content_items)
            total_bytes = sum(item[3] for item in content_items)
            print(
                f"  Planned {len(waves)} wave(s) "
                f"(total: {total_bytes / (1024**3):.1f} GB)"
            )

            # Determine which waves are already complete
            completed_waves = set()
            for w in state.get("content_waves", []):
                if w.get("status") == "complete":
                    completed_waves.add(w["wave"])

            # Process each wave
            for wave_idx, wave_items in enumerate(waves):
                if wave_idx in completed_waves:
                    print(f"  Wave {wave_idx + 1}/{len(waves)}: already complete, skipping")
                    continue

                wave_bytes = sum(item[3] for item in wave_items)
                print(
                    f"\n  Wave {wave_idx + 1}/{len(waves)}: "
                    f"{len(wave_items)} items ({wave_bytes / (1024**3):.1f} GB)"
                )

                # Check if this wave has an existing job
                existing_wave = None
                for w in state.get("content_waves", []):
                    if w["wave"] == wave_idx and w.get("status") == "submitted":
                        existing_wave = w
                        break

                if existing_wave:
                    # Resume polling existing job
                    job_name = existing_wave["job_name"]
                    print(f"  Resuming existing batch: {job_name}")
                else:
                    # Upload page-range PDFs
                    uploaded = {}
                    page_ranges = {}
                    wave_file_names = []

                    for key, tmp_path, source_pdf, fsize in tqdm(
                        wave_items, desc=f"  Uploading wave {wave_idx + 1}"
                    ):
                        try:
                            display = f"content_{key}"
                            fname, furi = upload_pdf(client, tmp_path, display)
                            uploaded[key] = (fname, furi)
                            wave_file_names.append(fname)

                            # Parse page range from key: m_520_p12-18
                            parts = key.split("_p")[-1].split("-")
                            ps, pe = int(parts[0]), int(parts[1])
                            page_ranges[key] = (ps, pe)
                        except Exception as e:
                            logger.error("Upload failed for %s: %s", key, e)
                            state["errors"][key] = str(e)
                        finally:
                            # Clean up temp file
                            try:
                                os.unlink(tmp_path)
                            except OSError:
                                pass

                    state["content_uploaded_files"] = wave_file_names
                    save_state(state)

                    if not uploaded:
                        logger.warning("Wave %d: no files uploaded", wave_idx)
                        continue

                    # Build and upload JSONL
                    jsonl_content = build_content_jsonl(uploaded, page_ranges)
                    jsonl_file = upload_jsonl(
                        client, jsonl_content, f"content_wave{wave_idx}"
                    )

                    # Submit batch
                    job_name = submit_batch(
                        client, jsonl_file, GEMINI_MODEL,
                        f"content_extraction_wave{wave_idx}",
                    )

                    wave_meta = {
                        "wave": wave_idx,
                        "job_name": job_name,
                        "status": "submitted",
                        "keys": list(uploaded.keys()),
                        "jsonl_file": jsonl_file,
                    }
                    # Update or append wave metadata
                    existing_idx = None
                    for i, w in enumerate(state.get("content_waves", [])):
                        if w["wave"] == wave_idx:
                            existing_idx = i
                            break
                    if existing_idx is not None:
                        state["content_waves"][existing_idx] = wave_meta
                    else:
                        state.setdefault("content_waves", []).append(wave_meta)
                    save_state(state)

                    print(f"  Batch submitted: {job_name}")

                # Poll for completion
                print(f"  Polling wave {wave_idx + 1} batch job...")
                job = poll_batch(client, job_name)

                # Collect results
                wave_results = collect_results(client, job)
                print(f"  Collected {len(wave_results)} content results")

                # Merge into state
                state.setdefault("content_results", {}).update(wave_results)

                # Mark wave complete
                for w in state.get("content_waves", []):
                    if w["wave"] == wave_idx:
                        w["status"] = "complete"
                        break

                # Cleanup wave files
                print(f"  Cleaning up wave {wave_idx + 1} files...")
                delete_files(client, state.get("content_uploaded_files", []))
                # Also clean up JSONL file
                for w in state.get("content_waves", []):
                    if w["wave"] == wave_idx and w.get("jsonl_file"):
                        delete_files(client, [w["jsonl_file"]])
                state["content_uploaded_files"] = []
                save_state(state)

            total_content = len(state.get("content_results", {}))
            msg = f"Phase 2 complete: {total_content} content extractions"
            print(f"\n  {msg}")
            _notify("Batch Phase 2 Done", msg)

            state["phase"] = "db_insertion"
            save_state(state)

    # ── Phase 3: DB Insertion ────────────────────────────────────────

    if state["phase"] == "db_insertion":
        boundary_results = state["boundary_results"]
        content_results = state.get("content_results", {})
        inserted = set(state.get("meetings_inserted", []))

        remaining = [
            mid for mid in boundary_results if int(mid) not in inserted
        ]
        print(
            f"\n  === Phase 3: DB Insertion "
            f"({len(remaining)} meetings remaining, "
            f"{len(inserted)} already inserted) ==="
        )

        for mid in tqdm(remaining, desc="Inserting into database"):
            meeting_id = int(mid)
            info = meetings.get(mid, {})
            doc_id = info.get("doc_id")
            pdf_path_val = info.get("pdf_path")
            boundaries = boundary_results.get(mid, [])

            if not doc_id:
                logger.warning("No doc_id for meeting %s, skipping DB insertion", mid)
                state["errors"][f"m_{mid}"] = "No doc_id"
                continue

            try:
                stats = insert_meeting_results(
                    meeting_id, boundaries, content_results,
                    doc_id, pdf_path_val, supabase, municipality_id,
                )

                tqdm.write(
                    f"  Meeting {mid}: {stats['documents_extracted']} docs, "
                    f"{stats['sections_created']} sections, "
                    f"{stats['images_extracted']} images"
                )
            except Exception as e:
                logger.error("DB insertion failed for meeting %s: %s", mid, e)
                state["errors"][f"m_{mid}"] = f"DB insertion error: {e}"

            inserted.add(meeting_id)
            state["meetings_inserted"] = sorted(inserted)
            save_state(state)

        state["phase"] = "complete"
        save_state(state)

        # Summary
        errors = state.get("errors", {})
        print(f"\n  === Batch Extraction Complete ===")
        print(f"  Meetings processed: {len(inserted)}")
        print(f"  Boundary results:   {len(boundary_results)}")
        print(f"  Content results:    {len(content_results)}")
        _notify(
            "Batch Extraction Done",
            f"{len(inserted)} meetings, {len(content_results)} docs, {len(errors)} errors",
        )
        if errors:
            print(f"  Errors:             {len(errors)}")
            for key, msg in list(errors.items())[:10]:
                print(f"    {key}: {msg}")
            if len(errors) > 10:
                print(f"    ... and {len(errors) - 10} more")
