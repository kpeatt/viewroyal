---
phase: quick-5
plan: 01
subsystem: pipeline
tags: [python, supabase, edge-functions, email-alerts, pipeline]

# Dependency graph
requires:
  - phase: 03-subscriptions-notifications
    provides: send-alerts Edge Function and subscription infrastructure
provides:
  - Pipeline automatically triggers send-alerts Edge Function after ingesting meetings with minutes/transcript
affects: [pipeline, send-alerts]

# Tech tracking
tech-stack:
  added: []
  patterns: [post-ingestion webhook trigger for downstream notifications]

key-files:
  created: []
  modified:
    - apps/pipeline/pipeline/orchestrator.py
    - apps/pipeline/pipeline/ingestion/ingester.py

key-decisions:
  - "Guard alert trigger on has_minutes or has_transcript to avoid unnecessary HTTP calls for agenda-only meetings"
  - "Use requests library directly in orchestrator (not the ingester's http_requests alias) for clarity"
  - "Wrap alert call in try/except so failures never crash the pipeline"

patterns-established:
  - "Post-ingestion webhook: after process_meeting succeeds, check result flags and trigger downstream services"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-02-20
---

# Quick Task 5: Fix Missing Email Alerts After Pipeline Ingestion

**Pipeline now automatically calls send-alerts Edge Function after ingesting meetings with substantive content (minutes or transcript)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-20T00:55:12Z
- **Completed:** 2026-02-20T00:57:07Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `_trigger_alerts` method to `Archiver` class that POSTs to `{SUPABASE_URL}/functions/v1/send-alerts`
- Modified `_ingest_meetings` to call alerts after each successful ingestion (all 3 code paths)
- Agenda-only meetings skip the alert call, saving unnecessary HTTP requests
- Added `meeting_id` to `process_meeting()` return dict so orchestrator can pass it to the Edge Function

## Task Commits

Each task was committed atomically:

1. **Task 1: Add send-alerts trigger to pipeline orchestrator** - `dc50f436` (feat)
2. **Task 2: Include meeting_id in process_meeting return value** - `6a108075` (feat)

## Files Created/Modified
- `apps/pipeline/pipeline/orchestrator.py` - Added `_trigger_alerts` method and alert calls after ingestion in `_ingest_meetings`
- `apps/pipeline/pipeline/ingestion/ingester.py` - Added `meeting_id` key to `process_meeting()` return dict

## Decisions Made
- Guard alert trigger on `has_minutes or has_transcript` to avoid calling Edge Function for agenda-only meetings (Edge Function would return "skipped" anyway but we save the HTTP roundtrip)
- Use `config.SUPABASE_SECRET_KEY or config.SUPABASE_KEY` for authorization, matching the existing guard pattern in `_ingest_meetings`
- 30-second timeout on the HTTP request to prevent blocking the pipeline

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. The send-alerts Edge Function and Resend integration were already configured in Phase 3.

## Next Phase Readiness
- Alert triggering is now automatic during pipeline runs
- Existing dedup in `alert_log` table prevents duplicate emails on re-ingestion
- Safe to test with `uv run python main.py --target {meeting_id}` -- Edge Function dedup prevents duplicate sends

---
*Quick Task: 5*
*Completed: 2026-02-20*
