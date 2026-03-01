---
phase: 29-backend-foundation
plan: 01
subsystem: api
tags: [supabase, rpc, hybrid-search, rrf, bylaw, lucide-react]

requires:
  - phase: 08-unified-search-hybrid-rag
    provides: hybrid search RPC pattern (RRF), NormalizedSource type, source collection pipeline
provides:
  - hybrid_search_bylaw_chunks RPC (FTS + vector, RRF scoring)
  - search_bylaws tool in RAG agent
  - normalizeBylawSources function
  - "bylaw" NormalizedSource type with bylaw_id field
  - Bylaw source UI support (Book icon, "Bylaw" label, /bylaws/:id links)
affects: [30-citation-ux, 31-search-controls-polish]

tech-stack:
  added: []
  patterns:
    - "Bylaw hybrid search follows same RRF pattern as document_sections, motions, key_statements"
    - "NormalizedSource bylaw type uses bylaw_id for link routing instead of meeting_id"

key-files:
  created:
    - supabase/migrations/hybrid_search_bylaw_chunks.sql
  modified:
    - apps/web/app/services/rag.server.ts
    - apps/web/app/components/search/citation-badge.tsx
    - apps/web/app/components/search/source-cards.tsx

key-decisions:
  - "Used same RRF pattern as existing hybrid RPCs for consistency"
  - "bylaw_id field added to NormalizedSource for link routing since bylaws don't have meeting_id"
  - "Book icon from lucide-react for bylaw source type visual differentiation"

patterns-established:
  - "Bylaw sources link to /bylaws/:id using bylaw_id (not meeting_id)"

requirements-completed: [AGNT-03]

duration: 5min
completed: 2026-02-28
---

# Plan 29-01: Bylaw Search Tool + RPC Summary

**Hybrid search RPC for 2,285 bylaw chunks with RAG agent tool registration and full UI source type support**

## Performance

- **Duration:** 5 min
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created hybrid_search_bylaw_chunks RPC combining FTS (ts_rank_cd) and semantic (halfvec cosine distance) search using Reciprocal Rank Fusion
- Registered search_bylaws tool in RAG agent with description guiding the agent to use it for regulations, zoning, fees, and permits
- Added "bylaw" type to NormalizedSource with bylaw_id for /bylaws/:id link routing
- Updated citation badges (Book icon, "Bylaw" label, "View bylaw" text) and source cards with bylaw-aware link routing

## Task Commits

1. **Task 1: Supabase migration for hybrid search RPC** - `efead68b` (feat)
2. **Task 2: search_bylaws tool, normalization, UI type support** - `98c835ed` (feat)

## Files Created/Modified
- `supabase/migrations/hybrid_search_bylaw_chunks.sql` - text_search column, GIN index, hybrid RPC
- `apps/web/app/services/rag.server.ts` - search_bylaws function, tool registration, normalizeBylawSources, NormalizedSource type update
- `apps/web/app/components/search/citation-badge.tsx` - Bylaw label, Book icon, bylaw link routing, "View bylaw" text
- `apps/web/app/components/search/source-cards.tsx` - Bylaw-aware link routing

## Decisions Made
- Matched existing RRF hybrid search pattern from hybrid_search_document_sections for consistency
- Used bylaw_id instead of meeting_id for link routing since bylaws are standalone entities
- Truncated text_content to 500 chars in RPC to keep response sizes manageable

## Deviations from Plan

### Auto-fixed Issues

**1. SET search_path = '' caused operator resolution failure**
- **Found during:** Task 1 (migration application)
- **Issue:** `SET search_path = ''` prevented the `<=>` halfvec operator from being found (it's in the extensions schema)
- **Fix:** Removed `SET search_path = ''`, matching the pattern used by all other hybrid search RPCs in the project
- **Verification:** RPC tested successfully returning ranked results

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix was necessary for the RPC to work. No scope creep.

## Issues Encountered
None beyond the search_path issue noted above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- search_bylaws tool ready for agent reasoning enhancement in Plan 29-02
- Bylaw source type fully supported in UI pipeline for Phase 30 citation UX work

---
*Plan: 29-01 (Phase 29-backend-foundation)*
*Completed: 2026-02-28*
