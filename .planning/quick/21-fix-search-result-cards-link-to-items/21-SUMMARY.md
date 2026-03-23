---
phase: 21-fix-search-result-cards-link-to-items
plan: 01
subsystem: ui, api
tags: [search, deep-links, supabase-rpc, react-router]

requires:
  - phase: 31-01
    provides: hybrid search RPCs with date filtering

provides:
  - Type-specific deep links for all search result types
  - agenda_item_id exposed from motions and key_statements search
  - document_id exposed from document_sections search

affects: [search, hybrid-search, result-card]

tech-stack:
  added: []
  patterns: [getResultUrl switch pattern for type-specific URL resolution]

key-files:
  created:
    - supabase/migrations/21-01-add-agenda-item-id-to-motions-search.sql
  modified:
    - apps/web/app/services/hybrid-search.server.ts
    - apps/web/app/components/search/result-card.tsx

key-decisions:
  - "Used undefined (not null) for optional fields to keep interface clean"
  - "Document sections without document_id fall back to /documents listing page"

patterns-established:
  - "getResultUrl(): centralized URL resolution for search results by type"

requirements-completed: [SEARCH-LINK-01]

duration: 1min
completed: 2026-03-23
---

# Quick Task 21: Fix Search Result Card Links Summary

**Type-specific deep links for search results: motions/statements anchor to agenda items, documents link to viewer, transcripts jump to timestamp**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-23T18:43:23Z
- **Completed:** 2026-03-23T18:44:47Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Motion and key_statement search results now link to `/meetings/{id}#agenda-{agenda_item_id}` for direct context
- Document section results link to `/meetings/{id}/documents/{document_id}` viewer
- Transcript segment results continue linking to `/meetings/{id}#t={start_time}`
- All result types gracefully fall back to meeting page when specific IDs are missing
- Search click analytics now include destination URL

## Task Commits

Each task was committed atomically:

1. **Task 1: Add agenda_item_id to motions search RPC** - `3c9d529e` (feat)
2. **Task 2: Plumb new fields through service layer and update result card links** - `0463b45e` (feat)

## Files Created/Modified
- `supabase/migrations/21-01-add-agenda-item-id-to-motions-search.sql` - Updated RPC to return agenda_item_id for motions
- `apps/web/app/services/hybrid-search.server.ts` - Added agenda_item_id and document_id to UnifiedSearchResult, plumbed from RPC responses
- `apps/web/app/components/search/result-card.tsx` - Added getResultUrl() with type-specific URL logic, destination analytics

## Decisions Made
- Used `undefined` (not `null`) for optional agenda_item_id/document_id fields since they are truly optional interface properties
- Document sections without a document_id fall back to the `/documents` listing page rather than the meeting overview
- Migration needs to be applied to production via Supabase SQL editor or `supabase db push`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Database migration required.** The SQL migration `21-01-add-agenda-item-id-to-motions-search.sql` must be applied to the production Supabase database. Run via Supabase SQL editor or `npx supabase db push`.

## Next Phase Readiness
- Deep links will work immediately for key_statements and document_sections (already return needed IDs)
- Motion deep links require the migration to be applied to production
- No further changes needed

---
*Phase: 21-fix-search-result-cards-link-to-items*
*Completed: 2026-03-23*
