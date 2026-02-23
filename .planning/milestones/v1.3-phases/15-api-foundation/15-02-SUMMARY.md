---
phase: 15-api-foundation
plan: 02
subsystem: api
tags: [api-key, sha256, timing-safe, rate-limiting, cloudflare-workers, hono, middleware]

# Dependency graph
requires:
  - phase: 15-api-foundation
    plan: 01
    provides: "Hono API app with health endpoint, CORS, error handling, municipality middleware"
provides:
  - "api_keys table with user_id FK, key_hash, key_prefix, RLS policies"
  - "SHA-256 key hashing with timing-safe comparison utilities"
  - "API key auth middleware (X-API-Key header or ?apikey query param)"
  - "Per-key rate limiting via Cloudflare Workers Rate Limit binding"
  - "Authenticated test endpoint at /api/v1/:municipality/test"
  - "Development test key seeded for local testing"
affects: [16-api-endpoints, 17-api-endpoints, 18-api-endpoints]

# Tech tracking
tech-stack:
  added: []
  patterns: [SHA-256 key hashing with prefix lookup, timing-safe comparison via double-hash, per-route auth middleware chaining, Cloudflare Workers Rate Limit binding per-key scoping]

key-files:
  created:
    - apps/web/app/api/lib/api-key.ts
    - apps/web/app/api/middleware/auth.ts
    - apps/web/app/api/middleware/rate-limit.ts
    - apps/web/app/api/endpoints/test-auth.ts
    - supabase/migrations/create_api_keys.sql
  modified:
    - apps/web/app/api/index.ts

key-decisions:
  - "Used per-route middleware chaining (apiKeyAuth, rateLimit, municipality) for authenticated routes rather than wildcard app.use pattern"
  - "Typed timingSafeEqual via inline SubtleCrypto extension since Cloudflare Workers types don't merge with DOM SubtleCrypto in tsconfig"

patterns-established:
  - "Auth middleware pattern: extract key from header/query, hash with SHA-256, prefix-lookup in api_keys table, timing-safe full hash compare"
  - "Authenticated route registration: app.use(path, apiKeyAuth, rateLimit, municipality) then openapi.get(path, Endpoint)"
  - "Rate limit scoping: per API key ID (api:{keyId}) not per IP, for fair per-consumer usage"

requirements-completed: [INFRA-01, INFRA-02, INFRA-03, INFRA-04]

# Metrics
duration: 5min
completed: 2026-02-20
---

# Phase 15 Plan 02: API Auth & Rate Limiting Summary

**SHA-256 API key auth with timing-safe comparison and durable per-key rate limiting via Cloudflare Workers Rate Limit binding**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-20T23:51:57Z
- **Completed:** 2026-02-20T23:56:48Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- api_keys table created with proper schema (id, user_id FK, key_hash, key_prefix, name, is_active, timestamps) and RLS policies
- API key authentication middleware supporting both X-API-Key header and ?apikey query parameter
- Timing-safe key comparison using double SHA-256 hashing to guarantee equal-length buffers
- Per-key rate limiting using Cloudflare Workers Rate Limit binding (100 req/60s)
- Test endpoint at /api/v1/:municipality/test verifying full auth + rate limit stack
- Development test key seeded for local testing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create api_keys table and seed a test key** - `0c960952` (feat)
2. **Task 2: Create auth and rate-limit middleware, wire into Hono app with test endpoint** - `0ce90787` (feat)

## Files Created/Modified
- `apps/web/app/api/lib/api-key.ts` - hashApiKey(), timingSafeCompare(), generateApiKey() utilities
- `apps/web/app/api/middleware/auth.ts` - API key auth middleware (header/query extraction, prefix lookup, timing-safe compare)
- `apps/web/app/api/middleware/rate-limit.ts` - Per-key rate limiting via CF Workers Rate Limit binding
- `apps/web/app/api/endpoints/test-auth.ts` - Authenticated test endpoint returning auth context
- `apps/web/app/api/index.ts` - Wired auth + rate-limit middleware and test endpoint into Hono app
- `supabase/migrations/create_api_keys.sql` - api_keys table DDL with indexes and RLS policies

## Decisions Made
- **Per-route middleware chaining**: Applied `apiKeyAuth, rateLimit, municipality` as explicit middleware chain on `/api/v1/:municipality/test` route rather than a wildcard. This preserves the Plan 01 pattern where health endpoint stays unauthenticated and unregistered paths return NOT_FOUND.
- **timingSafeEqual type workaround**: Cloudflare Workers' `crypto.subtle.timingSafeEqual()` is not in the DOM `SubtleCrypto` type. Used an inline type extension (`const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual(...): boolean }`) rather than modifying tsconfig, keeping the fix localized.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed timingSafeEqual TypeScript type error**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** `crypto.subtle.timingSafeEqual` does not exist on the DOM `SubtleCrypto` type. The `@cloudflare/workers-types` package defines it on a separate interface that doesn't merge with the DOM global.
- **Fix:** Created a typed alias `const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean }` in the api-key utility file.
- **Files modified:** apps/web/app/api/lib/api-key.ts
- **Verification:** `pnpm typecheck` passes cleanly
- **Committed in:** 0ce90787 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Type-level fix only, no behavioral changes. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required.

## Testing Notes
- **Development test key:** `vr_testkey_development_00000000000000000000000000000000`
- Use this key in the X-API-Key header or ?apikey query param for local testing
- The key is seeded in the database with prefix `vr_testk` and name "Development Test Key"

## Next Phase Readiness
- API foundation is fully complete (auth, rate limiting, CORS, errors, municipality scoping)
- All subsequent phases (16-18) can focus on data endpoints
- Pattern for adding new authenticated endpoints: `app.use(path, apiKeyAuth, rateLimit, municipality)` then `openapi.get(path, EndpointClass)`

## Self-Check: PASSED

All 7 files verified present. Both task commits (0c960952, 0ce90787) verified in git log.

---
*Phase: 15-api-foundation*
*Completed: 2026-02-20*
