# Requirements: ViewRoyal.ai

**Defined:** 2026-02-23
**Core Value:** Citizens can understand what their council decided, why, and who said what — without attending meetings or reading hundreds of pages of PDFs.

## v1.4 Requirements

Requirements for the Developer Documentation Portal milestone. Each maps to roadmap phases.

### Monorepo Infrastructure

- [x] **MONO-01**: Root pnpm-workspace.yaml configures apps/web, apps/docs, and apps/vimeo-proxy as workspace members
- [x] **MONO-02**: Existing apps/web and apps/vimeo-proxy build and deploy correctly after workspace migration

### Framework & Deployment

- [x] **FWRK-01**: Fumadocs site scaffolded in apps/docs with Next.js 16 and fumadocs v16
- [x] **FWRK-02**: Static export builds successfully (output: 'export')
- [x] **FWRK-03**: Docs site deployed to docs.viewroyal.ai via Cloudflare
- [x] **FWRK-04**: Built-in Orama search indexes all documentation pages
- [x] **FWRK-05**: Navigation sidebar auto-generated from content directory structure

### API Reference

- [ ] **AREF-01**: OpenAPI spec fetched at build time from live API with checked-in fallback
- [ ] **AREF-02**: API reference pages auto-generated from OpenAPI 3.1 spec grouped by tag (Meetings, People, Matters, Motions, Bylaws, Search, OCD, System)
- [ ] **AREF-03**: Interactive playground on API reference pages for live API requests
- [ ] **AREF-04**: Multi-language code examples (curl, JavaScript, Python) on reference pages

### Developer Guides

- [x] **GUID-01**: Getting Started guide: zero to first API call in under 5 minutes
- [x] **GUID-02**: Authentication guide: API key usage, headers, error responses, security best practices
- [x] **GUID-03**: Pagination and Filtering guide: cursor-based (v1) and page-based (OCD) with working examples
- [x] **GUID-04**: Error Handling guide: all error codes, response shapes, retry logic examples

### Reference Content

- [x] **REFC-01**: Data Model page with entity relationships and Mermaid ER diagram
- [x] **REFC-02**: OCD Standard Reference: entity mapping, when to use v1 vs OCD, OCD ID format
- [x] **REFC-03**: Changelog page with initial v1.0 API entry
- [x] **REFC-04**: Contribution guide: bug reports, feature requests, GitHub links

## Future Requirements

### Automation

- **AUTO-01**: GitHub Actions workflow to auto-rebuild docs when API spec changes
- **AUTO-02**: Automated OpenAPI spec diff detection and changelog entry generation

### Enhanced Features

- **ENHC-01**: Persistent language selection across all pages (fumadocs Tabs groupId + persist)
- **ENHC-02**: Hosted Postman/Insomnia collection import instructions

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-generated client SDKs | Developers can generate from OpenAPI spec themselves |
| Versioned documentation (multi-version) | Only one API version exists (v1) |
| User accounts / personalized docs | Adds auth complexity; docs should be static and public |
| Community features (comments, voting) | GitHub Issues is the appropriate channel |
| AI-powered doc search / chatbot | Main app has RAG search; Orama text search sufficient for docs |
| Multi-language docs (i18n) | API serves Canadian municipal data in English |
| Blog / tutorials section | Belongs on main site, not developer docs |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MONO-01 | Phase 19 | Complete |
| MONO-02 | Phase 19 | Complete |
| FWRK-01 | Phase 19 | Complete |
| FWRK-02 | Phase 19 | Complete |
| FWRK-03 | Phase 22 | Complete |
| FWRK-04 | Phase 22 | Complete |
| FWRK-05 | Phase 22 | Complete |
| AREF-01 | Phase 20 | Pending |
| AREF-02 | Phase 20 | Pending |
| AREF-03 | Phase 20 | Pending |
| AREF-04 | Phase 20 | Pending |
| GUID-01 | Phase 21 | Complete |
| GUID-02 | Phase 21 | Complete |
| GUID-03 | Phase 21 | Complete |
| GUID-04 | Phase 21 | Complete |
| REFC-01 | Phase 22 | Complete |
| REFC-02 | Phase 22 | Complete |
| REFC-03 | Phase 22 | Complete |
| REFC-04 | Phase 22 | Complete |

**Coverage:**
- v1.4 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-23 after roadmap creation*
