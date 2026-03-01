---
phase: 30-citation-ux
plan: 01
subsystem: ui
tags: [react, citations, media-query, ssr, vitest]

requires:
  - phase: 29-backend-foundation
    provides: enriched NormalizedSource objects from RAG pipeline
provides:
  - Expanded NormalizedSource with content/result fields
  - useMediaQuery SSR-safe hook
  - Citation grouping algorithm (groupCitationParts)
  - CitationToken type system (text/single/group)
  - GroupedCitationBadge shell component
  - 12 unit tests for citation grouping
affects: [30-02, 30-03]

tech-stack:
  added: []
  patterns: [citation-grouping-algorithm, ssr-safe-media-query]

key-files:
  created:
    - apps/web/app/lib/use-media-query.ts
    - apps/web/tests/components/citation-grouping.test.ts
  modified:
    - apps/web/app/services/rag.server.ts
    - apps/web/app/components/search/citation-badge.tsx

key-decisions:
  - "Skip empty strings from regex split rather than treating them as group separators"
  - "useMediaQuery defaults false for SSR safety on Cloudflare Workers"
  - "CitationToken discriminated union (text|single|group) for type-safe rendering"

patterns-established:
  - "Citation grouping: consecutive [N] patterns merged into group tokens, text separates groups"
  - "SSR-safe hooks: useState(false) + useEffect for browser-only APIs"

requirements-completed: [CITE-01]

duration: 12min
completed: 2026-03-01
---

# Plan 01: Citation Parser + Foundations Summary

**Expanded NormalizedSource with content/result fields, citation grouping algorithm, and SSR-safe useMediaQuery hook**

## Performance

- **Duration:** 12 min
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments
- NormalizedSource interface expanded with `content` (500-char excerpt) and `result` (motion outcome) across all 8 normalize functions
- Pure citation grouping algorithm that merges consecutive `[N]` patterns into group tokens
- SSR-safe `useMediaQuery` hook for responsive HoverCard/Drawer switching
- 12 unit tests covering grouping, singles, mixed, edge cases (all passing)

## Task Commits

1. **Task 1: Expand NormalizedSource** - `04ee6485` (feat)
2. **Task 2: useMediaQuery hook** - `94452919` (feat)
3. **Task 3: Citation parser refactor** - `f9ee0736` (feat)
4. **Task 4: Citation grouping tests** - `ce053a30` (fix + test)

## Files Created/Modified
- `apps/web/app/services/rag.server.ts` - Added content/result fields to all normalize functions
- `apps/web/app/lib/use-media-query.ts` - SSR-safe media query hook
- `apps/web/app/components/search/citation-badge.tsx` - Citation grouping algorithm, CitationToken type, GroupedCitationBadge shell
- `apps/web/tests/components/citation-grouping.test.ts` - 12 test cases for groupCitationParts

## Decisions Made
- Fixed empty string bug in groupCitationParts: regex split produces empty strings between consecutive `[N]` patterns, which were prematurely flushing groups. Fix: skip empty parts entirely instead of treating them as text separators.
- CitationToken uses discriminated union for type-safe pattern matching in rendering.

## Deviations from Plan

### Auto-fixed Issues

**1. [Bug] Empty string handling in citation grouping algorithm**
- **Found during:** Task 4 (citation grouping tests)
- **Issue:** `String.split(/(\[\d+\])/g)` produces empty strings between consecutive citations (e.g., `"[1][2]"` -> `["", "[1]", "", "[2]", ""]`). The empty `""` between `[1]` and `[2]` triggered a group flush, preventing grouping.
- **Fix:** Changed `else` branch to `else if (part !== "")` so empty strings are skipped entirely
- **Files modified:** apps/web/app/components/search/citation-badge.tsx
- **Verification:** All 12 tests pass, full 122-test suite passes
- **Committed in:** ce053a30

---

**Total deviations:** 1 auto-fixed (bug in implementation)
**Impact on plan:** Essential fix for core grouping logic. No scope creep.

## Issues Encountered
None beyond the grouping bug caught by tests.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CitationToken type and groupCitationParts ready for Plan 02 to wire into GroupedCitationBadge
- useMediaQuery hook ready for responsive HoverCard/Drawer switching
- NormalizedSource.content and .result fields ready for preview card rendering

---
*Plan: 30-01 (Phase 30: Citation UX)*
*Completed: 2026-03-01*
