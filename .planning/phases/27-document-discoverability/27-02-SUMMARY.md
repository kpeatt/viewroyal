---
phase: 27-document-discoverability
plan: 02
subsystem: ui, api
tags: [react, supabase, react-router, document-types, matter-timeline]

requires:
  - phase: 26-document-viewer-core
    provides: Document viewer route at /meetings/:id/documents/:docId
  - phase: 27-document-discoverability
    provides: Document type utilities (getDocumentTypeLabel, getDocumentTypeColor)
provides:
  - getDocumentsForAgendaItems batch query function in matters service
  - Document chips rendered per timeline entry on matter detail page
  - Complete document trail for matters across meetings
affects: [matter-detail, matters-service]

tech-stack:
  added: []
  patterns:
    - "Batch .in() query for cross-table document lookup"
    - "IIFE pattern in JSX for local variable extraction"

key-files:
  created: []
  modified:
    - apps/web/app/services/matters.ts
    - apps/web/app/routes/matter-detail.tsx

key-decisions:
  - "Separate getDocumentsForAgendaItems function rather than extending getMatterById select string (already very long)"
  - "Slim metadata columns only (no summary, key_facts, section_text) since matter page only shows chips"

patterns-established:
  - "Batch document lookup: collect agenda_item_ids -> .in() query -> Map<id, docs[]> for O(1) per-item access"

requirements-completed: [DOCL-02]

duration: 3min
completed: 2026-02-28
---

# Phase 27 Plan 02: Matter Timeline Document Chips Summary

**Batch document query service + document chips with type badges and links on matter timeline entries**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-28T18:15:31Z
- **Completed:** 2026-02-28T18:18:56Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `getDocumentsForAgendaItems` batch query function using `.in()` pattern per project conventions
- Wired document chips into matter-detail timeline showing type badge + truncated title per entry
- Each chip navigates to /meetings/:meetingId/documents/:docId
- Timeline entries without documents render cleanly with no visual gap

## Task Commits

Each task was committed atomically:

1. **Task 1: Create getDocumentsForAgendaItems service function** - `e4ebe3bd` (feat)
2. **Task 2: Wire document chips into matter-detail loader and timeline** - `8c3b4caf` (feat)

## Files Created/Modified
- `apps/web/app/services/matters.ts` - New getDocumentsForAgendaItems function with slim select and batch .in() query
- `apps/web/app/routes/matter-detail.tsx` - Updated loader to fetch documents, added docsByItem Map, rendered document chips in timeline

## Decisions Made
- Kept getDocumentsForAgendaItems as a separate function rather than extending the already-long getMatterById select string
- Only fetches display columns (id, document_id, agenda_item_id, title, document_type, page_start, page_end) -- no summary or section text since chips only need metadata

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Matter document service and timeline display complete
- Phase 28 (Document Navigation) can now reference matter document service for cross-references

---
*Phase: 27-document-discoverability*
*Completed: 2026-02-28*
