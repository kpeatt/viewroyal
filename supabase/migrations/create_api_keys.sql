-- API Keys table for public API authentication
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash text NOT NULL,
  key_prefix varchar(8) NOT NULL,
  name text NOT NULL DEFAULT 'Default',
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index on prefix for fast lookup (auth middleware queries by prefix first)
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix_active ON api_keys(key_prefix, is_active) WHERE is_active = true;

-- Index on user_id for listing a user's keys
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

-- Enable RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can read their own keys
CREATE POLICY "Users can view own keys" ON api_keys
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own keys
CREATE POLICY "Users can create own keys" ON api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update (deactivate) their own keys
CREATE POLICY "Users can update own keys" ON api_keys
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role bypasses RLS (used by auth middleware)
