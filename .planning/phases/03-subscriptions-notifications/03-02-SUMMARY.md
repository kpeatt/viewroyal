---
phase: 03-subscriptions-notifications
plan: 02
subsystem: database
tags: [supabase, security, rpc, search-path, smoke-test, subscriptions]

# Dependency graph
requires:
  - phase: 03-subscriptions-notifications
    plan: 01
    provides: "Subscription UI components, API routes, and service layer"
provides:
  - "Immutable search_path on find_matters_near, build_meeting_digest, find_meeting_subscribers RPC functions"
  - "Auto-creation of user_profiles row when pre-existing user subscribes (FK constraint fix)"
  - "Graceful error handling in subscribe-button.tsx for API failures"
  - "End-to-end verified subscription flow (anonymous + authenticated)"
affects: [03-subscriptions-notifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ALTER FUNCTION ... SET search_path = 'public' for RPC security hardening"
    - "Auto-create dependent rows (user_profiles) on first subscription to handle pre-existing accounts"
    - "API route error handling with try/catch and user-facing error messages in subscribe-button"

key-files:
  created:
    - "supabase/migrations/fix_rpc_search_path.sql"
  modified:
    - "apps/web/app/routes/api.subscribe.tsx"
    - "apps/web/app/components/subscribe-button.tsx"

key-decisions:
  - "Used ALTER FUNCTION SET search_path rather than CREATE OR REPLACE -- simpler and less error-prone"
  - "Auto-create user_profiles row in api.subscribe.tsx rather than requiring explicit profile creation step"

patterns-established:
  - "RPC functions must have SET search_path = 'public' to pass Supabase security advisor"
  - "API routes should handle missing FK dependencies gracefully by auto-creating required rows"

requirements-completed: [SUB-07, SUB-11]

# Metrics
duration: 15min
completed: 2026-02-16
---

# Phase 03 Plan 02: Security Fix & Subscription Smoke Test Summary

**Fixed mutable search_path on 3 subscription RPC functions, smoke-tested full subscription flow end-to-end, discovered and fixed FK constraint bug for pre-existing users subscribing**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-17T00:38:29Z
- **Completed:** 2026-02-17T00:53:53Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Applied Supabase migration setting immutable search_path on find_matters_near, build_meeting_digest, and find_meeting_subscribers -- security advisor now clean
- Discovered and fixed FK constraint bug: pre-existing users (created before subscription feature) lacked user_profiles rows, causing 500 errors on subscribe
- Added auto-creation of user_profiles in api.subscribe.tsx and graceful error handling in subscribe-button.tsx
- Full subscription flow verified working in dev server for both anonymous and authenticated users

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix mutable search_path on subscription RPC functions** - `718fa5f4` (fix)
2. **Task 2: Smoke test subscription flow in dev server** - `a6c5f1c5` (fix)

## Files Created/Modified
- `supabase/migrations/fix_rpc_search_path.sql` - ALTER FUNCTION statements setting search_path = 'public' on 3 RPC functions
- `apps/web/app/routes/api.subscribe.tsx` - Auto-creates user_profiles row on first subscribe if missing, improved error handling
- `apps/web/app/components/subscribe-button.tsx` - Added try/catch around fetch calls with user-facing error messages

## Decisions Made
- Used ALTER FUNCTION SET search_path approach instead of CREATE OR REPLACE -- avoids needing to replicate full function body, less error-prone
- Fixed missing user_profiles by auto-creating them in the subscribe API route rather than adding a separate migration or onboarding step -- simplest fix that handles all pre-existing accounts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing users get 500 error on subscribe due to missing user_profiles FK**
- **Found during:** Task 2 (Smoke test subscription flow)
- **Issue:** Users who created accounts before the subscription feature was added have no row in user_profiles. Subscribing triggers an FK constraint violation (subscriptions.user_id references user_profiles.id), returning a 500 error.
- **Fix:** Added auto-creation of user_profiles row in api.subscribe.tsx before inserting subscription. Added try/catch error handling in subscribe-button.tsx to surface errors gracefully instead of silently failing.
- **Files modified:** apps/web/app/routes/api.subscribe.tsx, apps/web/app/components/subscribe-button.tsx
- **Verification:** User confirmed subscribe/unsubscribe works for pre-existing account after fix
- **Committed in:** a6c5f1c5

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Essential fix -- all pre-existing users would have hit this bug in production. No scope creep.

## Issues Encountered
- Supabase security advisor flagged mutable search_path on 3 RPC functions -- resolved by Task 1 migration as planned
- FK constraint violation on subscribe for pre-existing users -- resolved by auto-creating user_profiles (deviation above)

## User Setup Required

External services require manual configuration for production email delivery and public signup:
- **Supabase Auth:** Enable public email signups, set Site URL, add redirect URLs
- **Resend:** Create account, add viewroyal.ai domain, configure DNS records (SPF, DKIM), set RESEND_API_KEY as Edge Function secret
- **Supabase SMTP:** Configure custom SMTP (Resend relay) to exceed default 2 emails/hour limit

These steps are documented in the plan frontmatter (03-02-PLAN.md user_setup section).

## Next Phase Readiness
- Phase 03 (Subscriptions & Notifications) is complete: UI integrated (Plan 01), security fixed and flow verified (Plan 02)
- External service configuration (Resend, SMTP, Auth dashboard) remains a manual step for production launch
- Edge Function for send-alerts exists but requires RESEND_API_KEY secret to be set
- Ready to proceed to Phase 04 (Home Page) or Phase 05 (Advanced Subscriptions)

## Self-Check: PASSED

All 3 files verified on disk (fix_rpc_search_path.sql, api.subscribe.tsx, subscribe-button.tsx). Both task commits (718fa5f4, a6c5f1c5) verified in git log.

---
*Phase: 03-subscriptions-notifications*
*Completed: 2026-02-16*
