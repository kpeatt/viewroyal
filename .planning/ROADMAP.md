# Roadmap: ViewRoyal.ai

## Milestones

- ✅ **v1.0 Land & Launch** -- Phases 1-6 (shipped 2026-02-17) -- [Archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Deep Intelligence** -- Phases 7-11 (shipped 2026-02-19) -- [Archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Pipeline Automation** -- Phases 12-14 (shipped 2026-02-20) -- [Archive](milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Platform APIs** -- Phases 15-18 (shipped 2026-02-22) -- [Archive](milestones/v1.3-ROADMAP.md)
- ✅ **v1.4 Developer Documentation Portal** -- Phases 19-24 (shipped 2026-02-25) -- [Archive](milestones/v1.4-ROADMAP.md)
- ✅ **v1.5 Document Experience** -- Phases 25-28 (shipped 2026-02-28) -- [Archive](milestones/v1.5-ROADMAP.md)
- 🚧 **v1.6 Search Experience** -- Phases 29-31 (in progress)

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

### 🚧 v1.6 Search Experience (In Progress)

**Milestone Goal:** Transform search and RAG into a polished, Perplexity/Kagi-inspired experience with better agent transparency, citation UX, search controls, and follow-up emphasis.

- [x] **Phase 29: Backend Foundation** - Bylaw search tool, enriched source objects, and agent reasoning improvements (completed 2026-03-01)
- [ ] **Phase 30: Citation UX** - Grouped citation badges with source preview cards and markdown rendering
- [ ] **Phase 31: Search Controls + Polish** - Time/type filters, URL state, collapsed source panel, follow-up redesign

## Phase Details

### Phase 29: Backend Foundation
**Goal**: Agent provides transparent reasoning, structured tool summaries, and can search bylaws directly
**Depends on**: Nothing (first phase of v1.6)
**Requirements**: AGNT-01, AGNT-02, AGNT-03
**Success Criteria** (what must be TRUE):
  1. When the agent reasons about a query, the thinking display explains WHY it chose each search tool (not just the tool name)
  2. Tool result summaries show count and relevance context (e.g., "Found 4 motions about parking fees from 2024-2025") instead of raw observation text
  3. When a user asks about zoning rules, fees, or bylaw provisions, the agent searches bylaws directly and returns relevant bylaw content in the answer
**Plans**: TBD

Plans:
- [ ] 29-01: Bylaw search tool + RPC
- [ ] 29-02: Agent reasoning prompts and tool summaries

### Phase 30: Citation UX
**Goal**: Users can trace every claim in an AI answer back to specific sources through inline badges with rich preview cards
**Depends on**: Phase 29 (enriched source objects needed for preview cards)
**Requirements**: CITE-01, CITE-02, CITE-03, CITE-04
**Success Criteria** (what must be TRUE):
  1. AI answer text shows grouped citation badges (e.g., "[3 sources]") inline per sentence instead of individual numbered references
  2. Hovering a citation badge on desktop shows a preview card with source title, date, content snippet, and link to the source page
  3. Tapping a citation badge on mobile opens a bottom sheet with the same source preview information
  4. When a citation badge references multiple sources, the user can page through them within the preview card
  5. Document section previews in source cards render markdown (headings, lists, tables) instead of plain text
**Plans**: TBD

Plans:
- [ ] 30-01: SSE protocol and citation parser
- [ ] 30-02: CitationBadge, SourcePreviewCard, and SourcePager components
- [ ] 30-03: Mobile variant and markdown preview rendering

### Phase 31: Search Controls + Polish
**Goal**: Users can filter and sort keyword search results, share filtered views, and navigate AI answers with a cleaner layout
**Depends on**: Phase 30 (builds on component patterns established in citation work)
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, ANSR-01, ANSR-02
**Success Criteria** (what must be TRUE):
  1. User can filter keyword search results by time range (Any time, Past week, Past month, Past year) and by content type (Motions, Documents, Statements, Transcripts)
  2. User can sort keyword search results by relevance, newest first, or oldest first
  3. Changing filters or sort updates the URL so the filtered view can be shared or bookmarked
  4. Source panel below AI answers is collapsed by default showing a count header (e.g., "16 sources used") with an expand toggle
  5. Follow-up suggestions appear as a prominent collapsible "Related" section with full-width pill buttons below the answer
**Plans**: TBD

Plans:
- [ ] 31-01: SearchFilters component with URL param state
- [ ] 31-02: Source panel collapse and follow-up redesign

## Progress

**Execution Order:**
Phases execute in numeric order: 29 -> 30 -> 31

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 29. Backend Foundation | v1.6 | Complete    | 2026-03-01 | - |
| 30. Citation UX | v1.6 | 1/3 | In progress | - |
| 31. Search Controls + Polish | v1.6 | 0/2 | Not started | - |
