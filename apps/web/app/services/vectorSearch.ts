import type { SupabaseClient } from "@supabase/supabase-js";

// Result types matching the RPC function return signatures

export interface TranscriptSegmentMatch {
  id: number;
  meeting_id: number;
  speaker_name: string | null;
  text_content: string;
  start_time: number;
  similarity: number;
}

export interface MotionMatch {
  id: number;
  meeting_id: number;
  agenda_item_id: number | null;
  text_content: string;
  result: string | null;
  similarity: number;
}

export interface MatterMatch {
  id: number;
  title: string;
  identifier: string | null;
  plain_english_summary: string | null;
  similarity: number;
}

export interface AgendaItemMatch {
  id: number;
  meeting_id: number;
  title: string;
  description: string | null;
  similarity: number;
}

export interface KeyStatementMatch {
  id: number;
  meeting_id: number;
  agenda_item_id: number | null;
  speaker_name: string | null;
  statement_type: string;
  statement_text: string;
  context: string | null;
  similarity: number;
}

export interface VectorSearchResults {
  segments: TranscriptSegmentMatch[];
  motions: MotionMatch[];
  matters: MatterMatch[];
  agendaItems: AgendaItemMatch[];
}

// Search configuration
const DEFAULT_MATCH_THRESHOLD = 0.65;
const DEFAULT_MATCH_COUNT = 20;

/**
 * Search transcript segments using vector similarity.
 * @deprecated Transcript segment embeddings were removed in Phase 3c.
 * Use searchAgendaItems for discussion-level search instead.
 */
export async function searchTranscriptSegments(
  _supabase: SupabaseClient,
  _embedding: number[],
  _options?: {
    threshold?: number;
    limit?: number;
    meetingId?: number;
  },
): Promise<TranscriptSegmentMatch[]> {
  return [];
}

/**
 * Search motions using vector similarity
 */
export async function searchMotions(
  supabase: SupabaseClient,
  embedding: number[],
  options?: {
    threshold?: number;
    limit?: number;
  },
): Promise<MotionMatch[]> {
  const { data, error } = await supabase.rpc("match_motions", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: options?.threshold ?? DEFAULT_MATCH_THRESHOLD,
    match_count: options?.limit ?? 10,
  });

  if (error) {
    console.error("Vector search error (motions):", error);
    return [];
  }

  return data || [];
}

/**
 * Search matters/bylaws using vector similarity
 */
export async function searchMatters(
  supabase: SupabaseClient,
  embedding: number[],
  options?: {
    threshold?: number;
    limit?: number;
  },
): Promise<MatterMatch[]> {
  const { data, error } = await supabase.rpc("match_matters", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: options?.threshold ?? DEFAULT_MATCH_THRESHOLD,
    match_count: options?.limit ?? 10,
  });

  if (error) {
    console.error("Vector search error (matters):", error);
    return [];
  }

  return data || [];
}

/**
 * Search agenda items using vector similarity
 */
export async function searchAgendaItems(
  supabase: SupabaseClient,
  embedding: number[],
  options?: {
    threshold?: number;
    limit?: number;
  },
): Promise<AgendaItemMatch[]> {
  const { data, error } = await supabase.rpc("match_agenda_items", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: options?.threshold ?? DEFAULT_MATCH_THRESHOLD,
    match_count: options?.limit ?? 10,
  });

  if (error) {
    console.error("Vector search error (agenda items):", error);
    return [];
  }

  return data || [];
}

/**
 * Search key statements using vector similarity
 */
export async function searchKeyStatements(
  supabase: SupabaseClient,
  embedding: number[],
  options?: {
    threshold?: number;
    limit?: number;
  },
): Promise<KeyStatementMatch[]> {
  const { data, error } = await supabase.rpc("match_key_statements", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: options?.threshold ?? DEFAULT_MATCH_THRESHOLD,
    match_count: options?.limit ?? 15,
  });

  if (error) {
    console.error("Vector search error (key statements):", error);
    return [];
  }

  return data || [];
}

/**
 * Perform vector search across all content types in parallel
 */
export async function vectorSearchAll(
  supabase: SupabaseClient,
  embedding: number[],
  options?: {
    threshold?: number;
    segmentLimit?: number;
    motionLimit?: number;
    matterLimit?: number;
    agendaItemLimit?: number;
  },
): Promise<VectorSearchResults> {
  const [segments, motions, matters, agendaItems] = await Promise.all([
    searchTranscriptSegments(supabase, embedding, {
      threshold: options?.threshold,
      limit: options?.segmentLimit ?? 20,
    }),
    searchMotions(supabase, embedding, {
      threshold: options?.threshold,
      limit: options?.motionLimit ?? 10,
    }),
    searchMatters(supabase, embedding, {
      threshold: options?.threshold,
      limit: options?.matterLimit ?? 10,
    }),
    searchAgendaItems(supabase, embedding, {
      threshold: options?.threshold,
      limit: options?.agendaItemLimit ?? 10,
    }),
  ]);

  return { segments, motions, matters, agendaItems };
}
