# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Citizens can understand what their council decided, why, and who said what -- without attending meetings or reading hundreds of pages of PDFs.
**Current focus:** v1.3 Platform APIs -- Phase 15 (API Foundation)

## Current Position

Phase: 15 of 18 (API Foundation)
Plan: 1 of 2 in current phase
Status: Executing
Last activity: 2026-02-20 -- Completed 15-01-PLAN.md (API Foundation)

Progress: [████████████████████████████░░░░] ~80% overall (36/~45 plans across all milestones)

## Performance Metrics

**Velocity:**
- Total plans completed: 36 (across v1.0 + v1.1 + v1.2)
- Average duration: 4.7min
- Total execution time: ~4.65 hours

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
| 15-api-foundation | 1 | 6min | 6min |

## Accumulated Context

### Decisions

All v1.0-v1.2 decisions archived -- see PROJECT.md Key Decisions table.

New for v1.3:
- Hono router mounted in same Worker alongside React Router 7 (URL-prefix split at fetch level)
- chanfana for OpenAPI 3.1 generation, Zod v4 for schema validation
- SHA-256 key hashing with timing-safe comparison (not bcrypt -- keys are high-entropy)
- Cloudflare Workers Rate Limit binding for durable per-key rate limiting
- `/api/v1/*` prefix for public API; existing `/api/*` internal routes untouched
- [Phase 15]: Per-route municipality middleware pattern instead of wildcard catch-all to preserve NOT_FOUND for unregistered paths
- [Phase 15]: wrangler.toml [[ratelimits]] uses name field (not binding) per wrangler v4 schema

### Pending Todos

1. **Let users supply their own Gemini API key** (api) -- Allow power users to provide their own Gemini key for RAG queries

### Blockers/Concerns

- bootstrap.sql is out of date with 30+ applied migrations -- technical debt to track
- Email delivery requires external Resend configuration
- Phase 7.1 Gemini Batch API backfill paused -- waiting on quota
- OCD division ID for View Royal (`csd:5917034`) needs verification against canonical repo before Phase 17
- Rate Limit binding pricing needs verification before production launch

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

Last session: 2026-02-20
Stopped at: Completed 15-01-PLAN.md (API Foundation - Hono + health endpoint)
Resume file: None

### Paused Work: Phase 7.1
Resume file: .planning/phases/07.1-upgrade-document-extraction-with-docling-and-gemini/.continue-here.md
Status: 309 meetings queued for re-extraction. 40,805 sections need embeddings. Waiting on Gemini quota.
