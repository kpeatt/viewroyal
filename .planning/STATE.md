---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Document Experience
status: complete
last_updated: "2026-02-28T22:07:23.582Z"
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 7
  completed_plans: 7
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-26)

**Core value:** Citizens can understand what their council decided, why, and who said what -- without attending meetings or reading hundreds of pages of PDFs.
**Current focus:** Phase 28 - Document Navigation

## Current Position

Phase: 28 of 28 (Document Navigation)
Plan: 2 of 2 in current phase (COMPLETE)
Status: Phase 28 complete -- v1.5 milestone complete
Last activity: 2026-02-28 -- Completed 28-02 (Cross-Reference Detection)

Progress: ██████████ 100% (v1.5)

## Performance Metrics

**Velocity:**
- Total plans completed: 60 (across v1.0-v1.4)
- Average duration: 4.0min
- Total execution time: ~5.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-schema-foundation | 2 | 6min | 3min |
| 02-multi-tenancy | 1 | 8min | 8min |
| 03-subscriptions-notifications | 2 | 19min | 10min |
| 04-home-page-enhancements | 2 | 30min | 15min |
| 05-advanced-subscriptions | 3 | 25min | 8min |
| 06-gap-closure-cleanup | 1 | 3min | 3min |
| 07-document-intelligence | 3 | 15min | 5min |
| 07.1-upgrade-document-extraction | 2 | 8min | 4min |
| 08-unified-search-hybrid-rag | 5 | 12min | 2min |
| 09-ai-profiling-comparison | 4 | 25min | 6min |
| 10-add-better-test-suite | 5 | 26min | 5min |
| 11-gap-closure-gemini-fix | 1 | 3min | 3min |
| 12-update-detection | 2 | 6min | 3min |
| 13-notifications | 1 | 2min | 2min |
| 14-scheduled-automation | 2 | 4min | 2min |
| 15-api-foundation | 2 | 11min | 6min |
| 16-core-data-search-api | 4 | 18min | 5min |
| 17-ocd-interoperability | 6 | 12min | 2min |
| 18-documentation-key-management | 2 | 9min | 5min |
| 19-infrastructure-scaffolding | 2 | 5min | 3min |
| 20-openapi-integration-api-reference | 2 | 13min | 7min |
| 21-developer-guides | 2 | 5min | 3min |
| 22-reference-content-production | 2 | 13min | 7min |
| 23-cross-link-fix | 1 | 2min | 2min |
| 24-tech-debt-cleanup | 1 | 3min | 3min |
| Phase 26 P01 | 3min | 3 tasks | 6 files |
| 27-document-discoverability | 2 | 3min | 2min |
| 28-document-navigation P01 | 3min | 2 tasks | 4 files |
| 28-document-navigation P02 | 3min | 2 tasks | 5 files |

## Accumulated Context

### Decisions

All v1.0-v1.4 decisions archived -- see PROJECT.md Key Decisions table.
v1.5 decisions from research:

- Document viewer uses `marked` (not `react-markdown`) for SSR stability on Workers
- No new npm packages -- `@tailwindcss/typography`, `marked`, `lucide-react` already installed
- Meeting/matter loaders fetch document metadata only, never full section text
- Matter documents use batch `.in()` query, not per-item loops (N+1 prevention)
- DocumentTOC uses variant prop ("desktop"/"mobile") to avoid duplicate DOM rendering
- Scroll-spy rootMargin `0px 0px -80% 0px` restricts active zone to top 20% of viewport
- URL hash updates only on explicit TOC click, not during passive scrolling
- Cross-reference detection runs server-side in loader, not client-side
- Purple badge theme for bylaw references matches document-types.ts bylaw color
- Bylaws query added to existing Promise.all for zero additional latency

### Pending Todos

1. **Let users supply their own Gemini API key** (api) -- Allow power users to provide their own Gemini key for RAG queries
2. **Extract images before document extraction for Gemini linking** (pipeline) -- Pass extracted images to Gemini during content extraction so it can link them directly instead of positional matching
3. **Improve RAG search for specific item types** (api) -- Detect item-type intent from queries and filter/boost results by content type (bylaws, motions, correspondence, etc.)

### Blockers/Concerns

- bootstrap.sql is out of date with 30+ applied migrations -- technical debt to track
- Email delivery requires external Resend configuration
- Phase 7.1 Gemini Batch API backfill paused -- waiting on quota
- Rate Limit binding pricing needs verification before production launch
- [Phase 26]: Verify `updated_at` is in `getMeetingById` select string before building provenance
- [Phase 27]: Resolved -- chose parallel fetch with separate getDocumentsForAgendaItems function

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Change hero background to faded map view of View Royal with Ken Burns effect | 2026-02-18 | fb1d7909 | [1-change-the-hero-background-to-be-a-faded](./quick/1-change-the-hero-background-to-be-a-faded/) |
| 2 | Add beta banner to homepage header | 2026-02-18 | 77b17c18 | [2-add-beta-banner-to-homepage-header](./quick/2-add-beta-banner-to-homepage-header/) |
| 3 | Fix about page video hours showing 0 | 2026-02-18 | f8e1097d | [3-fix-about-page-video-hours-showing-0](./quick/3-fix-about-page-video-hours-showing-0/) |
| 4 | Dynamic OG meta tags per page | 2026-02-19 | 64256f7f | [4-dynamic-og-meta-tags-per-page](./quick/4-dynamic-og-meta-tags-per-page/) |
| 5 | Fix missing email alerts after pipeline ingestion | 2026-02-20 | dc50f436 | [5-bug-i-didn-t-get-an-email-sent-after-the](./quick/5-bug-i-didn-t-get-an-email-sent-after-the/) |
| 6 | Restructure root README as monorepo overview + pipeline README | 2026-02-20 | 18a6d11b | [6-update-main-readme-as-monorepo-readme-an](./quick/6-update-main-readme-as-monorepo-readme-an/) |
| 7 | Fix broken /docs/-prefixed links on docs.viewroyal.ai | 2026-02-26 | (redeploy) | [7-the-docs-site-has-a-lot-of-broken-links-](./quick/7-the-docs-site-has-a-lot-of-broken-links-/) |
| 8 | Add footer to site with GitHub and docs links | 2026-02-26 | fa26c100 | [8-add-a-footer-to-the-site](./quick/8-add-a-footer-to-the-site/) |
| 9 | Fix TypeError in update_detector.py .not_() call | 2026-02-26 | 24dbd665 | [9-fix-typeerror-in-update-detector-py-not-](./quick/9-fix-typeerror-in-update-detector-py-not-/) |
| 10 | Fix image alignment with document_section_id-based mapping | 2026-02-26 | 568cc358 | [10-fix-image-alignment-with-document-sectio](./quick/10-fix-image-alignment-with-document-sectio/) |
| 11 | Fix pipeline image-to-section matcher (skip same-page extras) + re-extract 3649 | 2026-02-26 | 1bf3d245 | [11-fix-pipeline-image-to-section-matcher-an](./quick/11-fix-pipeline-image-to-section-matcher-an/) |

## Session Continuity

Last session: 2026-02-28
Stopped at: Completed 28-02-PLAN.md (Cross-Reference Detection)
Resume file: None

### Paused Work: Phase 7.1
Resume file: .planning/phases/07.1-upgrade-document-extraction-with-docling-and-gemini/.continue-here.md
Status: 309 meetings queued for re-extraction. 40,805 sections need embeddings. Waiting on Gemini quota.
