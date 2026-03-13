"""
Key vote detection for councillor profiles.

Detects notable votes using three patterns:
1. Minority position: voted against the majority result
2. Close votes: margin <= 2
3. Ally breaks: disagreement between usually-aligned councillors

Pre-computes results into the key_votes table for fast page loads.

Usage:
    from pipeline.profiling.key_vote_detector import detect_all_key_votes
    detect_all_key_votes(supabase_client)
    detect_all_key_votes(supabase_client, person_id=35)
"""

import logging
import time
from collections import defaultdict

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────────

# Ally break: pairs must agree >= this fraction to be considered "allies"
ALLY_ALIGNMENT_THRESHOLD = 0.80

# Minimum shared votes for a pair to have a meaningful alignment baseline
MIN_SHARED_VOTES_FOR_ALIGNMENT = 5

# Rate limit delay between Gemini calls for context summaries (seconds)
RATE_LIMIT_DELAY = 0.5


# ── Vote Count Computation (from votes table, not motions columns) ──────


def compute_vote_counts(supabase) -> dict[int, dict[str, int]]:
    """Compute vote tallies per motion from the votes table.

    Returns: {motion_id: {"Yes": count, "No": count, ...}}

    Per Pitfall 5 in RESEARCH.md: motions.yes_votes/no_votes may be 0 even
    when individual votes exist, so we always compute from the votes table.
    """
    result = supabase.table("votes").select("motion_id, vote").execute()
    counts: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for row in result.data or []:
        motion_id = row["motion_id"]
        vote_val = row["vote"]
        counts[motion_id][vote_val] += 1
    return dict(counts)


def _get_vote_split(vote_counts: dict[str, int]) -> tuple[int, int, str]:
    """Extract yes/no counts and formatted split string from vote counts.

    Returns: (yes_count, no_count, split_string like "5-2")
    """
    yes = vote_counts.get("Yes", 0)
    no = vote_counts.get("No", 0)
    return yes, no, f"{yes}-{no}"


# ── Detection Patterns ──────────────────────────────────────────────────


def detect_minority_positions(
    person_votes: list[dict], vote_counts: dict[int, dict[str, int]]
) -> dict[int, bool]:
    """Detect votes where the person voted against the majority result.

    Returns: {motion_id: True} for each minority position vote.
    """
    minority = {}
    for pv in person_votes:
        motion_id = pv["motion_id"]
        person_vote = (pv["vote"] or "").upper()
        result = (pv.get("result") or "").upper()

        # Carried/Carried as Amended but person voted No
        if result in ("CARRIED", "CARRIED AS AMENDED") and person_vote == "NO":
            minority[motion_id] = True
        # Defeated/Not Carried but person voted Yes
        elif result in ("DEFEATED", "NOT CARRIED") and person_vote == "YES":
            minority[motion_id] = True

    return minority


def detect_close_votes(
    person_votes: list[dict], vote_counts: dict[int, dict[str, int]]
) -> dict[int, float]:
    """Detect close votes where the margin was <= 2.

    Returns: {motion_id: closeness_factor} where:
        margin 0 -> 1.0, margin 1 -> 0.75, margin 2 -> 0.5
    """
    close = {}
    closeness_map = {0: 1.0, 1: 0.75, 2: 0.5}

    for pv in person_votes:
        motion_id = pv["motion_id"]
        counts = vote_counts.get(motion_id, {})
        yes, no, _ = _get_vote_split(counts)
        margin = abs(yes - no)
        if margin <= 2 and (yes + no) > 0:
            close[motion_id] = closeness_map.get(margin, 0.5)

    return close


def compute_pairwise_alignment(
    all_votes_by_person: dict[int, dict[int, str]],
) -> dict[tuple[int, int], float]:
    """Compute pairwise alignment rates between all councillor pairs.

    Args:
        all_votes_by_person: {person_id: {motion_id: vote_value}}

    Returns: {(person_a, person_b): alignment_rate} where rate is 0.0-1.0
             Only includes pairs with >= MIN_SHARED_VOTES_FOR_ALIGNMENT shared votes.
    """
    person_ids = sorted(all_votes_by_person.keys())
    alignments: dict[tuple[int, int], float] = {}

    for i, pid_a in enumerate(person_ids):
        votes_a = all_votes_by_person[pid_a]
        for pid_b in person_ids[i + 1:]:
            votes_b = all_votes_by_person[pid_b]

            # Find shared motions
            shared = set(votes_a.keys()) & set(votes_b.keys())
            if len(shared) < MIN_SHARED_VOTES_FOR_ALIGNMENT:
                continue

            agree_count = sum(
                1 for mid in shared if votes_a[mid] == votes_b[mid]
            )
            rate = agree_count / len(shared)
            alignments[(pid_a, pid_b)] = rate
            alignments[(pid_b, pid_a)] = rate  # symmetric

    return alignments


def detect_ally_breaks(
    person_id: int,
    person_votes: list[dict],
    all_votes_by_person: dict[int, dict[int, str]],
    alignments: dict[tuple[int, int], float],
    person_names: dict[int, str],
) -> dict[int, list[dict]]:
    """Detect votes where usually-aligned councillors disagreed.

    An ally break occurs when:
    - The pair normally agrees >= ALLY_ALIGNMENT_THRESHOLD of the time
    - But on this specific vote, they disagreed

    Returns: {motion_id: [{person_id, person_name, usual_alignment}]}
    """
    breaks: dict[int, list[dict]] = defaultdict(list)

    # Find allies for this person (pairs with >= 80% alignment)
    allies = []
    for other_id in all_votes_by_person:
        if other_id == person_id:
            continue
        rate = alignments.get((person_id, other_id))
        if rate is not None and rate >= ALLY_ALIGNMENT_THRESHOLD:
            allies.append((other_id, rate))

    if not allies:
        return dict(breaks)

    # Check each of this person's votes for ally disagreements
    my_votes = {pv["motion_id"]: pv["vote"] for pv in person_votes}

    for ally_id, usual_alignment in allies:
        ally_motions = all_votes_by_person.get(ally_id, {})
        for motion_id, my_vote in my_votes.items():
            ally_vote = ally_motions.get(motion_id)
            if ally_vote is not None and ally_vote != my_vote:
                breaks[motion_id].append({
                    "person_id": ally_id,
                    "person_name": person_names.get(ally_id, f"Person {ally_id}"),
                    "usual_alignment": round(usual_alignment, 2),
                })

    return dict(breaks)


# ── Composite Scoring ────────────────────────────────────────────────────


def compute_composite_score(
    is_minority: bool,
    closeness_factor: float,
    ally_break_count: int,
) -> float:
    """Compute composite score for ranking key votes.

    Formula: is_minority * 3 + closeness_factor * 2 + ally_break_count * 1
    """
    score = 0.0
    if is_minority:
        score += 3.0
    score += closeness_factor * 2.0
    score += ally_break_count * 1.0
    return score


# ── Context Summary Generation ───────────────────────────────────────────


def _generate_context_summary(
    person_name: str,
    vote: str,
    vote_split: str,
    result: str,
    motion_text: str | None,
    agenda_title: str | None,
    detection_types: list[str],
) -> str:
    """Generate a brief context summary for a key vote using Gemini.

    Falls back to a template-based summary if Gemini is unavailable.
    """
    try:
        from pipeline.profiling.stance_generator import _call_gemini
    except ImportError:
        return _fallback_context_summary(
            person_name, vote, vote_split, result, agenda_title, detection_types
        )

    topic = agenda_title or (motion_text or "")[:100]
    types_str = ", ".join(detection_types)

    prompt = f"""Write a single sentence (max 25 words) explaining why this council vote is notable.

Councillor: {person_name}
Voted: {vote}
Result: {result} ({vote_split})
Motion topic: {topic}
Why notable: {types_str}

Write only the sentence, no quotes or explanation. Example: "Voted against the 5-2 majority to approve the Helmcken Road rezoning."
"""

    response = _call_gemini(prompt, label=f"key-vote-context-{person_name}")
    if response:
        # Clean up the response
        summary = response.strip().strip('"').strip("'")
        if len(summary) > 200:
            summary = summary[:197] + "..."
        return summary

    return _fallback_context_summary(
        person_name, vote, vote_split, result, agenda_title, detection_types
    )


def _fallback_context_summary(
    person_name: str,
    vote: str,
    vote_split: str,
    result: str,
    agenda_title: str | None,
    detection_types: list[str],
) -> str:
    """Generate a template-based context summary when Gemini is unavailable."""
    topic = agenda_title or "this motion"
    parts = []

    if "minority" in detection_types:
        parts.append(f"Voted {vote} against the {vote_split} majority")
    elif "close_vote" in detection_types:
        parts.append(f"Voted {vote} in a close {vote_split} decision")
    else:
        parts.append(f"Voted {vote} ({vote_split})")

    parts.append(f"on {topic}")

    return " ".join(parts)


# ── Main Detection + Upsert ─────────────────────────────────────────────


def _fetch_person_votes(supabase, person_id: int) -> list[dict]:
    """Fetch all votes for a person with motion and meeting details."""
    result = (
        supabase.table("votes")
        .select(
            "id, vote, motion_id, person_id, "
            "motions!inner(id, text_content, result, meeting_id, "
            "meetings!inner(id, meeting_date), "
            "agenda_items(id, title))"
        )
        .eq("person_id", person_id)
        .execute()
    )

    flat = []
    for row in result.data or []:
        motion = row.get("motions", {}) or {}
        meeting = motion.get("meetings", {}) or {}
        agenda = motion.get("agenda_items", {}) or {}

        flat.append({
            "vote_id": row["id"],
            "vote": row["vote"],
            "motion_id": row["motion_id"],
            "person_id": row["person_id"],
            "motion_text": motion.get("text_content"),
            "result": motion.get("result"),
            "meeting_id": meeting.get("id"),
            "meeting_date": meeting.get("meeting_date"),
            "agenda_item_title": agenda.get("title") if isinstance(agenda, dict) else None,
        })

    return flat


def _detect_for_person(
    person_id: int,
    person_name: str,
    person_votes: list[dict],
    vote_counts: dict[int, dict[str, int]],
    all_votes_by_person: dict[int, dict[int, str]],
    alignments: dict[tuple[int, int], float],
    person_names: dict[int, str],
) -> list[dict]:
    """Run all three detection patterns for a single person.

    Returns list of key vote records ready for upsert.
    """
    minorities = detect_minority_positions(person_votes, vote_counts)
    close_votes = detect_close_votes(person_votes, vote_counts)
    ally_breaks_map = detect_ally_breaks(
        person_id, person_votes, all_votes_by_person, alignments, person_names
    )

    # Collect all motion_ids that triggered any pattern
    all_flagged = set(minorities.keys()) | set(close_votes.keys()) | set(ally_breaks_map.keys())

    # Build key vote records
    records = []
    vote_lookup = {pv["motion_id"]: pv for pv in person_votes}

    for motion_id in all_flagged:
        pv = vote_lookup.get(motion_id)
        if not pv:
            continue

        # Determine detection types
        detection_types = []
        if motion_id in minorities:
            detection_types.append("minority")
        if motion_id in close_votes:
            detection_types.append("close_vote")
        if motion_id in ally_breaks_map:
            detection_types.append("ally_break")

        # Compute score
        closeness = close_votes.get(motion_id, 0.0)
        ally_break_list = ally_breaks_map.get(motion_id, [])
        score = compute_composite_score(
            is_minority=(motion_id in minorities),
            closeness_factor=closeness,
            ally_break_count=len(ally_break_list),
        )

        # Get vote split
        counts = vote_counts.get(motion_id, {})
        _, _, split_str = _get_vote_split(counts)

        # Generate context summary
        context = _generate_context_summary(
            person_name=person_name,
            vote=pv["vote"],
            vote_split=split_str,
            result=pv.get("result", ""),
            motion_text=pv.get("motion_text"),
            agenda_title=pv.get("agenda_item_title"),
            detection_types=detection_types,
        )

        records.append({
            "person_id": person_id,
            "motion_id": motion_id,
            "vote": pv["vote"],
            "detection_type": detection_types,
            "composite_score": score,
            "context_summary": context,
            "ally_breaks": ally_break_list if ally_break_list else None,
            "vote_split": split_str,
        })

    # Sort by composite score descending
    records.sort(key=lambda r: r["composite_score"], reverse=True)
    return records


def _upsert_key_votes(supabase, records: list[dict]) -> int:
    """Upsert key vote records into the database.

    Returns count of successfully upserted records.
    """
    if not records:
        return 0

    count = 0
    for record in records:
        try:
            supabase.table("key_votes").upsert(
                record,
                on_conflict="person_id,motion_id",
            ).execute()
            count += 1
        except Exception as e:
            logger.error(
                "Failed to upsert key vote for person %d, motion %d: %s",
                record["person_id"], record["motion_id"], e,
            )

    return count


# ══════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════════════════


def detect_all_key_votes(
    supabase, person_id: int | None = None
) -> dict[int, int]:
    """Detect key votes for all councillors (or a specific one).

    Algorithm:
    1. Compute vote counts from votes table (not motions.yes_votes/no_votes)
    2. Build per-person vote maps and pairwise alignment baselines
    3. For each person, run minority/close/ally-break detection
    4. Generate context summaries via Gemini
    5. Upsert results into key_votes table

    Args:
        supabase: Supabase client instance
        person_id: Optional - detect for only this person ID

    Returns:
        Dict of {person_id: key_vote_count}
    """
    # Fetch councillors
    if person_id:
        people_result = supabase.table("people").select("id, name").eq("id", person_id).execute()
    else:
        people_result = supabase.table("people").select("id, name").eq("is_councillor", True).execute()

    councillors = people_result.data or []
    if not councillors:
        print("[Key Votes] No councillors found.")
        return {}

    person_names = {c["id"]: c["name"] for c in councillors}
    print(f"[Key Votes] Detecting key votes for {len(councillors)} councillor(s)...")

    # Step 1: Compute vote counts from votes table
    print("[Key Votes] Computing vote counts from votes table...")
    vote_counts = compute_vote_counts(supabase)
    print(f"[Key Votes] Found vote counts for {len(vote_counts)} motions")

    # Step 2: Build per-person vote maps (need ALL councillors for alignment)
    print("[Key Votes] Building per-person vote maps...")
    all_people = supabase.table("people").select("id, name").eq("is_councillor", True).execute()
    all_person_names = {p["id"]: p["name"] for p in (all_people.data or [])}

    all_votes_result = supabase.table("votes").select("person_id, motion_id, vote").execute()
    all_votes_by_person: dict[int, dict[int, str]] = defaultdict(dict)
    for row in all_votes_result.data or []:
        all_votes_by_person[row["person_id"]][row["motion_id"]] = row["vote"]

    # Step 3: Compute pairwise alignments
    print("[Key Votes] Computing pairwise alignments...")
    alignments = compute_pairwise_alignment(all_votes_by_person)
    print(f"[Key Votes] Computed {len(alignments)} alignment pairs")

    # Step 4: Detect key votes per person
    results: dict[int, int] = {}

    for councillor in councillors:
        c_id = councillor["id"]
        c_name = councillor["name"]

        print(f"[Key Votes] Processing {c_name}...")
        person_votes = _fetch_person_votes(supabase, c_id)

        if not person_votes:
            print(f"[Key Votes]   No votes found for {c_name}")
            results[c_id] = 0
            continue

        records = _detect_for_person(
            person_id=c_id,
            person_name=c_name,
            person_votes=person_votes,
            vote_counts=vote_counts,
            all_votes_by_person=all_votes_by_person,
            alignments=alignments,
            person_names=all_person_names,
        )

        upserted = _upsert_key_votes(supabase, records)
        results[c_id] = upserted
        print(f"[Key Votes]   Found {len(records)} key votes, upserted {upserted}")

        time.sleep(RATE_LIMIT_DELAY)

    total = sum(results.values())
    print(f"\n[Key Votes] Total: {total} key votes detected for {len(councillors)} councillor(s)")
    return results
