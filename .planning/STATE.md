# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** Citizens can understand what their council decided, why, and who said what -- without attending meetings or reading hundreds of pages of PDFs.
**Current focus:** v1.4 Developer Documentation Portal -- Phase 19 Infrastructure & Scaffolding

## Current Position

Phase: 19 of 22 (Infrastructure & Scaffolding)
Plan: 2 of 2 in current phase
Status: Phase 19 complete
Last activity: 2026-02-23 -- Plan 19-02 complete (fumadocs scaffold)

Progress: [█████████░░░░░░░░░░░░░░░░░░░░░░░░░░] 25% (v1.4)

## Performance Metrics

**Velocity:**
- Total plans completed: 52 (across v1.0 + v1.1 + v1.2 + v1.3 + v1.4)
- Average duration: 4.1min
- Total execution time: ~5.2 hours

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

## Accumulated Context

### Decisions

All v1.0-v1.3 decisions archived -- see PROJECT.md Key Decisions table.

New for v1.4:
- fumadocs v16 + Next.js 16 with `output: 'export'` for static site (no OpenNext/Workers runtime)
- Cloudflare Workers static assets via `[assets]` directive (not Cloudflare Pages -- deprecated)
- `apps/docs/` fully independent in pnpm workspace (avoids workers-sdk #10941 cross-install)
- `generateFiles()` for OpenAPI MDX generation (not `openapiSource()` -- no RSC server in static export)
- Prebuild script fetches live spec with committed fallback for offline builds

### Pending Todos

1. **Let users supply their own Gemini API key** (api) -- Allow power users to provide their own Gemini key for RAG queries

### Blockers/Concerns

- bootstrap.sql is out of date with 30+ applied migrations -- technical debt to track
- Email delivery requires external Resend configuration
- Phase 7.1 Gemini Batch API backfill paused -- waiting on quota
- Rate Limit binding pricing needs verification before production launch
- `generateFiles()` exact invocation needs spike validation at start of Phase 20

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Change hero background to faded map view of View Royal with Ken Burns effect | 2026-02-18 | fb1d7909 | [1-change-the-hero-background-to-be-a-faded](./quick/1-change-the-hero-background-to-be-a-faded/) |
| 2 | Add beta banner to homepage header | 2026-02-18 | 77b17c18 | [2-add-beta-banner-to-homepage-header](./quick/2-add-beta-banner-to-homepage-header/) |
| 3 | Fix about page video hours showing 0 | 2026-02-18 | f8e1097d | [3-fix-about-page-video-hours-showing-0](./quick/3-fix-about-page-video-hours-showing-0/) |
| 4 | Dynamic OG meta tags per page | 2026-02-19 | 64256f7f | [4-dynamic-og-meta-tags-per-page](./quick/4-dynamic-og-meta-tags-per-page/) |
| 5 | Fix missing email alerts after pipeline ingestion | 2026-02-20 | dc50f436 | [5-bug-i-didn-t-get-an-email-sent-after-the](./quick/5-bug-i-didn-t-get-an-email-sent-after-the/) |
| 6 | Restructure root README as monorepo overview + pipeline README | 2026-02-20 | 18a6d11b | [6-update-main-readme-as-monorepo-readme-an](./quick/6-update-main-readme-as-monorepo-readme-an/) |

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 19-02-PLAN.md (fumadocs scaffold), Phase 19 complete
Resume file: None

### Paused Work: Phase 7.1
Resume file: .planning/phases/07.1-upgrade-document-extraction-with-docling-and-gemini/.continue-here.md
Status: 309 meetings queued for re-extraction. 40,805 sections need embeddings. Waiting on Gemini quota.
