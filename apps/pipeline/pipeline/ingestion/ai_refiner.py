import json
import os
import sys
import time
from typing import List, Optional

from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from pipeline.names import CANONICAL_NAMES, COUNCIL_NAMES, get_canonical_name

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
LOCAL_MODEL_URL = os.environ.get("LOCAL_MODEL_URL", "http://192.168.1.10:11434/v1")
LOCAL_MODEL_NAME = os.environ.get("LOCAL_MODEL_NAME", "gemma3:12b")
LOCAL_MODEL_TEMPERATURE = float(os.environ.get("LOCAL_MODEL_TEMPERATURE", "0.1"))
LOCAL_MODEL_CTX = int(os.environ.get("LOCAL_MODEL_CTX", "8192"))

client = None
if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)

# Optional OpenAI client for local testing
local_client = None
try:
    from openai import OpenAI

    local_client = OpenAI(base_url=LOCAL_MODEL_URL, api_key="ollama")
except ImportError:
    pass


# --- Schemas ---


class SpeakerAlias(BaseModel):
    label: str  # e.g. "Speaker_01"
    name: str  # e.g. "Mayor Tobias"


class VoteRecord(BaseModel):
    person_name: str
    vote: str
    reason: str | None


class MotionRecord(BaseModel):
    motion_text: str
    plain_english_summary: str | None = Field(
        None, description="Simple summary, e.g. 'Council approved the permit'"
    )
    disposition: str | None = Field(
        None,
        description="Type: 'Substantive', 'Procedural', 'Tabled', 'Referred', 'Amended'",
    )
    mover: Optional[str] = None
    seconder: Optional[str] = None
    result: str = Field(description="CARRIED, DEFEATED, or WITHDRAWN")
    timestamp: Optional[float] = Field(None, description="Start timestamp in seconds")
    end_timestamp: Optional[float] = Field(
        None, description="End timestamp in seconds (after the vote)"
    )
    votes: List[VoteRecord] = []
    financial_cost: Optional[float] = None
    funding_source: Optional[str] = None


class KeyQuote(BaseModel):
    text: str
    speaker: str
    timestamp: float | None


class KeyStatement(BaseModel):
    statement_text: str = Field(description="The substantive statement, paraphrased for clarity")
    speaker: str | None = Field(None, description="The person who made the statement. Must be exactly ONE person — never combine names. null only if from correspondence or truly unclear.")
    statement_type: str = Field(
        description="One of: claim, proposal, objection, recommendation, financial, public_input"
    )
    context: str | None = Field(
        None, description="Brief context for the statement (e.g. 'During debate on rezoning')"
    )
    timestamp: float | None = Field(None, description="Approximate start time in seconds")




class TranscriptCorrection(BaseModel):
    original_text: str = Field(
        description="The exact text string in the transcript that is incorrect"
    )
    corrected_text: str = Field(description="The corrected version of the text")
    reason: str | None = Field(
        None, description="Why this correction is needed (e.g. 'Misspelled Name')"
    )


class AgendaItemRecord(BaseModel):
    item_order: str
    title: str = Field(description="The full formal title from the agenda")
    matter_identifier: str | None = Field(
        None,
        description="All referenced identifiers (Application #s AND Bylaw #s) separated by semicolons. e.g. 'REZ 2025-01; Bylaw No. 1160'",
    )
    matter_title: str | None = Field(
        None,
        description="The subject matter, e.g. 'Noise Control Bylaw' or '123 Main St Variance'",
    )
    plain_english_summary: str | None = Field(
        None,
        description="A single sentence summary of what this item IS for a layperson.",
    )
    related_address: list[str] | None = Field(
        None,
        description="Specific physical property addresses mentioned (e.g. ['157 View Royal Ave']). Avoid generic streets like 'Island Highway' or regions like 'Thetis Lake' unless they are the primary specific subject.",
    )
    description: str | None
    category: str = Field(
        description="The category of the item. Use 'Procedural' for routine meeting management (e.g., Approval of Agenda, Adjournment). Use substantive categories like 'Land Use', 'Finance', 'Engineering', 'Public Safety' etc. for items that involve policy decisions or community impact."
    )
    tags: list[str]
    financial_cost: float | None
    funding_source: str | None
    is_controversial: bool
    debate_summary: str | None
    key_quotes: list[KeyQuote]
    key_statements: list[KeyStatement] = []
    discussion_start_time: float | None
    discussion_end_time: float | None
    motions: list[MotionRecord]


class MeetingRefinement(BaseModel):
    scratchpad_speaker_map: str = Field(
        description="Internal monologue: Identify speakers and map to attendees."
    )
    scratchpad_timeline: str = Field(
        description="Internal monologue: Determine start/end timestamps for items."
    )
    summary: str = Field(
        description="A concise narrative summary (1-2 paragraphs) of the meeting. Focus on high-level outcomes, controversial debates, and SUBSTANTIVE decisions. DO NOT include procedural motions (e.g., approving the agenda, adopting minutes, adjourning the meeting) in the 'key decisions' or 'highlights' section of this summary."
    )
    meeting_type: str = Field(
        description="The category of meeting, must be one of: 'Regular Council', 'Special Council', 'Committee of the Whole', 'Public Hearing', 'Board of Variance', 'Standing Committee', 'Advisory Committee'"
    )
    status: str = Field(
        description="The status of the meeting: 'Planned', 'Completed', or 'Cancelled'"
    )
    chair_person_name: str | None
    attendees: list[str]
    speaker_aliases: list[SpeakerAlias]
    transcript_corrections: list[TranscriptCorrection]
    items: list[AgendaItemRecord]


# --- Prompts ---

SYSTEM_INSTRUCTION = f"""
You are a City Council Data Analyst. Your goal is to create a perfect, relational JSON record of a municipal meeting.

**DATA SOURCES**:
1. **AGENDA**: The plan (Titles, Numbering).
2. **MINUTES**: The official record (Votes, Movers, Results).
3. **TRANSCRIPT**: The verbatim discussion (Timestamps, Quotes).

**CORE TASKS**:
1. **Meeting Identification**: Extract type (e.g. 'Regular Council') and status.
2. **Item Extraction**:
   - Use MINUTES as the source of truth for what happened.
   - Use AGENDA for full titles and numbering (e.g. "6.1").
   - Extract physical addresses into `related_address`.
   - **CRITICAL**: Extract ALL numbered agenda items, including procedural/empty ones:
     * Call to Order (item 1)
     * Approval of Agenda
     * Mayor's Report, Chair's Report
     * Consent Agenda items
     * New Business, Question Period (even if empty)
     * Closed Meeting Resolution, Rising Report
     * Adjournment (MUST include the adjournment motion)
   - Categorize items as "Procedural" if they are routine meeting management (e.g., Approval of Agenda, Adjournment). Use "Substantive" or specific categories (e.g., "Land Use", "Finance") for actual policy decisions.
3. **Timestamps (CRITICAL)**:
   - `discussion_start_time`: The EXACT moment the chair *formally introduces* the item (e.g., "Moving on to item 8.1...").
   - `discussion_end_time`: When the item concludes (immediately after the vote or final remark before the next item is called).
   - If an item is part of a Consent Agenda block, use the start of the block discussion for all items in that block, but prioritize individual timestamps if they are discussed separately.
   - Do NOT capture early mentions during Agenda Approval.
   - Use the `scratchpad_timeline` to justify your timestamps by quoting the relevant segment.
4. **Motions & Votes**:
   - Use MINUTES for text, mover, seconder.
   - Use `disposition` to categorize motions: 'Procedural' (e.g. approving agenda, adjournment, adoption of minutes) vs 'Substantive' (e.g. approving a permit, adopting a bylaw, awarding a contract).
   - Votes must be [Yes, No, Abstain, Recused].
   - If "CARRIED UNANIMOUSLY", all Council present = Yes.
5. **Speaker Mapping**:
   - Identify every generic label in the transcript (e.g., `Speaker_01`, `Speaker_02`, `Chair`) and map it to a real name from the Known Attendees or Minutes.
   - Example: `Speaker_01` -> `Sid Tobias`.
   - Use `COUNCIL_NAMES` list for validation.
6. **Enrichment**:
   - `debate_summary`: Summarize arguments (leave NULL for procedural items with no discussion).
   - `key_quotes`: Extract verbatim quotes (leave empty for procedural items).
7. **Key Statements** (CRITICAL for semantic search):
   - For each substantive (non-procedural) item with discussion, extract `key_statements` — typed statements that capture the substance of the debate.
   - Extract at most **6 key statements** per item. Focus on: policy decisions, financial impacts, community concerns, and contentious positions. Skip individual data points, routine statistics, and anecdotal details.
   - Statement types:
     * `claim` — A factual assertion or position stated by a speaker (e.g. "Traffic has increased 40% since 2020")
     * `proposal` — A specific suggestion or plan of action (e.g. "Staff recommends adding a left-turn lane")
     * `objection` — An argument against a proposal or action (e.g. "This will destroy the character of the neighborhood")
     * `recommendation` — A formal recommendation from staff or committee (e.g. "Staff recommends approval with conditions")
     * `financial` — A statement about costs, budget, or funding (e.g. "The project will cost $2.3M from reserves")
     * `public_input` — A statement from a member of the public during a hearing or delegation
   - Each statement must be attributed to exactly ONE speaker. NEVER combine names (e.g. "Tobias/Lemon" is wrong — make separate statements). If a speaker is named in the debate summary but not in the transcript, still attribute the statement to them.
   - Each statement should be paraphrased for clarity (not verbatim).
   - Include `context` to explain when/why the statement was made.
   - Each statement MUST have a DIFFERENT `timestamp` from the specific transcript segment it came from. Do NOT copy a single timestamp to all statements.
   - Skip procedural items. Do NOT extract statements for items with no discussion.
8. **Transcript Corrections (Spelling & Names)**:
   - Scan the TRANSCRIPT for misspellings of proper nouns, locations (e.g. "Esquimalt", "Helmcken"), organization names, and attendee names.
   - Use the AGENDA, MINUTES, and KNOWN ATTENDEES as the source of truth for correct spellings.
   - Example: "Helmakin Road" → "Helmcken Road", "Mayor Screech" → correct name from attendees.
   - Return `transcript_corrections` with `original_text` (exact snippet) and `corrected_text` (the fix).

**VALIDATION RULES**:
- NO "Unknown" attendees.
- NO "Staff" as a name.
- Council Members ONLY for voting.
- Chronological order for items.
- Every `Speaker_XX` label MUST have a corresponding entry in `speaker_aliases`.
"""


def build_refinement_prompt(
    agenda_text,
    minutes_text,
    transcript_text,
    attendees_context=None,
    canonical_names_context=None,
    glossary_context=None,
    fingerprint_aliases=None,
    active_council_members=None,
):
    # Condense context to save tokens
    context_section = ""
    if attendees_context:
        context_section += f"\n**KNOWN ATTENDEES**:\n{attendees_context}\n"

    # Add pre-identified speakers from voice fingerprints
    if fingerprint_aliases:
        fp_lines = []
        for alias in fingerprint_aliases:
            conf = alias.get("confidence", 0)
            conf_pct = f"{conf * 100:.0f}%" if conf else "?"
            fp_lines.append(
                f"  - {alias['label']} = {alias['name']} (voice match: {conf_pct})"
            )
        context_section += (
            f"\n**PRE-IDENTIFIED SPEAKERS (from voice fingerprints)**:\n"
            + "\n".join(fp_lines)
            + "\n"
        )
        context_section += "NOTE: These speaker identifications are based on voice matching and should be trusted unless transcript context clearly contradicts them.\n"

    # Active Council Members (Strict Validation)
    if active_council_members:
        council_str = ", ".join(active_council_members)
        context_section += (
            f"\n**ACTIVE COUNCIL MEMBERS (VALIDATION)**:\n{council_str}\n"
        )
        context_section += "CRITICAL: Only these individuals are active Council members for this meeting. Any other 'Councillor' or 'Mayor' in the text is likely a hallucination or a former member speaking as public.\n"
    else:
        # Fallback to historical list if no date-specific list provided
        council_str = ", ".join(COUNCIL_NAMES)
        context_section += f"\n**KNOWN COUNCIL MEMBERS (HISTORICAL)**:\n{council_str}\n"

    # Check if transcript is present
    has_transcript = transcript_text and len(transcript_text.strip()) > 0

    if has_transcript:
        task_instructions = """
    **INSTRUCTIONS**:
    1. Fill `scratchpad_speaker_map`: Analyze the transcript. List every unique Speaker label (e.g. `Speaker_01`, `Speaker_02`, `Chair`) and identify who they are based on context clues (e.g. "Thank you, Councillor Mattson").
    2. Fill `speaker_aliases`: Based on your analysis in step 1, create a list of mapping objects.
    3. Fill `scratchpad_timeline`: Scan the transcript for "Item [X] is now before us" or similar transitions. List the start/end times for each item.
    4. Fill `transcript_corrections`: Scan the transcript for misspelled names, places, and terms. Compare against AGENDA/MINUTES for correct spellings.
    5. Generate the final `items` array based on the scratchpad reasoning.
        """
        # We provide the full transcript text here, as Gemini Flash has a 1M token window.
        transcript_section = f"**SOURCE 3: TRANSCRIPT**\n    {transcript_text}"
    else:
        task_instructions = """
    **INSTRUCTIONS (NO TRANSCRIPT AVAILABLE)**:
    1. Leave `scratchpad_speaker_map` EMPTY.
    2. Leave `speaker_aliases` EMPTY.
    3. Leave `scratchpad_timeline` EMPTY.
    4. Leave `transcript_corrections` EMPTY.
    5. Generate the final `items` array using ONLY the Agenda and Minutes.
    6. CRITICAL: Since there is no transcript, you MUST leave `discussion_start_time`, `discussion_end_time`, `key_quotes`, and `debate_summary` EMPTY or NULL. Do NOT invent them.
        """
        transcript_section = "**SOURCE 3: TRANSCRIPT**\n    (Not Available)"

    return f"""
    {context_section}

    **SOURCE 1: AGENDA**
    {agenda_text[:15000]}

    **SOURCE 2: MINUTES**
    {minutes_text[:20000]}

    {transcript_section}

    {task_instructions}
    """


def _merge_refinements(results: List[MeetingRefinement]) -> MeetingRefinement:
    if not results:
        return None

    base = results[0]

    all_items = []
    merged_attendees = set(base.attendees)
    merged_aliases = {{a.label: a for a in base.speaker_aliases}}
    merged_corrections = {{c.original_text: c for c in base.transcript_corrections}}

    for r in results[1:]:
        merged_attendees.update(r.attendees)
        for a in r.speaker_aliases:
            merged_aliases[a.label] = a
        for c in r.transcript_corrections:
            merged_corrections[c.original_text] = c

    item_map = {{}}

    for r in results:
        for item in r.items:
            key = item.title

            if key not in item_map:
                item_map[key] = item
                all_items.append(item)
            else:
                existing = item_map[key]
                if item.debate_summary and not existing.debate_summary:
                    existing.debate_summary = item.debate_summary
                elif item.debate_summary:
                    existing.debate_summary += "\n" + item.debate_summary

                existing.key_quotes.extend(item.key_quotes)
                existing.motions.extend(item.motions)

                if item.discussion_start_time is not None:
                    if (
                        existing.discussion_start_time is None
                        or item.discussion_start_time < existing.discussion_start_time
                    ):
                        existing.discussion_start_time = item.discussion_start_time

                if item.discussion_end_time is not None:
                    if (
                        existing.discussion_end_time is None
                        or item.discussion_end_time > existing.discussion_end_time
                    ):
                        existing.discussion_end_time = item.discussion_end_time

    final_refinement = base.model_copy()
    final_refinement.attendees = list(merged_attendees)
    final_refinement.speaker_aliases = list(merged_aliases.values())
    final_refinement.transcript_corrections = list(merged_corrections.values())
    final_refinement.items = all_items

    return final_refinement


def _refine_local_map_reduce(
    prompt_builder, agenda_text, minutes_text, transcript_text, **kwargs
):
    chunk_size = 15000
    overlap = 1000
    chunks = []

    start = 0
    while start < len(transcript_text):
        end = min(start + chunk_size, len(transcript_text))
        chunks.append(transcript_text[start:end])
        if end == len(transcript_text):
            break
        start = end - overlap

    print(
        f"  [Local AI] Split transcript into {len(chunks)} chunks for processing (Map-Reduce)."
    )

    results = []
    for i, chunk in enumerate(chunks):
        print(f"  [Local AI] Processing chunk {i + 1}/{len(chunks)}...")
        chunk_prompt = prompt_builder(agenda_text, minutes_text, chunk, **kwargs)
        chunk_prompt += f"\n\nNOTE: This is PART {i + 1} of {len(chunks)} of the transcript. Only extract items discussed in this segment."

        res = _refine_local(chunk_prompt)
        if res:
            results.append(res)

    print("  [Local AI] Merging results...")
    return _merge_refinements(results)


def build_agenda_only_prompt(
    agenda_text,
    attendees_context=None,
    canonical_names_context=None,
    glossary_context=None,
):
    return f"""
    I have only the AGENDA for an UPCOMING or INCOMPLETE meeting.
    Goal: Extract a structured plan of what is scheduled.

    SOURCE: AGENDA TEXT
    {agenda_text}

    INSTRUCTIONS:
    1. Set status to 'Planned'.
    2. Extract all scheduled items with titles and numbering.
    3. Leave motions, timestamps, and quotes EMPTY.
    """


def refine_meeting_data(
    agenda_text,
    minutes_text,
    transcript_text,
    attendees_context=None,
    canonical_names_context=None,
    glossary_context=None,
    provider="gemini",
    meeting_date=None,
    fingerprint_aliases=None,
    active_council_members=None,
):
    """
    Sends data to an AI provider (Gemini or Local) to extract structured data.

    Args:
        fingerprint_aliases: Optional list of pre-matched speaker aliases from voice fingerprints.
                           Format: [{"label": "SPEAKER_01", "name": "John Smith", "confidence": 0.92}, ...]
        active_council_members: Optional list of strings ["Name 1", "Name 2"] valid for this meeting date.
    """
    # Map-Reduce for Local Models on large transcripts
    if provider == "local" and transcript_text and len(transcript_text) > 20000:
        return _refine_local_map_reduce(
            build_refinement_prompt,
            agenda_text,
            minutes_text,
            transcript_text,
            attendees_context=attendees_context,
            canonical_names_context=canonical_names_context,
            glossary_context=glossary_context,
            fingerprint_aliases=fingerprint_aliases,
            active_council_members=active_council_members,
        )

    # Detect if we are in "Agenda Only" mode
    has_minutes = minutes_text and len(minutes_text.strip()) > 100
    has_transcript = transcript_text and len(transcript_text.strip()) > 0

    if not has_minutes and not has_transcript:
        print("  [i] Agenda Only detected. Using strict 'Planned' extraction.")
        prompt = build_agenda_only_prompt(
            agenda_text, attendees_context, canonical_names_context, glossary_context
        )
    else:
        # Construct a comprehensive prompt
        prompt = build_refinement_prompt(
            agenda_text,
            minutes_text,
            transcript_text,
            attendees_context,
            canonical_names_context,
            glossary_context,
            fingerprint_aliases=fingerprint_aliases,
            active_council_members=active_council_members,
        )

    if provider == "local":
        return _refine_local(prompt)

    return _refine_gemini(prompt)


def _refine_gemini(prompt):
    if not client:
        print("  [!] No GEMINI_API_KEY. Skipping AI refinement.")
        return None

    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model="gemini-flash-latest",
                contents=prompt,
                config={
                    "system_instruction": SYSTEM_INSTRUCTION,  # Use System Instruction for static rules
                    "response_mime_type": "application/json",
                    "response_schema": MeetingRefinement,
                },
            )
            return response.parsed
        except Exception as e:
            print(
                f"  [!] Gemini Refinement Error (Attempt {attempt + 1}/{max_retries}): {{e}}"
            )
            time.sleep(5 * (attempt + 1))
            if attempt == max_retries - 1:
                return None
    return None


def _repair_local_json(data):
    """
    Common 'near-miss' repairs for local models that don't follow the schema 100%.
    """
    if not isinstance(data, dict):
        return data

    def to_seconds(val):
        if isinstance(val, (int, float)):
            return float(val)
        if isinstance(val, str) and ":" in val:
            try:
                parts = val.split(":")
                if len(parts) == 3:  # HH:MM:SS
                    return (
                        float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
                    )
                if len(parts) == 2:  # MM:SS
                    return float(parts[0]) * 60 + float(parts[1])
            except:
                pass
        return None

    # 1. Top level renames
    if "aliases" in data and "speaker_aliases" not in data:
        aliases = data.pop("aliases")
        if isinstance(aliases, dict):
            data["speaker_aliases"] = [
                {"label": k, "name": v} for k, v in aliases.items()
            ]
        else:
            data["speaker_aliases"] = aliases

    if "speaker_aliases" in data and isinstance(data["speaker_aliases"], list):
        for sa in data["speaker_aliases"]:
            if not isinstance(sa, dict):
                continue
            if "alias" in sa and "label" not in sa:
                sa["label"] = sa.pop("alias")
            if "speaker_id" in sa and "label" not in sa:
                sa["label"] = sa.pop("speaker_id")
            if "speaker_label" in sa and "label" not in sa:
                sa["label"] = sa.pop("speaker_label")
            if "real_name" in sa and "name" not in sa:
                sa["name"] = sa.pop("real_name")

    if "transcript_corrections" in data and isinstance(
        data["transcript_corrections"], list
    ):
        for tc in data["transcript_corrections"]:
            if not isinstance(tc, dict):
                continue
            if "original" in tc and "original_text" not in tc:
                tc["original_text"] = tc.pop("original")
            if "corrected" in tc and "corrected_text" not in tc:
                tc["corrected_text"] = tc.pop("corrected")

    # 2. Filter Hallucinated Council Members
    if "attendees" in data and isinstance(data["attendees"], list):
        filtered_attendees = []
        for a in data["attendees"]:
            if not isinstance(a, str):
                filtered_attendees.append(a)
                continue
            is_official = "Councillor" in a or "Mayor" in a or "Cclr" in a
            clean_a = (
                a.replace("Councillor ", "")
                .replace("Mayor ", "")
                .replace("Acting Mayor ", "")
                .strip()
            )

            # Try to resolve to a canonical name
            canonical = get_canonical_name(clean_a)

            # If they claim to be official but aren't in our list (even after resolution), likely hallucination
            if is_official and canonical not in CANONICAL_NAMES:
                # print(f"  [Repair] Dropping hallucinated attendee: {a}")
                continue

            # Use the canonical name if available
            filtered_attendees.append(canonical if canonical in CANONICAL_NAMES else a)
        data["attendees"] = filtered_attendees

    # 3. Ensure mandatory top-level keys
    defaults = {
        "scratchpad_speaker_map": "",
        "scratchpad_timeline": "",
        "summary": "Meeting summary not provided by model.",
        "chair_person_name": None,
        "attendees": [],
        "speaker_aliases": [],
        "transcript_corrections": [],
        "items": [],
    }
    for k, v in defaults.items():
        if k not in data or data[k] is None:
            data[k] = v

    # 4. Item-level repairs
    if "items" in data and isinstance(data["items"], list):
        for item in data["items"]:
            if not isinstance(item, dict):
                continue

            # Map 'agenda_item' or 'item_number' to 'item_order' / 'title'
            if "agenda_item" in item:
                val = item.pop("agenda_item")
                if "title" not in item or not item["title"]:
                    if ". " in val:
                        parts = val.split(". ", 1)
                        item["item_order"] = parts[0]
                        item["title"] = parts[1]
                    else:
                        item["title"] = val

            # Map 'addresses' to 'related_address'
            if "addresses" in item and "related_address" not in item:
                item["related_address"] = item.pop("addresses")

            if "item_order" not in item:
                item["item_order"] = "0"
            if "title" not in item:
                item["title"] = "Untitled Item"
            if "tags" not in item:
                item["tags"] = []

            item["discussion_start_time"] = to_seconds(
                item.get("discussion_start_time")
            )
            item["discussion_end_time"] = to_seconds(item.get("discussion_end_time"))

            # Fix Key Quotes
            if "key_quotes" in item:
                raw_quotes = item["key_quotes"]
                if isinstance(raw_quotes, list):
                    repaired_quotes = []
                    for q in raw_quotes:
                        if isinstance(q, str):
                            if ": " in q:
                                speaker, text = q.split(": ", 1)
                                repaired_quotes.append(
                                    {
                                        "speaker": speaker.strip(),
                                        "text": text.strip(),
                                        "timestamp": None,
                                    }
                                )
                            else:
                                repaired_quotes.append(
                                    {"speaker": "Unknown", "text": q, "timestamp": None}
                                )
                        elif isinstance(q, dict):
                            if "quote" in q and "text" not in q:
                                q["text"] = q.pop("quote")
                            if "timestamp" not in q:
                                q["timestamp"] = None
                            else:
                                q["timestamp"] = to_seconds(q["timestamp"])
                            repaired_quotes.append(q)
                    item["key_quotes"] = repaired_quotes

            if "key_quotes" not in item or item["key_quotes"] is None:
                item["key_quotes"] = []

            # Key Statements repairs
            if "key_statements" not in item or item["key_statements"] is None:
                item["key_statements"] = []
            elif isinstance(item["key_statements"], list):
                valid_types = {"claim", "proposal", "objection", "recommendation", "financial", "public_input"}
                for ks in item["key_statements"]:
                    if isinstance(ks, dict):
                        if "timestamp" not in ks:
                            ks["timestamp"] = None
                        else:
                            ks["timestamp"] = to_seconds(ks["timestamp"])
                        if "context" not in ks:
                            ks["context"] = None
                        # Normalize statement_type
                        st = ks.get("statement_type", "").lower().strip()
                        if st not in valid_types:
                            ks["statement_type"] = "claim"  # default fallback

            if "is_controversial" not in item:
                item["is_controversial"] = False
            if "financial_cost" not in item:
                item["financial_cost"] = None
            if "funding_source" not in item:
                item["funding_source"] = None
            if "debate_summary" not in item:
                item["debate_summary"] = None
            if "description" not in item:
                item["description"] = None

            # Motion repairs
            if "motions" in item and isinstance(item["motions"], list):
                for mot in item["motions"]:
                    if not isinstance(mot, dict):
                        continue

                    # Fix Votes
                    if "votes" in mot:
                        if isinstance(mot["votes"], dict):
                            raw_votes = mot.pop("votes")
                            mot["votes"] = [
                                {"person_name": k, "vote": v, "reason": None}
                                for k, v in raw_votes.items()
                            ]
                        elif isinstance(mot["votes"], list):
                            repaired_votes = []
                            for v in mot["votes"]:
                                if not isinstance(v, dict):
                                    continue
                                if "councillor" in v and "person_name" not in v:
                                    v["person_name"] = v.pop("councillor")
                                if "member" in v and "person_name" not in v:
                                    v["person_name"] = v.pop("member")
                                if "voter" in v and "person_name" not in v:
                                    v["person_name"] = v.pop("voter")
                                if "reason" not in v:
                                    v["reason"] = None

                                # Normalize vote strings
                                v_str = str(v.get("vote", "")).upper()
                                if v_str in ["AYE", "IN FAVOR", "YES"]:
                                    v["vote"] = "Yes"
                                elif v_str in ["NAY", "OPPOSED", "NO"]:
                                    v["vote"] = "No"

                                # Filter hallucinated voters
                                name_to_check = (
                                    v["person_name"]
                                    .replace("Councillor ", "")
                                    .replace("Mayor ", "")
                                    .replace("Acting Mayor ", "")
                                    .strip()
                                )
                                canonical_voter = get_canonical_name(name_to_check)

                                if canonical_voter not in CANONICAL_NAMES:
                                    continue

                                # Update to canonical name
                                v["person_name"] = canonical_voter
                                repaired_votes.append(v)
                            mot["votes"] = repaired_votes

                    if "vote_attribution" in mot and "result" not in mot:
                        attr = mot.pop("vote_attribution")
                        mot["result"] = (
                            "CARRIED" if "CARRIED" in attr.upper() else "DEFEATED"
                        )

                    if "result" not in mot or mot["result"] is None:
                        mot["result"] = "CARRIED"

                    if "votes" not in mot or mot["votes"] is None:
                        mot["votes"] = []

    return data


def _refine_local(prompt):
    if not local_client:
        print(
            "  [!] 'openai' library not installed or client failed. Cannot use local model."
        )
        return None

    # Strict system instruction for local models
    system_prompt = (
        SYSTEM_INSTRUCTION
        + """

    CRITICAL JSON RULES:
    1. RETURN ONLY VALID JSON. NO TALKING. NO MARKDOWN.
    2. USE EXACT SCHEMA KEYS. DO NOT DEVIATE.
    3. MANDATORY KEYS: \"scratchpad_speaker_map\", \"scratchpad_timeline\", \"summary\", \"meeting_type\", \"status\", \"chair_person_name\", \"attendees\", \"speaker_aliases\", \"transcript_corrections\", \"items\".
    """
    )

    print(
        f"  [Local AI] Requesting refinement from {LOCAL_MODEL_NAME} (JSON Mode + Streaming)..."
    )
    try:
        # Re-enabling json_object mode for enforcement
        stream = local_client.chat.completions.create(
            model=LOCAL_MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=LOCAL_MODEL_TEMPERATURE,
            stream=True,
            extra_body={"num_ctx": LOCAL_MODEL_CTX},
        )

        full_content = ""
        for chunk in stream:
            content = chunk.choices[0].delta.content
            if content:
                full_content += content
                sys.stdout.write(content)
                sys.stdout.flush()

        print("\n\n  [Local AI] Streaming complete. Validating...")

        if not full_content:
            return None

        # Clean up potential markdown blocks if the model ignored json_mode
        raw_json = full_content.strip()
        if "```json" in raw_json:
            raw_json = raw_json.split("```json")[1].split("```")[0].strip()
        elif "```" in raw_json:
            raw_json = raw_json.split("```")[1].strip()

        # Parse
        data = json.loads(raw_json)

        # Repair common local model errors
        repaired_data = _repair_local_json(data)

        # Validate with Pydantic
        return MeetingRefinement.model_validate(repaired_data)

    except Exception as e:
        print(f"\n  [!] Local Refinement Error: {e}")
        return None


# --- Backfill Logic ---

BACKFILL_INSTRUCTION = """
You are a Data Auditor. Your goal is to identify Agenda Items that were missed during a previous extraction pass.

**INPUTS**:
1. **EXISTING ITEMS**: A JSON list of items we already have.
2. **SOURCE TEXT**: The text of the Agenda and Minutes.

**TASK**:
1. Compare the **EXISTING ITEMS** against the **SOURCE TEXT**.
2. Identify any numbered items (e.g. "1. Call to Order", "16. Rising Report", "17. Termination") that are present in the SOURCE TEXT but missing from the EXISTING ITEMS.
3. Return a JSON object with a list of `missing_items`.
4. **CRITICAL**: Do NOT modify or return the items we already have. Only return the NEW ones.
5. If an item is "Procedural" (e.g. Call to Order, Adjournment), mark it as `category="Procedural"`.

**OUTPUT SCHEMA**:
{
  "missing_items": [
    {
      "item_order": "1",
      "title": "Call to Order",
      "description": "...",
      "category": "Procedural",
      "motions": []
    }
  ]
}
"""


class BackfillResponse(BaseModel):
    missing_items: List[AgendaItemRecord]


def find_missing_items(existing_items, agenda_text, minutes_text):
    """
    Asks AI to find items present in text but missing from existing_items list.
    """
    if not client:
        print("  [!] No GEMINI_API_KEY. Skipping backfill.")
        return []

    # Prepare context
    items_json = json.dumps(
        [
            {"item_order": i.get("item_order"), "title": i.get("title")}
            for i in existing_items
        ],
        indent=2,
    )

    # Truncate inputs to avoid massive tokens if not necessary
    # We prioritize Minutes because they contain the "actual" flow including Rising Report
    prompt = f"""
**EXISTING ITEMS**:
{items_json}

**SOURCE TEXT (Agenda + Minutes)**:
--- AGENDA START ---
{agenda_text[:30000]}
--- AGENDA END ---

--- MINUTES START ---
{minutes_text}
--- MINUTES END ---

**INSTRUCTION**:
Find missing items. Return JSON matching the `BackfillResponse` schema.
"""

    try:
        response = client.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
            config={
                "system_instruction": BACKFILL_INSTRUCTION,
                "response_mime_type": "application/json",
                "response_schema": BackfillResponse,
            },
        )
        return response.parsed.missing_items
    except Exception as e:
        print(f"  [!] Backfill AI Error: {e}")
        return []


# --- Enrichment Logic ---

ENRICHMENT_INSTRUCTION = """
You are a Legislative Analyst. Your goal is to summarize the debate and extract key quotes for a specific Agenda Item.

**INPUT**:
- **ITEM TITLE**: The topic being discussed.
- **TRANSCRIPT**: The verbatim discussion for this item.

**TASK**:
1. **Debate Summary**: Write a concise, neutral paragraph (2-3 sentences) summarizing the key arguments, questions asked by Council, and the outcome. If it's a presentation, summarize the key points.
2. **Key Quotes**: Extract 1-2 verbatim quotes that capture the essence of the discussion or a strong opinion.

**OUTPUT SCHEMA**:
{
  "debate_summary": "Council discussed...",
  "key_quotes": [
    { "text": "...", "speaker": "..." }
  ]
}
"""


class EnrichmentResponse(BaseModel):
    debate_summary: str | None
    key_quotes: List[KeyQuote]


def enrich_item_debate(item_title, item_transcript):
    """
    Generates summary and quotes for a specific item's transcript segment.
    """
    if not client or not item_transcript or len(item_transcript) < 50:
        return None, []

    prompt = f"""
**ITEM TITLE**: {item_title}

**TRANSCRIPT**:
{item_transcript}

**INSTRUCTION**:
Summarize the debate and extract key quotes.
"""

    try:
        response = client.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
            config={
                "system_instruction": ENRICHMENT_INSTRUCTION,
                "response_mime_type": "application/json",
                "response_schema": EnrichmentResponse,
            },
        )
        return response.parsed.debate_summary, response.parsed.key_quotes
    except Exception as e:
        print(f"  [!] Enrichment AI Error: {e}")
        return None, []
