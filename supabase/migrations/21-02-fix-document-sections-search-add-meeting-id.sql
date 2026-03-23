-- Quick Task 21: Fix hybrid_search_document_sections to return meeting_id and agenda_item_id
-- The old RPC only returned document_id/section_title/content, so search results
-- couldn't link to the right meeting or agenda item.

DROP FUNCTION IF EXISTS hybrid_search_document_sections(text, halfvec, int, float, float, int);
DROP FUNCTION IF EXISTS hybrid_search_document_sections(text, halfvec, int, float, float, int, date, date);

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
