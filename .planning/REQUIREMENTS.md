# Requirements: ViewRoyal.ai v1.8 Esquimalt Launch

**Defined:** 2026-03-30
**Core Value:** Citizens can understand what their council decided, why, and who said what -- without attending meetings or reading hundreds of pages of PDFs.

## v1.8 Requirements

Requirements for Esquimalt municipality launch. Each maps to roadmap phases.

### Data Scoping

- [ ] **SCOPE-01**: All service layer queries filter by municipality_id so data never leaks between municipalities
- [ ] **SCOPE-02**: Hybrid search RPCs (keyword + vector) return results scoped to the current municipality only
- [ ] **SCOPE-03**: RAG agent answers questions using only the current municipality's data

### Scraper

- [ ] **SCRP-01**: InSite HTML scraper discovers meetings from Esquimalt's Legistar Calendar.aspx page
- [ ] **SCRP-02**: InSite HTML scraper extracts agenda items, attachments, and vote records from MeetingDetail.aspx
- [ ] **SCRP-03**: Scraper downloads agenda PDFs, minutes PDFs, and attachment documents
- [ ] **SCRP-04**: Scraper maps Esquimalt's body types (Council, COTW, APC, etc.) to organizations in the DB
- [ ] **SCRP-05**: Scraper extracts Granicus video URLs for meeting playback

### Routing

- [ ] **ROUT-01**: Worker resolves municipality from request hostname subdomain via DB lookup
- [ ] **ROUT-02**: esquimalt.viewroyal.ai subdomain configured in Cloudflare DNS and wrangler.toml
- [ ] **ROUT-03**: Requests to unknown subdomains return 404

### Branding

- [ ] **BRND-01**: Navbar, footer, page titles, and OG meta display the current municipality's name dynamically
- [ ] **BRND-02**: About page content adapts to current municipality's data sources and description

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Video

- **VID-01**: Granicus video download and local archiving
- **VID-02**: MLX diarization of Esquimalt meeting audio

### Data

- **DATA-01**: Historical backfill beyond 6-12 months of Esquimalt meetings
- **DATA-02**: Cross-municipality search spanning all ingested towns

### Infrastructure

- **INFRA-01**: Custom domains per municipality (e.g., esquimalt.civic.ai)
- **INFRA-02**: Municipality landing page at apex domain for discovery

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Legistar Web API scraper for Esquimalt | API confirmed unavailable (HTTP 500, "LegistarConnectionString not set up") |
| Granicus video diarization | Significant effort, not needed for document-only launch |
| RDOS / third municipality ingestion | One new municipality at a time; validate approach first |
| Cross-municipality search | Not useful at 2 municipalities |
| Custom domains per municipality | Cloudflare for Platforms is over-engineered at this scale |
| Per-municipality themes/favicons | Branding scope limited to text/content, not visual identity |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCOPE-01 | Phase 41 | Pending |
| SCOPE-02 | Phase 41 | Pending |
| SCOPE-03 | Phase 41 | Pending |
| SCRP-01 | Phase 42 | Pending |
| SCRP-02 | Phase 42 | Pending |
| SCRP-03 | Phase 42 | Pending |
| SCRP-04 | Phase 42 | Pending |
| SCRP-05 | Phase 42 | Pending |
| ROUT-01 | Phase 43 | Pending |
| ROUT-02 | Phase 43 | Pending |
| ROUT-03 | Phase 43 | Pending |
| BRND-01 | Phase 44 | Pending |
| BRND-02 | Phase 44 | Pending |

**Coverage:**
- v1.8 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-03-30*
*Last updated: 2026-03-30 after roadmap creation*
