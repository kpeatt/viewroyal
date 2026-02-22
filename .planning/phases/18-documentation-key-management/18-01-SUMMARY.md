---
phase: 18-documentation-key-management
plan: 01
subsystem: api
tags: [openapi, swagger-ui, chanfana, security-scheme, api-docs]

# Dependency graph
requires:
  - phase: 15-api-foundation
    provides: Hono API router with chanfana OpenAPI integration
  - phase: 16-core-data-search-api
    provides: All v1 endpoint classes (meetings, people, matters, motions, bylaws, search)
  - phase: 17-ocd-interoperability
    provides: OCD endpoints and router
provides:
  - OpenAPI 3.1 spec at /api/v1/openapi.json with security scheme, tags, error schemas, OCD docs
  - Interactive Swagger UI at /api/v1/docs with Authorize button for API key auth
  - All endpoints tagged for Swagger UI grouping (System, Meetings, People, Matters, Motions, Bylaws, Search, OCD)
  - ApiKeyAuth security scheme registered for header-based X-API-Key authentication
affects: [18-documentation-key-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - chanfana registry.registerComponent for security schemes and shared schemas
    - chanfana registry.registerPath for documenting endpoints outside the chanfana base path
    - Relative docs_url/openapi_url in chanfana config (chanfana prepends base path automatically)

key-files:
  created: []
  modified:
    - apps/web/app/api/index.ts
    - apps/web/app/api/endpoints/health.ts
    - apps/web/app/api/endpoints/test-auth.ts
    - apps/web/app/api/endpoints/meetings/list.ts
    - apps/web/app/api/endpoints/meetings/detail.ts
    - apps/web/app/api/endpoints/people/list.ts
    - apps/web/app/api/endpoints/people/detail.ts
    - apps/web/app/api/endpoints/matters/list.ts
    - apps/web/app/api/endpoints/matters/detail.ts
    - apps/web/app/api/endpoints/motions/list.ts
    - apps/web/app/api/endpoints/motions/detail.ts
    - apps/web/app/api/endpoints/bylaws/list.ts
    - apps/web/app/api/endpoints/bylaws/detail.ts
    - apps/web/app/api/endpoints/search.ts

key-decisions:
  - "chanfana docs_url/openapi_url must be relative to base (chanfana prepends base automatically) -- using /docs and /openapi.json instead of /api/v1/docs"
  - "OCD endpoints registered via registerPath() even though outside chanfana base /api/v1 -- registerPath adds to spec JSON regardless of base path"

patterns-established:
  - "Schema annotation pattern: tags and security as first two fields in every OpenAPIRoute schema object"
  - "Shared error schema registered as reusable component via registerComponent('schemas', 'ApiError', ...)"

requirements-completed: [DOCS-01, DOCS-02]

# Metrics
duration: 4min
completed: 2026-02-22
---

# Phase 18 Plan 01: OpenAPI Spec Enrichment and Swagger UI Fix Summary

**Fixed chanfana URL path doubling, registered API key security scheme, defined 8 endpoint tags, and annotated all 13 endpoints for fully-functional Swagger UI at /api/v1/docs**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-22T00:34:59Z
- **Completed:** 2026-02-22T00:39:42Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Fixed critical chanfana URL path doubling bug (docs_url/openapi_url were absolute, causing /api/v1/api/v1/docs)
- Registered ApiKeyAuth security scheme so Swagger UI shows Authorize button for X-API-Key header auth
- Defined 8 tags (System, Meetings, People, Matters, Motions, Bylaws, Search, OCD) for endpoint grouping in Swagger UI
- Registered shared ApiError response schema as reusable OpenAPI component
- Added tags and security annotations to all 13 endpoint classes
- Documented all 12 OCD endpoints in the OpenAPI spec via registerPath

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix chanfana config and register security scheme, tags, error schema, and OCD paths** - `2e725242` (feat)
2. **Task 2: Add security and tag annotations to all endpoint schemas** - `e985554e` (feat)

## Files Created/Modified
- `apps/web/app/api/index.ts` - Fixed chanfana config, registered security scheme, tags, error schema, OCD paths
- `apps/web/app/api/endpoints/health.ts` - Added tags: ["System"]
- `apps/web/app/api/endpoints/test-auth.ts` - Added tags: ["System"], security
- `apps/web/app/api/endpoints/meetings/list.ts` - Added tags: ["Meetings"], security
- `apps/web/app/api/endpoints/meetings/detail.ts` - Added tags: ["Meetings"], security
- `apps/web/app/api/endpoints/people/list.ts` - Added tags: ["People"], security
- `apps/web/app/api/endpoints/people/detail.ts` - Added tags: ["People"], security
- `apps/web/app/api/endpoints/matters/list.ts` - Added tags: ["Matters"], security
- `apps/web/app/api/endpoints/matters/detail.ts` - Added tags: ["Matters"], security
- `apps/web/app/api/endpoints/motions/list.ts` - Added tags: ["Motions"], security
- `apps/web/app/api/endpoints/motions/detail.ts` - Added tags: ["Motions"], security
- `apps/web/app/api/endpoints/bylaws/list.ts` - Added tags: ["Bylaws"], security
- `apps/web/app/api/endpoints/bylaws/detail.ts` - Added tags: ["Bylaws"], security
- `apps/web/app/api/endpoints/search.ts` - Added tags: ["Search"], security

## Decisions Made
- chanfana docs_url/openapi_url must use paths relative to base (chanfana prepends base automatically). Using "/docs" and "/openapi.json" produces the correct /api/v1/docs and /api/v1/openapi.json.
- OCD endpoints registered via registerPath() even though outside chanfana base /api/v1. registerPath adds entries to the spec JSON regardless of base path.
- Enriched API description with authentication instructions and OCD reference for developer onboarding.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in `settings.api-keys.tsx` (missing generated types file) caused `pnpm typecheck` to fail. Verified these errors exist on the base commit (not introduced by this plan). Build (`pnpm build`) succeeds cleanly, confirming all changes compile correctly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- OpenAPI spec and Swagger UI are fully configured and ready for deployment
- Plan 18-02 (API key management UI) can proceed independently
- Swagger UI "Try it out" will work for authenticated endpoints after entering API key via Authorize button

## Self-Check: PASSED

All 14 modified files verified present. Both task commits (2e725242, e985554e) verified in git log.

---
*Phase: 18-documentation-key-management*
*Completed: 2026-02-22*
