import os
import sys
import json
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Ensure we can import from src
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
if root_dir not in sys.path:
    sys.path.append(root_dir)

from src.core.paths import ELECTION_HISTORY_JSON

def get_supabase_client():
    SUPABASE_URL = os.environ.get("SUPABASE_URL")
    SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY")

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env")
        return None
    return create_client(SUPABASE_URL, SUPABASE_KEY)

# Global for convenience in script mode, but safer for library import
supabase = None
if __name__ == "__main__":
    supabase = get_supabase_client()
    if not supabase: exit(1)
else:
    # Try to initialize if possible, but don't crash
    try:
        supabase = get_supabase_client()
    except:
        pass

# BC Election Dates (Approximate or known)
ELECTION_DATES = {
    2022: "2022-10-15",
    2018: "2018-10-20",
    2017: "2017-11-18", # By-election
    2014: "2014-11-15",
    2011: "2011-11-19",
    2008: "2008-11-15",
    2005: "2005-11-19",
}

def normalize_name(raw_name):
    """Converts 'LastName, FirstName' to 'FirstName LastName'."""
    if ',' in raw_name:
        last, first = raw_name.split(',', 1)
        return f"{first.strip()} {last.strip()}"
    return raw_name.strip()

def get_council_org_id():
    global supabase
    if not supabase: supabase = get_supabase_client()
    res = supabase.table("organizations").select("id").eq("name", "Council").execute()
    if res.data:
        return res.data[0]["id"]
    print("Creating 'Council' organization...")
    res = supabase.table("organizations").insert({"name": "Council", "classification": "Council"}).execute()
    return res.data[0]["id"]

def get_or_create_person(full_name, dry_run=True):
    global supabase
    if not supabase: supabase = get_supabase_client()
    res = supabase.table("people").select("id, name").ilike("name", full_name).execute()
    if res.data:
        return res.data[0]
    if dry_run:
        return {"id": 9999, "name": full_name}
    res = supabase.table("people").insert({"name": full_name}).execute()
    return res.data[0]

def get_or_create_election(year, e_type, term_length, notes, source_id, dry_run=True):
    global supabase
    if not supabase: supabase = get_supabase_client()
    name = f"{year} {e_type} Local Election"
    res = supabase.table("elections").select("id").eq("name", name).execute()
    if res.data:
        return res.data[0]["id"]
    
    election_date = ELECTION_DATES.get(year, f"{year}-10-15")
    
    if dry_run:
        print(f"  [Dry Run] Would create election: {name}")
        return 8888
        
    print(f"  [+] Creating election: {name}")
    res = supabase.table("elections").insert({
        "name": name,
        "election_date": election_date,
        "classification": e_type,
        "term_length_years": term_length,
        "notes": notes,
        "source_id": source_id
    }).execute()
    return res.data[0]["id"]

def get_or_create_office(election_id, office_name, seats, dry_run=True):
    global supabase
    if not supabase: supabase = get_supabase_client()
    res = (
        supabase.table("election_offices")
        .select("id")
        .eq("election_id", election_id)
        .eq("office", office_name)
        .execute()
    )
    if res.data:
        return res.data[0]["id"]
    
    if dry_run:
        print(f"    [Dry Run] Would create office: {office_name} ({seats} seats)")
        return 7777
        
    print(f"    [+] Creating office: {office_name} ({seats} seats)")
    res = supabase.table("election_offices").insert({
        "election_id": election_id,
        "office": office_name,
        "seats_available": seats
    }).execute()
    return res.data[0]["id"]

def import_history(file_path, dry_run=True):
    global supabase
    if not supabase: supabase = get_supabase_client()
    print(f"--- Importing Election History (Dry Run: {dry_run}) ---")
    
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    source_id = data.get("id")
    council_org_id = get_council_org_id()
    elections_data = sorted(data["elections"], key=lambda x: x["year"])
    
    for e_info in elections_data:
        year = e_info["year"]
        e_type = e_info["type"]
        term_length = e_info["term_length_years"]
        notes = e_info.get("notes")
        
        election_id = get_or_create_election(year, e_type, term_length, notes, source_id, dry_run)
        
        # Membership timing
        if e_type == "General":
            start_date = f"{year}-11-01" if year >= 2018 else f"{year}-12-01"
            end_date = f"{year + term_length}-10-31" if year >= 2014 else f"{year + term_length}-11-30"
        else:
            start_date = f"{year}-11-01" # Approximation
            end_date = None
            
        print(f"\nProcessing {year} {e_type} Candidates...")
        
        for office_info in e_info["offices"]:
            position = office_info["position"]
            seats = office_info["seats_available"]
            
            office_id = get_or_create_office(election_id, position, seats, dry_run)
            
            for candidate in office_info["candidates"]:
                full_name = normalize_name(candidate["name"])
                is_elected = candidate.get("elected", False)
                votes = candidate.get("votes", 0)
                acclaimed = candidate.get("acclaimed", False)
                
                person = get_or_create_person(full_name, dry_run)
                person_id = person["id"]
                
                # 1. Upsert Candidacy
                res = (
                    supabase.table("candidacies")
                    .select("id")
                    .eq("election_office_id", office_id)
                    .eq("person_id", person_id)
                    .execute()
                )
                
                if not res.data:
                    if not dry_run:
                        supabase.table("candidacies").insert({
                            "election_office_id": office_id,
                            "person_id": person_id,
                            "is_elected": is_elected,
                            "is_acclaimed": acclaimed,
                            "votes_received": votes
                        }).execute()
                    else:
                        print(f"      [Dry Run] Candidate: {full_name} ({votes} votes, elected={is_elected})")
                
                # 2. Update Person status
                if is_elected and not dry_run:
                    supabase.table("people").update({"is_councillor": True}).eq("id", person_id).execute()
                
                # 3. Create Membership for elected officials
                if is_elected:
                    res = (
                        supabase.table("memberships")
                        .select("id")
                        .eq("person_id", person_id)
                        .eq("organization_id", council_org_id)
                        .eq("start_date", start_date)
                        .execute()
                    )
                    
                    if res.data:
                        print(f"      [-] Membership for {full_name} already exists for this term.")
                    else:
                        if not dry_run:
                            print(f"      [+] Adding membership: {full_name} as {position}")
                            supabase.table("memberships").insert({
                                "person_id": person_id,
                                "organization_id": council_org_id,
                                "role": position,
                                "start_date": start_date,
                                "end_date": end_date,
                                "meta": {"election_year": year}
                            }).execute()
                        else:
                            print(f"      [Dry Run] Membership: {full_name} as {position}")

    print("\nImport Complete.")

from src.core.paths import ELECTION_HISTORY_JSON

if __name__ == "__main__":
    file_path = ELECTION_HISTORY_JSON
    dry_run = "--execute" not in sys.argv
    import_history(file_path, dry_run=dry_run)