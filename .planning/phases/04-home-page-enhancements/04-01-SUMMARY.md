---
phase: 04-home-page-enhancements
plan: 01
subsystem: api, ui
tags: [supabase, react, typescript, svg, data-layer]

# Dependency graph
requires:
  - phase: 02-multi-tenancy
    provides: municipality service and multi-org queries
provides:
  - "Refactored getHomeData() returning 6 data sets: upcomingMeeting, recentMeeting, recentMeetingStats, recentMeetingDecisions, activeMatters, recentDecisions"
  - "ViewRoyalMap SVG component for decorative hero background"
affects: [04-02-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "2-batch parallel query architecture for dependent data fetching"
    - "Vote counts derived from votes(vote) nested select, not motions columns"
    - "Matter summaries from agenda_items join, not matters table"
    - "Async IIFE pattern to wrap Supabase PromiseLike into true Promises for Promise.all"

key-files:
  created:
    - apps/web/app/components/home/view-royal-map.tsx
  modified:
    - apps/web/app/services/site.ts
    - apps/web/app/routes/home.tsx

key-decisions:
  - "Removed municipality parameter from getHomeData() since it was only used for council members and public notices (both removed)"
  - "Used async IIFE wrappers for batch 2 queries to avoid Supabase PromiseLike/Promise type mismatch"
  - "Created simplified hand-drawn SVG outline of View Royal boundary instead of converting GeoJSON (per user deviation directive)"
  - "Updated home.tsx with transitional UI using new data shape (full redesign deferred to Plan 02)"

patterns-established:
  - "Async IIFE pattern for Supabase batch queries: (async () => { const res = await supabase...; return tagged_result; })()"
  - "Tagged union results for dynamic Promise.all batches: { type: 'agendaPreview' | 'matterSummaries' | ... }"

requirements-completed: [HOME-01, HOME-02, HOME-03, HOME-04, HOME-05]

# Metrics
duration: 5min
completed: 2026-02-16
---

# Phase 4 Plan 1: Home Page Data Layer & Map SVG Summary

**Refactored getHomeData() with 2-batch parallel queries for active matters (with agenda_items summaries), decisions feed (with votes table vote counts), upcoming meeting (with agenda preview), and recent meeting stats (with divided votes); plus decorative ViewRoyalMap SVG component**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-17T02:39:07Z
- **Completed:** 2026-02-17T02:44:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Refactored getHomeData() to return all 6 data sets needed for the new home page in 2 parallel query batches
- Active matters include summaries sourced from agenda_items (not the null matters.plain_english_summary)
- Decisions feed includes real vote breakdown from individual vote records (not the zero-value motions columns)
- Recent meeting stats include divided votes count
- Upcoming meeting supports agenda topic preview when available
- Created decorative ViewRoyalMap SVG component with municipal boundary outline and waterway details

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor getHomeData() with new data queries** - `dd8ef3e3` (feat)
2. **Task 2: Generate decorative SVG map component** - `2988f2ab` (feat)

## Files Created/Modified
- `apps/web/app/services/site.ts` - Refactored getHomeData() with 2-batch parallel query architecture returning 6 data sets
- `apps/web/app/routes/home.tsx` - Updated loader and transitional UI to use new data shape
- `apps/web/app/components/home/view-royal-map.tsx` - New decorative SVG map component of View Royal boundary

## Decisions Made
- Removed municipality parameter from getHomeData() -- it was only used for council members query and public notices RSS fetch, both removed from the new home page
- Used async IIFE wrappers instead of .then() chains for batch 2 queries to satisfy TypeScript's Promise type requirements (Supabase returns PromiseLike, not Promise)
- Created hand-drawn simplified SVG outline per user deviation directive instead of converting the GeoJSON file
- Updated home.tsx with a transitional working UI that renders the new data shape -- full redesign happens in Plan 02

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Supabase PromiseLike/Promise type mismatch in batch 2**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** Supabase query builder's `.then()` returns `PromiseLike<any>`, not `Promise<any>`, causing TypeScript errors when pushed to `Promise<any>[]` array
- **Fix:** Wrapped each batch 2 query in an async IIFE `(async () => { ... })()` which returns a proper `Promise`
- **Files modified:** apps/web/app/services/site.ts
- **Verification:** pnpm typecheck passes
- **Committed in:** dd8ef3e3 (part of Task 1 commit)

**2. [Rule 3 - Blocking] Home.tsx references removed data properties**
- **Found during:** Task 1 (updating return shape)
- **Issue:** home.tsx destructured old properties (latestMeeting, councilMembers, publicNotices, etc.) that no longer exist in the new getHomeData() return shape
- **Fix:** Rewrote home.tsx component to destructure and render the new data shape with a transitional UI
- **Files modified:** apps/web/app/routes/home.tsx
- **Verification:** pnpm typecheck passes
- **Committed in:** dd8ef3e3 (part of Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for the code to compile. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All data queries ready for the full home page UI rewrite in Plan 02
- ViewRoyalMap component ready for hero section integration
- Return shape documented in code and summary for Plan 02 consumption

## Self-Check: PASSED

All files verified present. All commit hashes verified in git log.

---
*Phase: 04-home-page-enhancements*
*Completed: 2026-02-16*
