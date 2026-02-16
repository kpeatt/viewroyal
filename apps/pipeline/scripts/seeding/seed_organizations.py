import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

# Ensure we can import from src
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
if root_dir not in sys.path:
    sys.path.append(root_dir)

load_dotenv()

def get_supabase_client():
    SUPABASE_URL = os.environ.get("SUPABASE_URL")
    SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY")

    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    return create_client(SUPABASE_URL, SUPABASE_KEY)

supabase = None

# Core Organizations (Bodies that have memberships)
# Committee of the Whole is NOT an org, it's a meeting of the Council.
ORGANIZATIONS = [
    {"name": "Council", "classification": "Council"},
    {"name": "Board of Variance", "classification": "Board"},
    {"name": "Staff", "classification": "Staff"},
    
    # Advisory Committees (Distinct bodies with community members)
    {"name": "Official Community Plan Review Advisory Committee", "classification": "Advisory Committee"},
    {"name": "Capital West Accessibility Advisory Committee", "classification": "Advisory Committee"},
    {"name": "Advisory Planning Commission", "classification": "Advisory Committee"},
    {"name": "Parks, Recreation and Environment Advisory Committee", "classification": "Advisory Committee"},
    {"name": "Community Development Advisory Committee", "classification": "Advisory Committee"},
]

def seed_organizations(dry_run=True):
    global supabase
    if not supabase: supabase = get_supabase_client()
    print(f"--- Seeding Organizations (Dry Run: {dry_run}) ---")
    
    for org in ORGANIZATIONS:
        name = org["name"]
        classification = org["classification"]
        
        # Check if exists
        res = supabase.table("organizations").select("id").eq("name", name).execute()

        data = {
            "name": name,
            "classification": classification
        }

        if res.data:
            print(f"  [-] Organization '{name}' already exists. Updating...")
            if not dry_run:
                supabase.table("organizations").update(data).eq("id", res.data[0]["id"]).execute()
        else:
            if not dry_run:
                print(f"  [+] Creating Organization: {name}")
                supabase.table("organizations").insert(data).execute()
            else:
                print(f"  [Dry Run] Would create Organization: {name}")

    print("\nSeed Complete.")

if __name__ == "__main__":
    dry_run = "--execute" not in sys.argv
    if not get_supabase_client():
        print("Error: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env")
        exit(1)
    seed_organizations(dry_run=dry_run)
