---
phase: quick-16
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/pipeline/pipeline/orchestrator.py
  - supabase/functions/send-alerts/index.ts
autonomous: false
requirements: [quick-16]

must_haves:
  truths:
    - "Root cause of missing email is identified"
    - "Email digest is sent (or resent) for the most recent meeting"
    - "Future pipeline runs will reliably trigger email alerts"
  artifacts: []
  key_links:
    - from: "apps/pipeline/pipeline/orchestrator.py"
      to: "supabase/functions/v1/send-alerts"
      via: "_trigger_alerts HTTP POST"
      pattern: "_trigger_alerts"
---

<objective>
Diagnose and fix why the email summary was not sent for the most recent council meeting.

Purpose: The user subscribed to council digests but did not receive an email after the latest meeting was ingested. This could be a pipeline-side issue (alert not triggered), Edge Function issue (Resend failure, digest build failure, subscriber matching), or a configuration issue.

Output: Root cause identified, email sent for the missed meeting, and any code fix applied to prevent recurrence.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/pipeline/pipeline/orchestrator.py (lines 586-610: _trigger_alerts method)
@supabase/functions/send-alerts/index.ts (full Edge Function)
@apps/web/app/services/subscriptions.ts (getMeetingDigest, findMeetingSubscribers)
@.planning/quick/5-bug-i-didn-t-get-an-email-sent-after-the/5-SUMMARY.md (prior email fix)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Diagnose root cause of missing email</name>
  <files>apps/pipeline/pipeline/orchestrator.py, supabase/functions/send-alerts/index.ts</files>
  <action>
Systematically check each link in the email alert chain for the most recent meeting. Run these checks against the live Supabase database:

1. **Identify the most recent meeting**: Query `meetings` table ordered by `meeting_date DESC`, get the ID, check `has_minutes` and `has_transcript` flags. If both are false, the pipeline guard in `_trigger_alerts` would skip it -- that's the root cause.

2. **Check alert_log**: Query `alert_log` for that meeting_id. If a row exists with `email_sent=true`, the email was sent (check spam). If `email_sent=false`, read `error_message`. If no row exists, the Edge Function was never called or returned early.

3. **Check subscriptions**: Query `subscriptions` where `is_active=true` and `type='digest'`. Verify the user has an active digest subscription. Also check `user_profiles` for `digest_enabled=true` and that `notification_email` is set.

4. **Check the Edge Function response**: If no alert_log entry exists, manually call the Edge Function for that meeting:
   ```bash
   curl -X POST "$SUPABASE_URL/functions/v1/send-alerts" \
     -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
     -H "Content-Type: application/json" \
     -d '{"meeting_id": <ID>, "mode": "digest"}'
   ```
   Examine the response JSON for clues: `skipped` (no minutes/transcript), `sent: 0` (no subscribers matched), `errors` (Resend failure).

5. **Check the build_meeting_digest RPC**: If the curl returns `skipped`, the `build_meeting_digest` RPC returned null. Verify the meeting has minutes or transcript data.

6. **Check Supabase Edge Function logs**: Look in Supabase Dashboard > Edge Functions > send-alerts > Logs for any errors around the time the pipeline last ran.

Document the specific failure point. Common failure modes:
- Pipeline ran but meeting only had agenda (no minutes/transcript) -- guard skipped alert
- Pipeline ran --update-mode but no changes detected -- alert never triggered
- Edge Function called but `find_meeting_subscribers` returned 0 rows (no matching subscriptions)
- Edge Function called but Resend API key expired or missing
- Edge Function called but `build_meeting_digest` RPC returned null
- Pipeline ran a mode that doesn't call `_ingest_meetings` (e.g. --extract-documents, --embed-only)
  </action>
  <verify>
    <automated>echo "Root cause diagnosis is manual investigation -- verify by reading task output"</automated>
  </verify>
  <done>Root cause is identified and documented with specific evidence (DB query results, curl response, or log output)</done>
</task>

<task type="auto">
  <name>Task 2: Fix the issue and send the missed email</name>
  <files>apps/pipeline/pipeline/orchestrator.py, supabase/functions/send-alerts/index.ts</files>
  <action>
Based on the root cause from Task 1, apply the appropriate fix:

**If the pipeline never triggered the alert** (e.g. meeting was ingested via a code path that doesn't call `_trigger_alerts`, or the has_minutes/has_transcript guard was wrong):
- Fix the code path to include `_trigger_alerts` call
- Or fix the guard condition if it was incorrectly evaluating

**If the Edge Function failed** (Resend config, RPC error, subscriber matching):
- Fix the Edge Function or the relevant RPC
- Redeploy with `supabase functions deploy send-alerts`

**If it was a one-off data issue** (meeting missing minutes flag, no subscribers):
- Fix the data issue directly
- No code change needed

**In all cases, resend the missed digest**:
After fixing the root cause, manually trigger the alert for the missed meeting:
```bash
curl -X POST "$SUPABASE_URL/functions/v1/send-alerts" \
  -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"meeting_id": <ID>, "mode": "digest"}'
```
Verify the response shows `sent: 1` (or more).

**Add better logging if needed**: If the failure was silent (no indication in pipeline output), consider adding a warning log when `_trigger_alerts` is skipped due to the guard condition, so future skips are visible in pipeline output.
  </action>
  <verify>
    <automated>echo "Verify alert_log has email_sent=true for the meeting"</automated>
  </verify>
  <done>The missed email has been sent (confirmed by alert_log entry with email_sent=true), and any code fix has been applied to prevent recurrence</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Diagnosed and fixed the missing email alert for the most recent meeting. Resent the digest email.</what-built>
  <how-to-verify>
    1. Check your email inbox (and spam folder) for the meeting digest email from alerts@viewroyal.ai
    2. Confirm the email content looks correct (meeting title, decisions, attendance)
    3. If a code fix was applied, confirm it makes sense for preventing future occurrences
  </how-to-verify>
  <resume-signal>Type "approved" if email received and looks good, or describe any issues</resume-signal>
</task>

</tasks>

<verification>
- alert_log table has a row for the most recent meeting with email_sent=true
- User confirms email received in inbox
- If code was changed, pipeline typecheck/tests still pass
</verification>

<success_criteria>
- Root cause identified and documented
- Missed email successfully sent and received
- Any code fix applied and committed (if applicable)
- Future pipeline runs will trigger alerts correctly
</success_criteria>

<output>
After completion, create `.planning/quick/16-i-didnt-get-an-email-summary-for-the-mos/16-SUMMARY.md`
</output>
