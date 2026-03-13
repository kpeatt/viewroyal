import type { SupabaseClient } from "@supabase/supabase-js";
import type { KeyVote } from "../lib/types";

// ── Type Definitions ──

export interface SpeakingTimeStat {
  person_id: number;
  person_name: string;
  image_url: string | null;
  total_seconds: number;
  meeting_count: number;
  segment_count: number;
}

export interface SpeakingTimeByMeeting {
  meeting_id: number;
  meeting_date: string;
  seconds_spoken: number;
  segment_count: number;
}

export interface SpeakingTimeByTopic {
  topic: string;
  total_seconds: number;
  segment_count: number;
}

export interface CouncillorHighlight {
  title: string;
  summary: string;
  position: "for" | "against" | "nuanced";
  evidence: {
    text: string;
    meeting_id: number | null;
    date: string;
  }[];
}

export interface CouncillorHighlights {
  id: number;
  person_id: number;
  highlights: CouncillorHighlight[];
  overview: string;
  narrative: string | null;
  narrative_generated_at: string | null;
  generated_at: string;
}

export interface CouncillorStance {
  id: number;
  person_id: number;
  topic: string;
  position: "supports" | "opposes" | "mixed" | "neutral";
  position_score: number | null;
  summary: string;
  evidence_quotes: {
    text: string;
    meeting_id: number;
    segment_id: number;
    date: string;
  }[] | null;
  evidence_motion_ids: number[] | null;
  evidence_vote_ids: number[] | null;
  statement_count: number;
  confidence: "high" | "medium" | "low";
  generated_at: string;
  created_at: string;
  updated_at: string;
}

// ── Query Functions ──

/**
 * Get speaking time stats for all councillors, optionally filtered by date range.
 * Returns ranked list by total speaking time descending.
 */
export async function getSpeakingTimeStats(
  supabase: SupabaseClient,
  startDate?: string,
  endDate?: string,
): Promise<SpeakingTimeStat[]> {
  const { data, error } = await supabase.rpc("get_speaking_time_stats", {
    p_start_date: startDate ?? null,
    p_end_date: endDate ?? null,
  });

  if (error) {
    console.error("Error fetching speaking time stats:", error);
    throw new Error(error.message);
  }

  return (data ?? []) as SpeakingTimeStat[];
}

/**
 * Get per-meeting speaking time for a specific person.
 * Returns time series data for trend charts, ordered by meeting date ascending.
 */
export async function getSpeakingTimeByMeeting(
  supabase: SupabaseClient,
  personId: number,
  startDate?: string,
  endDate?: string,
): Promise<SpeakingTimeByMeeting[]> {
  const { data, error } = await supabase.rpc("get_speaking_time_by_meeting", {
    p_person_id: personId,
    p_start_date: startDate ?? null,
    p_end_date: endDate ?? null,
  });

  if (error) {
    console.error("Error fetching speaking time by meeting:", error);
    throw new Error(error.message);
  }

  return (data ?? []) as SpeakingTimeByMeeting[];
}

/**
 * Get speaking time broken down by topic for a specific person.
 * Topics are derived from agenda item categories via normalize_category_to_topic().
 */
export async function getSpeakingTimeByTopic(
  supabase: SupabaseClient,
  personId: number,
  startDate?: string,
  endDate?: string,
): Promise<SpeakingTimeByTopic[]> {
  const { data, error } = await supabase.rpc("get_speaking_time_by_topic", {
    p_person_id: personId,
    p_start_date: startDate ?? null,
    p_end_date: endDate ?? null,
  });

  if (error) {
    console.error("Error fetching speaking time by topic:", error);
    throw new Error(error.message);
  }

  return (data ?? []) as SpeakingTimeByTopic[];
}

/**
 * Get pre-computed stance summaries for a councillor.
 * Returns stances ordered by statement_count descending (most evidence first).
 */
export async function getCouncillorStances(
  supabase: SupabaseClient,
  personId: number,
): Promise<CouncillorStance[]> {
  const { data, error } = await supabase
    .from("councillor_stances")
    .select("*")
    .eq("person_id", personId)
    .order("statement_count", { ascending: false });

  if (error) {
    console.error("Error fetching councillor stances:", error);
    throw new Error(error.message);
  }

  return (data ?? []) as CouncillorStance[];
}

/**
 * Get pre-computed councillor highlights (overview + notable positions).
 * Returns null if no highlights exist for this person.
 */
export async function getCouncillorHighlights(
  supabase: SupabaseClient,
  personId: number,
): Promise<CouncillorHighlights | null> {
  const { data, error } = await supabase
    .from("councillor_highlights")
    .select("id, person_id, highlights, overview, narrative, narrative_generated_at, generated_at")
    .eq("person_id", personId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching councillor highlights:", error);
    throw new Error(error.message);
  }

  return data as CouncillorHighlights | null;
}

/**
 * Get top key votes for a councillor, ranked by composite score.
 * Joins to motions, meetings, and agenda_items for display context.
 */
export async function getKeyVotes(
  supabase: SupabaseClient,
  personId: number,
  limit = 15,
): Promise<KeyVote[]> {
  const { data, error } = await supabase
    .from("key_votes")
    .select(`
      id, person_id, motion_id, vote, detection_type, composite_score,
      context_summary, ally_breaks, vote_split, generated_at,
      motions!inner (
        text_content,
        meeting_id,
        meetings!inner ( meeting_date ),
        agenda_items!inner ( title )
      )
    `)
    .eq("person_id", personId)
    .order("composite_score", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching key votes:", error);
    throw new Error(error.message);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    person_id: row.person_id,
    motion_id: row.motion_id,
    vote: row.vote,
    detection_type: row.detection_type,
    composite_score: row.composite_score,
    context_summary: row.context_summary,
    ally_breaks: row.ally_breaks,
    vote_split: row.vote_split,
    generated_at: row.generated_at,
    motion_text: row.motions?.text_content,
    meeting_id: row.motions?.meeting_id,
    meeting_date: row.motions?.meetings?.meeting_date,
    agenda_item_title: row.motions?.agenda_items?.title,
  })) as KeyVote[];
}

/**
 * Get all key votes for a councillor (no limit).
 */
export async function getAllKeyVotes(
  supabase: SupabaseClient,
  personId: number,
): Promise<KeyVote[]> {
  return getKeyVotes(supabase, personId, 1000);
}
