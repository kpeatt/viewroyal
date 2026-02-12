import os
import sys
import argparse
from supabase import create_client
from dotenv import load_dotenv

# Ensure we can import from src
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if root_dir not in sys.path:
    sys.path.append(root_dir)

load_dotenv()

def main():
    parser = argparse.ArgumentParser(description="Check vote counts and split votes for a meeting.")
    parser.add_argument("query", help="Meeting ID or date (YYYY-MM-DD)")
    parser.add_argument("--detail", action="store_true", help="Show individual voter breakdown for split votes.")
    
    args = parser.parse_args()
    
    supabase = create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SECRET_KEY"))

    # 1. Resolve Meeting
    if args.query.isdigit():
        meeting_id = int(args.query)
    else:
        res = supabase.table("meetings").select("id, title").eq("meeting_date", args.query).execute()
        if not res.data:
            print(f"No meeting found on {args.query}")
            return
        if len(res.data) > 1:
            print(f"Multiple meetings found on {args.query}:")
            for m in res.data:
                print(f"  ID: {m['id']} - {m['title']}")
            return
        meeting_id = res.data[0]["id"]

    print(f"--- Checking Votes for Meeting ID: {meeting_id} ---")

    # 2. Get motions and vote counts
    motions = supabase.table("motions").select(
        "id, text_content, result, yes_votes, no_votes, abstain_votes"
    ).eq("meeting_id", meeting_id).execute()

    if not motions.data:
        print("No motions found for this meeting.")
        return

    for m in motions.data:
        is_split = m['no_votes'] > 0 or m['abstain_votes'] > 0
        status = " [SPLIT VOTE]" if is_split else ""
        
        print(f"\n[Motion {m['id']}] Result: {m['result']}{status}")
        print(f"  Text: {m['text_content'][:150]}...")
        print(f"  Summary: Yes={m['yes_votes']}, No={m['no_votes']}, Abs={m['abstain_votes']}")
        
        if (is_split or args.detail):
            # Fetch individual records
            v_res = supabase.table("votes").select("vote, people(name)").eq("motion_id", m['id']).execute()
            if v_res.data:
                print("  Breakdown:")
                for v in v_res.data:
                    name = v['people']['name'] if v.get('people') else "Unknown"
                    print(f"    - {name:<20}: {v['vote']}")

if __name__ == "__main__":
    main()
