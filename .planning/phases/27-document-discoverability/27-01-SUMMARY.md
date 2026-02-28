---
phase: 27-document-discoverability
plan: 01
subsystem: ui
tags: [react, lucide-react, react-router, document-viewer]

requires:
  - phase: 26-document-viewer-core
    provides: Document viewer route at /meetings/:id/documents/:docId
provides:
  - "View full document" link in expanded document accordion groups
  - Document count chip in agenda item metadata row
  - meetingId prop threading through AgendaOverview and DocumentSections
affects: [meeting-detail, document-viewer]

tech-stack:
  added: []
  patterns:
    - "meetingId prop threading from route to nested components"

key-files:
  created: []
  modified:
    - apps/web/app/components/meeting/DocumentSections.tsx
    - apps/web/app/components/meeting/AgendaOverview.tsx
    - apps/web/app/routes/meeting-detail.tsx

key-decisions:
  - "Used indigo-600 color for document link and chip to visually distinguish from blue navigation links"

patterns-established:
  - "meetingId threading: route -> AgendaOverview -> AgendaItemRow -> DocumentSections"

requirements-completed: [DOCL-01]

duration: 3min
completed: 2026-02-28
---

# Phase 27 Plan 01: Document Links and Count Chips Summary

**"View full document" links in expanded document accordion and doc count chips in agenda item metadata row**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-28T18:15:31Z
- **Completed:** 2026-02-28T18:18:56Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Added "View full document" link at bottom of each expanded document group, linking to /meetings/:meetingId/documents/:docId
- Added document count chip (e.g. "2 docs") in agenda item metadata row alongside motions, discussion time, and financial cost
- Threaded meetingId prop through meeting-detail -> AgendaOverview -> AgendaItemRow -> DocumentSections

## Task Commits

Each task was committed atomically:

1. **Task 1: Add "View full document" link and thread meetingId prop** - `edc558a4` (feat)

## Files Created/Modified
- `apps/web/app/components/meeting/DocumentSections.tsx` - Added meetingId prop, Link import, "View full document" link with ChevronRight icon
- `apps/web/app/components/meeting/AgendaOverview.tsx` - Added meetingId prop to interfaces, FileText import, doc count chip in metadata row
- `apps/web/app/routes/meeting-detail.tsx` - Pass meetingId={meeting.id} to AgendaOverview

## Decisions Made
- Used indigo-600 color for document links and chips to visually differentiate from blue navigation links and amber motion chips

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Document discoverability on meeting detail page complete
- Ready for Phase 28 (Document Navigation) which depends on polished viewer and matter document service

---
*Phase: 27-document-discoverability*
*Completed: 2026-02-28*
