---
phase: 05-advanced-subscriptions
plan: 02
subsystem: ui
tags: [react, onboarding, settings, subscriptions, geocoding, wizard, tailwind, shadcn]

# Dependency graph
requires:
  - phase: 05-advanced-subscriptions
    provides: "Topics table, keyword subscription columns, geocoding API route, onboarding_completed flag, update_user_location RPC"
  - phase: 03-subscriptions-notifications
    provides: "Subscription service layer, subscribe API route, SubscribeButton component"
provides:
  - "Multi-step onboarding wizard at /onboarding (topics, location, digest)"
  - "Root loader redirect for new users to onboarding"
  - "Enhanced settings page with topic/keyword/neighbourhood subscription management"
  - "Address geocoding with visual feedback on settings and onboarding"
  - "Upsert-based subscription creation to prevent duplicate key errors"
affects: [05-advanced-subscriptions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-step wizard using React state with step indicator UI"
    - "Root loader redirect pattern: check onboarding_completed, exclude /onboarding /logout /api/* /login paths"
    - "Upsert with composite onConflict for subscription deduplication"
    - "Inline topic category checkbox toggle via fetch to /api/subscribe"

key-files:
  created: []
  modified:
    - "apps/web/app/routes/onboarding.tsx"
    - "apps/web/app/root.tsx"
    - "apps/web/app/routes/settings.tsx"
    - "apps/web/app/services/subscriptions.ts"

key-decisions:
  - "Used React state (not URL params) for wizard step management for smoother UX"
  - "Root loader excludes /onboarding, /logout, /api/*, /login from redirect to prevent loops"
  - "Switched addSubscription and addKeywordSubscription from insert to upsert to handle re-subscribing without errors"
  - "Explicitly set all nullable columns to null in upsert rows so composite onConflict matching works correctly"

patterns-established:
  - "Onboarding wizard pattern: collect state across steps, submit as single form action on finish"
  - "Settings topic management: immediate toggle via fetch (no form submit needed)"
  - "Upsert pattern for subscriptions: always specify all onConflict columns with explicit null values"

requirements-completed: [SUB-03, SUB-04, SUB-05]

# Metrics
duration: ~20min
completed: 2026-02-17
---

# Phase 05 Plan 02: Onboarding Wizard and Settings Enhancement Summary

**3-step onboarding wizard (topics, location, digest) with root loader redirect, enhanced settings page with topic/keyword management, and upsert-based subscription deduplication**

## Performance

- **Duration:** ~20 min (across checkpoint pause)
- **Started:** 2026-02-17T04:26:00Z
- **Completed:** 2026-02-17T05:02:00Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 4

## Accomplishments
- Built multi-step onboarding wizard at /onboarding with 3 steps: topic category selection with keyword input, address geocoding with neighbourhood picker, and meeting digest opt-in
- Added root loader redirect logic so new users (onboarding_completed = false) are sent to /onboarding after login, with exclusions for /onboarding, /logout, /api/*, and /login paths
- Enhanced settings page with topic category checkboxes (immediate toggle via fetch), keyword subscription management (add/remove badges), address geocoding with visual feedback, and simplified digest toggle
- Fixed subscription duplicate key error by switching addSubscription and addKeywordSubscription from insert() to upsert() with composite unique constraint

## Task Commits

Each task was committed atomically:

1. **Task 1: Create onboarding wizard and add root loader redirect** - `62fcc9c3` (feat)
2. **Task 2: Enhance settings page with topic/keyword subscription management** - `e99103a5` (feat)
3. **Task 3: Verify onboarding wizard and settings page** - N/A (human-verify checkpoint, approved)

**Upsert fix (post-checkpoint):** `7a43ad1d` (fix)

## Files Created/Modified
- `apps/web/app/routes/onboarding.tsx` - Full 3-step onboarding wizard with topic selection, address geocoding, neighbourhood picker, digest opt-in, and batch submission
- `apps/web/app/root.tsx` - Added onboarding redirect logic in root loader for users with onboarding_completed = false
- `apps/web/app/routes/settings.tsx` - Enhanced with topic category checkboxes, keyword subscription input/badges, address geocoding feedback, proximity radius control, simplified digest toggle
- `apps/web/app/services/subscriptions.ts` - Changed addSubscription and addKeywordSubscription from insert() to upsert() with composite onConflict to prevent duplicate key errors

## Decisions Made
- Used React state for wizard step management instead of URL search params for smoother transitions
- Root loader redirect excludes /onboarding, /logout, /api/*, and /login to prevent infinite redirect loops
- Switched subscription creation to upsert to gracefully handle users re-subscribing to the same topic/keyword
- Explicit null values for all nullable columns in upsert rows ensure the composite unique constraint matches correctly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed subscription duplicate key error with upsert**
- **Found during:** Task 3 verification (human-verify checkpoint)
- **Issue:** Re-subscribing to the same topic category or keyword threw a duplicate key violation because addSubscription and addKeywordSubscription used insert() instead of upsert()
- **Fix:** Changed both functions to use upsert() with onConflict on the composite unique constraint (user_id, type, matter_id, topic_id, person_id, neighborhood, keyword). All nullable columns explicitly set to null in the row object so PostgreSQL can match the constraint correctly.
- **Files modified:** apps/web/app/services/subscriptions.ts
- **Verification:** User confirmed onboarding and settings pages work correctly after fix
- **Committed in:** `7a43ad1d`

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Essential fix for correct subscription behavior. No scope creep.

## Issues Encountered
- Subscription duplicate key constraint violation discovered during human verification -- the onConflict composite constraint required explicit null values for all nullable columns, not just omitting them. Fixed by building the full row object with null defaults before passing to upsert().

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Onboarding wizard and settings page are complete and verified end-to-end
- New users will be redirected to onboarding after first login
- Existing users can manage all subscription types from /settings
- Plan 03 (send-alerts enhancement) can reference topic and keyword subscriptions for digest highlighting

## Self-Check: PASSED

All 4 modified files verified on disk. All 3 commits (62fcc9c3, e99103a5, 7a43ad1d) verified in git log.

---
*Phase: 05-advanced-subscriptions*
*Completed: 2026-02-17*
