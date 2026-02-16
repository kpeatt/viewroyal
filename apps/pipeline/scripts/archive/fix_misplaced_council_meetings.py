import os
import shutil
import sys
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE credentials not found.")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Mapping of Bad Path -> Good Path
# Bad paths are relative to repo root or archive root?
# DB stores "viewroyal_archive/..."
FIXES = [
    {
        "bad": "viewroyal_archive/Public Hearing/2022/05/2022-05-17 Council Meeting",
        "good": "viewroyal_archive/Council/2022/05/2022-05-17 Council Meeting"
    },
    {
        "bad": "viewroyal_archive/Public Hearing/2022/06/2022-06-07 Council Meeting",
        "good": "viewroyal_archive/Council/2022/06/2022-06-07 Council Meeting"
    },
    {
        "bad": "viewroyal_archive/Public Hearing/2023/11/2023-11-07 Council Meeting",
        "good": "viewroyal_archive/Council/2023/11/2023-11-07 Council Meeting"
    },
    {
        "bad": "viewroyal_archive/Public Hearing/2025/11/2025-11-04 Council Meeting",
        "good": "viewroyal_archive/Council/2025/11/2025-11-04 Council Meeting"
    }
]

def fix_paths():
    print("Fixing misplaced Council meetings...")
    
    for fix in FIXES:
        bad_path = fix["bad"]
        good_path = fix["good"]
        
        print(f"\nProcessing: {os.path.basename(bad_path)}")
        
        # 1. Update Database
        res = supabase.table("meetings").select("id").eq("archive_path", bad_path).execute()
        if res.data:
            meeting_id = res.data[0]["id"]
            print(f"  Found DB record ID {meeting_id}. Updating path...")
            
            # Check if target path already exists in DB (collision)
            check = supabase.table("meetings").select("id").eq("archive_path", good_path).execute()
            if check.data:
                print(f"  [!] Warning: Target path already exists in DB (ID {check.data[0]['id']}). Keeping existing, deleting duplicate record.")
                # Delete the duplicate (bad path)
                supabase.table("meetings").delete().eq("id", meeting_id).execute()
            else:
                # Update the path
                supabase.table("meetings").update({"archive_path": good_path}).eq("id", meeting_id).execute()
                print("  DB Updated.")
        else:
            print("  No DB record found for bad path.")

        # 2. Delete Folder
        if os.path.exists(bad_path):
            print(f"  Deleting folder: {bad_path}")
            shutil.rmtree(bad_path)
        else:
            print("  Folder already gone.")

if __name__ == "__main__":
    fix_paths()
