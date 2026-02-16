import argparse
import json
import os
import sys

from dotenv import load_dotenv

# Ensure we can import from src when running as a script
sys.path.append(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

from src.core.paths import ARCHIVE_ROOT
from src.maintenance.db.link_matters_to_bylaws import link_matters_to_bylaws
from src.maintenance.db.update_matter_status import update_matter_statuses
from src.pipeline.ingest_bylaws import ingest_bylaws
from src.pipeline.ingester import MeetingIngester
from src.pipeline.process_bylaws_intelligence import process_bylaws

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_KEY) must be set in .env")
    exit(1)


def main():
    parser = argparse.ArgumentParser(description="Ingest meeting data into Supabase")
    parser.add_argument("target", nargs="?", help="Specific meeting folder to process")
    parser.add_argument(
        "--update",
        action="store_true",
        help="Re-process even if meeting already exists in DB",
    )
    parser.add_argument(
        "--refine",
        action="store_true",
        help="Force AI to re-run refinement (ignores local refinement.json)",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Don't write to database"
    )
    parser.add_argument(
        "--from-local",
        action="store_true",
        help="Re-ingest from local refinement.json files only",
    )
    parser.add_argument(
        "--provider",
        type=str,
        default="gemini",
        choices=["gemini", "local"],
        help="AI provider to use for refinement",
    )
    parser.add_argument(
        "--bylaws", action="store_true", help="Ingest and process bylaws"
    )
    parser.add_argument(
        "--maintenance",
        action="store_true",
        help="Run DB maintenance tasks (Link matters, update statuses)",
    )
    parser.add_argument(
        "--recheck-occurred",
        action="store_true",
        help="Find and re-ingest occurred meetings with missing/new documents",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=None,
        help="Only check meetings from the last N days (used with --recheck-occurred)",
    )

    args = parser.parse_args()

    if args.bylaws:
        print("\n--- Processing Bylaws ---")
        ingest_bylaws(force_update=args.update)
        process_bylaws(force=args.update)
        print("--- Bylaw Processing Complete ---\n")

    ingester = MeetingIngester(SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY)

    if args.recheck_occurred:
        from src.maintenance.audit.check_occurred_meetings import (
            find_meetings_needing_reingest,
            get_supabase,
        )

        print("\n--- Checking Occurred Meetings for Missing Documents ---")
        supabase = get_supabase()
        meetings = find_meetings_needing_reingest(supabase, args.days)

        if not meetings:
            print("All occurred meetings appear up to date.")
        else:
            print(f"Found {len(meetings)} meetings that need re-ingestion:\n")
            for m in meetings:
                print(f"  {m['meeting_date']} - {m['meeting_type']}")
                for reason in m["reasons"]:
                    print(f"    - {reason}")

            print(f"\nRe-ingesting {len(meetings)} meetings...")
            for m in meetings:
                folder_path = os.path.join(ARCHIVE_ROOT, m["archive_path"])
                print(f"\nProcessing: {m['archive_path']}")
                try:
                    ingester.process_meeting(
                        folder_path,
                        dry_run=args.dry_run,
                        force_update=True,
                        force_refine=args.refine,
                        ai_provider=args.provider,
                    )
                except Exception as e:
                    print(f"  [ERROR] {e}")

        print("--- Recheck Complete ---\n")
        return

    if args.from_local:
        if args.target and os.path.isdir(args.target):
            # Target specific folder
            search_root = args.target
        else:
            search_root = ARCHIVE_ROOT

        print(f"Searching for refinement.json files in {search_root}...")
        import glob

        files = glob.glob(
            os.path.join(search_root, "**", "refinement.json"), recursive=True
        )
        print(f"Found {len(files)} local refinement files.")

        for file_path in files:
            folder_path = os.path.dirname(file_path)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                ingester.process_meeting(
                    folder_path,
                    dry_run=args.dry_run,
                    force_update=True,
                    precomputed_refinement=data,
                    ai_provider=args.provider,
                )
            except Exception as e:
                print(f"Error processing {folder_path}: {e}")
        return

    if args.target:
        if os.path.isdir(args.target):
            ingester.process_meeting(
                args.target,
                dry_run=args.dry_run,
                force_update=args.update,
                force_refine=args.refine,
                ai_provider=args.provider,
            )
        else:
            print(f"Error: {args.target} is not a directory.")
    else:
        for root, dirs, files in os.walk(ARCHIVE_ROOT):
            if "Agenda" in dirs or "Audio" in dirs:
                ingester.process_meeting(
                    root,
                    dry_run=args.dry_run,
                    force_update=args.update,
                    force_refine=args.refine,
                    ai_provider=args.provider,
                )

    if args.maintenance:
        print("\n--- Running Maintenance Tasks ---")
        link_matters_to_bylaws()
        update_matter_statuses()
        print("--- Maintenance Complete ---")


if __name__ == "__main__":
    main()
