---
phase: 19-fix-mar17-shared-video
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/pipeline/pipeline/video/vimeo.py
  - apps/pipeline/pipeline/ingestion/ingester.py
autonomous: true
requirements: [FIX-01]
must_haves:
  truths:
    - "Public Hearing and Council meetings on the same date get different video URLs when separate videos exist on Vimeo"
    - "When only one combined video exists for a date with multiple meeting types, both meetings correctly share that single video"
    - "The search_video fallback does not silently assign wrong videos"
  artifacts:
    - path: "apps/pipeline/pipeline/video/vimeo.py"
      provides: "Improved search_video matching with meeting-type-aware logic"
    - path: "apps/pipeline/pipeline/ingestion/ingester.py"
      provides: "Passes meeting type hint to Vimeo search"
  key_links:
    - from: "apps/pipeline/pipeline/ingestion/ingester.py"
      to: "apps/pipeline/pipeline/video/vimeo.py"
      via: "search_video(date_str, title_hint) call"
      pattern: "v_client\\.search_video"
---

<objective>
Fix the bug where a Public Hearing and Council meeting on the same date (Mar 17) both received the same Vimeo video URL during AI refinement/ingestion.

Purpose: When View Royal holds a Public Hearing and a Regular Council meeting on the same date, they typically have separate Vimeo recordings. The pipeline's video matching must assign the correct video to each meeting type.

Output: Fixed `search_video` method and ingester call site so meeting type is used for precise video matching.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/pipeline/pipeline/video/vimeo.py
@apps/pipeline/pipeline/ingestion/ingester.py
@apps/pipeline/pipeline/orchestrator.py (lines 290-388 for _download_vimeo_content reference)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Investigate the Mar 17 data and diagnose root cause</name>
  <files>apps/pipeline/pipeline/video/vimeo.py</files>
  <action>
1. Query the Supabase `meetings` table for meetings on 2026-03-17 to confirm both the Public Hearing and Council meeting exist and check their `video_url` values. Use: `cd apps/pipeline && uv run python -c "..."` with supabase client.

2. Search the Vimeo API for videos matching "2026-03-17" to see what videos actually exist and what their titles are. Use the VimeoClient:
```python
from pipeline.video.vimeo import VimeoClient
vc = VimeoClient()
results = vc.search_video("2026-03-17", "Council")
print("Council match:", results)
results2 = vc.search_video("2026-03-17", "Public Hearing")
print("PH match:", results2)
```

3. Analyze the `search_video` method (vimeo.py lines 99-156). The known issues:
   - The fallback on line 149 (`if fallback_match: return fallback_match`) returns the FIRST date-matching video regardless of type, so if keyword matching fails for either meeting, both get the same video.
   - The keyword matching (lines 138-147) checks `title_hint` against video title, but if the Vimeo title is something like "Public Hearing and Regular Council Meeting March 17 2026" (a combined title), the "council" keyword check on line 142 would match it for Council but the "public hearing" check on line 146 would ALSO match it -- potentially returning the same single video for both. This is correct behavior for a combined video.
   - The real bug: if there are TWO separate videos but their titles don't match the expected keywords cleanly, the fallback returns the first one for both meetings.

4. Document findings in console output for the summary.
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/pipeline && uv run python -c "
from pipeline.video.vimeo import VimeoClient
vc = VimeoClient()
r1 = vc.search_video('2026-03-17', 'Council')
r2 = vc.search_video('2026-03-17', 'Public Hearing')
print('Council:', r1)
print('Public Hearing:', r2)
if r1 and r2:
    print('SAME VIDEO:', r1.get('url') == r2.get('url'))
"</automated>
  </verify>
  <done>Root cause identified with evidence from both DB state and Vimeo API responses</done>
</task>

<task type="auto">
  <name>Task 2: Fix video matching to distinguish meeting types on same date</name>
  <files>apps/pipeline/pipeline/video/vimeo.py, apps/pipeline/pipeline/ingestion/ingester.py</files>
  <action>
Based on Task 1 findings, fix the video matching. The fix has two parts:

**Part A: Improve `search_video` in vimeo.py (lines 99-156)**

The current matching logic tries keywords but falls back to "first date match" which is ambiguous. Fix by:

1. Make the keyword matching more robust -- add a scoring system or stricter matching:
   - If `title_hint` contains "public hearing", prefer videos whose title contains "public hearing" and does NOT contain "council" (or vice versa).
   - If `title_hint` contains "council" (but not "public hearing"), prefer videos whose title contains "council" but NOT "public hearing".
   - For combined titles like "Public Hearing and Council Meeting", both types can legitimately match that video.

2. When multiple videos exist for the same date, do NOT return the fallback (first date match) if the title_hint contains a specific meeting type keyword. Instead, return None if no keyword match is found -- this is safer than assigning the wrong video.

3. Keep the fallback behavior ONLY when title_hint is None or doesn't contain any meeting type keywords.

Mirror the matching logic already used in `_download_vimeo_content` (orchestrator.py:310-354) which correctly handles the multi-video-per-date case with keyword matching and explicit avoidance of cross-matching (e.g., Council matching skips "public hearing" titled videos).

**Part B: Ensure ingester passes the right hint**

In ingester.py line 967:
```python
v_match = v_client.search_video(meta["meeting_date"], meta["title"])
```
The `meta["title"]` is the folder name which should already contain the meeting type. Verify this is adequate or enhance by also passing `m_type_guess` (e.g. "Public Hearing", "Regular Council") which is computed on line 900.

Consider changing to:
```python
v_match = v_client.search_video(meta["meeting_date"], m_type_guess or meta["title"])
```
This ensures the structured meeting type is used for matching rather than the raw folder name.

**Part C: Fix the Mar 17 data**

After fixing the code, correct the Mar 17 meetings in the database:
- Query Vimeo for the correct video URLs for each meeting type
- Update the meetings table to assign the correct video_url to each meeting

Use a Python one-liner via `uv run python -c "..."` to do the DB update.
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/pipeline && uv run python -c "
from pipeline.video.vimeo import VimeoClient
vc = VimeoClient()
r1 = vc.search_video('2026-03-17', 'Regular Council')
r2 = vc.search_video('2026-03-17', 'Public Hearing')
print('Council:', r1)
print('Public Hearing:', r2)
if r1 and r2:
    same = r1.get('url') == r2.get('url')
    print('SAME VIDEO:', same)
    # If separate videos exist, they should NOT be the same
    # If only one combined video exists, same is acceptable
" && uv run pytest tests/ -x -q --no-header 2>&1 | tail -5</automated>
  </verify>
  <done>
- search_video correctly distinguishes meeting types when multiple videos exist for same date
- Mar 17 Public Hearing and Council meeting have correct (different) video_url values in DB
- Existing tests still pass
  </done>
</task>

</tasks>

<verification>
- Query meetings table for 2026-03-17 and confirm different video_url values
- Run search_video with both "Regular Council" and "Public Hearing" hints for 2026-03-17 and confirm different results (if separate videos exist)
- Run existing pipeline tests: `cd apps/pipeline && uv run pytest tests/ -x -q`
</verification>

<success_criteria>
- Mar 17 Public Hearing and Council meeting have the correct video URLs assigned
- search_video no longer assigns the same video to different meeting types when separate videos exist
- The fix is defensive: returns None rather than wrong video when no match is found
- All existing tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/19-fix-mar-17-public-hearing-and-council-me/19-SUMMARY.md`
</output>
