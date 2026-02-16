import argparse
import os
import sys
import time
import json
from typing import List, Optional

from dotenv import load_dotenv
from google import genai
from google.genai import types
from supabase import create_client
from pydantic import BaseModel, Field

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
MODEL_NAME = "gemini-2.0-flash"

class Argument(BaseModel):
    side: str = Field(description="'Pro' or 'Con'")
    point: str
    speaker: str | None

class QuestionAnswer(BaseModel):
    question: str
    asked_by: str
    answered_by: str | None
    answer: str

class AgendaItemIntelligence(BaseModel):
    detailed_analysis: str = Field(description="A detailed 2-3 paragraph narrative of the discussion.")
    arguments: List[Argument] = Field(description="Key arguments raised during the debate.")
    questions: List[QuestionAnswer] = Field(description="Specific questions asked by Council and the answers provided.")
    sentiment_score: float = Field(description="Overall sentiment of the discussion (-1.0 to 1.0).")

def generate_agenda_intelligence(item_title, transcript_text):
    print(f"[*] Processing Item: {item_title[:50]}...")

    if not transcript_text or len(transcript_text.strip()) < 100:
        print("    [!] Insufficient transcript text.")
        return None

    prompt = f"""
You are a City Council Intelligence Analyst.
Analyze the following transcript segment which corresponds to a specific Agenda Item: "{item_title}".

**GOAL**: Extract deep insights into the discussion, PRIORITIZING the contributions, concerns, and arguments made by Council Members (Mayor and Councillors).

**TRANSCRIPT**:
{transcript_text[:50000]} 

**INSTRUCTIONS**:
1. **detailed_analysis**: Write a comprehensive 2-3 paragraph narrative. Focus on the Council's reaction to the proposal, the core of their debate, and how they reached their decision.
2. **arguments**: Extract key arguments for (Pro) and against (Con) the item/motion. 
   - FOCUS ON COUNCIL MEMBERS. Only include staff/applicant points if they are critical context for a Council member's objection or support.
   - "Pro" should reflect reasons for support expressed by Council.
   - "Con" should reflect specific concerns, skepticism, or objections raised by Council.
3. **questions**: List specific questions asked by Council members to Staff or Applicants, and the answers they received.
4. **sentiment_score**: Analyze the overall tone of the *Council's* discussion (not the public or staff). -1.0 (Critical/Hostile) to 1.0 (Supportive/Favorable). 0.0 is Neutral/Procedural.
"""

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": AgendaItemIntelligence,
            },
        )

        if not response.parsed:
            print("    [!] No parsed response received.")
            return None

        return response.parsed

    except Exception as e:
        print(f"    [!] Error generating content: {e}")
        return None


def process_agenda_items(meeting_id=None, force=False, limit=10):
    print("--- Agenda Item Intelligence Processor ---")

    # 1. Fetch Agenda Items that have linked transcripts
    # We want items that:
    # - Have a valid ID
    # - Are NOT procedural (optional filter, but let's keep all for now)
    # - Are not already processed (unless force=True)
    
    query = supabase.table("agenda_items").select("id, title, meta, meeting_id")
    
    if meeting_id:
        query = query.eq("meeting_id", meeting_id)
        
    response = query.execute()
    all_items = response.data
    
    to_process = []
    for item in all_items:
        meta = item.get("meta") or {}
        # Check if already has 'intelligence' key
        if not force and meta.get("intelligence"):
            continue
            
        # Check if we should skip procedural items (simple regex)
        title = item.get("title", "").lower()
        if "adjournment" in title or "adoption of minutes" in title or "call to order" in title:
            continue
            
        to_process.append(item)

    # Limit batch size
    to_process = to_process[:limit]
    print(f"Found {len(to_process)} items to process.")

    for item in to_process:
        # 2. Fetch Speaker Aliases for this meeting to resolve names
        a_res = supabase.table("meeting_speaker_aliases")\
            .select("speaker_label, people(name)")\
            .eq("meeting_id", item["meeting_id"])\
            .execute()
        
        alias_map = {}
        for a in a_res.data:
            label = a["speaker_label"]
            name = a.get("people", {}).get("name")
            if name:
                alias_map[label] = name
                # Also handle common diarization label variations
                alias_map[label.upper()] = name
                alias_map[label.replace(" ", "_").upper()] = name

        # 3. Fetch Transcript Segments for this item
        t_res = supabase.table("transcript_segments")\
            .select("speaker_name, text_content")\
            .eq("agenda_item_id", item["id"])\
            .order("start_time")\
            .execute()
            
        segments = t_res.data
        if not segments:
            print(f"    [i] No transcript segments linked for item: {item['id']}")
            continue
            
        # Construct transcript text with resolved names
        text_lines = []
        for s in segments:
            label = s["speaker_name"]
            # Resolve name using alias map, fallback to label
            display_name = alias_map.get(label) or alias_map.get(label.upper()) or label
            text_lines.append(f"{display_name}: {s['text_content']}")
        
        full_text = "\n".join(text_lines)
        
        # 4. Generate Intelligence
        result = generate_agenda_intelligence(item["title"], full_text)
        
        if result:
            # 4. Update Database
            current_meta = item.get("meta") or {}
            
            # Convert Pydantic model to dict
            intel_dict = result.model_dump()
            
            # Store under 'intelligence' key in meta
            current_meta["intelligence"] = intel_dict
            
            try:
                supabase.table("agenda_items").update({
                    "meta": current_meta
                }).eq("id", item["id"]).execute()
                print("    [+] Updated record.")
            except Exception as e:
                print(f"    [!] DB Update Failed: {e}")
                
            # Rate limit politeness
            time.sleep(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--meeting_id", type=str, help="Specific Meeting ID to process")
    parser.add_argument("--force", action="store_true", help="Reprocess all items")
    parser.add_argument("--limit", type=int, default=10, help="Batch limit")
    args = parser.parse_args()

    process_agenda_items(meeting_id=args.meeting_id, force=args.force, limit=args.limit)
