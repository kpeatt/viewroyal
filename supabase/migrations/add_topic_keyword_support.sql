-- Phase 05-01: Add topic/keyword subscription support
-- Seeds topics table, adds keyword columns to subscriptions,
-- adds onboarding flag to user_profiles, creates update_user_location RPC,
-- and extends find_meeting_subscribers with topic matching branches.

-- 1. Seed the topics table with 8 clean matter categories
INSERT INTO topics (name, description) VALUES
  ('Administration', 'Administrative matters, council procedures, appointments'),
  ('Bylaw', 'Bylaw readings, amendments, enforcement'),
  ('Development', 'Land use, rezoning, development permits, subdivisions'),
  ('Environment', 'Environmental protection, parks, trails, conservation'),
  ('Finance', 'Budget, taxation, grants, financial planning'),
  ('General', 'General business, correspondence, presentations'),
  ('Public Safety', 'Policing, fire, emergency management, public safety'),
  ('Transportation', 'Roads, transit, cycling, pedestrian infrastructure')
ON CONFLICT (name) DO NOTHING;

-- 2. Add keyword columns to subscriptions
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS keyword text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS keyword_embedding halfvec(384);
CREATE INDEX IF NOT EXISTS idx_subscriptions_keyword_embedding
  ON subscriptions USING hnsw (keyword_embedding halfvec_cosine_ops);

-- 3. Add onboarding flag to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- 4. Create update_user_location RPC (SECURITY DEFINER for safe geography writes)
CREATE OR REPLACE FUNCTION update_user_location(
  target_user_id uuid,
  lng double precision,
  lat double precision
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  UPDATE user_profiles
  SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  WHERE id = target_user_id;
$$;

-- 5. Extend find_meeting_subscribers with topic matching branches
-- Replaces existing function, preserving all existing UNION branches
-- (digest, matter, person, neighborhood) and adding two new ones:
--   - Category topic matching (topic_id FK -> topics.name -> matters.category)
--   - Keyword semantic matching (keyword_embedding cosine similarity > 0.45)
CREATE OR REPLACE FUNCTION public.find_meeting_subscribers(target_meeting_id bigint)
RETURNS TABLE (
  user_id uuid,
  subscription_id bigint,
  subscription_type subscription_type,
  notification_email text
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY

    -- Branch 1: Digest subscribers (everyone who wants meeting digests)
    SELECT DISTINCT
        s.user_id,
        s.id AS subscription_id,
        s.type AS subscription_type,
        COALESCE(up.notification_email, au.email) AS notification_email
    FROM subscriptions s
    JOIN user_profiles up ON up.id = s.user_id
    JOIN auth.users au ON au.id = s.user_id
    WHERE s.type = 'digest'
      AND s.is_active = true
      AND up.digest_enabled = true

    UNION

    -- Branch 2: Matter subscribers (meeting discusses their followed matter)
    SELECT DISTINCT
        s.user_id,
        s.id AS subscription_id,
        s.type AS subscription_type,
        COALESCE(up.notification_email, au.email) AS notification_email
    FROM subscriptions s
    JOIN user_profiles up ON up.id = s.user_id
    JOIN auth.users au ON au.id = s.user_id
    JOIN agenda_items ai ON ai.matter_id = s.matter_id
    WHERE s.type = 'matter'
      AND s.is_active = true
      AND ai.meeting_id = target_meeting_id

    UNION

    -- Branch 3: Person subscribers (their followed councillor moved/seconded a motion)
    SELECT DISTINCT
        s.user_id,
        s.id AS subscription_id,
        s.type AS subscription_type,
        COALESCE(up.notification_email, au.email) AS notification_email
    FROM subscriptions s
    JOIN user_profiles up ON up.id = s.user_id
    JOIN auth.users au ON au.id = s.user_id
    JOIN motions mot ON mot.meeting_id = target_meeting_id
        AND (mot.mover_id = s.person_id OR mot.seconder_id = s.person_id)
    WHERE s.type = 'person'
      AND s.is_active = true

    UNION

    -- Branch 4: Neighborhood/proximity subscribers
    SELECT DISTINCT
        s.user_id,
        s.id AS subscription_id,
        s.type AS subscription_type,
        COALESCE(up.notification_email, au.email) AS notification_email
    FROM subscriptions s
    JOIN user_profiles up ON up.id = s.user_id
    JOIN auth.users au ON au.id = s.user_id
    JOIN agenda_items ai ON ai.meeting_id = target_meeting_id
    WHERE s.type = 'neighborhood'
      AND s.is_active = true
      AND up.location IS NOT NULL
      AND ai.geo IS NOT NULL
      AND ST_DWithin(ai.geo, up.location, s.proximity_radius_m)

    UNION

    -- Branch 5: Category topic subscribers (topic_id FK -> topics.name matches matter category)
    SELECT DISTINCT
        s.user_id,
        s.id AS subscription_id,
        s.type AS subscription_type,
        COALESCE(up.notification_email, au.email) AS notification_email
    FROM subscriptions s
    JOIN user_profiles up ON up.id = s.user_id
    JOIN auth.users au ON au.id = s.user_id
    JOIN topics t ON t.id = s.topic_id
    JOIN agenda_items ai ON ai.meeting_id = target_meeting_id
    JOIN matters mat ON mat.id = ai.matter_id
    WHERE s.type = 'topic'
      AND s.is_active = true
      AND s.topic_id IS NOT NULL
      AND mat.category = t.name

    UNION

    -- Branch 6: Keyword topic subscribers (semantic embedding similarity)
    SELECT DISTINCT
        s.user_id,
        s.id AS subscription_id,
        s.type AS subscription_type,
        COALESCE(up.notification_email, au.email) AS notification_email
    FROM subscriptions s
    JOIN user_profiles up ON up.id = s.user_id
    JOIN auth.users au ON au.id = s.user_id
    JOIN agenda_items ai ON ai.meeting_id = target_meeting_id
    WHERE s.type = 'topic'
      AND s.is_active = true
      AND s.keyword_embedding IS NOT NULL
      AND ai.embedding IS NOT NULL
      AND 1 - (ai.embedding <=> s.keyword_embedding) > 0.45;
END;
$function$;
