---
phase: 30-citation-ux
plan: 03
subsystem: ui
tags: [react, markdown, source-cards, grid-layout]

requires:
  - phase: 30-citation-ux
    provides: SourceMarkdownPreview component, SOURCE_TYPE_LABEL export, NormalizedSource with content/result
provides:
  - Upgraded SourceCards with card grid layout and markdown content previews
  - Motion result badges with color coding
  - 10 unit tests for markdown preview truncation logic
affects: []

tech-stack:
  added: []
  patterns: [card-grid-layout, markdown-content-preview]

key-files:
  created:
    - apps/web/tests/components/source-markdown-preview.test.ts
  modified:
    - apps/web/app/components/search/source-cards.tsx
    - apps/web/tests/components/source-preview.test.ts

key-decisions:
  - "Card grid layout (2 columns on sm+) replaces flat chip row"
  - "Content field used for rich preview, title as fallback"
  - "maxLines=3 for source card content (vs maxLines=4 default in preview cards)"

patterns-established:
  - "Source card pattern: numbered badge + type icon + date + content + link"

requirements-completed: [CITE-04]

duration: 5min
completed: 2026-03-01
---

# Plan 03: Source Cards Markdown Rendering Summary

**Upgraded source cards from flat chip links to rich card grid with markdown content previews, speaker names, and motion result badges**

## Performance

- **Duration:** 5 min
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Source cards section upgraded from flat chip row to 2-column card grid on sm+
- Each card shows numbered badge, type icon, date, speaker name, markdown content preview, result badge, and source link
- SourceMarkdownPreview truncation logic tested with 10 cases including realistic content scenarios
- Fixed type annotations in source-preview.test.ts for strict TypeScript

## Task Commits

1. **Task 1: SourceCards upgrade** - `5dc7832c` (feat, combined commit)
2. **Task 2: SourceMarkdownPreview tests** - `5dc7832c` (test, combined commit)

## Files Created/Modified
- `apps/web/app/components/search/source-cards.tsx` - Card grid layout with markdown content previews
- `apps/web/tests/components/source-markdown-preview.test.ts` - 10 truncation logic tests
- `apps/web/tests/components/source-preview.test.ts` - Fixed type annotations

## Decisions Made
- Used maxLines=3 for source cards (slightly more compact than default 4 for preview cards).
- Fixed GFM table test by adding more rows to ensure content exceeds 200-char threshold.

## Deviations from Plan
None - plan executed as specified.

## Issues Encountered
- GFM table test data was shorter than 200 chars; added more rows to fix.
- TypeScript strict mode caught missing property access on narrowed types in tests; fixed with Record<string, string>.

## User Setup Required
None.

## Next Phase Readiness
- Phase 30 (Citation UX) fully complete
- Ready for Phase 31 (Search Controls + Polish)

---
*Plan: 30-03 (Phase 30: Citation UX)*
*Completed: 2026-03-01*
