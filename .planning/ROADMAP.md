# Roadmap: ViewRoyal.ai

## Milestones

- ✅ **v1.0 Land & Launch** -- Phases 1-6 (shipped 2026-02-17) -- [Archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Deep Intelligence** -- Phases 7-11 (shipped 2026-02-19) -- [Archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Pipeline Automation** -- Phases 12-14 (shipped 2026-02-20) -- [Archive](milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Platform APIs** -- Phases 15-18 (shipped 2026-02-22) -- [Archive](milestones/v1.3-ROADMAP.md)
- 🚧 **v1.4 Developer Documentation Portal** -- Phases 19-22 (in progress)

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

<details>
<summary>✅ v1.3 Platform APIs (Phases 15-18) -- SHIPPED 2026-02-22</summary>

- [x] Phase 15: API Foundation (2/2 plans) -- completed 2026-02-20
- [x] Phase 16: Core Data & Search API (4/4 plans) -- completed 2026-02-21
- [x] Phase 17: OCD Interoperability (6/6 plans) -- completed 2026-02-21
- [x] Phase 18: Documentation & Key Management (2/2 plans) -- completed 2026-02-22

</details>

### 🚧 v1.4 Developer Documentation Portal (In Progress)

**Milestone Goal:** Ship a fumadocs-powered developer portal at docs.viewroyal.ai with auto-generated API reference, guides, data model docs, and project documentation.

- [x] **Phase 19: Infrastructure & Scaffolding** - pnpm workspace migration and fumadocs site scaffold with static export build pipeline (completed 2026-02-23)
- [x] **Phase 20: OpenAPI Integration & API Reference** - Auto-generated API reference pages from OpenAPI spec with interactive playground (completed 2026-02-23)
- [ ] **Phase 21: Developer Guides** - Hand-written getting started, authentication, pagination, and error handling guides
- [ ] **Phase 22: Reference Content & Production** - Data model, OCD reference, changelog, contribution guide, and production deployment at docs.viewroyal.ai

## Phase Details

### Phase 19: Infrastructure & Scaffolding
**Goal**: Developers can visit a working fumadocs site with navigation, search, and dark mode -- the full build and deploy pipeline is validated end-to-end before any content is authored
**Depends on**: Phase 18 (v1.3 complete, OpenAPI spec live at /api/v1/openapi.json)
**Requirements**: MONO-01, MONO-02, FWRK-01, FWRK-02
**Success Criteria** (what must be TRUE):
  1. Root pnpm-workspace.yaml exists and `pnpm install` from root resolves all workspace members (apps/web, apps/docs, apps/vimeo-proxy)
  2. Existing apps/web builds and deploys to Cloudflare Workers without regressions after workspace migration
  3. `apps/docs/` contains a fumadocs v16 + Next.js 16 site that builds successfully with `output: 'export'` producing a static `out/` directory
  4. The static build completes with zero errors and the output renders correctly in a local browser (navigation sidebar, dark mode toggle, Orama search input all visible)
**Plans**: 2 plans

Plans:
- [ ] 19-01-PLAN.md — pnpm workspace migration and existing app build verification
- [ ] 19-02-PLAN.md — Fumadocs v16 scaffold with static export build pipeline

### Phase 20: OpenAPI Integration & API Reference
**Goal**: Developers can browse complete auto-generated API reference documentation with interactive playground and multi-language code examples for every endpoint
**Depends on**: Phase 19 (fumadocs scaffold with working build pipeline)
**Requirements**: AREF-01, AREF-02, AREF-03, AREF-04
**Success Criteria** (what must be TRUE):
  1. OpenAPI 3.1 spec is fetched from the live API at build time, with a checked-in fallback used when the API is unreachable
  2. API reference pages are auto-generated and grouped by tag (Meetings, People, Matters, Motions, Bylaws, Search, OCD, System) with all endpoints visible in the sidebar
  3. Each API reference page includes an interactive playground where a developer can enter parameters and execute live requests against the API
  4. Each API reference page shows code examples in curl, JavaScript, and Python that a developer can copy and run
**Plans**: 2 plans

Plans:
- [ ] 20-01-PLAN.md — OpenAPI infrastructure: prebuild script, spec fetch with fallback, generateFiles, multi-language code samples
- [ ] 20-02-PLAN.md — API page rendering: components, MDX registration, CSS, sidebar navigation, build verification

### Phase 21: Developer Guides
**Goal**: A new developer can go from zero to a successful API call in under 5 minutes by following the documentation guides
**Depends on**: Phase 20 (API reference exists so guides can cross-link to specific endpoints)
**Requirements**: GUID-01, GUID-02, GUID-03, GUID-04
**Success Criteria** (what must be TRUE):
  1. Getting Started guide walks a developer from obtaining an API key to making their first successful API call with working curl/JS/Python examples
  2. Authentication guide documents the X-API-Key header, rate limit behavior, all authentication error responses, and links to the /developers key management page
  3. Pagination guide explains both cursor-based (v1 API) and page-based (OCD API) pagination with working code examples that a developer can copy and adapt
  4. Error Handling guide documents every error code (NOT_FOUND, UNAUTHORIZED, RATE_LIMITED, VALIDATION_ERROR, etc.) with response shapes and retry logic examples
**Plans**: 2 plans

Plans:
- [x] 21-01-PLAN.md — Guides navigation, Getting Started guide, and Authentication guide
- [ ] 21-02-PLAN.md — Pagination guide, Error Handling guide, and full build verification

### Phase 22: Reference Content & Production
**Goal**: The complete documentation portal is deployed at docs.viewroyal.ai with all reference content, working search across all pages, and navigation linking the entire site
**Depends on**: Phase 21 (guides complete, all content authored)
**Requirements**: REFC-01, REFC-02, REFC-03, REFC-04, FWRK-03, FWRK-04, FWRK-05
**Success Criteria** (what must be TRUE):
  1. Data Model page displays entity relationships with a Mermaid ER diagram showing how meetings, agenda items, motions, matters, bylaws, people, and organizations relate
  2. OCD Standard Reference page explains entity mapping between v1 and OCD APIs, documents OCD ID format, and helps a developer decide which API to use
  3. Changelog page has an initial v1.0 API entry and Contribution guide links to GitHub for bug reports and feature requests
  4. docs.viewroyal.ai is live on Cloudflare Workers serving the static export, with Orama search returning results across all documentation pages
  5. Navigation sidebar is auto-generated from the content directory structure and correctly groups API Reference, Guides, and Reference sections
**Plans**: TBD

Plans:
- [ ] 22-01: TBD
- [ ] 22-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 19 → 20 → 21 → 22

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
| 15. API Foundation | v1.3 | 2/2 | Complete | 2026-02-20 |
| 16. Core Data & Search API | v1.3 | 4/4 | Complete | 2026-02-21 |
| 17. OCD Interoperability | v1.3 | 6/6 | Complete | 2026-02-21 |
| 18. Documentation & Key Management | v1.3 | 2/2 | Complete | 2026-02-22 |
| 19. Infrastructure & Scaffolding | 2/2 | Complete    | 2026-02-23 | - |
| 20. OpenAPI Integration & API Reference | 2/2 | Complete    | 2026-02-23 | - |
| 21. Developer Guides | v1.4 | 1/2 | In Progress | - |
| 22. Reference Content & Production | v1.4 | 0/0 | Not started | - |
