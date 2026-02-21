# Roadmap: ViewRoyal.ai

## Milestones

- ✅ **v1.0 Land & Launch** -- Phases 1-6 (shipped 2026-02-17) -- [Archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Deep Intelligence** -- Phases 7-11 (shipped 2026-02-19) -- [Archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Pipeline Automation** -- Phases 12-14 (shipped 2026-02-20) -- [Archive](milestones/v1.2-ROADMAP.md)
- 🚧 **v1.3 Platform APIs** -- Phases 15-18 (in progress)

## Phases

<details>
<summary>✅ v1.0 Land & Launch (Phases 1-6) -- SHIPPED 2026-02-17</summary>

- [x] Phase 1: Schema Foundation (2/2 plans) -- completed 2026-02-16
- [x] Phase 2: Multi-Tenancy (1/1 plans) -- completed 2026-02-16
- [x] Phase 3: Subscriptions & Notifications (2/2 plans) -- completed 2026-02-17
- [x] Phase 4: Home Page Enhancements (2/2 plans) -- completed 2026-02-16
- [x] Phase 5: Advanced Subscriptions (3/3 plans) -- completed 2026-02-16
- [x] Phase 6: Gap Closure & Cleanup (1/1 plans) -- completed 2026-02-17

</details>

<details>
<summary>✅ v1.1 Deep Intelligence (Phases 7-11) -- SHIPPED 2026-02-19</summary>

- [x] Phase 7: Document Intelligence (3/3 plans) -- completed 2026-02-17
- [ ] ~~Phase 7.1: Upgrade Document Extraction (2/3 plans) -- paused (Batch API)~~
- [x] Phase 8: Unified Search & Hybrid RAG (5/5 plans) -- completed 2026-02-18
- [x] Phase 9: AI Profiling & Comparison (4/4 plans) -- completed 2026-02-18
- [x] Phase 10: Add Better Test Suite (5/5 plans) -- completed 2026-02-19
- [x] Phase 11: Gap Closure & Gemini Fix (1/1 plans) -- completed 2026-02-19

</details>

<details>
<summary>✅ v1.2 Pipeline Automation (Phases 12-14) -- SHIPPED 2026-02-20</summary>

- [x] Phase 12: Update Detection (2/2 plans) -- completed 2026-02-20
- [x] Phase 13: Notifications (1/1 plans) -- completed 2026-02-20
- [x] Phase 14: Scheduled Automation (2/2 plans) -- completed 2026-02-20

</details>

### 🚧 v1.3 Platform APIs (In Progress)

**Milestone Goal:** Expose civic data and RAG capabilities through a documented, stable JSON API with API key authentication, rate limiting, and OpenAPI documentation -- plus OCD-standard endpoints for civic tech interoperability.

- [x] **Phase 15: API Foundation** - API key auth, rate limiting, error handling, CORS, and municipality-scoped routing infrastructure (completed 2026-02-20)
- [ ] **Phase 16: Core Data & Search API** - REST endpoints for meetings, people, matters, motions, bylaws, and hybrid search with cursor pagination
- [ ] **Phase 17: OCD Interoperability** - Open Civic Data standard endpoints mapping existing entities to the OCD spec
- [ ] **Phase 18: Documentation & Key Management** - OpenAPI 3.1 spec, Swagger UI, and self-service API key management page

## Phase Details

### Phase 15: API Foundation
**Goal**: API consumers can authenticate, receive rate-limited responses, and get consistent error feedback across all public API routes
**Depends on**: Nothing (first phase of v1.3; builds on existing Worker infrastructure)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07
**Success Criteria** (what must be TRUE):
  1. An API consumer can send a request with a valid API key in the `X-API-Key` header and receive a successful response from a test endpoint
  2. An API consumer sending requests too rapidly receives HTTP 429 with a `Retry-After` header, and the rate limit persists across Worker isolate evictions
  3. An API consumer sending a malformed or unauthenticated request receives a consistent JSON error object with code, message, and status fields
  4. A cross-origin request to `/api/v1/*` receives proper CORS headers allowing browser-based API consumption
  5. All API routes are scoped to a municipality via URL path parameter (e.g., `/api/v1/{municipality}/meetings`)
**Plans**: 2 plans

Plans:
- [ ] 15-01-PLAN.md — Hono API framework, error handling, CORS, municipality middleware, health endpoint
- [ ] 15-02-PLAN.md — API key auth, rate limiting, api_keys table, test endpoint

### Phase 16: Core Data & Search API
**Goal**: API consumers can browse all civic data entity types and search across content through paginated, serialized REST endpoints
**Depends on**: Phase 15
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, DATA-08, DATA-09, DATA-10, DATA-11, DATA-12, SRCH-01, SRCH-02, SRCH-03
**Success Criteria** (what must be TRUE):
  1. An API consumer can list meetings, people, matters, motions, and bylaws -- each with relevant filters -- and page through results using opaque base64 cursors
  2. An API consumer can retrieve full detail for any single meeting, person, matter, motion, or bylaw by ID, including nested related data (agenda items, memberships, roll calls, etc.)
  3. All list and detail responses use a consistent envelope with `data`, `pagination` (with `has_more` and cursor), and `meta` (with request ID) fields
  4. An API consumer can search across all content types via `GET /api/v1/{municipality}/search?q=` and receive results with content type, relevance score, text snippets, and pagination
  5. No internal database fields (raw IDs, internal flags, full row data) leak into public API responses -- all entities pass through explicit serializers
**Plans**: 4 plans

Plans:
- [ ] 16-01-PLAN.md — Shared utilities (cursor pagination, response envelope, slug generation) and slug column migration
- [ ] 16-02-PLAN.md — Meetings and people list/detail endpoints with serializers
- [ ] 16-03-PLAN.md — Matters, motions, and bylaws list/detail endpoints with serializers
- [ ] 16-04-PLAN.md — Cross-entity keyword search endpoint with type filtering and pagination

### Phase 17: OCD Interoperability
**Goal**: Civic tech tools and researchers can consume View Royal council data through standardized Open Civic Data endpoints
**Depends on**: Phase 16
**Requirements**: OCD-01, OCD-02, OCD-03, OCD-04, OCD-05, OCD-06, OCD-07, OCD-08
**Success Criteria** (what must be TRUE):
  1. An API consumer can list and retrieve OCD Jurisdiction, Organization, Person, Event, Bill, and Vote entities at `/api/ocd/*` with fields conforming to the OCD spec
  2. All OCD entities include valid OCD IDs -- deterministic division-based IDs for jurisdictions, UUID-based for people, organizations, events, bills, and votes
  3. OCD list endpoints use page-based pagination matching the OpenStates convention (page number + per_page)
  4. OCD entity fields map correctly from existing database models (e.g., meetings become Events with agenda and media, matters become Bills with actions and sponsors)
**Plans**: TBD

Plans:
- [ ] 17-01: TBD
- [ ] 17-02: TBD

### Phase 18: Documentation & Key Management
**Goal**: API consumers can discover endpoints through interactive documentation and manage their own API keys without operator intervention
**Depends on**: Phase 17
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04
**Success Criteria** (what must be TRUE):
  1. An OpenAPI 3.1 spec is served at `/api/v1/openapi.json` documenting all public v1 and OCD endpoints with request/response schemas
  2. Interactive Swagger UI at `/api/v1/docs` allows exploring and testing every endpoint with a valid API key
  3. An authenticated user can create, view (prefix + creation date only), and revoke API keys through a self-service management page in the web app
**Plans**: TBD

Plans:
- [ ] 18-01: TBD
- [ ] 18-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 15 -> 16 -> 17 -> 18

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Schema Foundation | v1.0 | 2/2 | Complete | 2026-02-16 |
| 2. Multi-Tenancy | v1.0 | 1/1 | Complete | 2026-02-16 |
| 3. Subscriptions & Notifications | v1.0 | 2/2 | Complete | 2026-02-17 |
| 4. Home Page Enhancements | v1.0 | 2/2 | Complete | 2026-02-16 |
| 5. Advanced Subscriptions | v1.0 | 3/3 | Complete | 2026-02-16 |
| 6. Gap Closure & Cleanup | v1.0 | 1/1 | Complete | 2026-02-17 |
| 7. Document Intelligence | v1.1 | 3/3 | Complete | 2026-02-17 |
| 7.1 Upgrade Document Extraction | v1.1 | 2/3 | Paused | - |
| 8. Unified Search & Hybrid RAG | v1.1 | 5/5 | Complete | 2026-02-18 |
| 9. AI Profiling & Comparison | v1.1 | 4/4 | Complete | 2026-02-18 |
| 10. Add Better Test Suite | v1.1 | 5/5 | Complete | 2026-02-19 |
| 11. Gap Closure & Gemini Fix | v1.1 | 1/1 | Complete | 2026-02-19 |
| 12. Update Detection | v1.2 | 2/2 | Complete | 2026-02-20 |
| 13. Notifications | v1.2 | 1/1 | Complete | 2026-02-20 |
| 14. Scheduled Automation | v1.2 | 2/2 | Complete | 2026-02-20 |
| 15. API Foundation | 2/2 | Complete    | 2026-02-21 | - |
| 16. Core Data & Search API | 1/4 | In Progress|  | - |
| 17. OCD Interoperability | v1.3 | 0/? | Not started | - |
| 18. Documentation & Key Management | v1.3 | 0/? | Not started | - |
