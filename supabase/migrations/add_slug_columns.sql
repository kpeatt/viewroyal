-- Migration: add_slug_columns
-- Adds slug columns to all 6 API-facing entity tables,
-- populates them from existing data, sets NOT NULL + unique indexes,
-- and creates BEFORE INSERT triggers for future rows.

-- =============================================================================
-- Step 1: Add nullable slug columns
-- =============================================================================

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE matters ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE motions ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE bylaws ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE agenda_items ADD COLUMN IF NOT EXISTS slug text;

-- =============================================================================
-- Step 2: Populate existing slugs
-- =============================================================================

-- 2a. Meeting slugs (handle 5 known duplicate date+type combos)
WITH ranked AS (
  SELECT id,
    meeting_date::text || '-' || lower(regexp_replace(type::text, '[^a-zA-Z0-9]+', '-', 'g')) AS base_slug,
    ROW_NUMBER() OVER (PARTITION BY meeting_date, type ORDER BY id) AS rn
  FROM meetings
)
UPDATE meetings SET slug = CASE
  WHEN ranked.rn = 1 THEN trim(BOTH '-' FROM ranked.base_slug)
  ELSE trim(BOTH '-' FROM ranked.base_slug) || '-' || ranked.rn
END
FROM ranked WHERE meetings.id = ranked.id;

-- 2b. People slugs (handle rare duplicate names with suffix)
WITH ranked AS (
  SELECT id,
    trim(BOTH '-' FROM lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'))) AS base_slug,
    ROW_NUMBER() OVER (
      PARTITION BY trim(BOTH '-' FROM lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g')))
      ORDER BY id
    ) AS rn
  FROM people
)
UPDATE people SET slug = CASE
  WHEN ranked.rn = 1 THEN ranked.base_slug
  ELSE ranked.base_slug || '-' || ranked.rn
END
FROM ranked WHERE people.id = ranked.id;

-- 2c. Matter slugs (id-prefix for guaranteed uniqueness)
UPDATE matters SET slug = id::text || '-' || left(trim(BOTH '-' FROM lower(regexp_replace(trim(title), '[^a-zA-Z0-9]+', '-', 'g'))), 50)
WHERE slug IS NULL;
-- Trim trailing hyphens from truncated slugs
UPDATE matters SET slug = rtrim(slug, '-') WHERE slug LIKE '%-';

-- 2d. Motion slugs (m-{id})
UPDATE motions SET slug = 'm-' || id::text WHERE slug IS NULL;

-- 2e. Bylaw slugs (bylaw_number if present, else id-title; handle duplicate bylaw_numbers with id suffix)
WITH ranked AS (
  SELECT id,
    CASE
      WHEN bylaw_number IS NOT NULL THEN trim(BOTH '-' FROM lower(regexp_replace(trim(bylaw_number), '[^a-zA-Z0-9]+', '-', 'g')))
      ELSE id::text || '-' || left(trim(BOTH '-' FROM lower(regexp_replace(trim(COALESCE(title, 'bylaw')), '[^a-zA-Z0-9]+', '-', 'g'))), 50)
    END AS base_slug,
    ROW_NUMBER() OVER (
      PARTITION BY municipality_id, CASE
        WHEN bylaw_number IS NOT NULL THEN trim(BOTH '-' FROM lower(regexp_replace(trim(bylaw_number), '[^a-zA-Z0-9]+', '-', 'g')))
        ELSE id::text || '-' || left(trim(BOTH '-' FROM lower(regexp_replace(trim(COALESCE(title, 'bylaw')), '[^a-zA-Z0-9]+', '-', 'g'))), 50)
      END
      ORDER BY id
    ) AS rn
  FROM bylaws
)
UPDATE bylaws SET slug = CASE
  WHEN ranked.rn = 1 THEN ranked.base_slug
  ELSE ranked.base_slug || '-' || bylaws.id
END
FROM ranked WHERE bylaws.id = ranked.id;
-- Trim trailing hyphens from truncated slugs
UPDATE bylaws SET slug = rtrim(slug, '-') WHERE slug LIKE '%-';

-- 2f. Agenda item slugs (meetingId-itemOrder-title; item_order is text, id is bigint)
WITH ranked AS (
  SELECT id,
    meeting_id::text || '-' || COALESCE(item_order, id::text) || '-' || left(trim(BOTH '-' FROM lower(regexp_replace(trim(COALESCE(title, 'item')), '[^a-zA-Z0-9]+', '-', 'g'))), 40) AS base_slug,
    ROW_NUMBER() OVER (
      PARTITION BY meeting_id::text || '-' || COALESCE(item_order, id::text) || '-' || left(trim(BOTH '-' FROM lower(regexp_replace(trim(COALESCE(title, 'item')), '[^a-zA-Z0-9]+', '-', 'g'))), 40)
      ORDER BY id
    ) AS rn
  FROM agenda_items
)
UPDATE agenda_items SET slug = CASE
  WHEN ranked.rn = 1 THEN ranked.base_slug
  ELSE ranked.base_slug || '-' || ranked.rn
END
FROM ranked WHERE agenda_items.id = ranked.id;
-- Trim trailing hyphens from truncated slugs
UPDATE agenda_items SET slug = rtrim(slug, '-') WHERE slug LIKE '%-';

-- =============================================================================
-- Step 3: Set NOT NULL
-- =============================================================================

ALTER TABLE meetings ALTER COLUMN slug SET NOT NULL;
ALTER TABLE people ALTER COLUMN slug SET NOT NULL;
ALTER TABLE matters ALTER COLUMN slug SET NOT NULL;
ALTER TABLE motions ALTER COLUMN slug SET NOT NULL;
ALTER TABLE bylaws ALTER COLUMN slug SET NOT NULL;
ALTER TABLE agenda_items ALTER COLUMN slug SET NOT NULL;

-- =============================================================================
-- Step 4: Create unique indexes
-- Tables WITH municipality_id: meetings, matters, bylaws (scoped uniqueness)
-- Tables WITHOUT: people, motions, agenda_items (global uniqueness)
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_slug_muni ON meetings(slug, municipality_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_people_slug ON people(slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_matters_slug_muni ON matters(slug, municipality_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_motions_slug ON motions(slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bylaws_slug_muni ON bylaws(slug, municipality_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agenda_items_slug ON agenda_items(slug);

-- =============================================================================
-- Step 5: Create helper function for slug generation (shared by triggers)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_slug(input text, max_len int DEFAULT 60)
RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT left(
    trim(BOTH '-' FROM lower(regexp_replace(trim(input), '[^a-zA-Z0-9]+', '-', 'g'))),
    max_len
  );
$$;

-- =============================================================================
-- Step 6: Create BEFORE INSERT triggers for auto-generating slugs
-- =============================================================================

-- 6a. Meeting slug trigger
CREATE OR REPLACE FUNCTION public.trigger_meeting_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base_slug text;
  candidate text;
  suffix int := 1;
BEGIN
  IF NEW.slug IS NOT NULL THEN
    RETURN NEW;
  END IF;

  base_slug := NEW.meeting_date::text || '-' || public.generate_slug(NEW.type::text);
  candidate := base_slug;

  -- Check for duplicates within same municipality
  WHILE EXISTS (
    SELECT 1 FROM meetings WHERE slug = candidate AND municipality_id = NEW.municipality_id
  ) LOOP
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  END LOOP;

  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meeting_slug ON meetings;
CREATE TRIGGER trg_meeting_slug
  BEFORE INSERT ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_meeting_slug();

-- 6b. Person slug trigger
CREATE OR REPLACE FUNCTION public.trigger_person_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base_slug text;
  candidate text;
  suffix int := 1;
BEGIN
  IF NEW.slug IS NOT NULL THEN
    RETURN NEW;
  END IF;

  base_slug := public.generate_slug(NEW.name);
  candidate := base_slug;

  WHILE EXISTS (
    SELECT 1 FROM people WHERE slug = candidate
  ) LOOP
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  END LOOP;

  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_person_slug ON people;
CREATE TRIGGER trg_person_slug
  BEFORE INSERT ON people
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_person_slug();

-- 6c. Matter slug trigger
CREATE OR REPLACE FUNCTION public.trigger_matter_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NOT NULL THEN
    RETURN NEW;
  END IF;

  NEW.slug := NEW.id::text || '-' || left(public.generate_slug(NEW.title, 50), 50);
  -- id-prefix guarantees uniqueness
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matter_slug ON matters;
CREATE TRIGGER trg_matter_slug
  BEFORE INSERT ON matters
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_matter_slug();

-- 6d. Motion slug trigger
CREATE OR REPLACE FUNCTION public.trigger_motion_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NOT NULL THEN
    RETURN NEW;
  END IF;

  NEW.slug := 'm-' || NEW.id::text;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_motion_slug ON motions;
CREATE TRIGGER trg_motion_slug
  BEFORE INSERT ON motions
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_motion_slug();

-- 6e. Bylaw slug trigger (with dedup for shared bylaw_numbers)
CREATE OR REPLACE FUNCTION public.trigger_bylaw_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base_slug text;
  candidate text;
BEGIN
  IF NEW.slug IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.bylaw_number IS NOT NULL THEN
    base_slug := public.generate_slug(NEW.bylaw_number);
  ELSE
    base_slug := NEW.id::text || '-' || left(public.generate_slug(COALESCE(NEW.title, 'bylaw'), 50), 50);
  END IF;

  candidate := base_slug;

  -- Handle duplicate bylaw_numbers within same municipality
  IF EXISTS (
    SELECT 1 FROM bylaws WHERE slug = candidate AND municipality_id = NEW.municipality_id
  ) THEN
    candidate := base_slug || '-' || NEW.id;
  END IF;

  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bylaw_slug ON bylaws;
CREATE TRIGGER trg_bylaw_slug
  BEFORE INSERT ON bylaws
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_bylaw_slug();

-- 6f. Agenda item slug trigger
CREATE OR REPLACE FUNCTION public.trigger_agenda_item_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NOT NULL THEN
    RETURN NEW;
  END IF;

  NEW.slug := NEW.meeting_id::text || '-' || COALESCE(NEW.item_order, NEW.id::text) || '-' || left(public.generate_slug(COALESCE(NEW.title, 'item'), 40), 40);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agenda_item_slug ON agenda_items;
CREATE TRIGGER trg_agenda_item_slug
  BEFORE INSERT ON agenda_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_agenda_item_slug();
