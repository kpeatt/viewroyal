import os
import sys
import json
import shutil
from collections import defaultdict
from pathlib import Path

# Ensure we can import from src
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
if root_dir not in sys.path:
    sys.path.append(root_dir)

from src.core.paths import ARCHIVE_ROOT

def get_vimeo_url(folder_path):
    url_file = os.path.join(folder_path, "vimeo_url.txt")
    if os.path.exists(url_file):
        with open(url_file, "r") as f:
            return f.read().strip()
    return None

def get_canonical_priority(folder_name):
    fn = folder_name.lower()
    if 'special council' in fn: return 100
    if 'council meeting' in fn: return 90
    if 'committee of the whole' in fn: return 80
    if 'public hearing' in fn: return 70
    return 50

def main():
    print("--- Canonicalizing Archive Media ---")
    
    # 1. Group by (Date, VimeoURL)
    media_groups = defaultdict(list)
    
    for root, dirs, files in os.walk(ARCHIVE_ROOT):
        # We only care about meeting folders
        if any(d in dirs for d in ['Agenda', 'Minutes', 'Audio', 'Video']):
            v_url = get_vimeo_url(root)
            if not v_url: continue
            
            folder_name = os.path.basename(root)
            date_str = folder_name[:10]
            
            media_groups[(date_str, v_url)].append(root)

    processed_count = 0
    for (date, url), paths in media_groups.items():
        if len(paths) <= 1: continue
        
        print(f"\n[Group] {date} | {url}")
        
        # Sort by priority
        paths.sort(key=lambda p: get_canonical_priority(os.path.basename(p)), reverse=True)
        canonical_path = paths[0]
        redundant_paths = paths[1:]
        
        print(f"  Canonical: {canonical_path}")
        
        for red in redundant_paths:
            print(f"  Redundant: {red}")
            
            # 1. Move any media from redundant to canonical if missing
            for sub in ['Audio', 'Video', 'Transcript']:
                s_sub = os.path.join(red, sub)
                t_sub = os.path.join(canonical_path, sub)
                
                if os.path.exists(s_sub):
                    if not os.path.exists(t_sub):
                        print(f"    Moving {sub} to canonical...")
                        shutil.move(s_sub, t_sub)
                    else:
                        # If both exist, we keep canonical's, but delete redundant's
                        print(f"    Removing redundant {sub} folder...")
                        shutil.rmtree(s_sub)
            
            # 2. Create the pointer file
            pointer = {
                "canonical_folder": os.path.relpath(canonical_path, red),
                "vimeo_url": url,
                "note": "Media is shared with the canonical folder linked above."
            }
            with open(os.path.join(red, "shared_media.json"), "w") as f:
                json.dump(pointer, f, indent=2)
            print(f"    Created shared_media.json pointer.")
            
        processed_count += 1

    print(f"\nProcessed {processed_count} shared media groups.")

if __name__ == "__main__":
    main()
