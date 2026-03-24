---
phase: 22-set-up-posthog-llm-analytics
plan: 01
subsystem: analytics
tags: [posthog, llm-analytics, gemini, token-tracking, feedback]

requires:
  - phase: existing
    provides: PostHog captureServerEvent helper and $ai_generation events
provides:
  - PostHog $ai_generation events with token counts ($ai_input_tokens, $ai_output_tokens)
  - PostHog $ai_feedback events linked to generations via $ai_trace_id
  - Error-path $ai_generation events with $ai_is_error and $ai_http_status 500
affects: [posthog-dashboard, rag, analytics]

tech-stack:
  added: []
  patterns: [usage_metadata AgentEvent for token propagation from RAG to route handlers]

key-files:
  created: []
  modified:
    - apps/web/app/services/rag.server.ts
    - apps/web/app/routes/api.ask.tsx
    - apps/web/app/routes/api.search.tsx
    - apps/web/app/routes/api.feedback.tsx

key-decisions:
  - "Accumulate tokens from all Gemini calls (orchestrator + streaming) for accurate total counts"
  - "Stream usageMetadata from last chunk rather than separate API call"

patterns-established:
  - "usage_metadata event: RAG agent yields token counts, route handlers capture and forward to PostHog"

requirements-completed: [LLM-ANALYTICS]

duration: 3min
completed: 2026-03-24
---

# Quick Task 22: PostHog LLM Analytics Summary

**Complete PostHog LLM observability: token counts on $ai_generation, $ai_feedback events on thumbs up/down, error tracking on failures**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T16:55:08Z
- **Completed:** 2026-03-24T16:57:49Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- $ai_generation events now include $ai_input_tokens, $ai_output_tokens, and $ai_stream properties for PostHog LLM dashboard
- Error paths in both api.ask and api.search emit $ai_generation with $ai_is_error: true and $ai_http_status: 500
- $ai_feedback events fire on user thumbs up/down with $ai_trace_id linkage to the original generation
- Token counts accumulate across all Gemini calls (orchestrator reasoning + final streaming answer)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add token counts to $ai_generation events** - `d31be303` (feat)
2. **Task 2: Send $ai_feedback events to PostHog** - `8c1eb123` (feat)

## Files Created/Modified
- `apps/web/app/services/rag.server.ts` - Added usage_metadata AgentEvent variant, token accumulation from orchestrator and streaming calls
- `apps/web/app/routes/api.ask.tsx` - Capture usage_metadata, add token props to PostHog event, add error-path event
- `apps/web/app/routes/api.search.tsx` - Same token tracking and error-path pattern as api.ask
- `apps/web/app/routes/api.feedback.tsx` - Import captureServerEvent, emit $ai_feedback after successful Supabase upsert

## Decisions Made
- Accumulate tokens from all Gemini calls (orchestrator generateContent + final generateContentStream) for accurate totals rather than only tracking the final streaming call
- Use chunk.usageMetadata from the streaming response (last chunk contains final counts) rather than a separate API call

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. PostHog events flow automatically via existing captureServerEvent infrastructure.

## Next Steps
- Verify in PostHog live events: ask a question, confirm $ai_input_tokens and $ai_output_tokens appear
- Verify in PostHog: click thumbs up/down, confirm $ai_feedback event with matching $ai_trace_id
- PostHog LLM Analytics dashboard should now show token usage charts

---
*Quick Task: 22-set-up-posthog-llm-analytics*
*Completed: 2026-03-24*
