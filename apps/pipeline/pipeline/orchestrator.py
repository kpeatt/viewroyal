import glob
import os

from supabase import create_client

from pipeline import config, parser, utils
from pipeline.paths import ARCHIVE_ROOT, get_municipality_archive_root
from pipeline.scrapers import get_scraper, register_scraper, MunicipalityConfig
from pipeline.scrapers.civicweb import CivicWebScraper

from .local_diarizer import LocalDiarizer
from .video.vimeo import VimeoClient

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
                        pdf_files = glob.glob(
                            os.path.join(agenda_folder, "*.pdf")
                        )
                        if pdf_files:
                            agenda_text = parser.get_pdf_text(pdf_files[0])

                    minutes_text = ""
                    cached_minutes = os.path.join(meeting_root, "minutes.md")
                    if os.path.exists(cached_minutes):
                        with open(cached_minutes, "r", encoding="utf-8") as f:
                            minutes_text = f.read()
                    else:
                        minutes_folder = os.path.join(meeting_root, "Minutes")
                        pdf_files = glob.glob(
                            os.path.join(minutes_folder, "*.pdf")
                        )
                        if pdf_files:
                            minutes_text = parser.get_pdf_text(pdf_files[0])

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
