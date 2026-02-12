import os
import json
import glob
import sys
from collections import Counter
from typing import Dict, List, Tuple

# Ensure we can import from src
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
if root_dir not in sys.path:
    sys.path.append(root_dir)

GLOSSARY_PATH = os.path.join(root_dir, "data", "transcript_corrections.json")

def load_glossary() -> Dict[str, str]:
    try:
        with open(GLOSSARY_PATH, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError:
        print(f"Error: Failed to decode JSON from {GLOSSARY_PATH}.")
        return {}

def save_glossary(glossary: Dict[str, str]):
    with open(GLOSSARY_PATH, "w") as f:
        json.dump(glossary, f, indent=2, sort_keys=True)
    print(f"Updated glossary saved to {GLOSSARY_PATH}")

def harvest(apply: bool = False, min_frequency: int = 3):
    archive_root = os.path.join(root_dir, "viewroyal_archive")
    files = glob.glob(os.path.join(archive_root, "**", "refinement.json"), recursive=True)
    
    existing_glossary = load_glossary()
    
    # Store candidates as (original, corrected) tuples
    candidates = []
    
    print(f"Scanning {len(files)} refinement files...")
    
    for f in files:
        try:
            with open(f, 'r') as jf:
                data = json.load(jf)
                corrections = data.get("transcript_corrections", [])
                if isinstance(corrections, list):
                    for c in corrections:
                        orig = c.get("original_text", "").strip()
                        corr = c.get("corrected_text", "").strip()
                        
                        # Basic validation
                        if not orig or not corr or orig == corr:
                            continue
                            
                        # If original is very long, it's probably not a simple typo replacement suitable for global glossary
                        if len(orig.split()) > 3:
                            continue
                            
                        # If correction is significantly different length, might be a hallucination or full rewrite
                        if abs(len(orig) - len(corr)) > 5:
                            continue

                        # Filter out if already in glossary
                        if existing_glossary.get(orig) == corr:
                            continue
                            
                        candidates.append((orig, corr))
        except Exception as e:
            pass
            
    # Count frequency of each specific (orig, corr) pair
    pair_counts = Counter(candidates)
    
    # Group by original text to detect conflicts
    grouped_by_orig = {}
    for (orig, corr), count in pair_counts.items():
        if orig not in grouped_by_orig:
            grouped_by_orig[orig] = []
        grouped_by_orig[orig].append((corr, count))
        
    print(f"\nFound {len(candidates)} total correction candidates.")
    
    new_entries = {}
    
    print(f"\nPotential New Glossary Entries (Min Frequency: {min_frequency}):")
    print("-" * 60)
    print(f"{'Original':<25} | {'Correction':<25} | {'Count':<5}")
    print("-" * 60)
    
    sorted_origs = sorted(grouped_by_orig.keys())
    
    for orig in sorted_origs:
        options = grouped_by_orig[orig]
        # Sort options by count descending
        options.sort(key=lambda x: x[1], reverse=True)
        
        best_corr, best_count = options[0]
        
        if best_count >= min_frequency:
            print(f"{orig:<25} | {best_corr:<25} | {best_count:<5}")
            
            # Check for conflict
            if len(options) > 1:
                print(f"  WARNING: Conflicts found: {options}")
            
            new_entries[orig] = best_corr

    print("-" * 60)
    print(f"Total potential new entries: {len(new_entries)}")
    
    if apply:
        if not new_entries:
            print("No new entries to add.")
            return
            
        # Merge
        updated_glossary = existing_glossary.copy()
        updated_glossary.update(new_entries)
        
        save_glossary(updated_glossary)
    else:
        print("\nRun with --apply to update the glossary file.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Harvest transcript corrections from archive.")
    parser.add_argument("--apply", action="store_true", help="Update the glossary JSON file.")
    parser.add_argument("--min-freq", type=int, default=3, help="Minimum frequency to accept a correction.")
    
    args = parser.parse_args()
    
    harvest(apply=args.apply, min_frequency=args.min_freq)