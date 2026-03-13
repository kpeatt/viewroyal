"""
Topic classification for agenda items.

Classifies all ~12K agenda items into the 8-topic taxonomy by populating
the agenda_item_topics junction table. Uses a SQL-first approach
(normalize_category_to_topic function) with Gemini AI fallback for
unmapped categories.

Usage:
    from pipeline.profiling.topic_classifier import classify_topics
    classify_topics(supabase_client)
"""

import json
import logging
import os
import time

from google import genai

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────────

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")

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

# Batch size for bulk inserts
BATCH_SIZE = 500

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
        logger.info("Gemini client initialized for topic classification (model: %s)", GEMINI_MODEL)
    return _client


# ── Gemini Call ──────────────────────────────────────────────────────────


def _call_gemini(prompt: str, label: str = "topic") -> str | None:
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


def _parse_json_response(text: str, required_fields: set[str] | None = None) -> dict | None:
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
        logger.error("Failed to parse JSON: %s", e)
        logger.debug("Raw text (first 500 chars): %s", cleaned[:500])
        return None

    if not isinstance(data, dict):
        logger.error("Expected JSON object, got %s", type(data).__name__)
        return None

    if required_fields:
        missing = required_fields - set(data.keys())
        if missing:
            logger.warning("Response missing fields: %s", missing)
            return None

    return data


# ── Bulk Insert ──────────────────────────────────────────────────────────


def _bulk_insert_topic_assignments(supabase, rows: list[dict]) -> int:
    """Bulk insert topic assignments into agenda_item_topics.

    Uses upsert with on_conflict to handle duplicates gracefully.
    Returns the number of rows inserted.
    """
    if not rows:
        return 0

    inserted = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        try:
            supabase.table("agenda_item_topics").upsert(
                batch,
                on_conflict="agenda_item_id,topic_id",
            ).execute()
            inserted += len(batch)
        except Exception as e:
            logger.error("Failed to insert topic assignments batch %d: %s", i // BATCH_SIZE, e)

    return inserted


# ── Gemini Response Mapping ──────────────────────────────────────────────


def _map_gemini_response_to_inserts(
    gemini_mapping: dict[str, str],
    unmapped_items: list[dict],
    topic_map: dict[str, int],
) -> list[dict]:
    """Map Gemini's category->topic response to insert rows.

    Each agenda item gets exactly one topic. Invalid topic names fall back
    to "General".

    Args:
        gemini_mapping: {category_name: topic_name} from Gemini
        unmapped_items: list of {id, category} dicts for items needing classification
        topic_map: {topic_name: topic_id} lookup

    Returns:
        list of {agenda_item_id, topic_id} dicts ready for insert
    """
    general_id = topic_map.get("General", 6)
    rows = []
    seen_items = set()

    for item in unmapped_items:
        item_id = item["id"]
        if item_id in seen_items:
            continue
        seen_items.add(item_id)

        category = item.get("category", "")
        topic_name = gemini_mapping.get(category, "General")

        # Validate topic name; fall back to General if invalid
        topic_id = topic_map.get(topic_name, general_id)

        rows.append({
            "agenda_item_id": item_id,
            "topic_id": topic_id,
        })

    return rows


# ── Gemini Fallback Classification ───────────────────────────────────────


def _build_classification_prompt(categories: list[str]) -> str:
    """Build a Gemini prompt to classify unmapped categories into topics."""
    topics_str = ", ".join(TOPICS)
    categories_json = json.dumps(categories, indent=2)

    return f"""You are classifying municipal council agenda item categories into topic areas.

The valid topics are: {topics_str}

Below is a JSON array of category names that need to be classified. For each category,
determine which ONE topic it best fits into. If unsure, use "General".

Categories to classify:
{categories_json}

Respond with a JSON object mapping each category to its topic (no markdown fencing):
{{
  "Category Name 1": "TopicName",
  "Category Name 2": "TopicName",
  ...
}}

Rules:
- Each category maps to exactly ONE topic
- Use only the valid topic names listed above
- If a category could fit multiple topics, choose the most specific one
- Use "General" only for categories that truly don't fit elsewhere
"""


def _classify_unmapped_with_gemini(
    supabase, topic_map: dict[str, int],
) -> int:
    """Classify items that weren't mapped by the SQL function using Gemini.

    1. Query agenda items that don't have a row in agenda_item_topics
    2. Collect distinct categories
    3. Batch-classify with Gemini
    4. Bulk-insert results

    Returns count of items classified.
    """
    # Get unmapped items via RPC
    try:
        result = supabase.rpc(
            "get_unclassified_agenda_items",
        ).execute()
        unmapped_items = result.data or []
    except Exception as e:
        logger.error("Failed to query unmapped agenda items: %s", e)
        return 0

    if not unmapped_items:
        print("[Topics] All items already classified.")
        return 0

    # Collect distinct categories
    distinct_categories = list({
        item.get("category", "") or "Unknown"
        for item in unmapped_items
    })

    print(f"[Topics] {len(unmapped_items)} items unclassified across {len(distinct_categories)} distinct categories")

    # Build prompt and call Gemini
    prompt = _build_classification_prompt(distinct_categories)
    response_text = _call_gemini(prompt, label="topic-classify")

    if not response_text:
        logger.error("No response from Gemini for topic classification")
        return 0

    gemini_mapping = _parse_json_response(response_text)
    if not gemini_mapping:
        # Retry once
        print("[Topics] Retrying Gemini classification (malformed JSON)...")
        time.sleep(RATE_LIMIT_DELAY)
        response_text = _call_gemini(prompt, label="topic-classify-retry")
        if response_text:
            gemini_mapping = _parse_json_response(response_text)

    if not gemini_mapping:
        logger.error("Could not parse Gemini classification response")
        return 0

    # Map response to insert rows
    rows = _map_gemini_response_to_inserts(gemini_mapping, unmapped_items, topic_map)

    # Bulk insert
    inserted = _bulk_insert_topic_assignments(supabase, rows)
    print(f"[Topics] Gemini classified {inserted} items across {len(distinct_categories)} categories")

    return inserted


# ══════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════════════════


def classify_topics(supabase):
    """Classify all agenda items into the 8-topic taxonomy.

    Two-phase approach:
    1. SQL-first: Use normalize_category_to_topic() via RPC to classify items
       with known category mappings (bulk INSERT...SELECT).
    2. Gemini fallback: For items still without a topic, batch-classify their
       distinct categories via a single Gemini call, then bulk-insert.

    Args:
        supabase: Supabase client instance
    """
    print("[Topics] Starting topic classification...")

    # Step 1: Load topic name -> ID mapping
    topics_result = supabase.table("topics").select("id, name").execute()
    topics_data = topics_result.data or []
    topic_map = {t["name"]: t["id"] for t in topics_data}

    if not topic_map:
        print("[Topics] ERROR: No topics found in topics table. Aborting.")
        return

    print(f"[Topics] Loaded {len(topic_map)} topics: {', '.join(topic_map.keys())}")

    # Step 2: SQL-based classification via RPC
    # This calls a Supabase RPC function that runs:
    #   INSERT INTO agenda_item_topics (agenda_item_id, topic_id)
    #   SELECT ai.id, t.id
    #   FROM agenda_items ai
    #   JOIN topics t ON t.name = normalize_category_to_topic(ai.category)
    #   WHERE NOT EXISTS (SELECT 1 FROM agenda_item_topics ait WHERE ait.agenda_item_id = ai.id)
    #   ON CONFLICT DO NOTHING
    try:
        sql_result = supabase.rpc("bulk_classify_topics_by_category").execute()
        sql_count = 0
        if sql_result.data:
            if isinstance(sql_result.data, dict):
                sql_count = sql_result.data.get("inserted", 0)
            elif isinstance(sql_result.data, int):
                sql_count = sql_result.data
            elif isinstance(sql_result.data, list) and len(sql_result.data) > 0:
                sql_count = len(sql_result.data)
        print(f"[Topics] SQL classification: {sql_count} items classified via normalize_category_to_topic()")
    except Exception as e:
        logger.error("SQL bulk classification failed: %s", e)
        print(f"[Topics] SQL classification failed: {e}")
        sql_count = 0

    # Step 3: Gemini fallback for unmapped items
    gemini_count = _classify_unmapped_with_gemini(supabase, topic_map)

    # Step 4: Summary
    total = sql_count + gemini_count
    print(f"\n[Topics] Classification complete:")
    print(f"[Topics]   SQL-mapped:     {sql_count}")
    print(f"[Topics]   Gemini-mapped:  {gemini_count}")
    print(f"[Topics]   Total:          {total}")
