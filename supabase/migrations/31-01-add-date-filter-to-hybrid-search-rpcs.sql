-- Phase 31 Plan 01: Add date_from/date_to params to hybrid search RPCs
-- This allows filtering search results by meeting date range

-- 1. Hybrid search for motions (with date filtering)
CREATE OR REPLACE FUNCTION hybrid_search_motions(
  query_text text,
  query_embedding halfvec(384),
  match_count int,
  full_text_weight float DEFAULT 1,
  semantic_weight float DEFAULT 1,
  rrf_k int DEFAULT 50,
  date_from date DEFAULT NULL,
  date_to date DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  meeting_id bigint,
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
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
)
SELECT
  motions.id,
  motions.meeting_id,
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

-- 2. Hybrid search for key_statements (with date filtering)
CREATE OR REPLACE FUNCTION hybrid_search_key_statements(
  query_text text,
  query_embedding halfvec(384),
  match_count int,
  full_text_weight float DEFAULT 1,
  semantic_weight float DEFAULT 1,
  rrf_k int DEFAULT 50,
  date_from date DEFAULT NULL,
  date_to date DEFAULT NULL
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

-- 3. Hybrid search for document_sections (with date filtering + meeting_id in RETURNS)
CREATE OR REPLACE FUNCTION hybrid_search_document_sections(
  query_text text,
  query_embedding halfvec(384),
  match_count int,
  full_text_weight float DEFAULT 1,
  semantic_weight float DEFAULT 1,
  rrf_k int DEFAULT 50,
  date_from date DEFAULT NULL,
  date_to date DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  document_id bigint,
  meeting_id bigint,
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
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
)
SELECT
  document_sections.id,
  document_sections.document_id,
  d.meeting_id,
  document_sections.section_title,
  LEFT(document_sections.section_text, 500) AS content,
  (COALESCE(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
   COALESCE(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight)::float AS rank_score
FROM full_text
FULL OUTER JOIN semantic ON full_text.id = semantic.id
JOIN document_sections ON COALESCE(full_text.id, semantic.id) = document_sections.id
JOIN documents d ON d.id = document_sections.document_id
ORDER BY rank_score DESC
LIMIT LEAST(match_count, 30);
$$;
