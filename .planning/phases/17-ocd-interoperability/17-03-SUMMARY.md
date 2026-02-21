---
phase: 17-ocd-interoperability
plan: 03
subsystem: api
tags: [ocd, event, bill, vote, serializer, hono-endpoint, roll-call, open-civic-data]

# Dependency graph
requires:
  - phase: 17-ocd-interoperability
    plan: 01
    provides: UUID v5 OCD ID generation, page-based pagination, OCD response envelope
  - phase: 17-ocd-interoperability
    plan: 02
    provides: OCD router, serializer pattern, endpoint pattern, municipality middleware
  - phase: 15-api-foundation
    provides: Hono router, ApiEnv types, municipality middleware, ApiError
provides:
  - OCD Event list/detail endpoints at /api/ocd/:municipality/events
  - OCD Bill list/detail endpoints at /api/ocd/:municipality/bills
  - OCD Vote list/detail endpoints at /api/ocd/:municipality/votes
  - Event serializer with inline agenda, participants, media, documents
  - Bill serializer with action timeline and sponsors from motion movers
  - Vote serializer with roll call and vote_counts computed from individual votes
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [ocd-event-inline-agenda, ocd-bill-action-timeline, ocd-vote-rollcall-computed, ocd-vote-result-mapping]

key-files:
  created:
    - apps/web/app/api/ocd/serializers/event.ts
    - apps/web/app/api/ocd/serializers/bill.ts
    - apps/web/app/api/ocd/serializers/vote.ts
    - apps/web/app/api/ocd/endpoints/events.ts
    - apps/web/app/api/ocd/endpoints/bills.ts
    - apps/web/app/api/ocd/endpoints/votes.ts
  modified:
    - apps/web/app/api/ocd/router.ts

key-decisions:
  - "Vote counts computed from actual roll call data, not summary columns -- falls back to summary only when no individual votes exist"
  - "Event agenda items inlined in response, not linked by ID -- simplifies consumer parsing"
  - "Bill actions derived from full agenda item timeline (every appearance of matter on an agenda) sorted chronologically"
  - "Bill sponsors deduplicated by person name since same person can move multiple motions for same matter"

patterns-established:
  - "Vote result mapping: CARRIED/CARRIED AS AMENDED -> true, DEFEATED/FAILED -> false, TABLED/WITHDRAWN -> null"
  - "Vote value mapping: Yes/AYE/For -> yes, No/Against -> no, Abstain/Recused -> abstain, Absent/No Vote -> absent"
  - "Meeting type to OCD classification: Regular/Special Council -> meeting, Public Hearing/Board of Variance -> hearing"
  - "PostgREST inner join type casting: cast nested join results via `as any` to work around array-vs-object inference"

requirements-completed: [OCD-04, OCD-05, OCD-06]

# Metrics
duration: 4min
completed: 2026-02-21
---

# Phase 17 Plan 03: Complex OCD Entity Endpoints Summary

**OCD Event, Bill, and Vote endpoints with inline agenda/participants/media, action timeline/sponsors, and roll call with vote counts computed from individual vote records**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-21T21:22:31Z
- **Completed:** 2026-02-21T21:27:10Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- All six OCD entity types (Jurisdiction, Organization, Person, Event, Bill, Vote) now have working list + detail endpoints
- Event details include inline agenda items, participants from attendance, media from video URLs, and documents from agenda/minutes PDFs
- Bill details include full action history (every agenda item appearance sorted chronologically) and sponsors (motion movers deduplicated by name)
- Vote details include roll call from individual vote records with vote_counts computed from actual roll call data for consistency
- Date range filtering on Events and Votes, status filtering on Bills
- All vote result and vote value mappings handle the known data variants from the research phase

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Event, Bill, and Vote serializers** - `02ab6e15` (feat)
2. **Task 2: Create Event, Bill, and Vote endpoints and register routes** - `ef79e514` (feat)

## Files Created/Modified
- `apps/web/app/api/ocd/serializers/event.ts` - Meeting to OCD Event mapping with inline agenda, participants, media, documents
- `apps/web/app/api/ocd/serializers/bill.ts` - Matter to OCD Bill mapping with action timeline and sponsors
- `apps/web/app/api/ocd/serializers/vote.ts` - Motion to OCD Vote mapping with roll call and computed vote counts
- `apps/web/app/api/ocd/endpoints/events.ts` - Event list (with date range filters) and detail handlers
- `apps/web/app/api/ocd/endpoints/bills.ts` - Bill list (with status filter) and detail handlers
- `apps/web/app/api/ocd/endpoints/votes.ts` - Vote list (with date range filters) and detail handlers
- `apps/web/app/api/ocd/router.ts` - Updated with Event, Bill, Vote route registrations

## Decisions Made
- Vote counts computed from actual roll call data (not summary columns) for data consistency -- falls back to summary columns only when no individual votes exist
- Event agenda items are inlined in the response (not linked by ID) to simplify consumer parsing
- Bill actions use the full agenda item timeline (every time a matter appeared on an agenda), sorted by meeting date ascending
- Bill sponsors are deduplicated by person name since the same person may move multiple motions for the same matter
- PostgREST inner join results cast via `as any` to work around TypeScript array-vs-object type inference on FK joins

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed PostgREST join type inference**
- **Found during:** Task 2 (Vote endpoint implementation)
- **Issue:** TypeScript treated `meeting:meetings!inner(...)` and `matter:matters(...)` PostgREST joins as array types instead of single objects, causing property access errors
- **Fix:** Cast nested join results via `as any` before accessing properties, consistent with how the rest of the codebase handles PostgREST join ambiguity
- **Files modified:** apps/web/app/api/ocd/endpoints/votes.ts
- **Verification:** TypeScript compiles cleanly, production build succeeds
- **Committed in:** ef79e514 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type casting fix necessary for PostgREST join handling. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All six OCD entity types complete with full list + detail endpoints
- Phase 17 OCD interoperability layer is fully built
- All routes registered in the OCD router and discoverable via GET /api/ocd/:municipality/
- Production build succeeds with all OCD routes included

## Self-Check: PASSED

---
*Phase: 17-ocd-interoperability*
*Completed: 2026-02-21*
