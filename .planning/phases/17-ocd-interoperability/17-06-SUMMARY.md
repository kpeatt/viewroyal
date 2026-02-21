---
phase: 17-ocd-interoperability
plan: 06
subsystem: api
tags: [ocd, supabase, postgrest, hono, column-fix, row-limit]

# Dependency graph
requires:
  - phase: 17-ocd-interoperability
    provides: OCD endpoints, serializers, and reverse-lookup pattern (plans 01-05)
provides:
  - Organization endpoints return 200 (not 500) by querying only existing columns
  - Bill detail endpoint returns 200 (not 500) by removing non-existent document_url column
  - Vote and bill detail endpoints fetch all rows for OCD ID reverse-lookup (no PostgREST truncation)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Explicit .limit(100000) on full-table reverse-lookup queries to bypass PostgREST default row limit"

key-files:
  created: []
  modified:
    - apps/web/app/api/ocd/endpoints/organizations.ts
    - apps/web/app/api/ocd/endpoints/bills.ts
    - apps/web/app/api/ocd/endpoints/votes.ts
    - apps/web/app/api/ocd/serializers/bill.ts

key-decisions:
  - "100000 row limit on reverse-lookup queries provides 10x safety margin over current data volume"

patterns-established:
  - "Always verify DB columns exist before adding to Supabase .select() strings"
  - "Full-table fetches must use explicit .limit() to avoid PostgREST default row cap"

requirements-completed: [OCD-02, OCD-05, OCD-06]

# Metrics
duration: 1min
completed: 2026-02-21
---

# Phase 17 Plan 06: Gap Closure -- UAT Column and Row Limit Fixes Summary

**Fix three UAT failures: remove non-existent DB columns from organization/bill queries, add explicit row limits to prevent PostgREST truncation on OCD ID reverse-lookups**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-21T23:39:28Z
- **Completed:** 2026-02-21T23:40:34Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Removed `parent_organization_id` from organization endpoint selects (column does not exist in DB)
- Removed `document_url` from bill detail endpoint select and serializer (column does not exist in DB)
- Added `.limit(100000)` to vote and bill detail full-table queries to prevent PostgREST default row limit from silently truncating recent entries

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove non-existent columns from organization and bill queries** - `08e7da24` (fix)
2. **Task 2: Add explicit row limits to OCD ID reverse-lookup queries** - `1302fa47` (fix)

## Files Created/Modified
- `apps/web/app/api/ocd/endpoints/organizations.ts` - Removed `parent_organization_id` from both list and detail selects
- `apps/web/app/api/ocd/endpoints/bills.ts` - Removed `document_url` from detail select, added `.limit(100000)` to full-table query
- `apps/web/app/api/ocd/endpoints/votes.ts` - Added `.limit(100000)` to full-table motions query
- `apps/web/app/api/ocd/serializers/bill.ts` - Replaced dead `document_url` reference with empty documents array

## Decisions Made
- Used 100000 as the explicit row limit (10x safety margin over current 10,536 motions and 1,727 matters)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 8 UAT tests should now pass after deployment
- Phase 17 OCD Interoperability is complete with all gap closures applied

## Self-Check: PASSED

All 4 modified files verified present. Both task commits (08e7da24, 1302fa47) verified in git log.

---
*Phase: 17-ocd-interoperability*
*Completed: 2026-02-21*
