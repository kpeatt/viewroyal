---
phase: 26-meeting-provenance
plan: 01
subsystem: ui
tags: [react, tailwind, lucide-react, supabase, provenance]

requires:
  - phase: 25-document-viewer-polish
    provides: Document viewer and typography foundation
provides:
  - ProvenanceBadges component with normal and compact modes
  - formatRelativeTime utility function
  - updated_at column on meetings table
affects: [27-document-discoverability, 28-document-navigation]

tech-stack:
  added: []
  patterns:
    - "Provenance badge pattern: detect source availability via has_* booleans, link via *_url fields"

key-files:
  created:
    - apps/web/app/components/meeting/ProvenanceBadges.tsx
  modified:
    - apps/web/app/lib/types.ts
    - apps/web/app/lib/utils.ts
    - apps/web/app/services/meetings.ts
    - apps/web/app/routes/meeting-detail.tsx
    - apps/web/app/components/meeting-card.tsx

key-decisions:
  - "Unified neutral color scheme for all badges instead of distinct colors per source type"
  - "Video badge replaces Watch on Vimeo button entirely"

patterns-established:
  - "Source availability: has_agenda/has_minutes/has_transcript booleans; URLs: agenda_url/minutes_url/video_url"

requirements-completed: [PROV-01, PROV-02, PROV-03]

duration: 3min
completed: 2026-02-27
---

# Phase 26 Plan 01: Meeting Provenance Badges Summary

**Provenance pill badges (Agenda, Minutes, Video) on meeting detail and card with "Updated X ago" timestamp and direct source links**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-27T20:04:54Z
- **Completed:** 2026-02-27T20:08:07Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Applied `updated_at` migration to meetings table with auto-update trigger
- Created reusable ProvenanceBadges component with normal (icon + label + link) and compact (icon-only) modes
- Integrated provenance row into meeting detail header with "Updated X ago" relative timestamp
- Replaced "Watch on Vimeo" button and colored icon cluster with unified provenance badges

## Task Commits

Each task was committed atomically:

1. **Task 1: Add updated_at column and update types/services** - `0520e75c` (feat)
2. **Task 2: Create ProvenanceBadges component** - `13488144` (feat)
3. **Task 3: Integrate badges into meeting detail and meeting card** - `2121ccde` (feat)

## Files Created/Modified
- `apps/web/app/components/meeting/ProvenanceBadges.tsx` - New reusable provenance badge component
- `apps/web/app/lib/types.ts` - Added updated_at to Meeting interface
- `apps/web/app/lib/utils.ts` - Added formatRelativeTime utility
- `apps/web/app/services/meetings.ts` - Added updated_at to both select strings
- `apps/web/app/routes/meeting-detail.tsx` - Added provenance row, removed Watch on Vimeo button
- `apps/web/app/components/meeting-card.tsx` - Replaced icon cluster with compact ProvenanceBadges

## Decisions Made
- Unified neutral color scheme (zinc) for all badges rather than distinct colors per source type
- Video provenance badge fully replaces the Watch on Vimeo button

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase complete, ready for transition
- ProvenanceBadges component available for reuse in Phase 27 (document discoverability) and Phase 28 (document navigation)

---
*Phase: 26-meeting-provenance*
*Completed: 2026-02-27*
