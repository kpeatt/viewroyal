---
phase: 31-search-controls-polish
plan: 01
status: complete
duration: ~8min
started: 2026-03-01T13:00:00Z
completed: 2026-03-01T13:08:00Z
---

# Plan 31-01 Summary: Search Filters, RPCs & Sort

## What Was Built

Added time-range filtering, content-type multi-select, and sort controls to keyword search with full URL param persistence for shareability.

## Key Changes

### Task 1: Search-params utility, RPC updates, and sort logic
- **search-params.ts**: Created utility with `getDateRange`, `parseSearchFilters`, `serializeSearchFilters` functions and filter constants
- **Supabase RPCs**: Updated 3 hybrid search RPCs (motions, key_statements, document_sections) with optional `date_from`/`date_to` parameters; document_sections RPC now also returns `meeting_id` via documents JOIN
- **hybrid-search.server.ts**: Added `sortResults` export (newest/oldest/relevance with nulls-last), extended `hybridSearchAll` with dateFrom/dateTo/sort options, updated all 4 search functions to pass date params
- **api.search.tsx**: Reads `time` and `sort` from URL params, converts via `getDateRange`, passes to `hybridSearchAll`
- **Tests**: 23 unit tests covering date range calculation, URL param serialization round-trip, and sort ordering

### Task 2: SearchFilters component and URL-driven filter state
- **search-filters.tsx**: New component with type multi-select pills, time range Popover dropdown, and sort Popover dropdown in a unified filter row
- **search-results.tsx**: Removed client-side type filtering (useState, FILTERS array, filtered variable); component now receives already-filtered results
- **search.tsx**: Wired URL-driven filter state with `parseSearchFilters`/`serializeSearchFilters`; filter changes trigger server-side re-fetch; handleSubmit preserves filters; handleNewSearch clears them

## Commits

1. `a95673b1` - feat(31-01): add search-params utility, date-filtered RPCs, and sort logic
2. `56be4a29` - feat(31-01): build SearchFilters component and wire URL-driven filter state

## Self-Check: PASSED

- [x] All 6 must_have truths verified
- [x] All artifact paths exist
- [x] 23 unit tests pass
- [x] Full test suite (179 tests) passes with no regressions
- [x] TypeScript compiles cleanly
- [x] Supabase migration applied successfully

## Key Files

### Created
- `apps/web/app/lib/search-params.ts`
- `apps/web/app/components/search/search-filters.tsx`
- `apps/web/tests/lib/search-params.test.ts`
- `apps/web/tests/services/hybrid-search-sort.test.ts`
- `supabase/migrations/31-01-add-date-filter-to-hybrid-search-rpcs.sql`

### Modified
- `apps/web/app/services/hybrid-search.server.ts`
- `apps/web/app/routes/api.search.tsx`
- `apps/web/app/routes/search.tsx`
- `apps/web/app/components/search/search-results.tsx`

## Deviations

None. All plan tasks executed as specified.
