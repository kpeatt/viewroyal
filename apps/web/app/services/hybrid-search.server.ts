/**
 * Unified hybrid search service.
 *
 * Replaces the separate search.ts (keyword) and vectorSearch.ts (vector-only)
 * with a single service that calls per-table hybrid search RPCs in Supabase,
 * combining vector similarity + full-text search using Reciprocal Rank Fusion.
 *
 * Also handles transcript segments (FTS-only, no embeddings) and the
 * search_results_cache table for shareable AI answer URLs.
 */

import { generateQueryEmbedding } from "../lib/embeddings.server";
import { getSupabaseAdminClient } from "../lib/supabase.server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnifiedSearchResult {
  id: number;
  type: "motion" | "key_statement" | "document_section" | "transcript_segment";
  title: string;
  content: string; // Preview text (first 200 chars)
  meeting_id: number | null;
  meeting_date: string | null;
  speaker_name?: string;
  rank_score: number;
  // Type-specific metadata
  motion_result?: string;
  motion_mover?: string;
  motion_seconder?: string;
  statement_type?: string;
  start_time?: number;
}

export interface CachedResult {
  id: string;
  query: string;
  answer: string;
  sources: any[];
  suggested_followups: string[];
  source_count: number;
  created_at: string;
}

type ContentType = UnifiedSearchResult["type"];

// ---------------------------------------------------------------------------
// Hybrid search – calls per-table Supabase RPCs in parallel
// ---------------------------------------------------------------------------

async function hybridSearchMotions(
  queryText: string,
  embedding: number[],
  limit: number,
): Promise<UnifiedSearchResult[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("hybrid_search_motions", {
    query_text: queryText,
    query_embedding: JSON.stringify(embedding),
    match_count: limit,
    full_text_weight: 1.0,
    semantic_weight: 1.0,
    rrf_k: 50,
  });

  if (error) {
    console.error("Hybrid search motions error:", error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    type: "motion" as const,
    title: row.plain_english_summary || (row.text_content || "").slice(0, 120),
    content: (row.text_content || "").slice(0, 200),
    meeting_id: row.meeting_id,
    meeting_date: null, // Enriched separately
    rank_score: row.rank_score,
    motion_result: row.result,
    motion_mover: row.mover,
    motion_seconder: row.seconder,
  }));
}

async function hybridSearchKeyStatements(
  queryText: string,
  embedding: number[],
  limit: number,
): Promise<UnifiedSearchResult[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("hybrid_search_key_statements", {
    query_text: queryText,
    query_embedding: JSON.stringify(embedding),
    match_count: limit,
    full_text_weight: 1.0,
    semantic_weight: 1.0,
    rrf_k: 50,
  });

  if (error) {
    console.error("Hybrid search key_statements error:", error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    type: "key_statement" as const,
    title: `[${row.statement_type}] ${(row.statement_text || "").slice(0, 100)}`,
    content: (row.statement_text || "").slice(0, 200),
    meeting_id: row.meeting_id,
    meeting_date: null,
    speaker_name: row.speaker_name,
    rank_score: row.rank_score,
    statement_type: row.statement_type,
  }));
}

async function hybridSearchDocumentSections(
  queryText: string,
  embedding: number[],
  limit: number,
): Promise<UnifiedSearchResult[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc(
    "hybrid_search_document_sections",
    {
      query_text: queryText,
      query_embedding: JSON.stringify(embedding),
      match_count: limit,
      full_text_weight: 1.0,
      semantic_weight: 1.0,
      rrf_k: 50,
    },
  );

  if (error) {
    // Graceful: document_sections may be empty (Phase 7.1 backfill pending)
    console.error("Hybrid search document_sections error:", error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    type: "document_section" as const,
    title: row.section_title || "Document Section",
    content: (row.content || "").slice(0, 200),
    meeting_id: null, // document_sections link via documents, not directly
    meeting_date: null,
    rank_score: row.rank_score,
  }));
}

/**
 * FTS-only search for transcript segments.
 * Transcript embeddings were removed in Phase 3c (228K rows too expensive).
 * Uses tsvector full-text search with ts_rank for scoring.
 */
async function ftsSearchTranscriptSegments(
  queryText: string,
  limit: number,
): Promise<UnifiedSearchResult[]> {
  const supabase = getSupabaseAdminClient();

  // Build a tsquery from the query text (simple AND of significant words)
  const tsQuery = queryText
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .join(" & ");

  if (!tsQuery) return [];

  const { data, error } = await supabase
    .from("transcript_segments")
    .select(
      "id, meeting_id, speaker_name, text_content, start_time, meetings!inner(meeting_date)",
    )
    .textSearch("text_search", tsQuery)
    .limit(limit);

  if (error) {
    console.error("FTS search transcript_segments error:", error);
    return [];
  }

  if (!data || data.length === 0) return [];

  // Assign synthetic rank_score based on position (FTS results are pre-ordered by relevance)
  // Scale from 0.02 (baseline) down to 0.005 across the result set
  return data.map((row: any, index: number) => {
    const meeting = Array.isArray(row.meetings)
      ? row.meetings[0]
      : row.meetings;
    const positionScore = 0.02 - (index / data.length) * 0.015;
    return {
      id: row.id,
      type: "transcript_segment" as const,
      title: row.speaker_name
        ? `${row.speaker_name}: ${(row.text_content || "").slice(0, 80)}`
        : (row.text_content || "").slice(0, 100),
      content: (row.text_content || "").slice(0, 200),
      meeting_id: row.meeting_id,
      meeting_date: meeting?.meeting_date || null,
      speaker_name: row.speaker_name,
      rank_score: positionScore,
      start_time: row.start_time,
    };
  });
}

/**
 * Enrich results with meeting dates by fetching meetings in batch.
 */
async function enrichWithMeetingDates(
  results: UnifiedSearchResult[],
): Promise<void> {
  const meetingIds = [
    ...new Set(
      results
        .filter((r) => r.meeting_id && !r.meeting_date)
        .map((r) => r.meeting_id as number),
    ),
  ];

  if (meetingIds.length === 0) return;

  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from("meetings")
    .select("id, meeting_date")
    .in("id", meetingIds);

  if (!data) return;

  const dateMap = new Map(data.map((m: any) => [m.id, m.meeting_date]));
  for (const result of results) {
    if (result.meeting_id && !result.meeting_date) {
      result.meeting_date = dateMap.get(result.meeting_id) || null;
    }
  }
}

// ---------------------------------------------------------------------------
// Main unified search function
// ---------------------------------------------------------------------------

export async function hybridSearchAll(
  query: string,
  options?: {
    types?: ContentType[];
    limit?: number;
  },
): Promise<UnifiedSearchResult[]> {
  const limit = options?.limit ?? 30;
  const types = options?.types;

  // Generate embedding for hybrid search (vector + FTS)
  const embedding = await generateQueryEmbedding(query);

  // Build parallel search promises based on requested types
  const promises: Promise<UnifiedSearchResult[]>[] = [];

  const shouldSearch = (type: ContentType) => !types || types.includes(type);

  if (shouldSearch("motion") && embedding) {
    promises.push(hybridSearchMotions(query, embedding, 15));
  }

  if (shouldSearch("key_statement") && embedding) {
    promises.push(hybridSearchKeyStatements(query, embedding, 15));
  }

  if (shouldSearch("document_section") && embedding) {
    promises.push(hybridSearchDocumentSections(query, embedding, 10));
  }

  if (shouldSearch("transcript_segment")) {
    promises.push(ftsSearchTranscriptSegments(query, 15));
  }

  // Run all searches in parallel
  const resultSets = await Promise.all(promises);
  let allResults = resultSets.flat();

  // Enrich with meeting dates
  await enrichWithMeetingDates(allResults);

  // Sort by rank_score descending
  allResults.sort((a, b) => b.rank_score - a.rank_score);

  // Deduplicate by type+id
  const seen = new Set<string>();
  allResults = allResults.filter((r) => {
    const key = `${r.type}:${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return allResults.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Search results cache (shareable AI answer URLs)
// ---------------------------------------------------------------------------

export async function getSearchResultCache(
  id: string,
): Promise<CachedResult | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("search_results_cache")
    .select(
      "id, query, answer, sources, suggested_followups, source_count, created_at",
    )
    .eq("id", id)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !data) return null;
  return data as CachedResult;
}

export async function saveSearchResultCache(data: {
  query: string;
  answer: string;
  sources: any[];
  suggested_followups: string[];
  source_count: number;
}): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  const { data: result, error } = await supabase
    .from("search_results_cache")
    .insert({
      query: data.query,
      answer: data.answer,
      sources: data.sources,
      suggested_followups: data.suggested_followups,
      source_count: data.source_count,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to save search result cache:", error);
    return null;
  }

  return result?.id || null;
}
