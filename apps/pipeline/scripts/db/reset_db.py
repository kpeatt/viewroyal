import os
import sys
import argparse

# Ensure we can import from src
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
if root_dir not in sys.path:
    sys.path.append(root_dir)

from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def reset_database(keep_people=False):
    if keep_people:
        print("WARNING: This will delete all MEETINGS and related data, but PRESERVE people/orgs.")
    else:
        print("WARNING: This will delete ALL data from the database (including people).")
    
    confirm = input("Are you sure? Type 'DELETE' to confirm: ")
    
    if confirm != "DELETE":
        print("Aborted.")
        return

    # Delete in order of dependency (children first, then parents)
    tables = [
        "transcript_segments",
        "votes",
        "motions",
        "meeting_events",
        "agenda_item_topics",
        "agenda_items",
        "meeting_speaker_aliases",
        "attendance",
        "matters",
        "meetings",
        "topics",
        "candidacies",
        "election_offices",
        "elections",
        "memberships",
        "people",
        "organizations"
    ]

    if keep_people:
        # Remove people-related tables from the delete list
        tables.remove("memberships")
        tables.remove("people")
        tables.remove("organizations")
        if "topics" in tables: tables.remove("topics")

    for table in tables:
        print(f"Truncating {table}...")
        try:
            # Supabase-py doesn't have a truncate() method exposed easily for all roles
            # but delete().neq("id", 0) works as a "delete all"
            supabase.table(table).delete().neq("id", 0).execute()
        except Exception as e:
            print(f"Error truncating {table}: {e}")

    print("Database reset complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep-people", action="store_true", help="Preserve People, Organizations, and Memberships tables")
    args = parser.parse_args()
    
    reset_database(keep_people=args.keep_people)
