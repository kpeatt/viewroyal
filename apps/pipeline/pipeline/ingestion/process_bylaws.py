import argparse
import os
import sys
import time

from dotenv import load_dotenv
from google import genai
from google.genai import types
from supabase import create_client

# Ensure src can be imported
sys.path.append(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

load_dotenv()

# Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY or not GEMINI_API_KEY:
    print(
        "Error: SUPABASE_URL, SUPABASE_SECRET_KEY (or SUPABASE_KEY), and GEMINI_API_KEY must be set in .env"
    )
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
client = genai.Client(api_key=GEMINI_API_KEY)

# Use Flash for large context window and speed
MODEL_NAME = "gemini-3-flash-preview"


def generate_bylaw_intelligence(bylaw):
    print(f"[*] Processing: {bylaw['title']} (ID: {bylaw['id']})")

    text = bylaw.get("full_text", "")
    if not text:
        print("    [!] No text content found.")
        return None

    # Construct Prompt
    # We truncate to ~100k chars to be safe, although Gemini 1.5/2.0 can handle much more.
    # Most bylaws are well within this limit.
    truncated_text = text[:300000]

    prompt = f"""
You are an expert legal analyst for a municipal government.
Analyze the following bylaw text and provide two structured outputs.

1. **plain_english_summary**: A clear, accessible explanation of what this bylaw does, who it affects, and its key rules. Avoid legalese. (Approx. 100-200 words).
2. **outline**: A structured Markdown representation of the document's structure.
   - Use headings (#, ##, ###) for Parts, Sections, and subsections.
   - Include the section numbers and titles.
   - Do NOT include the full text, just the structure.
   - If it is a short amending bylaw, just list the key amendments.

Bylaw Text:
{truncated_text}
"""

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": {
                    "type": "OBJECT",
                    "properties": {
                        "plain_english_summary": {"type": "STRING"},
                        "outline": {"type": "STRING"},
                    },
                    "required": ["plain_english_summary", "outline"],
                },
            },
        )

        if not response.parsed:
            print("    [!] No parsed response received.")
            return None

        return response.parsed

    except Exception as e:
        print(f"    [!] Error generating content: {e}")
        return None


def process_bylaws(force=False):
    print("--- Bylaw Intelligence Processor ---")

    # Fetch bylaws
    query = supabase.table("bylaws").select(
        "id, title, full_text, plain_english_summary"
    )

    if not force:
        # Only fetch those missing summary OR outline
        # Supabase-py / PostgREST syntax for OR filter on nulls can be tricky.
        # We'll fetch all and filter in python for simplicity unless dataset is huge (it's < 100 rows).
        pass

    response = query.execute()
    if not response.data:
        print("No bylaws found.")
        return

    all_bylaws = response.data
    to_process = []

    if force:
        to_process = all_bylaws
    else:
        # Check for null fields locally to avoid complex RLS/Filter syntax issues
        # We need to check 'outline' but we didn't select it above to save bandwidth?
        # Actually, let's select it.
        query = supabase.table("bylaws").select(
            "id, title, full_text, plain_english_summary, outline"
        )
        response = query.execute()
        for b in response.data:
            if not b.get("plain_english_summary") or not b.get("outline"):
                to_process.append(b)

    print(f"Found {len(to_process)} bylaws to process.")

    for bylaw in to_process:
        result = generate_bylaw_intelligence(bylaw)

        if result:
            update_data = {
                "plain_english_summary": result["plain_english_summary"],
                "outline": result["outline"],
                "updated_at": "now()",
            }

            try:
                supabase.table("bylaws").update(update_data).eq(
                    "id", bylaw["id"]
                ).execute()
                print("    [+] Updated record.")
            except Exception as e:
                print(f"    [!] DB Update Failed: {e}")

            # Rate limit politeness
            time.sleep(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Reprocess all bylaws")
    args = parser.parse_args()

    process_bylaws(force=args.force)
