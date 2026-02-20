# Project Research Summary

**Project:** ViewRoyal.ai v1.3 Platform APIs
**Domain:** Public REST API + OCD-standard civic data API on Cloudflare Workers
**Researched:** 2026-02-19
**Confidence:** HIGH (stack/architecture/pitfalls), MEDIUM (OCD spec compliance)

## Executive Summary

ViewRoyal.ai v1.3 adds a public-facing REST API and OCD-compliant civic data endpoints to an existing Cloudflare Workers web app. The core challenge is not the data layer — it already exists and is well-structured — but building the API infrastructure correctly: durable rate limiting, timing-safe API key authentication, clean route segregation from existing internal routes, and an OCD serialization layer that maps existing database entities to a dormant-but-stable civic data standard. The recommended approach uses Hono as a dedicated API router mounted alongside React Router 7 in the same Worker, with chanfana for schema-first OpenAPI 3.1 generation. All new dependencies are Cloudflare-native (Hono, chanfana, Workers Rate Limit binding), minimizing external surface area.

The biggest architectural decision — same Worker or separate Worker — resolves clearly to same Worker. The existing service layer, Supabase client setup, and env var inlining are all valuable shared infrastructure. A separate Worker would duplicate this for no benefit at current scale. The URL-prefix split (Hono handles `/api/v1/*`, React Router handles everything else) is clean and battle-tested. OCD compliance is achievable using deterministic ID generation from existing primary keys; no database schema changes are needed for OCD IDs themselves, though a `scopes` column on `api_keys` should be added from day one to enable endpoint-level permission control.

The primary risks are security-related and must be addressed in Phase 1: timing attacks on API key comparison (use `crypto.subtle.timingSafeEqual()`), weak key generation (use `crypto.getRandomValues()`), routing collisions between the new public API and existing internal routes (strict `api/v1/*` prefix, never shared), and the existing in-memory rate limiter being eviction-unsafe (replace with Cloudflare Workers Rate Limit binding). OCD spec compliance carries medium confidence due to the spec being community-maintained and dormant since ~2020; implement the well-documented entity types and document any deviations explicitly.

## Key Findings

### Recommended Stack

Three new production packages cover the entire API layer: `hono` (^4.12.0), `chanfana` (^3.0.0), and `zod` (^4.3.5). Hono is Cloudflare's recommended API framework — 12kB, zero dependencies, first-class Workers support. chanfana is Cloudflare's own OpenAPI 3.1 generator, used in production for Radar 2.0. Zod v4 is required by chanfana and provides schema validation for request params and response shapes. Rate limiting uses the native Workers Rate Limit binding (GA as of Sept 2025) — no Redis, no Upstash, no Durable Objects needed. API keys use SHA-256 hashing via the built-in Web Crypto API — bcrypt is explicitly wrong here because API keys are high-entropy random tokens, not passwords.

**Core technologies:**
- **hono ^4.12.0**: API router for `/api/v1/*` and `/api/ocd/*` — Cloudflare-native, cleaner than shoehorning REST middleware chains into React Router loaders/actions
- **chanfana ^3.0.0**: OpenAPI 3.1 schema generation + Swagger UI — Cloudflare-maintained, battle-tested at Radar 2.0 scale
- **zod ^4.3.5**: Request/response schema validation — required by chanfana, covers query param parsing and OCD entity shapes
- **Workers Rate Limit Binding**: Per-key durable rate limiting — GA, built-in, near-zero latency, survives isolate eviction
- **Web Crypto SHA-256**: API key hashing — built-in `crypto.subtle`, O(1) index lookup, correct pattern for high-entropy tokens
- **Manual keyset pagination**: Cursor-based pagination — ~30 lines of code, Supabase `.gt()`/`.lt()` handles it natively

### Expected Features

All feature research is benchmarked against OpenStates v3, Google Civic Info, and Councilmatic. The civic data API landscape at the municipal level is thin, especially in Canada — ViewRoyal.ai can be among the first well-documented, OCD-compliant Canadian municipal APIs.

**Must have (table stakes):**
- API key authentication via `Authorization: Bearer` header — every serious civic data API requires this
- Per-key rate limiting with standard `X-RateLimit-*` headers and 429 responses — expected by all API consumers
- Cursor-based pagination on all list endpoints — offset pagination degrades at depth; cursor is O(1)
- Core data endpoints for 5 entity types (meetings, people, matters, motions, bylaws) — 10 REST endpoints total
- Consistent JSON error responses using RFC 7807-inspired shape — inconsistency is the most common complaint against government APIs
- OpenAPI 3.1 spec at `/api/v1/openapi.json` with Swagger UI at `/api/v1/docs`
- Municipality scoping on all endpoints — multi-tenancy is already in the data layer

**Should have (competitive differentiators):**
- Search API endpoint exposing existing hybrid vector+keyword search — no other civic data API offers semantic search
- Ask API endpoint (non-streaming RAG) for programmatic Q&A — unique capability; lower rate limit needed due to Gemini costs
- OCD-standard endpoints at `/api/ocd/*` for civic tech ecosystem interoperability — Canadian municipal coverage is nearly nonexistent
- Self-service API key management page — eliminates email-for-access friction that plagues government APIs
- Response envelope with metadata, pagination cursors, and request ID for traceability

**Defer (v2+):**
- GraphQL API — REST maps naturally to the data model; OpenStates actually moved from GraphQL to REST
- Webhooks and event streaming — batch pipeline runs daily, no real-time value to push
- Write API — read-only platform, pipeline is the single source of truth
- OAuth2/OIDC — inappropriate for read-only public data; API keys are the correct auth mechanism
- Client SDKs — the OpenAPI spec enables auto-generation; build only on demonstrated consumer demand

### Architecture Approach

The public API lives in the same Cloudflare Worker as the React Router 7 app, with a fetch-level URL-prefix split. The Worker entry point (`workers/app.ts`) routes `/api/v1/*` and `/api/ocd/*` to a Hono instance; everything else passes to React Router's `createRequestHandler`. No adapter library needed — this is a clean fetch-level conditional, zero coupling between Hono and React Router. Existing internal API routes (`/api/ask`, `/api/search`, etc.) remain untouched on their current paths. A shared `app/lib/api.server.ts` module provides authentication, rate limiting, CORS, and error formatting utilities called explicitly at the top of every public API handler — a wrapper function pattern that matches existing codebase conventions and avoids requiring a React Router 7.13+ upgrade for middleware support. The OCD layer is a pure serialization transformation over existing service functions — no new database queries, just entity mapping.

**Major components:**
1. **`workers/app.ts` (modified)**: URL-prefix router — Hono for `/api/v1/*` + `/api/ocd/*`, React Router for everything else. Adds `RateLimit` to Env interface.
2. **`app/lib/api.server.ts` (new)**: `authenticateApiRequest()` wrapper — SHA-256 key hash lookup, CF Rate Limit binding check, CORS headers, RFC 7807 error formatting
3. **`app/lib/pagination.ts` (new)**: Cursor encoding/decoding, pagination param parsing, `PaginatedResponse<T>` generic type
4. **`app/routes/api.v1.*.ts` (new, ~12 files)**: Public REST endpoints calling existing service layer
5. **`app/lib/ocd/` (new)**: `serializers.ts`, `types.ts`, `ids.ts` — OCD entity transformation from existing data models
6. **`app/routes/api.ocd.*.ts` (new, ~12 files)**: OCD endpoints using existing queries + OCD serializers
7. **`app/lib/openapi-spec.ts` (new)**: Static OpenAPI 3.1 object (hand-crafted; ~15 endpoints is manageable without code-gen)
8. **`api_keys` table (new)**: `key_hash` (SHA-256, indexed), `key_prefix` (display), `scopes[]`, `rate_limit_tier`, `is_active`, `expires_at`

### Critical Pitfalls

1. **In-memory rate limiting resets on isolate eviction** — The existing `Map`-based rate limiter in `api.ask.tsx` and `api.search.tsx` resets on every isolate eviction and is not shared across Cloudflare edge locations. Use the Workers Rate Limit binding exclusively for the public API. The in-memory Map is acceptable for internal use only.

2. **Timing attacks on API key comparison** — Never compare API keys with `===`. Use `crypto.subtle.timingSafeEqual()` on SHA-256 hashes (always equal-length buffers). This is Cloudflare's own documented security pattern. SHA-256 hashing also means a database breach does not expose raw keys.

3. **Routing collision with existing internal `api/*` routes** — The 8 existing React Router API routes use session-cookie auth. The new public API uses API-key auth. Mixing these prefix spaces causes the web UI to break or public endpoints to accept wrong auth. Use `api/v1/*` exclusively for the public API; leave `/api/*` untouched. Apply CORS headers only to `api/v1/*` routes.

4. **OCD ID format inconsistencies** — The OCD spec is dormant and some ID format details are ambiguous. View Royal's canonical division ID is `ocd-division/country:ca/csd:5917034`. Use UUID v1 (not v4) for person/org OCD IDs per spec. Verify against the `opencivicdata/ocd-division-ids` GitHub repository before generating any IDs.

5. **Internal fields leaking into public API responses** — The existing service layer returns full database rows. Build explicit response serializer functions for every entity type. Never pass raw Supabase results to `Response.json()`. Fields exposed in v1 become part of the API contract — removing them later is a breaking change.

## Implications for Roadmap

Research across all four files converges on a clear 4-phase build order driven by dependency chains. Auth gates everything. Core data gates the OCD layer (which is a pure transformation). Documentation is written after the endpoints it documents.

### Phase 1: API Foundation

**Rationale:** All other phases depend on this. The security pitfalls (timing attacks, weak key generation, routing collisions, eviction-unsafe rate limiting) must be resolved before any endpoint is exposed. Building the auth/rate limit/error infrastructure first means every subsequent phase inherits correct security primitives automatically.

**Delivers:** `api_keys` table migration, Hono router wired into `workers/app.ts`, `api.server.ts` with `authenticateApiRequest()`, `pagination.ts` cursor utilities, API key generation tooling, CORS handling, `[[ratelimits]]` binding in `wrangler.toml`

**Addresses features:** TS-1 (API key auth), TS-2 (rate limiting), TS-5 (error responses), TS-7 (municipality scoping)

**Avoids:** P1 (in-memory rate limit eviction), P2 (timing attacks), P3 (route collision), P4 (Math.random key generation)

### Phase 2: Core Data API

**Rationale:** The data already exists and the service layer already queries it. This phase exposes existing data through a clean REST interface. Starting with meetings validates the full auth-to-response-with-pagination flow before implementing the remaining 4 entity types. Explicit serializers are written here, establishing the pattern that Phase 4's OCD layer will reuse.

**Delivers:** 10 REST endpoints (meetings, people, matters, motions, bylaws — list + detail for each), keyset cursor pagination on all list endpoints, explicit response serializer functions, `data`/`pagination`/`meta` response envelope

**Addresses features:** TS-3 (cursor pagination), TS-4 (core data endpoints), D-5 (response envelope)

**Avoids:** P7 (cursor pagination edge cases — composite sort key, opaque cursors), P9 (internal field leakage via serializers)

**Uses:** Existing `app/services/*.ts` service functions unchanged

### Phase 3: Intelligence Endpoints

**Rationale:** Search and Ask endpoints wrap existing infrastructure (`hybridSearchAll()`, `runQuestionAgent()`). The primary new work is converting the streaming SSE Ask response to a synchronous JSON response and applying per-endpoint scope enforcement. These are the differentiating capabilities of the platform; they depend on Phase 1 auth but not on Phase 2 data endpoints.

**Delivers:** `GET /api/v1/search` exposing hybrid search, `POST /api/v1/ask` returning synchronous JSON RAG response, `ask` scope requirement on RAG endpoint, stricter rate limit tier for AI-backed endpoints

**Addresses features:** D-1 (search API), D-2 (ask API)

**Avoids:** P12 (streaming SSE unusable by REST clients), P14 (no scope enforcement)

### Phase 4: OCD Layer + Documentation

**Rationale:** OCD endpoints are a serialization layer over the same queries used in Phase 2 — no new database work. They are last because the serializers require the Phase 2 response shapes to be stable before building transformations on top of them. Documentation (OpenAPI spec) is written after endpoints exist because the spec documents implementation, not intention. API key management UI is included here as a polish deliverable.

**Delivers:** `app/lib/ocd/` serializers for all 6 entity types (jurisdiction, org, person, event, bill, vote), 12 OCD endpoints at `/api/ocd/*`, OpenAPI 3.1 spec, Swagger UI at `/api/v1/docs`, self-service API key management page

**Addresses features:** D-3 (OCD endpoints), TS-6 (OpenAPI docs), D-4 (key management UI)

**Avoids:** P5 (OCD ID format errors — verify canonical division ID first), P6 (OpenAPI spec drift — write spec from working endpoints, not ahead of them)

### Phase Ordering Rationale

- Auth and rate limiting precede every endpoint — this is a hard security dependency, not a preference
- Core data before OCD because OCD is a transformation of the same underlying queries; building OCD before Phase 2 response shapes are stable means rewriting serializers
- Intelligence endpoints can run in parallel with or after Phase 2 since they depend only on Phase 1 foundation; they are sequenced third for simplicity
- Documentation after all endpoints because an accurate OpenAPI spec requires working, stable endpoints to document

### Research Flags

Phases needing deeper research during planning:
- **Phase 4 (OCD Layer):** Medium confidence on spec compliance. The OCD spec is dormant since ~2020 and some entity field requirements have ambiguity. Recommend verifying View Royal's canonical division ID (`csd:5917034`) against the `opencivicdata/ocd-division-ids` repository before starting implementation. UUID v1 vs v4 requirement for person/org IDs should be confirmed against actual civic tech interoperability expectations.

Phases with standard, well-documented patterns (skip deeper research):
- **Phase 1 (Foundation):** All patterns are in official Cloudflare documentation. SHA-256 key hashing, `timingSafeEqual`, and the Rate Limit binding have comprehensive official guides.
- **Phase 2 (Core Data):** Keyset pagination is a documented Supabase pattern. REST endpoint structure follows established conventions with no ambiguity.
- **Phase 3 (Intelligence):** Wraps existing `hybridSearchAll()` and `runQuestionAgent()` functions. Main work is response format conversion, not new infrastructure.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Hono, chanfana, and Zod are Cloudflare-maintained or officially recommended. Rate Limit binding is GA with full documentation. SHA-256 key hashing is the explicit Cloudflare-documented pattern for API keys. |
| Features | HIGH | Benchmarked against OpenStates v3, Google Civic Info, and Councilmatic with full API specs. Feature tier classifications are grounded in actual civic data API ecosystem behavior, not inference. |
| Architecture | HIGH | URL-prefix split pattern is simple and precedented. Service layer reuse is straightforward — no new database queries needed for Phases 1-3. The wrapper-function-over-middleware decision is the right call for RR 7.12.0. |
| Pitfalls | HIGH | All 5 critical pitfalls sourced from Cloudflare's own security documentation or widely-documented API design anti-patterns. OCD ID format (P5) is the only item with meaningful implementation uncertainty. |

**Overall confidence:** HIGH

### Gaps to Address

- **OCD canonical division ID for View Royal**: Research specifies `ocd-division/country:ca/csd:5917034` but this should be verified against the `opencivicdata/ocd-division-ids` GitHub repository before Phase 4. The CSD (Census Subdivision) code needs confirmation — if it does not exist in the canonical repo, the process for adding it requires community discussion.

- **`X-RateLimit-Remaining` header**: The Cloudflare Rate Limit binding returns only `{ success: boolean }` — remaining request count is not available. Either accept omitting this header in v1 (document the omission in the OpenAPI spec) or implement a separate per-key counter (adds meaningful complexity). Recommend omitting for v1.

- **Supabase admin client vs RLS for public API**: The current service layer uses `getSupabaseAdminClient()` which bypasses row-level security. PITFALLS.md flags this as a risk. Determine before Phase 2 whether the platform's data is intentionally fully public (admin client is acceptable) or whether new RLS policies should gate the public API path.

- **Rate limit binding pricing**: Documented as GA but the Cloudflare pricing page does not explicitly state whether the Rate Limit binding is included in Workers Paid or has per-request costs. Verify before production launch to avoid surprise charges.

## Sources

### Primary (HIGH confidence)
- [Cloudflare Workers Rate Limit Binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) — binding API, GA announcement, wrangler.toml configuration
- [Cloudflare Workers Timing-Safe Comparison](https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/) — `timingSafeEqual` pattern
- [chanfana GitHub](https://github.com/cloudflare/chanfana) — v3.0.0 release, Zod v4 requirement, Hono adapter docs
- [Hono on Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers) — official integration guide
- [OCD Identifiers specification](https://open-civic-data.readthedocs.io/en/latest/ocdids.html) — ID format requirements
- [OCD Entity specifications](https://open-civic-data.readthedocs.io/en/latest/data/index.html) — field requirements per entity type
- [OpenStates API v3](https://docs.openstates.org/api-v3/) — benchmark for endpoint design, auth, rate limits, pagination
- [Cloudflare Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) — security patterns, crypto APIs

### Secondary (MEDIUM confidence)
- [OCD Division IDs repository](https://github.com/opencivicdata/ocd-division-ids) — canonical division IDs for Canadian municipalities
- [Supabase pagination best practices](https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/references/data-pagination.md) — keyset pagination patterns
- [Supabase API key management (MakerKit)](https://makerkit.dev/blog/tutorials/supabase-api-key-management) — table schema, hashing pattern
- [OpenAPI spec pitfalls (liblab)](https://liblab.com/blog/why-your-open-api-spec-sucks) — common drift and nullable field issues
- [Google Civic Info API](https://developers.google.com/civic-information/docs/v2) — benchmark comparison, auth model

### Tertiary (LOW confidence)
- Rate limit binding pricing (appears included in Workers Paid, not explicitly stated on pricing page)
- chanfana custom router extensibility (mentioned in docs, no example implementations found)

---
*Research completed: 2026-02-19*
*Ready for roadmap: yes*
