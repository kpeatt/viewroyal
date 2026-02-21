---
phase: 16-core-data-search-api
plan: 01
subsystem: api
tags: [pagination, cursor, slug, envelope, supabase, migration, hono]

# Dependency graph
requires:
  - phase: 15-api-foundation
    provides: "Hono app with ApiEnv types, request ID middleware, API key auth"
provides:
  - "Cursor encode/decode and extractPage utility for keyset pagination"
  - "Response envelope builders (listResponse, detailResponse) with consistent shape"
  - "Slug generation functions for all 6 entity types"
  - "Populated slug columns on meetings, people, matters, motions, bylaws, agenda_items"
  - "BEFORE INSERT triggers for auto-generating slugs on new rows"
  - "Shared generate_slug() SQL function"
affects: [16-02, 16-03, 16-04, web-app-slug-routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Keyset pagination via base64 cursors wrapping sort-value + row ID"
    - "Consistent response envelope: { data, pagination, meta } with snake_case fields"
    - "Entity slugs as API-facing identifiers (never raw integer PKs)"
    - "Trigger-based slug generation for future inserts"

key-files:
  created:
    - apps/web/app/api/lib/cursor.ts
    - apps/web/app/api/lib/envelope.ts
    - apps/web/app/api/lib/slugs.ts
    - supabase/migrations/add_slug_columns.sql
  modified: []

key-decisions:
  - "snake_case for all API field names (matches DB columns and civic API conventions)"
  - "Always include null fields explicitly in responses (never omit empty fields)"
  - "People slug dedup: append -N suffix for duplicate names (1 found: D. D'Sa)"
  - "Bylaw slug dedup: append -id suffix for shared bylaw_numbers (4 bylaws share number 958)"
  - "Agenda item slugs use text item_order column (not integer) since that's the actual DB type"

patterns-established:
  - "encodeCursor/decodeCursor: opaque base64 cursors for all list endpoints"
  - "extractPage: fetch perPage+1, slice, determine has_more"
  - "listResponse/detailResponse: consistent envelope with request_id in meta"
  - "slugify(text, maxLength): ASCII-only slug generation for BC civic data"
  - "Trigger-based slug generation with duplicate detection loops"

requirements-completed: [DATA-11, DATA-12]

# Metrics
duration: 5min
completed: 2026-02-21
---

# Phase 16 Plan 01: Shared Utilities & Slug Migration Summary

**Cursor pagination, response envelope, and slug utilities with a migration adding indexed slug columns to all 6 entity tables**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-21T18:57:35Z
- **Completed:** 2026-02-21T19:02:56Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Three shared utility modules (cursor.ts, envelope.ts, slugs.ts) providing the foundation for all Phase 16 data endpoints
- Slug columns populated across 26,074 rows (737 meetings + 837 people + 1,727 matters + 10,536 motions + 43 bylaws + 12,194 agenda items)
- Unique indexes and BEFORE INSERT triggers ensure slug consistency for all future data

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cursor pagination, response envelope, and slug generation utilities** - `3e0668b0` (feat)
2. **Task 2: Add slug columns to entity tables via Supabase migration** - `ba5bcf39` (feat)

## Files Created/Modified
- `apps/web/app/api/lib/cursor.ts` - Cursor encode/decode and extractPage for keyset pagination
- `apps/web/app/api/lib/envelope.ts` - listResponse/detailResponse envelope builders
- `apps/web/app/api/lib/slugs.ts` - slugify + meetingSlug/personSlug/matterSlug/motionSlug/bylawSlug/agendaItemSlug
- `supabase/migrations/add_slug_columns.sql` - Full migration: add columns, populate, NOT NULL, unique indexes, triggers

## Decisions Made
- snake_case for all API field names (matches DB columns and civic API conventions)
- Always include null fields explicitly (consumers can rely on consistent schema)
- People slug dedup via -N suffix (found 1 duplicate name: "D. D'Sa" appears twice)
- Bylaw slug dedup via -id suffix (4 bylaws share bylaw_number "958" with different titles)
- Agenda item `item_order` is a text column (not integer) -- COALESCE fallback uses `id::text` for type compatibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed COALESCE type mismatch in agenda_items slug generation**
- **Found during:** Task 2 (Slug migration)
- **Issue:** Plan used `COALESCE(item_order, id)` but `item_order` is text and `id` is bigint -- Postgres cannot match these types
- **Fix:** Changed to `COALESCE(item_order, id::text)` for string concatenation context
- **Files modified:** supabase/migrations/add_slug_columns.sql
- **Verification:** All 12,194 agenda_items slugs populated successfully
- **Committed in:** ba5bcf39 (Task 2 commit)

**2. [Rule 1 - Bug] Added dedup handling for people slugs (duplicate names)**
- **Found during:** Task 2 (Slug migration)
- **Issue:** Plan assumed people names are unique, but "D. D'Sa" appears twice (id 317, 600) -- unique index creation failed
- **Fix:** Changed simple UPDATE to ranked CTE with ROW_NUMBER() suffix for duplicates (same pattern as meetings)
- **Files modified:** supabase/migrations/add_slug_columns.sql
- **Verification:** idx_people_slug unique index created successfully, 0 duplicates
- **Committed in:** ba5bcf39 (Task 2 commit)

**3. [Rule 1 - Bug] Added dedup handling for bylaw slugs (shared bylaw_numbers)**
- **Found during:** Task 2 (Slug migration)
- **Issue:** Four bylaws share bylaw_number "958" (Fees and Charges amendments) -- unique index creation failed
- **Fix:** Changed to ranked CTE with id-suffix for duplicates; updated trigger to check for existing slugs before insert
- **Files modified:** supabase/migrations/add_slug_columns.sql
- **Verification:** idx_bylaws_slug_muni unique index created successfully, 0 duplicates
- **Committed in:** ba5bcf39 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 bugs -- data type mismatch + 2 uniqueness violations)
**Impact on plan:** All fixes necessary for migration correctness. No scope creep. The plan's assumptions about data uniqueness were incorrect for 2 of 6 tables.

## Issues Encountered
- Migration had to be applied in stages due to cascading failures (index created before data populated, type errors). The local SQL file was updated to reflect the corrected migration that would work as a single-pass execution.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 entity tables have populated, NOT NULL, unique slug columns ready for slug-based lookups
- cursor.ts, envelope.ts, and slugs.ts are ready for import by Plans 02-04 endpoint implementations
- Triggers handle future pipeline inserts without requiring pipeline code changes

---
*Phase: 16-core-data-search-api*
*Completed: 2026-02-21*
