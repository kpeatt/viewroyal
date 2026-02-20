# Requirements: ViewRoyal.ai v1.3 Platform APIs

**Defined:** 2026-02-19
**Core Value:** Citizens can understand what their council decided, why, and who said what — without attending meetings or reading hundreds of pages of PDFs.

## v1.3 Requirements

Requirements for the Platform APIs milestone. Each maps to roadmap phases.

### API Infrastructure

- [ ] **INFRA-01**: API consumers can authenticate via API key passed in `X-API-Key` header or `?apikey` query parameter
- [ ] **INFRA-02**: API keys are stored as SHA-256 hashes with timing-safe comparison to prevent timing attacks
- [ ] **INFRA-03**: API consumers are rate limited per-key using Cloudflare Workers Rate Limit binding (durable across isolate eviction)
- [ ] **INFRA-04**: Rate-limited requests receive HTTP 429 with `Retry-After` header
- [x] **INFRA-05**: All API errors return consistent JSON shape: `{ "error": { "code", "message", "status" } }`
- [x] **INFRA-06**: Public API routes (`/api/v1/*`, `/api/ocd/*`) include proper CORS headers for cross-origin access
- [x] **INFRA-07**: All API endpoints are scoped to a municipality via URL path parameter

### Data Endpoints

- [ ] **DATA-01**: API consumer can list meetings with cursor-based pagination and filters (date range, type, has_transcript, organization)
- [ ] **DATA-02**: API consumer can get meeting detail including agenda items, motions, and attendance
- [ ] **DATA-03**: API consumer can list people with filters (is_councillor, name search)
- [ ] **DATA-04**: API consumer can get person detail including memberships and voting summary
- [ ] **DATA-05**: API consumer can list matters with filters (status, category, date range)
- [ ] **DATA-06**: API consumer can get matter detail including agenda items and timeline
- [ ] **DATA-07**: API consumer can list motions with filters (result, meeting, mover)
- [ ] **DATA-08**: API consumer can get motion detail including individual roll call votes
- [ ] **DATA-09**: API consumer can list bylaws with filters (status, category, year)
- [ ] **DATA-10**: API consumer can get bylaw detail including linked matters
- [ ] **DATA-11**: All list endpoints use cursor-based pagination with opaque base64 cursors, `per_page` (max 100), and `has_more` indicator
- [ ] **DATA-12**: All responses use consistent envelope: `{ "data", "pagination", "meta" }` with request ID

### Search

- [ ] **SRCH-01**: API consumer can search across all content types via `GET /api/v1/search?q=` using existing hybrid vector+keyword search
- [ ] **SRCH-02**: Search results include content type, relevance score, and text snippets
- [ ] **SRCH-03**: Search results are paginated and filterable by content type

### OCD Endpoints

- [ ] **OCD-01**: API consumer can list and get OCD Jurisdiction objects mapped from municipalities
- [ ] **OCD-02**: API consumer can list and get OCD Organization objects mapped from organizations
- [ ] **OCD-03**: API consumer can list and get OCD Person objects mapped from people
- [ ] **OCD-04**: API consumer can list and get OCD Event objects mapped from meetings (with agenda, participants, media)
- [ ] **OCD-05**: API consumer can list and get OCD Bill objects mapped from matters (with actions, sponsors)
- [ ] **OCD-06**: API consumer can list and get OCD Vote objects mapped from motions (with roll call)
- [ ] **OCD-07**: OCD endpoints use page-based pagination matching the OpenStates convention
- [ ] **OCD-08**: All OCD entities include valid OCD IDs (deterministic for jurisdictions/divisions, UUID-based for others)

### Documentation & Management

- [ ] **DOCS-01**: OpenAPI 3.1 spec is served at `/api/v1/openapi.json` documenting all public endpoints
- [ ] **DOCS-02**: Interactive Swagger UI is served at `/api/v1/docs` for API exploration
- [ ] **DOCS-03**: Authenticated user can create, view, and revoke API keys via a self-service management page
- [ ] **DOCS-04**: API key management page shows key prefix (not full key) and creation date

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Intelligence API

- **INTL-01**: API consumer can submit questions via `POST /api/v1/ask` and receive non-streaming RAG answers with citations
- **INTL-02**: Ask endpoint has stricter rate limits due to Gemini API costs

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| GraphQL API | REST maps naturally to data model; OpenStates moved from GraphQL to REST |
| Webhooks / Event Streaming | Batch pipeline runs daily; no real-time value to push |
| Write API (Create/Update/Delete) | Read-only platform; pipeline is single source of truth |
| OAuth2 / OIDC | Inappropriate for read-only public data; API keys are correct mechanism |
| Client SDKs | OpenAPI spec enables auto-generation; build only on consumer demand |
| Multiple API versions simultaneously | Start with `/api/v1/`; deprecate when v2 needed |
| Full transcript endpoint | Transcripts are large; expose via search and key statements instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 15 | Pending |
| INFRA-02 | Phase 15 | Pending |
| INFRA-03 | Phase 15 | Pending |
| INFRA-04 | Phase 15 | Pending |
| INFRA-05 | Phase 15 | Complete |
| INFRA-06 | Phase 15 | Complete |
| INFRA-07 | Phase 15 | Complete |
| DATA-01 | Phase 16 | Pending |
| DATA-02 | Phase 16 | Pending |
| DATA-03 | Phase 16 | Pending |
| DATA-04 | Phase 16 | Pending |
| DATA-05 | Phase 16 | Pending |
| DATA-06 | Phase 16 | Pending |
| DATA-07 | Phase 16 | Pending |
| DATA-08 | Phase 16 | Pending |
| DATA-09 | Phase 16 | Pending |
| DATA-10 | Phase 16 | Pending |
| DATA-11 | Phase 16 | Pending |
| DATA-12 | Phase 16 | Pending |
| SRCH-01 | Phase 16 | Pending |
| SRCH-02 | Phase 16 | Pending |
| SRCH-03 | Phase 16 | Pending |
| OCD-01 | Phase 17 | Pending |
| OCD-02 | Phase 17 | Pending |
| OCD-03 | Phase 17 | Pending |
| OCD-04 | Phase 17 | Pending |
| OCD-05 | Phase 17 | Pending |
| OCD-06 | Phase 17 | Pending |
| OCD-07 | Phase 17 | Pending |
| OCD-08 | Phase 17 | Pending |
| DOCS-01 | Phase 18 | Pending |
| DOCS-02 | Phase 18 | Pending |
| DOCS-03 | Phase 18 | Pending |
| DOCS-04 | Phase 18 | Pending |

**Coverage:**
- v1.3 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 after roadmap creation*
