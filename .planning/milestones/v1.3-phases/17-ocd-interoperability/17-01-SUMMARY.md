---
phase: 17-ocd-interoperability
plan: 01
subsystem: api
tags: [ocd, uuid-v5, pagination, web-crypto, open-civic-data, supabase-migration]

# Dependency graph
requires:
  - phase: 15-api-foundation
    provides: Hono router, API middleware, ApiEnv types
  - phase: 16-core-data-search-api
    provides: Serializer patterns, envelope conventions, slug utilities
provides:
  - UUID v5 deterministic OCD ID generation (ocd-ids.ts)
  - Page-based pagination utilities matching OpenStates v3 (pagination.ts)
  - OpenStates-style response envelope builder (ocd-envelope.ts)
  - ocd_divisions reference table with View Royal division
  - Corrected municipality OCD division ID (5917047)
affects: [17-02, 17-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [uuid-v5-web-crypto, page-based-pagination, ocd-response-envelope]

key-files:
  created:
    - apps/web/app/api/ocd/lib/ocd-ids.ts
    - apps/web/app/api/ocd/lib/pagination.ts
    - apps/web/app/api/ocd/lib/ocd-envelope.ts
    - supabase/migrations/fix_municipality_ocd_id_and_add_divisions.sql
  modified: []

key-decisions:
  - "Hand-rolled UUID v5 using Web Crypto API (crypto.subtle.digest) -- 20 lines, no new dependency"
  - "ViewRoyal.ai namespace UUID f47ac10b-58cc-4372-a567-0d02b2c3d479 hardcoded for deterministic ID generation"
  - "Page-based pagination defaults: page=1, per_page=20, max 100 -- matching OpenStates v3 convention"
  - "OCD detail responses return entity at top level (no wrapper), matching OpenStates"

patterns-established:
  - "UUID v5 from Web Crypto: parseUuid -> concat namespace+name -> SHA-1 -> set version/variant bits -> formatUuid"
  - "Batch OCD ID generation via ocdIds(type, pks[]) to avoid async-in-map pitfall"
  - "OCD pagination separate from v1 cursor pagination -- different modules, different conventions"
  - "OCD envelope separate from v1 envelope -- results+pagination vs data+pagination+meta"

requirements-completed: [OCD-08, OCD-07]

# Metrics
duration: 5min
completed: 2026-02-21
---

# Phase 17 Plan 01: OCD Infrastructure Summary

**Deterministic UUID v5 OCD ID generation via Web Crypto, OpenStates-style page-based pagination, and municipality division ID fix from Victoria (5917034) to View Royal (5917047)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-21T21:08:47Z
- **Completed:** 2026-02-21T21:14:04Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- UUID v5 generation for all 5 entity types (person, organization, event, bill, vote) plus division/jurisdiction IDs
- Batch ID helper (`ocdIds`) for pre-computing OCD IDs in parallel, avoiding async-in-map pitfall
- Page-based pagination with query param parsing, clamping, and max_page computation
- OpenStates-style list/detail response envelopes separate from v1 API format
- Municipality ocd_id corrected from CSD 5917034 (Victoria) to 5917047 (View Royal)
- ocd_divisions reference table created with RLS and View Royal row

## Task Commits

Each task was committed atomically:

1. **Task 1: Create OCD ID generation, pagination, and envelope utilities** - `3df7b5fe` (feat)
2. **Task 2: Fix municipality OCD division ID and create divisions reference table** - `fc9d5504` (fix)

## Files Created/Modified
- `apps/web/app/api/ocd/lib/ocd-ids.ts` - UUID v5 generation, per-entity OCD ID formatters, batch helper
- `apps/web/app/api/ocd/lib/pagination.ts` - Page-based pagination params parsing and computation
- `apps/web/app/api/ocd/lib/ocd-envelope.ts` - OpenStates-format list and detail response builders
- `supabase/migrations/fix_municipality_ocd_id_and_add_divisions.sql` - Division table + municipality fix

## Decisions Made
- Hand-rolled UUID v5 using Web Crypto instead of adding `uuid` npm package -- only ~40 lines of code and avoids a new dependency for a single function
- Hardcoded namespace UUID for ViewRoyal.ai OCD IDs -- deterministic and stable
- OCD pagination defaults to per_page=20 (vs OpenStates default of 10) for larger municipal datasets
- Kept OCD envelope module completely separate from v1 envelope -- different response shapes, no shared logic

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `supabase db push` skips migrations without timestamp prefixes (existing project convention uses descriptive names without timestamps). Applied SQL directly via psql through the Supabase pooler URL instead.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three shared utility modules ready for import by Plan 02 (serializers) and Plan 03 (endpoints)
- Database migration applied -- municipality ocd_id and ocd_divisions table are live
- TypeScript compiles cleanly with no errors in new modules

## Self-Check: PASSED

All 4 created files verified on disk. Both task commits (3df7b5fe, fc9d5504) verified in git log.

---
*Phase: 17-ocd-interoperability*
*Completed: 2026-02-21*
