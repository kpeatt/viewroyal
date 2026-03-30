-- Phase 41 Plan 01: Add filter_municipality_id to all RPCs for data isolation
-- Every function gets a new `filter_municipality_id bigint DEFAULT NULL` parameter.
-- NULL = no filter (backward compatible). Non-null = scope to that municipality.

-- ============================================================================
-- 1. hybrid_search_motions
-- ============================================================================
DROP FUNCTION IF EXISTS hybrid_search_motions(text, halfvec(384), int, float, float, int, date, date);

CREATE OR REPLACE FUNCTION hybrid_search_motions(
  query_text text,
  query_embedding halfvec(384),
  match_count int,
  full_text_weight float DEFAULT 1,
  semantic_weight float DEFAULT 1,
  rrf_k int DEFAULT 50,
  date_from date DEFAULT NULL,
  date_to date DEFAULT NULL,
  filter_municipality_id bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  meeting_id bigint,
  agenda_item_id bigint,
  text_content text,
  plain_english_summary text,
  result text,
  mover text,
  seconder text,
  rank_score float
)
LANGUAGE sql
SET search_path = 'public'
AS $$
WITH full_text AS (
  SELECT
    m.id,
    ROW_NUMBER() OVER (ORDER BY ts_rank_cd(m.text_search, websearch_to_tsquery(query_text)) DESC) AS rank_ix
  FROM motions m
  JOIN meetings mt ON mt.id = m.meeting_id
  WHERE m.text_search @@ websearch_to_tsquery(query_text)
    AND (date_from IS NULL OR mt.meeting_date >= date_from)
    AND (date_to IS NULL OR mt.meeting_date <= date_to)
    AND (filter_municipality_id IS NULL OR mt.municipality_id = filter_municipality_id)
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
),
semantic AS (
  SELECT
    m.id,
    ROW_NUMBER() OVER (ORDER BY m.embedding <=> query_embedding) AS rank_ix
  FROM motions m
  JOIN meetings mt ON mt.id = m.meeting_id
  WHERE m.embedding IS NOT NULL
    AND (date_from IS NULL OR mt.meeting_date >= date_from)
    AND (date_to IS NULL OR mt.meeting_date <= date_to)
    AND (filter_municipality_id IS NULL OR mt.municipality_id = filter_municipality_id)
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
)
SELECT
  motions.id,
  motions.meeting_id,
  motions.agenda_item_id,
  motions.text_content,
  motions.plain_english_summary,
  motions.result,
  motions.mover,
  motions.seconder,
  (COALESCE(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
   COALESCE(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight)::float AS rank_score
FROM full_text
FULL OUTER JOIN semantic ON full_text.id = semantic.id
JOIN motions ON COALESCE(full_text.id, semantic.id) = motions.id
ORDER BY rank_score DESC
LIMIT LEAST(match_count, 30);
$$;

-- ============================================================================
-- 2. hybrid_search_key_statements
-- ============================================================================
DROP FUNCTION IF EXISTS hybrid_search_key_statements(text, halfvec(384), int, float, float, int, date, date);

CREATE OR REPLACE FUNCTION hybrid_search_key_statements(
  query_text text,
  query_embedding halfvec(384),
  match_count int,
  full_text_weight float DEFAULT 1,
  semantic_weight float DEFAULT 1,
  rrf_k int DEFAULT 50,
  date_from date DEFAULT NULL,
  date_to date DEFAULT NULL,
  filter_municipality_id bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  meeting_id bigint,
  agenda_item_id bigint,
  speaker_name text,
  statement_type text,
  statement_text text,
  context text,
  rank_score float
)
LANGUAGE sql
SET search_path = 'public'
AS $$
WITH full_text AS (
  SELECT
    ks.id,
    ROW_NUMBER() OVER (ORDER BY ts_rank_cd(ks.text_search, websearch_to_tsquery(query_text)) DESC) AS rank_ix
  FROM key_statements ks
  JOIN meetings mt ON mt.id = ks.meeting_id
  WHERE ks.text_search @@ websearch_to_tsquery(query_text)
    AND (date_from IS NULL OR mt.meeting_date >= date_from)
    AND (date_to IS NULL OR mt.meeting_date <= date_to)
    AND (filter_municipality_id IS NULL OR ks.municipality_id = filter_municipality_id)
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
),
semantic AS (
  SELECT
    ks.id,
    ROW_NUMBER() OVER (ORDER BY ks.embedding <=> query_embedding) AS rank_ix
  FROM key_statements ks
  JOIN meetings mt ON mt.id = ks.meeting_id
  WHERE ks.embedding IS NOT NULL
    AND (date_from IS NULL OR mt.meeting_date >= date_from)
    AND (date_to IS NULL OR mt.meeting_date <= date_to)
    AND (filter_municipality_id IS NULL OR ks.municipality_id = filter_municipality_id)
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
)
SELECT
  key_statements.id,
  key_statements.meeting_id,
  key_statements.agenda_item_id,
  key_statements.speaker_name,
  key_statements.statement_type,
  key_statements.statement_text,
  key_statements.context,
  (COALESCE(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
   COALESCE(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight)::float AS rank_score
FROM full_text
FULL OUTER JOIN semantic ON full_text.id = semantic.id
JOIN key_statements ON COALESCE(full_text.id, semantic.id) = key_statements.id
ORDER BY rank_score DESC
LIMIT LEAST(match_count, 30);
$$;

-- ============================================================================
-- 3. hybrid_search_document_sections
-- ============================================================================
DROP FUNCTION IF EXISTS hybrid_search_document_sections(text, halfvec(384), int, float, float, int, date, date);

CREATE OR REPLACE FUNCTION hybrid_search_document_sections(
  query_text text,
  query_embedding halfvec(384),
  match_count int,
  full_text_weight float DEFAULT 1,
  semantic_weight float DEFAULT 1,
  rrf_k int DEFAULT 50,
  date_from date DEFAULT NULL,
  date_to date DEFAULT NULL,
  filter_municipality_id bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  document_id bigint,
  meeting_id bigint,
  agenda_item_id bigint,
  section_title text,
  content text,
  rank_score float
)
LANGUAGE sql
SET search_path = 'public'
AS $$
WITH full_text AS (
  SELECT
    ds.id,
    ROW_NUMBER() OVER (ORDER BY ts_rank_cd(ds.text_search, websearch_to_tsquery(query_text)) DESC) AS rank_ix
  FROM document_sections ds
  JOIN documents d ON d.id = ds.document_id
  JOIN meetings mt ON mt.id = d.meeting_id
  WHERE ds.text_search @@ websearch_to_tsquery(query_text)
    AND (date_from IS NULL OR mt.meeting_date >= date_from)
    AND (date_to IS NULL OR mt.meeting_date <= date_to)
    AND (filter_municipality_id IS NULL OR ds.municipality_id = filter_municipality_id)
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
),
semantic AS (
  SELECT
    ds.id,
    ROW_NUMBER() OVER (ORDER BY ds.embedding <=> query_embedding) AS rank_ix
  FROM document_sections ds
  JOIN documents d ON d.id = ds.document_id
  JOIN meetings mt ON mt.id = d.meeting_id
  WHERE ds.embedding IS NOT NULL
    AND (date_from IS NULL OR mt.meeting_date >= date_from)
    AND (date_to IS NULL OR mt.meeting_date <= date_to)
    AND (filter_municipality_id IS NULL OR ds.municipality_id = filter_municipality_id)
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
)
SELECT
  document_sections.id,
  document_sections.document_id,
  documents.meeting_id,
  document_sections.agenda_item_id,
  document_sections.section_title,
  LEFT(document_sections.section_text, 500) AS content,
  (COALESCE(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
   COALESCE(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight)::float AS rank_score
FROM full_text
FULL OUTER JOIN semantic ON full_text.id = semantic.id
JOIN document_sections ON COALESCE(full_text.id, semantic.id) = document_sections.id
JOIN documents ON documents.id = document_sections.document_id
ORDER BY rank_score DESC
LIMIT LEAST(match_count, 30);
$$;

-- ============================================================================
-- 4. hybrid_search_bylaw_chunks
-- ============================================================================
DROP FUNCTION IF EXISTS hybrid_search_bylaw_chunks(text, halfvec(384), int, float, float, float);

CREATE OR REPLACE FUNCTION hybrid_search_bylaw_chunks(
  query_text text,
  query_embedding halfvec(384),
  match_count int,
  full_text_weight float DEFAULT 1.0,
  semantic_weight float DEFAULT 1.0,
  rrf_k float DEFAULT 50,
  filter_municipality_id bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  bylaw_id bigint,
  chunk_index int,
  text_content text,
  bylaw_title text,
  bylaw_number text,
  rank_score float
)
LANGUAGE sql
SET search_path = 'public'
AS $$
WITH full_text AS (
  SELECT
    bc.id,
    ROW_NUMBER() OVER (ORDER BY ts_rank_cd(bc.text_search, websearch_to_tsquery(query_text)) DESC) AS rank_ix
  FROM bylaw_chunks bc
  JOIN bylaws b2 ON b2.id = bc.bylaw_id
  WHERE bc.text_search @@ websearch_to_tsquery(query_text)
    AND (filter_municipality_id IS NULL OR b2.municipality_id = filter_municipality_id)
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
),
semantic AS (
  SELECT
    bc.id,
    ROW_NUMBER() OVER (ORDER BY bc.embedding <=> query_embedding) AS rank_ix
  FROM bylaw_chunks bc
  JOIN bylaws b2 ON b2.id = bc.bylaw_id
  WHERE bc.embedding IS NOT NULL
    AND (filter_municipality_id IS NULL OR b2.municipality_id = filter_municipality_id)
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
)
SELECT
  bylaw_chunks.id,
  bylaw_chunks.bylaw_id,
  bylaw_chunks.chunk_index,
  LEFT(bylaw_chunks.text_content, 500) AS text_content,
  b.title AS bylaw_title,
  b.bylaw_number,
  (COALESCE(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
   COALESCE(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight)::float AS rank_score
FROM full_text
FULL OUTER JOIN semantic ON full_text.id = semantic.id
JOIN bylaw_chunks ON COALESCE(full_text.id, semantic.id) = bylaw_chunks.id
JOIN bylaws b ON bylaw_chunks.bylaw_id = b.id
ORDER BY rank_score DESC
LIMIT LEAST(match_count, 30);
$$;

-- ============================================================================
-- 5. match_motions
-- ============================================================================
CREATE OR REPLACE FUNCTION match_motions (
  query_embedding halfvec(384),
  match_threshold float,
  match_count int,
  filter_municipality_id bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  meeting_id bigint,
  agenda_item_id bigint,
  text_content text,
  mover text,
  seconder text,
  result text,
  similarity float
)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id, m.meeting_id, m.agenda_item_id, m.text_content,
    m.mover, m.seconder, m.result,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM motions m
  JOIN meetings mt ON mt.id = m.meeting_id
  WHERE 1 - (m.embedding <=> query_embedding) > match_threshold
    AND (filter_municipality_id IS NULL OR mt.municipality_id = filter_municipality_id)
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- 6. match_matters
-- ============================================================================
CREATE OR REPLACE FUNCTION match_matters (
  query_embedding halfvec(384),
  match_threshold float,
  match_count int,
  filter_municipality_id bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  title text,
  plain_english_summary text,
  similarity float
)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ma.id, ma.title, ma.plain_english_summary,
    1 - (ma.embedding <=> query_embedding) AS similarity
  FROM matters ma
  WHERE 1 - (ma.embedding <=> query_embedding) > match_threshold
    AND (filter_municipality_id IS NULL OR ma.municipality_id = filter_municipality_id)
  ORDER BY ma.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- 7. match_agenda_items
-- ============================================================================
CREATE OR REPLACE FUNCTION match_agenda_items (
  query_embedding halfvec(384),
  match_threshold float,
  match_count int,
  filter_municipality_id bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  meeting_id bigint,
  title text,
  plain_english_summary text,
  debate_summary text,
  similarity float
)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ai.id, ai.meeting_id, ai.title, ai.plain_english_summary, ai.debate_summary,
    1 - (ai.embedding <=> query_embedding) AS similarity
  FROM agenda_items ai
  JOIN meetings mt ON mt.id = ai.meeting_id
  WHERE 1 - (ai.embedding <=> query_embedding) > match_threshold
    AND (filter_municipality_id IS NULL OR mt.municipality_id = filter_municipality_id)
  ORDER BY ai.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- 8. match_key_statements
-- ============================================================================
CREATE OR REPLACE FUNCTION match_key_statements (
  query_embedding halfvec(384),
  match_threshold float,
  match_count int,
  filter_municipality_id bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  meeting_id bigint,
  agenda_item_id bigint,
  speaker_name text,
  statement_type text,
  statement_text text,
  context text,
  similarity float
)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ks.id, ks.meeting_id, ks.agenda_item_id, ks.speaker_name,
    ks.statement_type, ks.statement_text, ks.context,
    1 - (ks.embedding <=> query_embedding) AS similarity
  FROM key_statements ks
  WHERE 1 - (ks.embedding <=> query_embedding) > match_threshold
    AND (filter_municipality_id IS NULL OR ks.municipality_id = filter_municipality_id)
  ORDER BY ks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- 9. match_bylaws
-- ============================================================================
CREATE OR REPLACE FUNCTION match_bylaws (
  query_embedding halfvec(384),
  match_threshold float,
  match_count int,
  filter_municipality_id bigint DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  title text,
  bylaw_number text,
  plain_english_summary text,
  similarity float
)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id,
    b.title,
    b.bylaw_number,
    b.plain_english_summary,
    1 - (b.embedding <=> query_embedding) AS similarity
  FROM bylaws b
  WHERE 1 - (b.embedding <=> query_embedding) > match_threshold
    AND (filter_municipality_id IS NULL OR b.municipality_id = filter_municipality_id)
  ORDER BY b.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- 10. get_meetings_with_stats
-- ============================================================================
DROP FUNCTION IF EXISTS get_meetings_with_stats();

CREATE OR REPLACE FUNCTION get_meetings_with_stats(
  filter_municipality_id bigint DEFAULT NULL
)
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
  LEFT JOIN meeting_topics mt ON mt.meeting_id = mtg.id
  WHERE (filter_municipality_id IS NULL OR mtg.municipality_id = filter_municipality_id);
$$;

-- ============================================================================
-- 11. get_speaking_time_stats
-- ============================================================================
CREATE OR REPLACE FUNCTION get_speaking_time_stats(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  filter_municipality_id bigint DEFAULT NULL
)
RETURNS TABLE (
  person_id bigint,
  person_name text,
  image_url text,
  total_seconds numeric,
  meeting_count bigint,
  segment_count bigint
)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ts.person_id,
    p.name AS person_name,
    p.image_url,
    round(sum(ts.end_time - ts.start_time)::numeric, 1) AS total_seconds,
    count(DISTINCT ts.meeting_id) AS meeting_count,
    count(*) AS segment_count
  FROM transcript_segments ts
  JOIN people p ON ts.person_id = p.id
  JOIN meetings m ON ts.meeting_id = m.id
  WHERE ts.person_id IS NOT NULL
    AND (p_start_date IS NULL OR m.meeting_date >= p_start_date)
    AND (p_end_date IS NULL OR m.meeting_date <= p_end_date)
    AND (filter_municipality_id IS NULL OR m.municipality_id = filter_municipality_id)
  GROUP BY ts.person_id, p.name, p.image_url
  ORDER BY sum(ts.end_time - ts.start_time) DESC;
END;
$$;

-- ============================================================================
-- 12. get_speaking_time_by_meeting
-- ============================================================================
CREATE OR REPLACE FUNCTION get_speaking_time_by_meeting(
  p_person_id bigint,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  filter_municipality_id bigint DEFAULT NULL
)
RETURNS TABLE (
  meeting_id bigint,
  meeting_date date,
  seconds_spoken numeric,
  segment_count bigint
)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ts.meeting_id,
    m.meeting_date::date AS meeting_date,
    round(sum(ts.end_time - ts.start_time)::numeric, 1) AS seconds_spoken,
    count(*) AS segment_count
  FROM transcript_segments ts
  JOIN meetings m ON ts.meeting_id = m.id
  WHERE ts.person_id = p_person_id
    AND (p_start_date IS NULL OR m.meeting_date >= p_start_date)
    AND (p_end_date IS NULL OR m.meeting_date <= p_end_date)
    AND (filter_municipality_id IS NULL OR m.municipality_id = filter_municipality_id)
  GROUP BY ts.meeting_id, m.meeting_date
  ORDER BY m.meeting_date ASC;
END;
$$;

-- ============================================================================
-- 13. get_speaking_time_by_topic
-- ============================================================================
CREATE OR REPLACE FUNCTION get_speaking_time_by_topic(
  p_person_id bigint,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  filter_municipality_id bigint DEFAULT NULL
)
RETURNS TABLE (
  topic text,
  total_seconds numeric,
  segment_count bigint
)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    coalesce(
      normalize_category_to_topic(ai.category),
      'General'
    ) AS topic,
    round(sum(ts.end_time - ts.start_time)::numeric, 1) AS total_seconds,
    count(*) AS segment_count
  FROM transcript_segments ts
  JOIN meetings m ON ts.meeting_id = m.id
  LEFT JOIN agenda_items ai ON (
    -- Direct link via agenda_item_id if available
    (ts.agenda_item_id IS NOT NULL AND ai.id = ts.agenda_item_id)
    OR
    -- Time-overlap fallback: segment start_time falls within agenda item discussion window
    (ts.agenda_item_id IS NULL
     AND ai.meeting_id = ts.meeting_id
     AND ai.discussion_start_time IS NOT NULL
     AND ai.discussion_end_time IS NOT NULL
     AND ts.start_time >= ai.discussion_start_time
     AND ts.start_time < ai.discussion_end_time)
  )
  WHERE ts.person_id = p_person_id
    AND (p_start_date IS NULL OR m.meeting_date >= p_start_date)
    AND (p_end_date IS NULL OR m.meeting_date <= p_end_date)
    AND (filter_municipality_id IS NULL OR m.municipality_id = filter_municipality_id)
  GROUP BY normalize_category_to_topic(ai.category)
  ORDER BY sum(ts.end_time - ts.start_time) DESC;
END;
$$;
