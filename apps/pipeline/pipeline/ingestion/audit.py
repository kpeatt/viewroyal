#!/usr/bin/env python3
"""
Check for meetings that have occurred but are missing documents.

This script identifies meetings where:
1. The meeting date is in the past
2. One or more expected documents are missing (agenda, minutes, transcript)
3. New documents may have been added to the archive since last ingestion

Usage:
    uv run src/maintenance/audit/check_occurred_meetings.py
    uv run src/maintenance/audit/check_occurred_meetings.py --reingest  # Actually re-ingest
    uv run src/maintenance/audit/check_occurred_meetings.py --days 30   # Only check last 30 days
"""

import argparse
import glob
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
ARCHIVE_ROOT = os.getenv("ARCHIVE_ROOT", "viewroyal_archive")


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def check_disk_documents(folder_path: str) -> dict:
    """Check what documents exist on disk for a meeting folder."""
    result = {
        "has_agenda": False,
        "has_minutes": False,
        "has_transcript": False,
        "has_refinement": False,
        "has_agenda_md": False,
        "has_minutes_md": False,
        "agenda_files": [],
        "minutes_files": [],
        "transcript_files": [],
    }

    if not os.path.exists(folder_path):
        return result

    # Check for agenda
    agenda_dir = os.path.join(folder_path, "Agenda")
    if os.path.exists(agenda_dir):
        pdf_files = glob.glob(os.path.join(agenda_dir, "*.pdf"))
        html_files = glob.glob(os.path.join(agenda_dir, "*.html"))
        result["agenda_files"] = pdf_files + html_files
        result["has_agenda"] = len(result["agenda_files"]) > 0

    # Check for agenda.md (processed)
    if os.path.exists(os.path.join(folder_path, "agenda.md")):
        result["has_agenda"] = True
        result["has_agenda_md"] = True

    # Check for minutes
    minutes_dir = os.path.join(folder_path, "Minutes")
    if os.path.exists(minutes_dir):
        pdf_files = glob.glob(os.path.join(minutes_dir, "*.pdf"))
        html_files = glob.glob(os.path.join(minutes_dir, "*.html"))
        result["minutes_files"] = pdf_files + html_files
        result["has_minutes"] = len(result["minutes_files"]) > 0

    # Check for minutes.md (processed/cached from PDF)
    if os.path.exists(os.path.join(folder_path, "minutes.md")):
        result["has_minutes"] = True
        result["has_minutes_md"] = True

    # Check for transcript
    audio_dir = os.path.join(folder_path, "Audio")
    if os.path.exists(audio_dir):
        # Look for diarized JSON files (not raw audio)
        json_files = glob.glob(os.path.join(audio_dir, "*.json"))
        # Filter out non-transcript files
        transcript_files = [
            f for f in json_files if not os.path.basename(f).startswith("raw_")
        ]
        result["transcript_files"] = transcript_files
        result["has_transcript"] = len(transcript_files) > 0

    # Check for transcript.json or transcript_clean.md
    if os.path.exists(os.path.join(folder_path, "transcript.json")) or os.path.exists(
        os.path.join(folder_path, "transcript_clean.md")
    ):
        result["has_transcript"] = True

    # Check for shared_media.json (pointer to another meeting's transcript)
    shared_media_path = os.path.join(folder_path, "shared_media.json")
    if os.path.exists(shared_media_path):
        result["has_transcript"] = True

    # Check for refinement.json (AI processing done)
    result["has_refinement"] = os.path.exists(
        os.path.join(folder_path, "refinement.json")
    )

    return result


def find_meetings_needing_reingest(supabase, days_back: int = None, check_extraction: bool = False) -> list:
    """
    Find meetings that have occurred but may need re-ingestion.

    Returns list of meetings with:
    - Missing documents that now exist on disk
    - No refinement.json but documents exist
    - Status is 'Occurred' but could be 'Completed'
    """

    # Query for meetings that have occurred (past date)
    today = datetime.now().date()
    query = (
        supabase.table("meetings")
        .select(
            "id, archive_path, meeting_date, type, status, has_agenda, has_minutes, has_transcript"
        )
        .lte("meeting_date", today.isoformat())
    )

    if days_back:
        cutoff = (today - timedelta(days=days_back)).isoformat()
        query = query.gte("meeting_date", cutoff)

    result = query.order("meeting_date", desc=True).execute()

    needs_reingest = []

    for meeting in result.data:
        archive_path = meeting.get("archive_path")
        if not archive_path:
            continue

        # archive_path is stored as a full relative path (e.g., "viewroyal_archive/...")
        # so we use it directly, not joined with ARCHIVE_ROOT
        folder_path = archive_path
        disk = check_disk_documents(folder_path)

        reasons = []

        # Check if DB says no agenda but disk has one
        if not meeting.get("has_agenda") and disk["has_agenda"]:
            reasons.append("New agenda found on disk")

        # Check if DB says no minutes but disk has them
        if not meeting.get("has_minutes") and disk["has_minutes"]:
            reasons.append("New minutes found on disk")

        # Check if DB says no transcript but disk has one
        if not meeting.get("has_transcript") and disk["has_transcript"]:
            reasons.append("New transcript found on disk")

        # Check if has documents but no refinement (AI processing not done)
        if (
            disk["has_agenda"] or disk["has_minutes"] or disk["has_transcript"]
        ) and not disk["has_refinement"]:
            reasons.append("Missing refinement.json (AI processing needed)")

        # Check for failed PDF extraction (PDF exists but no .md cache)
        if check_extraction:
            agenda_pdfs = [f for f in disk["agenda_files"] if f.endswith(".pdf")]
            if agenda_pdfs and not disk["has_agenda_md"]:
                reasons.append("Agenda PDF exists but extraction failed (no agenda.md)")

            minutes_pdfs = [f for f in disk["minutes_files"] if f.endswith(".pdf")]
            if minutes_pdfs and not disk["has_minutes_md"]:
                reasons.append("Minutes PDF exists but extraction failed (no minutes.md)")

        # Check if status could be upgraded
        if (
            meeting.get("status") == "Occurred"
            and disk["has_minutes"]
            and disk["has_transcript"]
        ):
            reasons.append("Could upgrade status to Completed")

        if reasons:
            needs_reingest.append(
                {
                    "id": meeting["id"],
                    "archive_path": archive_path,
                    "meeting_date": meeting["meeting_date"],
                    "meeting_type": meeting.get("type"),
                    "status": meeting.get("status"),
                    "reasons": reasons,
                    "disk": disk,
                    "db": {
                        "has_agenda": meeting.get("has_agenda"),
                        "has_minutes": meeting.get("has_minutes"),
                        "has_transcript": meeting.get("has_transcript"),
                    },
                }
            )

    return needs_reingest


def main():
    parser = argparse.ArgumentParser(
        description="Check for occurred meetings that need re-ingestion"
    )
    parser.add_argument(
        "--days",
        type=int,
        default=None,
        help="Only check meetings from the last N days",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit the number of meetings to process/display",
    )
    parser.add_argument(
        "--reingest",
        action="store_true",
        help="Actually re-ingest meetings that need it",
    )
    parser.add_argument(
        "--refine", action="store_true", help="Force AI refinement when re-ingesting"
    )
    parser.add_argument(
        "--check-extraction",
        action="store_true",
        help="Flag meetings where PDFs exist but text extraction failed (no .md cache)",
    )
    args = parser.parse_args()

    supabase = get_supabase()

    print("Checking for occurred meetings that may need re-ingestion...")
    if args.days:
        print(f"  (Looking back {args.days} days)")
    print()

    meetings = find_meetings_needing_reingest(supabase, args.days, check_extraction=args.check_extraction)

    if args.limit:
        meetings = meetings[: args.limit]

    if not meetings:
        print("All occurred meetings appear up to date.")
        return

    print(f"Found {len(meetings)} meetings that may need attention:\n")

    for m in meetings:
        print(f"  {m['meeting_date']} - {m['meeting_type']}")
        print(f"    Path: {m['archive_path']}")
        print(f"    Status: {m['status']}")
        print(
            f"    DB:   agenda={m['db']['has_agenda']}, minutes={m['db']['has_minutes']}, transcript={m['db']['has_transcript']}"
        )
        print(
            f"    Disk: agenda={m['disk']['has_agenda']}, minutes={m['disk']['has_minutes']}, transcript={m['disk']['has_transcript']}, refinement={m['disk']['has_refinement']}"
        )
        print(f"    Reasons:")
        for reason in m["reasons"]:
            print(f"      - {reason}")
        print()

    if args.reingest:
        print("\n" + "=" * 60)
        print("Re-ingesting meetings...")
        print("=" * 60 + "\n")

        # Import ingester
        from pipeline.ingestion.ingester import MeetingIngester

        gemini_key = os.getenv("GEMINI_API_KEY")
        ingester = MeetingIngester(SUPABASE_URL, SUPABASE_KEY, gemini_key)

        for m in meetings:
            folder_path = m["archive_path"]
            print(f"\nProcessing: {m['archive_path']}")

            try:
                ingester.process_meeting(
                    folder_path,
                    dry_run=False,
                    force_update=True,
                    force_refine=args.refine,
                )
                print(f"  [OK] Re-ingested successfully")
            except Exception as e:
                print(f"  [ERROR] {e}")
    else:
        print("\nTo re-ingest these meetings, run with --reingest flag:")
        print(f"  uv run {__file__} --reingest")
        print(f"  uv run {__file__} --reingest --refine  # Force AI refinement")
        if not args.check_extraction:
            print(f"  uv run {__file__} --check-extraction  # Also find failed PDF extractions")


if __name__ == "__main__":
    main()
