import glob
import json
import os
import threading
import time as _time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from supabase import create_client
from tqdm import tqdm

from pipeline import config, parser, utils
from pipeline.paths import ARCHIVE_ROOT, BASE_DIR, get_municipality_archive_root
from pipeline.scrapers import get_scraper, register_scraper, MunicipalityConfig
from pipeline.scrapers.civicweb import CivicWebScraper

from .local_diarizer import LocalDiarizer
from .video.vimeo import VimeoClient

# Progress file for resumable backfill
BACKFILL_PROGRESS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "backfill_progress.json",
)

# Register built-in scrapers
register_scraper("civicweb", CivicWebScraper)


def load_municipality(slug: str) -> MunicipalityConfig:
    """Load municipality config from Supabase by slug."""
    supabase_key = config.SUPABASE_SECRET_KEY or config.SUPABASE_KEY
    if not config.SUPABASE_URL or not supabase_key:
        raise RuntimeError("SUPABASE_URL/KEY not set — cannot load municipality config")

    supabase = create_client(config.SUPABASE_URL, supabase_key)
    result = (
        supabase.table("municipalities")
        .select("*")
        .eq("slug", slug)
        .single()
        .execute()
    )

    if not result.data:
        raise ValueError(f"Municipality not found: {slug}")

    return MunicipalityConfig.from_db_row(result.data)


class Archiver:
    def __init__(self, municipality: MunicipalityConfig | None = None):
        if municipality is None:
            # Backward compat: default to View Royal with hardcoded defaults
            self.municipality = None
            self.archive_root = ARCHIVE_ROOT
            self.scraper = CivicWebScraper()
            self.vimeo_client = VimeoClient()
        else:
            self.municipality = municipality
            self.archive_root = get_municipality_archive_root(municipality.slug)
            self.scraper = get_scraper(municipality)

            # VimeoClient gets vimeo user from source_config
            video_config = municipality.source_config.get("video_source", {})
            self.vimeo_client = VimeoClient(
                vimeo_user=video_config.get("user", "viewroyal")
            )

        self.ai_enabled = False
        self.diarizer = None

        # Setup local diarizer (senko + parakeet) with fingerprint matching
        try:
            supabase_client = None
            if config.SUPABASE_URL and config.SUPABASE_KEY:
                try:
                    supabase_client = create_client(
                        config.SUPABASE_URL, config.SUPABASE_KEY
                    )
                except Exception as e:
                    print(
                        f"[!] Failed to initialize Supabase for fingerprints: {e}"
                    )

            self.diarizer = LocalDiarizer(
                supabase_client=supabase_client, use_parakeet=config.USE_PARAKEET
            )
            self.ai_enabled = True
        except Exception as e:
            print(f"[!] Failed to initialize LocalDiarizer: {e}")

    def run(
        self,
        skip_docs=False,
        include_video=False,
        limit=None,
        download_audio=False,
        skip_diarization=False,
        rediarize=False,
        skip_ingest=False,
        skip_embed=False,
    ):
        label = self.municipality.name if self.municipality else "View Royal"
        print(f"=== {label} Archiver ===")
        print(f"Archive Root: {self.archive_root}")

        # Phase 1: Documents
        if not skip_docs and not rediarize:
            print("\n--- Phase 1: Documents ---")
            try:
                self.scraper.scrape_recursive()
            except KeyboardInterrupt:
                return
        else:
            print("\n--- Phase 1: Documents (SKIPPED) ---")

        # Phase 2: Vimeo Download
        if not rediarize:
            video_map = self.vimeo_client.get_video_map(limit=limit)
            if video_map:
                print("\n--- Phase 2: Matching & Downloading Vimeo Content ---")
                self._download_vimeo_content(
                    video_map, include_video, download_audio, limit, self.archive_root
                )

        # Phase 3: Processing
        diarized_folders = set()
        if self.ai_enabled and not skip_diarization:
            label = "Re-diarizing" if rediarize else "Diarization"
            print(f"\n--- Phase 3: Processing Audio ({label}) ---")
            diarized_folders = self._process_audio_files(limit, self.archive_root, rediarize=rediarize)

        # Phase 4: Ingestion
        if not skip_ingest:
            print("\n--- Phase 4: Database Ingestion ---")
            self._ingest_meetings(diarized_folders=diarized_folders)
        else:
            print("\n--- Phase 4: Database Ingestion (SKIPPED) ---")

        # Phase 5: Embeddings
        if not skip_embed:
            print("\n--- Phase 5: Embedding Generation ---")
            self._embed_new_content()
        else:
            print("\n--- Phase 5: Embedding Generation (SKIPPED) ---")

        print("\n[SUCCESS] Archiving Complete.")

    def _download_vimeo_content(
        self,
        video_map,
        include_video,
        download_audio,
        limit=None,
        output_dir=None,
    ):
        output_dir = output_dir or self.archive_root
        matches = 0
        for root, dirs, files in os.walk(output_dir):
            folder_name = os.path.basename(root)
            date_key = utils.extract_date_from_string(folder_name)

            if date_key and date_key in video_map:
                videos = video_map[date_key]

                # Intelligent matching:
                # If there's only one video for this date, use it.
                # If there are multiple, try to match the folder type with the video title.
                video_data = None
                if len(videos) == 1:
                    video_data = videos[0]
                else:
                    # Match based on keywords
                    folder_lower = folder_name.lower()
                    if "public hearing" in folder_lower:
                        video_data = next(
                            (
                                v
                                for v in videos
                                if "public hearing" in v["title"].lower()
                            ),
                            None,
                        )
                    elif (
                        "committee of the whole" in folder_lower
                        or "cow" in folder_lower
                    ):
                        video_data = next(
                            (
                                v
                                for v in videos
                                if "committee of the whole" in v["title"].lower()
                                or "cow" in v["title"].lower()
                            ),
                            None,
                        )
                    elif "council" in folder_lower:
                        # For Council, try to avoid matching Public Hearing if it's separate
                        video_data = next(
                            (
                                v
                                for v in videos
                                if "council" in v["title"].lower()
                                and "public hearing" not in v["title"].lower()
                            ),
                            None,
                        )
                        # Fallback to any council video if specific one not found
                        if not video_data:
                            video_data = next(
                                (v for v in videos if "council" in v["title"].lower()),
                                None,
                            )

                if not video_data:
                    continue

                # Determine subfolder
                if include_video:
                    subfolder = "Video"
                else:
                    subfolder = "Audio"

                target_dir = os.path.join(root, subfolder)

                if not os.path.exists(target_dir):
                    os.makedirs(target_dir)

                parts = []
                if include_video:
                    parts.append("Video")
                if download_audio:
                    parts.append("Audio")

                msg = " + ".join(parts)
                print(
                    f"[Match] {date_key}: Syncing {msg} from '{video_data['title']}' to '{folder_name}/{subfolder}'"
                )

                new_audio_path = self.vimeo_client.download_video(
                    video_data,
                    target_dir,
                    include_video=include_video,
                    download_audio=download_audio,
                )

                matches += 1

    def _collect_audio_files(self, output_dir=None, rediarize=False):
        """Collect audio files that need processing."""
        output_dir = output_dir or self.archive_root
        audio_files = []
        for root, dirs, files in os.walk(output_dir):
            for file in files:
                if file.lower().endswith((".mp3", ".m4a", ".wav")):
                    audio_path = os.path.join(root, file)
                    json_path = os.path.splitext(audio_path)[0] + ".json"
                    if os.path.exists(json_path) and not rediarize:
                        continue
                    audio_files.append(audio_path)
        return audio_files

    def _process_audio_files(self, limit=None, output_dir=None, rediarize=False):
        output_dir = output_dir or self.archive_root
        audio_files = self._collect_audio_files(output_dir, rediarize)

        if limit:
            audio_files = audio_files[:limit]

        processed_folders = set()

        if not audio_files:
            print("  No audio files to process.")
            return processed_folders

        mode = "Re-diarize" if rediarize else "Process"
        print(f"  Found {len(audio_files)} audio file(s) to {mode.lower()}.\n")

        for i, audio_path in enumerate(audio_files, 1):
            root = os.path.dirname(audio_path)

            # Detect if we are in strict archive structure
            parent_dir = os.path.basename(root)
            grandparent_dir = os.path.basename(os.path.dirname(root))
            date_key = utils.extract_date_from_string(grandparent_dir)

            is_archive = date_key is not None and parent_dir == "Audio"

            json_path = os.path.splitext(audio_path)[0] + ".json"

            label = "Re-diarizing" if rediarize else "Processing"
            print(f"[{i}/{len(audio_files)}] {label} {os.path.basename(audio_path)}...")

            # Context extraction
            context_str = ""
            if is_archive:
                try:
                    meeting_root = os.path.dirname(root)

                    agenda_text = ""
                    cached_agenda = os.path.join(meeting_root, "agenda.md")
                    if os.path.exists(cached_agenda):
                        with open(cached_agenda, "r", encoding="utf-8") as f:
                            agenda_text = f.read()
                    else:
                        agenda_folder = os.path.join(meeting_root, "Agenda")
                        pdf_files = sorted(glob.glob(
                            os.path.join(agenda_folder, "*.pdf")
                        ))
                        if pdf_files:
                            all_texts = []
                            for pdf_file in pdf_files:
                                text = parser.get_pdf_text(pdf_file)
                                if text.strip():
                                    all_texts.append(text)
                            agenda_text = "\n\n---\n\n".join(all_texts)

                    minutes_text = ""
                    cached_minutes = os.path.join(meeting_root, "minutes.md")
                    if os.path.exists(cached_minutes):
                        with open(cached_minutes, "r", encoding="utf-8") as f:
                            minutes_text = f.read()
                    else:
                        minutes_folder = os.path.join(meeting_root, "Minutes")
                        pdf_files = sorted(glob.glob(
                            os.path.join(minutes_folder, "*.pdf")
                        ))
                        if pdf_files:
                            all_texts = []
                            for pdf_file in pdf_files:
                                text = parser.get_pdf_text(pdf_file)
                                if text.strip():
                                    all_texts.append(text)
                            minutes_text = "\n\n---\n\n".join(all_texts)

                    if agenda_text:
                        context_str += agenda_text
                    if minutes_text:
                        context_str += "\n" + minutes_text
                except Exception as e:
                    print(f"    [!] Failed to extract context: {e}")

            # If we are in "limit" mode (testing), limit audio processing to 5 minutes (300s)
            duration_limit = 300 if limit else None

            transcript_json = self.diarizer.diarize_audio(
                audio_path,
                context=context_str,
                limit_duration=duration_limit,
                rediarize=rediarize,
            )

            if transcript_json:
                # LocalDiarizer already saves the full result (segments +
                # centroids + samples) to the JSON file. Only write here
                # if the file wasn't created by the diarizer.
                if not os.path.exists(json_path):
                    with open(json_path, "w", encoding="utf-8") as f:
                        f.write(transcript_json)
                print(
                    f"    [+] Saved transcript to {os.path.basename(json_path)}"
                )
                # Track the meeting root folder (grandparent of Audio/)
                meeting_root = os.path.dirname(os.path.dirname(audio_path))
                processed_folders.add(meeting_root)

        return processed_folders

    def _ingest_meetings(self, diarized_folders=None, target_folder=None, force_update=False, ai_provider="gemini"):
        from pipeline.ingestion.ingester import MeetingIngester
        from pipeline.ingestion.audit import find_meetings_needing_reingest

        supabase_key = config.SUPABASE_SECRET_KEY or config.SUPABASE_KEY
        if not config.SUPABASE_URL or not supabase_key:
            print("  [!] SUPABASE_URL/KEY not set, skipping ingestion.")
            return

        supabase = create_client(config.SUPABASE_URL, supabase_key)
        municipality_id = self.municipality.id if self.municipality else 1
        ingester = MeetingIngester(
            config.SUPABASE_URL, supabase_key, config.GEMINI_API_KEY,
            municipality_id=municipality_id,
        )
        diarized_folders = diarized_folders or set()

        # Single-folder targeted mode
        if target_folder:
            needs_refine = force_update
            try:
                ingester.process_meeting(
                    target_folder,
                    force_update=force_update,
                    force_refine=needs_refine,
                    ai_provider=ai_provider,
                )
            except Exception as e:
                print(f"  [!] {target_folder}: {e}")
            return

        # Detect meetings with updated files (disk vs DB)
        updated_meetings = find_meetings_needing_reingest(supabase)
        updated_paths = {m["archive_path"] for m in updated_meetings}

        if updated_meetings:
            print(f"  Detected {len(updated_meetings)} meeting(s) with new documents:")
            for m in updated_meetings:
                reasons = ", ".join(m["reasons"])
                print(f"    {m['meeting_date']} {m['meeting_type']}: {reasons}")

        if diarized_folders:
            print(f"  {len(diarized_folders)} meeting(s) freshly diarized.")

        # Walk archive and process
        for root, dirs, files in os.walk(self.archive_root):
            if "Agenda" not in dirs and "Audio" not in dirs:
                continue

            rel_path = root

            if force_update or root in diarized_folders or rel_path in updated_paths:
                needs_refine = force_update or rel_path in updated_paths
                try:
                    ingester.process_meeting(
                        root,
                        force_update=True,
                        force_refine=needs_refine,
                        ai_provider=ai_provider,
                    )
                except Exception as e:
                    print(f"  [!] {root}: {e}")
            else:
                try:
                    ingester.process_meeting(root, ai_provider=ai_provider)
                except Exception as e:
                    print(f"  [!] {root}: {e}")

    def _embed_new_content(self, force=False):
        from pipeline.ingestion.embed import embed_table, TABLE_CONFIG

        for table in TABLE_CONFIG:
            try:
                embed_table(table, force=force)
            except Exception as e:
                print(f"  [!] Embedding failed for {table}: {e}")

    def generate_stances(self, person_id=None):
        """Generate AI stance summaries for councillors using Gemini.

        Lazy-imports the stance generator to avoid loading Gemini SDK unless needed.

        Args:
            person_id: Optional person ID to generate stances for a single councillor.
                       If None, generates for all councillors (is_councillor=true).
        """
        from pipeline.profiling.stance_generator import generate_all_stances

        supabase_key = config.SUPABASE_SECRET_KEY or config.SUPABASE_KEY
        if not config.SUPABASE_URL or not supabase_key:
            print("  [!] SUPABASE_URL/KEY not set, skipping stance generation.")
            return

        supabase = create_client(config.SUPABASE_URL, supabase_key)
        generate_all_stances(supabase, person_id=person_id)

    def backfill_document_sections(self, force=False):
        """Backfill extracted documents and sections for all existing documents.

        Uses Gemini 2.5 Flash for boundary detection + content extraction.
        Falls back to PyMuPDF chunker if Gemini fails.

        Two-pass approach:
        Pass 1 (this method): Extract and create sections for all documents
        Pass 2 (called separately): _embed_new_content() generates embeddings

        Idempotent: skips documents that already have extracted_documents unless force=True.
        """
        import time as _time

        from pipeline.ingestion.document_extractor import extract_and_store_documents

        supabase_key = config.SUPABASE_SECRET_KEY or config.SUPABASE_KEY
        if not config.SUPABASE_URL or not supabase_key:
            print("  [!] SUPABASE_URL/KEY not set, skipping backfill.")
            return

        supabase = create_client(config.SUPABASE_URL, supabase_key)
        municipality_id = self.municipality.id if self.municipality else 1

        # If force, delete ALL existing extraction data to start fresh
        if force:
            print("  [!] Force mode: deleting all extracted_documents, document_images, and document_sections...")
            try:
                # document_images has CASCADE from extracted_documents, so deleting
                # extracted_documents handles images. document_sections with
                # extracted_document_id will have that FK set to NULL via CASCADE.
                # We also delete document_sections explicitly for a clean slate.
                supabase.table("document_sections").delete().eq(
                    "municipality_id", municipality_id
                ).execute()
                supabase.table("extracted_documents").delete().eq(
                    "municipality_id", municipality_id
                ).execute()
                print("  [+] Cleared existing extraction data")
            except Exception as e:
                print(f"  [!] Error clearing data: {e}")

        # Fetch all documents with file paths
        result = supabase.table("documents").select(
            "id, meeting_id, title, file_path"
        ).eq("municipality_id", municipality_id).execute()

        documents = result.data or []
        print(f"  Found {len(documents)} documents to process")

        if not documents:
            print("  [!] No documents found. Run pipeline ingestion first.")
            return

        processed = 0
        skipped = 0
        errors = 0

        for doc in documents:
            doc_id = doc["id"]
            meeting_id = doc["meeting_id"]
            title = doc["title"] or f"Document {doc_id}"
            file_path = doc.get("file_path")

            if not file_path:
                skipped += 1
                continue

            # Check idempotency on extracted_documents table (not document_sections)
            if not force:
                try:
                    existing = supabase.table("extracted_documents").select(
                        "id", count="exact"
                    ).eq("document_id", doc_id).execute()
                    if existing.count and existing.count > 0:
                        skipped += 1
                        continue
                except Exception:
                    pass  # Table might not exist; proceed

            # Resolve full PDF path
            meeting_result = supabase.table("meetings").select(
                "archive_path"
            ).eq("id", meeting_id).single().execute()

            if not meeting_result.data or not meeting_result.data.get("archive_path"):
                print(f"  [!] No archive_path for meeting {meeting_id}, skipping {title}")
                skipped += 1
                continue

            archive_path = meeting_result.data["archive_path"]
            if not os.path.isabs(archive_path):
                archive_path = os.path.join(BASE_DIR, archive_path)

            pdf_path = os.path.join(archive_path, file_path)
            if not os.path.exists(pdf_path):
                print(f"  [!] PDF not found: {pdf_path}, skipping {title}")
                skipped += 1
                continue

            # Extract using new Gemini pipeline (with automatic fallback)
            try:
                stats = extract_and_store_documents(
                    pdf_path, doc_id, meeting_id, supabase, municipality_id
                )
                processed += 1
                print(
                    f"  [+] {title}: {stats['boundaries_found']} boundaries, "
                    f"{stats['sections_created']} sections, {stats['images_extracted']} images"
                )
            except Exception as e:
                print(f"  [!] Error extracting {title}: {e}")
                errors += 1

            # Rate limit: small delay between documents to respect Gemini limits
            _time.sleep(1)

        print(f"\n  Backfill complete: {processed} documents extracted, {skipped} skipped, {errors} errors")

    def backfill_extracted_documents(self, force=False, limit=None, concurrency=1):
        """Backfill document extraction for all meetings with agenda PDFs from the local archive.

        Walks the archive directory structure to find Agenda PDFs, looks up
        each meeting in the database by archive_path, creates document records
        if needed, and runs the full Gemini extraction pipeline.

        Uses a local JSON progress file for resumability — can be interrupted
        and restarted without reprocessing completed meetings.

        Args:
            force: If True, delete progress file and all extraction data, start fresh.
            limit: If set, only process this many meetings (for testing).
            concurrency: Number of meetings to process in parallel (default 1).
        """
        from pipeline.ingestion.document_extractor import extract_and_store_documents

        supabase_key = config.SUPABASE_SECRET_KEY or config.SUPABASE_KEY
        if not config.SUPABASE_URL or not supabase_key:
            print("  [!] SUPABASE_URL/KEY not set, skipping extraction.")
            return

        supabase = create_client(config.SUPABASE_URL, supabase_key)
        municipality_id = self.municipality.id if self.municipality else 1

        # Load or initialize progress
        progress = self._load_backfill_progress(force)

        if force:
            print("  [!] Force mode: deleting all extraction data and progress...")
            try:
                supabase.table("document_sections").delete().eq(
                    "municipality_id", municipality_id
                ).execute()
                supabase.table("extracted_documents").delete().eq(
                    "municipality_id", municipality_id
                ).execute()
                print("  [+] Cleared existing extraction data")
            except Exception as e:
                print(f"  [!] Error clearing data: {e}")

        processed_ids = set(progress.get("processed_meeting_ids", []))
        error_log = progress.get("errors", {})

        # Build index of meetings by archive_path for fast lookup
        print("  Loading meetings from database...")
        all_meetings = []
        offset = 0
        page_size = 1000
        while True:
            result = supabase.table("meetings").select(
                "id, archive_path, title, meeting_date"
            ).not_.is_("archive_path", "null").range(offset, offset + page_size - 1).execute()
            batch = result.data or []
            all_meetings.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size

        # Build lookup: relative archive_path -> meeting record
        meeting_by_path = {}
        for m in all_meetings:
            ap = m.get("archive_path", "")
            if ap:
                meeting_by_path[ap] = m

        print(f"  Loaded {len(meeting_by_path)} meetings with archive paths")

        # Walk the archive to find all Agenda directories with PDFs
        print("  Scanning archive for agenda PDFs...")
        meeting_folders = []  # list of (meeting_folder_abs, pdf_paths)

        for root, dirs, files in os.walk(self.archive_root):
            if "Agenda" not in dirs:
                continue

            agenda_dir = os.path.join(root, "Agenda")
            pdfs = sorted(glob.glob(os.path.join(agenda_dir, "*.pdf")))
            if pdfs:
                meeting_folders.append((root, pdfs))

        print(f"  Found {len(meeting_folders)} meeting folders with agenda PDFs")

        if limit:
            meeting_folders = meeting_folders[:limit]
            print(f"  Limiting to {limit} meetings")

        # Filter out already-processed meetings before dispatching
        work_items = []
        skipped_count = 0
        for meeting_folder, pdf_paths in meeting_folders:
            rel_path = os.path.relpath(meeting_folder, BASE_DIR)
            meeting = meeting_by_path.get(rel_path)
            if not meeting:
                tqdm.write(f"  [!] No DB meeting for: {rel_path}")
                skipped_count += 1
                continue
            meeting_id = meeting["id"]
            if meeting_id in processed_ids and not force:
                skipped_count += 1
                continue
            work_items.append((meeting_folder, pdf_paths, meeting))

        print(f"  Work queue: {len(work_items)} meetings to process, {skipped_count} already done")

        if not work_items:
            print("  Nothing to process.")
            return

        # Thread-safe state for concurrent access
        progress_lock = threading.Lock()
        stats_lock = threading.Lock()
        processed_count = 0
        error_count = 0
        start_time = _time.time()
        pbar = tqdm(total=len(work_items), desc="Extracting documents", unit="meeting")

        def _process_meeting(meeting_folder, pdf_paths, meeting):
            """Process a single meeting — designed to run in a thread."""
            nonlocal processed_count, error_count

            # Each thread gets its own Supabase client to avoid connection issues
            thread_supabase = create_client(config.SUPABASE_URL, supabase_key)

            meeting_id = meeting["id"]
            meeting_title = meeting.get("title", "Unknown")
            meeting_date = meeting.get("meeting_date", "")

            meeting_had_error = False
            total_boundaries = 0
            total_sections = 0
            total_images = 0

            for pdf_path in pdf_paths:
                pdf_filename = os.path.basename(pdf_path)
                rel_file_path = os.path.join("Agenda", pdf_filename)

                doc_id = self._find_or_create_document(
                    thread_supabase, meeting_id, pdf_filename, rel_file_path, municipality_id
                )
                if not doc_id:
                    tqdm.write(f"  [!] Could not create document for {pdf_filename}")
                    meeting_had_error = True
                    continue

                try:
                    result_stats = extract_and_store_documents(
                        pdf_path, doc_id, meeting_id, thread_supabase, municipality_id
                    )
                    total_boundaries += result_stats.get("boundaries_found", 0)
                    total_sections += result_stats.get("sections_created", 0)
                    total_images += result_stats.get("images_extracted", 0)
                except Exception as e:
                    tqdm.write(f"  [!] Error extracting {pdf_filename}: {e}")
                    meeting_had_error = True

            # Update shared state under locks
            with progress_lock:
                processed_ids.add(meeting_id)
                if meeting_had_error:
                    error_log[str(meeting_id)] = f"Partial or full failure for {meeting_title}"
                self._save_backfill_progress(processed_ids, error_log)

            with stats_lock:
                if meeting_had_error:
                    error_count += 1
                else:
                    processed_count += 1
                pbar.update(1)

            tqdm.write(
                f"  [{meeting_date}] {meeting_title}: "
                f"{total_boundaries} boundaries, {total_sections} sections, {total_images} images"
            )

        # Dispatch work — sequential or concurrent
        if concurrency <= 1:
            print("  Processing sequentially...")
            for meeting_folder, pdf_paths, meeting in work_items:
                _process_meeting(meeting_folder, pdf_paths, meeting)
        else:
            print(f"  Processing with {concurrency} concurrent workers...")
            with ThreadPoolExecutor(max_workers=concurrency) as executor:
                futures = {
                    executor.submit(_process_meeting, mf, pp, mt): mt
                    for mf, pp, mt in work_items
                }
                for future in as_completed(futures):
                    try:
                        future.result()
                    except Exception as e:
                        mt = futures[future]
                        tqdm.write(f"  [!] Unhandled error for meeting {mt.get('id', '?')}: {e}")

        pbar.close()
        elapsed = _time.time() - start_time
        elapsed_min = elapsed / 60

        print(f"\n  === Extraction Backfill Complete ===")
        print(f"  Processed: {processed_count}")
        print(f"  Skipped:   {skipped_count}")
        print(f"  Errors:    {error_count}")
        print(f"  Time:      {elapsed_min:.1f} minutes")

        if error_log:
            print(f"\n  Errors encountered ({len(error_log)}):")
            for mid, msg in list(error_log.items())[:10]:
                print(f"    Meeting {mid}: {msg}")
            if len(error_log) > 10:
                print(f"    ... and {len(error_log) - 10} more")

    def backfill_extracted_documents_batch(self, force=False, limit=None):
        """Batch version of backfill_extracted_documents using Gemini Batch API.

        50% cost savings, no rate limits, but higher latency (batch jobs
        target 24h completion). Uses a state file for full resumability.

        Args:
            force: If True, delete state and all extraction data, start fresh.
            limit: If set, only process this many meetings (for testing).
        """
        from pipeline.ingestion.batch_extractor import run_batch_extraction

        supabase_key = config.SUPABASE_SECRET_KEY or config.SUPABASE_KEY
        if not config.SUPABASE_URL or not supabase_key:
            print("  [!] SUPABASE_URL/KEY not set, skipping extraction.")
            return

        supabase = create_client(config.SUPABASE_URL, supabase_key)
        municipality_id = self.municipality.id if self.municipality else 1

        if force:
            print("  [!] Force mode: deleting all extraction data...")
            try:
                supabase.table("document_sections").delete().eq(
                    "municipality_id", municipality_id
                ).execute()
                supabase.table("extracted_documents").delete().eq(
                    "municipality_id", municipality_id
                ).execute()
                print("  [+] Cleared existing extraction data")
            except Exception as e:
                print(f"  [!] Error clearing data: {e}")

        # Build index of meetings by archive_path for fast lookup
        print("  Loading meetings from database...")
        all_meetings = []
        offset = 0
        page_size = 1000
        while True:
            result = supabase.table("meetings").select(
                "id, archive_path, title, meeting_date"
            ).not_.is_("archive_path", "null").range(offset, offset + page_size - 1).execute()
            batch = result.data or []
            all_meetings.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size

        meeting_by_path = {}
        for m in all_meetings:
            ap = m.get("archive_path", "")
            if ap:
                meeting_by_path[ap] = m

        print(f"  Loaded {len(meeting_by_path)} meetings with archive paths")

        # Walk the archive to find all Agenda directories with PDFs
        print("  Scanning archive for agenda PDFs...")
        meeting_folders = []

        for root, dirs, files in os.walk(self.archive_root):
            if "Agenda" not in dirs:
                continue

            agenda_dir = os.path.join(root, "Agenda")
            pdfs = sorted(glob.glob(os.path.join(agenda_dir, "*.pdf")))
            if pdfs:
                meeting_folders.append((root, pdfs))

        print(f"  Found {len(meeting_folders)} meeting folders with agenda PDFs")

        if limit:
            meeting_folders = meeting_folders[:limit]
            print(f"  Limiting to {limit} meetings")

        # Build the meetings dict expected by batch_extractor
        # {meeting_id_str: {pdf_path, doc_id, archive_path}}
        meetings_dict = {}
        skipped = 0

        for meeting_folder, pdf_paths in meeting_folders:
            rel_path = os.path.relpath(meeting_folder, BASE_DIR)
            meeting = meeting_by_path.get(rel_path)

            if not meeting:
                print(f"  [!] No DB meeting for: {rel_path}")
                skipped += 1
                continue

            meeting_id = meeting["id"]
            mid = str(meeting_id)

            # Use the first (usually only) agenda PDF
            pdf_path = pdf_paths[0]
            pdf_filename = os.path.basename(pdf_path)
            rel_file_path = os.path.join("Agenda", pdf_filename)

            # Find or create document record
            doc_id = self._find_or_create_document(
                supabase, meeting_id, pdf_filename, rel_file_path, municipality_id
            )
            if not doc_id:
                print(f"  [!] Could not create document for {pdf_filename}")
                skipped += 1
                continue

            meetings_dict[mid] = {
                "pdf_path": pdf_path,
                "doc_id": doc_id,
                "archive_path": rel_path,
                "title": meeting.get("title", "Unknown"),
                "meeting_date": meeting.get("meeting_date", ""),
            }

        if skipped:
            print(f"  Skipped {skipped} meetings (no DB record or document)")

        if not meetings_dict:
            print("  [!] No meetings to process. Run pipeline ingestion first.")
            return

        print(f"  Processing {len(meetings_dict)} meetings via Batch API...")
        run_batch_extraction(meetings_dict, supabase, municipality_id, force=force)

    def _find_or_create_document(self, supabase, meeting_id, pdf_filename, rel_file_path, municipality_id):
        """Find existing document record or create one for the given PDF.

        Returns the document_id or None on failure.
        """
        # Try to find existing document by meeting_id + file_path
        try:
            result = supabase.table("documents").select("id").eq(
                "meeting_id", meeting_id
            ).eq("file_path", rel_file_path).execute()

            if result.data:
                return result.data[0]["id"]
        except Exception:
            pass

        # Create new document record
        try:
            # Generate file_hash from the PDF path
            title = os.path.splitext(pdf_filename)[0]

            doc_data = {
                "meeting_id": meeting_id,
                "title": title,
                "category": "Agenda",
                "file_path": rel_file_path,
                "municipality_id": municipality_id,
            }
            result = supabase.table("documents").insert(doc_data).execute()
            if result.data:
                return result.data[0]["id"]
        except Exception as e:
            tqdm.write(f"    [!] Failed to create document record: {e}")

        return None

    def _load_backfill_progress(self, force=False):
        """Load progress from the backfill progress JSON file.

        If force=True or file doesn't exist, returns empty progress.
        """
        if force and os.path.exists(BACKFILL_PROGRESS_FILE):
            os.remove(BACKFILL_PROGRESS_FILE)

        if os.path.exists(BACKFILL_PROGRESS_FILE):
            try:
                with open(BACKFILL_PROGRESS_FILE, "r", encoding="utf-8") as f:
                    progress = json.load(f)
                count = len(progress.get("processed_meeting_ids", []))
                print(f"  Resuming from progress file: {count} meetings already processed")
                return progress
            except (json.JSONDecodeError, IOError):
                print("  [!] Could not read progress file, starting fresh")

        return {
            "processed_meeting_ids": [],
            "errors": {},
            "started_at": datetime.now(timezone.utc).isoformat(),
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }

    def _save_backfill_progress(self, processed_ids, errors):
        """Save progress to the backfill progress JSON file."""
        progress = {
            "processed_meeting_ids": sorted(processed_ids),
            "errors": errors,
            "started_at": None,  # Preserved from initial load
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }

        # Preserve started_at from existing file
        if os.path.exists(BACKFILL_PROGRESS_FILE):
            try:
                with open(BACKFILL_PROGRESS_FILE, "r", encoding="utf-8") as f:
                    existing = json.load(f)
                progress["started_at"] = existing.get("started_at")
            except (json.JSONDecodeError, IOError):
                pass

        if not progress["started_at"]:
            progress["started_at"] = datetime.now(timezone.utc).isoformat()

        with open(BACKFILL_PROGRESS_FILE, "w", encoding="utf-8") as f:
            json.dump(progress, f, indent=2)

    def _resolve_target(self, target: str) -> str:
        """Resolve a --target value to a folder path. Accepts DB ID or path."""
        if target.isdigit():
            supabase_key = config.SUPABASE_SECRET_KEY or config.SUPABASE_KEY
            supabase = create_client(config.SUPABASE_URL, supabase_key)
            result = supabase.table("meetings").select("archive_path").eq("id", int(target)).single().execute()
            if not result.data or not result.data.get("archive_path"):
                raise ValueError(f"Meeting ID {target} not found or has no archive_path")
            path = result.data["archive_path"]
            print(f"  Resolved meeting #{target} → {path}")
            return path

        if not os.path.isdir(target):
            raise ValueError(f"Not a directory: {target}")
        return target
