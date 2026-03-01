-- Add text_search tsvector column to bylaw_chunks for full-text search
ALTER TABLE bylaw_chunks ADD COLUMN IF NOT EXISTS text_search tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(text_content, ''))) STORED;

-- Create GIN index for full-text search on bylaw_chunks
CREATE INDEX IF NOT EXISTS idx_bylaw_chunks_fts ON bylaw_chunks USING GIN (text_search);

-- Create hybrid search RPC for bylaw_chunks using RRF (Reciprocal Rank Fusion)
-- Combines full-text search and semantic vector search for best results
CREATE OR REPLACE FUNCTION hybrid_search_bylaw_chunks(
  query_text text,
  query_embedding halfvec(384),
  match_count int,
  full_text_weight float DEFAULT 1.0,
  semantic_weight float DEFAULT 1.0,
  rrf_k float DEFAULT 50
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
AS $$
WITH full_text AS (
  SELECT
    bc.id,
    ROW_NUMBER() OVER (ORDER BY ts_rank_cd(bc.text_search, websearch_to_tsquery(query_text)) DESC) AS rank_ix
  FROM bylaw_chunks bc
  WHERE bc.text_search @@ websearch_to_tsquery(query_text)
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
),
semantic AS (
  SELECT
    bc.id,
    ROW_NUMBER() OVER (ORDER BY bc.embedding <=> query_embedding) AS rank_ix
  FROM bylaw_chunks bc
  WHERE bc.embedding IS NOT NULL
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

COMMENT ON FUNCTION hybrid_search_bylaw_chunks IS 'Hybrid search combining full-text (ts_rank_cd) and semantic (vector cosine distance) search over bylaw_chunks using Reciprocal Rank Fusion. Returns matching bylaw chunks with parent bylaw metadata.';
