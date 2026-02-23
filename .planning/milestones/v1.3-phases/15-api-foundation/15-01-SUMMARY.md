---
phase: 15-api-foundation
plan: 01
subsystem: api
tags: [hono, chanfana, openapi, cors, cloudflare-workers, zod]

# Dependency graph
requires:
  - phase: 14-scheduled-automation
    provides: "Existing Worker with React Router and scheduled handler"
provides:
  - "Hono API app mounted at /api/v1/ alongside React Router in same Worker"
  - "ApiError class with consistent error JSON shape"
  - "Municipality resolution middleware from Supabase"
  - "Request ID middleware (X-Request-Id header)"
  - "CORS middleware for cross-origin API access"
  - "Health check endpoint at /api/v1/health and /api/v1/:municipality/health"
  - "chanfana OpenAPI 3.1 docs at /api/v1/docs"
  - "Rate limit binding configured in wrangler.toml"
affects: [15-api-foundation, 16-api-endpoints, 17-api-endpoints, 18-api-endpoints]

# Tech tracking
tech-stack:
  added: [hono 4.12.0, chanfana 3.0.0, zod 4.3.6]
  patterns: [URL-prefix routing split in Worker fetch handler, per-route middleware for municipality scoping, consistent API error shape]

key-files:
  created:
    - apps/web/app/api/index.ts
    - apps/web/app/api/types.ts
    - apps/web/app/api/lib/api-errors.ts
    - apps/web/app/api/middleware/error-handler.ts
    - apps/web/app/api/middleware/request-id.ts
    - apps/web/app/api/middleware/municipality.ts
    - apps/web/app/api/endpoints/health.ts
  modified:
    - apps/web/workers/app.ts
    - apps/web/wrangler.toml
    - apps/web/package.json

key-decisions:
  - "Used per-route municipality middleware pattern instead of wildcard catch-all to preserve NOT_FOUND for unregistered paths"
  - "wrangler.toml [[ratelimits]] uses name field (not binding) per wrangler v4 schema validation"

patterns-established:
  - "API error shape: all errors return { error: { code, message, status } } with SCREAMING_SNAKE_CASE codes"
  - "Municipality middleware: apply per-route on /api/v1/:municipality/* paths, not as global wildcard"
  - "Worker routing: pathname.startsWith('/api/v1/') delegates to Hono, else React Router"
  - "Endpoint pattern: extend chanfana OpenAPIRoute class with schema and handle(c) method"

requirements-completed: [INFRA-05, INFRA-06, INFRA-07]

# Metrics
duration: 6min
completed: 2026-02-20
---

# Phase 15 Plan 01: API Foundation Summary

**Hono + chanfana API framework at /api/v1/ with health endpoint, CORS, municipality resolution, and consistent error handling alongside React Router**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-20T23:42:27Z
- **Completed:** 2026-02-20T23:48:57Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Hono API app mounted at /api/v1/ in same Worker as React Router (URL-prefix split)
- Health endpoint responding at /api/v1/health and /api/v1/view-royal/health with municipality lookup
- Consistent error JSON shape on all API errors (MUNICIPALITY_NOT_FOUND, NOT_FOUND, VALIDATION_ERROR, INTERNAL_ERROR)
- CORS headers and X-Request-Id on all API responses
- chanfana OpenAPI 3.1 docs auto-generated at /api/v1/docs
- Rate limit binding configured in wrangler.toml for Plan 02

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and configure wrangler bindings** - `4851409b` (chore)
2. **Task 2: Create Hono API app with error handling, CORS, municipality middleware, health endpoint, and mount in Worker** - `e00304a1` (feat)

## Files Created/Modified
- `apps/web/app/api/index.ts` - Main Hono app with chanfana OpenAPI, CORS, error handling, health routes
- `apps/web/app/api/types.ts` - ApiEnv interface with Bindings and Variables types
- `apps/web/app/api/lib/api-errors.ts` - ApiError class with toJSON() for consistent error shape
- `apps/web/app/api/middleware/error-handler.ts` - Global onError handler catching ApiError, validation, and unexpected errors
- `apps/web/app/api/middleware/request-id.ts` - UUID generation and X-Request-Id header middleware
- `apps/web/app/api/middleware/municipality.ts` - Municipality slug lookup via Supabase admin client
- `apps/web/app/api/endpoints/health.ts` - chanfana OpenAPIRoute health check endpoint
- `apps/web/workers/app.ts` - Worker fetch handler split: /api/v1/* to Hono, rest to React Router
- `apps/web/wrangler.toml` - Added [[ratelimits]] binding configuration
- `apps/web/package.json` - Added hono, chanfana, zod dependencies

## Decisions Made
- **Per-route municipality middleware**: Applied municipality middleware specifically on `/api/v1/:municipality/health` rather than a wildcard `/api/v1/:municipality/*` catch-all. This ensures unregistered paths correctly return NOT_FOUND instead of MUNICIPALITY_NOT_FOUND. Future municipality-scoped routes will add the middleware per-route or via a route group.
- **wrangler.toml rate limit key**: Used `[[ratelimits]]` with `name` field (not `binding`) per wrangler v4.64 schema validation requirements, discovered during typecheck.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed wrangler.toml rate limit binding syntax**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** Plan specified `[[rate_limiting]]` with `binding` field but wrangler v4 validates against `[[ratelimits]]` with `name` field
- **Fix:** Changed key to `[[ratelimits]]` and field from `binding` to `name`
- **Files modified:** apps/web/wrangler.toml
- **Verification:** `pnpm typecheck` passes without wrangler config warnings
- **Committed in:** e00304a1 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed Hono c.json() type error for error handler status/headers**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** `c.json(data, { status, headers })` with plain Record headers didn't match Hono's overloaded signatures
- **Fix:** Used `c.header()` for custom headers and passed status as second arg directly: `c.json(data, status)`
- **Files modified:** apps/web/app/api/middleware/error-handler.ts
- **Verification:** `pnpm typecheck` passes cleanly
- **Committed in:** e00304a1 (Task 2 commit)

**3. [Rule 1 - Bug] Fixed municipality middleware wildcard routing**
- **Found during:** Task 2 (functional verification)
- **Issue:** `app.use("/api/v1/:municipality/*", municipality)` caught all /api/v1/ paths, making `/api/v1/nothing/here` return MUNICIPALITY_NOT_FOUND instead of NOT_FOUND
- **Fix:** Changed to per-route middleware: `app.use("/api/v1/:municipality/health", municipality)`
- **Files modified:** apps/web/app/api/index.ts
- **Verification:** `/api/v1/nothing/here` now returns NOT_FOUND, `/api/v1/nonexistent/health` returns MUNICIPALITY_NOT_FOUND
- **Committed in:** e00304a1 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- API skeleton is live and ready for Plan 02 (auth + rate limiting)
- Rate limit binding already configured in wrangler.toml
- ApiEnv type includes apiKeyId and userId variables for auth middleware
- Error handling infrastructure ready for auth-specific errors (UNAUTHORIZED, RATE_LIMITED, etc.)

---
*Phase: 15-api-foundation*
*Completed: 2026-02-20*
