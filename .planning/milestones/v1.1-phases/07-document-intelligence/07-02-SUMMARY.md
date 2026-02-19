---
phase: 07-document-intelligence
plan: 02
subsystem: ui, pipeline
tags: [react, accordion, supabase, pdf-chunking, cli, backfill, document-sections]

# Dependency graph
requires:
  - phase: 07-document-intelligence-01
    provides: document_sections table, document_chunker.py, embed.py TABLE_CONFIG entry
provides:
  - DocumentSections accordion component on meeting detail pages
  - getDocumentSectionsForMeeting() Supabase query function
  - DocumentSection TypeScript interface
  - --backfill-sections CLI flag with --force option and two-pass approach
  - backfill_document_sections() method on Archiver class
affects: [08-unified-search, rag-qa]

# Tech tracking
tech-stack:
  added: []
  patterns: [grid-rows CSS animation for accordion expand/collapse, two-step Supabase query via documents table for sections]

key-files:
  created:
    - apps/web/app/components/meeting/DocumentSections.tsx
  modified:
    - apps/web/app/lib/types.ts
    - apps/web/app/services/meetings.ts
    - apps/web/app/components/meeting/AgendaOverview.tsx
    - apps/web/app/routes/meeting-detail.tsx
    - apps/pipeline/main.py
    - apps/pipeline/pipeline/orchestrator.py

key-decisions:
  - "Document sections fetched via two-step query (documents -> document_sections) since sections lack direct meeting_id"
  - "Sections rendered after Motions and before Keywords in agenda item expanded content"
  - "Backfill two-pass: sections created first for resilience, embeddings generated second via existing _embed_new_content()"

patterns-established:
  - "Two-step Supabase query pattern: fetch parent IDs first, then .in() filter on child table"
  - "Accordion with grid-rows animation for expandable content sections"

requirements-completed: [DOC-05]

# Metrics
duration: 4min
completed: 2026-02-17
---

# Phase 7 Plan 2: Document Sections Display and Backfill CLI Summary

**DocumentSections accordion UI on meeting pages with --backfill-sections two-pass CLI command for retroactive document processing**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-17T16:29:41Z
- **Completed:** 2026-02-17T16:33:23Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Document sections display as expandable accordions under linked agenda items on meeting detail pages
- Section titles visible without expanding; click expands to show full text with page numbers
- `--backfill-sections` CLI flag processes all existing documents into sections with idempotent skip-if-exists behavior
- Two-pass backfill (sections first, embeddings second) ensures resilience -- partial failures leave sections in DB for later embedding

## Task Commits

Each task was committed atomically:

1. **Task 1: Add DocumentSection type, service, and accordion UI on meeting pages** - `55703dac` (feat)
2. **Task 2: Add --backfill-sections CLI flag with two-pass backfill** - `b1045d34` (feat)

## Files Created/Modified
- `apps/web/app/components/meeting/DocumentSections.tsx` - Accordion component with grid-rows animation for expandable document sections
- `apps/web/app/lib/types.ts` - Added DocumentSection interface
- `apps/web/app/services/meetings.ts` - Added getDocumentSectionsForMeeting() two-step query
- `apps/web/app/components/meeting/AgendaOverview.tsx` - Integrated DocumentSections into expanded agenda item content
- `apps/web/app/routes/meeting-detail.tsx` - Loader fetches document sections, passes to AgendaOverview
- `apps/pipeline/main.py` - Added --backfill-sections and --force CLI arguments
- `apps/pipeline/pipeline/orchestrator.py` - Added backfill_document_sections() method to Archiver class

## Decisions Made
- Document sections fetched via two-step query (documents table first, then document_sections via .in()) because sections don't have a direct meeting_id column
- Sections rendered after Motions and before Keywords in the agenda item expanded content area
- Backfill uses two-pass approach: sections created first (resilience), embeddings generated second via existing _embed_new_content() which picks up NULL embeddings automatically

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Document intelligence phase complete -- sections schema, chunker, display, and backfill all ready
- Run `uv run python main.py --backfill-sections` to retroactively process existing documents
- Future phases (unified search, RAG Q&A) can query document_sections via match_document_sections RPC

## Self-Check: PASSED

- FOUND: apps/web/app/components/meeting/DocumentSections.tsx
- FOUND: apps/web/app/lib/types.ts
- FOUND: apps/web/app/services/meetings.ts
- FOUND: apps/web/app/components/meeting/AgendaOverview.tsx
- FOUND: apps/web/app/routes/meeting-detail.tsx
- FOUND: apps/pipeline/main.py
- FOUND: apps/pipeline/pipeline/orchestrator.py
- FOUND: .planning/phases/07-document-intelligence/07-02-SUMMARY.md
- FOUND: commit 55703dac (Task 1)
- FOUND: commit b1045d34 (Task 2)

---
*Phase: 07-document-intelligence*
*Completed: 2026-02-17*
