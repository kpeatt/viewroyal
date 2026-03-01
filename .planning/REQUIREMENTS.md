# Requirements: ViewRoyal.ai v1.6

**Defined:** 2026-02-28
**Core Value:** Citizens can understand what their council decided, why, and who said what — without attending meetings or reading hundreds of pages of PDFs.

## v1.6 Requirements

### Citations

- [ ] **CITE-01**: User sees grouped source badges per sentence (e.g., `[3 sources]`) instead of individual numbered references
- [ ] **CITE-02**: User can hover (desktop) or tap (mobile) a citation badge to see a source preview card with title, date, content snippet, and source link
- [ ] **CITE-03**: User can page through multiple sources within a single citation badge's preview card
- [ ] **CITE-04**: Document section source previews render markdown content (headings, lists, tables) instead of plain text

### Search Controls

- [ ] **SRCH-01**: User can filter keyword search results by time range (Any time, Past week, Past month, Past year)
- [ ] **SRCH-02**: User can filter keyword search results by content type (Motions, Documents, Statements, Transcripts)
- [ ] **SRCH-03**: User can sort keyword search results by relevance, newest first, or oldest first
- [ ] **SRCH-04**: Search filter selections persist in URL params so filtered views are shareable

### Agent

- [x] **AGNT-01**: Agent reasoning steps explain why it is choosing each search tool, not just which tool it is calling
- [x] **AGNT-02**: Tool result summaries show what was found and why it matters (count, relevance) instead of raw observation text
- [x] **AGNT-03**: Agent can search bylaws directly when questions ask about regulations, zoning rules, fees, or bylaw provisions

### Answer UX

- [ ] **ANSR-01**: Source panel is collapsed by default showing a count header (e.g., "16 sources used") with expand toggle
- [ ] **ANSR-02**: Follow-up suggestions appear as a prominent collapsible "Related" section with full-width pill buttons below the answer

## Future Requirements

### Search Enhancements
- **SRCH-05**: Custom date range picker for time filtering (from/to dates)
- **SRCH-06**: AI mode accepts explicit time constraints from the user
- **AGNT-04**: Agent can search by specific councillor name across all content types

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time search suggestions / autocomplete | Search volume doesn't justify prefix-search index complexity |
| Personalized search ranking | Privacy concerns in civic context; relevance should be equal for all citizens |
| Image/chart search | Document images not indexed for search; separate capability |
| Voice search | Browser speech-to-text unreliable; text input sufficient |
| AI answer regeneration | Civic information should be consistent; same question → same answer |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CITE-01 | Phase 30 | Pending |
| CITE-02 | Phase 30 | Pending |
| CITE-03 | Phase 30 | Pending |
| CITE-04 | Phase 30 | Pending |
| SRCH-01 | Phase 31 | Pending |
| SRCH-02 | Phase 31 | Pending |
| SRCH-03 | Phase 31 | Pending |
| SRCH-04 | Phase 31 | Pending |
| AGNT-01 | Phase 29 | Complete |
| AGNT-02 | Phase 29 | Complete |
| AGNT-03 | Phase 29 | Complete |
| ANSR-01 | Phase 31 | Pending |
| ANSR-02 | Phase 31 | Pending |

**Coverage:**
- v1.6 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 after roadmap creation*
