---
phase: quick
plan: 2
subsystem: ui
tags: [react, tailwind, lucide-react, layout]

# Dependency graph
requires: []
provides:
  - "Site-wide beta banner in root Layout above Navbar"
affects: [root-layout, navbar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline banner JSX in Layout rather than separate component for trivial UI"

key-files:
  created: []
  modified:
    - "apps/web/app/root.tsx"

key-decisions:
  - "Banner is inline JSX in Layout, not a separate component (too small to warrant its own file)"
  - "Banner is not dismissible -- always visible, no state management needed"

patterns-established:
  - "Site-wide notices go in root.tsx Layout body, above Navbar"

requirements-completed: [BETA-BANNER]

# Metrics
duration: 1min
completed: 2026-02-18
---

# Quick Task 2: Add Beta Banner to Homepage Header Summary

**Amber beta banner with FlaskConical icon rendered above Navbar on all pages via root Layout**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-18T20:48:08Z
- **Completed:** 2026-02-18T20:48:46Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added site-wide amber beta banner above Navbar in root.tsx Layout
- Banner includes FlaskConical icon from lucide-react for "experimental" visual cue
- TypeScript typecheck passes cleanly with no errors introduced

## Task Commits

Each task was committed atomically:

1. **Task 1: Add beta banner to site Layout in root.tsx** - `77b17c18` (feat)

## Files Created/Modified
- `apps/web/app/root.tsx` - Added FlaskConical import and beta banner div above Navbar in Layout

## Decisions Made
- Banner is inline JSX in the Layout component rather than a separate component file (it's 5 lines of JSX, too small to warrant its own file)
- Banner is not dismissible for now -- always visible, keeps implementation simple with no state management
- Used amber/yellow color scheme (bg-amber-50, border-amber-200, text-amber-800) for informational but not alarming tone

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Beta banner is live on all routes via root Layout
- Can be made dismissible later with localStorage state if desired

## Self-Check: PASSED

- [x] `apps/web/app/root.tsx` exists
- [x] Commit `77b17c18` exists

---
*Quick Task: 2-add-beta-banner-to-homepage-header*
*Completed: 2026-02-18*
