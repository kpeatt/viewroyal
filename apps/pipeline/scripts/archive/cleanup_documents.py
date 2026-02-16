import os
import json
import shutil
import hashlib
from pathlib import Path

def get_file_hash(path):
    hasher = hashlib.md5()
    try:
        with open(path, 'rb') as f:
            buf = f.read()
            hasher.update(buf)
        return hasher.hexdigest()
    except Exception as e:
        print(f"Error hashing {path}: {e}")
        return None

def main():
    results_file = "document_audit_results.json"
    if not os.path.exists(results_file):
        print(f"Error: {results_file} not found.")
        return

    with open(results_file, "r") as f:
        all_files = json.load(f)

    actions = []

    # Filter out "Unknown" or "Empty"
    valid_files = [f for f in all_files if f['content_type'] not in ["Unknown", "Empty"]]
    
    print(f"Analyzing {len(valid_files)} valid documents...")

    for f in valid_files:
        current_category = f['folder_category']
        content_type = f['content_type']
        
        # Determine Correct Category
        if content_type in ["Council", "Special Council"]:
            correct_category = "Council"
        elif content_type == "Committee of the Whole":
            correct_category = "Committee of the Whole"
        elif content_type == "Public Hearing":
            correct_category = "Public Hearing"
        else:
            continue # Should not happen based on audit logic
            
        # Is it misplaced?
        if current_category == correct_category:
            continue # It's in the right place!
            
        # It is misplaced.
        
        current_path = Path(f['path'])
        parts = current_path.parts
        if len(parts) < 7: continue
        
        year = parts[2]
        month = parts[3]
        meeting_folder = parts[4]
        doc_type = parts[5]
        filename = parts[6]
        
        # Determine Target Base
        target_base = Path("viewroyal_archive") / correct_category / year / month
        
        # Try to find a matching meeting folder in target
        target_meeting_path = None
        date_prefix = meeting_folder[:10] # YYYY-MM-DD
        
        if target_base.exists():
            for d in os.listdir(target_base):
                if d.startswith(date_prefix):
                    target_meeting_path = target_base / d
                    break
        
        if target_meeting_path:
            # Target meeting folder exists
            target_file = target_meeting_path / doc_type / filename
            
            if target_file.exists():
                # File exists. Check hash.
                if get_file_hash(f['path']) == get_file_hash(target_file):
                    actions.append({
                        "action": "DELETE",
                        "path": f['path'],
                        "reason": f"Redundant: Identical copy exists in correct folder {target_file}"
                    })
                else:
                    print(f"[CONFLICT] {f['path']} content differs from {target_file}. Skipping.")
            else:
                # File does not exist in target. MOVE it.
                actions.append({
                    "action": "MOVE",
                    "source": f['path'],
                    "dest": str(target_file),
                    "reason": f"Misplaced: Moving {filename} from {current_category} to {correct_category}"
                })
        else:
            # Target meeting folder does NOT exist.
            # Create it.
            # Use the date and the CONTENT TYPE as name (more specific than category if possible)
            # e.g. "2024-06-11 Special Council" inside "Council" category
            
            # If content_type is "Council", use "Council Meeting" to match convention
            title_suffix = content_type
            if content_type == "Council": title_suffix = "Council Meeting"
            
            new_folder_name = f"{date_prefix} {title_suffix}"
            new_meeting_path = target_base / new_folder_name
            target_file = new_meeting_path / doc_type / filename
            
            actions.append({
                "action": "MOVE_AND_CREATE",
                "source": f['path'],
                "dest": str(target_file),
                "reason": f"Misplaced & Missing Folder: Creating {new_meeting_path} and moving file"
            })

    if not actions:
        print("No actions proposed.")
        return

    print(f"\nProposed Actions ({len(actions)}):")
    for a in actions:
        if a['action'] == "DELETE":
            print(f"  [DELETE] {a['path']}")
            print(f"    -> {a['reason']}")
        elif a['action'] == "MOVE":
            print(f"  [MOVE]   {a['source']} -> {a['dest']}")
            print(f"    -> {a['reason']}")
        elif a['action'] == "MOVE_AND_CREATE":
            print(f"  [CREATE] {a['source']} -> {a['dest']}")
            print(f"    -> {a['reason']}")

    confirm = input("\nExecute actions? (y/N): ")
    if confirm.lower() == 'y':
        for a in actions:
            try:
                if a['action'] == "DELETE":
                    os.remove(a['path'])
                    print(f"Deleted {a['path']}")
                    # Check if parent folder is empty
                    parent = os.path.dirname(a['path'])
                    if not os.listdir(parent):
                        os.rmdir(parent)
                        print(f"  Removed empty folder: {parent}")
                
                elif a['action'] in ["MOVE", "MOVE_AND_CREATE"]:
                    dest_dir = os.path.dirname(a['dest'])
                    os.makedirs(dest_dir, exist_ok=True)
                    shutil.move(a['source'], a['dest'])
                    print(f"Moved to {a['dest']}")
                    
                    # Check if source folder is empty
                    source_dir = os.path.dirname(a['source'])
                    if not os.listdir(source_dir):
                        os.rmdir(source_dir)
                        print(f"  Removed empty source folder: {source_dir}")
                        
            except Exception as e:
                print(f"Error executing {a['action']} on {a.get('path') or a.get('source')}: {e}")
    else:
        print("Aborted.")

if __name__ == "__main__":
    main()