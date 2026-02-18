import type { SupabaseClient } from "@supabase/supabase-js";

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
    .select("*")
    .eq("person_id", personId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching councillor highlights:", error);
    throw new Error(error.message);
  }

  return data as CouncillorHighlights | null;
}
