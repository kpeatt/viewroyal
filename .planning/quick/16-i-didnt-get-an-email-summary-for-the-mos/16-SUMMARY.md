---
phase: quick-16
plan: 01
subsystem: pipeline
tags: [supabase, edge-functions, email-alerts, resend, pipeline]

# Dependency graph
requires:
  - phase: quick-5
    provides: _trigger_alerts method in pipeline orchestrator
  - phase: 03-subscriptions-notifications
    provides: send-alerts Edge Function and subscription infrastructure
provides:
  - "Edge Function accepts Supabase sb_secret_* API keys (--no-verify-jwt + manual auth)"
  - "Improved pipeline alert logging with structured response parsing"
affects: [pipeline, send-alerts]

# Tech tracking
tech-stack:
  added: []
  patterns: [manual bearer token validation when Edge Function uses --no-verify-jwt]

key-files:
  created: []
  modified:
    - supabase/functions/send-alerts/index.ts
    - apps/pipeline/pipeline/orchestrator.py

key-decisions:
  - "Deploy Edge Function with --no-verify-jwt to support sb_secret_* API key format"
  - "Add PIPELINE_API_KEY secret to allow pipeline to authenticate with Edge Function"
  - "Validate bearer token inside Edge Function against both SUPABASE_SERVICE_ROLE_KEY and PIPELINE_API_KEY"

patterns-established:
  - "Edge Functions needing server-to-server auth with sb_secret keys must use --no-verify-jwt with manual token validation"

requirements-completed: [quick-16]

# Metrics
duration: 8min
completed: 2026-03-05
---

# Quick Task 16: Diagnose and Fix Missing Email Summary

**Fixed Edge Function JWT rejection of sb_secret_* API keys; Resend domain verification still required**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-05T15:48:10Z
- **Completed:** 2026-03-05T15:56:30Z
- **Tasks:** 2 of 3 (Task 3 checkpoint blocked by Resend domain verification)
- **Files modified:** 2

## Root Cause Analysis

Two issues were identified preventing email delivery:

### Issue 1: Edge Function JWT Verification (FIXED)

The `send-alerts` Edge Function was deployed with `verify_jwt: true`. The Supabase project uses the newer `sb_secret_*` API key format (not the legacy JWT `eyJ*` format). The Edge Function gateway rejected the pipeline's API key with `401 "Invalid JWT"`.

**Evidence:**
- No alert_log entries exist for meetings 2804, 2805, 2806, 2829, 3649 (all ingested after Feb 17)
- Pipeline's `_trigger_alerts` would have logged `[!] Alert trigger failed: 401` but the error was swallowed by try/except
- Meeting 2803 (Feb 3) has a successful alert from Feb 17 -- this was likely triggered before the key format issue occurred, or via a different auth mechanism

### Issue 2: Resend Domain Not Verified (BLOCKING)

After fixing Issue 1, the Edge Function successfully processes requests but Resend returns `403: "The viewroyal.ai domain is not verified"`. The same error appears in alert_log entry id=1 from the original Feb 17 attempt.

**Evidence:**
- alert_log entry id=3: meeting_id=2806, email_sent=false, error="Resend API error: 403 - domain not verified"
- This same error was seen before (alert_log id=1) and was resolved by re-verifying the domain

### Action Required

Go to [resend.com/domains](https://resend.com/domains) and re-verify the `viewroyal.ai` domain. Then re-trigger the alert:

```bash
source .env && curl -X POST "${SUPABASE_URL}/functions/v1/send-alerts" \
  -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"meeting_id": 2806, "mode": "digest"}'
```

Expected response: `{"meeting_id":2806,"mode":"digest","subscribers_matched":1,"sent":1,"errors":0}`

## Accomplishments

- Diagnosed two-part root cause: Edge Function JWT verification + Resend domain verification
- Fixed Edge Function to accept `sb_secret_*` API keys via `--no-verify-jwt` deployment with manual bearer token validation
- Set `PIPELINE_API_KEY` secret on Edge Function to match pipeline's `SUPABASE_SECRET_KEY`
- Improved pipeline `_trigger_alerts` logging with structured response parsing
- Verified end-to-end: pipeline -> Edge Function -> build_meeting_digest RPC -> find_meeting_subscribers RPC -> Resend (blocked at Resend domain verification)

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Fix Edge Function auth and deploy** - `5079802b` (fix)
2. **Task 2: Improve pipeline alert logging** - `ed20895a` (fix)

## Files Created/Modified

- `supabase/functions/send-alerts/index.ts` - Added manual bearer token validation against SUPABASE_SERVICE_ROLE_KEY and PIPELINE_API_KEY; deployed with --no-verify-jwt
- `apps/pipeline/pipeline/orchestrator.py` - Improved `_trigger_alerts` logging: log when skipped due to missing env vars, parse Edge Function JSON response for structured sent/errors/skipped output

## Decisions Made

- Deploy Edge Function with `--no-verify-jwt` because the project uses `sb_secret_*` API keys that are not in JWT format
- Add `PIPELINE_API_KEY` as a separate Edge Function secret rather than changing the pipeline to use the standard service role key
- Validate bearer tokens inside the function against both `SUPABASE_SERVICE_ROLE_KEY` and `PIPELINE_API_KEY` for defense in depth

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Edge Function --no-verify-jwt deployment**
- **Found during:** Task 1 (diagnosis)
- **Issue:** Could not call Edge Function with pipeline's API key due to JWT verification
- **Fix:** Redeployed with --no-verify-jwt, added manual token validation, set PIPELINE_API_KEY secret
- **Files modified:** supabase/functions/send-alerts/index.ts
- **Verification:** curl test confirmed Edge Function accepts pipeline's key (returns 200 with Resend error)
- **Committed in:** 5079802b

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to complete the diagnostic chain. No scope creep.

## Issues Encountered

- Resend domain `viewroyal.ai` is not verified, preventing email delivery. This is a recurring issue (same error occurred on Feb 17 before being resolved). Requires manual re-verification at resend.com/domains.
- The `sb_secret_*` key format is incompatible with Supabase Edge Function JWT verification. This is a platform limitation that affects all Edge Functions called with the newer key format.

## User Setup Required

**Resend domain re-verification required.** Visit [resend.com/domains](https://resend.com/domains):
1. Find `viewroyal.ai` domain
2. Re-verify DNS records (or re-add the domain if removed)
3. Wait for verification to complete
4. Re-trigger alert for meeting 2806 using the curl command above

## Next Phase Readiness

- Edge Function auth is fixed -- future pipeline runs will successfully call the Edge Function
- Once Resend domain is verified, emails will be sent for all future meetings
- Consider backfilling alerts for missed meetings (2804, 2805, 2829, 3649) after Resend is fixed

---
*Quick Task: 16*
*Completed: 2026-03-05*
