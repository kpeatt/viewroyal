"""
Person Analysis Tool

Analyzes a council member's positions and preferences based on their
voting history and transcript segments using RAG (Retrieval Augmented Generation).

Usage:
    uv run python src/analysis/person_analysis.py "Sid Tobias" "What topics does this person seem to care most about?"
    uv run python src/analysis/person_analysis.py "David Screech" --interactive
"""

import argparse
import json
import os
import sys
from typing import List, Optional

from dotenv import load_dotenv
from google import genai
from supabase import create_client

# Ensure we can import from src
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if root_dir not in sys.path:
    sys.path.append(root_dir)

from src.core.embeddings import EmbeddingClient

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")


def get_person_by_name(supabase, name: str) -> Optional[dict]:
    """Look up a person by name (case-insensitive partial match)."""
    # Try exact match first
    res = supabase.table("people").select("id, name, is_councillor, pronouns").eq("name", name).execute()
    if res.data:
        return res.data[0]

    # Try case-insensitive partial match
    res = supabase.table("people").select("id, name, is_councillor, pronouns").ilike("name", f"%{name}%").execute()
    if res.data:
        if len(res.data) == 1:
            return res.data[0]
        print(f"Multiple matches found for '{name}':")
        for p in res.data:
            role = " (Councillor)" if p["is_councillor"] else ""
            print(f"  - {p['name']}{role}")
        return None

    return None


def get_pronoun_info(pronouns: Optional[str]) -> dict:
    """Convert pronouns string to subject/object/possessive forms."""
    if pronouns == "she/her":
        return {"subject": "she", "object": "her", "possessive": "her"}
    elif pronouns == "they/them":
        return {"subject": "they", "object": "them", "possessive": "their"}
    else:  # Default to he/him
        return {"subject": "he", "object": "him", "possessive": "his"}


def get_voting_history(supabase, person_id: int, limit: int = 100) -> list:
    """
    Get a person's voting history with motion context.
    Returns votes joined with motion details and meeting info.
    """
    res = (
        supabase.table("votes")
        .select(
            """
            vote,
            recusal_reason,
            motions(
                id,
                text_content,
                plain_english_summary,
                result,
                disposition,
                meeting_id,
                meetings(meeting_date, type)
            )
        """
        )
        .eq("person_id", person_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def get_speaker_aliases(supabase, person_id: int) -> list:
    """Get all speaker labels/aliases associated with a person."""
    res = (
        supabase.table("meeting_speaker_aliases")
        .select("meeting_id, speaker_label")
        .eq("person_id", person_id)
        .execute()
    )
    return res.data or []


def get_transcript_segments(supabase, person_id: int, person_name: str, limit: int = 200) -> list:
    """
    Get transcript segments where this person spoke.
    Uses multiple strategies:
    1. Direct person_id match
    2. Speaker alias matching (speaker_label contains their name)
    3. Fallback to corrected_text_content search for their name
    """
    segments = []

    # Strategy 1: Direct person_id match
    res = (
        supabase.table("transcript_segments")
        .select(
            """
            id,
            text_content,
            corrected_text_content,
            speaker_name,
            start_time,
            meeting_id,
            meetings(meeting_date, type),
            agenda_items(title)
        """
        )
        .eq("person_id", person_id)
        .order("meeting_id", desc=True)
        .limit(limit)
        .execute()
    )
    if res.data:
        segments.extend(res.data)

    # Strategy 2: Look up aliases and match by meeting + speaker_label
    if len(segments) < limit:
        aliases = get_speaker_aliases(supabase, person_id)
        if aliases:
            # Group by meeting_id for efficient querying
            for alias in aliases[:50]:  # Limit alias lookups
                meeting_id = alias["meeting_id"]
                speaker_label = alias["speaker_label"]

                res = (
                    supabase.table("transcript_segments")
                    .select(
                        """
                        id,
                        text_content,
                        corrected_text_content,
                        speaker_name,
                        start_time,
                        meeting_id,
                        meetings(meeting_date, type),
                        agenda_items(title)
                    """
                    )
                    .eq("meeting_id", meeting_id)
                    .eq("speaker_name", speaker_label)
                    .order("start_time")
                    .limit(20)
                    .execute()
                )
                if res.data:
                    # Avoid duplicates
                    existing_ids = {s["id"] for s in segments}
                    for seg in res.data:
                        if seg["id"] not in existing_ids:
                            segments.append(seg)

                if len(segments) >= limit:
                    break

    # Strategy 3: Search for name in speaker_name field (handles "Councillor Tobias" etc.)
    if len(segments) < limit // 2:
        last_name = person_name.split()[-1] if person_name else ""
        if last_name:
            res = (
                supabase.table("transcript_segments")
                .select(
                    """
                    id,
                    text_content,
                    corrected_text_content,
                    speaker_name,
                    start_time,
                    meeting_id,
                    meetings(meeting_date, type),
                    agenda_items(title)
                """
                )
                .ilike("speaker_name", f"%{last_name}%")
                .order("meeting_id", desc=True)
                .limit(limit - len(segments))
                .execute()
            )
            if res.data:
                existing_ids = {s["id"] for s in segments}
                for seg in res.data:
                    if seg["id"] not in existing_ids:
                        segments.append(seg)

    return segments[:limit]


def semantic_search_segments(
    supabase, embedding_client: EmbeddingClient, query: str, limit: int = 30, threshold: float = 0.5
) -> list:
    """
    Search transcript segments using semantic similarity.
    Finds segments relevant to the query regardless of speaker.
    Falls back to keyword search if RPC functions aren't available.
    """
    # Generate query embedding
    query_embedding = embedding_client.embed_text(query, task_type="RETRIEVAL_QUERY")

    # If embedding failed or is all zeros, fall back to keyword search
    if not query_embedding or all(v == 0 for v in query_embedding):
        print("    (Embedding failed, using keyword fallback)")
        return _keyword_search_segments(supabase, query, limit)

    try:
        # Call the RPC function for semantic search
        res = supabase.rpc(
            "match_transcript_segments",
            {
                "query_embedding": query_embedding,
                "match_threshold": threshold,
                "match_count": limit,
                "filter_meeting_id": None,
            },
        ).execute()

        if not res.data:
            return []

        # Enrich with meeting and agenda item details
        segment_ids = [s["id"] for s in res.data]
        enriched = (
            supabase.table("transcript_segments")
            .select(
                """
                id,
                text_content,
                corrected_text_content,
                speaker_name,
                start_time,
                meeting_id,
                meetings(meeting_date, type),
                agenda_items(title)
            """
            )
            .in_("id", segment_ids)
            .execute()
        )

        # Merge similarity scores back in
        similarity_map = {s["id"]: s["similarity"] for s in res.data}
        for seg in enriched.data or []:
            seg["similarity"] = similarity_map.get(seg["id"], 0)

        # Sort by similarity
        return sorted(enriched.data or [], key=lambda x: x.get("similarity", 0), reverse=True)

    except Exception as e:
        print(f"    (Semantic search failed: {e}, using keyword fallback)")
        return _keyword_search_segments(supabase, query, limit)


def _keyword_search_segments(supabase, query: str, limit: int) -> list:
    """Fallback keyword search for transcript segments."""
    # Extract key terms from query - keep longer words and proper nouns
    words = query.split()
    keywords = []
    for w in words:
        clean = w.strip("?.,!").lower()
        # Keep words > 3 chars, or capitalized words (proper nouns)
        if len(clean) > 3 or (w[0].isupper() and len(clean) > 2):
            keywords.append(clean)

    if not keywords:
        return []

    # Search for segments containing any keyword
    segments = []
    for keyword in keywords[:5]:  # Top 5 keywords
        res = (
            supabase.table("transcript_segments")
            .select(
                """
                id,
                text_content,
                corrected_text_content,
                speaker_name,
                start_time,
                meeting_id,
                meetings(meeting_date, type),
                agenda_items(title)
            """
            )
            .or_(f"text_content.ilike.%{keyword}%,corrected_text_content.ilike.%{keyword}%")
            .limit(limit // max(1, len(keywords[:5])))
            .execute()
        )
        if res.data:
            existing_ids = {s["id"] for s in segments}
            for seg in res.data:
                if seg["id"] not in existing_ids:
                    seg["similarity"] = 0.5  # Placeholder similarity for keyword matches
                    segments.append(seg)

    return segments[:limit]


def semantic_search_motions(
    supabase, embedding_client: EmbeddingClient, query: str, limit: int = 20, threshold: float = 0.5
) -> list:
    """
    Search motions using semantic similarity.
    Finds motions relevant to the query.
    Falls back to keyword search if RPC functions aren't available.
    """
    query_embedding = embedding_client.embed_text(query, task_type="RETRIEVAL_QUERY")

    if not query_embedding or all(v == 0 for v in query_embedding):
        print("    (Embedding failed, using keyword fallback for motions)")
        return _keyword_search_motions(supabase, query, limit)

    try:
        res = supabase.rpc(
            "match_motions",
            {
                "query_embedding": query_embedding,
                "match_threshold": threshold,
                "match_count": limit,
            },
        ).execute()

        if not res.data:
            return []

        # Enrich with full motion details including votes
        motion_ids = [m["id"] for m in res.data]
        enriched = (
            supabase.table("motions")
            .select(
                """
                id,
                text_content,
                plain_english_summary,
                result,
                yes_votes,
                no_votes,
                abstain_votes,
                meeting_id,
                meetings(meeting_date, type),
                votes(vote, person_id, people(name))
            """
            )
            .in_("id", motion_ids)
            .execute()
        )

        similarity_map = {m["id"]: m["similarity"] for m in res.data}
        for motion in enriched.data or []:
            motion["similarity"] = similarity_map.get(motion["id"], 0)

        return sorted(enriched.data or [], key=lambda x: x.get("similarity", 0), reverse=True)

    except Exception as e:
        print(f"    (Semantic search failed for motions: {e}, using keyword fallback)")
        return _keyword_search_motions(supabase, query, limit)


def _keyword_search_motions(supabase, query: str, limit: int) -> list:
    """Fallback keyword search for motions."""
    words = query.split()
    keywords = []
    for w in words:
        clean = w.strip("?.,!").lower()
        if len(clean) > 3 or (w[0].isupper() and len(clean) > 2):
            keywords.append(clean)

    if not keywords:
        return []

    motions = []
    for keyword in keywords[:5]:
        res = (
            supabase.table("motions")
            .select(
                """
                id,
                text_content,
                plain_english_summary,
                result,
                yes_votes,
                no_votes,
                abstain_votes,
                meeting_id,
                meetings(meeting_date, type),
                votes(vote, person_id, people(name))
            """
            )
            .or_(f"text_content.ilike.%{keyword}%,plain_english_summary.ilike.%{keyword}%")
            .limit(limit // max(1, len(keywords[:5])))
            .execute()
        )
        if res.data:
            existing_ids = {m["id"] for m in motions}
            for motion in res.data:
                if motion["id"] not in existing_ids:
                    motion["similarity"] = 0.5
                    motions.append(motion)

    return motions[:limit]


def format_voting_context(votes: list) -> str:
    """Format voting history into a readable context string."""
    if not votes:
        return "No voting history found."

    lines = ["## Voting History\n"]

    # Group by vote type
    yes_votes = [v for v in votes if v["vote"] == "Yes"]
    no_votes = [v for v in votes if v["vote"] == "No"]
    abstain_votes = [v for v in votes if v["vote"] == "Abstain"]
    recused_votes = [v for v in votes if v["vote"] == "Recused"]

    lines.append(f"Total votes analyzed: {len(votes)}")
    lines.append(f"- Yes: {len(yes_votes)}, No: {len(no_votes)}, Abstain: {len(abstain_votes)}, Recused: {len(recused_votes)}\n")

    # Focus on notable votes (No, Abstain, Recused - these show clear positions)
    if no_votes:
        lines.append("### Motions Voted AGAINST (No):\n")
        for v in no_votes[:20]:  # Limit to prevent context overflow
            motion = v.get("motions", {})
            meeting = motion.get("meetings", {}) if motion else {}
            date = meeting.get("meeting_date", "Unknown date")
            text = motion.get("plain_english_summary") or motion.get("text_content", "")[:200]
            lines.append(f"- [{date}] {text}")
        lines.append("")

    if abstain_votes:
        lines.append("### Motions ABSTAINED from:\n")
        for v in abstain_votes[:10]:
            motion = v.get("motions", {})
            meeting = motion.get("meetings", {}) if motion else {}
            date = meeting.get("meeting_date", "Unknown date")
            text = motion.get("plain_english_summary") or motion.get("text_content", "")[:200]
            reason = v.get("recusal_reason", "")
            lines.append(f"- [{date}] {text}" + (f" (Reason: {reason})" if reason else ""))
        lines.append("")

    if recused_votes:
        lines.append("### Motions RECUSED from (conflict of interest):\n")
        for v in recused_votes[:10]:
            motion = v.get("motions", {})
            meeting = motion.get("meetings", {}) if motion else {}
            date = meeting.get("meeting_date", "Unknown date")
            text = motion.get("plain_english_summary") or motion.get("text_content", "")[:200]
            reason = v.get("recusal_reason", "")
            lines.append(f"- [{date}] {text}" + (f" (Reason: {reason})" if reason else ""))
        lines.append("")

    # Sample of yes votes for balance
    if yes_votes:
        lines.append("### Sample of Motions SUPPORTED (Yes):\n")
        for v in yes_votes[:15]:
            motion = v.get("motions", {})
            meeting = motion.get("meetings", {}) if motion else {}
            date = meeting.get("meeting_date", "Unknown date")
            text = motion.get("plain_english_summary") or motion.get("text_content", "")[:200]
            lines.append(f"- [{date}] {text}")

    return "\n".join(lines)


def format_transcript_context(segments: list) -> str:
    """Format transcript segments into a readable context string."""
    if not segments:
        return "No transcript segments found."

    lines = ["## Transcript Excerpts (What They Said)\n"]
    lines.append(f"Total segments: {len(segments)}\n")

    # Group by meeting for readability
    current_meeting = None
    for seg in segments:
        meeting = seg.get("meetings", {})
        meeting_id = seg.get("meeting_id")

        if meeting_id != current_meeting:
            current_meeting = meeting_id
            date = meeting.get("meeting_date", "Unknown")
            mtype = meeting.get("type", "Meeting")
            lines.append(f"\n### {date} - {mtype}\n")

        agenda = seg.get("agenda_items", {})
        topic = agenda.get("title", "") if agenda else ""
        text = seg.get("corrected_text_content") or seg.get("text_content", "")

        if topic:
            lines.append(f"**Re: {topic}**")
        lines.append(f'"{text}"\n')

    return "\n".join(lines)


def format_semantic_context(segments: list, motions: list, person_name: str) -> str:
    """Format semantically retrieved context into a readable string."""
    lines = ["## Semantically Related Context\n"]
    lines.append("(Content found via semantic search relevant to your question)\n")

    if motions:
        lines.append("### Related Motions:\n")
        for m in motions[:10]:
            meeting = m.get("meetings", {})
            date = meeting.get("meeting_date", "Unknown")
            text = m.get("plain_english_summary") or m.get("text_content", "")[:200]
            result = m.get("result", "")
            similarity = m.get("similarity", 0)

            # Find how this person voted on this motion
            person_vote = None
            for v in m.get("votes", []):
                if v.get("people", {}).get("name") == person_name:
                    person_vote = v.get("vote")
                    break

            vote_str = f" - {person_name} voted: {person_vote}" if person_vote else ""
            lines.append(f"- [{date}] (sim: {similarity:.2f}) {text} [Result: {result}]{vote_str}")
        lines.append("")

    if segments:
        lines.append("### Related Transcript Segments:\n")
        for seg in segments[:15]:
            meeting = seg.get("meetings", {})
            date = meeting.get("meeting_date", "Unknown")
            speaker = seg.get("speaker_name", "Unknown")
            text = seg.get("corrected_text_content") or seg.get("text_content", "")
            similarity = seg.get("similarity", 0)
            agenda = seg.get("agenda_items", {})
            topic = agenda.get("title", "") if agenda else ""

            topic_str = f" (Re: {topic})" if topic else ""
            lines.append(f"- [{date}] {speaker}{topic_str} (sim: {similarity:.2f}):")
            lines.append(f'  "{text[:300]}{"..." if len(text) > 300 else ""}"')
        lines.append("")

    if not motions and not segments:
        lines.append("No semantically related content found.")

    return "\n".join(lines)


def analyze_person(
    person_name: str,
    question: str,
    vote_limit: int = 100,
    transcript_limit: int = 200,
    semantic_limit: int = 30,
    verbose: bool = False,
) -> str:
    """
    Main analysis function that retrieves context and queries Gemini.
    Uses both direct retrieval (votes, speaker segments) and semantic search.
    """
    if not all([SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY]):
        return "Error: Missing environment variables (SUPABASE_URL, SUPABASE_SECRET_KEY, GEMINI_API_KEY)"

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    client = genai.Client(api_key=GEMINI_API_KEY)
    embedding_client = EmbeddingClient(api_key=GEMINI_API_KEY)

    # 1. Find the person
    person = get_person_by_name(supabase, person_name)
    if not person:
        return f"Could not find person matching '{person_name}'"

    print(f"Analyzing: {person['name']} (ID: {person['id']})")

    # 2. Retrieve voting history
    print("  Retrieving voting history...")
    votes = get_voting_history(supabase, person["id"], limit=vote_limit)
    voting_context = format_voting_context(votes)

    # 3. Retrieve transcript segments (what they said)
    print("  Retrieving transcript segments...")
    segments = get_transcript_segments(supabase, person["id"], person["name"], limit=transcript_limit)
    transcript_context = format_transcript_context(segments)

    # 4. Semantic search for relevant content based on the question
    print("  Performing semantic search...")
    # Build a search query combining person name and question
    search_query = f"{person['name']} {question}"
    semantic_segments = semantic_search_segments(supabase, embedding_client, search_query, limit=semantic_limit)
    semantic_motions = semantic_search_motions(supabase, embedding_client, search_query, limit=15)
    semantic_context = format_semantic_context(semantic_segments, semantic_motions, person["name"])

    if verbose:
        print("\n" + "=" * 60)
        print("VOTING CONTEXT:")
        print("=" * 60)
        print(voting_context[:2000] + "..." if len(voting_context) > 2000 else voting_context)
        print("\n" + "=" * 60)
        print("TRANSCRIPT CONTEXT (What They Said):")
        print("=" * 60)
        print(transcript_context[:2000] + "..." if len(transcript_context) > 2000 else transcript_context)
        print("\n" + "=" * 60)
        print("SEMANTIC CONTEXT (Related Content):")
        print("=" * 60)
        print(semantic_context[:3000] + "..." if len(semantic_context) > 3000 else semantic_context)
        print("=" * 60 + "\n")

    # 5. Build prompt and query Gemini
    pronouns = person.get("pronouns")
    pronoun_info = get_pronoun_info(pronouns)
    pronoun_note = f"Use {pronoun_info['subject']}/{pronoun_info['object']}/{pronoun_info['possessive']} pronouns when referring to this person." if pronouns else ""

    system_prompt = f"""You are an analyst studying the Town of View Royal council members.
You have access to:
1. A council member's voting history
2. Transcript excerpts of what they said in meetings
3. Semantically related content (motions and discussions relevant to the question)

Base your analysis ONLY on the provided evidence. Cite specific votes or quotes when possible.
Be balanced and objective. If there isn't enough evidence to answer confidently, say so.

The person being analyzed is: {person['name']}
{pronoun_note}
"""

    user_prompt = f"""Here is the evidence about {person['name']}:

{voting_context}

{transcript_context}

{semantic_context}

---

Based on this evidence, please answer the following question:

{question}
"""

    print("  Querying Gemini for analysis...")
    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=user_prompt,
            config={
                "system_instruction": system_prompt,
                "temperature": 0.3,  # Lower temperature for more factual responses
            },
        )
        return response.text
    except Exception as e:
        return f"Error querying Gemini: {e}"


def interactive_mode(person_name: str):
    """Run an interactive Q&A session about a person."""
    print(f"\n{'='*60}")
    print(f"Interactive Analysis Mode: {person_name}")
    print("Type 'quit' or 'exit' to end the session.")
    print("=" * 60 + "\n")

    while True:
        try:
            question = input("\nYour question: ").strip()
            if question.lower() in ["quit", "exit", "q"]:
                print("Goodbye!")
                break
            if not question:
                continue

            print("\nAnalyzing...\n")
            result = analyze_person(person_name, question)
            print("\n" + "-" * 40)
            print(result)
            print("-" * 40)

        except KeyboardInterrupt:
            print("\n\nGoodbye!")
            break


def main():
    parser = argparse.ArgumentParser(
        description="Analyze a council member's positions based on voting history and transcripts."
    )
    parser.add_argument("person", help="Name of the person to analyze")
    parser.add_argument("question", nargs="?", help="Question to ask about the person")
    parser.add_argument(
        "--interactive", "-i", action="store_true", help="Enter interactive Q&A mode"
    )
    parser.add_argument(
        "--vote-limit", type=int, default=100, help="Max votes to retrieve (default: 100)"
    )
    parser.add_argument(
        "--transcript-limit",
        type=int,
        default=200,
        help="Max transcript segments to retrieve (default: 200)",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Show retrieved context"
    )

    args = parser.parse_args()

    if args.interactive:
        interactive_mode(args.person)
    elif args.question:
        result = analyze_person(
            args.person,
            args.question,
            vote_limit=args.vote_limit,
            transcript_limit=args.transcript_limit,
            verbose=args.verbose,
        )
        print("\n" + result)
    else:
        # Default question if none provided
        default_question = "Based on their voting record and statements, what are this person's key priorities and positions? What do they seem to support or oppose?"
        result = analyze_person(
            args.person,
            default_question,
            vote_limit=args.vote_limit,
            transcript_limit=args.transcript_limit,
            verbose=args.verbose,
        )
        print("\n" + result)


if __name__ == "__main__":
    main()
