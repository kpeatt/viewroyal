# Requirements: ViewRoyal.ai v1.7

**Defined:** 2026-03-03
**Core Value:** Citizens can understand what their council decided, why, and who said what — without attending meetings or reading hundreds of pages of PDFs.

## v1.7 Requirements

### Scraping

- [ ] **SCRP-01**: Pipeline can discover RDOS Board of Directors meetings from the Escribemeetings API by year
- [ ] **SCRP-02**: Pipeline downloads agenda and minutes PDFs via Escribemeetings FileStream URLs
- [ ] **SCRP-03**: Pipeline downloads HTML agendas from Escribemeetings Meeting.aspx pages

### Agenda

- [ ] **AGND-01**: Pipeline can parse structured HTML agendas from Escribemeetings into agenda items with section hierarchy (A, B, C, A.1)
- [ ] **AGND-02**: Pipeline falls back to PDF + Gemini AI refinement when HTML agenda is unavailable or parsing fails

### Video

- [ ] **TUBE-01**: Pipeline can list videos from a YouTube channel and build a date-indexed video map
- [ ] **TUBE-02**: Pipeline can download audio from YouTube videos via yt-dlp
- [ ] **TUBE-03**: Pipeline matches YouTube videos to meetings by date and title keywords

### Municipality

- [ ] **MUNI-01**: RDOS municipality record exists in the database with Escribemeetings source_config
- [ ] **MUNI-02**: Pipeline orchestrator routes to YouTube video client when source_config specifies YouTube

### Members

- [ ] **MEMB-01**: Pipeline can scrape current board members and 2022 election results from the RDOS website
- [ ] **MEMB-02**: Scraped members are imported into people, elections, and memberships tables

### Integration

- [ ] **INTG-01**: Running `--municipality rdos` executes the full 5-phase pipeline (scrape → download → diarize → ingest → embed) for 2025 RDOS Board meetings

## Future Requirements

### Multi-Municipality Web

- **WEB-01**: Web app can serve RDOS content alongside View Royal
- **WEB-02**: Users can switch between municipalities in the web app

### Additional Meeting Types

- **SCRP-04**: Pipeline can ingest additional Escribemeetings meeting types (Committees, Public Hearings)
- **SCRP-05**: Pipeline can ingest OSRHD Board of Directors meetings

### Additional Municipalities

- **MUNI-03**: Esquimalt ingestion via existing Legistar scraper

## Out of Scope

| Feature | Reason |
|---------|--------|
| Web app RDOS rendering | Pipeline-only milestone; web serving is a separate milestone |
| All RDOS meeting types | Starting with Board of Directors only to prove the pattern |
| Real-time Escribemeetings sync | Batch pipeline is sufficient for current needs |
| Escribemeetings scraper for other orgs | Build for RDOS first, generalize if needed later |
| YouTube live stream capture | Only archived recordings; live streaming is a different problem |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCRP-01 | Phase 32 | Pending |
| SCRP-02 | Phase 32 | Pending |
| SCRP-03 | Phase 32 | Pending |
| AGND-01 | Phase 33 | Pending |
| AGND-02 | Phase 33 | Pending |
| TUBE-01 | Phase 34 | Pending |
| TUBE-02 | Phase 34 | Pending |
| TUBE-03 | Phase 34 | Pending |
| MUNI-01 | Phase 32 | Pending |
| MUNI-02 | Phase 34 | Pending |
| MEMB-01 | Phase 35 | Pending |
| MEMB-02 | Phase 35 | Pending |
| INTG-01 | Phase 36 | Pending |

**Coverage:**
- v1.7 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 after roadmap creation*
