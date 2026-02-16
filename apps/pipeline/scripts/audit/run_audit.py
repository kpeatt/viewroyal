import argparse
import sys
import os

# Ensure we can import from src
# Path is: src/maintenance/audit/run_audit.py -> root is 3 levels up from audit/ folder, or 4 levels from __file__
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
if root_dir not in sys.path:
    sys.path.append(root_dir)

from src.maintenance.audit.audit_against_source import run_source_audit
from src.maintenance.audit.audit_transcripts import run_transcript_audit
from src.maintenance.audit.audit_vimeo_coverage import run_vimeo_audit
from src.maintenance.audit.audit_diarization_quality import run_quality_audit
from src.maintenance.audit.find_duplicate_meetings_by_date import run_meeting_duplicate_audit
from src.maintenance.audit.find_duplicates import find_duplicates
from src.core.paths import get_report_path
import json

def run_people_audit():
    print("--- People Duplicate Audit ---")
    dupes = find_duplicates()
    if not dupes:
        print("No obvious duplicates found.")
    else:
        print(f"Found {len(dupes)} potential duplicate sets.")
        output_file = get_report_path("duplicate_candidates.json")
        with open(output_file, "w") as f:
            json.dump(dupes, f, indent=2)
        print(f"Results saved to {output_file}")

def main():
    parser = argparse.ArgumentParser(description="View Royal Council Intelligence Platform - Audit Suite")
    parser.add_argument("--source", action="store_true", help="Run deep remote source audit (slow)")
    parser.add_argument("--transcripts", action="store_true", help="Run missing transcripts audit")
    parser.add_argument("--quality", action="store_true", help="Run diarization quality audit")
    parser.add_argument("--meetings", action="store_true", help="Run meeting duplicate audit (DB)")
    parser.add_argument("--vimeo", action="store_true", help="Run Vimeo video mapping audit")
    parser.add_argument("--link-vimeo", action="store_true", help="Match and save vimeo_url.txt files")
    parser.add_argument("--people", action="store_true", help="Run duplicate person detection")
    parser.add_argument("--all", action="store_true", help="Run all audits")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose output")

    args = parser.parse_args()

    if args.all or args.source:
        run_source_audit()
        print("\n" + "="*50 + "\n")

    if args.all or args.transcripts:
        run_transcript_audit(verbose=args.verbose)
        print("\n" + "="*50 + "\n")

    if args.all or args.quality:
        run_quality_audit()
        print("\n" + "="*50 + "\n")

    if args.all or args.meetings:
        run_meeting_duplicate_audit()
        print("\n" + "="*50 + "\n")

    if args.all or args.vimeo or args.link_vimeo:
        run_vimeo_audit(link=args.link_vimeo)
        print("\n" + "="*50 + "\n")

    if args.all or args.people:
        run_people_audit()

    if not any([args.all, args.source, args.transcripts, args.quality, args.meetings, args.vimeo, args.link_vimeo, args.people]):
        parser.print_help()

if __name__ == "__main__":
    main()
