import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { generateQueryEmbedding } from "../lib/embeddings.server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

// Server-side Supabase client with service role key — lazily initialized
// to avoid calling setInterval in global scope (breaks Cloudflare Workers)
let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
  }
  return _supabase;
}

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI | null {
  if (!GEMINI_API_KEY) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return genAI;
}

interface Person {
  id: number;
  name: string;
  pronouns?: string;
  is_councillor: boolean;
}

interface VoteRow {
  vote: string;
  recusal_reason?: string;
  motions:
    | {
        id: number;
        text_content: string;
        plain_english_summary?: string;
        result?: string;
        meetings:
          | {
              meeting_date: string;
            }
          | {
              meeting_date: string;
            }[];
      }
    | {
        id: number;
        text_content: string;
        plain_english_summary?: string;
        result?: string;
        meetings:
          | {
              meeting_date: string;
            }
          | {
              meeting_date: string;
            }[];
      }[];
}

interface Vote {
  vote: string;
  recusal_reason?: string;
  motions: {
    id: number;
    text_content: string;
    plain_english_summary?: string;
    result?: string;
    meetings: {
      meeting_date: string;
    };
  } | null;
}

interface TranscriptSegmentRow {
  id: number;
  text_content: string;
  corrected_text_content?: string;
  speaker_name?: string;
  person_id: number | null;
  start_time: number;
  meeting_id: number;
  meetings:
    | {
        meeting_date: string;
        type?: string;
      }
    | {
        meeting_date: string;
        type?: string;
      }[];
  agenda_items:
    | {
        title: string;
      }
    | {
        title: string;
      }[];
}

/**
 * Defines the structure for a tool that the AI agent can use.
 * @template T - The input arguments object for the tool.
 * @template R - The return type of the tool.
 */
export type AgentEvent =
  | { type: "thought"; thought: string }
  | { type: "tool_call"; name: string; args: any }
  | { type: "tool_observation"; name: string; result: any }
  | { type: "final_answer_chunk"; chunk: string }
  | { type: "sources"; sources: any[] }
  | { type: "done" };

interface Tool<T extends Record<string, any>, R> {
  name: string;
  description: string;
  call: (args: T) => Promise<R>;
}

interface TranscriptSegment {
  id: number;
  text_content: string;
  corrected_text_content?: string;
  speaker_name?: string;
  person_id: number | null;
  start_time: number;
  meeting_id: number;
  meetings?: {
    meeting_date: string;
    type?: string;
  };
  agenda_items?: {
    title: string;
  };
}

/**
 * Transform Supabase row data to our expected types
 * Supabase returns foreign key relations as arrays (1-to-many) or objects (many-to-1)
 * We handle both to be safe.
 */
function transformVoteRow(row: VoteRow): Vote {
  const rawMotion = row.motions;
  const motion = Array.isArray(rawMotion) ? rawMotion[0] : rawMotion;

  let meeting = null;
  if (motion?.meetings) {
    meeting = Array.isArray(motion.meetings)
      ? motion.meetings[0]
      : motion.meetings;
  }

  return {
    vote: row.vote,
    recusal_reason: row.recusal_reason,
    motions: motion
      ? {
          id: motion.id,
          text_content: motion.text_content,
          plain_english_summary: motion.plain_english_summary,
          result: motion.result,
          meetings: meeting || { meeting_date: "Unknown" },
        }
      : null,
  };
}

function transformSegmentRow(row: TranscriptSegmentRow): TranscriptSegment {
  const rawMeeting = row.meetings;
  const meeting = Array.isArray(rawMeeting) ? rawMeeting[0] : rawMeeting;

  const rawAgenda = row.agenda_items;
  const agenda = Array.isArray(rawAgenda) ? rawAgenda[0] : rawAgenda;

  return {
    id: row.id,
    text_content: row.text_content,
    corrected_text_content: row.corrected_text_content,
    speaker_name: row.speaker_name,
    person_id: row.person_id,
    start_time: row.start_time,
    meeting_id: row.meeting_id,
    meetings: meeting,
    agenda_items: agenda,
  };
}

/**
 * Look up a person by ID or name
 */
async function getPerson(identifier: string | number): Promise<Person | null> {
  if (typeof identifier === "number" || !isNaN(Number(identifier))) {
    const { data } = await getSupabase()
      .from("people")
      .select("id, name, pronouns, is_councillor")
      .eq("id", Number(identifier))
      .single();
    return data;
  }

  // Try name match
  const { data } = await getSupabase()
    .from("people")
    .select("id, name, pronouns, is_councillor")
    .ilike("name", `%${identifier}%`)
    .limit(1)
    .single();
  return data;
}

/**
 * Get overall voting statistics for a person using SQL aggregates
 * to avoid Supabase's default 1000-row limit.
 */
async function getVoteStats(
  personId: number,
): Promise<{ total: number; yes: number; no: number; abstain: number }> {
  const { data, error } = await getSupabase().rpc("get_vote_stats_for_person", {
    p_person_id: personId,
  });

  if (error || !data || data.length === 0) {
    // Fallback: try raw count queries
    const { count: total } = await getSupabase()
      .from("votes")
      .select("*", { count: "exact", head: true })
      .eq("person_id", personId);

    const { count: yes } = await getSupabase()
      .from("votes")
      .select("*", { count: "exact", head: true })
      .eq("person_id", personId)
      .in("vote", ["Yes", "In Favour"]);

    const { count: no } = await getSupabase()
      .from("votes")
      .select("*", { count: "exact", head: true })
      .eq("person_id", personId)
      .in("vote", ["No", "Opposed"]);

    const { count: abstain } = await getSupabase()
      .from("votes")
      .select("*", { count: "exact", head: true })
      .eq("person_id", personId)
      .eq("vote", "Abstain");

    return {
      total: total || 0,
      yes: yes || 0,
      no: no || 0,
      abstain: abstain || 0,
    };
  }

  const row = data[0];
  return {
    total: row.total || 0,
    yes: row.yes_count || 0,
    no: row.no_count || 0,
    abstain: row.abstain_count || 0,
  };
}

/**
 * Get specifically opposed votes (No/Abstain) with details
 */
async function getOpposedVotes(personId: number, limit = 20): Promise<Vote[]> {
  const { data } = await getSupabase()
    .from("votes")
    .select(
      `
      vote,
      recusal_reason,
      motions(
        id,
        text_content,
        plain_english_summary,
        result,
        meetings(meeting_date)
      )
    `,
    )
    .eq("person_id", personId)
    .in("vote", ["No", "Abstain", "Opposed"])
    .limit(100);

  if (!data) return [];

  // Sort by meeting date descending
  const sorted = data.sort((a: any, b: any) => {
    const dateA = a.motions?.meetings?.meeting_date || "";
    const dateB = b.motions?.meetings?.meeting_date || "";
    return dateB.localeCompare(dateA);
  });

  return sorted.slice(0, limit).map((row: VoteRow) => transformVoteRow(row));
}

/**
 * Get recent voting history (mix of all votes)
 */
async function getRecentVotes(personId: number, limit = 20): Promise<Vote[]> {
  const { data } = await getSupabase()
    .from("votes")
    .select(
      `
      vote,
      recusal_reason,
      motions(
        id,
        text_content,
        plain_english_summary,
        result,
        meetings(meeting_date)
      )
    `,
    )
    .eq("person_id", personId)
    .limit(100);

  if (!data) return [];

  // Sort by meeting date descending
  const sorted = data.sort((a: any, b: any) => {
    const dateA = a.motions?.meetings?.meeting_date || "";
    const dateB = b.motions?.meetings?.meeting_date || "";
    return dateB.localeCompare(dateA);
  });

  return sorted.slice(0, limit).map((row: VoteRow) => transformVoteRow(row));
}

/**
 * A tool to get the complete voting history for a specific person.
 * It fetches their overall stats, a sample of their opposed votes, and their most recent votes.
 * @param person_name The full name of the person to look up.
 * @returns An object containing voting stats, opposed votes, and recent votes, or an error string if not found.
 */
async function get_voting_history(person_name: string) {
  const person = await getPerson(person_name);
  if (!person) {
    return `Error: Person named "${person_name}" not found.`;
  }

  const [voteStats, opposedVotes, recentVotes] = await Promise.all([
    getVoteStats(person.id),
    getOpposedVotes(person.id),
    getRecentVotes(person.id),
  ]);

  return {
    stats: voteStats,
    opposed_votes: opposedVotes,
    recent_votes: recentVotes,
  };
}

/**
 * A tool to find all statements made by a specific person, optionally filtered by a topic.
 * This tool is aware of speaker aliases and is the most reliable way to find what someone said.
 * @param person_name The full name of the person to look up.
 * @param topic (Optional) A keyword or topic to filter the statements by.
 * @returns A list of relevant transcript segments, or an error string if the person is not found.
 */
async function get_statements_by_person({
  person_name,
  topic,
}: {
  person_name: string;
  topic?: string;
}) {
  const person = await getPerson(person_name);
  if (!person) {
    return `Error: Person named "${person_name}" not found.`;
  }

  // Get all direct segments and aliased segments
  const aliases = await getSpeakerAliases(person.id);

  // Build a query filter for aliased segments: (meeting_id = X AND speaker_name = Y) OR ...
  const aliasFilters = aliases.map(
    (a) =>
      `and(meeting_id.eq.${a.meeting_id},speaker_name.eq.${a.speaker_label})`,
  );

  let queryBuilder = getSupabase()
    .from("transcript_segments")
    .select(
      `
        id,
        text_content,
        corrected_text_content,
        speaker_name,
        person_id,
        start_time,
        meeting_id,
        meetings(meeting_date, type),
        agenda_items(title)
      `,
    )
    .or(`person_id.eq.${person.id},${aliasFilters.join(",")}`);

  if (topic) {
    queryBuilder = queryBuilder.ilike("text_content", `%${topic}%`);
  }

  const { data, error } = await queryBuilder
    .order("meeting_id", { ascending: false })
    .order("start_time", { ascending: true })
    .limit(50);

  if (error) {
    console.error("Error fetching statements by person:", error);
    return `Error: An error occurred while fetching statements for ${person_name}.`;
  }

  return (data || []).map((row: TranscriptSegmentRow) =>
    transformSegmentRow(row),
  );
}

/**
 * Get speaker aliases for a person
 */
async function getSpeakerAliases(
  personId: number,
): Promise<{ meeting_id: number; speaker_label: string }[]> {
  const { data } = await getSupabase()
    .from("meeting_speaker_aliases")
    .select("meeting_id, speaker_label")
    .eq("person_id", personId);

  return data || [];
}

/**
 * Semantic search for relevant transcript segments.
 * When after_date is set, fetches more vector matches to compensate for date filtering.
 */
async function search_transcript_segments({
  query,
  after_date,
}: {
  query: string;
  after_date?: string;
}): Promise<TranscriptSegment[]> {
  const embedding = await generateQueryEmbedding(query);
  if (!embedding) return [];

  try {
    // Fetch more candidates when filtering by date, since many may be filtered out
    const matchCount = after_date ? 100 : 25;
    const threshold = 0.5;

    const { data } = await getSupabase().rpc("match_transcript_segments", {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: matchCount,
      filter_meeting_id: null,
    });

    if (!data || data.length === 0) return [];

    const segmentIds = data.map((s: any) => s.id);

    let enrichQuery = getSupabase()
      .from("transcript_segments")
      .select(
        `
        id,
        text_content,
        corrected_text_content,
        speaker_name,
        person_id,
        start_time,
        meeting_id,
        meetings!inner(meeting_date, type),
        agenda_items(title)
      `,
      )
      .in("id", segmentIds);

    if (after_date) {
      enrichQuery = enrichQuery.gte("meetings.meeting_date", after_date);
    }

    const { data: enriched } = await enrichQuery;

    const results = (enriched || []).map((row: TranscriptSegmentRow) =>
      transformSegmentRow(row),
    );

    return results.slice(0, 25);
  } catch (error) {
    console.error("Transcript search failed:", error);
    return [];
  }
}

/**
 * Semantic search for relevant motions.
 * When after_date is set, fetches more vector matches to compensate for date filtering.
 */
async function search_motions({
  query,
  after_date,
}: {
  query: string;
  after_date?: string;
}): Promise<any[]> {
  const embedding = await generateQueryEmbedding(query);
  if (!embedding) return [];

  try {
    // Fetch more candidates when filtering by date
    const matchCount = after_date ? 50 : 15;

    const { data } = await getSupabase().rpc("match_motions", {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: matchCount,
    });

    if (!data || data.length === 0) return [];

    const motionIds = data.map((m: any) => m.id);

    let enrichQuery = getSupabase()
      .from("motions")
      .select(
        `
        id,
        text_content,
        plain_english_summary,
        result,
        meetings!inner(meeting_date),
        votes(vote, person_id, people(name))
      `,
      )
      .in("id", motionIds);

    if (after_date) {
      enrichQuery = enrichQuery.gte("meetings.meeting_date", after_date);
    }

    const { data: enriched } = await enrichQuery;

    const similarityMap = new Map(data.map((m: any) => [m.id, m.similarity]));
    return (enriched || []).map((m: any) => ({
      ...m,
      similarity: similarityMap.get(m.id) || 0,
    }));
  } catch (error) {
    console.error("Semantic search for motions failed:", error);
    return [];
  }
}

/**
 * Semantic search for matters (ongoing topics that span multiple meetings).
 */
async function search_matters({
  query,
  status,
}: {
  query: string;
  status?: string;
}): Promise<any[]> {
  const embedding = await generateQueryEmbedding(query);
  if (!embedding) return [];

  try {
    const { data } = await getSupabase().rpc("match_matters", {
      query_embedding: embedding,
      match_threshold: 0.45,
      match_count: 15,
    });

    if (!data || data.length === 0) return [];

    const matterIds = data.map((m: any) => m.id);

    let enrichQuery = getSupabase()
      .from("matters")
      .select(
        `
        id,
        title,
        identifier,
        description,
        plain_english_summary,
        category,
        status,
        first_seen,
        last_seen
      `,
      )
      .in("id", matterIds);

    if (status) {
      enrichQuery = enrichQuery.eq("status", status);
    }

    const { data: enriched } = await enrichQuery;

    const similarityMap = new Map(data.map((m: any) => [m.id, m.similarity]));
    return (enriched || [])
      .map((m: any) => ({
        ...m,
        similarity: similarityMap.get(m.id) || 0,
      }))
      .sort((a: any, b: any) =>
        (b.last_seen || "").localeCompare(a.last_seen || ""),
      );
  } catch (error) {
    console.error("Semantic search for matters failed:", error);
    return [];
  }
}

/**
 * Search agenda items by keyword. Uses text search since embeddings are sparse.
 */
async function search_agenda_items({
  query,
  after_date,
}: {
  query: string;
  after_date?: string;
}): Promise<any[]> {
  try {
    let searchQuery = getSupabase()
      .from("agenda_items")
      .select(
        `
        id,
        meeting_id,
        title,
        plain_english_summary,
        debate_summary,
        category,
        financial_cost,
        keywords,
        meetings!inner(meeting_date, type)
      `,
      )
      .or(
        `title.ilike.%${query}%,plain_english_summary.ilike.%${query}%,debate_summary.ilike.%${query}%`,
      )
      .not("category", "eq", "Procedural")
      .order("meeting_id", { ascending: false })
      .limit(20);

    if (after_date) {
      searchQuery = searchQuery.gte("meetings.meeting_date", after_date);
    }

    const { data, error } = await searchQuery;

    if (error) {
      console.error("Agenda item search failed:", error);
      return [];
    }

    return (data || []).map((row: any) => {
      const meeting = Array.isArray(row.meetings)
        ? row.meetings[0]
        : row.meetings;
      return {
        ...row,
        meetings: meeting,
      };
    });
  } catch (error) {
    console.error("Agenda item search failed:", error);
    return [];
  }
}

/**
 * A tool to get the current date.
 * @returns The current date in YYYY-MM-DD format.
 */
async function get_current_date(): Promise<string> {
  return new Date().toISOString().split("T")[0];
}

const tools: Tool<any, any>[] = [
  {
    name: "get_statements_by_person",
    description:
      "get_statements_by_person(person_name: string, topic?: string) — Finds all statements made by a specific person, optionally filtered by a keyword topic. This is the most reliable way to find what someone said, as it handles speaker aliases.",
    call: async ({
      person_name,
      topic,
    }: {
      person_name: string;
      topic?: string;
    }) => get_statements_by_person({ person_name, topic }),
  },
  {
    name: "get_voting_history",
    description:
      "get_voting_history(person_name: string) — Retrieves the complete voting record for a specific person, including their overall stats, a sample of their opposed votes, and their most recent votes. Use this when asked about a person's voting record, stances, or political beliefs.",
    call: async ({ person_name }: { person_name: string }) =>
      get_voting_history(person_name),
  },
  {
    name: "search_motions",
    description:
      'search_motions(query: string, after_date?: string) — Searches for motions relevant to a query. Useful for finding official decisions, outcomes, and discussions on specific topics. after_date filters to results on or after that date (YYYY-MM-DD format, e.g. "2025-01-01").',
    call: async ({
      query,
      after_date,
    }: {
      query: string;
      after_date?: string;
    }) => search_motions({ query, after_date }),
  },
  {
    name: "search_transcript_segments",
    description:
      'search_transcript_segments(query: string, after_date?: string) — Performs a general semantic search for transcript segments relevant to a topic. Use this when you want to find out what was said about a topic by *anyone*, not a specific person. after_date filters to results on or after that date (YYYY-MM-DD format, e.g. "2025-01-01").',
    call: async ({
      query,
      after_date,
    }: {
      query: string;
      after_date?: string;
    }) => search_transcript_segments({ query, after_date }),
  },
  {
    name: "search_matters",
    description:
      'search_matters(query: string, status?: string) — Searches for ongoing council matters/topics by semantic similarity. Matters represent issues that span multiple meetings (e.g. "Zoning Bylaw Amendment for 123 Main St", "OCP Housing Update"). Returns title, category, status, first_seen/last_seen dates. Optional status filter: "Active", "Adopted", "Completed", "Defeated". Best for broad "what is council working on?" questions or finding the history of a specific issue.',
    call: async ({ query, status }: { query: string; status?: string }) =>
      search_matters({ query, status }),
  },
  {
    name: "search_agenda_items",
    description:
      'search_agenda_items(query: string, after_date?: string) — Searches agenda items by keyword match on title, summary, and debate summary. Returns structured data including plain_english_summary, debate_summary, category, financial_cost, and meeting date. Best for finding what was discussed at specific meetings or getting summaries of discussions on a topic. Use short keywords (e.g. "housing", "budget", "park").',
    call: async ({
      query,
      after_date,
    }: {
      query: string;
      after_date?: string;
    }) => search_agenda_items({ query, after_date }),
  },
  {
    name: "get_current_date",
    description:
      "get_current_date() — Returns the current date in YYYY-MM-DD format. Use this as the first step for any question involving a recent timeframe like 'recent', 'latest', 'this year', 'last month', etc.",
    call: async () => get_current_date(),
  },
];

const orchestratorSystemPrompt = `You are a research agent for the Town of View Royal, British Columbia. Citizens ask you questions about their municipal council and you gather evidence from council records (transcripts, motions, votes) to answer them.

You operate in a loop. Each turn you output **exactly one raw JSON object** — no markdown fences, no commentary:

{"thought":"...","action":{"tool_name":"...","tool_args":{...}}}

When you have gathered enough evidence, signal completion:

{"thought":"...","action":{"final_answer":true}}

A separate synthesis model will write the final user-facing answer from your gathered evidence. Your job is only to gather the right evidence.

## Strategy

**1. Classify the question first.** In your first thought, identify:
- Is it about a **specific person**? → Use person tools.
- Is it about a **topic or policy**? → Use search tools.
- Is it about **recent** events? → Call get_current_date first.
- Is it a **comparison** (e.g. "How do councillors differ on X")? → You'll need multiple tool calls for different people or both motions + transcripts.

**2. Choose the right tool for the job:**
- \`get_statements_by_person\` — Best for "What has [person] said about [topic]?" Pass a short keyword as topic (e.g. "housing", "budget", "climate"), not a full sentence.
- \`get_voting_history\` — Best for "How does [person] vote?" or "What are [person]'s positions?" Returns stats + specific opposed votes + recent votes.
- \`search_matters\` — Best for broad overview questions: "What is council working on?", "What's happening with housing?", "What issues are active?" Matters are high-level topics that span multiple meetings. Can filter by status (Active, Adopted, Completed, Defeated).
- \`search_agenda_items\` — Best for finding structured summaries of what was discussed at meetings. Returns plain English summaries and debate summaries. Good for "What was discussed about X?" or "What happened at the last meeting about Y?" Uses keyword matching, so use short specific terms.
- \`search_motions\` — Best for "What decisions has council made about [topic]?" or "Has council voted on [topic]?" Use short, specific queries (e.g. "affordable housing", "tree bylaw", "speed limits").
- \`search_transcript_segments\` — Best for finding exact quotes and what specific things were said in debate. Use when you need verbatim statements or context around discussions.
- \`get_current_date\` — Call this FIRST if the question contains temporal words like "recent", "latest", "this year", "last month", "past 6 months". Then use the date as after_date on subsequent calls.

**3. Craft good search queries.** The search tools use semantic/vector search. Short, specific phrases work best:
- Good: "affordable housing development"
- Bad: "What has the council discussed regarding affordable housing developments in the town?"
- Good: "tree cutting bylaw"
- Bad: "Tell me about trees"

**4. Know when to stop.** 2-3 tool calls is typical. After each result, assess: do you have enough specific evidence (dates, names, quotes, vote counts) to answer the question? If yes, finalize. Don't call tools just to be thorough — extra noise hurts answer quality.

**5. Handle edge cases:**
- If a person is not found, try alternate name spellings or just their last name.
- If search returns few results, try rephrasing with different keywords.
- Never call the same tool with the same arguments twice.

## Available Tools

${tools.map((t) => `- ${t.description}`).join("\n")}

## Output Format

Raw JSON only. No markdown. No text before or after the JSON object.`;

const finalSystemPrompt = `You are a civic transparency analyst for the Town of View Royal, British Columbia. You help citizens understand what their municipal council has discussed, decided, and debated.

You will receive a citizen's question and raw evidence gathered from official council records — transcripts, motions, and votes. Your job is to synthesize this into a clear, trustworthy answer.

## Writing Style

- **Tone:** Neutral, informative, and accessible. Write for a general audience, not policy experts. Avoid jargon.
- **Voice:** Third-person factual reporting. Never editorialize or express opinions.
- **Length:** 150-400 words. Shorter is better if the evidence is straightforward.

## Structure

1. **Lead with a direct answer.** The first 1-2 sentences should directly answer the question. If the evidence doesn't support a clear answer, say so upfront.

2. **Support with specifics.** Use bullet points or short paragraphs. Include:
   - Exact dates of meetings
   - Names of speakers (councillors, staff, public)
   - Vote outcomes (e.g. "passed 5-2" or "carried unanimously")
   - Brief quotes when they capture a key point

3. **Cite with numbered references.** Use inline citations like [1], [2] etc. that correspond to the numbered source list provided. Weave them naturally into the prose:
   - Good: "At the January 15, 2025 council meeting, Councillor Lemon noted that... [1]"
   - Good: "Council voted 5-2 to approve the rezoning [3], following public input at the November hearing [1][2]."
   - Bad: "According to Source 3, the councillor said..."
   - Place citations at the end of the sentence or clause they support. Use multiple citations when a claim draws from several sources.

4. **Handle contradictions.** If the evidence shows different viewpoints or conflicting positions, present both sides fairly. Note who said what and when.

5. **Handle insufficient evidence.** If the evidence is thin or doesn't fully answer the question:
   - State clearly what you found and what's missing
   - Suggest what the citizen could search for (e.g. "You might find more detail by searching for 'Official Community Plan' or looking at Committee of the Whole meetings")
   - Never pad the answer with filler or speculation

## Formatting

- Use **bold** for key terms, names on first mention, and outcomes
- Use ### headers only if the answer genuinely covers 2+ distinct subtopics
- Use bullet points for lists of decisions, votes, or key points
- Keep paragraphs to 2-3 sentences max`;

/**
 * Normalize raw tool results into a consistent source shape for the client.
 */
interface NormalizedSource {
  type: "transcript" | "motion" | "vote";
  id: number;
  meeting_id: number;
  meeting_date: string;
  title: string;
  speaker_name?: string;
}

function normalizeTranscriptSources(
  segments: TranscriptSegment[],
): NormalizedSource[] {
  return segments.map((s) => ({
    type: "transcript" as const,
    id: s.id,
    meeting_id: s.meeting_id,
    meeting_date: s.meetings?.meeting_date || "Unknown",
    title: (s.corrected_text_content || s.text_content || "").slice(0, 120),
    speaker_name: s.speaker_name,
  }));
}

function normalizeMotionSources(motions: any[]): NormalizedSource[] {
  return motions.map((m) => {
    const meeting = Array.isArray(m.meetings) ? m.meetings[0] : m.meetings;
    return {
      type: "motion" as const,
      id: m.id,
      meeting_id: meeting?.id || m.meeting_id || 0,
      meeting_date: meeting?.meeting_date || "Unknown",
      title: m.plain_english_summary || (m.text_content || "").slice(0, 120),
    };
  });
}

function normalizeVoteSources(votes: Vote[]): NormalizedSource[] {
  return votes
    .filter((v) => v.motions)
    .map((v) => ({
      type: "vote" as const,
      id: v.motions!.id,
      meeting_id: 0,
      meeting_date: v.motions!.meetings?.meeting_date || "Unknown",
      title:
        v.motions!.plain_english_summary ||
        (v.motions!.text_content || "").slice(0, 120),
    }));
}

function normalizeMatterSources(matters: any[]): NormalizedSource[] {
  return matters.map((m) => ({
    type: "motion" as const, // Reuse motion type for link routing
    id: m.id,
    meeting_id: 0,
    meeting_date: m.last_seen || m.first_seen || "Unknown",
    title: m.title || (m.plain_english_summary || "").slice(0, 120),
  }));
}

function normalizeAgendaItemSources(items: any[]): NormalizedSource[] {
  return items.map((item) => ({
    type: "transcript" as const, // Reuse transcript type for link routing
    id: item.id,
    meeting_id: item.meeting_id || 0,
    meeting_date: item.meetings?.meeting_date || "Unknown",
    title: item.plain_english_summary || item.title || "",
  }));
}

/**
 * Truncate tool result JSON to a reasonable size for the context window.
 * Keeps the first `maxItems` items for arrays, or truncates raw strings.
 */
function truncateForContext(result: any, maxItems = 15): string {
  if (typeof result === "string") {
    return result.slice(0, 2000);
  }
  if (Array.isArray(result)) {
    const sliced = result.slice(0, maxItems);
    return JSON.stringify(sliced, null, 0);
  }
  if (typeof result === "object" && result !== null) {
    // For voting history objects, truncate inner arrays
    const truncated: any = {};
    for (const [key, value] of Object.entries(result)) {
      if (Array.isArray(value)) {
        truncated[key] = (value as any[]).slice(0, maxItems);
      } else {
        truncated[key] = value;
      }
    }
    return JSON.stringify(truncated, null, 0);
  }
  return String(result);
}

export async function* runQuestionAgent(
  question: string,
  context?: string,
  maxSteps = 6,
): AsyncGenerator<AgentEvent> {
  const client = getGenAI();
  if (!client) throw new Error("Gemini API not configured");

  const model = client.getGenerativeModel({
    model: "gemini-flash-latest",
  });

  const history: string[] = [];
  const allSources: NormalizedSource[] = [];

  if (context) {
    history.push(
      `Previous conversation context:\nQ: ${context}\n(The user is asking a follow-up question.)`,
    );
  }

  for (let i = 0; i < maxSteps; i++) {
    const userPrompt = `User question: "${question}"

History:
${history.join("\n\n") || "(none)"}

Respond with a single JSON object. No markdown fences.`;

    const result = await model.generateContent([
      orchestratorSystemPrompt,
      userPrompt,
    ]);
    const responseText = result.response.text().trim();

    let agentResponse;
    try {
      // Try parsing raw JSON first, then try extracting from code fences
      const cleaned = responseText
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/, "")
        .trim();
      agentResponse = JSON.parse(cleaned);
    } catch (e) {
      const observation = `Error: Your response was not valid JSON. Respond with ONLY a JSON object, no markdown. Your response started with: "${responseText.slice(0, 100)}"`;
      history.push(observation);
      yield { type: "tool_observation", name: "error", result: observation };
      continue;
    }

    const { thought, action } = agentResponse;
    if (thought) {
      yield { type: "thought", thought };
    }

    // Agent signals it's done gathering evidence
    if (action.final_answer === true || action.final_answer === "true") {
      break;
    }

    // Legacy support: if the agent wrote a string final_answer, skip to synthesis
    if (
      typeof action.final_answer === "string" &&
      action.final_answer.length > 0
    ) {
      break;
    }

    const { tool_name, tool_args } = action;
    const tool = tools.find((t) => t.name === tool_name);

    if (!tool) {
      const observation = `Error: Tool "${tool_name}" not found. Available tools: ${tools.map((t) => t.name).join(", ")}`;
      history.push(observation);
      yield { type: "tool_observation", name: "error", result: observation };
      continue;
    }

    yield { type: "tool_call", name: tool_name, args: tool_args || {} };

    const toolResult = await tool.call(tool_args || {});

    // Build a concise but complete context string for the orchestrator
    const contextStr = truncateForContext(toolResult);
    const observation = `Result from ${tool_name}:\n${contextStr}`;
    history.push(observation);

    // Build a short display summary for the client UI
    const displaySummary =
      typeof toolResult === "string"
        ? toolResult.slice(0, 200)
        : Array.isArray(toolResult)
          ? `Found ${toolResult.length} results`
          : "Results retrieved";

    yield { type: "tool_observation", name: tool_name, result: displaySummary };

    // Collect normalized sources based on tool type
    if (Array.isArray(toolResult) && toolResult.length > 0) {
      if (tool_name === "search_matters") {
        allSources.push(...normalizeMatterSources(toolResult));
      } else if (tool_name === "search_agenda_items") {
        allSources.push(...normalizeAgendaItemSources(toolResult));
      } else {
        const first = toolResult[0];
        if (first.text_content !== undefined) {
          allSources.push(...normalizeTranscriptSources(toolResult));
        } else if (
          first.plain_english_summary !== undefined ||
          first.result !== undefined
        ) {
          allSources.push(...normalizeMotionSources(toolResult));
        }
      }
    } else if (typeof toolResult === "object" && toolResult !== null) {
      if (toolResult.opposed_votes || toolResult.recent_votes) {
        allSources.push(
          ...normalizeVoteSources(toolResult.opposed_votes || []),
          ...normalizeVoteSources(toolResult.recent_votes || []),
        );
      }
    }
  }

  // Deduplicate sources by type+id
  const sourceMap = new Map<string, NormalizedSource>();
  for (const s of allSources) {
    sourceMap.set(`${s.type}:${s.id}`, s);
  }
  const uniqueSources = Array.from(sourceMap.values());
  yield { type: "sources", sources: uniqueSources };

  // Build numbered source reference for the model
  const sourceReference = uniqueSources
    .map(
      (s, i) =>
        `[${i + 1}] ${s.meeting_date} — ${s.title}${s.speaker_name ? ` (${s.speaker_name})` : ""}`,
    )
    .join("\n");

  // Always run final synthesis with full raw evidence
  const finalUserPrompt = `Question: ${question}

Raw Evidence from Council Records:
${history.join("\n\n---\n\n")}

Source Reference (use these numbers for inline citations):
${sourceReference}

Synthesize a final answer based *only* on the evidence above. Use [1], [2], etc. to cite sources inline.`;

  const stream = await model.generateContentStream([
    finalSystemPrompt,
    finalUserPrompt,
  ]);
  for await (const chunk of stream.stream) {
    yield { type: "final_answer_chunk", chunk: chunk.text() };
  }

  yield { type: "done" };
}
