# Requirements: ViewRoyal.ai v1.7

**Defined:** 2026-03-05
**Core Value:** Citizens can understand what their council decided, why, and who said what -- without attending meetings or reading hundreds of pages of PDFs.

## v1.7 Requirements

Requirements for v1.7 View Royal Intelligence. Each maps to roadmap phases.

### RAG & Search

- [x] **SRCH-01**: Search results are reranked by LLM relevance scoring before display
- [x] **SRCH-02**: RAG agent uses 5 consolidated tools instead of 9 overlapping ones
- [x] **SRCH-03**: User can give thumbs up/down feedback on AI answers
- [x] **SRCH-04**: RAG traces (query, tools used, latency, sources) are logged for analysis

### Council Intelligence

- [x] **CNCL-01**: Agenda items are classified into a hierarchical topic taxonomy
- [x] **CNCL-02**: AI-generated profile summaries synthesize voting, speaking, and stance data per councillor
- [x] **CNCL-03**: Key votes are algorithmically detected (minority position, close votes, ally breaks)
- [x] **CNCL-04**: Profile page shows at-a-glance stats, AI summary, policy positions by topic, and key votes

### Meeting UX

- [x] **MTGX-01**: Meeting list shows summary cards with key decisions and topic indicators
- [x] **MTGX-02**: Motion outcomes display as colored badges (passed/defeated/tabled/deferred)
- [x] **MTGX-03**: Agenda items with financial cost/funding data show it visually
- [x] **MTGX-04**: Upcoming meetings show attendance info (how to attend, location, public input process)

### Email & Notifications

- [x] **MAIL-01**: Email digest has improved mobile-friendly design with meeting summary at top
- [x] **MAIL-02**: Email includes upcoming meeting dates with attendance information

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Pipeline Improvements (v1.8+)

- **PIPE-01**: Speaker fingerprinting enables cross-meeting speaker identification
- **PIPE-02**: Neighbourhood filtering assigns agenda items to neighbourhoods via geocoding

### RDOS Ingestion (v1.8)

- **SCRP-01**: Pipeline can discover RDOS Board meetings from Escribemeetings API
- **SCRP-02**: Pipeline downloads agenda and minutes PDFs via Escribemeetings
- **SCRP-03**: Pipeline downloads HTML agendas from Escribemeetings
- **AGND-01**: HTML agenda parser for Escribemeetings with PDF+AI fallback
- **AGND-02**: Agenda parsing falls back to PDF + Gemini when HTML unavailable
- **TUBE-01**: YouTube channel video listing and date-indexed map
- **TUBE-02**: YouTube audio download via yt-dlp
- **TUBE-03**: YouTube video-to-meeting matching by date and title
- **MUNI-01**: RDOS municipality record with Escribemeetings source_config
- **MUNI-02**: Orchestrator YouTube routing based on source_config
- **MEMB-01**: RDOS board member and election scraping
- **MEMB-02**: Members imported into people, elections, memberships tables
- **INTG-01**: End-to-end RDOS pipeline run with --municipality rdos

### RAG Enhancements (future)

- **RAGX-01**: KV-based persistent conversation memory across page refreshes
- **RAGX-02**: Conversation memory summarization for long sessions

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-municipality ingestion/display | v1.8 scope (RDOS deferred) |
| Push/SMS notifications | Overkill for current user base size |
| Social features (comments, forums) | Undermines official record credibility |
| Real-time meeting join links | Batch pipeline cannot detect in-progress meetings |
| Sentiment analysis badges | Civic tone analysis is misleading and reductive |
| Full budget explorer | No pipeline data source for budget documents |
| OAuth providers | Magic links are lower friction for civic audience |
| Speaker fingerprinting | Deferred to v1.8+ (regression risk, needs validation) |
| Neighbourhood filtering | Deferred to v1.8+ (DB column doesn't exist, needs geocoding pipeline) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SRCH-01 | Phase 38 | Complete |
| SRCH-02 | Phase 38 | Complete |
| SRCH-03 | Phase 37 | Complete |
| SRCH-04 | Phase 37 | Complete |
| CNCL-01 | Phase 39 | Complete |
| CNCL-02 | Phase 39 | Complete |
| CNCL-03 | Phase 39 | Complete |
| CNCL-04 | Phase 39 | Complete |
| MTGX-01 | Phase 37 | Complete |
| MTGX-02 | Phase 37 | Complete |
| MTGX-03 | Phase 40 | Complete |
| MTGX-04 | Phase 40 | Complete |
| MAIL-01 | Phase 40 | Complete |
| MAIL-02 | Phase 40 | Complete |

**Coverage:**
- v1.7 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-03-05 after roadmap creation (phases 37-40)*
