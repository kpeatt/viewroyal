import os
import sys
import glob
from collections import defaultdict

# Ensure we can import from src
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
from src.core.paths import ARCHIVE_ROOT

def audit_inventory():
    print(f"Auditing meeting inventory in: {ARCHIVE_ROOT}\n")
    
    inventory = []
    
    # Categories are the top-level folders in the archive
    categories = [d for d in os.listdir(ARCHIVE_ROOT) if os.path.isdir(os.path.join(ARCHIVE_ROOT, d)) and not d.startswith(".")]
    
    stats = {
        "total": 0,
        "has_agenda": 0,
        "has_minutes": 0,
        "has_transcript": 0,
        "by_year": defaultdict(int),
        "by_category": defaultdict(int)
    }

    for category in categories:
        cat_path = os.path.join(ARCHIVE_ROOT, category)
        # Walk through year/month structure
        for root, dirs, files in os.walk(cat_path):
            # A meeting folder is one that contains Agenda, Minutes, or Audio subfolders
            if any(d in ["Agenda", "Minutes", "Audio"] for d in dirs):
                stats["total"] += 1
                stats["by_category"][category] += 1
                
                # Extract year from path if possible (usually viewroyal_archive/Category/Year/...)
                parts = os.path.relpath(root, ARCHIVE_ROOT).split(os.sep)
                if len(parts) >= 2:
                    year = parts[1]
                    if year.isdigit():
                        stats["by_year"][year] += 1
                
                # Check contents
                has_agenda = False
                agenda_dir = os.path.join(root, "Agenda")
                if os.path.exists(agenda_dir):
                    if glob.glob(os.path.join(agenda_dir, "*.pdf")) or glob.glob(os.path.join(agenda_dir, "*.html")):
                        has_agenda = True
                
                has_minutes = False
                minutes_dir = os.path.join(root, "Minutes")
                if os.path.exists(minutes_dir):
                    if glob.glob(os.path.join(minutes_dir, "*.pdf")) or glob.glob(os.path.join(minutes_dir, "*.html")):
                        has_minutes = True
                        
                has_transcript = False
                audio_dir = os.path.join(root, "Audio")
                if os.path.exists(audio_dir):
                    # Check for non-raw JSON transcripts
                    json_files = glob.glob(os.path.join(audio_dir, "*.json"))
                    for f in json_files:
                        fname = os.path.basename(f)
                        if not any(x in fname for x in ["_raw_transcript.json", "_segments.json", "shared_media.json", "refinement.json", "attendance.json"]):
                            has_transcript = True
                            break

                if has_agenda: stats["has_agenda"] += 1
                if has_minutes: stats["has_minutes"] += 1
                if has_transcript: stats["has_transcript"] += 1

    # Print Summary
    print(f"{ 'Metric':<20} | { 'Count':<10}")
    print("-" * 35)
    print(f"{ 'Total Meetings':<20} | {stats['total']:<10}")
    print(f"{ 'With Agendas':<20} | {stats['has_agenda']:<10}")
    print(f"{ 'With Minutes':<20} | {stats['has_minutes']:<10}")
    print(f"{ 'With Transcripts':<20} | {stats['has_transcript']:<10}")
    print("\n")

    print("Breakdown by Category:")
    print(f"{ 'Category':<30} | { 'Count':<10}")
    print("-" * 45)
    for cat in sorted(stats["by_category"].keys()):
        print(f"{cat:<30} | {stats['by_category'][cat]:<10}")
    print("\n")

    print("Breakdown by Year:")
    print(f"{ 'Year':<10} | { 'Count':<10}")
    print("-" * 25)
    for year in sorted(stats["by_year"].keys()):
        print(f"{year:<10} | {stats['by_year'][year]:<10}")

if __name__ == "__main__":
    audit_inventory()
