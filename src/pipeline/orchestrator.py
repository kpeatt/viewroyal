import glob
import os

from supabase import create_client

from src.core import config, parser, utils
from src.core.paths import ARCHIVE_ROOT

from .local_diarizer import LocalDiarizer
from .scraper import CivicWebScraper
from .vimeo import VimeoClient


class Archiver:
    def __init__(self):
        self.scraper = CivicWebScraper()
        self.vimeo_client = VimeoClient()
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
    ):
        print("=== View Royal Archiver ===")
        print(f"Archive Root: {ARCHIVE_ROOT}")

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
                    video_map, include_video, download_audio, limit, ARCHIVE_ROOT
                )

        # Phase 3: Processing
        if self.ai_enabled and not skip_diarization:
            label = "Re-diarizing" if rediarize else "Diarization"
            print(f"\n--- Phase 3: Processing Audio ({label}) ---")
            self._process_audio_files(limit, ARCHIVE_ROOT, rediarize=rediarize)

        print("\n[SUCCESS] Archiving Complete.")

    def _download_vimeo_content(
        self,
        video_map,
        include_video,
        download_audio,
        limit=None,
        output_dir=ARCHIVE_ROOT,
    ):
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
                    # Final fallback: if we can't decide, maybe it's just one video for a joint meeting?
                    # But if we have multiple videos and can't match, better to skip than to guess wrong.
                    # print(f"  [!] Could not match video for {folder_name} among {len(videos)} options.")
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

                # CHANGED: Passing the whole video_data dict, not just the url
                new_audio_path = self.vimeo_client.download_video(
                    video_data,
                    target_dir,
                    include_video=include_video,
                    download_audio=download_audio,
                )

                matches += 1

    def _collect_audio_files(self, output_dir=ARCHIVE_ROOT, rediarize=False):
        """Collect audio files that need processing."""
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

    def _process_audio_files(self, limit=None, output_dir=ARCHIVE_ROOT, rediarize=False):
        audio_files = self._collect_audio_files(output_dir, rediarize)

        if limit:
            audio_files = audio_files[:limit]

        if not audio_files:
            print("  No audio files to process.")
            return

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
