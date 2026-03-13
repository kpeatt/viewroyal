# Roadmap: ViewRoyal.ai

## Milestones

- ✅ **v1.0 Land & Launch** -- Phases 1-6 (shipped 2026-02-17) -- [Archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Deep Intelligence** -- Phases 7-11 (shipped 2026-02-19) -- [Archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Pipeline Automation** -- Phases 12-14 (shipped 2026-02-20) -- [Archive](milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Platform APIs** -- Phases 15-18 (shipped 2026-02-22) -- [Archive](milestones/v1.3-ROADMAP.md)
- ✅ **v1.4 Developer Documentation Portal** -- Phases 19-24 (shipped 2026-02-25) -- [Archive](milestones/v1.4-ROADMAP.md)
- ✅ **v1.5 Document Experience** -- Phases 25-28 (shipped 2026-02-28) -- [Archive](milestones/v1.5-ROADMAP.md)
- ✅ **v1.6 Search Experience** -- Phases 29-31 (shipped 2026-03-01)
- 🚧 **v1.7 View Royal Intelligence** -- Phases 37-40 (in progress)
- 📋 **v1.8 RDOS Ingestion** -- Phases 32-36 (deferred)

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

<details>
<summary>✅ v1.4 Developer Documentation Portal (Phases 19-24) -- SHIPPED 2026-02-25</summary>

- [x] Phase 19: Infrastructure & Scaffolding (2/2 plans) -- completed 2026-02-23
- [x] Phase 20: OpenAPI Integration & API Reference (2/2 plans) -- completed 2026-02-23
- [x] Phase 21: Developer Guides (2/2 plans) -- completed 2026-02-24
- [x] Phase 22: Reference Content & Production (2/2 plans) -- completed 2026-02-24
- [x] Phase 23: Cross-Link Fix & Cleanup (1/1 plans) -- completed 2026-02-25
- [x] Phase 24: Tech Debt Cleanup (1/1 plans) -- completed 2026-02-25

</details>

<details>
<summary>✅ v1.5 Document Experience (Phases 25-28) -- SHIPPED 2026-02-28</summary>

- [x] Phase 25: Document Viewer Polish (2/2 plans) -- completed 2026-02-26
- [x] Phase 26: Meeting Provenance (1/1 plans) -- completed 2026-02-27
- [x] Phase 27: Document Discoverability (2/2 plans) -- completed 2026-02-28
- [x] Phase 28: Document Navigation (2/2 plans) -- completed 2026-02-28

</details>

<details>
<summary>✅ v1.6 Search Experience (Phases 29-31) -- SHIPPED 2026-03-01</summary>

- [x] Phase 29: Backend Foundation (2/2 plans) -- completed 2026-03-01
- [x] Phase 30: Citation UX (3/3 plans) -- completed 2026-03-01
- [x] Phase 31: Search Controls + Polish (2/2 plans) -- completed 2026-03-01

</details>

### v1.7 View Royal Intelligence (In Progress)

**Milestone Goal:** Deepen the single-municipality (View Royal) experience with smarter search, richer council member profiles, better meeting UX, and improved email alerts -- making the existing platform substantially more useful before expanding to other municipalities.

- [x] **Phase 37: Eval Foundation + Quick Wins** - RAG observability/feedback infrastructure and zero-backend-work UI improvements (summary cards, outcome badges) (completed 2026-03-06)
- [x] **Phase 38: RAG Intelligence** - LLM reranking and consolidated tool set for better answer quality (completed 2026-03-06)
- [ ] **Phase 39: Council Intelligence** - Topic taxonomy, AI profiles, key vote detection, and redesigned profile page
- [ ] **Phase 40: UX Polish + Email** - Financial transparency, meeting attendance info, and improved email digests

<details>
<summary>v1.8 RDOS Ingestion (Deferred)</summary>

**Milestone Goal:** Ingest RDOS Board of Directors meetings (2025+) through the full pipeline -- scrape from Escribemeetings, download YouTube video, diarize, AI refine, and embed -- proving multi-municipality ingestion works end-to-end.

- [ ] **Phase 32: Municipality Foundation + Escribemeetings Scraper** - RDOS database record and Escribemeetings API scraper for meeting discovery and document download
- [ ] **Phase 33: Agenda Parsing** - Structured HTML agenda parsing with PDF+AI fallback
- [ ] **Phase 34: YouTube Video Client** - YouTube channel listing, audio download, and orchestrator routing
- [ ] **Phase 35: Board Members** - Scrape RDOS board members and election data into people tables
- [ ] **Phase 36: End-to-End Integration** - Full 5-phase pipeline run for RDOS Board meetings

See RDOS requirement details in REQUIREMENTS.md v2 section.

</details>

## Phase Details

### Phase 37: Eval Foundation + Quick Wins
**Goal**: Users can rate AI answers and see richer meeting information at a glance, while RAG traces provide a measurement baseline for subsequent improvements
**Depends on**: Nothing (first phase of v1.7)
**Requirements**: SRCH-03, SRCH-04, MTGX-01, MTGX-02
**Success Criteria** (what must be TRUE):
  1. User can give thumbs up or thumbs down on any AI answer, and the feedback is persisted
  2. RAG traces (query text, tools invoked, latency, source count) are logged to the database for every AI answer
  3. Meeting list page shows summary cards with key decisions and topic indicators for each meeting
  4. Motion outcomes throughout the app display as colored badges indicating passed, defeated, tabled, or deferred
**Plans**: 2 plans

Plans:
- [ ] 37-01-PLAN.md -- RAG trace logging and user feedback infrastructure (SRCH-03, SRCH-04)
- [ ] 37-02-PLAN.md -- Motion outcome badges and enhanced meeting summary cards (MTGX-01, MTGX-02)

### Phase 38: RAG Intelligence
**Goal**: AI answers are measurably more relevant through LLM reranking and a streamlined tool set
**Depends on**: Phase 37 (observability baseline needed to measure improvements)
**Requirements**: SRCH-01, SRCH-02
**Success Criteria** (what must be TRUE):
  1. Search results and RAG evidence are reranked by LLM relevance scoring, with the reranking step visible in RAG traces
  2. RAG agent uses approximately 5 consolidated tools instead of the current 9 overlapping ones
  3. Answer quality is maintained or improved as measured by feedback ratings compared to the Phase 37 baseline
**Plans**: 2 plans

Plans:
- [ ] 38-01-PLAN.md -- RAG tool consolidation from 10 to 4, system prompt update, UI labels (SRCH-02)
- [ ] 38-02-PLAN.md -- LLM reranking with Gemini Flash Lite, trace logging, UI research step (SRCH-01)

### Phase 39: Council Intelligence
**Goal**: Users can understand each councillor's priorities, positions, and notable votes through AI-generated profiles grounded in evidence
**Depends on**: Phase 37 (topic taxonomy tables created in Phase 37 migrations)
**Requirements**: CNCL-01, CNCL-02, CNCL-03, CNCL-04
**Success Criteria** (what must be TRUE):
  1. Agenda items are classified into a hierarchical topic taxonomy extending the existing 8-topic system
  2. Each councillor has an AI-generated profile summary synthesizing their voting record, speaking patterns, and stance positions
  3. Key votes are algorithmically detected and displayed (minority position votes, close votes, ally breaks)
  4. Council member profile page shows at-a-glance stats card, AI summary, policy positions organized by topic, and a key votes section
**Plans**: 3 plans

Plans:
- [ ] 39-01-PLAN.md -- Topic taxonomy classification and agenda item backfill (CNCL-01)
- [ ] 39-02-PLAN.md -- Key vote detection algorithm and AI profile narrative generation (CNCL-02, CNCL-03)
- [ ] 39-03-PLAN.md -- Council member profile page redesign with new tabs (CNCL-04)

### Phase 40: UX Polish + Email
**Goal**: Users see financial data on relevant agenda items, know how to attend upcoming meetings, and receive better-designed email digests
**Depends on**: Phase 37 (summary cards and badges established)
**Requirements**: MTGX-03, MTGX-04, MAIL-01, MAIL-02
**Success Criteria** (what must be TRUE):
  1. Agenda items with financial cost or funding source data display it visually (amount and/or source)
  2. Upcoming meetings show attendance information including location, how to attend, and public input process
  3. Email digest has a mobile-friendly design with meeting summary section at the top
  4. Email digest includes upcoming meeting dates with attendance information
**Plans**: TBD

Plans:
- [ ] 40-01: Financial transparency and meeting attendance info
- [ ] 40-02: Email digest redesign

## Progress

**Execution Order:**
Phases execute in numeric order: 37 -> 38 -> 39 -> 40

Note: Phase 39 depends on Phase 37 (not 38) so could theoretically run in parallel with Phase 38, but sequential execution is simpler and lets RAG improvements stabilize first.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 37. Eval Foundation + Quick Wins | 2/2 | Complete    | 2026-03-06 | - |
| 38. RAG Intelligence | 2/2 | Complete    | 2026-03-06 | - |
| 39. Council Intelligence | 2/3 | In Progress|  | - |
| 40. UX Polish + Email | v1.7 | 0/2 | Not started | - |
