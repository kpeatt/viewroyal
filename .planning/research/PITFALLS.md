# Domain Pitfalls: v1.3 Platform APIs

**Domain:** Public API with auth, rate limiting, OpenAPI docs, and OCD-standard endpoints added to existing Cloudflare Workers web app
**Researched:** 2026-02-19

---

## Critical Pitfalls

Mistakes that cause rewrites, security vulnerabilities, or major architectural issues.

---

### Pitfall 1: In-Memory Rate Limiting Resets on Isolate Eviction

**What goes wrong:** The existing `api.ask.tsx` and `api.search.tsx` both use `new Map<string, number[]>()` at module scope for rate limiting. On Cloudflare Workers, isolates are evicted unpredictably (runtime updates several times per week, memory pressure at 128MB, low traffic periods). When an isolate evicts, the entire Map is lost and rate limits reset to zero. Across multiple edge locations, each location maintains its own isolate with its own Map -- a user hitting Sydney and London gets separate rate limit counters.

**Why it happens:** Workers are stateless by design. Global variables persist across requests within the same isolate instance, but Cloudflare provides zero guarantees about isolate lifetime. The current code works "well enough" for the internal web UI where abuse is low-stakes, but a public API with issued keys is a different threat model.

**Consequences:**
- API abusers can bypass rate limits by waiting for isolate eviction or hitting different edge locations
- Legitimate API consumers see inconsistent rate limit behavior (sometimes 100 requests work, sometimes 50, depending on isolate state)
- No visibility into actual rate limit state -- no dashboard, no metrics, no alerts

**Prevention:**
- Use the Cloudflare Workers Rate Limiting binding (`[[ratelimits]]` in wrangler.toml) which is now GA as of September 2025. It uses a backing store per Cloudflare location with locally cached counters -- near-zero latency and survives isolate eviction
- Key on API key (not IP address) for authenticated endpoints. IP-based keys are unreliable on mobile/corporate networks where many users share an IP
- Accept that the rate limiter is "permissive and eventually consistent" by design -- it is not an accurate accounting system. Don't use it for billing or hard quotas. Over-provision slightly (e.g., set limit to 110 if you advertise 100/min)
- The binding only supports period values of 10 or 60 seconds. Plan rate limit tiers around these constraints

**Detection:**
- Rate limit counters appear to reset randomly (isolate eviction)
- Different rate limit behavior from different geographic locations
- Abuse spikes that should have been caught by rate limiting

**Sources:**
- [Cloudflare Workers Rate Limiting Binding docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Rate Limiting in Workers is now GA](https://developers.cloudflare.com/changelog/2025-09-19-ratelimit-workers-ga/)

---

### Pitfall 2: API Key Comparison Vulnerable to Timing Attacks

**What goes wrong:** Comparing API keys with `===` allows timing side-channel attacks. JavaScript's strict equality operator short-circuits at the first mismatched character, so an attacker can statistically determine the key one character at a time by measuring response latency differences.

**Why it happens:** Developers use `===` instinctively. On a local server the timing difference (~nanoseconds) is noise. But on Cloudflare Workers where the code runs close to the user with minimal network jitter, the timing signal is amplified. Additionally, naive implementations return early on key-length mismatch, leaking the secret's length.

**Consequences:**
- API keys can be brute-forced character by character
- Key length is leaked if the comparison returns early on length mismatch
- A compromised API key gives full access to all API endpoints under that key's permissions

**Prevention:**
- Use `crypto.subtle.timingSafeEqual()` for all API key comparisons. This is a non-standard Web Crypto extension that Cloudflare Workers supports natively
- Do NOT return early on length mismatch -- compare against the key itself instead and negate the result. Both buffers passed to `timingSafeEqual` must be the same length (throws otherwise)
- Hash API keys with SHA-256 before storage. Compare hashes, not raw keys. This way a database leak doesn't expose keys, and the hash comparison via `timingSafeEqual` is always the same length
- Use a key prefix (first 8 chars, unhashed) for fast database lookup, then compare the full hash

**Detection:**
- Security audit flags `===` comparison on secrets
- Timing analysis of API responses shows character-by-character correlation

**Sources:**
- [Cloudflare Workers timingSafeEqual docs](https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/)
- [Cloudflare Workers Best Practices - Secure comparison](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)

---

### Pitfall 3: Routing Collision Between Existing Internal API and New Public API

**What goes wrong:** The existing app has 10 routes under `api/*` (api/ask, api/search, api/subscribe, etc.) that serve the web UI. Adding a public API at `api/v1/*` creates ambiguity: which routes are internal (require Supabase auth cookies) and which are public (require API keys)? Authentication middleware applied to `api/*` glob patterns can break existing internal routes or accidentally expose internal endpoints without API key auth.

**Why it happens:** React Router 7's route config in `routes.ts` treats all routes as peers. There is no built-in middleware concept -- auth checks happen inside each route handler. Adding a new auth layer (API keys) alongside the existing auth (Supabase session cookies) requires careful route segregation.

**Consequences:**
- Internal API routes accidentally require API keys (breaks the web UI)
- Public API routes accidentally accept session cookies instead of API keys (wrong auth model)
- CORS headers applied to public API leak onto internal routes or vice versa
- Route naming conflicts when `api/search` (internal) and `api/v1/search` (public) have different behaviors

**Prevention:**
- Use a completely separate route prefix: `api/v1/*` for public API, leave existing `api/*` untouched. Never share a prefix
- Use React Router 7's `prefix()` helper in `routes.ts` to group all public API routes cleanly
- Create a shared API key auth middleware function that is called explicitly at the top of every `api/v1/*` handler -- do not try to create a catch-all middleware pattern
- Set CORS headers (`Access-Control-Allow-Origin: *`) only on `api/v1/*` routes. Internal `api/*` routes should remain same-origin only
- Handle OPTIONS preflight requests explicitly in every public API route (or in a shared utility). Cloudflare Workers do not automatically handle CORS preflight

**Detection:**
- Web UI breaks after deploying public API (internal routes now require API key)
- Public API rejects requests despite valid API key (wrong auth path)
- Browser console shows CORS errors on the web app

---

### Pitfall 4: API Key Generation with Math.random()

**What goes wrong:** Using `Math.random()` to generate API keys produces predictable, low-entropy tokens. `Math.random()` is not cryptographically secure -- its output can be predicted if an attacker observes enough values.

**Why it happens:** `Math.random()` is the instinctive choice in JavaScript. Node.js has `crypto.randomBytes()` but that is not available in Cloudflare Workers (no Node.js APIs). The correct Workers API is `crypto.getRandomValues()` or `crypto.randomUUID()`.

**Consequences:**
- API keys can be predicted by attackers who observe a few valid keys
- Key collisions are possible with low-entropy generation

**Prevention:**
- Use `crypto.randomUUID()` for unique identifiers
- Use `crypto.getRandomValues()` with a Uint8Array for high-entropy random bytes, then encode to hex or base64
- Recommended key format: prefix + random bytes, e.g., `vr_` + 32 random hex chars = `vr_a1b2c3d4...` (prefix enables quick identification and lookup)
- Store only the SHA-256 hash of the key in the database. Show the full key to the user exactly once at creation time

**Detection:**
- Security audit flags `Math.random()` usage in key generation
- Key format lacks sufficient entropy (short, predictable patterns)

**Sources:**
- [Cloudflare Workers Best Practices - Random values](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)

---

### Pitfall 5: OCD ID Format Inconsistencies and Stale Spec

**What goes wrong:** The Open Civic Data specification underwent a "large refactor as of mid-2014" and some documentation is outdated. The jurisdiction ID format "isn't fully formalized yet" per the official docs. Implementing OCD endpoints against stale docs produces IDs that don't interoperate with other civic data systems.

**Why it happens:** The OCD project is community-maintained with no formal governance body. The canonical OCD division ID repository on GitHub has the authoritative list but Canadian municipal-level IDs may not exist. Creating new division IDs for View Royal requires community consensus via the mailing list to prevent collisions.

**Consequences:**
- OCD IDs generated for View Royal entities don't match what other civic tech tools expect
- IDs use wrong character encoding (OCD requires lowercase UTF-8, hyphen, underscore only)
- Jurisdiction IDs follow a format that changes between OCD spec versions
- Person/Organization UUIDs generated with wrong UUID version (OCD spec says uuid1, not uuid4)

**Prevention:**
- Check the [ocd-division-ids repository](https://github.com/opencivicdata/ocd-division-ids) for existing Canadian municipal divisions before creating new ones. View Royal's division ID should be: `ocd-division/country:ca/csd:5917034` (Census Subdivision code)
- Use UUID v1 for person and organization OCD IDs (per spec), not UUID v4. This is a niche but important compatibility detail
- The existing `ocd_id` column on the `municipalities` table is a good start. Extend to `people`, `organizations`, and `meetings` tables
- Store OCD IDs as-is (strings), never parse or modify them programmatically after generation
- The OCD API itself is no longer maintained -- focus on the data format standard, not the reference API implementation
- Map OCD entity types to existing tables: Division -> Municipality, Jurisdiction -> Municipality (with legislative context), Person -> people, Organization -> organizations, Event -> meetings, Bill -> matters/bylaws, Vote -> motions

**Detection:**
- Civic tech tools reject or fail to match OCD IDs from the API
- IDs contain uppercase characters, spaces, or invalid separators
- UUID version mismatch (v4 instead of v1)

**Sources:**
- [OCD Identifiers specification](https://open-civic-data.readthedocs.io/en/latest/ocdids.html)
- [OCD Division IDs repository](https://github.com/opencivicdata/ocd-division-ids)
- [OCD Adoption Guide (warning about refactor)](https://open-civic-data.readthedocs.io/en/latest/data/introduction.html)

---

## Moderate Pitfalls

---

### Pitfall 6: OpenAPI Spec Drift from Implementation

**What goes wrong:** The OpenAPI spec says one thing, the actual API does another. Fields marked required are actually optional. Nullable fields aren't marked nullable. Response schemas omit fields that actually appear in responses. The spec becomes a lie that misleads API consumers.

**Why it happens:** Two approaches to OpenAPI: code-first (generate spec from code) and spec-first (write spec, then implement). Both drift. Code-first generators miss edge cases. Spec-first implementations diverge during development. Without automated validation, drift is invisible until consumers report bugs.

**Consequences:**
- Auto-generated client SDKs crash on unexpected null values
- Consumers build against the spec and discover runtime surprises
- API consumers lose trust in the documentation
- Inconsistent error response shapes across endpoints (some return `{error: string}`, others `{message: string, code: number}`)

**Prevention:**
- Define a standard error response schema in OpenAPI `components` and reference it everywhere via `$ref`. Never inline error schemas per-endpoint
- Mark nullable fields explicitly. OpenAPI 3.1 uses `type: ['string', 'null']` -- do not use the deprecated `nullable: true` from 3.0
- Include realistic `example` values for every field -- this catches schema mistakes during doc review
- Add format specifiers: `format: date-time` for ISO dates, `format: uuid` for UUIDs, `format: uri` for URLs
- Use `components/schemas` for all reusable types (Meeting, Person, Motion, etc.). Inline schemas are a maintenance nightmare
- Write integration tests that validate API responses against the OpenAPI schema. Libraries like `openapi-response-validator` can automate this

**Detection:**
- API consumer reports that a field documented as required is sometimes missing
- Auto-generated SDK throws type errors on valid API responses
- Different endpoints return different error shapes

**Sources:**
- [Why your OpenAPI spec sucks (liblab)](https://liblab.com/blog/why-your-open-api-spec-sucks)

---

### Pitfall 7: Cursor-Based Pagination Done Wrong

**What goes wrong:** Cursor pagination looks simple but has subtle implementation bugs. Common mistakes: using offset-based pagination disguised as cursors (just base64-encoding the offset), using mutable sort fields (created_at without tie-breaking on id), or exposing internal database IDs in the cursor value.

**Why it happens:** Cursor pagination is harder to implement than offset pagination. The cursor must encode a stable sort position that works with database indexes. Most tutorials show the happy path without addressing edge cases.

**Consequences:**
- Duplicate results when records are inserted during pagination (cursor skips or repeats)
- Missing results when records are deleted during pagination
- Cursors break after database migrations that change column types or names
- Consumers construct cursors manually and send invalid values that crash the API
- Off-by-one errors at page boundaries

**Prevention:**
- Use opaque cursors: base64-encode a JSON payload containing the sort field value(s) and the row ID. Never expose raw database IDs
- Sort on a stable, unique composite key: `(created_at, id)` not just `created_at` alone. Two meetings on the same date need tie-breaking
- Validate cursors on decode -- return 400 with a clear error for invalid/expired cursors, never crash
- Always return `next_cursor` (null if no more results) and `has_more` boolean in every paginated response
- Set a maximum page size (e.g., 100) and a default (e.g., 20). Reject requests for more than the maximum
- Use `WHERE (created_at, id) < ($cursor_date, $cursor_id) ORDER BY created_at DESC, id DESC LIMIT $limit` -- composite comparison operators work efficiently with composite indexes in PostgreSQL

**Detection:**
- Consumers report duplicate or missing items when paginating through large result sets
- Changing page size produces different total items
- Cursors from one endpoint accidentally work on another endpoint (shared encoding)

---

### Pitfall 8: CORS Misconfiguration on Public API

**What goes wrong:** Public APIs need CORS headers (`Access-Control-Allow-Origin: *`) for browser-based consumers. But applying CORS too broadly exposes internal endpoints. Applying it too narrowly breaks legitimate cross-origin API calls. Forgetting OPTIONS preflight handling causes all cross-origin requests to fail.

**Why it happens:** Cloudflare Workers do not automatically handle CORS. Unlike Express.js where `cors()` middleware handles everything, in Workers you must manually respond to OPTIONS preflight requests and set headers on actual responses. React Router 7's loader/action pattern doesn't have a natural middleware hook for this.

**Consequences:**
- Browser-based API consumers get "No 'Access-Control-Allow-Origin' header present" errors
- OPTIONS preflight requests hit your route handlers and return unexpected responses (or 405 errors)
- Internal web app routes accidentally get `Access-Control-Allow-Origin: *`, weakening CSRF protection
- Preflight responses are not cached, causing double the request volume

**Prevention:**
- Create a `corsHeaders()` utility that returns the standard CORS headers. Apply it only to `api/v1/*` responses
- Handle OPTIONS method explicitly in every public API route (or better, in a shared handler)
- Set `Access-Control-Max-Age: 86400` on preflight responses to cache them for 24 hours
- For the public API, `Access-Control-Allow-Origin: *` is correct since API key auth is the access control, not CORS
- Never apply CORS headers to internal `api/*` routes -- the web app uses same-origin requests

**Detection:**
- Browser console CORS errors when calling the public API from a different domain
- OPTIONS requests return 404 or 405 instead of 204 with CORS headers
- Network tab shows preflight requests before every API call (missing `Access-Control-Max-Age`)

---

### Pitfall 9: Exposing Internal Fields in Public API Responses

**What goes wrong:** Internal database fields leak into public API responses: internal numeric IDs, Supabase UUIDs, internal metadata JSON blobs, soft-delete flags, or admin-only fields. Once exposed in a public API response, removing them is a breaking change.

**Why it happens:** The path of least resistance is to pass Supabase query results directly to `Response.json()`. The existing service layer (`app/services/*.ts`) returns full database rows. Reusing these services for the public API without a mapping layer exposes everything.

**Consequences:**
- Internal auto-increment IDs expose database enumeration (attacker knows there are exactly N meetings)
- Internal metadata fields become part of the API contract -- removing them later is a breaking change
- Inconsistent field naming between internal camelCase TypeScript and public snake_case API
- Large response payloads with fields consumers don't need

**Prevention:**
- Create explicit response serializer functions for every public API entity. Never pass raw database rows to the response
- Use OCD IDs as the public identifier, not internal numeric IDs. If OCD IDs aren't ready, use stable slugs or UUIDs
- Define the public API schema in OpenAPI first, then build serializers that produce exactly that shape
- Exclude: `created_at`/`updated_at` (use `last_modified` if needed), `meta` JSON blobs, internal flags, embedding vectors
- Include: fields explicitly listed in the OpenAPI spec and nothing else

**Detection:**
- API responses contain fields not documented in the OpenAPI spec
- Response payloads are unexpectedly large
- Consumers start depending on undocumented internal fields

---

### Pitfall 10: No API Versioning Strategy Leads to Breaking Changes

**What goes wrong:** The API launches at v1 but there is no plan for what constitutes a breaking change, how deprecation works, or when v2 would be warranted. A "quick fix" renames a field, removes an endpoint, or changes a response shape -- breaking all existing consumers.

**Why it happens:** Versioning feels like over-engineering for a v1. But without a clear policy, every API change is a potential breaking change. The temptation to "just fix it" without versioning is strong when there are few consumers.

**Consequences:**
- Consumer integrations break silently when fields are renamed or removed
- No deprecation period -- changes are immediate and destructive
- Multiple inconsistent versioning approaches creep in (some in URL, some in headers)

**Prevention:**
- Use URL path versioning (`/api/v1/`) -- it is explicit, visible, easy to test, and widely understood. Header versioning adds complexity for no benefit at this scale
- Define what is a breaking change: removing fields, renaming fields, changing types, removing endpoints, changing auth requirements. Adding new fields or new endpoints is NOT breaking
- Commit to keeping v1 stable for at least 6 months after any v2 launch
- Document the versioning policy in the API docs. Even a simple statement like "we use semantic versioning on the URL path and will not make breaking changes within a version" is valuable
- Do not version individual endpoints differently -- the entire API moves together

**Detection:**
- Consumer reports "this field used to be called X, now it's Y"
- No deprecation warnings before changes
- Mix of v1 and unversioned endpoints

---

## Minor Pitfalls

---

### Pitfall 11: Rate Limit Headers Missing from Responses

**What goes wrong:** The API returns 429 when rate limited but doesn't tell the consumer how many requests remain, when the limit resets, or what the limit is. Consumers have no way to implement backoff or budgeting.

**Prevention:**
- Return standard rate limit headers on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (Unix timestamp)
- Return `Retry-After` header (in seconds) on 429 responses
- The Cloudflare Rate Limiting binding returns a `success` boolean but not remaining counts. You will need to track remaining counts yourself or accept that `X-RateLimit-Remaining` is approximate
- Document rate limits in the OpenAPI spec and in a dedicated section of the API docs

---

### Pitfall 12: Non-Streaming RAG Response for Public API

**What goes wrong:** The existing `/api/ask` endpoint returns Server-Sent Events (streaming). Public API consumers expect a standard JSON response. If the public API Search/Ask endpoint also streams, consumers need SSE client libraries, which many platforms don't support well.

**Prevention:**
- The public API Ask endpoint should return a complete JSON response with `answer`, `sources`, and `confidence` fields -- no streaming
- This means the Worker must buffer the full Gemini response before sending it back, which increases latency but simplifies the consumer experience
- Set a reasonable timeout (30 seconds) and return a partial answer if Gemini takes too long
- Consider offering both: synchronous JSON (default) and streaming SSE (opt-in via `Accept: text/event-stream` header)

---

### Pitfall 13: Supabase RLS Bypass with Admin Client

**What goes wrong:** The existing service layer uses both `createSupabaseServerClient(request)` (respects RLS) and `getSupabaseAdminClient()` (bypasses RLS). Public API endpoints using the admin client bypass all row-level security policies, potentially exposing data that should be restricted.

**Prevention:**
- Public API endpoints should use a dedicated Supabase client with the anon/publishable key, not the admin service role key
- If RLS policies don't cover all access patterns needed by the public API, add new policies rather than bypassing RLS
- Audit every Supabase query in the public API path to ensure it goes through RLS

---

### Pitfall 14: Forgetting to Validate API Key Scope Per Endpoint

**What goes wrong:** All API keys have the same permissions. A key issued for "read meetings" can also call the RAG Ask endpoint (which costs Gemini API tokens). No way to issue limited keys.

**Prevention:**
- Design the `api_keys` table with a `scopes` column from day one (e.g., `['read', 'search', 'ask']`)
- Check scopes in every endpoint handler, not just key validity
- The Ask/RAG endpoint should require an explicit `ask` scope since it has real per-call costs (Gemini tokens)
- Default new keys to read-only scope. Require explicit upgrade for AI-powered endpoints

---

### Pitfall 15: OpenAPI Spec Served from Same Worker Increases Bundle Size

**What goes wrong:** Embedding a large OpenAPI YAML/JSON spec in the Worker source increases the deployed bundle size. The Workers bundle limit is 10MB (paid plan) or 1MB (free plan). A comprehensive OpenAPI spec with examples can be 50-200KB, and if combined with other static assets, can contribute to hitting limits.

**Prevention:**
- Serve the OpenAPI spec from R2 or a static asset, not inline in the Worker code
- Or generate the spec at build time and include it as a static import -- this is fine for reasonable spec sizes
- Use Cloudflare Workers Static Assets for hosting the spec and Swagger UI / Scalar docs page
- Monitor bundle size with `wrangler deploy --dry-run`

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| API Key Auth | Timing attack on key comparison (P2), Math.random() keys (P4) | Use `crypto.subtle.timingSafeEqual()`, `crypto.getRandomValues()` |
| Rate Limiting | In-memory Map resets on eviction (P1) | Use Cloudflare Rate Limiting binding, not in-memory Map |
| Route Setup | Collision with existing `api/*` routes (P3) | Use `api/v1/*` prefix, never overlap with internal routes |
| CORS | Missing OPTIONS handling, headers on wrong routes (P8) | Explicit OPTIONS handler, CORS only on `api/v1/*` |
| Data Endpoints | Internal fields leaked (P9), no pagination (P7) | Response serializers, opaque cursors, composite sort keys |
| OpenAPI Docs | Spec drift from implementation (P6) | Spec-first design, automated response validation in tests |
| OCD Endpoints | Wrong ID format (P5), stale spec (P5) | Check canonical division ID repo, use UUID v1 for people/orgs |
| RAG API | Streaming response unusable by REST clients (P12) | Synchronous JSON response for public API |
| Versioning | No breaking change policy (P10) | URL path versioning, define breaking change criteria upfront |
| Security | Admin client bypass (P13), no scope checks (P14) | RLS-respecting client, scopes column from day one |

---

## Sources

- [Cloudflare Workers Rate Limiting Binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Cloudflare Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Cloudflare Workers Timing-Safe Comparison](https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/)
- [Cloudflare Workers Secrets Management](https://developers.cloudflare.com/workers/configuration/secrets/)
- [OCD Identifiers Specification](https://open-civic-data.readthedocs.io/en/latest/ocdids.html)
- [OCD Data Formats](https://open-civic-data.readthedocs.io/en/latest/data/index.html)
- [OCD Division IDs Repository](https://github.com/opencivicdata/ocd-division-ids)
- [OpenAPI Spec Common Pitfalls (liblab)](https://liblab.com/blog/why-your-open-api-spec-sucks)
- [API Versioning Strategies (Speakeasy)](https://www.speakeasy.com/api-design/versioning)
- [Cloudflare Workers CORS Example](https://developers.cloudflare.com/workers/examples/cors-header-proxy/)
- [React Router 7 Resource Routes](https://reactrouter.com/how-to/resource-routes)
- [Supabase API Key Management Guide (MakerKit)](https://makerkit.dev/blog/tutorials/supabase-api-key-management)

*Last updated: 2026-02-19*
