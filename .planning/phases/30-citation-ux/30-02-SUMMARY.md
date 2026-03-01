---
phase: 30-citation-ux
plan: 02
subsystem: ui
tags: [react, hover-card, drawer, vaul, markdown, responsive]

requires:
  - phase: 30-citation-ux
    provides: CitationToken type, GroupedCitationBadge shell, useMediaQuery hook, NormalizedSource with content/result
provides:
  - SourceMarkdownPreview component with truncation toggle
  - SourcePreviewContent with type-specific layouts for all source types
  - Responsive GroupedCitationBadge (HoverCard desktop, Drawer mobile)
  - 24 unit tests for source preview logic
affects: [30-03]

tech-stack:
  added: []
  patterns: [responsive-hover-drawer, type-specific-layout-routing, markdown-preview-truncation]

key-files:
  created:
    - apps/web/app/components/search/source-markdown-preview.tsx
    - apps/web/app/components/search/source-preview-content.tsx
    - apps/web/tests/components/source-preview.test.ts
  modified:
    - apps/web/app/components/search/citation-badge.tsx

key-decisions:
  - "HoverCard for desktop >= 768px, Drawer (vaul bottom sheet) for mobile"
  - "Max 300px height for HoverCard content, 50vh for Drawer"
  - "200-char threshold for content truncation with Show more/less toggle"
  - "Type-specific layouts: transcript/key_statement show speaker, motion/vote show result badge, bylaw/doc show bold title"

patterns-established:
  - "Responsive component pattern: useMediaQuery to switch HoverCard vs Drawer"
  - "Type-routing switch for source-specific layouts"
  - "Markdown preview with prose-xs styling and line-clamp truncation"

requirements-completed: [CITE-02, CITE-03]

duration: 8min
completed: 2026-03-01
---

# Plan 02: Grouped Citation Badges with Preview Cards Summary

**Responsive grouped citation badges showing HoverCard (desktop) or Drawer (mobile) with type-specific source previews and markdown rendering**

## Performance

- **Duration:** 8 min
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments
- SourceMarkdownPreview renders markdown content with auto-truncation and expand/collapse toggle
- SourcePreviewContent provides type-specific layouts: transcripts show speakers, motions show result badges, bylaws/docs show bold titles
- GroupedCitationBadge switches between Radix HoverCard (desktop) and vaul Drawer (mobile) via useMediaQuery
- 24 unit tests covering link routing, type labels, result badge colors, layout routing, and content fallbacks

## Task Commits

1. **Task 1: SourceMarkdownPreview** - `6901f774` (feat, combined commit)
2. **Task 2: SourcePreviewContent** - `6901f774` (feat, combined commit)
3. **Task 3: GroupedCitationBadge wiring** - `6901f774` (feat, combined commit)
4. **Task 4: Source preview tests** - `6901f774` (test, combined commit)

## Files Created/Modified
- `apps/web/app/components/search/source-markdown-preview.tsx` - Markdown preview with truncation toggle
- `apps/web/app/components/search/source-preview-content.tsx` - Type-specific source preview layouts
- `apps/web/app/components/search/citation-badge.tsx` - GroupedCitationBadge wired with responsive preview
- `apps/web/tests/components/source-preview.test.ts` - 24 tests for preview logic

## Decisions Made
- Combined all 4 tasks into a single commit since they form one cohesive feature.
- Used logic-level tests (no jsdom) since vitest is configured with node environment.

## Deviations from Plan
None - plan executed as specified.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SourceMarkdownPreview ready for Plan 03 to use in SourceCards
- All components compile and tests pass (146 total)

---
*Plan: 30-02 (Phase 30: Citation UX)*
*Completed: 2026-03-01*
