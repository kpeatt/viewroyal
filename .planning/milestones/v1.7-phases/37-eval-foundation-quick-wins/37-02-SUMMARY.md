---
phase: 37-eval-foundation-quick-wins
plan: 02
subsystem: ui
tags: [motion-normalization, badges, meeting-cards, topic-chips, supabase-rpc]

requires:
  - phase: 09-ai-profiling-comparison
    provides: normalize_category_to_topic SQL function and topic taxonomy

provides:
  - normalizeMotionResult utility mapping 11 raw DB values to 4 categories
  - MotionOutcomeBadge shared component replacing 17 inline implementations
  - Enhanced MeetingCard with topic chips, motion tally, truncated summary
  - get_meetings_with_stats SQL RPC for meeting list enrichment
  - MeetingStats type and service integration

affects: [38-search-and-rag-quality, 39-council-profiles-topics, meeting-detail, search]

tech-stack:
  added: []
  patterns: [motion-result-normalization, shared-badge-component]

key-files:
  created:
    - apps/web/app/lib/motion-utils.ts
    - apps/web/app/lib/__tests__/motion-utils.test.ts
    - apps/web/app/components/motion-outcome-badge.tsx
    - supabase/migrations/37-02-meeting-stats-rpc.sql
  modified:
    - apps/web/app/components/meeting-card.tsx
    - apps/web/app/services/meetings.ts
    - apps/web/app/routes/meetings.tsx
    - apps/web/app/components/meeting/MotionsOverview.tsx
    - apps/web/app/components/meeting/AgendaOverview.tsx
    - apps/web/app/components/search/result-card.tsx
    - apps/web/app/components/home/decisions-feed-section.tsx
    - apps/web/app/components/motion-card.tsx
    - apps/web/app/components/meeting-timeline.tsx
    - apps/web/app/components/agenda-card.tsx
    - apps/web/app/components/meeting/MeetingQuickStats.tsx
    - apps/web/app/components/meeting/VideoWithSidebar.tsx
    - apps/web/app/components/meeting/EnhancedVideoScrubber.tsx
    - apps/web/app/components/home/recent-meeting-section.tsx
    - apps/web/app/components/meeting-feed.tsx
    - apps/web/app/routes/person-proposals.tsx
    - apps/web/app/routes/person-votes.tsx
    - apps/web/app/routes/meeting-detail.tsx
    - apps/web/tests/services/meetings.test.ts

key-decisions:
  - "Tests placed in app/lib/__tests__/ with vitest include pattern updated"
  - "RPC returns all meetings stats at once (not filtered) for simplicity"
  - "Topic chips exclude General to reduce noise on cards"

patterns-established:
  - "normalizeMotionResult: always use for motion result comparisons instead of raw string matching"
  - "MotionOutcomeBadge: always use for rendering motion outcomes instead of inline color logic"

requirements-completed: [MTGX-01, MTGX-02]

duration: 8min
completed: 2026-03-06
---

# Phase 37 Plan 02: Motion Outcome Badges and Enhanced Meeting Cards Summary

**normalizeMotionResult utility handling 11 DB values, MotionOutcomeBadge replacing inline badges across 17 files, enhanced MeetingCard with topic chips and motion tallies**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-06T03:09:36Z
- **Completed:** 2026-03-06T03:18:00Z
- **Tasks:** 2
- **Files modified:** 24

## Accomplishments
- Created normalizeMotionResult utility with RESULT_MAP covering all 11 raw database values including the "CARRRIED" typo, mapping to 4 display categories (passed/failed/tabled/withdrawn)
- Created MotionOutcomeBadge shared component with consistent color-coded rendering (green/red/yellow/gray) and optional vote count display
- Enhanced MeetingCard with topic indicator chips from agenda categories, motion tally (carried/defeated counts), and truncated summary text
- Swept 17 files to replace inline CARRIED/DEFEATED badge logic with the shared component
- Added get_meetings_with_stats SQL RPC that joins motions and agenda items for aggregate stats
- All 199 tests pass (including 20 new motion-utils tests), production build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Motion utilities, badge component, and meeting stats RPC** - `ac81df9e` (feat - TDD)
2. **Task 2: Enhanced meeting cards and motion badge sweep** - `2c61c848` (feat)

## Files Created/Modified
- `apps/web/app/lib/motion-utils.ts` - normalizeMotionResult, RESULT_MAP, OUTCOME_STYLES, OUTCOME_LABELS
- `apps/web/app/lib/__tests__/motion-utils.test.ts` - 20 unit tests covering all 11 values + edge cases
- `apps/web/app/components/motion-outcome-badge.tsx` - Shared MotionOutcomeBadge component
- `supabase/migrations/37-02-meeting-stats-rpc.sql` - get_meetings_with_stats RPC function
- `apps/web/app/components/meeting-card.tsx` - Enhanced with topic chips, motion tally, truncated summary
- `apps/web/app/services/meetings.ts` - Added MeetingStats type and RPC integration
- `apps/web/app/routes/meetings.tsx` - Pass statsMap to MeetingCard
- 15 additional files with inline badge logic replaced by MotionOutcomeBadge

## Decisions Made
- Tests placed in `app/lib/__tests__/` colocated with source, vitest config updated to include that pattern
- RPC fetches stats for all meetings at once rather than filtering to the current page, since stats are small and the RPC is STABLE (cacheable)
- Topic chips exclude "General" to reduce visual noise and show only meaningful topic categories
- Filter/grouping logic in MotionsOverview and MeetingTabs left as raw string comparisons (plan specified not to change filter logic, only badge rendering)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated vitest config include pattern**
- **Found during:** Task 1 (TDD RED phase)
- **Issue:** vitest.config.ts only included `tests/**/*.test.ts`, plan-specified `app/lib/__tests__/` path would not be picked up
- **Fix:** Added `app/**/__tests__/**/*.test.ts` to vitest include array
- **Files modified:** apps/web/vitest.config.ts
- **Committed in:** ac81df9e

**2. [Rule 3 - Blocking] Updated existing meeting service tests for new return type**
- **Found during:** Task 2 (getMeetings return shape change)
- **Issue:** getMeetings now returns `{ meetings, statsMap }` instead of array, existing tests would fail
- **Fix:** Added rpc mock to createMockSupabase, updated result assertions
- **Files modified:** apps/web/tests/services/meetings.test.ts
- **Committed in:** 2c61c848

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary for test infrastructure and backward compatibility. No scope creep.

## Issues Encountered
- Pre-existing typecheck error in `api.feedback.tsx` (untracked file with missing type declarations) -- not caused by this plan, documented but not fixed

## User Setup Required
- SQL migration `supabase/migrations/37-02-meeting-stats-rpc.sql` needs to be applied to the Supabase database for meeting stats to appear on cards

## Next Phase Readiness
- Motion normalization utility ready for use by any future feature
- MotionOutcomeBadge established as the canonical way to render motion outcomes
- Meeting cards ready to display enriched data once the RPC migration is applied
- Phase 38 (Search & RAG Quality) can build on the normalizeMotionResult patterns

---
*Phase: 37-eval-foundation-quick-wins*
*Completed: 2026-03-06*
