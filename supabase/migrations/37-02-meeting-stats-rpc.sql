-- Migration: get_meetings_with_stats RPC
-- Provides aggregated motion counts and topic arrays for meeting list cards.
-- Used by getMeetings() to enrich meeting cards with at-a-glance data.

CREATE OR REPLACE FUNCTION get_meetings_with_stats()
RETURNS TABLE (
  meeting_id bigint,
  motion_carried_count int,
  motion_defeated_count int,
  motion_other_count int,
  topics text[]
)
LANGUAGE sql
STABLE
SET search_path = 'public'
AS $$
  WITH motion_counts AS (
    SELECT
      m.meeting_id,
      count(*) FILTER (WHERE upper(m.result) IN ('CARRIED', 'CARRIED AS AMENDED', 'AMENDED', 'CARRRIED')) AS carried,
      count(*) FILTER (WHERE upper(m.result) IN ('DEFEATED', 'FAILED', 'FAILED FOR LACK OF A SECONDER', 'FAILED FOR LACK OF SECONDER', 'NOT CARRIED')) AS defeated,
      count(*) FILTER (WHERE upper(m.result) NOT IN ('CARRIED', 'CARRIED AS AMENDED', 'AMENDED', 'CARRRIED', 'DEFEATED', 'FAILED', 'FAILED FOR LACK OF A SECONDER', 'FAILED FOR LACK OF SECONDER', 'NOT CARRIED') OR m.result IS NULL) AS other
    FROM motions m
    GROUP BY m.meeting_id
  ),
  meeting_topics AS (
    SELECT
      ai.meeting_id,
      array_agg(DISTINCT normalize_category_to_topic(ai.category)) FILTER (WHERE normalize_category_to_topic(ai.category) != 'General') AS topics
    FROM agenda_items ai
    WHERE ai.category IS NOT NULL
    GROUP BY ai.meeting_id
  )
  SELECT
    mtg.id AS meeting_id,
    coalesce(mc.carried, 0)::int AS motion_carried_count,
    coalesce(mc.defeated, 0)::int AS motion_defeated_count,
    coalesce(mc.other, 0)::int AS motion_other_count,
    coalesce(mt.topics, ARRAY[]::text[]) AS topics
  FROM meetings mtg
  LEFT JOIN motion_counts mc ON mc.meeting_id = mtg.id
  LEFT JOIN meeting_topics mt ON mt.meeting_id = mtg.id;
$$;
