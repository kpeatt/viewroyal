---
phase: 16-core-data-search-api
plan: 03
subsystem: api
tags: [matters, motions, bylaws, serializers, chanfana, pagination, cursor, supabase, hono]

# Dependency graph
requires:
  - phase: 16-core-data-search-api
    plan: 01
    provides: "Cursor pagination, response envelope, slug columns on all entity tables"
provides:
  - "Matter list + detail API endpoints with status/category/date filters and agenda-item timeline"
  - "Motion list + detail API endpoints with result/meeting/mover filters and roll call votes"
  - "Bylaw list + detail API endpoints with status/category/year filters and linked matters"
  - "Serializer modules for matters, motions, and bylaws (allowlist pattern)"
affects: [16-04, api-consumers, web-app-future-refactor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Municipality scoping for motions via inner join on meetings (motions lack municipality_id)"
    - "Person lookup by slug for mover filter (separate query before main filter)"
    - "Parallel fetches for detail related data (Promise.all for agenda items + motions)"

key-files:
  created:
    - apps/web/app/api/serializers/matter.ts
    - apps/web/app/api/serializers/motion.ts
    - apps/web/app/api/serializers/bylaw.ts
    - apps/web/app/api/endpoints/matters/list.ts
    - apps/web/app/api/endpoints/matters/detail.ts
    - apps/web/app/api/endpoints/motions/list.ts
    - apps/web/app/api/endpoints/motions/detail.ts
    - apps/web/app/api/endpoints/bylaws/list.ts
    - apps/web/app/api/endpoints/bylaws/detail.ts
  modified:
    - apps/web/app/api/index.ts

key-decisions:
  - "Motions scoped to municipality via inner join on meetings table (no municipality_id on motions)"
  - "Mover filter resolves person slug to ID before applying filter (avoids complex join filter)"
  - "Matter detail fetches motions via agenda_item_ids (motions linked to matters through agenda items)"

patterns-established:
  - "Entity serializer modules in api/serializers/ with summary + detail + helper exports"
  - "Municipality-less tables scoped via inner join on parent table with municipality_id"
  - "Detail endpoints fetch related data in parallel with Promise.all"

requirements-completed: [DATA-05, DATA-06, DATA-07, DATA-08, DATA-09, DATA-10]

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 16 Plan 03: Matters, Motions & Bylaws Endpoints Summary

**REST endpoints for matters (status/category/date filters + agenda-item timeline), motions (result/meeting/mover filters + roll call votes), and bylaws (year/status filters + linked matters) with 3 serializer modules and 6 chanfana endpoint classes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T19:05:52Z
- **Completed:** 2026-02-21T19:08:31Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- 3 serializer modules (matter.ts, motion.ts, bylaw.ts) using strict allowlist pattern -- no internal fields leak to API
- 6 chanfana OpenAPIRoute endpoint classes with query parameter validation and cursor pagination
- Motion endpoints scope to municipality via inner join on meetings (motions table lacks municipality_id)
- Motion detail includes full roll call votes array with person slugs and names
- Matter detail includes agenda-item timeline sorted by meeting date and associated motions
- Bylaw detail includes linked matters via the matters.bylaw_id FK

## Task Commits

Each task was committed atomically:

1. **Task 1: Create matter, motion, and bylaw serializers plus list/detail endpoints** - `04f2c7fb` (feat)
2. **Task 2: Register matter, motion, and bylaw routes in Hono app** - `2661a146` (feat)

## Files Created/Modified
- `apps/web/app/api/serializers/matter.ts` - serializeMatterSummary, serializeMatterDetail, serializeMatterTimelineItem
- `apps/web/app/api/serializers/motion.ts` - serializeMotionSummary, serializeMotionDetail, serializeVoteSummary
- `apps/web/app/api/serializers/bylaw.ts` - serializeBylawSummary, serializeBylawDetail
- `apps/web/app/api/endpoints/matters/list.ts` - ListMatters endpoint with cursor pagination on last_seen DESC
- `apps/web/app/api/endpoints/matters/detail.ts` - GetMatter endpoint with agenda-item timeline and motions
- `apps/web/app/api/endpoints/motions/list.ts` - ListMotions endpoint with municipality scoping via meetings join
- `apps/web/app/api/endpoints/motions/detail.ts` - GetMotion endpoint with roll call votes
- `apps/web/app/api/endpoints/bylaws/list.ts` - ListBylaws endpoint with status/category/year filters
- `apps/web/app/api/endpoints/bylaws/detail.ts` - GetBylaw endpoint with linked matters via bylaw_id FK
- `apps/web/app/api/index.ts` - 6 new route registrations with auth + rate-limit + municipality middleware

## Decisions Made
- Motions scoped to municipality via inner join on meetings (motions table has no municipality_id column)
- Mover filter resolves person slug to ID via separate query before applying to the main motions query
- Matter detail fetches motions through agenda_item_ids (motions connect to matters via agenda_items, not a direct FK)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 10 core data endpoints are now registered (meetings, people, matters, motions, bylaws -- each with list + detail)
- Ready for Plan 04 (Search endpoint) which completes the Phase 16 API coverage
- Serializer pattern is consistent across all entity types for future maintenance

## Self-Check: PASSED

All 10 files verified present. Both task commits verified in git log.

---
*Phase: 16-core-data-search-api*
*Completed: 2026-02-21*
