---
phase: 16-core-data-search-api
plan: 02
subsystem: api
tags: [meetings, people, serializers, endpoints, chanfana, cursor-pagination, hono]

# Dependency graph
requires:
  - phase: 16-core-data-search-api
    provides: "Cursor pagination, response envelope, slug columns on all entity tables"
provides:
  - "Meeting summary and detail serializers (allowlist pattern)"
  - "Person summary and detail serializers with voting summary"
  - "ListMeetings endpoint with cursor pagination and filters (date, type, transcript, organization)"
  - "GetMeeting endpoint with inline agenda item, motion, and attendance summaries"
  - "ListPeople endpoint with cursor pagination, councillor/name filters, membership-based municipality scoping"
  - "GetPerson endpoint with memberships and vote breakdown"
affects: [16-03, 16-04, web-app]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Chanfana OpenAPIRoute endpoint classes with Zod query/params schemas"
    - "Allowlist serializer pattern for API response construction"
    - "Municipality scoping via membership join for tables without municipality_id"
    - "Parallel related-data fetching with Promise.all in detail endpoints"
    - "Inline compact summaries for related entities (slug + title + key fields)"

key-files:
  created:
    - apps/web/app/api/serializers/meeting.ts
    - apps/web/app/api/serializers/person.ts
    - apps/web/app/api/endpoints/meetings/list.ts
    - apps/web/app/api/endpoints/meetings/detail.ts
    - apps/web/app/api/endpoints/people/list.ts
    - apps/web/app/api/endpoints/people/detail.ts
  modified:
    - apps/web/app/api/index.ts

key-decisions:
  - "People scoped to municipality via memberships -> organizations join (people table has no municipality_id)"
  - "Voting summary aggregates Yes/In Favour as votes_for, No/Opposed as votes_against, Abstain/Recused as abstentions"
  - "Person detail verifies municipality membership before returning (prevents cross-municipality leaks)"
  - "Meeting detail fetches agenda items, motions, and attendance as separate parallel queries for inline summaries"

patterns-established:
  - "Allowlist serializer: explicitly list fields in new object, never spread ...row"
  - "List endpoint pattern: Zod query schema, filter with .eq/.gte/.lte, cursor pagination, extractPage, listResponse"
  - "Detail endpoint pattern: slug + municipality lookup, 404 ApiError, Promise.all for related data, detailResponse"
  - "Municipality scoping for junction-only tables: .select('..., memberships!inner(organizations!inner(municipality_id))').eq('memberships.organizations.municipality_id', id)"

requirements-completed: [DATA-01, DATA-02, DATA-03, DATA-04]

# Metrics
duration: 4min
completed: 2026-02-21
---

# Phase 16 Plan 02: Meetings & People Endpoints Summary

**Meeting and people REST endpoints with allowlist serializers, cursor pagination, entity-specific filters, and inline related-data summaries**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-21T19:05:37Z
- **Completed:** 2026-02-21T19:09:27Z
- **Tasks:** 2
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments
- 2 serializer modules with 7 exported functions (meeting summary/detail, agenda item summary, motion summary, attendance summary, person summary/detail)
- 4 chanfana endpoint classes with full Zod schema validation and OpenAPI documentation
- ListMeetings supports cursor pagination + 5 filters (type, date_from, date_to, has_transcript, organization)
- ListPeople handles municipality scoping via membership join, supports is_councillor and partial name search
- Both detail endpoints fetch related data in parallel and return inline compact summaries

## Task Commits

Each task was committed atomically:

1. **Task 1: Create meeting and person serializers plus list/detail endpoints** - `bdcd4e2d` (feat)
2. **Task 2: Register meeting and people routes in Hono app** - No separate commit needed; route registrations were already present in index.ts from a prior 16-03 execution that built on top of the meeting/people routes

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `apps/web/app/api/serializers/meeting.ts` - serializeMeetingSummary, serializeMeetingDetail, serializeAgendaItemSummary, serializeMotionSummary, serializeAttendanceSummary
- `apps/web/app/api/serializers/person.ts` - serializePersonSummary, serializePersonDetail with voting summary derivation
- `apps/web/app/api/endpoints/meetings/list.ts` - ListMeetings with cursor pagination and 5 filters
- `apps/web/app/api/endpoints/meetings/detail.ts` - GetMeeting with parallel related-data fetching
- `apps/web/app/api/endpoints/people/list.ts` - ListPeople with membership-based municipality scoping and deduplication
- `apps/web/app/api/endpoints/people/detail.ts` - GetPerson with municipality verification and vote aggregation
- `apps/web/app/api/index.ts` - 4 route pairs (middleware + openapi.get) for meetings and people

## Decisions Made
- People have no `municipality_id` column, so scoped via inner join through memberships -> organizations -> municipality_id
- Voting summary uses Or-grouped vote values (Yes/In Favour, No/Opposed, Abstain/Recused) to handle both naming conventions in the data
- Person detail endpoint verifies the person belongs to the requested municipality by checking their filtered memberships (prevents cross-municipality data access)
- ListPeople deduplicates results from the membership inner join (a person with multiple memberships would otherwise appear multiple times)

## Deviations from Plan

None - plan executed exactly as written.

Note: Task 2 (route registration) did not require a separate commit because the index.ts already contained the meeting and people route registrations from a prior 16-03 execution that built on top of these routes.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Meeting and people endpoint patterns are established for Plan 03 (matters, motions, bylaws) to follow
- Serializer pattern is proven and can be replicated for remaining entity types
- All 4 endpoints pass typecheck and follow consistent structure

## Self-Check: PASSED

All 7 files verified present. Task 1 commit `bdcd4e2d` verified in git log.

---
*Phase: 16-core-data-search-api*
*Completed: 2026-02-21*
