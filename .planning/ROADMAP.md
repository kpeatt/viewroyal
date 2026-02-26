# Roadmap: ViewRoyal.ai

## Milestones

- ✅ **v1.0 Land & Launch** -- Phases 1-6 (shipped 2026-02-17) -- [Archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Deep Intelligence** -- Phases 7-11 (shipped 2026-02-19) -- [Archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Pipeline Automation** -- Phases 12-14 (shipped 2026-02-20) -- [Archive](milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Platform APIs** -- Phases 15-18 (shipped 2026-02-22) -- [Archive](milestones/v1.3-ROADMAP.md)
- ✅ **v1.4 Developer Documentation Portal** -- Phases 19-24 (shipped 2026-02-25) -- [Archive](milestones/v1.4-ROADMAP.md)
- 🚧 **v1.5 Document Experience** -- Phases 25-28 (in progress)

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

### v1.5 Document Experience

- [x] **Phase 25: Document Viewer Polish** - Polished typography, responsive tables, and title deduplication for the document viewer (completed 2026-02-26)
- [ ] **Phase 26: Meeting Provenance** - Source availability badges with links and last-updated timestamps on meeting pages
- [ ] **Phase 27: Document Discoverability** - Document links on agenda items and full document trails on matter pages
- [ ] **Phase 28: Document Navigation** - Table of contents sidebar and cross-references between related documents

## Phase Details

### Phase 25: Document Viewer Polish
**Goal**: Users see documents rendered with official-document quality typography and tables that work on every screen size
**Depends on**: Nothing (independent of all other v1.5 phases)
**Requirements**: DOCV-01, DOCV-02, DOCV-03
**Success Criteria** (what must be TRUE):
  1. User sees document headings, paragraphs, and lists with clear visual hierarchy and comfortable spacing -- not cramped blog-style formatting
  2. User can scroll wide tables horizontally on mobile without the entire page shifting sideways
  3. User does not see the document title repeated when the first section heading matches it
**Plans**: TBD

Plans:
- [ ] 25-01: TBD
- [ ] 25-02: TBD

### Phase 26: Meeting Provenance
**Goal**: Users can see at a glance what sources a meeting was built from and when data was last updated
**Depends on**: Nothing (independent of all other v1.5 phases)
**Requirements**: PROV-01, PROV-02, PROV-03
**Success Criteria** (what must be TRUE):
  1. User sees distinct badges for Agenda, Minutes, and Video on the meeting detail page indicating which sources are available
  2. User can click any provenance badge to navigate directly to the original source (CivicWeb PDF or Vimeo video)
  3. User sees a "last updated" timestamp on the meeting page showing when the data was most recently refreshed
**Plans**: TBD

Plans:
- [ ] 26-01: TBD

### Phase 27: Document Discoverability
**Goal**: Users can find and follow document trails from both individual agenda items and the full matter timeline
**Depends on**: Phase 25 (document viewer should be polished before linking to it)
**Requirements**: DOCL-01, DOCL-02
**Success Criteria** (what must be TRUE):
  1. User sees linked document sections on each agenda item in the meeting detail page with a link to the full document viewer
  2. User sees all related documents on the matter detail page grouped by meeting date with document type and title
  3. User can follow a document trail for a matter (e.g., a bylaw or rezoning) across every meeting where it appeared
**Plans**: TBD

Plans:
- [ ] 27-01: TBD
- [ ] 27-02: TBD

### Phase 28: Document Navigation
**Goal**: Users can navigate long documents efficiently and discover related documents across the platform
**Depends on**: Phase 25, Phase 27 (needs polished viewer and matter document service)
**Requirements**: DOCV-04, DOCL-03
**Success Criteria** (what must be TRUE):
  1. User sees a table of contents sidebar for long documents that highlights the current section while scrolling
  2. User sees cross-references between related documents (e.g., a staff report that references a bylaw links to that bylaw's document)
  3. User can jump to any section in a long document via the TOC without losing their place
**Plans**: TBD

Plans:
- [ ] 28-01: TBD
- [ ] 28-02: TBD

## Progress

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
| 19. Infrastructure & Scaffolding | v1.4 | 2/2 | Complete | 2026-02-23 |
| 20. OpenAPI Integration & API Reference | v1.4 | 2/2 | Complete | 2026-02-23 |
| 21. Developer Guides | v1.4 | 2/2 | Complete | 2026-02-24 |
| 22. Reference Content & Production | v1.4 | 2/2 | Complete | 2026-02-24 |
| 23. Cross-Link Fix & Cleanup | v1.4 | 1/1 | Complete | 2026-02-25 |
| 24. Tech Debt Cleanup | v1.4 | 1/1 | Complete | 2026-02-25 |
| 25. Document Viewer Polish | 2/2 | Complete    | 2026-02-26 | - |
| 26. Meeting Provenance | v1.5 | 0/? | Not started | - |
| 27. Document Discoverability | v1.5 | 0/? | Not started | - |
| 28. Document Navigation | v1.5 | 0/? | Not started | - |
