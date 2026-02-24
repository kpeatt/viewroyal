"""
Update detection engine for the pipeline.

Compares remote CivicWeb document listings and Vimeo video availability
against the local archive, producing a structured change report that
identifies meetings with new content.

Lightweight module -- does NOT import diarizer, Gemini, or other heavy deps.
"""

from __future__ import annotations

import glob
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone

from pipeline import utils
from pipeline.ingestion.audit import check_disk_documents, find_meetings_needing_reingest


@dataclass
class MeetingChange:
    """A single detected change for a meeting."""

    archive_path: str
    meeting_date: str
    meeting_type: str
    change_type: str  # "new_documents" or "new_video"
    details: list[str] = field(default_factory=list)
    meta: dict = field(default_factory=dict)


@dataclass
class ChangeReport:
    """Aggregated report of all detected changes."""

    meetings_with_new_docs: list[MeetingChange] = field(default_factory=list)
    meetings_with_new_video: list[MeetingChange] = field(default_factory=list)
    meetings_new: list[MeetingChange] = field(default_factory=list)
    total_changes: int = 0
    checked_at: str = ""

    def __post_init__(self):
        if not self.checked_at:
            self.checked_at = datetime.now(timezone.utc).isoformat()
        self.total_changes = (
            len(self.meetings_with_new_docs)
            + len(self.meetings_with_new_video)
            + len(self.meetings_new)
        )


class UpdateDetector:
    """Detects new documents and videos available for pipeline processing.

    Compares CivicWeb listings and Vimeo video availability against the
    local archive and database state to identify meetings with new content.

    Args:
        archive_root: Path to the local archive directory.
        scraper: CivicWebScraper instance (unused for detection -- kept for
                 interface consistency with Archiver).
        vimeo_client: VimeoClient instance for checking Vimeo video availability.
    """

    def __init__(self, archive_root: str, scraper=None, vimeo_client=None):
        self.archive_root = archive_root
        self.scraper = scraper
        self.vimeo_client = vimeo_client

    def detect_document_changes(self, supabase=None) -> list[MeetingChange]:
        """Detect meetings where disk has documents the DB doesn't know about.

        Uses the existing audit logic (find_meetings_needing_reingest) which
        compares DB flags (has_agenda, has_minutes, has_transcript) against
        what actually exists on disk.

        Args:
            supabase: Supabase client instance. Required for DB comparison.

        Returns:
            List of MeetingChange objects with change_type="new_documents".
        """
        if supabase is None:
            print("[UpdateDetector] No Supabase client provided, skipping document change detection.")
            return []

        audit_results = find_meetings_needing_reingest(supabase)

        changes: list[MeetingChange] = []
        for meeting in audit_results:
            reasons = meeting.get("reasons", [])

            # Filter to only document-related changes (not status upgrades or missing refinement alone)
            doc_reasons = [
                r
                for r in reasons
                if "agenda" in r.lower()
                or "minutes" in r.lower()
                or "transcript" in r.lower()
            ]

            if not doc_reasons:
                continue

            changes.append(
                MeetingChange(
                    archive_path=meeting.get("archive_path", ""),
                    meeting_date=meeting.get("meeting_date", ""),
                    meeting_type=meeting.get("meeting_type", "Unknown"),
                    change_type="new_documents",
                    details=doc_reasons,
                )
            )

        return changes

    def detect_video_changes(self) -> list[MeetingChange]:
        """Detect meetings where Vimeo has video but no audio/transcript on disk.

        Walks the archive directory and checks each meeting folder against the
        Vimeo video map. A meeting is flagged if:
        - A Vimeo video exists for the meeting date
        - The meeting folder has NO audio files (.mp3/.m4a/.wav in Audio/)
        - The meeting folder has NO transcript JSON

        Returns:
            List of MeetingChange objects with change_type="new_video".
        """
        if self.vimeo_client is None:
            print("[UpdateDetector] No Vimeo client provided, skipping video change detection.")
            return []

        video_map = self.vimeo_client.get_video_map()
        if not video_map:
            return []

        changes: list[MeetingChange] = []

        for root, dirs, files in os.walk(self.archive_root):
            # Only consider meeting folders (those with Agenda or other content dirs)
            if "Agenda" not in dirs and "Minutes" not in dirs:
                continue

            folder_name = os.path.basename(root)
            date_key = utils.extract_date_from_string(folder_name)

            if not date_key or date_key not in video_map:
                continue

            # Check if audio already exists
            audio_dir = os.path.join(root, "Audio")
            has_audio = False
            if os.path.exists(audio_dir):
                audio_files = (
                    glob.glob(os.path.join(audio_dir, "*.mp3"))
                    + glob.glob(os.path.join(audio_dir, "*.m4a"))
                    + glob.glob(os.path.join(audio_dir, "*.wav"))
                )
                has_audio = len(audio_files) > 0

            # Check if transcript already exists
            has_transcript = os.path.exists(
                os.path.join(root, "transcript.json")
            ) or os.path.exists(os.path.join(root, "transcript_clean.md"))

            # Also check for diarized JSON in Audio/
            if not has_transcript and os.path.exists(audio_dir):
                json_files = glob.glob(os.path.join(audio_dir, "*.json"))
                transcript_jsons = [
                    f
                    for f in json_files
                    if not os.path.basename(f).startswith("raw_")
                ]
                has_transcript = len(transcript_jsons) > 0

            # Also check for shared_media.json (pointer to another meeting's transcript)
            if not has_transcript:
                has_transcript = os.path.exists(
                    os.path.join(root, "shared_media.json")
                )

            if has_audio or has_transcript:
                continue

            # Meeting has Vimeo video but no local audio/transcript
            videos = video_map[date_key]
            video_titles = [v["title"] for v in videos]
            meeting_type = utils.infer_meeting_type(folder_name) or "Unknown"

            details = [f"Vimeo video available: {title}" for title in video_titles]

            changes.append(
                MeetingChange(
                    archive_path=root,
                    meeting_date=date_key,
                    meeting_type=meeting_type,
                    change_type="new_video",
                    details=details,
                    meta={"video_data": videos},
                )
            )

        return changes

    @staticmethod
    def _normalize_archive_path(folder_path: str) -> str:
        """Normalize archive path to relative form (same logic as MeetingIngester)."""
        abs_path = os.path.abspath(folder_path)

        archive_marker = "/archive/"
        if archive_marker in abs_path:
            idx = abs_path.find(archive_marker) + 1
            return abs_path[idx:]

        marker = "viewroyal_archive"
        if marker in abs_path:
            idx = abs_path.find(marker)
            return abs_path[idx:]

        return folder_path

    def detect_new_meetings(self, supabase=None) -> list[MeetingChange]:
        """Detect meeting folders on disk that have no corresponding DB record.

        Walks the archive for folders containing Agenda or Audio subdirs,
        normalizes their paths, and checks for a matching archive_path in
        the meetings table.

        Args:
            supabase: Supabase client instance. Required for DB lookup.

        Returns:
            List of MeetingChange objects with change_type="new_meeting".
        """
        if supabase is None:
            print("[UpdateDetector] No Supabase client provided, skipping new meeting detection.")
            return []

        # Collect all meeting folders on disk
        disk_folders: list[tuple[str, str]] = []  # (abs_path, normalized_path)
        for root, dirs, _files in os.walk(self.archive_root):
            if "Agenda" not in dirs and "Audio" not in dirs:
                continue
            normalized = self._normalize_archive_path(root)
            disk_folders.append((root, normalized))

        if not disk_folders:
            return []

        # Fetch all known archive_paths from DB in one query
        result = (
            supabase.table("meetings")
            .select("archive_path")
            .not_("archive_path", "is", "null")
            .execute()
        )
        known_paths = {row["archive_path"] for row in (result.data or [])}

        changes: list[MeetingChange] = []
        for abs_path, normalized in disk_folders:
            if normalized in known_paths:
                continue

            folder_name = os.path.basename(abs_path)
            date_key = utils.extract_date_from_string(folder_name) or "unknown"
            meeting_type = utils.infer_meeting_type(folder_name) or "Unknown"

            disk = check_disk_documents(abs_path)
            details = []
            if disk["has_agenda"]:
                details.append("Agenda on disk")
            if disk["has_minutes"]:
                details.append("Minutes on disk")
            if disk["has_transcript"]:
                details.append("Transcript on disk")

            if not details:
                continue

            changes.append(
                MeetingChange(
                    archive_path=abs_path,
                    meeting_date=date_key,
                    meeting_type=meeting_type,
                    change_type="new_meeting",
                    details=details,
                )
            )

        return changes

    def detect_all_changes(self, supabase=None) -> ChangeReport:
        """Run all detection methods and produce a combined ChangeReport.

        Args:
            supabase: Supabase client instance (needed for document detection).

        Returns:
            ChangeReport with both document and video changes.
        """
        new_meetings = self.detect_new_meetings(supabase)
        doc_changes = self.detect_document_changes(supabase)
        video_changes = self.detect_video_changes()

        report = ChangeReport(
            meetings_with_new_docs=doc_changes,
            meetings_with_new_video=video_changes,
            meetings_new=new_meetings,
        )

        # Print human-readable summary
        print(f"\n{'='*60}")
        print(f"  Update Detection Report")
        print(f"  Checked at: {report.checked_at}")
        print(f"{'='*60}")

        if new_meetings:
            print(f"\n  New Meetings ({len(new_meetings)} folders not in DB):")
            for change in new_meetings:
                print(f"    {change.meeting_date} {change.meeting_type}")
                for detail in change.details:
                    print(f"      - {detail}")
        else:
            print("\n  New Meetings: None detected")

        if doc_changes:
            print(f"\n  Document Changes ({len(doc_changes)} meetings):")
            for change in doc_changes:
                print(f"    {change.meeting_date} {change.meeting_type}")
                for detail in change.details:
                    print(f"      - {detail}")
        else:
            print("\n  Document Changes: None detected")

        if video_changes:
            print(f"\n  Video Changes ({len(video_changes)} meetings):")
            for change in video_changes:
                print(f"    {change.meeting_date} {change.meeting_type}")
                for detail in change.details:
                    print(f"      - {detail}")
        else:
            print("\n  Video Changes: None detected")

        print(f"\n  Total: {report.total_changes} meeting(s) with new content")
        print(f"{'='*60}\n")

        return report
