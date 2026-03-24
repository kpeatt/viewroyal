---
phase: quick-23
plan: 01
subsystem: ui
tags: [tailwind, tabs, responsive, layout]

requires: []
provides:
  - "Wrapping tab bar on councillor profile pages"
affects: [person-profile]

tech-stack:
  added: []
  patterns: ["flex-wrap tab layout with flex-none children for responsive wrapping"]

key-files:
  created: []
  modified:
    - apps/web/app/routes/person-profile.tsx

key-decisions:
  - "Use flex-wrap instead of overflow-x-auto for tab overflow handling"

patterns-established:
  - "Tab bar wrapping: use flex/w-full/gap-1 on TabsList + flex-none on TabsTrigger to override shadcn defaults"

requirements-completed: [FIX-TAB-OVERFLOW]

duration: 1min
completed: 2026-03-24
---

# Quick Task 23: Fix Tab Bar Overflow Summary

**Replaced horizontal scroll with flex-wrap on councillor profile tab bar for clean multi-row layout on all screen sizes**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-24T23:00:53Z
- **Completed:** 2026-03-24T23:01:38Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Tab bar wraps to second row on narrow screens instead of overflowing
- All 6 tabs remain accessible and correctly styled
- Active tab indicator continues working as before

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix tab bar overflow on person profile page** - `35d0b44c` (fix)

## Files Created/Modified
- `apps/web/app/routes/person-profile.tsx` - Removed overflow-x-auto, added flex/w-full/gap-1 to TabsList, added flex-none to all TabsTrigger elements

## Decisions Made
- Used flex-wrap approach instead of horizontal scroll -- wrapping provides better UX on mobile than requiring scroll discovery

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing typecheck errors in `api.ask.tsx` (waitUntil not found) -- confirmed not introduced by this change

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Tab bar fix is complete and ready for deployment

---
*Phase: quick-23*
*Completed: 2026-03-24*
