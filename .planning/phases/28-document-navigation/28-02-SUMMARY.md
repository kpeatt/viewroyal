---
phase: 28-document-navigation
plan: 02
subsystem: ui
tags: [cross-references, bylaws, react, supabase, regex, document-viewer]

# Dependency graph
requires:
  - phase: 28-document-navigation/01
    provides: Document viewer with TOC, sections, inline images, gallery
provides:
  - Cross-reference detection utility (detectCrossReferences)
  - CrossRefBadge inline component for bylaw references
  - RelatedDocuments bottom section listing all referenced bylaws
  - Server-side bylaw matching in document-viewer loader
affects: [bylaw-detail-pages, document-experience]

# Tech tracking
tech-stack:
  added: []
  patterns: [server-side cross-reference detection, regex bylaw matching, purple bylaw badge theme]

key-files:
  created:
    - apps/web/app/lib/cross-references.ts
    - apps/web/app/components/document/CrossRefBadge.tsx
    - apps/web/app/components/document/RelatedDocuments.tsx
    - apps/web/tests/lib/cross-references.test.ts
  modified:
    - apps/web/app/routes/document-viewer.tsx

key-decisions:
  - "Server-side detection: all cross-reference matching runs in the loader, no client-side DB queries"
  - "Purple badge theme: matches bylaw document-type color from document-types.ts for visual consistency"
  - "Normalized pattern display: badges show 'Bylaw No. X' regardless of input format variations"

patterns-established:
  - "Cross-reference detection: pure utility function with DB-backed validation, reusable for future reference types"
  - "Parallel loader queries: new data sources added to existing Promise.all to avoid sequential latency"

requirements-completed: [DOCL-03]

# Metrics
duration: 3min
completed: 2026-02-28
---

# Phase 28 Plan 02: Cross-Reference Detection Summary

**Regex-based bylaw cross-reference detection with inline purple badges and RelatedDocuments section in document viewer**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-28T22:02:59Z
- **Completed:** 2026-02-28T22:06:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Pure utility function detects bylaw mentions (e.g., "Bylaw No. 1059") and resolves against database records, filtering false positives
- Inline purple CrossRefBadge components appear below sections that reference existing bylaws
- RelatedDocuments section at page bottom collects all cross-referenced bylaws with titles and section counts
- 12 unit tests cover extraction, dedup, year suffix handling, false positives, URL construction, and sort order

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cross-reference detection utility and badge components** - `aa99c3e5` (feat)
2. **Task 2: Integrate cross-references into document-viewer loader and page** - `9c556516` (feat)

## Files Created/Modified
- `apps/web/app/lib/cross-references.ts` - Pure utility: detectCrossReferences() with regex matching and DB validation
- `apps/web/app/components/document/CrossRefBadge.tsx` - Inline purple badge with BookOpen icon linking to bylaw pages
- `apps/web/app/components/document/RelatedDocuments.tsx` - Bottom section listing all cross-referenced bylaws with counts
- `apps/web/tests/lib/cross-references.test.ts` - 12 unit tests for detection utility
- `apps/web/app/routes/document-viewer.tsx` - Added bylaws query in loader, renders badges per section and RelatedDocuments

## Decisions Made
- Server-side detection: all cross-reference matching runs in the loader to avoid client-side DB queries
- Purple badge theme (bg-purple-50/text-purple-700): matches the bylaw document-type color from document-types.ts
- Normalized pattern display: badges always show "Bylaw No. X" regardless of input format variations (e.g., "Bylaw No. 1059, 2020")
- Added bylaws query to existing Promise.all to avoid sequential latency (43 rows, 3 fields -- lightweight)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing crossReferences prop on single-column DocumentContent**
- **Found during:** Task 2 (typecheck)
- **Issue:** The replace_all edit only matched one of two DocumentContent usages due to indentation differences
- **Fix:** Added the missing crossReferences prop to the single-column layout branch
- **Files modified:** apps/web/app/routes/document-viewer.tsx
- **Verification:** pnpm typecheck passes
- **Committed in:** 9c556516 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor fix for missed prop, no scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Cross-reference system is complete and ready for production
- Future enhancement: expand detection to other reference types (other documents, policy references)
- All 95 tests pass including 12 new cross-reference tests

## Self-Check: PASSED

- All 5 created/modified files verified on disk
- Commit aa99c3e5 (Task 1) verified in git log
- Commit 9c556516 (Task 2) verified in git log
- 95/95 tests pass (including 12 new cross-reference tests)
- pnpm typecheck passes

---
*Phase: 28-document-navigation*
*Completed: 2026-02-28*
