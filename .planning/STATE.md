# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** Citizens can understand what their council decided, why, and who said what -- without attending meetings or reading hundreds of pages of PDFs.
**Current focus:** Phase 13 - Notifications (v1.2 Pipeline Automation)

## Current Position

Phase: 13 of 14 (Notifications)
Plan: 1 of 1 in current phase
Status: Phase Complete
Last activity: 2026-02-20 - Completed 13-01 (Moshi push notifications for update-mode)

Progress: [████████████████████████░░░░░░] 34/34 plans complete (v1.0+v1.1+12+13), v1.2 in progress

## Performance Metrics

**Velocity:**
- Total plans completed: 31 (across v1.0 + v1.1)
- Average duration: 5.3min
- Total execution time: 4.42 hours

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
| Phase 12-update-detection P01 | 3min | 2 tasks | 2 files |
| Phase 12-update-detection P02 | 3min | 2 tasks | 4 files |
| Phase 13-notifications P01 | 2min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

All v1.0 and v1.1 decisions archived -- see PROJECT.md Key Decisions table and milestone archives.
- [Phase 12-update-detection]: Reused existing find_meetings_needing_reingest() from audit.py for document detection rather than building new scraper-based detection
- [Phase 12-update-detection]: Added meta dict field to MeetingChange to carry Vimeo video_data, avoiding redundant API calls in update-mode
- [Phase 13-notifications]: MOSHI_TOKEN env var is the sole on/off switch for notifications -- no CLI flag needed
- [Phase 13-notifications]: Notifications only fire in update-mode (run_update_mode), not check-mode (run_update_check)

### Pending Todos

1. **Connect R2 images to document viewer inline** (ui) -- Render R2-hosted document images within document sections in the web viewer

### Blockers/Concerns

- bootstrap.sql is out of date with 30+ applied migrations -- technical debt to track
- Email delivery requires external Resend configuration (documented in Phase 3 Plan 02)
- Phase 7.1 Gemini Batch API backfill paused -- waiting on quota

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
Completed quick-6 (README restructure). Phase 13 complete.
Resume: Execute Phase 14 (scheduling)

### Paused Work: Phase 7.1
Resume file: .planning/phases/07.1-upgrade-document-extraction-with-docling-and-gemini/.continue-here.md
Status: 309 meetings queued for re-extraction. 40,805 sections need embeddings. Waiting on Gemini quota.
