"""
Embedding-powered councillor profiling agent.

Uses vector search to discover themes across a councillor's record,
gathers temporally diverse evidence, and synthesizes via Gemini.

4-Step Agent:
  Step 0: Gather metadata (date range, counts, topic distribution)
  Step 1: Theme Discovery — embed broad queries, vector search per-person, cluster
  Step 2: Deep Dive — targeted searches per theme, enforce temporal spread
  Step 3: Synthesis — single Gemini call with diverse evidence → overview + highlights
  Step 4: Re-generation — feed existing profile, search for recent changes only

API calls per councillor: ~2 OpenAI embedding batches, ~25 Supabase RPCs, 1 Gemini call.
"""

import logging
import time
from collections import defaultdict
from datetime import date, datetime, timedelta

from pipeline.ingestion.embed import generate_embeddings, get_openai_client
from pipeline.profiling.stance_generator import (
    GEMINI_MODEL,
    _call_gemini,
    _parse_json_response,
)

logger = logging.getLogger(__name__)

# ── Theme Discovery Seeds ────────────────────────────────────────────────
# 10 broad queries covering municipal policy areas

SEED_QUERIES = [
    "housing development zoning affordable density",
    "budget spending fiscal responsibility taxation revenue",
    "parks trails recreation environment conservation green space",
    "traffic roads infrastructure transportation cycling pedestrian safety",
    "policing fire emergency services public safety bylaw enforcement",
    "climate change sustainability urban forest tree protection",
    "water sewer stormwater utilities infrastructure maintenance",
    "community engagement public consultation transparency governance",
    "regional cooperation CRD intergovernmental agreements",
    "heritage preservation cultural community support volunteers",
]

SEED_LABELS = [
    "Housing & Development",
    "Budget & Finance",
    "Parks & Recreation",
    "Transportation & Infrastructure",
    "Public Safety",
    "Climate & Sustainability",
    "Utilities & Maintenance",
    "Community Engagement & Governance",
    "Regional Cooperation",
    "Heritage & Culture",
]

# Minimum unique statements for a seed group to become a theme
MIN_THEME_STATEMENTS = 3

# Max evidence items per theme after temporal filtering
MAX_EVIDENCE_PER_THEME = 8

# Number of time buckets for temporal diversity
NUM_TIME_BUCKETS = 4

# Items to keep per time bucket
ITEMS_PER_BUCKET = 2


# ── Step 0: Gather Councillor Context ────────────────────────────────────


def _gather_councillor_context(supabase, person_id: int) -> dict | None:
    """Gather metadata about a councillor's record.

    Returns dict with name, statement_count, vote_count, date_range, topic_distribution.
    Returns None if councillor has insufficient data.
    """
    # Get person name and pronouns
    person_result = supabase.table("people").select("id, name, pronouns").eq("id", person_id).execute()
    if not person_result.data:
        logger.warning("Person %d not found", person_id)
        return None
    name = person_result.data[0]["name"]
    pronouns = person_result.data[0].get("pronouns", "")

    # Key statement stats
    ks_result = supabase.table("key_statements").select(
        "id, meeting_id, meetings!inner(meeting_date), agenda_items(category)"
    ).eq("person_id", person_id).execute()

    statements = ks_result.data or []
    statement_count = len(statements)

    if statement_count == 0:
        return {
            "name": name,
            "pronouns": pronouns,
            "person_id": person_id,
            "statement_count": 0,
            "vote_count": 0,
            "date_range": None,
            "topic_distribution": {},
        }

    # Date range
    dates = []
    for s in statements:
        meeting = s.get("meetings")
        if meeting and meeting.get("meeting_date"):
            try:
                dates.append(datetime.strptime(meeting["meeting_date"], "%Y-%m-%d").date())
            except (ValueError, TypeError):
                pass

    date_range = (min(dates), max(dates)) if dates else None

    # Topic distribution from categories
    from pipeline.profiling.stance_generator import _normalize_category_to_topic

    topic_counts = defaultdict(int)
    for s in statements:
        ai = s.get("agenda_items")
        if ai and isinstance(ai, dict):
            cat = ai.get("category", "")
            topic = _normalize_category_to_topic(cat)
            topic_counts[topic] += 1

    # Vote count
    vote_result = supabase.table("votes").select("id", count="exact").eq("person_id", person_id).execute()
    vote_count = vote_result.count or 0

    return {
        "name": name,
        "pronouns": pronouns,
        "person_id": person_id,
        "statement_count": statement_count,
        "vote_count": vote_count,
        "date_range": date_range,
        "topic_distribution": dict(topic_counts),
    }


# ── Step 1: Theme Discovery ─────────────────────────────────────────────


def _discover_themes(
    supabase, person_id: int, context: dict, openai_client
) -> list[dict]:
    """Discover themes by embedding broad queries and vector-searching per person.

    For councillors with <50 statements, falls back to topic-based grouping.

    Returns list of theme dicts: {label, seed_idx, statement_ids, statements}
    """
    statement_count = context["statement_count"]

    # Short-circuit: too few statements for vector search
    if statement_count < 50:
        return _discover_themes_by_topic(supabase, person_id, context)

    # Batch-embed all 10 seed queries (1 OpenAI call)
    print(f"  [Step 1] Embedding {len(SEED_QUERIES)} seed queries...")
    embeddings = generate_embeddings(openai_client, SEED_QUERIES)

    # Vector search per seed (10 Supabase RPCs)
    all_results = {}  # statement_id -> {statement_data, best_seed_idx, best_similarity}

    for idx, (label, embedding) in enumerate(zip(SEED_LABELS, embeddings)):
        try:
            rpc_result = supabase.rpc(
                "match_key_statements_by_person",
                {
                    "query_embedding": embedding,
                    "filter_person_id": person_id,
                    "match_threshold": 0.3,
                    "match_count": 20,
                },
            ).execute()

            matches = rpc_result.data or []
            for m in matches:
                sid = m["id"]
                sim = m["similarity"]
                if sid not in all_results or sim > all_results[sid]["best_similarity"]:
                    all_results[sid] = {
                        "id": sid,
                        "meeting_id": m["meeting_id"],
                        "statement_text": m["statement_text"],
                        "context": m.get("context", ""),
                        "statement_type": m.get("statement_type", ""),
                        "best_seed_idx": idx,
                        "best_similarity": sim,
                    }
        except Exception as e:
            logger.warning("Vector search failed for seed '%s': %s", label, e)

    if not all_results:
        logger.warning("No vector search results for person %d, falling back to topic grouping", person_id)
        return _discover_themes_by_topic(supabase, person_id, context)

    # Group by best-matching seed
    groups = defaultdict(list)
    for stmt in all_results.values():
        groups[stmt["best_seed_idx"]].append(stmt)

    # Keep groups with MIN_THEME_STATEMENTS+ unique statements
    themes = []
    for seed_idx, stmts in sorted(groups.items()):
        if len(stmts) >= MIN_THEME_STATEMENTS:
            # Sort by similarity descending
            stmts.sort(key=lambda s: s["best_similarity"], reverse=True)
            themes.append({
                "label": SEED_LABELS[seed_idx],
                "seed_idx": seed_idx,
                "seed_query": SEED_QUERIES[seed_idx],
                "statement_ids": [s["id"] for s in stmts],
                "statements": stmts,
            })

    print(f"  [Step 1] Discovered {len(themes)} themes from {len(all_results)} unique statements")
    for t in themes:
        print(f"    - {t['label']}: {len(t['statements'])} statements")

    return themes


def _discover_themes_by_topic(supabase, person_id: int, context: dict) -> list[dict]:
    """Fallback theme discovery for councillors with few statements.

    Groups by normalized topic category instead of vector search.
    """
    print("  [Step 1] Using topic-based grouping (< 50 statements)...")

    from pipeline.profiling.stance_generator import _normalize_category_to_topic

    # Fetch all key statements with category
    ks_result = supabase.table("key_statements").select(
        "id, meeting_id, statement_text, context, statement_type, "
        "agenda_items(category)"
    ).eq("person_id", person_id).not_.is_("agenda_item_id", "null").execute()

    statements = ks_result.data or []

    # Group by normalized topic
    groups = defaultdict(list)
    for s in statements:
        ai = s.get("agenda_items")
        cat = ai.get("category", "") if isinstance(ai, dict) else ""
        topic = _normalize_category_to_topic(cat)
        groups[topic].append({
            "id": s["id"],
            "meeting_id": s["meeting_id"],
            "statement_text": s["statement_text"],
            "context": s.get("context", ""),
            "statement_type": s.get("statement_type", ""),
            "best_similarity": 1.0,
        })

    themes = []
    topic_to_seed = {
        "Development": 0, "Finance": 1, "Environment": 2,
        "Transportation": 3, "Public Safety": 4, "Bylaw": 4,
        "Administration": 7, "General": 9,
    }
    for topic, stmts in groups.items():
        if len(stmts) >= MIN_THEME_STATEMENTS:
            seed_idx = topic_to_seed.get(topic, 9)
            themes.append({
                "label": topic,
                "seed_idx": seed_idx,
                "seed_query": SEED_QUERIES[seed_idx],
                "statement_ids": [s["id"] for s in stmts],
                "statements": stmts,
            })

    print(f"  [Step 1] Found {len(themes)} topic-based themes")
    return themes


# ── Step 2: Deep Dive ────────────────────────────────────────────────────


def _deep_dive_themes(
    supabase, person_id: int, themes: list[dict], context: dict, openai_client
) -> list[dict]:
    """Per-theme targeted search with temporal diversity enforcement.

    For each theme: generate targeted query, vector search key_statements + motions,
    enforce temporal spread across councillor tenure.

    Returns enriched themes with temporally diverse evidence.
    """
    if not themes:
        return themes

    # Generate targeted queries from theme labels + top evidence
    targeted_queries = []
    for theme in themes:
        top_statements = theme["statements"][:3]
        evidence_text = " ".join(s["statement_text"][:100] for s in top_statements)
        query = f"{theme['label']}: {evidence_text}"
        targeted_queries.append(query[:500])  # Truncate to stay within limits

    # Batch-embed all targeted queries (1 OpenAI call)
    print(f"  [Step 2] Embedding {len(targeted_queries)} targeted queries...")
    targeted_embeddings = generate_embeddings(openai_client, targeted_queries)

    # Get date range for time bucketing
    date_range = context.get("date_range")
    if date_range:
        min_date, max_date = date_range
    else:
        min_date = date(2020, 1, 1)
        max_date = date.today()

    # Build meeting_id -> meeting_date lookup
    meeting_dates = _fetch_meeting_dates(supabase, person_id)

    for idx, theme in enumerate(themes):
        embedding = targeted_embeddings[idx]

        # Fetch key statements via vector search
        ks_evidence = []
        try:
            ks_result = supabase.rpc(
                "match_key_statements_by_person",
                {
                    "query_embedding": embedding,
                    "filter_person_id": person_id,
                    "match_threshold": 0.3,
                    "match_count": 30,
                },
            ).execute()

            for m in (ks_result.data or []):
                meeting_date = meeting_dates.get(m["meeting_id"])
                ks_evidence.append({
                    "type": "statement",
                    "id": m["id"],
                    "meeting_id": m["meeting_id"],
                    "meeting_date": meeting_date,
                    "text": m["statement_text"],
                    "context": m.get("context", ""),
                    "similarity": m["similarity"],
                })
        except Exception as e:
            logger.warning("Deep dive key_statements failed for theme '%s': %s", theme["label"], e)

        # Fetch motions via vector search
        motion_evidence = []
        try:
            motion_result = supabase.rpc(
                "match_motions_by_person",
                {
                    "query_embedding": embedding,
                    "filter_person_id": person_id,
                    "match_threshold": 0.3,
                    "match_count": 15,
                },
            ).execute()

            for m in (motion_result.data or []):
                meeting_date = meeting_dates.get(m["meeting_id"])
                motion_evidence.append({
                    "type": "vote",
                    "id": m["id"],
                    "meeting_id": m["meeting_id"],
                    "meeting_date": meeting_date,
                    "text": m["text_content"],
                    "vote": m.get("vote", ""),
                    "result": m.get("result", ""),
                    "similarity": m["similarity"],
                })
        except Exception as e:
            logger.warning("Deep dive motions failed for theme '%s': %s", theme["label"], e)

        # Combine and deduplicate
        all_evidence = ks_evidence + motion_evidence

        # Deduplicate by (type, id)
        seen = set()
        deduped = []
        for ev in all_evidence:
            key = (ev["type"], ev["id"])
            if key not in seen:
                seen.add(key)
                deduped.append(ev)

        # Apply temporal diversity
        theme["evidence"] = _apply_temporal_diversity(deduped, min_date, max_date)

        n_ks = sum(1 for e in theme["evidence"] if e["type"] == "statement")
        n_mo = sum(1 for e in theme["evidence"] if e["type"] == "vote")
        print(f"    - {theme['label']}: {n_ks} statements + {n_mo} votes")

    return themes


def _fetch_meeting_dates(supabase, person_id: int) -> dict[int, str]:
    """Build meeting_id -> meeting_date lookup for all meetings this person participated in."""
    # Get meeting IDs from key_statements
    ks_result = supabase.table("key_statements").select(
        "meeting_id"
    ).eq("person_id", person_id).execute()

    meeting_ids = set()
    for row in (ks_result.data or []):
        if row.get("meeting_id"):
            meeting_ids.add(row["meeting_id"])

    # Also from votes
    vote_result = supabase.table("votes").select(
        "motions!inner(meeting_id)"
    ).eq("person_id", person_id).execute()

    for row in (vote_result.data or []):
        m = row.get("motions")
        if isinstance(m, dict) and m.get("meeting_id"):
            meeting_ids.add(m["meeting_id"])

    if not meeting_ids:
        return {}

    # Fetch meeting dates in batches
    dates = {}
    meeting_id_list = sorted(meeting_ids)
    for i in range(0, len(meeting_id_list), 100):
        batch = meeting_id_list[i:i + 100]
        result = supabase.table("meetings").select("id, meeting_date").in_("id", batch).execute()
        for row in (result.data or []):
            dates[row["id"]] = row.get("meeting_date", "")

    return dates


def _apply_temporal_diversity(
    evidence: list[dict], min_date: date, max_date: date
) -> list[dict]:
    """Enforce temporal diversity across evidence items.

    Divides councillor tenure into NUM_TIME_BUCKETS equal periods.
    From each bucket: take top ITEMS_PER_BUCKET by similarity.
    Fill remaining slots with globally best items.
    Returns max MAX_EVIDENCE_PER_THEME items.
    """
    if len(evidence) <= MAX_EVIDENCE_PER_THEME:
        return evidence

    # Parse dates and assign to buckets
    total_days = max((max_date - min_date).days, 1)
    bucket_days = total_days / NUM_TIME_BUCKETS

    buckets = defaultdict(list)
    undated = []

    for ev in evidence:
        d = _parse_date(ev.get("meeting_date"))
        if d:
            bucket_idx = min(int((d - min_date).days / bucket_days), NUM_TIME_BUCKETS - 1)
            buckets[bucket_idx].append(ev)
        else:
            undated.append(ev)

    # Sort each bucket by similarity
    for bucket_idx in buckets:
        buckets[bucket_idx].sort(key=lambda e: e["similarity"], reverse=True)

    # Take top ITEMS_PER_BUCKET from each bucket
    selected = []
    selected_ids = set()

    for bucket_idx in range(NUM_TIME_BUCKETS):
        for ev in buckets[bucket_idx][:ITEMS_PER_BUCKET]:
            key = (ev["type"], ev["id"])
            if key not in selected_ids:
                selected.append(ev)
                selected_ids.add(key)

    # Fill remaining slots with globally best
    remaining = MAX_EVIDENCE_PER_THEME - len(selected)
    if remaining > 0:
        all_by_sim = sorted(evidence, key=lambda e: e["similarity"], reverse=True)
        for ev in all_by_sim:
            if remaining <= 0:
                break
            key = (ev["type"], ev["id"])
            if key not in selected_ids:
                selected.append(ev)
                selected_ids.add(key)
                remaining -= 1

    return selected


def _parse_date(date_str: str | None) -> date | None:
    """Parse YYYY-MM-DD string to date object."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


# ── Step 3: Synthesis ────────────────────────────────────────────────────


def _synthesize_profile(context: dict, themes: list[dict]) -> dict | None:
    """Single Gemini call to synthesize overview + highlights from diverse evidence.

    Returns parsed dict with 'overview' and 'highlights' keys, or None on failure.
    """
    name = context["name"]
    date_range = context.get("date_range")
    tenure_str = ""
    if date_range:
        tenure_str = f" (record spans {date_range[0].isoformat()} to {date_range[1].isoformat()})"

    # Format evidence by theme
    evidence_sections = []
    all_evidence_flat = {"key_statements": [], "votes": []}

    for theme in themes:
        section = f"\n## Theme: {theme['label']}\n"
        for i, ev in enumerate(theme.get("evidence", []), 1):
            date_str = ev.get("meeting_date", "unknown date")
            if ev["type"] == "statement":
                section += f'  {i}. [{date_str}] STATEMENT: "{ev["text"]}"\n'
                all_evidence_flat["key_statements"].append({
                    "text": ev["text"],
                    "meeting_date": date_str,
                    "meeting_id": ev.get("meeting_id"),
                })
            elif ev["type"] == "vote":
                vote_str = ev.get("vote", "")
                result_str = ev.get("result", "")
                motion_preview = (ev.get("text", "") or "")[:200]
                section += (
                    f'  {i}. [{date_str}] VOTE: {vote_str} on "{motion_preview}..." '
                    f'(Result: {result_str})\n'
                )
                all_evidence_flat["votes"].append({
                    "motion_text": ev.get("text", ""),
                    "meeting_date": date_str,
                    "meeting_id": ev.get("meeting_id"),
                    "vote": vote_str,
                    "result": result_str,
                })
        evidence_sections.append(section)

    evidence_text = "\n".join(evidence_sections)
    total_evidence = sum(len(t.get("evidence", [])) for t in themes)

    pronouns = context.get("pronouns", "")
    pronoun_instruction = f" Pronouns: {pronouns}." if pronouns else ""

    prompt = f"""You are analyzing a council member's overall record on View Royal Town Council. They may be a councillor or the mayor — do NOT assume a title unless the evidence makes it clear.{pronoun_instruction}

Council member: {name}{tenure_str}
Total statements: {context['statement_count']} | Total votes: {context['vote_count']}
Evidence items provided: {total_evidence} (selected for thematic and temporal diversity)

Evidence organized by theme:
{evidence_text}

Respond with a JSON object (no markdown fencing):
{{
  "overview": "2-3 sentences describing this councillor's overall role, priorities, and approach on council. Write in third person. Be specific about their actual focus areas based on the evidence.",
  "highlights": [
    {{
      "title": "Short descriptive title of a specific policy position (e.g. 'Champions affordable housing density bonuses')",
      "summary": "1-2 sentences explaining this position with specific evidence.",
      "position": "for" | "against" | "nuanced",
      "evidence": [{{"text": "exact quote or vote description", "meeting_date": "YYYY-MM-DD", "meeting_id": <int or null>}}]
    }}
  ]
}}

Rules:
- Generate 3-7 highlights that represent their most distinctive/notable positions
- Each highlight MUST cite evidence from at least 2 different meeting dates
- Titles must be specific and action-oriented (e.g. "Advocates park project deferrals over cancellations" NOT "Cares about parks")
- Position "for" = advocates/supports, "against" = opposes/resists, "nuanced" = conditional/qualified support
- Each highlight must have 2-3 evidence items with exact quotes or vote descriptions and dates
- Include the meeting_id from the evidence if available (pass through the integer value)
- The overview should mention their most prominent 2-3 themes
- Never editorialize or express your own opinion
- Ground all claims in specific evidence from the record
- Evidence should span the council member's full tenure where possible, not cluster in one period
- Use the correct pronouns as specified above when referring to the council member
"""

    print(f"  [Step 3] Calling Gemini for synthesis ({total_evidence} evidence items)...")
    response_text = _call_gemini(prompt, label=f"profile-{name}")

    if not response_text:
        logger.error("No response from Gemini for profile synthesis of %s", name)
        return None

    parsed = _parse_json_response(response_text, required_fields={"overview", "highlights"})
    if not parsed:
        # Retry once
        print(f"  [Step 3] Retrying synthesis for {name} (malformed JSON)...")
        time.sleep(1)
        response_text = _call_gemini(prompt, label=f"profile-retry-{name}")
        if response_text:
            parsed = _parse_json_response(response_text, required_fields={"overview", "highlights"})

    if not parsed:
        logger.error("Could not parse profile synthesis for %s", name)
        return None

    # Enrich highlight evidence with meeting_id using date-based lookup
    date_to_meeting_ids: dict[str, set[int]] = defaultdict(set)
    for ks in all_evidence_flat["key_statements"]:
        if ks.get("meeting_date") and ks.get("meeting_id"):
            date_to_meeting_ids[ks["meeting_date"]].add(ks["meeting_id"])
    for v in all_evidence_flat["votes"]:
        if v.get("meeting_date") and v.get("meeting_id"):
            date_to_meeting_ids[v["meeting_date"]].add(v["meeting_id"])

    enriched_count = 0
    missed_count = 0
    for h in parsed.get("highlights", []):
        if not isinstance(h, dict):
            continue
        h_evidence = h.get("evidence", [])
        if not isinstance(h_evidence, list):
            continue
        for ev in h_evidence:
            if not isinstance(ev, dict):
                continue
            # Normalize date field
            ev_date = ev.get("meeting_date") or ev.get("date") or ""
            if "meeting_date" in ev and "date" not in ev:
                ev["date"] = ev.pop("meeting_date")
            elif "meeting_date" in ev:
                ev.pop("meeting_date")

            # Assign meeting_id from date lookup if not already set
            if not ev.get("meeting_id") and ev_date:
                candidates = date_to_meeting_ids.get(ev_date, set())
                if candidates:
                    # Pick the first (most common case: 1 meeting per date)
                    ev["meeting_id"] = next(iter(candidates))
                    enriched_count += 1
                else:
                    missed_count += 1
            elif ev.get("meeting_id"):
                enriched_count += 1

    if missed_count:
        logger.debug("Meeting ID enrichment: %d enriched, %d missed", enriched_count, missed_count)

    return parsed


# ── Step 4: Re-generation ────────────────────────────────────────────────


def _should_regenerate(supabase, person_id: int, force: bool) -> tuple[bool, dict | None]:
    """Check whether we should regenerate a profile.

    Returns (should_generate, existing_profile).
    If force=True, always regenerate.
    If profile is <30 days old and force=False, skip.
    """
    if force:
        return True, None

    try:
        result = supabase.table("councillor_highlights").select(
            "person_id, overview, highlights, generated_at"
        ).eq("person_id", person_id).execute()

        if not result.data:
            return True, None

        existing = result.data[0]
        generated_at = existing.get("generated_at")
        if not generated_at:
            return True, existing

        # Parse generated_at timestamp
        try:
            gen_date = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
            age_days = (datetime.now(gen_date.tzinfo) - gen_date).days
            if age_days < 30:
                return False, existing
        except (ValueError, TypeError):
            pass

        return True, existing
    except Exception:
        return True, None


# ── Public API ───────────────────────────────────────────────────────────


def generate_profile(supabase, person_id: int, force: bool = False) -> bool:
    """Generate an embedding-powered profile for a single councillor.

    Returns True on success, False on skip/failure.
    """
    # Step 4 check: should we regenerate?
    should_gen, existing = _should_regenerate(supabase, person_id, force)
    if not should_gen:
        print(f"  [Profile] Skipping person {person_id} (profile <30 days old, use --force to override)")
        return False

    # Step 0: Gather context
    print(f"  [Step 0] Gathering context for person {person_id}...")
    context = _gather_councillor_context(supabase, person_id)
    if not context:
        return False

    name = context["name"]

    if context["statement_count"] < 3:
        print(f"  [Profile] Skipping {name} (only {context['statement_count']} statements)")
        return False

    print(f"  [Profile] Processing {name}: {context['statement_count']} statements, "
          f"{context['vote_count']} votes")
    if context["date_range"]:
        print(f"    Date range: {context['date_range'][0]} to {context['date_range'][1]}")

    # Initialize OpenAI client for embeddings
    openai_client = get_openai_client()

    # Step 1: Discover themes
    themes = _discover_themes(supabase, person_id, context, openai_client)
    if not themes:
        print(f"  [Profile] No themes discovered for {name}, skipping")
        return False

    # Step 2: Deep dive with temporal diversity
    print(f"  [Step 2] Deep diving {len(themes)} themes...")
    themes = _deep_dive_themes(supabase, person_id, themes, context, openai_client)

    # Filter out themes with no evidence after deep dive
    themes = [t for t in themes if t.get("evidence")]
    if not themes:
        print(f"  [Profile] No evidence gathered for {name}, skipping")
        return False

    # Step 3: Synthesize
    result = _synthesize_profile(context, themes)
    if not result:
        print(f"  [Profile] Synthesis failed for {name}")
        return False

    # Upsert
    from pipeline.profiling.stance_generator import _upsert_highlights

    # Build flat evidence for meeting_id enrichment (already done in synthesis)
    flat_evidence = {"key_statements": [], "votes": []}
    for theme in themes:
        for ev in theme.get("evidence", []):
            if ev["type"] == "statement":
                flat_evidence["key_statements"].append({
                    "text": ev["text"],
                    "meeting_date": ev.get("meeting_date", ""),
                    "meeting_id": ev.get("meeting_id"),
                })
            elif ev["type"] == "vote":
                flat_evidence["votes"].append({
                    "motion_text": ev.get("text", ""),
                    "meeting_date": ev.get("meeting_date", ""),
                    "meeting_id": ev.get("meeting_id"),
                    "vote": ev.get("vote", ""),
                    "result": ev.get("result", ""),
                })

    success = _upsert_highlights(supabase, person_id, result, flat_evidence)
    if success:
        n = len(result.get("highlights", []))
        print(f"  [Profile] -> {n} highlights generated for {name}")

        # Log temporal coverage
        all_dates = set()
        for h in result.get("highlights", []):
            for ev in h.get("evidence", []):
                d = ev.get("date") or ev.get("meeting_date")
                if d:
                    all_dates.add(d[:7])  # year-month
        if all_dates:
            print(f"  [Profile] Coverage: {len(all_dates)} unique months across evidence")
    else:
        print(f"  [Profile] Failed to save highlights for {name}")

    return success


def generate_all_profiles(supabase, person_id: int | None = None, force: bool = False):
    """Generate embedding-powered profiles for councillors.

    Args:
        supabase: Supabase client instance
        person_id: Optional - generate for a single person ID
        force: If True, regenerate even if profile is recent
    """
    if person_id:
        result = supabase.table("people").select("id, name").eq("id", person_id).execute()
    else:
        result = supabase.table("people").select("id, name").eq("is_councillor", True).execute()

    councillors = result.data or []
    if not councillors:
        print("[Profile Agent] No councillors found.")
        return

    print(f"[Profile Agent] Generating profiles for {len(councillors)} councillor(s)...")

    total_generated = 0
    total_skipped = 0
    total_errors = 0

    for councillor in councillors:
        c_id = councillor["id"]
        try:
            success = generate_profile(supabase, c_id, force=force)
            if success:
                total_generated += 1
            else:
                total_skipped += 1
        except Exception as e:
            logger.error("Error generating profile for %s: %s", councillor["name"], e)
            print(f"  [Profile] Error for {councillor['name']}: {e}")
            total_errors += 1

        # Rate limit between councillors
        time.sleep(1)

    print(f"\n[Profile Agent] Generated {total_generated} profiles")
    print(f"[Profile Agent] Skipped {total_skipped}, {total_errors} errors")
