import argparse
import os
import sys
from datetime import datetime

from dotenv import load_dotenv
from google import genai

# Ensure we can import from src if needed (mostly for shared config/env)
sys.path.append(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("Error: GEMINI_API_KEY not found in environment.")
    sys.exit(1)

client = genai.Client(api_key=GEMINI_API_KEY)


def list_jobs(show_all=False):
    print("Fetching batch jobs...")
    try:
        # Note: The SDK might implement iteration or a list method. 
        # Common pattern is client.batches.list()
        # We will iterate and filter.
        
        jobs = client.batches.list()
        
        count = 0
        active_count = 0
        
        print(f"{'ID':<40} | {'Status':<20} | {'Created':<25} | {'Display Name'}")
        print("-" * 110)
        
        for job in jobs:
            is_active = job.state in ["JOB_STATE_PENDING", "JOB_STATE_RUNNING", "JOB_STATE_PROCESSING"]
            
            if show_all or is_active:
                created_time = "Unknown"
                if hasattr(job, "create_time"):
                    # Depending on SDK version, might be a datetime or string
                    created_time = str(job.create_time)
                
                display_name = ""
                if hasattr(job, "config") and job.config and hasattr(job.config, "display_name"):
                    display_name = job.config.display_name
                
                print(f"{job.name.split('/')[-1]:<40} | {job.state:<20} | {created_time:<25} | {display_name}")
                count += 1
                if is_active:
                    active_count += 1
                    
        print("-" * 110)
        print(f"Total shown: {count}. Active/Pending: {active_count}")
        return active_count

    except Exception as e:
        print(f"Error listing jobs: {e}")
        return 0


def cancel_job(job_id):
    full_name = job_id
    # If user provided just the ID (e.g. '1234...'), we might need to find the full resource name
    # But usually the SDK takes the resource name. Let's try to assume they might pass just the ID.
    # The SDK 'get' usually requires the full name projects/.../locations/.../batches/...
    # But let's try to see if we can resolve it or if the SDK handles it.
    
    # Actually, simpler to just list, find the match, and use that name.
    # For now, we'll try to use the name as provided, or search if it looks short.
    
    target_name = job_id
    if not job_id.startswith("projects/"):
        # Try to find it in the list
        print(f"Searching for job ending in {job_id}...")
        jobs = client.batches.list()
        found = False
        for job in jobs:
            if job.name.endswith(job_id):
                target_name = job.name
                found = True
                break
        if not found:
            print(f"Could not find job matching ID: {job_id}")
            return

    print(f"Cancelling job: {target_name}...")
    try:
        client.batches.cancel(name=target_name)
        print("Cancellation request sent.")
    except Exception as e:
        print(f"Error cancelling job: {e}")


def cancel_all_active():
    print("Fetching active jobs to cancel...")
    jobs = client.batches.list()
    active_jobs = []
    for job in jobs:
        if job.state in ["JOB_STATE_PENDING", "JOB_STATE_RUNNING", "JOB_STATE_PROCESSING"]:
            active_jobs.append(job)
            
    if not active_jobs:
        print("No active jobs found.")
        return

    print(f"Found {len(active_jobs)} active jobs.")
    confirm = input("Are you sure you want to CANCEL ALL of them? (y/N): ")
    if confirm.lower() != 'y':
        print("Aborted.")
        return

    for job in active_jobs:
        print(f"Cancelling {job.name}...")
        try:
            client.batches.cancel(name=job.name)
        except Exception as e:
            print(f"  Error: {e}")
    print("Done.")


def main():
    parser = argparse.ArgumentParser(description="Manage Gemini Batch Jobs")
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_p = subparsers.add_parser("list", help="List jobs")
    list_p.add_argument("--all", action="store_true", help="Show all jobs (including completed/failed)")

    cancel_p = subparsers.add_parser("cancel", help="Cancel a specific job")
    cancel_p.add_argument("job_id", help="Job ID or Resource Name")

    cancel_all_p = subparsers.add_parser("cancel-all", help="Cancel ALL active jobs")

    args = parser.parse_args()

    if args.command == "list":
        list_jobs(show_all=args.all)
    elif args.command == "cancel":
        cancel_job(args.job_id)
    elif args.command == "cancel-all":
        cancel_all_active()


if __name__ == "__main__":
    main()
