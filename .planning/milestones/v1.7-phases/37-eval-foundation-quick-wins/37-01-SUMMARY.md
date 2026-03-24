---
phase: 37-eval-foundation-quick-wins
plan: 01
subsystem: api, database, ui
tags: [supabase, rag, feedback, sse, react, lucide-react]

# Dependency graph
requires: []
provides:
  - rag_traces table for logging every AI answer with query, answer, latency, tools, sources
  - rag_feedback table with upsert-friendly unique partial indexes
  - trace_id SSE event propagation from server to client
  - feedback buttons UI (thumbs up/down) in AiAnswer component
  - POST /api/feedback endpoint with validation and rate limiting
  - CARRRIED typo fix migration
affects: [38-search-quality-boost]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget Supabase insert pattern for trace logging"
    - "SSE event propagation for trace_id from server to client"
    - "Feedback upsert with partial unique indexes (anon vs authed)"

key-files:
  created:
    - supabase/migrations/37-01-rag-traces-and-feedback.sql
    - supabase/migrations/37-01-fix-carrried-typo.sql
    - apps/web/app/routes/api.feedback.tsx
  modified:
    - apps/web/app/services/rag.server.ts
    - apps/web/app/routes/api.ask.tsx
    - apps/web/app/components/search/ai-answer.tsx
    - apps/web/app/routes/search.tsx

key-decisions:
  - "Fire-and-forget trace insert (no await) to avoid blocking SSE stream"
  - "Dual-write: PostHog + Supabase rag_traces for gradual migration path"
  - "Anonymous feedback via client_ip with partial unique index for upsert"

patterns-established:
  - "Trace ID as cross-reference between PostHog and Supabase"
  - "FeedbackButtons sub-component pattern for best-effort UI feedback"

requirements-completed: [SRCH-03, SRCH-04]

# Metrics
duration: 5min
completed: 2026-03-06
---

# Phase 37 Plan 01: RAG Traces and Feedback Summary

**RAG trace logging with rag_traces/rag_feedback tables, trace_id SSE propagation, and thumbs up/down feedback buttons in AiAnswer**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T03:09:37Z
- **Completed:** 2026-03-06T03:14:15Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Every AI answer now generates a rag_traces row with query, answer, latency, tool calls, source count, and sources
- Users can rate answers with thumbs up/down, with optional comment field on thumbs down
- Trace ID propagates from server to client via SSE stream, enabling feedback linkage
- CARRRIED typo fixed in motions table via migration

## Task Commits

Each task was committed atomically:

1. **Task 1: Database migrations and trace logging in api.ask.tsx** - `89f8e656` (feat)
2. **Task 2: Feedback API endpoint and AiAnswer feedback buttons** - `b8dd1d25` (feat)

## Files Created/Modified
- `supabase/migrations/37-01-rag-traces-and-feedback.sql` - rag_traces and rag_feedback tables with RLS and indexes
- `supabase/migrations/37-01-fix-carrried-typo.sql` - Fix CARRRIED typo in motions table
- `apps/web/app/services/rag.server.ts` - Added trace_id variant to AgentEvent type
- `apps/web/app/routes/api.ask.tsx` - Trace ID generation, accumulation, fire-and-forget insert, SSE emit
- `apps/web/app/routes/api.feedback.tsx` - POST endpoint with validation, rate limiting, upsert
- `apps/web/app/components/search/ai-answer.tsx` - FeedbackButtons component with thumbs up/down and comment
- `apps/web/app/routes/search.tsx` - Capture trace_id SSE event and pass to AiAnswer

## Decisions Made
- Fire-and-forget trace insert (using `.then()` for error logging) to avoid blocking SSE stream delivery
- Dual-write to PostHog and Supabase rag_traces, using same traceId as cross-reference
- Anonymous feedback via client_ip with partial unique indexes for upsert (separate indexes for anon vs authenticated users)
- Used inline type for api.feedback action args instead of generated Route types (typegen doesn't auto-generate for new routes mid-build)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing typecheck error in `motion-utils.test.ts` (test references nonexistent module) -- not related to this plan's changes
- React Router typegen doesn't generate +types for new routes until next full build cycle -- used inline type annotation for api.feedback.tsx

## User Setup Required

Migrations must be applied to Supabase:
- `supabase/migrations/37-01-rag-traces-and-feedback.sql` -- creates rag_traces and rag_feedback tables
- `supabase/migrations/37-01-fix-carrried-typo.sql` -- fixes CARRRIED typo

## Next Phase Readiness
- RAG trace infrastructure ready for Phase 38 search quality improvements
- Feedback data will start accumulating once deployed, enabling quality measurement
- Phase 38 can query rag_traces for latency, source count, and answer quality metrics

---
*Phase: 37-eval-foundation-quick-wins*
*Completed: 2026-03-06*
