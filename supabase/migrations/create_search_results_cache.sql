-- Migration: create_search_results_cache
-- Phase: 08-unified-search-hybrid-rag, Plan 01
-- Creates search_results_cache table for shareable AI answer URLs
-- Cached answers expire after 30 days. Short 8-char IDs for clean URLs.

CREATE TABLE search_results_cache (
  id text PRIMARY KEY DEFAULT substr(gen_random_uuid()::text, 1, 8),
  query text NOT NULL,
  answer text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]',
  suggested_followups text[] DEFAULT '{}',
  source_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '30 days'
);

CREATE INDEX idx_search_cache_expires ON search_results_cache(expires_at);

-- Enable RLS but allow public read (cached answers are shareable)
ALTER TABLE search_results_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read cached results" ON search_results_cache
  FOR SELECT USING (expires_at > now());
CREATE POLICY "Service role can insert cached results" ON search_results_cache
  FOR INSERT WITH CHECK (true);
