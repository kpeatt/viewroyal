-- Migration: add_key_statements_text_search
-- Phase: 08-unified-search-hybrid-rag, Plan 01
-- Adds text_search tsvector column to key_statements for full-text search
-- (key_statements had embedding but no FTS column, unlike motions/transcript_segments)

ALTER TABLE key_statements ADD COLUMN text_search tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(statement_text, '') || ' ' ||
      coalesce(context, '') || ' ' ||
      coalesce(speaker_name, '')
    )
  ) STORED;

CREATE INDEX idx_key_statements_fts ON key_statements USING GIN (text_search);
