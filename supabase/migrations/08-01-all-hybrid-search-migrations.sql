-- Combined migration for Phase 08 Plan 01: Hybrid Search Infrastructure
-- Apply this in Supabase Dashboard SQL Editor (https://supabase.com/dashboard/project/bfpnsfmraazfhxckmcqk/sql)
--
-- Contains:
-- 1. Add text_search tsvector column to key_statements
-- 2. Create hybrid search RPC functions (motions, key_statements, document_sections)
-- 3. Create search_results_cache table for shareable AI answer URLs

-- ============================================================
-- Migration 1: Add text_search to key_statements
-- ============================================================

ALTER TABLE key_statements ADD COLUMN IF NOT EXISTS text_search tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(statement_text, '') || ' ' ||
      coalesce(context, '') || ' ' ||
      coalesce(speaker_name, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_key_statements_fts ON key_statements USING GIN (text_search);

-- ============================================================
-- Migration 2: Create hybrid search RPC functions
-- ============================================================

-- 2a. Hybrid search for motions
CREATE OR REPLACE FUNCTION hybrid_search_motions(
  query_text text,
  query_embedding halfvec(384),
  match_count int,
  full_text_weight float DEFAULT 1,
  semantic_weight float DEFAULT 1,
  rrf_k int DEFAULT 50
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
  WHERE m.text_search @@ websearch_to_tsquery(query_text)
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
),
semantic AS (
  SELECT
    m.id,
    ROW_NUMBER() OVER (ORDER BY m.embedding <=> query_embedding) AS rank_ix
  FROM motions m
  WHERE m.embedding IS NOT NULL
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

-- 2b. Hybrid search for key_statements
CREATE OR REPLACE FUNCTION hybrid_search_key_statements(
  query_text text,
  query_embedding halfvec(384),
  match_count int,
  full_text_weight float DEFAULT 1,
  semantic_weight float DEFAULT 1,
  rrf_k int DEFAULT 50
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
  WHERE ks.text_search @@ websearch_to_tsquery(query_text)
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
),
semantic AS (
  SELECT
    ks.id,
    ROW_NUMBER() OVER (ORDER BY ks.embedding <=> query_embedding) AS rank_ix
  FROM key_statements ks
  WHERE ks.embedding IS NOT NULL
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

-- 2c. Hybrid search for document_sections
CREATE OR REPLACE FUNCTION hybrid_search_document_sections(
  query_text text,
  query_embedding halfvec(384),
  match_count int,
  full_text_weight float DEFAULT 1,
  semantic_weight float DEFAULT 1,
  rrf_k int DEFAULT 50
)
RETURNS TABLE (
  id bigint,
  document_id bigint,
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
  WHERE ds.text_search @@ websearch_to_tsquery(query_text)
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
),
semantic AS (
  SELECT
    ds.id,
    ROW_NUMBER() OVER (ORDER BY ds.embedding <=> query_embedding) AS rank_ix
  FROM document_sections ds
  WHERE ds.embedding IS NOT NULL
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
)
SELECT
  document_sections.id,
  document_sections.document_id,
  document_sections.section_title,
  LEFT(document_sections.section_text, 500) AS content,
  (COALESCE(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
   COALESCE(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight)::float AS rank_score
FROM full_text
FULL OUTER JOIN semantic ON full_text.id = semantic.id
JOIN document_sections ON COALESCE(full_text.id, semantic.id) = document_sections.id
ORDER BY rank_score DESC
LIMIT LEAST(match_count, 30);
$$;

-- ============================================================
-- Migration 3: Create search_results_cache table
-- ============================================================

CREATE TABLE IF NOT EXISTS search_results_cache (
  id text PRIMARY KEY DEFAULT substr(gen_random_uuid()::text, 1, 8),
  query text NOT NULL,
  answer text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]',
  suggested_followups text[] DEFAULT '{}',
  source_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '30 days'
);

CREATE INDEX IF NOT EXISTS idx_search_cache_expires ON search_results_cache(expires_at);

-- Enable RLS but allow public read (cached answers are shareable)
ALTER TABLE search_results_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'search_results_cache' AND policyname = 'Anyone can read cached results'
  ) THEN
    CREATE POLICY "Anyone can read cached results" ON search_results_cache
      FOR SELECT USING (expires_at > now());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'search_results_cache' AND policyname = 'Service role can insert cached results'
  ) THEN
    CREATE POLICY "Service role can insert cached results" ON search_results_cache
      FOR INSERT WITH CHECK (true);
  END IF;
END
$$;

-- ============================================================
-- Verification queries (run these after applying)
-- ============================================================
-- SELECT proname FROM pg_proc WHERE proname LIKE 'hybrid_search_%';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'key_statements' AND column_name = 'text_search';
-- SELECT tablename FROM pg_tables WHERE tablename = 'search_results_cache';
