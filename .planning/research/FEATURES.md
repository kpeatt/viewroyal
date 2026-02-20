# Feature Landscape: v1.3 Platform APIs

**Domain:** Public API + OCD API for civic data interoperability
**Researched:** 2026-02-19
**Mode:** Ecosystem research -- what do civic data APIs offer?

---

## Executive Summary

Civic data APIs cluster into three tiers: (1) **data access APIs** that expose meetings, people, motions, and documents as JSON (Councilmatic, Legistar API, municipal open data portals), (2) **standardized interoperability APIs** that use the Open Civic Data (OCD) specification for cross-jurisdiction tooling (OpenStates, Councilmatic OCD endpoints), and (3) **intelligence APIs** that provide search, analysis, or AI-generated answers (Google Civic Info, ViewRoyal.ai's existing RAG). ViewRoyal.ai's v1.3 milestone combines all three -- a data API for its own entities, OCD-standard endpoints for civic tech ecosystem compatibility, and Search/Ask endpoints that expose the existing hybrid search and RAG capabilities programmatically.

The API landscape for municipal-level civic data is surprisingly thin. OpenStates covers state legislatures comprehensively but does not go municipal. Google Civic Info covers elections and representatives but not council proceedings. Councilmatic (DataMade) covers some cities but is a web app, not a reusable API service. This means ViewRoyal.ai has a genuine opportunity to be one of the first well-documented, OCD-compliant municipal council data APIs -- especially in Canada where civic tech APIs are nearly nonexistent.

---

## Table Stakes Features

Features API consumers expect from any serious data API. Missing any of these makes the API feel amateur or unusable.

### TS-1: API Key Authentication

| Aspect | Detail |
|--------|--------|
| **What** | Require API key for all API endpoints. Keys stored in Supabase, passed via `X-API-Key` header or `?apikey` query parameter. |
| **Why expected** | Every civic data API requires authentication. OpenStates uses API keys via header/query param. Google Civic Info uses API keys. Even free APIs need keys to track usage and prevent abuse. |
| **Complexity** | Low |
| **Dependencies** | New `api_keys` table in Supabase. Middleware to validate keys on API routes. |
| **Notes** | Header-based auth (`X-API-Key`) is preferred for security (keys don't leak into server logs). Query param (`?apikey`) is a convenience fallback -- OpenStates supports both. No need for OAuth2 at this scale. |

### TS-2: Rate Limiting

| Aspect | Detail |
|--------|--------|
| **What** | Per-key rate limits with standard headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`). Return HTTP 429 with `Retry-After` when exceeded. |
| **Why expected** | OpenStates enforces 10-240 req/min depending on tier. Google Civic Info has per-project quotas. Rate limiting is table stakes for any production API. Cloudflare Workers has a native Rate Limiting API binding that is fast (counters cached on same machine, no network hop). |
| **Complexity** | Low-Medium |
| **Dependencies** | TS-1 (need key to rate-limit per-key). Cloudflare Workers Rate Limiting binding in wrangler.toml. |
| **Notes** | Start with a single tier (e.g., 60 req/min per key). The existing in-memory rate limiter on `api.ask.tsx` and `api.search.tsx` is per-IP and non-durable -- the new API should use Cloudflare's native Rate Limiting binding which is durable across Worker restarts. Separate rate limits for AI endpoints (lower) vs data endpoints (higher). |

### TS-3: Cursor-Based Pagination

| Aspect | Detail |
|--------|--------|
| **What** | Cursor-based pagination on all list endpoints. Response includes `next_cursor`, `has_more`, and `total_count`. Accept `cursor` and `per_page` (default 20, max 100) as query params. |
| **Why expected** | Cursor-based pagination is the modern standard for APIs handling ordered data -- it avoids the performance problems of offset-based pagination on large datasets and handles concurrent inserts gracefully. OpenStates v3 uses page-based (simpler but less robust). Google APIs increasingly use cursor-based. |
| **Complexity** | Medium |
| **Dependencies** | Needs stable sort columns (id + timestamp). Cursor encoding (base64 of last-seen id). |
| **Notes** | Use the meeting `id` or record `id` as the cursor anchor -- Supabase supports keyset pagination natively via `.gt('id', cursor)`. Encode cursor as base64 to make it opaque to consumers. OCD endpoints can use page-based pagination (`?page=1&per_page=20`) to match the OCD convention while native endpoints use cursor-based. |

### TS-4: Core Data Endpoints

| Aspect | Detail |
|--------|--------|
| **What** | RESTful JSON endpoints for the five core entity types already in the database. |
| **Why expected** | Every civic data API exposes these. Councilmatic has bills, events, people, organizations. OpenStates has jurisdictions, people, bills, committees, events. |
| **Complexity** | Medium (5 entity types, list + detail for each = 10 endpoints) |
| **Dependencies** | TS-1, TS-3. Existing service layer (`meetings.ts`, `people.ts`, `matters.ts`, `bylaws.ts`, `organizations.ts`). |

**Required endpoints:**

| Endpoint | Maps to | Key Filters |
|----------|---------|-------------|
| `GET /api/v1/meetings` | `meetings` table | `?after=`, `?before=`, `?type=`, `?has_transcript=`, `?organization_id=` |
| `GET /api/v1/meetings/:id` | Meeting detail | Includes agenda items, motions, attendance |
| `GET /api/v1/people` | `people` table | `?is_councillor=`, `?name=` |
| `GET /api/v1/people/:id` | Person detail | Includes memberships, voting summary |
| `GET /api/v1/matters` | `matters` table | `?status=`, `?category=`, `?after=`, `?before=` |
| `GET /api/v1/matters/:id` | Matter detail | Includes agenda items, timeline |
| `GET /api/v1/motions` | `motions` table | `?result=`, `?meeting_id=`, `?mover_id=` |
| `GET /api/v1/motions/:id` | Motion detail | Includes votes (roll call) |
| `GET /api/v1/bylaws` | `bylaws` table | `?status=`, `?category=`, `?year=` |
| `GET /api/v1/bylaws/:id` | Bylaw detail | Includes linked matters |

### TS-5: Consistent Error Responses

| Aspect | Detail |
|--------|--------|
| **What** | Structured JSON error responses with consistent shape: `{ "error": { "code": "NOT_FOUND", "message": "Meeting 999 not found", "status": 404 } }`. |
| **Why expected** | Every good API has consistent error shapes. Google APIs, OpenStates, Stripe -- all return structured errors. Inconsistent error responses (sometimes string, sometimes object, sometimes HTML) is the most common complaint about government APIs. |
| **Complexity** | Low |
| **Dependencies** | None. Define error response type, create error helper function. |
| **Notes** | Include standard HTTP codes (400, 401, 403, 404, 429, 500). Always return `Content-Type: application/json` even for errors. |

### TS-6: OpenAPI 3.1 Documentation

| Aspect | Detail |
|--------|--------|
| **What** | Auto-generated OpenAPI 3.1 specification served at `/api/v1/openapi.json` with Swagger UI at `/api/v1/docs`. |
| **Why expected** | OpenStates serves interactive docs at `/docs`. Google APIs have full reference documentation. Developers expect to explore an API interactively before writing code. OpenAPI is the universal standard for API documentation. |
| **Complexity** | Medium |
| **Dependencies** | TS-4 (endpoints must exist to document). Chanfana library (Cloudflare's OpenAPI 3.1 generator for Workers) or static spec file. |
| **Notes** | Cloudflare maintains `chanfana` -- an OpenAPI 3.1 schema generator/validator for Hono and itty-router, purpose-built for Workers. However, this project uses React Router 7, not Hono. Two options: (A) write a static OpenAPI spec file and serve Swagger UI, or (B) use a separate Hono-based router for API routes with chanfana. Option A is simpler and sufficient. |

### TS-7: Municipality Scoping

| Aspect | Detail |
|--------|--------|
| **What** | All data endpoints scoped to a specific municipality. Accept municipality via URL path (`/api/v1/municipalities/:slug/meetings`) or query param (`?municipality=view-royal`). Default to the only active municipality. |
| **Why expected** | Multi-tenancy is already built into the data layer. API consumers need to specify which municipality's data they want. OpenStates scopes everything by jurisdiction. |
| **Complexity** | Low |
| **Dependencies** | Existing `municipality_id` FK columns on all tables. Existing `getMunicipality()` service. |
| **Notes** | With only one municipality currently live, defaulting is fine. But the API should be designed for multi-municipality from day one. |

---

## Differentiators

Features that set this API apart from existing civic data APIs. Not expected, but valued.

### D-1: Search API Endpoint

| Aspect | Detail |
|--------|--------|
| **What** | `GET /api/v1/search?q=housing+bylaw` -- Expose the existing hybrid search (vector + full-text with RRF across 4 content types) as a JSON API endpoint. Returns ranked results with snippets, source type, and relevance score. |
| **Why differentiating** | OpenStates has basic full-text search on bills. No civic data API offers hybrid semantic+keyword search across multiple content types. This is ViewRoyal.ai's core intelligence advantage exposed programmatically. |
| **Complexity** | Low -- the existing `hybridSearchAll()` function already does this for the web UI. Wrap it with API auth and pagination. |
| **Dependencies** | TS-1, TS-3. Existing `hybrid-search.server.ts` service. |
| **Notes** | Support `?type=motion,transcript_segment` filter to narrow by content type. |

### D-2: Ask API Endpoint (Non-Streaming RAG)

| Aspect | Detail |
|--------|--------|
| **What** | `POST /api/v1/ask` with `{ "question": "...", "context": "..." }` -- Returns a non-streaming JSON response with the AI answer, sources with citations, and suggested follow-ups. |
| **Why differentiating** | No municipal API offers RAG Q&A. This is a unique capability that transforms a data API into an intelligence API. The existing streaming endpoint works for web UIs but API consumers want a simple request/response. |
| **Complexity** | Medium -- the RAG pipeline exists but currently streams via SSE. Need to collect the full response before returning JSON. |
| **Dependencies** | TS-1, TS-2 (needs stricter rate limiting -- AI calls are expensive). Existing `runQuestionAgent()` function. |
| **Notes** | Lower rate limit for this endpoint (e.g., 10 req/min vs 60 for data). Include `usage` field in response (tokens consumed, latency) for transparency. Consider a separate API key tier or usage-based billing later. |

### D-3: OCD-Standard Endpoints

| Aspect | Detail |
|--------|--------|
| **What** | OCD-compliant endpoints that map ViewRoyal.ai data to the Open Civic Data specification, enabling interoperability with civic tech tools. |
| **Why differentiating** | OCD is the standard for civic data interoperability, used by OpenStates, Councilmatic, Sunlight Foundation tools, and Google Civic Info (for division IDs). Being OCD-compliant means other civic tech tools can consume ViewRoyal.ai data without custom integration. Almost no Canadian municipal platform provides OCD endpoints. |
| **Complexity** | High |
| **Dependencies** | TS-4 (core data endpoints built first), OCD ID columns on tables. |

**OCD Entity Mapping:**

| OCD Entity | ViewRoyal.ai Entity | OCD ID Format | Notes |
|------------|---------------------|---------------|-------|
| Jurisdiction | Municipality | `ocd-jurisdiction/country:ca/province:bc/place:view_royal/government` | Fixed format from division hierarchy |
| Organization | Organization | `ocd-organization/{uuid}` | Council, committees, boards |
| Person | Person | `ocd-person/{uuid}` | Councillors, staff |
| Event | Meeting | `ocd-event/{uuid}` | With agenda items as nested `agenda` |
| Bill | Matter | `ocd-bill/{uuid}` | Matters map to bills (legislative items tracked over time) |
| Vote | Motion | `ocd-vote/{uuid}` | Motions with roll call votes |

**OCD Endpoints:**

| Endpoint | Response Shape |
|----------|---------------|
| `GET /api/ocd/jurisdictions` | OCD Jurisdiction objects |
| `GET /api/ocd/jurisdictions/:ocd_id` | Single jurisdiction |
| `GET /api/ocd/organizations` | OCD Organization objects |
| `GET /api/ocd/organizations/:ocd_id` | Single organization with posts |
| `GET /api/ocd/people` | OCD Person objects |
| `GET /api/ocd/people/:ocd_id` | Person with memberships, contact details |
| `GET /api/ocd/events` | OCD Event objects (meetings) |
| `GET /api/ocd/events/:ocd_id` | Event with agenda, participants, media |
| `GET /api/ocd/bills` | OCD Bill objects (matters) |
| `GET /api/ocd/bills/:ocd_id` | Bill with actions, sponsors, votes |
| `GET /api/ocd/votes` | OCD Vote objects (motions with roll call) |
| `GET /api/ocd/votes/:ocd_id` | Vote with counts, individual rolls |

**OCD Pagination Convention:** Page-based (`?page=1&per_page=20`) with response metadata `{ "meta": { "per_page": 20, "page": 1, "max_page": 5, "total_items": 100 } }` -- matching the OpenStates convention.

### D-4: API Key Management Page

| Aspect | Detail |
|--------|--------|
| **What** | Web UI page where authenticated users can create, view, rotate, and revoke their API keys. Shows usage stats per key. |
| **Why differentiating** | Most civic data APIs make you email someone or fill out a form for a key. Self-service key management (like Stripe, OpenAI, GitHub) is a much better developer experience. |
| **Complexity** | Medium |
| **Dependencies** | TS-1 (api_keys table). Existing Supabase Auth for user authentication. |
| **Notes** | Store hashed keys in database, show full key only on creation. Limit to 3 active keys per user. |

### D-5: Response Envelope with Metadata

| Aspect | Detail |
|--------|--------|
| **What** | All responses wrapped in a consistent envelope: `{ "data": [...], "meta": { "total_count": 150, "page": 1, "per_page": 20, "has_more": true, "next_cursor": "..." }, "links": { "self": "...", "next": "..." } }` |
| **Why differentiating** | HATEOAS-style links and rich metadata help API consumers build pagination UIs without hardcoding URL patterns. OpenStates includes pagination metadata. Google APIs include `nextPageToken`. |
| **Complexity** | Low |
| **Dependencies** | TS-3 (pagination system feeds metadata). |

---

## Anti-Features (Deliberately NOT Building)

### AF-1: GraphQL API
**Why not:** GraphQL adds significant complexity (schema definition, resolver layer, n+1 query protection, depth limiting) for a dataset that maps naturally to REST. OpenStates moved from GraphQL (v2) to REST (v3). The data relationships are straightforward -- REST with selective `?include=` params covers the use cases without the overhead.

### AF-2: Webhooks / Event Streaming
**Why not:** The pipeline runs daily in batch. New data arrives once per day at most. Webhooks add infrastructure complexity (delivery guarantees, retry queues, signature verification) for a use case that doesn't need real-time notification. API consumers can poll with `?updated_since=` filters. Revisit only if there are actual consumers requesting push notifications.

### AF-3: Write API (Create/Update/Delete)
**Why not:** This is a read-only data platform. All data comes from the pipeline scraping official municipal sources. Allowing external writes would compromise data integrity and the "official record" value proposition. The pipeline is the single source of truth.

### AF-4: OAuth2 / OIDC
**Why not:** OAuth2 is appropriate when users authorize third-party apps to act on their behalf. This API is read-only public data -- there's no user-scoped data to protect. API keys are the appropriate auth mechanism for this use case. Google Civic Info uses API keys. OpenStates uses API keys.

### AF-5: Client SDKs
**Why not:** SDKs are a maintenance burden. With good OpenAPI docs, consumers can generate their own typed clients using `openapi-generator` or similar tools. The OpenAPI spec IS the SDK. Only build SDKs if there's demonstrated demand from multiple consumers.

### AF-6: Versioned API with Multiple Versions
**Why not:** Start with `/api/v1/` in the URL for future flexibility, but do not build version negotiation, content negotiation (`Accept` header versioning), or maintain multiple versions simultaneously. When v2 is needed, deprecate v1 with a sunset header and migration guide. Premature versioning infrastructure is waste.

### AF-7: Full Transcript Endpoint
**Why not:** Transcripts are large (megabytes per meeting) and contain speaker-attributed segments. Exposing raw transcript data risks overwhelming API consumers and inflating bandwidth costs. Instead, expose transcript search (via the Search endpoint) and key statements. If full transcripts are needed, provide them as downloadable files, not paginated API responses.

---

## Feature Dependencies

```
TS-1 (API Key Auth)
 |-- TS-2 (Rate Limiting) -- rate limit per key
 |-- TS-4 (Core Data Endpoints) -- all need auth
 |-- D-1 (Search API) -- needs auth
 |-- D-2 (Ask API) -- needs auth + stricter rate limits
 |-- D-3 (OCD Endpoints) -- needs auth
 |-- D-4 (Key Management UI) -- manages keys

TS-3 (Cursor Pagination)
 |-- TS-4 (Core Data Endpoints) -- all list endpoints paginated
 |-- D-1 (Search API) -- search results paginated
 |-- D-5 (Response Envelope) -- pagination metadata

TS-4 (Core Data Endpoints)
 |-- D-3 (OCD Endpoints) -- OCD is a transformation layer over core data

TS-5 (Error Responses) -- independent, apply everywhere
TS-6 (OpenAPI Docs) -- depends on all endpoints being defined
TS-7 (Municipality Scoping) -- independent, apply everywhere
```

**Build order implication:** Auth + rate limiting first, then core data endpoints with pagination, then OCD transformation layer, then Search/Ask wrappers, then docs last.

---

## OCD Specification Requirements (Detailed)

### Required OCD Entity Fields

Based on the Open Civic Data specification (open-civic-data.readthedocs.io):

**Event (Meeting):**
- `_type`: "event"
- `name`, `description`, `classification` (required)
- `start_time`, `timezone`, `end_time`, `all_day`, `status` (required)
- `location` object with `name`, `url`, `coordinates` (required, nullable)
- `participants` array: `note`, `name`, `entity_type` (person/organization), `entity_id`
- `agenda` array: `description`, `order`, `subjects`, `related_entities`, `media`
- `media` array: `note`, `links` (with `media_type` and `url`)
- `documents` array: `note`, `links`
- `sources` array: minimum 1 item with `url`
- `created_at`, `updated_at`

**Person:**
- `name` (required)
- `image`, `sort_name`, `family_name`, `given_name`, `gender` (optional)
- `summary`, `biography` (optional)
- `contact_details` array, `links` array, `identifiers` array
- `sources` array: minimum 1

**Bill (Matter):**
- `_type`: "bill"
- `organization`, `organization_id`, `session`, `name`, `title`, `type` (required)
- `subject` array, `summaries` array
- `sponsors` array: `name`, `sponsorship_type`, `primary`, `id`
- `actions` array: `date`, `type`, `description`, `actor`
- `documents` array, `versions` array
- `related_bills` array
- `sources` array: minimum 1

**Vote:**
- `_type`: "vote"
- `organization`, `session`, `date`, `motion`, `type`, `passed` (required)
- `bill` object (nullable): linked legislation
- `vote_counts` array: tallies by category (yes, no, absent, abstain, etc.)
- `roll_call` array: individual votes with `person`, `id`, `vote`
- `sources` array: minimum 1

**Organization:**
- `name`, `classification` (required)
- `parent_id`, `image`, `founding_date`, `dissolution_date` (required, nullable)
- `posts` array, `contact_details` array, `links` array
- `sources` array: minimum 1

**Jurisdiction:**
- `name`, `url`, `classification` (required)
- `legislative_sessions` object
- `feature_flags` array

### OCD ID Generation

- **Division IDs:** `ocd-division/country:ca/province:bc/csd:view_royal` -- deterministic from geography
- **Jurisdiction IDs:** `ocd-jurisdiction/country:ca/province:bc/place:view_royal/government` -- deterministic
- **Person IDs:** `ocd-person/{uuid}` -- UUID generated at first creation, stored in `ocd_id` column
- **Organization IDs:** `ocd-organization/{uuid}` -- UUID generated at first creation
- **Event/Bill/Vote IDs:** Generated on demand from existing record IDs, or stored in `ocd_id` columns

---

## Comparison with Existing Civic APIs

| Feature | OpenStates v3 | Google Civic Info | Councilmatic | ViewRoyal.ai v1.3 |
|---------|---------------|-------------------|--------------|-------------------|
| **Scope** | State legislatures (US) | Elections + reps (US) | Individual cities | Individual municipalities (CA) |
| **Auth** | API key (header/query) | API key | None (web-only) | API key (header/query) |
| **Rate limits** | 10-240/min by tier | Per-project quota | N/A | 60/min default |
| **Pagination** | Page-based | Token-based | N/A | Cursor-based (native), page-based (OCD) |
| **OCD compliance** | Full | Division IDs only | Full (OCD API backend) | Full (subset of entity types) |
| **Search** | Full-text bills | Address-based lookup | None | Hybrid vector+keyword |
| **AI/RAG** | None | None | None | RAG Q&A with citations |
| **Docs** | Swagger UI | Google API Explorer | None | OpenAPI 3.1 + Swagger UI |
| **Entity types** | 5 (jurisdictions, people, bills, committees, events) | 3 (elections, divisions, representatives) | 4 (bills, people, events, orgs) | 6 (meetings, people, matters, motions, bylaws, organizations) + OCD |

---

## MVP Recommendation

**Phase 1 -- Foundation (build first):**
1. TS-1: API Key Authentication
2. TS-2: Rate Limiting
3. TS-5: Consistent Error Responses
4. TS-7: Municipality Scoping

**Phase 2 -- Core Data (build second):**
1. TS-3: Cursor-Based Pagination
2. TS-4: Core Data Endpoints (all 10)
3. D-5: Response Envelope with Metadata

**Phase 3 -- Intelligence (build third):**
1. D-1: Search API Endpoint
2. D-2: Ask API Endpoint (non-streaming)

**Phase 4 -- OCD + Docs (build last):**
1. D-3: OCD-Standard Endpoints (transformation layer)
2. TS-6: OpenAPI 3.1 Documentation (document everything)
3. D-4: API Key Management Page

**Defer:**
- AF-1 through AF-7: All anti-features explicitly deferred

---

## Sources

- [Open Civic Data Specification](https://open-civic-data.readthedocs.io/en/latest/data/index.html) -- entity types, field definitions
- [OCD Identifiers](https://open-civic-data.readthedocs.io/en/latest/ocdids.html) -- ID format specification
- [OCD Event Entity](https://open-civic-data.readthedocs.io/en/latest/data/event.html) -- meeting/event fields
- [OCD Person Entity](https://open-civic-data.readthedocs.io/en/latest/data/person.html) -- person fields
- [OCD Bill Entity](https://open-civic-data.readthedocs.io/en/latest/data/bill.html) -- bill/matter fields
- [OCD Vote Entity](https://open-civic-data.readthedocs.io/en/latest/data/vote.html) -- vote/motion fields
- [OpenStates API v3 Overview](https://docs.openstates.org/api-v3/) -- endpoints, auth, pagination
- [OpenStates API v3 OpenAPI Spec](https://v3.openstates.org/openapi.json) -- full endpoint details with filters
- [OpenStates Rate Limit Discussion](https://github.com/openstates/issues/discussions/205) -- tier structure (10-240/min)
- [Google Civic Information API Reference](https://developers.google.com/civic-information/docs/v2) -- endpoints, data types
- [Google Civic Information API Usage](https://developers.google.com/civic-information/docs/using_api) -- auth, best practices
- [Councilmatic (DataMade)](https://github.com/datamade/chi-councilmatic) -- OCD-backed municipal data app
- [Cloudflare Workers Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) -- native rate limiting binding
- [Chanfana (Cloudflare)](https://github.com/cloudflare/chanfana) -- OpenAPI 3.1 generator for Workers
- [OpenAPI Best Practices](https://learn.openapis.org/best-practices.html) -- spec organization, tagging
- [API Rate Limiting Best Practices 2025](https://zuplo.com/learning-center/10-best-practices-for-api-rate-limiting-in-2025) -- headers, 429 responses
- [REST API Pagination Best Practices](https://www.moesif.com/blog/technical/api-design/REST-API-Design-Filtering-Sorting-and-Pagination/) -- cursor vs offset, filtering

---
*Last updated: 2026-02-19*
