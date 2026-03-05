---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: RDOS Ingestion
status: planning
stopped_at: Completed quick-16 email alert fix (Resend domain verification pending)
last_updated: "2026-03-05T15:57:30.897Z"
last_activity: "2026-03-05 - Completed quick task 17: Update the github issues and projects with what we've finished and still need to do"
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** Citizens can understand what their council decided, why, and who said what -- without attending meetings or reading hundreds of pages of PDFs.
**Current focus:** Phase 32 - Municipality Foundation + Escribemeetings Scraper

## Current Position

Phase: 32 of 36 (Municipality Foundation + Escribemeetings Scraper)
Plan: 0 of 1 in current phase
Status: Ready to plan
Last activity: 2026-03-05 - Completed quick task 17: Update the github issues and projects with what we've finished and still need to do

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 76 (across v1.0-v1.6)
- Average duration: 4.0min
- Total execution time: ~6 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| (v1.7 not started) | - | - | - |

**Recent Trend:**
- Last 5 plans: 5min, 5min, 3min, 3min, 3min
- Trend: Stable

## Accumulated Context

### Decisions

All v1.0-v1.6 decisions archived -- see PROJECT.md Key Decisions table.
- [Phase quick-17]: Used Phase 7.x GitHub issue naming to match convention; deferred project board adds due to missing project write scope
- [Phase quick-16]: Deploy Edge Functions with --no-verify-jwt when project uses sb_secret_* API keys, with manual token validation inside the function

### Pending Todos

1. **Let users supply their own Gemini API key** (api) -- Allow power users to provide their own Gemini key for RAG queries
2. **Meeting Summary Cards** (web) -- AI-generated summary cards on meeting list pages [#4]
3. **Topic/Issue Clustering Page** (web) -- Group agenda items by topic across meetings [#6]
4. **Financial Transparency** (web) -- Surface cost data from agenda items [#8]
5. **Neighbourhood Relevance Filtering** (web) -- Filter by neighbourhood (needs DB column) [#9]
6. **Meeting Outcome Badges** (web) -- Visual badges for meeting outcomes [#10]
7. **Speaker Identification** (pipeline) -- Speaker fingerprinting beyond basic diarization [#27]
8. **RAG: LLM Reranking** (api) -- Gemini reranking of top-30 search candidates [#43]
9. **RAG: Redesigned Tool Set** (api) -- Consolidated RAG tools (search_discussions, search_decisions, etc.) [#44]
10. **RAG: Conversation Memory & Follow-ups** (api) -- KV session state, pronoun resolution, suggested follow-ups [#45]
11. **RAG: Observability & Quality Feedback** (api) -- Per-question telemetry, feedback buttons, quality dashboard [#46]
12. **Council Member: AI Profile Generation** (pipeline) -- Topic taxonomy, AI summaries, key vote detection, alignment analysis [#47]
13. **Council Member: Profile Page Redesign** (web) -- Redesigned profile page with at-a-glance cards, policy positions [#48]

### Blockers/Concerns

- bootstrap.sql is out of date with 30+ applied migrations -- technical debt to track
- Email delivery requires external Resend configuration
- Phase 7.1 Gemini Batch API backfill paused -- waiting on quota
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

Last session: 2026-03-05T15:57:30.896Z
Stopped at: Completed quick-16 email alert fix (Resend domain verification pending)
Resume file: None

### Paused Work: Phase 7.1
Resume file: .planning/phases/07.1-upgrade-document-extraction-with-docling-and-gemini/.continue-here.md
Status: 309 meetings queued for re-extraction. 40,805 sections need embeddings. Waiting on Gemini quota.
