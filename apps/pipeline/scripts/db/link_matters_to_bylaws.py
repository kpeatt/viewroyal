import os
import re
import sys

from dotenv import load_dotenv
from supabase import create_client

# Ensure src can be imported
sys.path.append(
    os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    )
)

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def link_matters_to_bylaws():
    print("--- Linking Matters to Bylaws ---")

    # 1. Fetch all Bylaws (reference data)
    print("[*] Fetching Bylaws...")
    bylaws_resp = supabase.table("bylaws").select("id, bylaw_number, title").execute()
    bylaws = bylaws_resp.data

    # Map bylaw_number -> id for fast lookup
    bylaw_map = {}
    for b in bylaws:
        if b["bylaw_number"]:
            bylaw_map[b["bylaw_number"]] = b["id"]

    print(f"    Loaded {len(bylaws)} bylaws.")

    # 2. Fetch Matters that are likely bylaws but unlinked
    print("[*] Fetching unlinked Matters...")
    # We fetch matters where title or identifier contains 'Bylaw'
    matters_resp = (
        supabase.table("matters")
        .select("id, title, identifier")
        .is_("bylaw_id", "null")
        .execute()
    )

    matters = matters_resp.data
    print(f"    Scanning {len(matters)} unlinked matters...")

    linked_count = 0

    for m in matters:
        bylaw_id = None
        match_reason = None

        def extract_bylaw_num(text):
            if not text:
                return None
            # Prioritize Amendment numbers (e.g. "Amendment Bylaw No. 1101")
            # to prevent incorrect linking to the base bylaw (e.g. Bylaw 900)
            pattern = r"(?:Amendment\s+)?Bylaw\s+(?:No\.?\s*)?(\d+)"
            if "amendment" in text.lower():
                amend_idx = text.lower().find("amendment")
                for match in re.finditer(pattern, text, re.IGNORECASE):
                    if match.start() >= amend_idx:
                        return match.group(1)
            # Fallback to general search
            match = re.search(pattern, text, re.IGNORECASE)
            return match.group(1) if match else None

        # Strategy A: Check Identifier
        num = extract_bylaw_num(m["identifier"])
        if num and num in bylaw_map:
            bylaw_id = bylaw_map[num]
            match_reason = f"Identifier match ({num})"

        # Strategy B: Check Title
        if not bylaw_id:
            num = extract_bylaw_num(m["title"])
            if num and num in bylaw_map:
                bylaw_id = bylaw_map[num]
                match_reason = f"Title match ({num})"

        # Strategy C: Check Agenda Items
        if not bylaw_id:
            try:
                # Fetch recent agenda items for this matter to see if they mention a bylaw number
                items = (
                    supabase.table("agenda_items")
                    .select("title")
                    .eq("matter_id", m["id"])
                    .limit(10)
                    .execute()
                )
                if items.data:
                    for item in items.data:
                        num = extract_bylaw_num(item["title"])
                        if num:
                            if num in bylaw_map:
                                bylaw_id = bylaw_map[num]
                                match_reason = f"Agenda Item match ({num})"
                                break
            except Exception as e:
                print(f"    [!] Error fetching items for matter {m['id']}: {e}")

        # Perform Update
        if bylaw_id:
            print(
                f"    [MATCH] Matter '{m['title']}' -> Bylaw ID {bylaw_id} ({match_reason})"
            )
            supabase.table("matters").update({"bylaw_id": bylaw_id}).eq(
                "id", m["id"]
            ).execute()
            linked_count += 1

    print(f"\n[SUCCESS] Linked {linked_count} matters to bylaws.")


if __name__ == "__main__":
    link_matters_to_bylaws()
