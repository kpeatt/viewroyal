---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: View Royal Intelligence
status: phase-complete
stopped_at: Phase 37 complete - all plans done
last_updated: "2026-03-06T03:18:00Z"
last_activity: 2026-03-06 -- Completed Phase 37 Plan 02 (motion badges + meeting cards)
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-05)

**Core value:** Citizens can understand what their council decided, why, and who said what -- without attending meetings or reading hundreds of pages of PDFs.
**Current focus:** Phase 37: Eval Foundation + Quick Wins

## Current Position

Phase: 37 (1 of 4 in v1.7) (Eval Foundation + Quick Wins)
Plan: 2 of 2 in current phase
Status: Phase 37 complete
Last activity: 2026-03-06 -- Completed Phase 37 Plan 02 (motion badges + enhanced meeting cards)

Progress: [██░░░░░░░░] 25%

## Performance Metrics

**Velocity:**
- Total plans completed: 78 (across v1.0-v1.7)
- Average duration: 4.0min
- Total execution time: ~6 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 37-01 | 1 | 5min | 5min |

**Recent Trend:**
- Last 5 plans: 5min, 5min, 3min, 3min, 3min
- Trend: Stable

## Accumulated Context

### Decisions

All v1.0-v1.6 decisions archived -- see PROJECT.md Key Decisions table.
- RDOS ingestion deferred from v1.7 to v1.8 (phases 32-36 preserved, will execute after v1.7)
- v1.7 refocused on View Royal Intelligence: search quality, council profiles, meeting UX, email digests
- RAG observability (Phase 37) must precede RAG improvements (Phase 38) for measurement baseline
- Topic taxonomy (Phase 39) extends existing 8-topic system, does not replace it
- normalizeMotionResult is canonical way to compare motion results (handles all 11 DB values + typos)
- MotionOutcomeBadge replaces all inline badge logic for motion outcomes
- Fire-and-forget trace insert to avoid blocking SSE stream (Phase 37-01)
- Dual-write PostHog + Supabase rag_traces for gradual migration path (Phase 37-01)
- Anonymous feedback via client_ip with partial unique indexes for upsert (Phase 37-01)

### Pending Todos

1. **Let users supply their own Gemini API key** (api)
2. **Speaker Identification** (pipeline) -- deferred to v1.8+
3. **Neighbourhood Relevance Filtering** (web) -- deferred to v1.8+ (needs DB column + geocoding)

### Blockers/Concerns

- bootstrap.sql is out of date with 30+ applied migrations
- Email delivery requires external Resend configuration (affects MAIL-01, MAIL-02)
- Phase 7.1 Gemini Batch API backfill paused -- waiting on quota
- Financial cost field population needs DB verification before MTGX-03 UI work
- Gemini cost projection: reranking + classification + profiling add new API consumers

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
| 12 | Fix half-ingested meetings: self-healing check + GEMINI_API_KEY warning | 2026-03-01 | c7dbe9b0 | [12-investigate-and-fix-missing-agenda-items](./quick/12-investigate-and-fix-missing-agenda-items/) |
| 13 | Sentence-level transcript sub-segments for CC overlay and transcript display | 2026-03-02 | 70f4d078 | [13-use-transcript-segments-for-transcript-c](./quick/13-use-transcript-segments-for-transcript-c/) |
| 14 | Add PostHog analytics with automatic pageview tracking | 2026-03-03 | 56664d8c | [14-add-posthog-or-similar-analytics](./quick/14-add-posthog-or-similar-analytics/) |
| 15 | R2 orphan cleanup script (dry-run + delete mode) | 2026-03-03 | adbc5fe6 | [15-clean-up-r2-object-storage](./quick/15-clean-up-r2-object-storage/) |
| 16 | Fix missing email alert: Edge Function JWT auth + Resend domain | 2026-03-05 | 5079802b | [16-i-didnt-get-an-email-summary-for-the-mos](./quick/16-i-didnt-get-an-email-summary-for-the-mos/) |
| 17 | Sync GitHub issues and project board with shipped milestones + v1.7 tracking | 2026-03-05 | d17b012d | [17-update-the-github-issues-and-projects-wi](./quick/17-update-the-github-issues-and-projects-wi/) |

## Session Continuity

Last session: 2026-03-06T03:18:00Z
Stopped at: Phase 37 complete - ready for Phase 38
Resume file: .planning/phases/37-eval-foundation-quick-wins/37-02-SUMMARY.md

### Paused Work: Phase 7.1
Resume file: .planning/phases/07.1-upgrade-document-extraction-with-docling-and-gemini/.continue-here.md
Status: 309 meetings queued for re-extraction. 40,805 sections need embeddings. Waiting on Gemini quota.
