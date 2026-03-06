---
phase: 38-rag-intelligence
plan: 02
subsystem: api
tags: [gemini, rag, reranking, search-quality, llm]

requires:
  - phase: 38-rag-intelligence-01
    provides: 4 consolidated RAG tools with composite result objects
provides:
  - rerankResults function using Gemini Flash Lite for relevance scoring
  - Reranking integration in agent loop for search_council_records and search_documents
  - Reranking AgentEvent type for UI visibility
  - Trace metadata with reranking candidates/selected counts
affects: []

tech-stack:
  added: [gemini-2.5-flash-lite-preview-06-17]
  patterns: [llm-reranking, flatten-rerank-unflatten, graceful-degradation]

key-files:
  created: []
  modified:
    - apps/web/app/services/rag.server.ts
    - apps/web/app/components/search/ai-answer.tsx
    - apps/web/app/routes/api.ask.tsx
    - apps/web/app/routes/search.tsx

key-decisions:
  - "Used Gemini Flash Lite (gemini-2.5-flash-lite-preview-06-17) for reranking -- fast and cheap"
  - "Flatten/unflatten pattern to rerank composite tool results as a single scored list"
  - "Threshold 3 with minKeep 3 -- always keep at least 3 results even if all score low"
  - "Graceful degradation: reranking failures pass all results through unchanged"

patterns-established:
  - "Flatten-rerank-unflatten: composite tool results flattened to scored list, then reconstructed"
  - "Structured JSON output via responseMimeType for reliable reranking parsing"

requirements-completed: [SRCH-01]

duration: 3min
completed: 2026-03-06
---

# Phase 38 Plan 02: LLM Reranking Summary

**Gemini Flash Lite reranking of RAG search results with score-based filtering, trace logging, and research step UI**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T15:49:58Z
- **Completed:** 2026-03-06T15:52:50Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added rerankResults function that calls Gemini Flash Lite with structured JSON output to score each result's relevance
- Implemented flatten/unflatten helpers to convert composite tool results (motions + transcripts + statements + agenda_items) into a flat scorable list and back
- Wired reranking into agent loop for search_council_records and search_documents tools (skip search_matters and get_person_info)
- Added reranking event to SSE stream and research steps UI showing "Ranked N sources -> M most relevant"
- Attached reranking metadata to tool_calls entries in traces for observability

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement reranking function and wire into agent loop** - `42914a96` (feat)
2. **Task 2: Add reranking to traces and UI research steps** - `b1b180aa` (feat)

## Files Created/Modified
- `apps/web/app/services/rag.server.ts` - Added rerankResults, summarizeResult, flattenToolResults, unflattenRerankResults functions; wired reranking into agent loop; added reranking AgentEvent type
- `apps/web/app/components/search/ai-answer.tsx` - Added reranking event rendering in ResearchStep component
- `apps/web/app/routes/api.ask.tsx` - Attached reranking metadata to tool_calls for trace storage
- `apps/web/app/routes/search.tsx` - Added reranking event handling in SSE event loop

## Decisions Made
- Used Gemini Flash Lite for reranking (fast, cheap, sufficient for relevance scoring)
- Flatten-rerank-unflatten pattern preserves composite result shapes while enabling single-pass scoring
- Score threshold of 3 (0-10 scale) with minimum keep of 3 results ensures useful results always pass through
- Only rerank when flat result count exceeds 3 to avoid unnecessary API calls on small result sets
- Graceful degradation: any reranking failure silently passes all results through

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - uses existing Gemini API key already configured for RAG.

## Next Phase Readiness
- Reranking layer complete and integrated with all observability (traces, UI, events)
- Ready for Phase 39 topic taxonomy or further RAG quality improvements

---
*Phase: 38-rag-intelligence*
*Completed: 2026-03-06*
