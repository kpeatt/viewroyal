import { GoogleGenAI } from "@google/genai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateQueryEmbedding } from "../lib/embeddings.server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

// Server-side Supabase client with service role key — lazily initialized
// to avoid calling setInterval in global scope (breaks Cloudflare Workers)
let _supabase: SupabaseClient | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
  }
  return _supabase;
}

let genAI: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI | null {
  if (!GEMINI_API_KEY) return null;
  if (!genAI) {
    genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
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
  | { type: "suggested_followups"; followups: string[] }
  | { type: "trace_id"; traceId: string }
  | { type: "done" };

interface Tool<T extends Record<string, any>, R> {
  name: string;
  description: string;
  call: (args: T) => Promise<R>;
}

interface TranscriptSegment {
  id: number;
  text_content: string;
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

  const transcriptResults = (data || []).map((row: TranscriptSegmentRow) =>
    transformSegmentRow(row),
  );

  // Also fetch key_statements for this person
  let ksQuery = getSupabase()
    .from("key_statements")
    .select(
      `
      id,
      meeting_id,
      speaker_name,
      statement_type,
      statement_text,
      context,
      meetings(meeting_date, type),
      agenda_items(title)
    `,
    )
    .eq("person_id", person.id);

  if (topic) {
    ksQuery = ksQuery.textSearch("statement_text", topic);
  }

  const { data: ksData } = await ksQuery
    .order("meeting_id", { ascending: false })
    .limit(20);

  const keyStatements = (ksData || []).map((row: any) => {
    const meeting = Array.isArray(row.meetings)
      ? row.meetings[0]
      : row.meetings;
    return {
      type: "key_statement" as const,
      id: row.id,
      meeting_id: row.meeting_id,
      statement_type: row.statement_type,
      statement_text: row.statement_text,
      context: row.context,
      speaker_name: row.speaker_name,
      meetings: meeting,
      agenda_items: row.agenda_items,
    };
  });

  return { transcript_segments: transcriptResults, key_statements: keyStatements };
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
  try {
    // Use full-text search on tsvector column (transcript embeddings were removed)
    const tsQuery = query
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .join(" & ");
    if (!tsQuery) return [];

    let enrichQuery = getSupabase()
      .from("transcript_segments")
      .select(
        `
        id,
        text_content,
        speaker_name,
        person_id,
        start_time,
        meeting_id,
        meetings!inner(meeting_date, type),
        agenda_items(title)
      `,
      )
      .textSearch("text_search", tsQuery)
      .limit(25);

    if (after_date) {
      enrichQuery = enrichQuery.gte("meetings.meeting_date", after_date);
    }

    const { data: enriched } = await enrichQuery;

    const results = (enriched || []).map((row: TranscriptSegmentRow) =>
      transformSegmentRow(row),
    );

    return results;
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
    // Build full-text search query from input words
    const tsQuery = query
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .join(" & ");

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
      .textSearch("text_search", tsQuery || query)
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
 * Search key statements (claims, proposals, objections, etc.) using vector similarity
 */
async function search_key_statements({
  query,
  after_date,
}: {
  query: string;
  after_date?: string;
}): Promise<any[]> {
  const embedding = await generateQueryEmbedding(query);
  if (!embedding) return [];

  try {
    const { data } = await getSupabase().rpc("match_key_statements", {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: after_date ? 50 : 20,
    });

    if (!data || data.length === 0) return [];

    const statementIds = data.map((s: any) => s.id);

    let enrichQuery = getSupabase()
      .from("key_statements")
      .select(
        `
        id,
        meeting_id,
        agenda_item_id,
        speaker_name,
        statement_type,
        statement_text,
        context,
        meetings!inner(meeting_date, type),
        agenda_items(title)
      `,
      )
      .in("id", statementIds);

    if (after_date) {
      enrichQuery = enrichQuery.gte("meetings.meeting_date", after_date);
    }

    const { data: enriched } = await enrichQuery;

    return (enriched || []).map((row: any) => {
      const meeting = Array.isArray(row.meetings)
        ? row.meetings[0]
        : row.meetings;
      return {
        ...row,
        meetings: meeting,
      };
    }).slice(0, 20);
  } catch (error) {
    console.error("Key statements search failed:", error);
    return [];
  }
}

const tools: Tool<any, any>[] = [
  {
    name: "search_council_records",
    description:
      'search_council_records(query: string, after_date?: string) — Searches ALL meeting content in parallel: motions, transcript segments, key statements, and agenda items. Returns an object with { motions, transcripts, statements, agenda_items }. Use for broad questions about what council discussed, decided, or debated on a topic. after_date filters to results on or after that date (YYYY-MM-DD format, e.g. "2025-01-01").',
    call: async ({
      query,
      after_date,
    }: {
      query: string;
      after_date?: string;
    }) => {
      const [motions, transcripts, statements, agenda_items] =
        await Promise.all([
          search_motions({ query, after_date }),
          search_transcript_segments({ query, after_date }),
          search_key_statements({ query, after_date }),
          search_agenda_items({ query, after_date }),
        ]);
      return { motions, transcripts, statements, agenda_items };
    },
  },
  {
    name: "search_documents",
    description:
      'search_documents(query: string, after_date?: string, type?: "staff_reports" | "bylaws" | "all") — Searches attached PDFs (staff reports, consultant reports, policy papers, financial analyses) and/or municipal bylaw text. Set type to "staff_reports" for document sections only, "bylaws" for bylaw text only, or "all" (default) for both in parallel. Returns { document_sections, bylaws }. **Staff recommendations, background analysis, financial details, and proposals live here.** after_date filters document sections on or after that date.',
    call: async ({
      query,
      after_date,
      type,
    }: {
      query: string;
      after_date?: string;
      type?: "staff_reports" | "bylaws" | "all";
    }) => {
      if (type === "bylaws") {
        return { document_sections: [], bylaws: await search_bylaws({ query }) };
      }
      if (type === "staff_reports") {
        return { document_sections: await search_document_sections({ query, after_date }), bylaws: [] };
      }
      // "all" or undefined — run both in parallel
      const [document_sections, bylaws] = await Promise.all([
        search_document_sections({ query, after_date }),
        search_bylaws({ query }),
      ]);
      return { document_sections, bylaws };
    },
  },
  {
    name: "search_matters",
    description:
      'search_matters(query: string, status?: string) — Searches for ongoing council matters/topics by semantic similarity. Matters represent issues that span multiple meetings (e.g. "Zoning Bylaw Amendment for 123 Main St", "OCP Housing Update"). Returns title, category, status, first_seen/last_seen dates. Optional status filter: "Active", "Adopted", "Completed", "Defeated". Best for broad "what is council working on?" questions or finding the history of a specific issue.',
    call: async ({ query, status }: { query: string; status?: string }) =>
      search_matters({ query, status }),
  },
  {
    name: "get_person_info",
    description:
      'get_person_info(person_name: string, include?: "statements" | "votes" | "both") — Looks up everything about a specific person. Set include to "statements" for their statements only, "votes" for voting record only, or "both" (default) for all. Returns combined object with transcript_segments, key_statements, and/or voting stats. Handles speaker aliases.',
    call: async ({
      person_name,
      include,
    }: {
      person_name: string;
      include?: "statements" | "votes" | "both";
    }) => {
      if (include === "statements") {
        return await get_statements_by_person({ person_name });
      }
      if (include === "votes") {
        return await get_voting_history(person_name);
      }
      // "both" or undefined — run both in parallel
      const [statementsResult, votesResult] = await Promise.all([
        get_statements_by_person({ person_name }),
        get_voting_history(person_name),
      ]);
      // Either result could be a string (error message) — merge objects only
      const merged: Record<string, any> = {};
      if (typeof statementsResult === "object" && statementsResult !== null) {
        Object.assign(merged, statementsResult);
      } else {
        merged.statements_error = statementsResult;
      }
      if (typeof votesResult === "object" && votesResult !== null) {
        Object.assign(merged, votesResult);
      } else {
        merged.votes_error = votesResult;
      }
      return merged;
    },
  },
];

function getOrchestratorSystemPrompt(municipalityName = "Town of View Royal") {
  const todayDate = new Date().toISOString().split("T")[0];

  return `You are a research agent for the ${municipalityName}, British Columbia. Citizens ask you questions about their municipal council and you gather evidence from council records to answer them.

Today's date is ${todayDate}. Use this for any temporal references like "recent", "this year", "last month", etc.

You operate in a loop. Each turn you output **exactly one raw JSON object** — no markdown fences, no commentary:

{"thought":"...","action":{"tool_name":"...","tool_args":{...}}}

When you have gathered enough evidence, signal completion:

{"thought":"...","action":{"final_answer":true}}

A separate synthesis model will write the final user-facing answer from your gathered evidence. Your job is only to gather the right evidence.

## Understanding the Data

You have 4 consolidated tools that search different types of council records:

- **\`search_council_records\`** — Searches ALL meeting content in parallel: motions (formal decisions with vote results), transcript segments (verbatim speech), key statements (attributed quotes), and agenda items (discussion summaries). This is your primary tool for most questions.
- **\`search_documents\`** — Searches attached PDFs (staff reports, consultant reports, policy papers, financial analyses) and/or municipal bylaw text. **Staff recommendations, background analysis, financial details, and proposals live here.** Use type="staff_reports" for documents only, type="bylaws" for bylaws only, or omit for both.
- **\`search_matters\`** — Searches high-level topics that span multiple meetings. Best for "what's happening with X" or tracking the history of a specific issue.
- **\`get_person_info\`** — Looks up everything about a specific person: their statements, voting record, or both. Handles speaker aliases.

## Strategy

**1. Match question type to the right starting tool:**

| Question type | Start with | Why |
|---|---|---|
| Staff recommendations, proposals, reports, analysis | \`search_documents\` (type: "staff_reports") | Staff reports are PDFs — content lives in document sections |
| What was discussed about X? | \`search_council_records\` then \`search_documents\` | Council records = overview + debate, documents = detail |
| What decisions were made? | \`search_council_records\` | Includes motions with vote outcomes |
| Who said what about X? | \`get_person_info\` or \`search_council_records\` | Person-specific or broad attributed statements |
| What are the rules about X? | \`search_documents\` (type: "bylaws") | Bylaw text |
| What's council working on? | \`search_matters\` | Cross-meeting topic tracking |
| Upcoming/recent meeting content | \`search_documents\` + \`search_council_records\` with after_date | Documents posted before meeting, summaries may lag |
| Specific person's views | \`get_person_info\` | Statements + voting record combined |

**2. Fallback rules — switch tools, don't retry:**
- If \`search_council_records\` returns thin results → try \`search_documents\`. The detailed content is in the PDFs.
- For recommendations, analysis, financial details, background → start with \`search_documents\` (type: "staff_reports"). These are in staff reports, not agenda summaries.
- **Never retry the same tool more than once with rephrased keywords.** Switch to a different tool instead.

**3. Show your reasoning in thoughts.** In your "thought" field, explain your REASONING — not just your plan:
- WHY you are choosing this specific tool. What data source does it search?
- What you EXPECT to find. What evidence gap does this fill?
- How this builds on previous results (if not the first call).

Examples:
- Bad thought: "I'll search council records for recommendations"
- Good thought: "The user is asking about staff recommendations, which come from staff reports. Staff reports are PDFs stored as document sections. I'll use search_documents with type='staff_reports' first."
- Bad thought: "Let me try council records again with different keywords"
- Good thought: "Council records returned high-level summaries but not the specific financial figures. The detailed analysis is in the attached staff report. Switching to search_documents."

**4. Craft good search queries.** Short, specific phrases work best:
- Good: "affordable housing development"
- Bad: "What has the council discussed regarding affordable housing developments in the town?"

**5. Know when to stop.** 2-3 tool calls is typical. Each consolidated tool searches multiple data sources in parallel, so fewer calls are needed. After each result, assess: do you have enough specific evidence (dates, names, quotes, vote counts) to answer? If yes, finalize.

**6. Common mistakes to avoid:**
- Don't retry the same tool with synonyms — switch to a different tool instead.
- Agenda summaries are AI-generated overviews — not the full staff report. If you need specifics, use search_documents.
- For upcoming meetings, documents may be the only available source (no transcript or summary yet).
- Never call the same tool with the same arguments twice.

## Available Tools

${tools.map((t) => `- ${t.description}`).join("\n")}

## Output Format

Raw JSON only. No markdown. No text before or after the JSON object.`;
}

function getFinalSystemPrompt(municipalityName = "Town of View Royal") {
  return `You are a civic transparency analyst for the ${municipalityName}, British Columbia. You help citizens understand what their municipal council has discussed, decided, and debated.

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
   - When evidence comes from document sections (staff reports), reference the document: "According to the staff report presented at the March 3 meeting..." Staff reports and official documents are authoritative primary sources.

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
}

/**
 * Normalize raw tool results into a consistent source shape for the client.
 */
interface NormalizedSource {
  type: "transcript" | "motion" | "vote" | "key_statement" | "matter" | "agenda_item" | "document_section" | "bylaw";
  id: number;
  meeting_id: number;
  meeting_date: string;
  title: string;
  speaker_name?: string;
  bylaw_id?: number;
  content?: string;   // Up to 500 chars of source text for preview cards
  result?: string;    // Motion/vote result (e.g., "Carried", "Defeated")
}

function normalizeTranscriptSources(
  segments: TranscriptSegment[],
): NormalizedSource[] {
  return segments.map((s) => ({
    type: "transcript" as const,
    id: s.id,
    meeting_id: s.meeting_id,
    meeting_date: s.meetings?.meeting_date || "Unknown",
    title: (s.text_content || "").slice(0, 120),
    speaker_name: s.speaker_name,
    content: (s.text_content || "").slice(0, 500),
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
      content: (m.text_content || "").slice(0, 500),
      result: m.result,
    };
  });
}

function normalizeKeyStatementSources(statements: any[]): NormalizedSource[] {
  return statements.map((s) => {
    const meeting = Array.isArray(s.meetings) ? s.meetings[0] : s.meetings;
    return {
      type: "key_statement" as const,
      id: s.id,
      meeting_id: s.meeting_id || 0,
      meeting_date: meeting?.meeting_date || "Unknown",
      title: `[${s.statement_type}] ${(s.statement_text || "").slice(0, 100)}`,
      speaker_name: s.speaker_name,
      content: (s.statement_text || "").slice(0, 500),
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
      content: (v.motions!.text_content || "").slice(0, 500),
      result: v.motions!.result,
    }));
}

function normalizeMatterSources(matters: any[]): NormalizedSource[] {
  return matters.map((m) => ({
    type: "motion" as const, // Reuse motion type for link routing
    id: m.id,
    meeting_id: 0,
    meeting_date: m.last_seen || m.first_seen || "Unknown",
    title: m.title || (m.plain_english_summary || "").slice(0, 120),
    content: (m.plain_english_summary || m.title || "").slice(0, 500),
  }));
}

/**
 * Semantic + FTS hybrid search for document sections (staff reports, bylaws, policies).
 */
async function search_document_sections({
  query,
  after_date,
}: {
  query: string;
  after_date?: string;
}): Promise<any[]> {
  const embedding = await generateQueryEmbedding(query);
  if (!embedding) return [];

  try {
    const rpcParams: Record<string, any> = {
      query_text: query,
      query_embedding: JSON.stringify(embedding),
      match_count: 15,
      full_text_weight: 1,
      semantic_weight: 1,
      rrf_k: 50,
    };

    // Pass date_from to the RPC so filtering happens at the database level,
    // not after results are returned. Without this, all 15 result slots could
    // be consumed by older meetings, leaving no room for date-relevant content.
    if (after_date) {
      rpcParams.date_from = after_date;
    }

    const { data } = await getSupabase().rpc("hybrid_search_document_sections", rpcParams);

    if (!data || data.length === 0) return [];

    // Enrich with document title and meeting date
    const docIds = [...new Set(data.map((d: any) => d.document_id))];

    const { data: docs } = await getSupabase()
      .from("documents")
      .select(`
        id,
        title,
        meeting_id,
        meetings!inner(meeting_date)
      `)
      .in("id", docIds);

    const docMap = new Map((docs || []).map((d: any) => [d.id, d]));

    return data
      .map((d: any) => {
        const doc = docMap.get(d.document_id);
        const meeting = Array.isArray(doc?.meetings) ? doc.meetings[0] : doc?.meetings;
        return {
          id: d.id,
          document_id: d.document_id,
          heading: d.section_title,
          content: d.content,
          meeting_id: d.meeting_id || doc?.meeting_id || 0,
          document_title: doc?.title || "Unknown",
          meeting_date: meeting?.meeting_date || "Unknown",
        };
      });
  } catch (error) {
    console.error("Document section search failed:", error);
    return [];
  }
}

function normalizeDocumentSectionSources(sections: any[]): NormalizedSource[] {
  return sections.map((s) => ({
    type: "document_section" as const,
    id: s.id,
    meeting_id: s.meeting_id || 0,
    meeting_date: s.meeting_date || "Unknown",
    title: `[Doc] ${s.heading || s.document_title || "Document Section"}`,
    content: (s.content || "").slice(0, 500),
  }));
}

/**
 * Hybrid search for bylaw chunks (municipal bylaws, regulations, fee schedules).
 */
async function search_bylaws({ query }: { query: string }): Promise<any[]> {
  const embedding = await generateQueryEmbedding(query);
  if (!embedding) return [];

  try {
    const { data } = await getSupabase().rpc("hybrid_search_bylaw_chunks", {
      query_text: query,
      query_embedding: JSON.stringify(embedding),
      match_count: 10,
      full_text_weight: 1.0,
      semantic_weight: 1.0,
      rrf_k: 50,
    });

    if (!data || data.length === 0) return [];

    return data.map((d: any) => ({
      id: d.id,
      bylaw_id: d.bylaw_id,
      bylaw_title: d.bylaw_title,
      bylaw_number: d.bylaw_number,
      chunk_index: d.chunk_index,
      text_content: d.text_content,
    }));
  } catch (error) {
    console.error("Bylaw search failed:", error);
    return [];
  }
}

function normalizeBylawSources(results: any[]): NormalizedSource[] {
  return results.map((r) => ({
    type: "bylaw" as const,
    id: r.bylaw_id,
    bylaw_id: r.bylaw_id,
    meeting_id: 0,
    meeting_date: "N/A",
    title: `[Bylaw ${r.bylaw_number || ""}] ${r.bylaw_title || "Bylaw"} — ${(r.text_content || "").slice(0, 80)}`,
    content: (r.text_content || "").slice(0, 500),
  }));
}

function normalizeAgendaItemSources(items: any[]): NormalizedSource[] {
  return items.map((item) => ({
    type: "transcript" as const, // Reuse transcript type for link routing
    id: item.id,
    meeting_id: item.meeting_id || 0,
    meeting_date: item.meetings?.meeting_date || "Unknown",
    title: item.plain_english_summary || item.title || "",
    content: (item.plain_english_summary || item.title || "").slice(0, 500),
  }));
}

/**
 * Extract a human-readable date range string from an array of results.
 * Looks for meeting_date in both `r.meetings?.meeting_date` and `r.meeting_date`.
 */
function extractDateRange(results: any[]): string {
  const dates = results
    .map((r: any) => r.meetings?.meeting_date || r.meeting_date)
    .filter(Boolean)
    .sort();
  if (dates.length >= 2) return ` from ${dates[0]} to ${dates[dates.length - 1]}`;
  if (dates.length === 1) return ` from ${dates[0]}`;
  return "";
}

/**
 * Build a human-readable summary string for tool results displayed in the UI.
 * Returns contextual information based on the tool type rather than generic "Found N results".
 */
export function buildToolSummary(toolName: string, toolResult: any): string {
  // Empty / falsy
  if (!toolResult) return "No results found";
  if (Array.isArray(toolResult) && toolResult.length === 0) return "No results found";

  // String passthrough
  if (typeof toolResult === "string") {
    if (toolResult.length <= 200) return toolResult;
    return toolResult.slice(0, 200) + "...";
  }

  // Array results — tool-specific summaries
  if (Array.isArray(toolResult)) {
    const n = toolResult.length;

    switch (toolName) {
      case "search_matters": {
        const statuses = [...new Set(toolResult.map((r: any) => r.status).filter(Boolean))];
        const statusInfo = statuses.length > 0 ? ` (${statuses.join(", ")})` : "";
        return `Found ${n} matter${n !== 1 ? "s" : ""}${statusInfo}`;
      }
      default:
        return `Found ${n} result${n !== 1 ? "s" : ""}`;
    }
  }

  // Object results (non-array) — consolidated tools return composite objects
  if (typeof toolResult === "object" && toolResult !== null) {
    if (toolName === "search_council_records") {
      const m = toolResult.motions?.length || 0;
      const t = toolResult.transcripts?.length || 0;
      const s = toolResult.statements?.length || 0;
      const a = toolResult.agenda_items?.length || 0;
      const total = m + t + s + a;
      const parts: string[] = [];
      if (m > 0) parts.push(`${m} motion${m !== 1 ? "s" : ""}`);
      if (t > 0) parts.push(`${t} transcript${t !== 1 ? "s" : ""}`);
      if (s > 0) parts.push(`${s} statement${s !== 1 ? "s" : ""}`);
      if (a > 0) parts.push(`${a} agenda item${a !== 1 ? "s" : ""}`);
      return total === 0 ? "No results found" : `Found ${parts.join(", ")}`;
    }
    if (toolName === "search_documents") {
      const d = toolResult.document_sections?.length || 0;
      const b = toolResult.bylaws?.length || 0;
      const total = d + b;
      const parts: string[] = [];
      if (d > 0) parts.push(`${d} document section${d !== 1 ? "s" : ""}`);
      if (b > 0) parts.push(`${b} bylaw section${b !== 1 ? "s" : ""}`);
      return total === 0 ? "No results found" : `Found ${parts.join(", ")}`;
    }
    if (toolName === "get_person_info") {
      const segments = toolResult.transcript_segments?.length || 0;
      const statements = toolResult.key_statements?.length || 0;
      const hasVotes = toolResult.stats != null;
      const parts: string[] = [];
      if (segments + statements > 0) parts.push(`${segments + statements} statement${(segments + statements) !== 1 ? "s" : ""}`);
      if (hasVotes) {
        const s = toolResult.stats;
        parts.push(`voting record (${s.total} votes)`);
      }
      return parts.length === 0 ? "No results found" : `Found ${parts.join(", ")}`;
    }
    // Legacy fallback for voting history / statements objects
    if (toolResult.stats) {
      const s = toolResult.stats;
      return `Found voting record: ${s.total} votes (${s.yes} yes, ${s.no} no)`;
    }
    if (toolResult.transcript_segments || toolResult.key_statements) {
      const segments = toolResult.transcript_segments?.length || 0;
      const statements = toolResult.key_statements?.length || 0;
      return `Found ${segments + statements} statement${(segments + statements) !== 1 ? "s" : ""}`;
    }
  }

  return "Results retrieved";
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
  municipalityName?: string,
): AsyncGenerator<AgentEvent> {
  const client = getGenAI();
  if (!client) throw new Error("Gemini API not configured");

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

    const result = await client.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        getOrchestratorSystemPrompt(municipalityName),
        userPrompt,
      ],
    });
    const responseText = (result.text ?? "").trim();

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
    const displaySummary = buildToolSummary(tool_name, toolResult);

    yield { type: "tool_observation", name: tool_name, result: displaySummary };

    // Collect normalized sources based on tool type
    if (tool_name === "search_council_records" && typeof toolResult === "object" && toolResult !== null) {
      if (toolResult.motions?.length) allSources.push(...normalizeMotionSources(toolResult.motions));
      if (toolResult.transcripts?.length) allSources.push(...normalizeTranscriptSources(toolResult.transcripts));
      if (toolResult.statements?.length) allSources.push(...normalizeKeyStatementSources(toolResult.statements));
      if (toolResult.agenda_items?.length) allSources.push(...normalizeAgendaItemSources(toolResult.agenda_items));
    } else if (tool_name === "search_documents" && typeof toolResult === "object" && toolResult !== null) {
      if (toolResult.document_sections?.length) allSources.push(...normalizeDocumentSectionSources(toolResult.document_sections));
      if (toolResult.bylaws?.length) allSources.push(...normalizeBylawSources(toolResult.bylaws));
    } else if (tool_name === "get_person_info" && typeof toolResult === "object" && toolResult !== null) {
      if (toolResult.transcript_segments?.length) allSources.push(...normalizeTranscriptSources(toolResult.transcript_segments));
      if (toolResult.key_statements?.length) allSources.push(...normalizeKeyStatementSources(toolResult.key_statements));
      if (toolResult.opposed_votes?.length) allSources.push(...normalizeVoteSources(toolResult.opposed_votes));
      if (toolResult.recent_votes?.length) allSources.push(...normalizeVoteSources(toolResult.recent_votes));
    } else if (tool_name === "search_matters" && Array.isArray(toolResult) && toolResult.length > 0) {
      allSources.push(...normalizeMatterSources(toolResult));
    }
  }

  // Deduplicate sources by type+id
  const sourceMap = new Map<string, NormalizedSource>();
  for (const s of allSources) {
    sourceMap.set(`${s.type}:${s.id}`, s);
  }
  const uniqueSources = Array.from(sourceMap.values());
  yield { type: "sources", sources: uniqueSources };

  // Build numbered evidence list — each source gets a number, and its content is
  // presented under that number. This ensures the model can ONLY cite valid [N] numbers.
  const numberedEvidence = uniqueSources
    .map(
      (s, i) =>
        `[${i + 1}] (${s.type}, ${s.meeting_date}${s.speaker_name ? `, ${s.speaker_name}` : ""}) ${s.title}`,
    )
    .join("\n");

  const finalUserPrompt = `Question: ${question}

Evidence from Council Records (each item has a citation number):
${numberedEvidence}

IMPORTANT: You have exactly ${uniqueSources.length} sources numbered [1] through [${uniqueSources.length}]. Only use citation numbers within this range. Do NOT use any number higher than [${uniqueSources.length}].

Synthesize a final answer based *only* on the evidence above. Use [1], [2], etc. to cite sources inline.`;

  const stream = await client.models.generateContentStream({
    model: "gemini-3-flash-preview",
    contents: [
      getFinalSystemPrompt(municipalityName),
      finalUserPrompt,
    ],
  });
  for await (const chunk of stream) {
    yield { type: "final_answer_chunk", chunk: chunk.text ?? "" };
  }

  yield { type: "done" };
}
