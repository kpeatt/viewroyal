---
phase: 06-gap-closure-cleanup
plan: 01
subsystem: api, ui
tags: [supabase, subscriptions, geocoding, settings, signup, home]

# Dependency graph
requires:
  - phase: 05-advanced-subscriptions
    provides: subscription system, onboarding wizard, settings page, geocoding endpoint
provides:
  - Active matters limit corrected to 6
  - Neighborhood subscription check in checkSubscription
  - Dead addKeywordSubscription code removed
  - api.subscribe GET supports neighborhood/digest types
  - Geocode bounded=0 matching pipeline
  - Digest frequency selector in settings
  - Signup redirect defaults to /onboarding
  - Home loader municipality duplication documented
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "String-based subscription lookup for neighborhood type (vs numeric ID for matter/person/topic)"

key-files:
  created: []
  modified:
    - apps/web/app/services/site.ts
    - apps/web/app/services/subscriptions.ts
    - apps/web/app/routes/api.subscribe.tsx
    - apps/web/app/routes/api.geocode.tsx
    - apps/web/app/routes/settings.tsx
    - apps/web/app/routes/signup.tsx
    - apps/web/app/routes/home.tsx

key-decisions:
  - "checkSubscription uses separate code path for neighborhood type (string-based) vs numeric ID types"
  - "DigestFrequency type assertion cast needed for formData string to union type"
  - "Home loader getMunicipality duplication documented as intentional (server-side rss_url need)"

patterns-established:
  - "Optional targetId in checkSubscription with null guard for non-neighborhood types"

requirements-completed: [HOME-01, HOME-02]

# Metrics
duration: 3min
completed: 2026-02-17
---

# Phase 6 Plan 01: Gap Closure Summary

**Close 8 audit gaps: active matters limit, neighborhood subscription check, dead code removal, geocode fix, digest frequency selector, signup redirect, and home loader documentation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-17T05:59:34Z
- **Completed:** 2026-02-17T06:02:25Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Fixed active matters query to return 6 items (HOME-01 requirement)
- Added neighborhood-aware subscription checking with string-based lookup
- Removed orphaned addKeywordSubscription function (dead code cleanup)
- Added digest frequency dropdown selector to settings page
- Fixed signup redirect to go directly to /onboarding instead of /settings
- Corrected geocode bounded parameter to match pipeline behavior (bounded=0)
- Documented intentional getMunicipality duplication in home loader

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix service layer and API route bugs** - `2f15e8eb` (fix)
2. **Task 2: Fix UI routes and polish UX** - `ac89bbe7` (fix)

## Files Created/Modified
- `apps/web/app/services/site.ts` - Active matters limit changed from 5 to 6
- `apps/web/app/services/subscriptions.ts` - Neighborhood-aware checkSubscription, removed addKeywordSubscription
- `apps/web/app/routes/api.subscribe.tsx` - GET handler supports neighborhood/digest types without target_id
- `apps/web/app/routes/api.geocode.tsx` - bounded=0 matching pipeline behavior
- `apps/web/app/routes/settings.tsx` - Digest frequency dropdown + formData reader
- `apps/web/app/routes/signup.tsx` - Default redirectTo changed to /onboarding
- `apps/web/app/routes/home.tsx` - Comment documenting intentional getMunicipality duplication

## Decisions Made
- checkSubscription uses a separate code path for neighborhood type (string-based lookup) vs numeric ID types (matter, person, topic) -- cleanly separates the two lookup patterns
- DigestFrequency type assertion needed to cast formData string to the `"each_meeting" | "weekly"` union type
- Home loader getMunicipality duplication documented as intentional -- child loaders cannot access parent loader data server-side in React Router 7 on Cloudflare Workers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed DigestFrequency type assertion in settings action**
- **Found during:** Task 2 (digest frequency selector)
- **Issue:** `formData.get("digest_frequency") as string` not assignable to `DigestFrequency` type
- **Fix:** Added explicit cast to `"each_meeting" | "weekly"` union type
- **Files modified:** apps/web/app/routes/settings.tsx
- **Verification:** pnpm typecheck passes
- **Committed in:** ac89bbe7 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type assertion needed for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 8 audit gaps from v1-MILESTONE-AUDIT.md are now closed
- Phase 6 is the final phase -- project is feature-complete for v1.0
- bootstrap.sql technical debt remains (noted in STATE.md blockers)

---
## Self-Check: PASSED

All 7 modified files verified present. Both task commits (2f15e8eb, ac89bbe7) verified in git log.

---
*Phase: 06-gap-closure-cleanup*
*Completed: 2026-02-17*
