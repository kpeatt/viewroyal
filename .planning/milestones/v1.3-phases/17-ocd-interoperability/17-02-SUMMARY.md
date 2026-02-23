---
phase: 17-ocd-interoperability
plan: 02
subsystem: api
tags: [ocd, jurisdiction, organization, person, serializer, hono-router, open-civic-data]

# Dependency graph
requires:
  - phase: 17-ocd-interoperability
    plan: 01
    provides: UUID v5 OCD ID generation, page-based pagination, OCD response envelope, ocd_divisions table
  - phase: 15-api-foundation
    provides: Hono router, ApiEnv types, municipality middleware, ApiError
  - phase: 16-core-data-search-api
    provides: Serializer allowlist pattern, people-via-memberships join pattern
provides:
  - OCD Jurisdiction list/detail endpoints at /api/ocd/:municipality/jurisdictions
  - OCD Organization list/detail endpoints at /api/ocd/:municipality/organizations
  - OCD Person list/detail endpoints at /api/ocd/:municipality/people
  - OCD sub-router mounted at /api/ocd with discovery endpoint
  - Serializers for Jurisdiction, Organization (summary/detail), Person (summary/detail)
  - Classification mapper (Council->legislature, Committee->committee, Board->commission)
affects: [17-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [ocd-serializer-allowlist, ocd-endpoint-plain-hono, ocd-router-subroute, ocd-id-reverse-lookup]

key-files:
  created:
    - apps/web/app/api/ocd/serializers/jurisdiction.ts
    - apps/web/app/api/ocd/serializers/organization.ts
    - apps/web/app/api/ocd/serializers/person.ts
    - apps/web/app/api/ocd/endpoints/jurisdictions.ts
    - apps/web/app/api/ocd/endpoints/organizations.ts
    - apps/web/app/api/ocd/endpoints/people.ts
    - apps/web/app/api/ocd/router.ts
  modified:
    - apps/web/app/api/index.ts

key-decisions:
  - "Plain Hono handlers (not chanfana OpenAPIRoute) for OCD endpoints -- OCD has its own spec, no OpenAPI generation needed"
  - "OCD ID reverse-lookup for detail endpoints: fetch all entities, compute all OCD IDs, find match -- acceptable for small datasets"
  - "People list deduplication in application layer since PostgREST DISTINCT with joins is unreliable"
  - "Wildcard :id params (:id{.+}) in router to handle OCD IDs containing slashes"

patterns-established:
  - "OCD serializer pattern: summary (list) and detail (with nested data) variants, all spec fields present"
  - "OCD endpoint pattern: plain async Hono handler, municipality from context, no auth middleware"
  - "OCD ID reverse-lookup: fetch all for municipality, compute OCD IDs via batch helper, find matching entity"
  - "OCD router subroute: separate Hono app mounted via app.route('/api/ocd', ocdApp)"

requirements-completed: [OCD-01, OCD-02, OCD-03]

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 17 Plan 02: OCD Entity Endpoints Summary

**OCD-compliant Jurisdiction, Organization, and Person endpoints with serializers, sub-router, and public discovery endpoint at /api/ocd/**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T21:16:35Z
- **Completed:** 2026-02-21T21:19:46Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Three OCD entity types (Jurisdiction, Organization, Person) with full list + detail endpoints
- OCD sub-router mounted at `/api/ocd/` with municipality middleware only (no auth, no rate limiting)
- Discovery endpoint at `GET /api/ocd/:municipality/` listing all six entity URLs (including placeholders for Plan 03)
- All OCD spec fields present in every response (null when empty), following allowlist serializer pattern
- Page-based OpenStates-style pagination on all list endpoints
- Classification mapper translating DB values (Council, Committee, Board) to OCD values (legislature, committee, commission)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Jurisdiction, Organization, and Person serializers** - `61e750ee` (feat)
2. **Task 2: Create endpoints and OCD router** - `5265d4c1` (feat)

## Files Created/Modified
- `apps/web/app/api/ocd/serializers/jurisdiction.ts` - Municipality to OCD Jurisdiction mapping with division extraction
- `apps/web/app/api/ocd/serializers/organization.ts` - Organization summary/detail with posts from memberships, classification mapper
- `apps/web/app/api/ocd/serializers/person.ts` - Person summary/detail with memberships and contact details
- `apps/web/app/api/ocd/endpoints/jurisdictions.ts` - List (1-item) and detail handlers querying municipalities + ocd_divisions
- `apps/web/app/api/ocd/endpoints/organizations.ts` - Paginated list and detail with membership posts, OCD ID reverse-lookup
- `apps/web/app/api/ocd/endpoints/people.ts` - Paginated list with dedup and detail with municipality-scoped memberships
- `apps/web/app/api/ocd/router.ts` - OCD sub-router with discovery endpoint and all route registrations
- `apps/web/app/api/index.ts` - Mounts OCD router at `/api/ocd`

## Decisions Made
- Used plain Hono handlers instead of chanfana OpenAPIRoute classes since OCD endpoints follow the OCD spec, not OpenAPI generation
- OCD ID reverse-lookup pattern for detail endpoints: fetch all entities for municipality, batch-compute OCD IDs, find match -- acceptable performance for small datasets (10 orgs, 837 people)
- People list fetches all IDs first for accurate count, then deduplicates in application layer since PostgREST doesn't support DISTINCT well with inner joins
- Router uses wildcard `:id{.+}` params to handle OCD IDs containing slashes (e.g., `ocd-jurisdiction/country:ca/csd:5917047/government`)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three simpler OCD entity types complete (Jurisdiction, Organization, Person)
- Router infrastructure ready for Plan 03 to add Event, Bill, and Vote routes
- Serializer pattern and endpoint pattern established for Plan 03 to follow
- Discovery endpoint already lists Event, Bill, and Vote URLs (will 404 until Plan 03 implements them)

## Self-Check: PASSED

All 8 files verified on disk. Both task commits (61e750ee, 5265d4c1) verified in git log.

---
*Phase: 17-ocd-interoperability*
*Completed: 2026-02-21*
