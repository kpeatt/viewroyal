---
phase: 08-unified-search-hybrid-rag
plan: 02
subsystem: api
tags: [search, rag, sse, streaming, gemini, hybrid-search, caching]

# Dependency graph
requires:
  - phase: 08-01
    provides: hybrid search RPCs, intent classifier, search results cache table
provides:
  - Unified search API endpoint (keyword JSON + AI streaming SSE)
  - RAG agent with document_sections search tool
  - AI answer caching for shareable URLs
affects: [08-03, 08-04, 08-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [SSE streaming via ReadableStream for AI answers, cache_id event for shareable URLs]

key-files:
  created:
    - apps/web/app/routes/api.search.tsx
  modified:
    - apps/web/app/routes.ts
    - apps/web/app/services/rag.server.ts

key-decisions:
  - "Reused rate limiter pattern from api.ask.tsx (inline stale cleanup, no setInterval)"
  - "Cache ID emitted as SSE event before done event for client-side URL updating"
  - "Document sections enriched via two-step query (documents -> meetings) for date filtering"

patterns-established:
  - "Unified search API: single endpoint handles keyword (JSON) and AI (SSE) via mode param"
  - "Cache-after-stream: collect answer chunks during streaming, save to cache on completion"

requirements-completed: [SRCH-02, SRCH-04]

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 8 Plan 02: Unified Search API & RAG Document Sections Summary

**Unified search API route with keyword JSON and streaming AI answers, plus RAG agent document_sections tool using hybrid search RPC**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-18T03:15:49Z
- **Completed:** 2026-02-18T03:18:34Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Single API endpoint handles both keyword search (JSON) and AI-powered answers (streaming SSE)
- Intent auto-detection routes queries to the correct mode via classifyIntent
- Completed AI answers cached to search_results_cache with shareable ID
- RAG agent can now search document_sections alongside transcripts, motions, and key statements

## Task Commits

Each task was committed atomically:

1. **Task 1: Create unified search API route** - `e79b4698` (feat)
2. **Task 2: Add document_sections search tool to RAG agent** - `18b48247` (feat)

## Files Created/Modified
- `apps/web/app/routes/api.search.tsx` - Unified search API with keyword JSON + streaming SSE modes
- `apps/web/app/routes.ts` - Route registration for api/search
- `apps/web/app/services/rag.server.ts` - search_document_sections tool, normalizer, orchestrator prompt update

## Decisions Made
- Reused rate limiter pattern from api.ask.tsx with inline stale entry cleanup (no setInterval, CF Workers safe)
- Cache ID emitted as its own SSE event type before the "done" event, allowing client to update URL without parsing
- Document sections enriched via two-step query (documents -> meetings) to support after_date filtering

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Unified search API ready for frontend search page (Plan 03)
- Both keyword and AI modes functional
- RAG agent has full tool set including document sections
- Cache infrastructure ready for shareable answer URLs

## Self-Check: PASSED
- [x] api.search.tsx exists (203 lines, exceeds 80 min)
- [x] rag.server.ts contains search_document_sections (6 matches)
- [x] Route registered in routes.ts
- [x] Commit e79b4698 verified
- [x] Commit 18b48247 verified
- [x] TypeScript compiles without new errors
- [x] NormalizedSource type includes document_section
