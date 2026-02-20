---
phase: quick-5
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/pipeline/pipeline/orchestrator.py
  - apps/pipeline/pipeline/ingestion/ingester.py
autonomous: true
must_haves:
  truths:
    - "After a meeting is ingested (or re-ingested), the send-alerts Edge Function is called automatically"
    - "Alerts are only triggered for meetings that have substantive content (minutes or transcript), not agenda-only"
    - "The alert call is logged so operators can see whether it succeeded or failed"
    - "Existing dedup in send-alerts prevents duplicate emails on repeated re-ingestion"
  artifacts:
    - path: "apps/pipeline/pipeline/orchestrator.py"
      provides: "Alert triggering after ingestion completes for each meeting"
    - path: "apps/pipeline/pipeline/ingestion/ingester.py"
      provides: "Returns meeting_id from process_meeting so orchestrator can trigger alerts"
  key_links:
    - from: "apps/pipeline/pipeline/orchestrator.py"
      to: "supabase/functions/send-alerts/index.ts"
      via: "HTTP POST to {SUPABASE_URL}/functions/v1/send-alerts"
      pattern: "functions/v1/send-alerts"
---

<objective>
Fix missing email alerts after pipeline ingestion. The `send-alerts` Supabase Edge Function exists and works, but the Python pipeline never calls it after ingesting/re-ingesting a meeting. Add automatic alert triggering to the pipeline orchestrator.

Purpose: Users with subscriptions should receive digest emails when new meeting content is ingested. Currently this never happens because the pipeline has no code to invoke the Edge Function.

Output: Pipeline automatically calls send-alerts after each successful meeting ingestion that has substantive content (minutes or transcript).
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/pipeline/pipeline/orchestrator.py (Archiver class, _ingest_meetings method)
@apps/pipeline/pipeline/ingestion/ingester.py (MeetingIngester.process_meeting returns dict with meeting data)
@supabase/functions/send-alerts/index.ts (Edge Function: POST with {meeting_id, mode} body, Authorization: Bearer SERVICE_ROLE_KEY)
@apps/pipeline/pipeline/config.py (SUPABASE_URL, SUPABASE_SECRET_KEY available)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add send-alerts trigger to pipeline orchestrator after meeting ingestion</name>
  <files>apps/pipeline/pipeline/orchestrator.py</files>
  <action>
Add a `_trigger_alerts` method to the `Archiver` class that:
1. Takes a `meeting_id` (int) parameter
2. POSTs to `{SUPABASE_URL}/functions/v1/send-alerts` with JSON body `{"meeting_id": meeting_id, "mode": "digest"}`
3. Sets the `Authorization` header to `Bearer {SUPABASE_SECRET_KEY}` (use `config.SUPABASE_SECRET_KEY or config.SUPABASE_KEY`)
4. Logs the result: on success print `[+] Triggered alerts for meeting {meeting_id}: {response summary}`, on failure print `[!] Alert trigger failed for meeting {meeting_id}: {error}`
5. Wraps the entire call in try/except so alert failures never crash the pipeline
6. Returns silently if SUPABASE_URL or key is not set (same guard pattern as _ingest_meetings)

Use the `requests` library (already imported as `http_requests` in ingester.py -- but in orchestrator.py, import `requests` directly since it's a top-level module).

Then modify `_ingest_meetings` to call `_trigger_alerts` after each successful `ingester.process_meeting()` call:
- Only call alerts if `process_meeting()` returned a non-None result (meaning ingestion actually happened, not skipped)
- Only call alerts if the returned meeting data indicates the meeting has minutes or transcript (`result["meeting"].get("has_minutes") or result["meeting"].get("has_transcript")`) -- agenda-only meetings should NOT trigger digest alerts (the Edge Function would return "skipped" anyway, but we save the HTTP call)
- Extract the meeting_id from the ingester result. The `process_meeting` method returns `{"meeting": {...}, "attendance": [...], "items": [...]}`. The meeting_id is NOT directly in the return dict -- look it up from the DB via archive_path, OR modify the return to include it. The simplest approach: the meeting_data dict in the return has the DB record fields but NOT the id. Instead, modify `process_meeting` in ingester.py (Task 2) to include meeting_id in the return.

In `_ingest_meetings`, after the `ingester.process_meeting(...)` call succeeds, check the result and call:
```python
if result and (result["meeting"].get("has_minutes") or result["meeting"].get("has_transcript")):
    self._trigger_alerts(result["meeting_id"])
```

Also add `import requests` at the top of orchestrator.py if not already present.
  </action>
  <verify>
Run `cd /Users/kyle/development/viewroyal/apps/pipeline && uv run python -c "from pipeline.orchestrator import Archiver; print('import ok')"` to confirm no import errors. Grep for `_trigger_alerts` in orchestrator.py to confirm method exists and is called from `_ingest_meetings`.
  </verify>
  <done>
Archiver._trigger_alerts method exists and is called after each successful meeting ingestion that has minutes or transcript. Alert failures are caught and logged without crashing the pipeline.
  </done>
</task>

<task type="auto">
  <name>Task 2: Include meeting_id in process_meeting return value</name>
  <files>apps/pipeline/pipeline/ingestion/ingester.py</files>
  <action>
Modify the return statement at the end of `process_meeting()` (around line 1915) to include the `meeting_id` in the returned dict:

Change from:
```python
return {
    "meeting": meeting_data,
    "attendance": refined.get("attendees", []) if refined else [],
    "items": refined.get("items", []) if refined else [],
}
```

To:
```python
return {
    "meeting_id": meeting_id,
    "meeting": meeting_data,
    "attendance": refined.get("attendees", []) if refined else [],
    "items": refined.get("items", []) if refined else [],
}
```

This is a minimal, backwards-compatible change -- the `meeting_id` variable is already in scope at that point in the function (set around line 953-973).
  </action>
  <verify>
Run `cd /Users/kyle/development/viewroyal/apps/pipeline && uv run python -c "from pipeline.ingestion.ingester import MeetingIngester; print('import ok')"` to confirm no import errors. Grep for `meeting_id` in the return block to confirm it's included.
  </verify>
  <done>
process_meeting() return dict includes "meeting_id" key so the orchestrator can use it to trigger alerts.
  </done>
</task>

</tasks>

<verification>
1. `uv run python -c "from pipeline.orchestrator import Archiver; print('ok')"` -- no import errors
2. Grep orchestrator.py for `_trigger_alerts` -- method defined and called from `_ingest_meetings`
3. Grep ingester.py return block for `meeting_id` -- included in return dict
4. To fully test: run `uv run python main.py --target {recent_meeting_id}` and check logs for "[+] Triggered alerts for meeting ..." output (the Edge Function's dedup logic in alert_log will prevent duplicate emails if already sent, so this is safe to re-run)
</verification>

<success_criteria>
- Pipeline automatically POSTs to send-alerts Edge Function after ingesting meetings with minutes/transcript
- Alert trigger failures are logged but don't crash the pipeline
- Agenda-only meetings skip the alert call
- The `process_meeting` return value includes `meeting_id` for alert triggering
</success_criteria>

<output>
After completion, create `.planning/quick/5-bug-i-didn-t-get-an-email-sent-after-the/5-SUMMARY.md`
</output>
