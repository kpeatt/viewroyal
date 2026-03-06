-- RAG Traces: log every AI answer for quality evaluation
CREATE TABLE IF NOT EXISTS rag_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  answer text,
  model text DEFAULT 'gemini-2.0-flash',
  latency_ms integer,
  tool_calls jsonb DEFAULT '[]'::jsonb,
  source_count integer DEFAULT 0,
  sources jsonb DEFAULT '[]'::jsonb,
  client_ip text,
  user_id uuid REFERENCES auth.users,
  posthog_trace_id text,
  created_at timestamptz DEFAULT now()
);

-- RAG Feedback: user thumbs up/down on AI answers
CREATE TABLE IF NOT EXISTS rag_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL REFERENCES rag_traces ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating IN (-1, 1)),
  comment text,
  user_id uuid REFERENCES auth.users,
  client_ip text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rag_traces_created_at ON rag_traces (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_feedback_trace_id ON rag_feedback (trace_id);

-- Unique partial indexes for feedback upsert (one feedback per user/IP per trace)
CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_feedback_anon
  ON rag_feedback (trace_id, client_ip) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_feedback_authed
  ON rag_feedback (trace_id, user_id) WHERE user_id IS NOT NULL;

-- RLS
ALTER TABLE rag_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_feedback ENABLE ROW LEVEL SECURITY;

-- rag_traces: only service_role can read/write (server-side inserts only)
CREATE POLICY "service_role_all_rag_traces" ON rag_traces
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- rag_feedback: anon and authenticated can insert (submit feedback)
CREATE POLICY "anon_insert_rag_feedback" ON rag_feedback
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "authenticated_insert_rag_feedback" ON rag_feedback
  FOR INSERT TO authenticated WITH CHECK (true);

-- rag_feedback: service_role can read all feedback
CREATE POLICY "service_role_all_rag_feedback" ON rag_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);
