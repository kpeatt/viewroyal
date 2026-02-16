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

# Organizations
# Instead of hardcoded ID, we look up by name
def get_staff_org_id():
    global supabase
    if not supabase: supabase = get_supabase_client()
    res = supabase.table("organizations").select("id").eq("name", "Staff").execute()
    if res.data:
        return res.data[0]["id"]
    
    # Create if missing
    print("Creating 'Staff' organization...")
    res = supabase.table("organizations").insert({"name": "Staff", "classification": "Staff"}).execute()
    return res.data[0]["id"]

# Current Staff Data (from CivicInfo BC)
STAFF_DATA = [
    {"name": "Scott M. Sommerville", "role": "Chief Administrative Officer"},
    {"name": "Elena Bolster", "role": "Director of Corporate Administration"},
    {"name": "Jennifer Cochrane", "role": "Deputy Director of Corporate Administration"},
    {"name": "Steven Vella", "role": "Director of Finance"},
    {"name": "Joel Adams", "role": "Deputy Director of Finance"},
    {"name": "Leanne Taylor", "role": "Director of Development Services"},
    {"name": "Paul Hurst", "role": "Director of Protective Services"},
    {"name": "Kelsea Korki", "role": "Communications & Engagement Coordinator"},
    {"name": "Ivan Leung", "role": "Director of Engineering"},
    {"name": "Ben Lubberts", "role": "Deputy Director of Engineering"},
    {"name": "Sydney Murphy", "role": "Executive Assistant"},
    {"name": "Dave Podmoroff", "role": "Parks Supervisor"},
]

def get_or_create_person(full_name, dry_run=True):
    global supabase
    if not supabase: supabase = get_supabase_client()
    # Try exact match first
    res = supabase.table("people").select("id, name").ilike("name", full_name).execute()
    if res.data:
        return res.data[0]["id"], res.data[0]["name"]

    # Try partial match (last name only if unique)
    last_name = full_name.split()[-1]
    res = supabase.table("people").select("id, name").ilike("name", last_name).execute()
    if res.data and len(res.data) == 1:
        print(f"  [?] Auto-matched '{full_name}' to existing record '{res.data[0]['name']}'")
        return res.data[0]["id"], res.data[0]["name"]

    if dry_run:
        print(f"  [Dry Run] Would create person: {full_name}")
        return 9999, full_name
    
    print(f"  [+] Creating person: {full_name}")
    res = supabase.table("people").insert({"name": full_name}).execute()
    return res.data[0]["id"], res.data[0]["name"]

def import_staff(dry_run=True):
    global supabase
    if not supabase: supabase = get_supabase_client()
    print(f"--- Syncing Staff Memberships (Dry Run: {dry_run}) ---")
    
    staff_org_id = get_staff_org_id()
    
    for member in STAFF_DATA:
        print(f"\nProcessing {member['name']} ({member['role']})...")
        person_id, db_name = get_or_create_person(member["name"], dry_run)
        
        # Check if membership exists
        res = (
            supabase.table("memberships")
            .select("id")
            .eq("person_id", person_id)
            .eq("organization_id", staff_org_id)
            .execute()
        )
        
        if res.data:
            print(f"  [-] Membership for {db_name} already exists in Staff.")
            if not dry_run:
                # Update role
                supabase.table("memberships").update({
                    "role": member["role"]
                }).eq("id", res.data[0]["id"]).execute()
        else:
            if not dry_run:
                print(f"  [+] Adding membership: {db_name} as {member['role']}")
                supabase.table("memberships").insert({
                    "person_id": person_id,
                    "organization_id": staff_org_id,
                    "role": member["role"]
                }).execute()
            else:
                print(f"  [Dry Run] Would add membership: {member['name']} as {member['role']}")

    print("\nSync Complete.")

if __name__ == "__main__":
    dry_run = "--execute" not in sys.argv
    if not get_supabase_client():
        print("Error: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env")
        exit(1)
    import_staff(dry_run=dry_run)
