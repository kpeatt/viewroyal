---
phase: 09-ai-profiling-comparison
plan: 04
subsystem: ui
tags: [react, comparison, voting-alignment, stances, speaking-time, scroll-snap, responsive]

# Dependency graph
requires:
  - phase: 09-01
    provides: councillor_stances table, speaking time RPCs, profiling.ts service, topic-utils.ts, StanceSpectrum component
provides:
  - /compare route with councillor selection and side-by-side comparison
  - Pairwise voting alignment score display
  - Per-topic stance comparison with agreement indicators
  - Activity stats comparison (speaking time, attendance, votes)
  - Speaking time by topic dual bar chart
  - Mobile scroll-snap layout with fixed comparison bar
  - Navigation entries for Compare and Alignment in Council dropdown
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-mode route pattern: selection mode (no params) vs comparison mode (?a=X&b=Y)"
    - "Pairwise alignment computed via existing calculateAlignmentForPerson utility"
    - "Agreement level derived from position_score distance (<=0.5 agree, >1.0 disagree)"
    - "Mobile scroll-snap with fixed comparison bar for swipe UX"

key-files:
  created:
    - apps/web/app/routes/compare.tsx
  modified:
    - apps/web/app/routes.ts
    - apps/web/app/services/people.ts
    - apps/web/app/components/navbar.tsx

key-decisions:
  - "Converted Council NavLink to NavDropdown with Members, Alignment, and Compare sub-items"
  - "Agreement thresholds: <=0.5 score distance = agree, >1.0 = disagree, between = partial"
  - "Mobile uses scroll-snap-type: x mandatory for swipe between councillor activity cards"

patterns-established:
  - "Dual-mode loader pattern returning discriminated union on mode field"
  - "CouncillorSelector as reusable dropdown with avatar, name, role display"
  - "NavDropdown for grouping related Council pages in navigation"

requirements-completed: [PROF-06]

# Metrics
duration: 4min
completed: 2026-02-18
---

# Phase 09 Plan 04: Councillor Comparison Page Summary

**Side-by-side councillor comparison at /compare with voting alignment score, per-topic stance comparison with agree/disagree indicators, activity stats, and mobile scroll-snap layout**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T21:09:38Z
- **Completed:** 2026-02-18T21:14:02Z
- **Tasks:** 2
- **Files created:** 1
- **Files modified:** 3

## Accomplishments
- Created /compare route with selection mode (councillor pickers) and comparison mode (side-by-side analysis)
- Voting alignment score prominently displayed as large percentage with vote count details
- All 8 topics shown in stance comparison with StanceSpectrum components and agreement indicators
- Activity comparison cards showing speaking time, attendance rate, meeting count, and total votes
- Speaking time by topic dual bar chart for desktop with indigo/violet color coding
- Mobile layout with fixed comparison bar, scroll-snap swipe between councillor cards
- Navigation updated: Council NavLink converted to dropdown with Members, Alignment, Compare

## Task Commits

Each task was committed atomically:

1. **Task 1: Create /compare route with selection mode and comparison mode** - `a03a41a3` (feat)
2. **Task 2: Export fetchRelevantVotesForAlignment and add nav entry** - `4ec1d286` (feat)

## Files Created/Modified
- `apps/web/app/routes/compare.tsx` - Full comparison page with selection and comparison modes, ~700 lines
- `apps/web/app/routes.ts` - Added /compare route registration after alignment
- `apps/web/app/services/people.ts` - Exported fetchRelevantVotesForAlignment for use by comparison loader
- `apps/web/app/components/navbar.tsx` - Council NavDropdown with Members/Alignment/Compare, mobile nav entries

## Decisions Made
- Converted the Council NavLink into a NavDropdown to house Members, Alignment, and Compare -- follows the existing Records dropdown pattern
- Agreement thresholds based on position_score distance: <=0.5 = agree (green check), >1.0 = disagree (red X), between = partial (amber dash)
- Mobile comparison bar is sticky below the main navbar (top-16) showing both names and alignment badge

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exported fetchRelevantVotesForAlignment in Task 1 instead of Task 2**
- **Found during:** Task 1
- **Issue:** compare.tsx imports fetchRelevantVotesForAlignment from people.ts, but the function was private. Plan intended this export for Task 2, but Task 1 typecheck would fail without it.
- **Fix:** Added `export` keyword to the function declaration in Task 1 commit
- **Files modified:** apps/web/app/services/people.ts
- **Verification:** pnpm typecheck passes
- **Committed in:** a03a41a3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor ordering change -- export moved from Task 2 to Task 1 for typecheck correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 09 (AI Profiling & Comparison) is now complete with all 4 plans executed
- All profiling features delivered: database foundation, stance generation pipeline, profile page, comparison page
- Citizens can now compare any two councillors on voting alignment, policy stances, and activity

## Self-Check: PASSED

All 1 created file verified on disk. Both commit hashes (a03a41a3, 4ec1d286) verified in git log.

---
*Phase: 09-ai-profiling-comparison*
*Completed: 2026-02-18*
