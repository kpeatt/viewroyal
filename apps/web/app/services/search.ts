import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateQueryEmbedding,
  isVectorSearchAvailable,
} from "../lib/embeddings.server";
import {
  vectorSearchAll,
  type TranscriptSegmentMatch,
  type AgendaItemMatch,
  type MotionMatch,
} from "./vectorSearch";
import { runQuestionAgent } from "./rag.server";

export type SearchMode =
  | "auto"
  | "keyword"
  | "vector"
  | "hybrid"
  | "political_analysis";

export interface SearchFilters {
  meetings?: boolean;
  items?: boolean;
  segments?: boolean;
  motions?: boolean;
}

export interface SearchOptions {
  mode?: SearchMode;
  filters?: SearchFilters;
}

export interface MeetingResult {
  id: number;
  title: string;
  meeting_date: string;
  organizations?: { name: string } | null;
  similarity?: number;
  source?: "keyword" | "vector";
}

export interface AgendaItemResult {
  id: number;
  meeting_id: number;
  title: string;
  description?: string | null;
  meetings?: {
    meeting_date: string;
    title: string;
    organizations?: { name: string } | null;
  } | null;
  similarity?: number;
  source?: "keyword" | "vector";
}

export interface SegmentResult {
  id: number;
  meeting_id: number;
  text_content: string;
  start_time: number;
  speaker_name?: string | null;
  person?: { name: string } | null;
  meetings?: {
    meeting_date: string;
    title: string;
    organizations?: { name: string } | null;
  } | null;
  similarity?: number;
  source?: "keyword" | "vector";
}

export interface MotionResult {
  id: number;
  meeting_id: number;
  text_content: string;
  result?: string | null;
  mover?: string | null;
  seconder?: string | null;
  meetings?: {
    meeting_date: string;
    title: string;
    organizations?: { name: string } | null;
  } | null;
  similarity?: number;
  source?: "keyword" | "vector";
}

export interface SearchResults {
  meetings: MeetingResult[];
  items: AgendaItemResult[];
  segments: SegmentResult[];
  motions: MotionResult[];
  analysis?: string;
  searchMethod: "keyword" | "vector" | "hybrid" | "analysis";
}

const DEFAULT_FILTERS: SearchFilters = {
  meetings: true,
  items: true,
  segments: true,
  motions: true,
};

/**
 * Check if content is procedural (minutes, agenda, adjournment)
 */
function isProcedural(text: string, query: string): boolean {
  const proceduralTerms = [
    "adopt the minutes",
    "minutes be adopted",
    "adjourn the meeting",
    "meeting be adjourned",
    "agenda be approved",
    "approve the agenda",
    "receive for information",
    "rise and report",
  ];

  const qLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  // If the user is specifically searching for "minutes" or "agenda", don't filter
  if (
    qLower.includes("minutes") ||
    qLower.includes("agenda") ||
    qLower.includes("adjourn")
  ) {
    return false;
  }

  return proceduralTerms.some((term) => textLower.includes(term));
}

/**
 * Perform keyword-based search (original ilike matching)
 */
async function keywordSearch(
  supabase: SupabaseClient,
  q: string,
  filters: SearchFilters = DEFAULT_FILTERS,
): Promise<SearchResults> {
  const promises: PromiseLike<any>[] = [];
  const results: any = {
    meetings: [],
    items: [],
    segments: [],
    motions: [],
  };

  if (filters.meetings) {
    promises.push(
      supabase
        .from("meetings")
        .select("id, title, meeting_date, organizations(name)")
        .ilike("title", `%${q}%`)
        .order("meeting_date", { ascending: false })
        .limit(5)
        .then((res) => {
          results.meetings = (res.data || []).map((m: any) => ({
            ...m,
            organizations: Array.isArray(m.organizations)
              ? m.organizations[0]
              : m.organizations,
            source: "keyword" as const,
          }));
        }),
    );
  }

  if (filters.items) {
    promises.push(
      supabase
        .from("agenda_items")
        .select(
          "id, meeting_id, title, description, meetings(title, meeting_date, organizations(name))",
        )
        .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
        .order("created_at", { ascending: false })
        .limit(10)
        .then((res) => {
          results.items = (res.data || [])
            .filter((i: any) => !isProcedural(i.title, q))
            .map((i: any) => {
              const meeting = Array.isArray(i.meetings)
                ? i.meetings[0]
                : i.meetings;
              return {
                ...i,
                meetings: meeting
                  ? {
                      ...meeting,
                      organizations: Array.isArray(meeting.organizations)
                        ? meeting.organizations[0]
                        : meeting.organizations,
                    }
                  : meeting,
                source: "keyword" as const,
              };
            });
        }),
    );
  }

  if (filters.segments) {
    promises.push(
      supabase
        .from("transcript_segments")
        .select(
          "id, meeting_id, text_content, start_time, speaker_name, meetings(title, meeting_date, organizations(name)), person:people(name)",
        )
        .ilike("text_content", `%${q}%`)
        .limit(20)
        .then((res) => {
          results.segments = (res.data || [])
            .filter((s: any) => !isProcedural(s.text_content, q))
            .map((s: any) => {
              const meeting = Array.isArray(s.meetings)
                ? s.meetings[0]
                : s.meetings;
              return {
                ...s,
                meetings: meeting
                  ? {
                      ...meeting,
                      organizations: Array.isArray(meeting.organizations)
                        ? meeting.organizations[0]
                        : meeting.organizations,
                    }
                  : meeting,
                person: Array.isArray(s.person) ? s.person[0] : s.person,
                source: "keyword" as const,
              };
            });
        }),
    );
  }

  if (filters.motions) {
    promises.push(
      supabase
        .from("motions")
        .select(
          "id, meeting_id, text_content, result, mover, seconder, meetings(title, meeting_date, organizations(name))",
        )
        .ilike("text_content", `%${q}%`)
        .limit(20) // Fetch more to allow for filtering
        .then((res) => {
          results.motions = (res.data || [])
            .filter((m: any) => !isProcedural(m.text_content, q))
            .slice(0, 10) // Limit after filtering
            .map((m: any) => {
              const meeting = Array.isArray(m.meetings)
                ? m.meetings[0]
                : m.meetings;
              return {
                ...m,
                meetings: meeting
                  ? {
                      ...meeting,
                      organizations: Array.isArray(meeting.organizations)
                        ? meeting.organizations[0]
                        : meeting.organizations,
                    }
                  : meeting,
                source: "keyword" as const,
              };
            });
        }),
    );
  }

  await Promise.all(promises);

  return {
    ...results,
    searchMethod: "keyword",
  };
}

/**
 * Enrich vector search results with meeting data
 */
async function enrichVectorResults(
  supabase: SupabaseClient,
  segments: TranscriptSegmentMatch[],
  agendaItems: AgendaItemMatch[],
  motions: MotionMatch[],
  query: string,
): Promise<{
  segments: SegmentResult[];
  items: AgendaItemResult[];
  motions: MotionResult[];
}> {
  // Get unique meeting IDs
  const meetingIds = [
    ...new Set([
      ...segments.map((s) => s.meeting_id),
      ...agendaItems.map((a) => a.meeting_id),
      ...motions.map((m) => m.meeting_id),
    ]),
  ];

  if (meetingIds.length === 0) {
    return { segments: [], items: [], motions: [] };
  }

  // Fetch meeting details
  const { data: meetings } = await supabase
    .from("meetings")
    .select("id, title, meeting_date, organizations(name)")
    .in("id", meetingIds);

  // Normalize meetings data - organizations can be returned as array or object
  const normalizedMeetings = meetings?.map((m) => ({
    ...m,
    organizations: Array.isArray(m.organizations)
      ? m.organizations[0]
      : m.organizations,
  }));
  const meetingMap = new Map(normalizedMeetings?.map((m) => [m.id, m]) || []);

  // Enrich segments
  const enrichedSegments: SegmentResult[] = segments
    .filter((s) => !isProcedural(s.text_content, query))
    .map((s) => {
      const meeting = meetingMap.get(s.meeting_id);
      return {
        id: s.id,
        meeting_id: s.meeting_id,
        text_content: s.text_content,
        start_time: s.start_time,
        speaker_name: s.speaker_name,
        meetings: meeting
          ? {
              meeting_date: meeting.meeting_date,
              title: meeting.title,
              organizations: meeting.organizations,
            }
          : null,
        similarity: s.similarity,
        source: "vector" as const,
      };
    });

  // Enrich agenda items
  const enrichedItems: AgendaItemResult[] = agendaItems
    .filter((a) => !isProcedural(a.title, query))
    .map((a) => {
      const meeting = meetingMap.get(a.meeting_id);
      return {
        id: a.id,
        meeting_id: a.meeting_id,
        title: a.title,
        description: a.description,
        meetings: meeting
          ? {
              meeting_date: meeting.meeting_date,
              title: meeting.title,
              organizations: meeting.organizations,
            }
          : null,
        similarity: a.similarity,
        source: "vector" as const,
      };
    });

  // Enrich motions
  const enrichedMotions: MotionResult[] = motions
    .filter((m) => !isProcedural(m.text_content, query))
    .map((m) => {
      const meeting = meetingMap.get(m.meeting_id);
      return {
        id: m.id,
        meeting_id: m.meeting_id,
        text_content: m.text_content,
        result: m.result,
        meetings: meeting
          ? {
              meeting_date: meeting.meeting_date,
              title: meeting.title,
              organizations: meeting.organizations,
            }
          : null,
        similarity: m.similarity,
        source: "vector" as const,
      };
    });

  return {
    segments: enrichedSegments,
    items: enrichedItems,
    motions: enrichedMotions,
  };
}

/**
 * Perform vector-based semantic search
 */
async function vectorSearch(
  supabase: SupabaseClient,
  q: string,
  filters: SearchFilters = DEFAULT_FILTERS,
): Promise<SearchResults | null> {
  const embedding = await generateQueryEmbedding(q);
  if (!embedding) {
    return null;
  }

  // Fetch slightly more to account for procedural filtering
  const vectorResults = await vectorSearchAll(supabase, embedding, {
    threshold: 0.5,
    segmentLimit: filters.segments ? 30 : 0,
    agendaItemLimit: filters.items ? 15 : 0,
    motionLimit: filters.motions ? 15 : 0,
  });

  const { segments, items, motions } = await enrichVectorResults(
    supabase,
    vectorResults.segments,
    vectorResults.agendaItems,
    vectorResults.motions,
    q,
  );

  return {
    meetings: [], // Vector search doesn't directly search meetings
    items,
    segments,
    motions,
    searchMethod: "vector",
  };
}

/**
 * Perform AI-powered political analysis on a query.
 */
export async function politicalAnalysis(q: string): Promise<SearchResults> {
  const agentStream = runQuestionAgent(q);
  let answer = "";
  let sources: any[] = [];

  // Consume the async generator to get the full answer and sources
  for await (const event of agentStream) {
    if (event.type === "final_answer_chunk") {
      answer += event.chunk;
    } else if (event.type === "sources") {
      sources = event.sources;
    }
  }

  const items: AgendaItemResult[] = [];
  const segments: SegmentResult[] = [];
  const motions: MotionResult[] = [];

  sources.forEach((source: any) => {
    // It's a Vote object, which contains a motion
    if (source.vote && source.motions) {
      const motion = source.motions;
      items.push({
        id: motion.id,
        meeting_id: motion.meeting_id,
        title: `[${source.vote}] ${
          motion.plain_english_summary || motion.text_content
        }`,
        meetings: {
          meeting_date: motion.meetings?.meeting_date,
          title: `Vote on ${motion.meetings?.meeting_date}`,
        },
        source: "vector",
      });
    }
    // It's a direct motion object
    else if (source.result && !source.speaker_name) {
      motions.push({
        id: source.id,
        meeting_id: source.meeting_id,
        text_content: source.plain_english_summary || source.text_content,
        result: source.result,
        meetings: {
          meeting_date: source.meetings?.meeting_date,
          title: `Motion on ${source.meetings?.meeting_date}`,
        },
        source: "vector",
      });
    }
    // It's a transcript segment
    else if (source.speaker_name && source.text_content) {
      segments.push({
        id: source.id,
        meeting_id: source.meeting_id,
        text_content: source.text_content,
        start_time: source.start_time,
        speaker_name: source.speaker_name,
        person: { name: source.speaker_name },
        meetings: {
          meeting_date: source.meetings?.meeting_date,
          title: `Discussion on ${source.meetings?.meeting_date}`,
        },
        source: "vector",
      });
    }
  });

  return {
    meetings: [],
    items,
    segments,
    motions,
    analysis: answer,
    searchMethod: "analysis",
  };
}

/**
 * Merge and deduplicate results from keyword and vector searches
 */
function mergeResults(
  keyword: SearchResults,
  vector: SearchResults,
): SearchResults {
  // Dedupe segments by ID
  const segmentMap = new Map<number, SegmentResult>();
  keyword.segments.forEach((s) => segmentMap.set(s.id, s));
  vector.segments.forEach((s) => segmentMap.set(s.id, s));
  const mergedSegments = Array.from(segmentMap.values()).sort((a, b) => {
    if (a.similarity && b.similarity) return b.similarity - a.similarity;
    if (a.similarity) return -1;
    if (b.similarity) return 1;
    return 0;
  });

  // Dedupe items by ID
  const itemMap = new Map<number, AgendaItemResult>();
  keyword.items.forEach((i) => itemMap.set(i.id, i));
  vector.items.forEach((i) => itemMap.set(i.id, i));
  const mergedItems = Array.from(itemMap.values()).sort((a, b) => {
    if (a.similarity && b.similarity) return b.similarity - a.similarity;
    if (a.similarity) return -1;
    if (b.similarity) return 1;
    return 0;
  });

  // Dedupe motions by ID
  const motionMap = new Map<number, MotionResult>();
  keyword.motions.forEach((m) => motionMap.set(m.id, m));
  vector.motions.forEach((m) => motionMap.set(m.id, m));
  const mergedMotions = Array.from(motionMap.values()).sort((a, b) => {
    if (a.similarity && b.similarity) return b.similarity - a.similarity;
    if (a.similarity) return -1;
    if (b.similarity) return 1;
    return 0;
  });

  // Meetings only come from keyword search
  return {
    meetings: keyword.meetings,
    items: mergedItems.slice(0, 15),
    segments: mergedSegments.slice(0, 25),
    motions: mergedMotions.slice(0, 15),
    searchMethod: "hybrid",
  };
}

/**
 * Global search with configurable mode
 */
export async function globalSearch(
  supabase: SupabaseClient,
  q: string,
  options?: SearchOptions,
): Promise<SearchResults> {
  const filters = options?.filters ?? DEFAULT_FILTERS;

  if (!q || q.length < 2) {
    return {
      meetings: [],
      items: [],
      segments: [],
      motions: [],
      searchMethod: "keyword",
    };
  }

  const mode = options?.mode ?? "auto";

  // Pure keyword search
  if (mode === "keyword") {
    return keywordSearch(supabase, q, filters);
  }

  // Pure vector search
  if (mode === "vector") {
    const vectorResults = await vectorSearch(supabase, q, filters);
    if (!vectorResults) {
      // Fall back to keyword if vector unavailable
      return keywordSearch(supabase, q, filters);
    }
    return vectorResults;
  }

  // Political Analysis mode
  if (mode === "political_analysis") {
    // Ensure vector is available for this mode
    if (!isVectorSearchAvailable()) {
      return keywordSearch(supabase, q, filters);
    }
    return politicalAnalysis(q);
  }

  // Hybrid or auto mode: run both in parallel
  const vectorAvailable = isVectorSearchAvailable();

  if (!vectorAvailable) {
    // No API key, just do keyword search
    return keywordSearch(supabase, q, filters);
  }

  // Run keyword and vector searches in parallel
  const [keywordResults, vectorResults] = await Promise.all([
    keywordSearch(supabase, q, filters),
    vectorSearch(supabase, q, filters),
  ]);

  if (!vectorResults) {
    return keywordResults;
  }

  return mergeResults(keywordResults, vectorResults);
}
