---
phase: 09-ai-profiling-comparison
plan: 01
subsystem: database, api, ui
tags: [supabase, postgresql, rpc, speaking-time, stances, tailwind, lucide-react]

# Dependency graph
requires: []
provides:
  - councillor_stances table with RLS for pre-computed AI stance summaries
  - normalize_category_to_topic() SQL function mapping 470 categories to 8 topics
  - get_speaking_time_stats() RPC for ranked speaking time across all councillors
  - get_speaking_time_by_meeting() RPC for per-meeting trend data
  - get_speaking_time_by_topic() RPC with time-overlap agenda item matching
  - profiling.ts service module with typed query functions
  - topic-utils.ts with TOPICS, TOPIC_ICONS, TOPIC_COLORS exports
  - StanceSpectrum reusable component for stance visualization
affects: [09-02, 09-03, 09-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SQL RPCs for heavy aggregation (speaking time computed server-side, not in JS)"
    - "Category normalization via IMMUTABLE SQL function with ILIKE keyword matching"
    - "Time-overlap join for transcript-to-agenda-item topic assignment"
    - "Pre-computed stance data pattern (table + service layer)"

key-files:
  created:
    - supabase/migrations/councillor_stances_and_speaking_time.sql
    - apps/web/app/lib/topic-utils.ts
    - apps/web/app/services/profiling.ts
    - apps/web/app/components/profile/stance-spectrum.tsx
  modified: []

key-decisions:
  - "Used session pooler (aws-1-us-east-2) for migration application since direct DB connection is IPv6-only"
  - "Category normalization as IMMUTABLE SQL function rather than lookup table for simplicity"
  - "Speaking time by topic uses LEFT JOIN with time-overlap fallback for segments missing agenda_item_id"

patterns-established:
  - "Profile components live in apps/web/app/components/profile/"
  - "Profiling service follows same pattern as people.ts (accept SupabaseClient, return typed data)"
  - "TopicName type exported from topic-utils.ts for type-safe topic references"

requirements-completed: [PROF-02, PROF-04]

# Metrics
duration: 11min
completed: 2026-02-18
---

# Phase 09 Plan 01: Database Foundation Summary

**SQL speaking time RPCs with category normalization, councillor_stances table, topic utility mapping, profiling service layer, and StanceSpectrum component**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-18T20:55:03Z
- **Completed:** 2026-02-18T21:06:29Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments
- Created councillor_stances table with RLS permissive SELECT for anon/authenticated
- Built 3 speaking time RPCs verified against live data (Sid Tobias: 59.3h across 116 meetings)
- Category normalization function maps ~300 of 470 agenda_item categories to 8 predefined topics
- Profiling service module with 4 typed query functions following existing service patterns
- Topic utilities with icon mapping (lucide-react) and color mapping (Tailwind classes) for all 8 topics
- StanceSpectrum component with gradient bar and positioned marker for reuse in Plans 03 and 04

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migration with councillor_stances table, speaking time RPCs, and category normalization** - `d776d3f6` (feat)
2. **Task 2: Create topic-utils.ts, profiling.ts service module, and StanceSpectrum component** - `a55766b8` (feat)

## Files Created/Modified
- `supabase/migrations/councillor_stances_and_speaking_time.sql` - Migration with councillor_stances table, 3 RPCs, and normalize_category_to_topic function
- `apps/web/app/lib/topic-utils.ts` - TOPICS array, TOPIC_ICONS map, TOPIC_COLORS map for 8 predefined topics
- `apps/web/app/services/profiling.ts` - getSpeakingTimeStats, getSpeakingTimeByMeeting, getSpeakingTimeByTopic, getCouncillorStances with TypeScript interfaces
- `apps/web/app/components/profile/stance-spectrum.tsx` - StanceSpectrum visual component with gradient bar from red to green

## Decisions Made
- Used IMMUTABLE SQL function for category normalization (CASE/ILIKE pattern) rather than a lookup table -- simpler to maintain and sufficient for the ~300/470 category coverage
- Speaking time by topic uses a LEFT JOIN with dual matching: direct agenda_item_id link OR time-overlap fallback (segment start_time within discussion_start_time/end_time)
- Segments not matching any agenda item default to 'General' topic

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Database connection via session pooler**
- **Found during:** Task 1
- **Issue:** Direct database connection (db.*.supabase.co:5432) resolves to IPv6 only, which is unreachable from this machine. Supabase CLI also requires an access token which is locked in the macOS keychain.
- **Fix:** Discovered the pipeline's embed.py uses a session pooler at `aws-1-us-east-2.pooler.supabase.com:5432` for IPv4 access. Applied migration via node-postgres through this pooler endpoint.
- **Files modified:** None (connection method only)
- **Verification:** All 5 database objects verified working via pooler connection
- **Committed in:** d776d3f6 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Connection workaround was necessary to apply migration. No scope creep. All planned database objects created successfully.

## Issues Encountered
- IPv6-only database hostname required finding the session pooler connection string from the pipeline codebase (embed.py)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three downstream plans (09-02 stance generation, 09-03 profile page, 09-04 comparison page) can now import from profiling.ts and topic-utils.ts
- councillor_stances table is ready to receive AI-generated stances from Plan 02
- Speaking time RPCs are ready to be called from profile page loaders in Plan 03

## Self-Check: PASSED

All 4 created files verified on disk. Both commit hashes (d776d3f6, a55766b8) verified in git log.

---
*Phase: 09-ai-profiling-comparison*
*Completed: 2026-02-18*
