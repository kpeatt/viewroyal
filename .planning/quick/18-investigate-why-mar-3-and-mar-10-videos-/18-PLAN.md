---
phase: 18-investigate-why-mar-3-and-mar-10-videos-
plan: 18
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: false
requirements: []
must_haves:
  truths:
    - "Root cause of missing video processing is identified"
    - "Both meetings are fully processed with video/transcript if available on Vimeo"
    - "Any pipeline bug preventing future detection is identified"
  artifacts: []
  key_links: []
---

<objective>
Investigate why the Mar 3 and Mar 10 2026 meeting videos were not processed by the daily pipeline, and fix any issues found.

Purpose: Two recent meetings may be missing video transcripts on the site. Need to diagnose the pipeline's update detection and process the meetings.
Output: Root cause analysis, processed meetings, and any pipeline fixes.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/pipeline/pipeline/orchestrator.py
@apps/pipeline/pipeline/update_detector.py
@apps/pipeline/pipeline/video/vimeo.py
@apps/pipeline/pipeline/utils.py
@logs/pipeline.log

Key findings from investigation:

1. **Mar 3 Council Meeting (2026-03-03)** -- ALREADY FULLY PROCESSED:
   - Scraped Mar 1, video detected and processed Mar 5 (audio + diarize + ingest)
   - Archive has: Agenda, Audio/mp3, Audio/diarized JSON, refinement.json (status: Completed)
   - This one is DONE. No action needed.

2. **Mar 10 Committee of the Whole (2026-03-10)** -- MISSING VIDEO:
   - Scraped and ingested Mar 7 as "Planned" (meeting hadn't occurred yet)
   - Meeting occurred Mar 10, but daily pipeline has reported "0 changes" every day from Mar 8-13
   - Archive has: Agenda only. No Audio directory. No transcript.
   - The update detector's `detect_video_changes()` walks the archive, checks Vimeo video_map for matching dates, and flags folders with no audio AND no transcript
   - Pipeline reports "Found 179 videos with identifiable dates" -- this count has been stable since Mar 8
   - Two possible causes: (a) View Royal hasn't uploaded the Mar 10 CoW video to Vimeo yet, or (b) the video exists but its title doesn't match the date extraction regex in `utils.extract_date_from_string()`

3. **Pipeline detection gap (potential bug):**
   - Even if the video appeared tomorrow, the update detector only checks for "new video" -- it does NOT check if a "Planned" meeting has transitioned to "Occurred" (i.e. minutes posted).
   - The `detect_document_changes` only compares DB flags vs disk -- if both DB and disk agree "no minutes", it won't flag anything even though minutes may now be available on CivicWeb.
   - However, the `run_update_check` calls `scraper.scrape_recursive()` first which DOES download new files. So if minutes were posted, they'd be scraped, hit disk, and trigger a document change. This path should work.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Diagnose Vimeo video availability for Mar 10</name>
  <files></files>
  <action>
Run targeted diagnostic commands to determine whether View Royal has uploaded the Mar 10 2026 Committee of the Whole video to Vimeo:

1. From `apps/pipeline/`, run a Python snippet that uses `VimeoClient.get_video_map()` and checks if date key "2026-03-10" exists:
```python
cd apps/pipeline
uv run python -c "
from pipeline.video.vimeo import VimeoClient
from pipeline import utils
vc = VimeoClient()
vmap = vc.get_video_map()
# Check for Mar 10 specifically
if '2026-03-10' in vmap:
    print('FOUND Mar 10 videos:', vmap['2026-03-10'])
else:
    print('NO VIDEO for 2026-03-10')
# Also show the most recent 5 dates in the map
dates = sorted(vmap.keys(), reverse=True)[:10]
for d in dates:
    print(f'  {d}: {[v[\"title\"] for v in vmap[d]]}')
"
```

2. If a video IS found for 2026-03-10, this confirms a pipeline bug. Check if `utils.extract_date_from_string()` can parse the video title.

3. If NO video exists for 2026-03-10, this confirms the video simply hasn't been uploaded yet. In that case, verify the daily pipeline WILL pick it up when it does appear by checking the detect_video_changes logic path for the Mar 10 folder.

4. Also check: is the Mar 3 meeting showing video on the site? Run:
```python
uv run python -c "
from pipeline import config
from supabase import create_client
sb = create_client(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY or config.SUPABASE_KEY)
for date in ['2026-03-03', '2026-03-10']:
    r = sb.table('meetings').select('id,meeting_date,type,status,has_transcript,has_agenda,has_minutes,video_url').eq('meeting_date', date).execute()
    for m in r.data:
        print(f'{m[\"meeting_date\"]} {m[\"type\"]}: status={m[\"status\"]}, transcript={m[\"has_transcript\"]}, video={m[\"video_url\"]}')"
```

Report findings clearly.
  </action>
  <verify>Diagnostic output explains whether the video is on Vimeo, what the DB state is for both meetings, and identifies the root cause.</verify>
  <done>Root cause is identified: either (a) video not yet uploaded to Vimeo, (b) pipeline bug in detection, or (c) some other issue.</done>
</task>

<task type="auto">
  <name>Task 2: Process Mar 10 meeting if video is available</name>
  <files></files>
  <action>
Based on Task 1 findings:

**If Mar 10 video IS on Vimeo but wasn't detected:**
1. Run targeted processing: `cd apps/pipeline && uv run python main.py --target {meeting_id}` where meeting_id is the DB ID for the Mar 10 CoW meeting (likely 2807 based on logs). This will download audio, diarize, re-ingest, and embed.
2. Investigate why detect_video_changes missed it. The most likely bug: the video_map has the date but the folder-walker in detect_video_changes skipped it. Check if the folder structure matches what os.walk expects (needs "Agenda" or "Minutes" subdir -- the Mar 10 folder DOES have "Agenda" so this should work).
3. If a code fix is needed, implement it.

**If Mar 10 video is NOT yet on Vimeo:**
1. Confirm the daily pipeline will auto-process it when the video appears by tracing the detect_video_changes code path.
2. If there IS a gap (e.g., detect_video_changes only checks folders that already exist, and it does -- the folder was created Mar 7), confirm it will work.
3. No code changes needed in this case -- just report to the user that View Royal hasn't uploaded the video yet.

**For Mar 3:** Verify it's showing correctly on the website. Check the DB has video_url and has_transcript=true.
  </action>
  <verify>
If video was available: `uv run python -c "from pipeline import config; from supabase import create_client; sb = create_client(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY or config.SUPABASE_KEY); r = sb.table('meetings').select('id,status,has_transcript,video_url').eq('meeting_date', '2026-03-10').execute(); print(r.data)"` shows has_transcript=true.
If video not available: Report explains the situation clearly.
  </verify>
  <done>Mar 10 meeting is processed (if video available), or user is informed that the video hasn't been uploaded to Vimeo yet and the pipeline will auto-detect it when it appears.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Diagnosed and (if possible) fixed the missing video processing for Mar 3 and Mar 10 meetings. Mar 3 was already fully processed. Mar 10's status depends on whether View Royal has uploaded the video to Vimeo.</what-built>
  <how-to-verify>
    1. Check the investigation findings report
    2. Visit https://viewroyal.ai and navigate to the Mar 3 Council meeting -- verify video player works and transcript is visible
    3. Navigate to the Mar 10 Committee of the Whole meeting -- check status (will show "Planned" if no video/minutes yet, "Completed" if video was processed)
    4. If any pipeline code was changed, review the fix
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
- Root cause for each meeting is identified and documented
- Mar 3 meeting confirmed fully processed in DB (has_transcript=true, video_url set)
- Mar 10 meeting is either processed or documented as awaiting video upload
- Any pipeline bugs found are fixed or documented
</verification>

<success_criteria>
- Clear explanation of why each meeting appeared to not have its video processed
- Both meetings are in the correct state (processed if data available, documented if not)
- User has actionable next steps if the Mar 10 video hasn't been uploaded yet
</success_criteria>

<output>
After completion, create `.planning/quick/18-investigate-why-mar-3-and-mar-10-videos-/18-SUMMARY.md`
</output>
