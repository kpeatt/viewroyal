---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: View Royal Intelligence
status: executing
stopped_at: Completed 39-03-PLAN.md
last_updated: "2026-03-13T05:27:08.636Z"
last_activity: 2026-03-12 -- Completed Phase 39 Plan 01 (Topic Classification)
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 7
  completed_plans: 7
  percent: 90
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-05)

**Core value:** Citizens can understand what their council decided, why, and who said what -- without attending meetings or reading hundreds of pages of PDFs.
**Current focus:** Phase 39: Council Intelligence

## Current Position

Phase: 39 (3 of 4 in v1.7) (Council Intelligence)
Plan: 1 of 3 in current phase
Status: executing
Last activity: 2026-03-12 -- Completed Phase 39 Plan 01 (Topic Classification)

Progress: [█████████░] 90%

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
| Phase 38 P01 | 6min | 2 tasks | 2 files |
| Phase 38 P02 | 3min | 2 tasks | 4 files |
| Phase 39 P01 | 4min | 2 tasks | 4 files |
| Phase 39 P02 | 5min | 2 tasks | 5 files |
| Phase 39 P03 | 5min | 3 tasks | 8 files |

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
- [Phase 38]: Consolidated 10 RAG tools to 4: search_council_records, search_documents, search_matters, get_person_info
- [Phase 38]: Eliminated get_current_date tool -- date injected into system prompt instead
- [Phase 38]: Used Gemini Flash Lite for LLM reranking of search results with flatten-rerank-unflatten pattern
- [Phase 39]: SQL-first topic classification via bulk RPC, Gemini fallback for unmapped categories
- [Phase 39]: Single Gemini call batches all distinct unmapped categories for efficiency
- [Phase 39]: Vote counts computed from votes table, not motions columns (data quality)
- [Phase 39]: Ally alignment threshold 80% with min 5 shared votes for key vote detection
- [Phase 39]: Composite score: minority*3 + closeness*2 + ally_breaks*1 for key vote ranking
- [Phase 39]: Profile page restructured to 6-tab layout with Profile as default tab
- [Phase 39]: General and Administration topics filtered from profile-level policy analysis

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
| 18 | Investigate why Mar 3 and Mar 10 videos missing | 2026-03-23 | -- | [18-investigate-why-mar-3-and-mar-10-videos-](./quick/18-investigate-why-mar-3-and-mar-10-videos-/) |
| 19 | Fix Mar 17 Public Hearing and Council meeting shared video bug | 2026-03-23 | 07e9cb57 | [19-fix-mar-17-public-hearing-and-council-me](./quick/19-fix-mar-17-public-hearing-and-council-me/) |

## Session Continuity

Last session: 2026-03-23T18:08:42Z
Stopped at: Completed quick task 19
Resume file: None

### Paused Work: Phase 7.1
Resume file: .planning/phases/07.1-upgrade-document-extraction-with-docling-and-gemini/.continue-here.md
Status: 309 meetings queued for re-extraction. 40,805 sections need embeddings. Waiting on Gemini quota.
