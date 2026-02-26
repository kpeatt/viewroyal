# Requirements: ViewRoyal.ai

**Defined:** 2026-02-26
**Core Value:** Citizens can understand what their council decided, why, and who said what — without attending meetings or reading hundreds of pages of PDFs.

## v1.5 Requirements

Requirements for Document Experience milestone. Each maps to roadmap phases.

### Document Viewer

- [x] **DOCV-01**: User sees document sections with polished typography — proper font sizes, line heights, and spacing between headings, paragraphs, and lists
- [x] **DOCV-02**: User can view documents with wide tables on mobile without horizontal page overflow (tables scroll independently)
- [x] **DOCV-03**: User does not see duplicate document titles when the first section heading matches the document title
- [ ] **DOCV-04**: User sees a table of contents sidebar for long documents that highlights the current section while scrolling

### Document Linking

- [ ] **DOCL-01**: User sees linked document sections on each agenda item in the meeting detail page with links to the full document viewer
- [ ] **DOCL-02**: User sees all related documents across every meeting on the matter detail page
- [ ] **DOCL-03**: User sees cross-references between related documents (e.g., a staff report references a bylaw)

### Meeting Provenance

- [ ] **PROV-01**: User sees source badges (Agenda, Minutes, Video) on the meeting overview indicating which original sources were used
- [ ] **PROV-02**: User can click provenance badges to navigate to the original source (CivicWeb PDF, Vimeo video)
- [ ] **PROV-03**: User sees when the meeting data was last updated

## Future Requirements

### Document Viewer Enhancements

- **DOCV-05**: User can deep-link to a specific section within a document
- **DOCV-06**: User sees a document completeness indicator showing available vs expected sections

### Provenance Enhancements

- **PROV-04**: User sees per-agenda-item source indicators showing which items have documents/video

## Out of Scope

| Feature | Reason |
|---------|--------|
| Inline PDF viewer (PDF.js) | Source PDFs already linked; rendered sections are more readable and searchable |
| Document annotation/commenting | Undermines official record credibility; social features explicitly excluded |
| Document version diff | Would require tracking document versions over time; pipeline doesn't store history |
| Document download/export | Source PDFs already available via CivicWeb links |
| Per-document search | Browser Ctrl+F sufficient; hybrid search already covers documents |
| Live AI document explain | RAG Q&A already answers questions about document content |
| Print layout styling | Low-value for a civic web app; browser print is sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOCV-01 | Phase 25 | Pending |
| DOCV-02 | Phase 25 | Pending |
| DOCV-03 | Phase 25 | Pending |
| DOCV-04 | Phase 28 | Pending |
| DOCL-01 | Phase 27 | Pending |
| DOCL-02 | Phase 27 | Pending |
| DOCL-03 | Phase 28 | Pending |
| PROV-01 | Phase 26 | Pending |
| PROV-02 | Phase 26 | Pending |
| PROV-03 | Phase 26 | Pending |

**Coverage:**
- v1.5 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-26 after roadmap creation*
