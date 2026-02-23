---
phase: 16-core-data-search-api
plan: 04
subsystem: api
tags: [search, tsvector, full-text-search, chanfana, pagination, hono, supabase]

# Dependency graph
requires:
  - phase: 16-core-data-search-api
    plan: 02
    provides: "Meeting and people endpoints with allowlist serializer pattern"
  - phase: 16-core-data-search-api
    plan: 03
    provides: "Matter, motion, and bylaw endpoints with municipality scoping patterns"
provides:
  - "Cross-entity keyword search endpoint at GET /api/v1/:municipality/search"
  - "Search result serializer handling 5 content types with unified response shape"
  - "Page-based pagination for search results (page + per_page parameters)"
  - "Type filtering via comma-separated ?type= query parameter"
affects: [api-consumers, web-app-future-refactor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Position-based relevance scoring for textSearch results (following ftsSearchTranscriptSegments pattern)"
    - "Page-based pagination for merged cross-type search results (not cursor-based)"
    - "Parallel per-type keyword searches merged and sorted by score"

key-files:
  created:
    - apps/web/app/api/serializers/search.ts
    - apps/web/app/api/endpoints/search.ts
  modified:
    - apps/web/app/api/lib/envelope.ts
    - apps/web/app/api/index.ts

key-decisions:
  - "Page-based pagination for search instead of cursor-based (search results are volatile across merged types, cursor pagination is awkward)"
  - "Position-based relevance scoring using PostgREST textSearch ordering as proxy for ts_rank_cd (follows existing ftsSearchTranscriptSegments pattern)"
  - "Optional page field added to PaginationInfo interface (backward-compatible for cursor-based endpoints)"

patterns-established:
  - "Search serializer: type-switching serialization for multi-source results with truncateAtWord utility"
  - "Cross-entity search: parallel textSearch queries per type, merge by score, page-based offset"

requirements-completed: [SRCH-01, SRCH-02, SRCH-03]

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 16 Plan 04: Search Endpoint Summary

**Cross-entity keyword search endpoint with tsvector full-text search across 5 content types, position-based relevance scoring, type filtering, and page-based pagination**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T19:12:08Z
- **Completed:** 2026-02-21T19:15:50Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- Search endpoint searches across motions, matters, agenda_items, key_statements, and document_sections using Postgres tsvector full-text search
- Results include content type, relevance score, title, 200-char text snippet, and meeting context (slug + date)
- Type filtering via comma-separated `?type=motions,matters` query parameter
- Page-based pagination with `per_page` (max 100) and `page` parameters, plus `has_more` indicator
- Handles missing slug columns on key_statements and document_sections by using meeting slug for linking

## Task Commits

Each task was committed atomically:

1. **Task 1: Create search result serializer and search endpoint** - `2f9af6be` (feat)
2. **Task 2: Register search route in Hono app** - `4a780f4f` (feat)

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `apps/web/app/api/serializers/search.ts` - serializeSearchResult with type-switching for 5 content types, truncateAtWord utility
- `apps/web/app/api/endpoints/search.ts` - SearchEndpoint with parallel tsvector searches, merge + sort, page-based pagination
- `apps/web/app/api/lib/envelope.ts` - Added optional `page` field to PaginationInfo interface
- `apps/web/app/api/index.ts` - Search route registration with apiKeyAuth + rateLimit + municipality middleware

## Decisions Made
- Page-based pagination instead of cursor-based for search results (search results are merged from multiple types, inherently volatile, cursor pagination is awkward per research recommendation)
- Position-based relevance scoring following the existing `ftsSearchTranscriptSegments` pattern in hybrid-search.server.ts (PostgREST returns textSearch results in relevance order, so position is a meaningful ts_rank proxy)
- Added optional `page` field to shared `PaginationInfo` interface rather than creating a separate type (backward-compatible, existing cursor-based endpoints unaffected)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added page field to PaginationInfo interface**
- **Found during:** Task 1
- **Issue:** The existing PaginationInfo interface only had has_more, next_cursor, and per_page -- no page field for page-based pagination
- **Fix:** Added optional `page?: number` field to the interface in envelope.ts
- **Files modified:** apps/web/app/api/lib/envelope.ts
- **Verification:** Typecheck passes, existing endpoints unaffected (field is optional)
- **Committed in:** 2f9af6be (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Minor interface extension required for page-based pagination support. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Phase 16 endpoints are complete: 10 entity endpoints (5 list + 5 detail) + 1 search endpoint
- The API is ready for consumers to search across all civic data types with a single query
- Hybrid/semantic search can be added in a future plan by extending the search endpoint with embedding support

## Self-Check: PASSED

All 4 files verified present. Both task commits (`2f9af6be`, `4a780f4f`) verified in git log.

---
*Phase: 16-core-data-search-api*
*Completed: 2026-02-21*
