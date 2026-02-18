"""
Gemini-powered stance generation for councillor+topic pairs.

Generates AI stance summaries grounded in real evidence (key statements,
votes, motions) and stores them in the councillor_stances table.

Usage:
    from pipeline.profiling.stance_generator import generate_all_stances
    generate_all_stances(supabase_client)
    generate_all_stances(supabase_client, person_id=35)
"""

import json
import logging
import os
import time

from google import genai

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────────

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# The 8 predefined topics matching the normalize_category_to_topic SQL function
TOPICS = [
    "Administration",
    "Bylaw",
    "Development",
    "Environment",
    "Finance",
    "General",
    "Public Safety",
    "Transportation",
]

# Rate limit delay between Gemini calls (seconds)
RATE_LIMIT_DELAY = 1.0

# Maximum evidence items to include in prompt
MAX_KEY_STATEMENTS = 15
MAX_VOTES = 10

# ── Singleton client ─────────────────────────────────────────────────────

_client = None


def _get_gemini_client() -> genai.Client:
    """Return a lazily-initialized Gemini client singleton."""
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY not set. Set it in your environment or .env file."
            )
        _client = genai.Client(api_key=api_key)
        logger.info("Gemini client initialized for stance generation (model: %s)", GEMINI_MODEL)
    return _client


# ── Evidence Gathering ───────────────────────────────────────────────────


def _gather_evidence(supabase, person_id: int, topic: str) -> dict:
    """Gather key statements and votes for a person on a given topic.

    Uses the normalize_category_to_topic SQL function to map agenda_item
    categories to the 8 predefined topics.

    Returns dict with:
        key_statements: list of {text, meeting_date, segment_id, agenda_item_title}
        votes: list of {vote, motion_text, result, meeting_date}
        statement_count: total evidence items
    """
    # Query key_statements via RPC or joined query with category normalization
    # We use a raw SQL approach via Supabase's rpc or a filtered query
    key_statements = []
    try:
        # Query key_statements joined with agenda_items, filtering by normalized topic
        # Supabase doesn't support calling SQL functions in filters directly,
        # so we fetch all key_statements for this person and filter in Python
        ks_result = supabase.table("key_statements").select(
            "id, statement_text, statement_type, context, source_segment_ids, "
            "agenda_item_id, "
            "agenda_items!inner(id, title, category), "
            "meetings!inner(meeting_date)"
        ).eq("person_id", person_id).not_.is_("agenda_item_id", "null").execute()

        if ks_result.data:
            for row in ks_result.data:
                category = row.get("agenda_items", {}).get("category", "")
                normalized = _normalize_category_to_topic(category)
                if normalized == topic:
                    meeting_date = row.get("meetings", {}).get("meeting_date", "")
                    segment_ids = row.get("source_segment_ids", [])
                    segment_id = segment_ids[0] if segment_ids else None
                    key_statements.append({
                        "text": row["statement_text"],
                        "meeting_date": meeting_date,
                        "segment_id": segment_id,
                        "agenda_item_title": row.get("agenda_items", {}).get("title", ""),
                    })
    except Exception as e:
        logger.warning("Error fetching key_statements for person %d, topic %s: %s", person_id, topic, e)

    # Query votes for this person on motions whose agenda_item category matches the topic
    votes = []
    try:
        votes_result = supabase.table("votes").select(
            "id, vote, "
            "motions!inner(id, motion_text, result, "
            "agenda_items!inner(id, category), "
            "meetings!inner(meeting_date))"
        ).eq("person_id", person_id).execute()

        if votes_result.data:
            for row in votes_result.data:
                motion = row.get("motions", {})
                if not motion:
                    continue
                agenda_item = motion.get("agenda_items", {})
                if not agenda_item:
                    continue
                category = agenda_item.get("category", "")
                normalized = _normalize_category_to_topic(category)
                if normalized == topic:
                    meeting_info = motion.get("meetings", {})
                    votes.append({
                        "vote": row["vote"],
                        "motion_text": motion.get("motion_text", ""),
                        "result": motion.get("result", ""),
                        "meeting_date": meeting_info.get("meeting_date", ""),
                    })
    except Exception as e:
        logger.warning("Error fetching votes for person %d, topic %s: %s", person_id, topic, e)

    # Trim to limits
    key_statements = key_statements[:MAX_KEY_STATEMENTS]
    votes = votes[:MAX_VOTES]

    return {
        "key_statements": key_statements,
        "votes": votes,
        "statement_count": len(key_statements) + len(votes),
    }


# ── Category Normalization (Python mirror of SQL function) ───────────────


def _normalize_category_to_topic(category: str | None) -> str:
    """Mirror of the normalize_category_to_topic SQL function.

    Maps 470 distinct agenda_item categories to the 8 predefined topics.
    """
    if not category:
        return "General"

    cat = category.lower()

    bylaw_keywords = ["bylaw", "zoning", "rezoning", "regulatory", "legislat"]
    development_keywords = ["develop", "planning", "land use", "permit", "ocp", "housing", "heritage", "subdivis"]
    environment_keywords = ["environ", "park", "climate", "sustain", "trail", "tree", "conservation", "recreation"]
    finance_keywords = ["financ", "budget", "tax", "grant", "capital", "debt", "fund"]
    transportation_keywords = ["transport", "traffic", "road", "transit", "cycl", "pedestr", "infrastruc", "engineer"]
    public_safety_keywords = ["safe", "polic", "fire", "protect", "emergency", "rcmp", "enforcement"]
    administration_keywords = [
        "admin", "governance", "appoint", "committee", "procedur",
        "minutes", "agenda", "adjournm", "closed", "routine", "consent",
    ]

    if any(kw in cat for kw in bylaw_keywords):
        return "Bylaw"
    if any(kw in cat for kw in development_keywords):
        return "Development"
    if any(kw in cat for kw in environment_keywords):
        return "Environment"
    if any(kw in cat for kw in finance_keywords):
        return "Finance"
    if any(kw in cat for kw in transportation_keywords):
        return "Transportation"
    if any(kw in cat for kw in public_safety_keywords):
        return "Public Safety"
    if any(kw in cat for kw in administration_keywords):
        return "Administration"

    return "General"


# ── Prompt Building ──────────────────────────────────────────────────────


def _build_prompt(person_name: str, topic: str, evidence: dict) -> str:
    """Build the Gemini prompt for stance generation.

    Includes evidence text and requests JSON response with position,
    position_score, summary, key_quotes, and confidence_note.
    Enforces confidence qualifier language rules.
    """
    # Format key statements
    statements_text = ""
    if evidence["key_statements"]:
        statements_text = "Key Statements:\n"
        for i, ks in enumerate(evidence["key_statements"], 1):
            date_str = ks.get("meeting_date", "unknown date")
            title_str = ks.get("agenda_item_title", "")
            statements_text += f"  {i}. [{date_str}] (Re: {title_str}) \"{ks['text']}\"\n"

    # Format votes
    votes_text = ""
    if evidence["votes"]:
        votes_text = "\nVoting Record:\n"
        for i, v in enumerate(evidence["votes"], 1):
            date_str = v.get("meeting_date", "unknown date")
            motion_preview = (v.get("motion_text", "") or "")[:150]
            votes_text += (
                f"  {i}. [{date_str}] Voted {v['vote']} on: \"{motion_preview}...\" "
                f"(Result: {v.get('result', 'unknown')})\n"
            )

    evidence_text = statements_text + votes_text
    statement_count = evidence["statement_count"]

    # Confidence qualifier instructions
    if statement_count < 3:
        confidence_instruction = (
            'IMPORTANT: With fewer than 3 pieces of evidence, you MUST use hedged language '
            'such as "Limited data suggests..." or "Based on sparse evidence..." in the summary. '
            "Do NOT make definitive claims."
        )
    elif statement_count <= 7:
        confidence_instruction = (
            "With moderate evidence available, use measured language. "
            'Phrases like "Generally appears to..." or "Tends to..." are appropriate.'
        )
    else:
        confidence_instruction = (
            "With substantial evidence available, you can make confident assertions "
            'like "Consistently supports..." or "Has repeatedly opposed..."'
        )

    return f"""You are analyzing a municipal councillor's position on a specific topic based on their statements, votes, and motions.

Councillor: {person_name}
Topic: {topic}
Total evidence items: {statement_count}

Evidence:
{evidence_text}

{confidence_instruction}

Respond with a JSON object (no markdown fencing):
{{
  "position": "supports" | "opposes" | "mixed" | "neutral",
  "position_score": -1.0 to 1.0 (negative = opposes, positive = supports),
  "summary": "2-3 sentences describing the councillor's position on this topic, citing specific evidence. Use qualifier language matching the confidence level.",
  "key_quotes": [{{"text": "...", "meeting_date": "...", "segment_id": null}}],
  "confidence_note": "Brief explanation of data basis (e.g., 'Based on 12 statements across 8 meetings')"
}}

Rules:
- If fewer than 3 pieces of evidence, use hedged language: "Limited data suggests..."
- If evidence is contradictory, position should be "mixed"
- Always ground claims in specific evidence (dates, vote outcomes, quotes)
- Never editorialize or express your own opinion
- key_quotes should contain up to 3 of the most representative quotes from the evidence
- position_score: -1.0 = strongly opposes, 0.0 = neutral/mixed, 1.0 = strongly supports
"""


# ── Confidence Determination ─────────────────────────────────────────────


def _determine_confidence(statement_count: int) -> str:
    """Determine confidence level based on evidence count.

    Returns 'high' (8+), 'medium' (3-7), or 'low' (<3).
    """
    if statement_count >= 8:
        return "high"
    elif statement_count >= 3:
        return "medium"
    else:
        return "low"


# ── Gemini Call ──────────────────────────────────────────────────────────


def _call_gemini(prompt: str, label: str = "stance") -> str | None:
    """Call Gemini with retry on transient errors.

    Returns response text, or None on failure.
    """
    client = _get_gemini_client()

    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
            )
            return response.text
        except Exception as e:
            error_str = str(e).lower()
            is_transient = any(
                kw in error_str
                for kw in ["rate limit", "429", "500", "503", "overloaded", "unavailable"]
            )
            if is_transient and attempt == 0:
                logger.warning("[%s] Transient error, retrying in 5s: %s", label, e)
                time.sleep(5)
                continue
            logger.error("[%s] Gemini API error: %s", label, e)
            return None

    return None


# ── JSON Parsing ─────────────────────────────────────────────────────────


def _parse_stance_response(text: str) -> dict | None:
    """Parse JSON response from Gemini, handling markdown fencing.

    Returns parsed dict or None on failure.
    """
    cleaned = text.strip()

    # Remove ```json ... ``` fencing if present
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse stance JSON: %s", e)
        logger.debug("Raw text (first 500 chars): %s", cleaned[:500])
        return None

    if not isinstance(data, dict):
        logger.error("Expected JSON object, got %s", type(data).__name__)
        return None

    # Validate required fields
    required = {"position", "position_score", "summary"}
    missing = required - set(data.keys())
    if missing:
        logger.warning("Stance response missing fields: %s", missing)
        return None

    return data


# ── Upsert ───────────────────────────────────────────────────────────────


def _upsert_stance(
    supabase, person_id: int, topic: str, result: dict, statement_count: int
) -> bool:
    """Upsert a stance into the councillor_stances table.

    Uses ON CONFLICT (person_id, topic) DO UPDATE for idempotency.
    Returns True on success, False on failure.
    """
    confidence = _determine_confidence(statement_count)

    # Extract key_quotes from result, ensuring it's a list of dicts
    key_quotes = result.get("key_quotes", [])
    if not isinstance(key_quotes, list):
        key_quotes = []

    row = {
        "person_id": person_id,
        "topic": topic,
        "position": result.get("position", "neutral"),
        "position_score": float(result.get("position_score", 0.0)),
        "summary": result.get("summary", ""),
        "evidence_quotes": key_quotes,
        "statement_count": statement_count,
        "confidence": confidence,
        "confidence_note": result.get("confidence_note", ""),
    }

    try:
        supabase.table("councillor_stances").upsert(
            row,
            on_conflict="person_id,topic",
        ).execute()
        return True
    except Exception as e:
        logger.error("Failed to upsert stance for person %d, topic %s: %s", person_id, topic, e)
        return False


# ══════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════════════════


def generate_all_stances(supabase, gemini_model: str | None = None, person_id: int | None = None):
    """Generate AI stance summaries for councillors across all topics.

    For each councillor, for each of the 8 topics:
    1. Gather evidence (key_statements + votes)
    2. Skip topics with zero evidence
    3. Call Gemini with structured prompt
    4. Parse response and upsert into councillor_stances

    Args:
        supabase: Supabase client instance
        gemini_model: Optional override for the Gemini model name
        person_id: Optional - generate stances for only this person ID.
                   If None, generates for all councillors.
    """
    global GEMINI_MODEL
    if gemini_model:
        GEMINI_MODEL = gemini_model

    # Fetch councillors
    if person_id:
        result = supabase.table("people").select("id, name").eq("id", person_id).execute()
    else:
        result = supabase.table("people").select("id, name").eq("is_councillor", True).execute()

    councillors = result.data or []
    if not councillors:
        print("[Stances] No councillors found.")
        return

    print(f"[Stances] Generating stances for {len(councillors)} councillor(s) across {len(TOPICS)} topics...")

    total_generated = 0
    total_skipped = 0
    total_errors = 0

    for councillor in councillors:
        c_id = councillor["id"]
        c_name = councillor["name"]

        for topic in TOPICS:
            # Gather evidence
            evidence = _gather_evidence(supabase, c_id, topic)

            if evidence["statement_count"] == 0:
                total_skipped += 1
                continue

            print(
                f"[Stances] Processing {c_name} - {topic} "
                f"({evidence['statement_count']} evidence items)..."
            )

            # Build prompt and call Gemini
            prompt = _build_prompt(c_name, topic, evidence)
            response_text = _call_gemini(prompt, label=f"stance-{c_name}-{topic}")

            if not response_text:
                print(f"[Stances]   Error: No response from Gemini for {c_name} - {topic}")
                total_errors += 1
                time.sleep(RATE_LIMIT_DELAY)
                continue

            # Parse response
            parsed = _parse_stance_response(response_text)
            if not parsed:
                # Retry once on parse failure
                print(f"[Stances]   Retrying {c_name} - {topic} (malformed JSON)...")
                time.sleep(RATE_LIMIT_DELAY)
                response_text = _call_gemini(prompt, label=f"stance-retry-{c_name}-{topic}")
                if response_text:
                    parsed = _parse_stance_response(response_text)

            if not parsed:
                print(f"[Stances]   Error: Could not parse response for {c_name} - {topic}")
                total_errors += 1
                time.sleep(RATE_LIMIT_DELAY)
                continue

            # Upsert into database
            success = _upsert_stance(supabase, c_id, topic, parsed, evidence["statement_count"])
            if success:
                confidence = _determine_confidence(evidence["statement_count"])
                print(
                    f"[Stances]   -> {parsed.get('position', '?')} "
                    f"(score: {parsed.get('position_score', 0):.1f}, "
                    f"confidence: {confidence})"
                )
                total_generated += 1
            else:
                total_errors += 1

            # Rate limit between Gemini calls
            time.sleep(RATE_LIMIT_DELAY)

    print(
        f"\n[Stances] Generated {total_generated} stances for "
        f"{len(councillors)} councillor(s)"
    )
    print(f"[Stances] Skipped {total_skipped} (zero evidence), {total_errors} errors")
