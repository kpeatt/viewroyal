# Roadmap: ViewRoyal.ai

## Milestones

- ✅ **v1.0 Land & Launch** -- Phases 1-6 (shipped 2026-02-17) -- [Archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Deep Intelligence** -- Phases 7-11 (shipped 2026-02-19) -- [Archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Pipeline Automation** -- Phases 12-14 (shipped 2026-02-20) -- [Archive](milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Platform APIs** -- Phases 15-18 (shipped 2026-02-22) -- [Archive](milestones/v1.3-ROADMAP.md)
- ✅ **v1.4 Developer Documentation Portal** -- Phases 19-24 (shipped 2026-02-25) -- [Archive](milestones/v1.4-ROADMAP.md)
- ✅ **v1.5 Document Experience** -- Phases 25-28 (shipped 2026-02-28) -- [Archive](milestones/v1.5-ROADMAP.md)
- ✅ **v1.6 Search Experience** -- Phases 29-31 (shipped 2026-03-01)
- 🚧 **v1.7 RDOS Ingestion** -- Phases 32-36 (in progress)

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

### 🚧 v1.7 RDOS Ingestion (In Progress)

**Milestone Goal:** Ingest RDOS Board of Directors meetings (2025+) through the full pipeline -- scrape from Escribemeetings, download YouTube video, diarize, AI refine, and embed -- proving multi-municipality ingestion works end-to-end.

- [ ] **Phase 32: Municipality Foundation + Escribemeetings Scraper** - RDOS database record and Escribemeetings API scraper for meeting discovery and document download
- [ ] **Phase 33: Agenda Parsing** - Structured HTML agenda parsing with PDF+AI fallback
- [ ] **Phase 34: YouTube Video Client** - YouTube channel listing, audio download, and orchestrator routing
- [ ] **Phase 35: Board Members** - Scrape RDOS board members and election data into people tables
- [ ] **Phase 36: End-to-End Integration** - Full 5-phase pipeline run for RDOS Board meetings

## Phase Details

### Phase 32: Municipality Foundation + Escribemeetings Scraper
**Goal**: Pipeline can discover RDOS meetings and download their documents from Escribemeetings
**Depends on**: Nothing (first phase of v1.7)
**Requirements**: MUNI-01, SCRP-01, SCRP-02, SCRP-03
**Success Criteria** (what must be TRUE):
  1. RDOS municipality record exists in the database with source_config specifying Escribemeetings API URL and YouTube channel
  2. Running the scraper for RDOS discovers 2025 Board of Directors meetings with correct dates, titles, and external IDs
  3. Agenda and minutes PDFs are downloaded to the local archive for discovered meetings
  4. HTML agendas are downloaded from Meeting.aspx pages for meetings that have them
**Plans**: TBD

Plans:
- [ ] 32-01: RDOS municipality record and Escribemeetings scraper

### Phase 33: Agenda Parsing
**Goal**: Pipeline can extract structured agenda items from Escribemeetings HTML with automatic fallback
**Depends on**: Phase 32 (needs HTML agendas and PDFs from scraper)
**Requirements**: AGND-01, AGND-02
**Success Criteria** (what must be TRUE):
  1. HTML agendas are parsed into agenda items preserving the Escribemeetings section hierarchy (A, B, C, A.1, A.2)
  2. When an HTML agenda is unavailable or parsing fails, the pipeline falls back to PDF extraction with Gemini AI refinement
  3. Parsed agenda items have correct titles, section numbers, and parent-child relationships
**Plans**: TBD

Plans:
- [ ] 33-01: HTML agenda parser and PDF+AI fallback

### Phase 34: YouTube Video Client
**Goal**: Pipeline can list, match, and download audio from YouTube videos for RDOS meetings
**Depends on**: Phase 32 (needs RDOS municipality record with YouTube channel config)
**Requirements**: TUBE-01, TUBE-02, TUBE-03, MUNI-02
**Success Criteria** (what must be TRUE):
  1. YouTubeClient implements get_video_map() returning a date-indexed map of available videos from the RDOS YouTube channel
  2. YouTubeClient implements download_video() that downloads audio via yt-dlp in the same format expected by the diarization pipeline
  3. Videos are matched to meetings by date and title keywords, handling cases where multiple videos exist for the same date
  4. Pipeline orchestrator routes to YouTubeClient when a municipality's source_config specifies video_source: "youtube"
**Plans**: TBD

Plans:
- [ ] 34-01: YouTubeClient with get_video_map and download_video
- [ ] 34-02: Orchestrator YouTube routing

### Phase 35: Board Members
**Goal**: RDOS board members and election history are populated in the database
**Depends on**: Phase 32 (needs RDOS municipality record)
**Requirements**: MEMB-01, MEMB-02
**Success Criteria** (what must be TRUE):
  1. Current RDOS board members are scraped from the RDOS website with names and roles
  2. 2022 election results are scraped and stored in the elections table
  3. Scraped members are inserted into the people table with memberships linking them to the RDOS organization
**Plans**: TBD

Plans:
- [ ] 35-01: RDOS board member and election scraper

### Phase 36: End-to-End Integration
**Goal**: Running --municipality rdos executes the complete pipeline and produces fully ingested RDOS Board meetings
**Depends on**: Phases 32, 33, 34, 35 (all prior phases must work)
**Requirements**: INTG-01
**Success Criteria** (what must be TRUE):
  1. Running `python main.py --municipality rdos` completes all 5 phases (scrape, download, diarize, ingest, embed) without errors
  2. After a pipeline run, RDOS Board meetings appear in the database with agenda items, documents, transcript segments, and embeddings
  3. Meetings with YouTube video have diarized transcript segments with speaker labels
**Plans**: TBD

Plans:
- [ ] 36-01: Integration testing and pipeline wiring

## Progress

**Execution Order:**
Phases execute in numeric order: 32 -> 33 -> 34 -> 35 -> 36

Note: Phases 33, 34, and 35 depend only on Phase 32 and could execute in parallel, but sequential execution is simpler for a solo developer.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 32. Municipality Foundation + Escribemeetings Scraper | v1.7 | 0/1 | Not started | - |
| 33. Agenda Parsing | v1.7 | 0/1 | Not started | - |
| 34. YouTube Video Client | v1.7 | 0/2 | Not started | - |
| 35. Board Members | v1.7 | 0/1 | Not started | - |
| 36. End-to-End Integration | v1.7 | 0/1 | Not started | - |
