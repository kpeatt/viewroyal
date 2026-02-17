# Requirements: ViewRoyal.ai

**Defined:** 2026-02-16
**Core Value:** Citizens can understand what their council decided, why, and who said what — without attending meetings or reading hundreds of pages of PDFs.

## v1.1 Requirements

Requirements for v1.1 Deep Intelligence milestone. Each maps to roadmap phases.

### Document Intelligence

- [ ] **DOC-01**: Pipeline chunks PDF documents into sections using heading-based parsing with fixed-size fallback
- [ ] **DOC-02**: Document sections stored in `document_sections` table with per-section halfvec(384) embeddings
- [ ] **DOC-03**: Document sections have tsvector full-text search indexes
- [ ] **DOC-04**: Pipeline links document sections to corresponding agenda items via title matching
- [ ] **DOC-05**: Existing documents backfilled into sections with embeddings

### Search & Intelligence

- [ ] **SRCH-01**: Unified search page replaces separate Search and Ask pages with a single input
- [ ] **SRCH-02**: System detects query intent — keyword queries show results list, questions trigger AI answer with citations
- [ ] **SRCH-03**: Hybrid search RPC combines vector similarity and full-text search using Reciprocal Rank Fusion
- [ ] **SRCH-04**: Search covers document sections, key statements, transcript segments, and motions
- [ ] **SRCH-05**: User can ask follow-up questions that reference previous answers in the same session
- [ ] **SRCH-06**: Conversation history stored per session, limited to last 5 turns

### Council Profiling

- [ ] **PROF-01**: Councillor page shows detailed voting history with yea/nay/abstain indicators per motion
- [ ] **PROF-02**: Councillor page shows activity metrics (speaking time, attendance rate, motions proposed)
- [ ] **PROF-03**: Councillor page shows voting alignment with other council members
- [ ] **PROF-04**: AI-generated stance summaries per councillor per topic, grounded in meeting evidence
- [ ] **PROF-05**: Stance summaries include confidence scoring and links to source evidence
- [ ] **PROF-06**: User can compare two councillors side-by-side (voting record, stances, activity)

## Future Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Document Access

- **DACC-01**: PDF documents stored in cloud bucket (Supabase Storage or R2)
- **DACC-02**: Users can download original PDF documents from meeting pages
- **DACC-03**: Inline document viewer with official-document styling

### API

- **API-01**: Public API with OCD-compliant endpoints for meetings, people, votes
- **API-02**: API documentation and rate limiting

### Speaker Identification

- **SPKR-01**: Multi-sample voice fingerprints for improved speaker identification
- **SPKR-02**: Custom vocabulary for municipality-specific terms in diarization

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Second town onboarding (Esquimalt, RDOS) | Deferred until v1.1 intelligence layer is stable |
| Push notifications / native app | Overkill for current user base size |
| Social features (comments, reactions, forums) | Undermines official record credibility |
| Real-time live meeting notifications | Architecture mismatch (batch pipeline) |
| SMS notifications | Cost/compliance overhead unjustified at scale |
| Automated fact-checking of AI summaries | Source data is official council records — implies source might be wrong |
| Multi-model embedding comparison | Standardized on halfvec(384); switching adds complexity without benefit |
| Document OCR/image analysis | PyMuPDF extraction sufficient for digital-native PDFs |
| LangChain/LlamaIndex integration | Overkill for straightforward chunking and RAG patterns |
| External search engine (Elasticsearch) | pgvector + tsvector covers hybrid search natively |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOC-01 | — | Pending |
| DOC-02 | — | Pending |
| DOC-03 | — | Pending |
| DOC-04 | — | Pending |
| DOC-05 | — | Pending |
| SRCH-01 | — | Pending |
| SRCH-02 | — | Pending |
| SRCH-03 | — | Pending |
| SRCH-04 | — | Pending |
| SRCH-05 | — | Pending |
| SRCH-06 | — | Pending |
| PROF-01 | — | Pending |
| PROF-02 | — | Pending |
| PROF-03 | — | Pending |
| PROF-04 | — | Pending |
| PROF-05 | — | Pending |

**Coverage:**
- v1.1 requirements: 16 total
- Mapped to phases: 0
- Unmapped: 16 ⚠️

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-16 after initial definition*
