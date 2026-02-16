import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

# Ensure we can import from src
sys.path.append(os.getcwd())

from src.pipeline.vimeo import VimeoClient
from src.core import utils

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def sync_vimeo_urls(dry_run=True):
    print(f"--- Syncing Vimeo URLs to Supabase (Dry Run: {dry_run}) ---")
    
    # 1. Get all videos from Vimeo
    vimeo = VimeoClient()
    video_map = vimeo.get_video_map()
    
    if not video_map:
        print("No videos found on Vimeo.")
        return

    # 2. Get all meetings from Supabase that missing video_url
    # We fetch all to match by date, even if they have a URL (optional)
    res = supabase.table("meetings").select("id, title, meeting_date, video_url").execute()
    meetings = res.data
    
    if not meetings:
        print("No meetings found in Supabase.")
        return

    updates_count = 0
    for meeting in meetings:
        m_date = meeting["meeting_date"] # YYYY-MM-DD
        m_title = meeting["title"]
        
        # Vimeo video_map uses YYYY-MM-DD as key -> List of videos
        videos_on_date = video_map.get(m_date, [])
        
        if not videos_on_date:
            continue
            
        # Find best match among videos on this date
        best_match = None
        
        # Pre-process meeting title for matching
        m_title_lower = m_title.lower()
        is_ph = "public hearing" in m_title_lower
        is_cn = "council" in m_title_lower and "special" not in m_title_lower
        is_sc = "special" in m_title_lower
        is_cotw = "committee" in m_title_lower or "cotw" in m_title_lower

        # 1. Try Specific Matches
        for video in videos_on_date:
            v_title_lower = video["title"].lower()
            match = False
            
            if is_ph and "public hearing" in v_title_lower:
                match = True
            elif is_cn and "council" in v_title_lower and "special" not in v_title_lower:
                match = True
            elif is_sc and "special" in v_title_lower:
                match = True
            elif is_cotw and ("committee" in v_title_lower or "cotw" in v_title_lower):
                match = True
            
            if match:
                best_match = video
                break
        
        # 2. Fallback: If only 1 video exists, use it (carefully?)
        # Actually, let's only assign if we have a match or if there is strictly 1 meeting and 1 video.
        # But here we are iterating meetings.
        if not best_match and len(videos_on_date) == 1:
             # Risky if we have 2 meetings but only 1 video uploaded yet.
             # But legacy logic did this. Let's stick to matching for safety.
             # best_match = videos_on_date[0]
             pass

        if best_match:
            new_url = best_match["url"]
            current_url = meeting.get("video_url")
            
            if current_url != new_url:
                print(f"Match found for {m_date}: {m_title}")
                print(f"  Current: {current_url}")
                print(f"  New:     {new_url} ({best_match['title']})")
                
                if not dry_run:
                    try:
                        supabase.table("meetings").update({"video_url": new_url}).eq("id", meeting["id"]).execute()
                        print("  [+] Updated successfully.")
                    except Exception as e:
                        print(f"  [!] Update failed: {e}")
                
                updates_count += 1
        else:
            # Optional: try fuzzy matching or searching by title if date fails
            pass

    print(f"\nFinished. Potential updates: {updates_count}")
    if dry_run and updates_count > 0:
        print("Run with --execute to apply changes.")

if __name__ == "__main__":
    dry_run = "--execute" not in sys.argv
    sync_vimeo_urls(dry_run=dry_run)
