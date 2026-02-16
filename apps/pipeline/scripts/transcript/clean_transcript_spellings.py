import argparse
import os
import re
import sys
from typing import Dict, List, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

import json

# Ensure we can import from src
# This script is in src/maintenance/transcript/
# Root is 3 levels up
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
if root_dir not in sys.path:
    sys.path.append(root_dir)

load_dotenv()

def get_supabase_client():
    SUPABASE_URL = os.environ.get("SUPABASE_URL")
    SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY")

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: SUPABASE_URL or SUPABASE_SECRET_KEY not found in environment.")
        return None
    return create_client(SUPABASE_URL, SUPABASE_KEY)

# -----------------------------------------------------------------------------
# GLOSSARY OF CORRECTIONS
# -----------------------------------------------------------------------------
def load_glossary():
    glossary_path = os.path.join(root_dir, "data", "transcript_corrections.json")
    try:
        with open(glossary_path, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Warning: Glossary file not found at {glossary_path}. Using empty glossary.")
        return {}
    except json.JSONDecodeError:
        print(f"Error: Failed to decode JSON from {glossary_path}.")
        return {}

GLOSSARY = load_glossary()

def fix_text(text: str) -> Tuple[str, List[str]]:
    """
    Applies glossary replacements to the text.
    Returns (new_text, list_of_changes).
    """
    if not text:
        return text, []

    original_text = text
    changes = []

    for bad, good in GLOSSARY.items():
        if bad.lower() not in text.lower():
            continue

        # Case-insensitive whole word match
        pattern = re.compile(r"\b" + re.escape(bad) + r"\b", re.IGNORECASE)

        def replace_match(match):
            m = match.group(0)
            # Try to preserve casing if possible
            if m.isupper():
                return good.upper()
            if m[0].isupper():
                return good[0].upper() + good[1:]
            return good

        new_text = pattern.sub(replace_match, text)
        if new_text != text:
            changes.append(f"'{bad}' -> '{good}'")
            text = new_text

    return text, changes


def run(dry_run: bool = True, limit: int = None, force: bool = False):
    supabase = get_supabase_client()
    if not supabase:
        return

    print(f"Fetching transcript segments...")

    all_segments = []
    page_size = 1000
    offset = 0

    while True:
        query = (
            supabase.table("transcript_segments")
            .select("id, text_content, corrected_text_content")
            .order("id")
        )

        # Apply limit if specified
        current_limit = page_size
        if limit is not None:
            remaining = limit - len(all_segments)
            if remaining <= 0:
                break
            current_limit = min(page_size, remaining)

        query = query.range(offset, offset + current_limit - 1)
        response = query.execute()

        if not response.data:
            break

        all_segments.extend(response.data)
        offset += len(response.data)

        print(f"  Fetched {len(all_segments)} segments...")

        if len(response.data) < page_size:
            break

        if limit is not None and len(all_segments) >= limit:
            break

    print(f"Scanned {len(all_segments)} segments.")

    update_count = 0

    for seg in all_segments:
        original = seg.get("text_content", "")
        corrected_existing = seg.get("corrected_text_content")

        # Base text to work on: existing correction if it exists, otherwise original
        base_text = corrected_existing if corrected_existing else original

        if not base_text:
            continue

        new_text, changes = fix_text(base_text)

        # Only update if:
        # 1. Changes were made by glossary
        # 2. OR if we are forced and corrected_text_content is empty (to initialize it)

        should_update = False
        if changes:
            should_update = True
        elif force and not corrected_existing:
            # If force is true, we want to populate corrected_text_content even if no glossary hits
            new_text = original
            should_update = True
            changes = ["Initial population"]

        if should_update:
            # Double check if new_text is actually different from what's in corrected_text_content
            if new_text == corrected_existing:
                continue

            print(f"\nSegment {seg['id']}:")
            if corrected_existing:
                print(f"  Existing Correction: {corrected_existing}")
            else:
                print(f"  Original:            {original}")
            print(f"  New Fixed:           {new_text}")
            print(f"  Changes:             {', '.join(changes)}")

            if not dry_run:
                try:
                    supabase.table("transcript_segments").update(
                        {"corrected_text_content": new_text}
                    ).eq("id", seg["id"]).execute()
                    print("  [UPDATED]")
                    update_count += 1
                except Exception as e:
                    print(f"  [ERROR] {e}")
            else:
                print("  [DRY RUN - NO CHANGE]")
                update_count += 1

    print(
        f"\nFinished. {update_count} segments {'would be' if dry_run else 'were'} updated."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Clean spelling errors in transcript segments."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Don't apply changes, just print them.",
    )
    parser.add_argument(
        "--apply",
        action="store_false",
        dest="dry_run",
        help="Apply changes to the database.",
    )
    parser.add_argument(
        "--limit", type=int, default=None, help="Limit number of segments to process."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Populate corrected_text_content even if no glossary hits.",
    )

    args = parser.parse_args()

    print(
        f"Starting spelling cleanup on 'corrected_text_content'. Dry Run: {args.dry_run}"
    )
    run(dry_run=args.dry_run, limit=args.limit, force=args.force)
