# Phase 15: API Foundation - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

API key authentication, rate limiting, consistent error handling, CORS, and municipality-scoped routing infrastructure. This phase delivers the middleware and plumbing that all subsequent API phases (16-18) build on. No data endpoints are exposed — just a test/health endpoint to verify the auth + rate limit flow works end-to-end.

</domain>

<decisions>
## Implementation Decisions

### API key bootstrapping
- Keys are tied to a Supabase auth user (user_id FK on api_keys table)
- Schema migration creates the api_keys table; a seed SQL statement creates initial test key(s)
- Keys are shown once at creation only — store SHA-256 hash, never the raw key
- Key prefix is stored separately for identification (e.g., first 8 chars) so keys can be listed without exposing the full value

### Error & response conventions
- Errors are detailed and helpful — include what's wrong and how to fix it (e.g., `"date_from" must be ISO 8601 format (YYYY-MM-DD)`)
- All errors return consistent JSON shape: `{ "error": { "code", "message", "status" } }`
- API versioning is URL path only (`/api/v1/`) — no version headers

### Claude's Discretion
- Request IDs: whether to include on all responses or errors only, and the header name convention
- Rate limit headers: whether to include `X-RateLimit-*` headers on every response or only on 429s — may depend on what Cloudflare's rate limiting binding makes practical
- Rate limit thresholds: actual requests-per-minute/hour numbers
- CORS policy specifics (allowed origins, methods, headers)

</decisions>

<specifics>
## Specific Ideas

- Requirements specify both `X-API-Key` header and `?apikey` query parameter as authentication methods (INFRA-01)
- Rate limiting must use Cloudflare Workers Rate Limit binding to persist across isolate evictions (INFRA-03)
- Municipality scoping via URL path parameter: `/api/v1/{municipality}/...` (INFRA-07)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-api-foundation*
*Context gathered: 2026-02-20*
