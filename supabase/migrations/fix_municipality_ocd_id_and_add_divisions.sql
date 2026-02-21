-- Fix municipality OCD division ID and create divisions reference table
--
-- The municipalities table incorrectly stores CSD code 5917034 (Victoria)
-- instead of 5917047 (View Royal). This migration corrects it and creates
-- an ocd_divisions reference table for storing OCD division strings.
--
-- StatsCan Census references:
--   CSD 5917034 = Victoria, City
--   CSD 5917047 = View Royal, Town

-- 1. Create ocd_divisions reference table
CREATE TABLE IF NOT EXISTS ocd_divisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  division_id text NOT NULL UNIQUE,  -- e.g., 'ocd-division/country:ca/csd:5917047'
  name text NOT NULL,                -- e.g., 'View Royal'
  country text NOT NULL DEFAULT 'ca',
  csd_code text,                     -- StatsCan Census Subdivision code
  created_at timestamptz DEFAULT now()
);

-- 2. Insert View Royal division
INSERT INTO ocd_divisions (division_id, name, country, csd_code)
VALUES ('ocd-division/country:ca/csd:5917047', 'View Royal', 'ca', '5917047')
ON CONFLICT (division_id) DO NOTHING;

-- 3. Fix municipality ocd_id from Victoria (5917034) to View Royal (5917047)
UPDATE municipalities
SET ocd_id = 'ocd-division/country:ca/csd:5917047'
WHERE ocd_id = 'ocd-division/country:ca/csd:5917034'
   OR slug = 'view-royal';

-- 4. Enable RLS on ocd_divisions (read-only public table)
ALTER TABLE ocd_divisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON ocd_divisions FOR SELECT USING (true);
