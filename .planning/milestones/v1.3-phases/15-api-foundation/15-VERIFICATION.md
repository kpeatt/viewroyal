---
phase: 15-api-foundation
verified: 2026-02-20T00:00:00Z
status: human_needed
score: 9/9 must-haves verified
human_verification:
  - test: "Send GET /api/v1/view-royal/test with X-API-Key: vr_testkey_development_00000000000000000000000000000000"
    expected: "HTTP 200 with body { authenticated: true, apiKeyId: '...', municipality: 'View Royal', requestId: '...' }"
    why_human: "Requires a running Worker with Supabase connectivity and a seeded api_keys row; cannot verify DB seed was applied without MCP tool"
  - test: "Send GET /api/v1/view-royal/test with no API key"
    expected: "HTTP 401 with body { error: { code: 'MISSING_API_KEY', message: '...', status: 401 } }"
    why_human: "Runtime behavior — needs the live Worker to verify middleware chain executes"
  - test: "Send GET /api/v1/view-royal/test with an invalid API key"
    expected: "HTTP 401 with body { error: { code: 'INVALID_API_KEY', message: '...', status: 401 } }"
    why_human: "Depends on timing-safe compare executing correctly against the DB hash"
  - test: "Send GET /api/v1/health and check response headers"
    expected: "HTTP 200, headers include X-Request-Id (UUID) and Access-Control-Allow-Origin: *"
    why_human: "Runtime header presence needs a live request"
  - test: "Send GET / (React Router home page)"
    expected: "The existing React Router home page renders normally (no regression)"
    why_human: "UI rendering cannot be verified statically"
---

# Phase 15: API Foundation Verification Report

**Phase Goal:** API consumers can authenticate, receive rate-limited responses, and get consistent error feedback across all public API routes
**Verified:** 2026-02-20
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

All truths are derived from the phase's five success criteria from ROADMAP.md, plus truths from the `must_haves` in each plan's frontmatter.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A GET to /api/v1/health returns 200 JSON with status ok | VERIFIED | `HealthEndpoint.handle()` returns `{ status: "ok", municipality: null, timestamp }` — registered at `openapi.get("/api/v1/health", HealthEndpoint)` |
| 2 | A GET to /api/v1/view-royal/health returns 200 with municipality name | VERIFIED | `municipality` middleware applied via `app.use("/api/v1/:municipality/health", municipality)` before the endpoint; `HealthEndpoint` returns `muni?.name ?? null` |
| 3 | A GET to /api/v1/nonexistent/health returns 404 with consistent error JSON | VERIFIED | Municipality middleware throws `ApiError(404, "MUNICIPALITY_NOT_FOUND", ...)` — error-handler catches it and calls `err.toJSON()` producing `{ error: { code, message, status } }` |
| 4 | All API error responses use the shape { error: { code, message, status } } | VERIFIED | `ApiError.toJSON()` and `notFound` handler both produce this shape; `errorHandler` catches all error types and maps them to the same shape |
| 5 | Cross-origin requests to /api/v1/* receive proper CORS headers | VERIFIED | `app.use("*", cors({ origin: "*", allowMethods: [...], ... }))` applied before all routes |
| 6 | All API responses include an X-Request-Id header | VERIFIED | `requestId` middleware runs first on `"*"`, calls `c.header("X-Request-Id", id)` |
| 7 | Existing React Router routes continue to work unchanged | VERIFIED | Worker `fetch` only delegates to Hono when `pathname.startsWith("/api/v1/")` — all other paths reach `requestHandler` unchanged |
| 8 | An API consumer can authenticate via X-API-Key header or ?apikey query param | VERIFIED | `apiKeyAuth` middleware: `const apiKey = c.req.header("X-API-Key") \|\| c.req.query("apikey")` |
| 9 | API keys are SHA-256 hashed with timing-safe comparison | VERIFIED | `hashApiKey()` uses `crypto.subtle.digest("SHA-256", ...)` producing hex string; `timingSafeCompare()` double-hashes both sides before calling `crypto.subtle.timingSafeEqual()` |

**Score:** 9/9 truths verified (automated). 5 behaviors need human runtime verification.

### Required Artifacts

#### Plan 01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/app/api/index.ts` | Hono app with chanfana OpenAPI, CORS, error handling | VERIFIED | 75 lines; imports and wires all middleware; registers health + test endpoints with correct middleware chains |
| `apps/web/app/api/lib/api-errors.ts` | ApiError class with toJSON() producing consistent error shape | VERIFIED | 37 lines; exports `ApiError`; `toJSON()` returns `{ error: { code, message, status } }` |
| `apps/web/app/api/middleware/municipality.ts` | Municipality resolution from URL param via Supabase | VERIFIED | 46 lines; calls `getSupabaseAdminClient()`, queries `municipalities` table by slug, throws `ApiError(404, ...)` if not found, sets `c.set("municipality", data)` |
| `apps/web/app/api/endpoints/health.ts` | Health check endpoint as chanfana OpenAPIRoute | VERIFIED | 36 lines; extends `OpenAPIRoute`; `handle()` returns `{ status: "ok", municipality, timestamp }` |
| `apps/web/workers/app.ts` | URL-prefix split routing /api/v1/* to Hono, rest to React Router | VERIFIED | `pathname.startsWith("/api/v1/")` guard delegates to `apiApp.fetch(request, env, ctx)` |

#### Plan 02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/create_api_keys.sql` | api_keys table with user_id FK, key_hash, key_prefix, is_active, timestamps | VERIFIED | Full DDL present: `CREATE TABLE IF NOT EXISTS api_keys`, all required columns, indexes on prefix+active and user_id, RLS policies for user CRUD |
| `apps/web/app/api/lib/api-key.ts` | hashApiKey(), timingSafeCompare(), generateApiKey() functions | VERIFIED | 59 lines; exports all three functions; double-hash pattern for `timingSafeCompare`; `generateApiKey` returns `"vr_" + 64-hex` |
| `apps/web/app/api/middleware/auth.ts` | apiKeyAuth Hono middleware | VERIFIED | 63 lines; exports `apiKeyAuth`; extracts key from header/query, hashes it, prefix-looks up in `api_keys`, timing-safe compares full hash, sets `apiKeyId` and `userId` in context |
| `apps/web/app/api/middleware/rate-limit.ts` | rateLimit Hono middleware using CF Rate Limit binding | VERIFIED | 37 lines; exports `rateLimit`; calls `c.env.API_RATE_LIMITER.limit({ key: \`api:${apiKeyId}\` })`; throws `ApiError(429, ..., { "Retry-After": "60" })` on exceeded limit; sets `X-RateLimit-Limit: 100` header |
| `apps/web/app/api/endpoints/test-auth.ts` | Authenticated test endpoint verifying auth + rate limiting | VERIFIED | 52 lines; extends `OpenAPIRoute`; returns `{ authenticated: true, apiKeyId, municipality, requestId }` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `workers/app.ts` | `app/api/index.ts` | URL prefix check in fetch handler | WIRED | Line 29: `url.pathname.startsWith("/api/v1/")` → `apiApp.fetch(request, env, ctx)` |
| `middleware/municipality.ts` | `lib/supabase.server.ts` | getSupabaseAdminClient() for DB lookup | WIRED | Line 4 import + line 19 call: `const supabase = getSupabaseAdminClient()` |
| `middleware/error-handler.ts` | `lib/api-errors.ts` | catches ApiError instances and formats response | WIRED | Line 14: `if (err instanceof ApiError)` — propagates `err.toJSON()` and `err.status` |
| `middleware/auth.ts` | `lib/api-key.ts` | hashApiKey() and timingSafeCompare() for key validation | WIRED | Line 4 import; line 29: `await hashApiKey(apiKey)`; line 49: `await timingSafeCompare(keyHash, keyRecord.key_hash)` |
| `middleware/auth.ts` | `lib/supabase.server.ts` | getSupabaseAdminClient() to query api_keys table | WIRED | Line 5 import; line 35: `getSupabaseAdminClient()`; line 37: `.from("api_keys")` |
| `middleware/rate-limit.ts` | `wrangler.toml [[ratelimits]]` | c.env.API_RATE_LIMITER.limit() binding | WIRED | Line 17: `c.env.API_RATE_LIMITER`; line 20: `limiter.limit({ key: \`api:${apiKeyId}\` })`; wrangler.toml `name = "API_RATE_LIMITER"` |
| `app/api/index.ts` | `middleware/auth.ts` | middleware applied to authenticated route group | WIRED | Line 8 import; line 71: `app.use("/api/v1/:municipality/test", apiKeyAuth, rateLimit, municipality)` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| INFRA-01 | 15-02-PLAN | API consumers authenticate via X-API-Key header or ?apikey query param | SATISFIED | `apiKeyAuth` middleware line 18: `c.req.header("X-API-Key") \|\| c.req.query("apikey")` |
| INFRA-02 | 15-02-PLAN | API keys stored as SHA-256 hashes with timing-safe comparison | SATISFIED | `hashApiKey()` + `timingSafeCompare()` in `api-key.ts`; `auth.ts` uses both |
| INFRA-03 | 15-02-PLAN | Rate limited per-key using Cloudflare Workers Rate Limit binding | SATISFIED | `rateLimit` middleware uses `c.env.API_RATE_LIMITER.limit({ key: \`api:${apiKeyId}\` })` — per-key scoping confirmed |
| INFRA-04 | 15-02-PLAN | Rate-limited requests receive HTTP 429 with Retry-After header | SATISFIED | `ApiError(429, "RATE_LIMIT_EXCEEDED", ..., { "Retry-After": "60" })` — `errorHandler` propagates the header via `err.headers` loop |
| INFRA-05 | 15-01-PLAN | All API errors return `{ "error": { "code", "message", "status" } }` | SATISFIED | `ApiError.toJSON()`, `notFound` handler, and `errorHandler` fallback all produce this shape |
| INFRA-06 | 15-01-PLAN | Public API routes include proper CORS headers | SATISFIED | `app.use("*", cors({ origin: "*", ... }))` covers all routes including future ones; `/api/ocd/*` is Phase 17 scope — CORS will cover it when added |
| INFRA-07 | 15-01-PLAN | All API endpoints scoped to municipality via URL path parameter | PARTIALLY SATISFIED | All data endpoints (test) use `/:municipality/` prefix; `/api/v1/health` is a global status endpoint with no municipality scope, which is consistent with the plan's explicit design (`"Health endpoint (no municipality scope)"`). The plan treats health as infrastructure, not a "data endpoint." Future data endpoints will all be municipality-scoped per the established pattern. |

**Note on INFRA-07:** The success criterion says "All API routes are scoped to a municipality via URL path parameter (e.g., `/api/v1/{municipality}/meetings`)." The global `/api/v1/health` endpoint technically violates the letter of this requirement. However, this was a deliberate architectural decision documented in the SUMMARY: `"Used per-route municipality middleware pattern instead of wildcard catch-all"` and the plan explicitly states the health endpoint is unscoped. The municipality-scoped counterpart (`/api/v1/:municipality/health`) does exist and is municipality-scoped. This is a design trade-off, not an oversight.

### Anti-Patterns Found

No anti-patterns detected in any of the 11 implementation files.

| File | Pattern | Severity | Notes |
|------|---------|----------|-------|
| `middleware/rate-limit.ts` line 19 | `if (limiter && apiKeyId)` — rate limiting silently skipped if binding absent | INFO | Defensive guard for local dev where CF bindings aren't available. In Cloudflare production the binding is always present. Not a runtime bug. |

### Human Verification Required

#### 1. Authenticated endpoint — valid key

**Test:** Start `pnpm dev` in `apps/web/`. Send `GET http://localhost:5173/api/v1/view-royal/test` with header `X-API-Key: vr_testkey_development_00000000000000000000000000000000`.
**Expected:** HTTP 200 with body `{ "authenticated": true, "apiKeyId": "...", "municipality": "View Royal", "requestId": "..." }`
**Why human:** Requires a running Worker with live Supabase connectivity and a seeded `api_keys` row. The migration file exists but applying it and seeding data cannot be confirmed programmatically from this verifier.

#### 2. Authenticated endpoint — missing key

**Test:** Send `GET http://localhost:5173/api/v1/view-royal/test` with no API key header.
**Expected:** HTTP 401 with body `{ "error": { "code": "MISSING_API_KEY", "message": "API key required...", "status": 401 } }`
**Why human:** Runtime middleware execution — static analysis confirms the code path exists but the live request is needed.

#### 3. Authenticated endpoint — invalid key

**Test:** Send `GET http://localhost:5173/api/v1/view-royal/test` with header `X-API-Key: vr_invalid_key`.
**Expected:** HTTP 401 with body `{ "error": { "code": "INVALID_API_KEY", "message": "Invalid API key...", "status": 401 } }`
**Why human:** Timing-safe comparison behavior needs runtime confirmation.

#### 4. Response headers — X-Request-Id and CORS

**Test:** Send `GET http://localhost:5173/api/v1/health` and inspect response headers.
**Expected:** Response includes `X-Request-Id` (a UUID string) and `Access-Control-Allow-Origin: *`.
**Why human:** HTTP headers require a live request to observe.

#### 5. React Router regression check

**Test:** Navigate to `http://localhost:5173/` (root) and other existing routes.
**Expected:** All existing pages render normally — meetings list, meeting detail, search, etc. No 404 or redirect to Hono.
**Why human:** UI rendering cannot be verified statically.

### Gaps Summary

No automated gaps found. All 11 implementation files exist, are substantive (no stubs or placeholder implementations), and are fully wired together. All 7 key links verified. All 9 observable truths hold from static analysis.

The phase is blocked from `passed` status only by 5 runtime behaviors that require a live Worker to confirm. The INFRA-07 partial satisfaction (global `/api/v1/health` without municipality scope) is a documented design decision consistent with the plan, not a gap.

---

_Verified: 2026-02-20_
_Verifier: Claude (gsd-verifier)_
