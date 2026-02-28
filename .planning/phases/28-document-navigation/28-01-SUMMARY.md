---
phase: 28-document-navigation
plan: 01
subsystem: ui
tags: [react, scroll-spy, intersection-observer, toc, navigation, tailwind]

# Dependency graph
requires:
  - phase: 27-document-discoverability
    provides: document viewer route and section rendering
provides:
  - DocumentTOC component with desktop sidebar and mobile collapsible bar
  - useScrollSpy hook for IntersectionObserver-based active section tracking
  - Conditional two-column layout in document-viewer for long documents
affects: [28-document-navigation]

# Tech tracking
tech-stack:
  added: []
  patterns: [scroll-spy via IntersectionObserver, variant-based component rendering, extracted sub-component to avoid JSX duplication]

key-files:
  created:
    - apps/web/app/lib/use-scroll-spy.ts
    - apps/web/app/components/document/DocumentTOC.tsx
    - apps/web/tests/lib/document-toc.test.ts
  modified:
    - apps/web/app/routes/document-viewer.tsx

key-decisions:
  - "Used variant prop (desktop/mobile) on DocumentTOC to avoid rendering duplicate DOM"
  - "Extracted DocumentContent sub-component to share JSX between two-column and single-column layouts"
  - "rootMargin 0px 0px -80% 0px makes only top 20% of viewport count as active zone for scroll-spy"
  - "URL hash updates only on TOC click, not during passive scroll-spy, to avoid polluting browser history"

patterns-established:
  - "Scroll-spy pattern: IntersectionObserver with rootMargin to track active section, reusable via useScrollSpy hook"
  - "Variant-based component: single component renders different UIs via variant prop instead of separate components"

requirements-completed: [DOCV-04]

# Metrics
duration: 3min
completed: 2026-02-28
---

# Phase 28 Plan 01: Document TOC Navigation Summary

**IntersectionObserver scroll-spy TOC sidebar for document viewer with desktop sidebar and mobile collapsible bar**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-28T21:56:59Z
- **Completed:** 2026-02-28T22:00:25Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created useScrollSpy hook using IntersectionObserver to track which section is in the top 20% of viewport
- Built DocumentTOC component with desktop sidebar variant (sticky nav with indigo active border) and mobile variant (sticky collapsible dropdown)
- Restructured document-viewer.tsx with conditional two-column layout for documents with 3+ sections
- Added deep-link support via URL hash scroll-to on page load
- 13 unit tests passing for TOC data generation logic

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useScrollSpy hook and DocumentTOC component** - `2d51c98c` (feat)
2. **Task 2: Restructure document-viewer layout for TOC sidebar** - `b2eb5dbe` (feat)

## Files Created/Modified
- `apps/web/app/lib/use-scroll-spy.ts` - IntersectionObserver-based scroll-spy hook returning active section ID
- `apps/web/app/components/document/DocumentTOC.tsx` - Desktop sidebar nav and mobile sticky collapsible TOC bar
- `apps/web/tests/lib/document-toc.test.ts` - 13 tests for TOC threshold, item mapping, null title fallback, ordering
- `apps/web/app/routes/document-viewer.tsx` - Conditional two-column layout, TOC integration, DocumentContent extraction

## Decisions Made
- Used `variant` prop ("desktop" | "mobile") on DocumentTOC instead of rendering both views internally -- avoids duplicate DOM and lets parent control sticky positioning
- Extracted shared content into `DocumentContent` sub-component to avoid duplicating all section/gallery/footer JSX in both layout branches
- Set IntersectionObserver rootMargin to `0px 0px -80% 0px` so only the top 20% of viewport triggers active section changes
- URL hash updates via `history.replaceState` only on explicit TOC click, not during passive scrolling, to keep browser history clean

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- TOC sidebar fully functional, ready for Plan 02 (keyboard navigation / additional enhancements)
- All existing document viewer features preserved (images, gallery, summary, breadcrumbs, footer)

## Self-Check: PASSED

All 4 files verified present. Both commit hashes (2d51c98c, b2eb5dbe) found in git log.

---
*Phase: 28-document-navigation*
*Completed: 2026-02-28*
