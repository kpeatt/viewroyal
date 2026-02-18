---
phase: quick-3
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/services/site.ts
autonomous: true
must_haves:
  truths:
    - "About page shows a non-zero video hours stat reflecting actual transcribed meeting content"
    - "Video hours stat is derived from real data, not hardcoded"
    - "Stats load without errors on the about page"
  artifacts:
    - path: "apps/web/app/services/site.ts"
      provides: "getAboutStats with working video hours calculation"
      contains: "transcript_segments"
  key_links:
    - from: "apps/web/app/services/site.ts"
      to: "transcript_segments table"
      via: "Supabase query for max end_time per meeting"
      pattern: "transcript_segments"
---

<objective>
Fix the about page "Video Hours Transcribed" stat showing 0.

Purpose: The `video_duration_seconds` column on the `meetings` table is never populated by the pipeline. The existing `getAboutStats` query correctly sums this column, but gets 0 because all values are NULL. The fix uses transcript segment data (which DOES exist) to calculate actual meeting durations.

Output: Working video hours stat on the about page derived from real transcript data.
</objective>

<context>
@apps/web/app/services/site.ts
@apps/web/app/routes/about.tsx
@sql/bootstrap.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Investigate data state and backfill video_duration_seconds</name>
  <files>apps/web/app/services/site.ts</files>
  <action>
First, investigate the actual data to confirm the diagnosis. Run these queries against Supabase using the `supabase` CLI or a direct SQL connection:

1. Check how many meetings have video_duration_seconds populated:
   ```sql
   SELECT COUNT(*) as total, COUNT(video_duration_seconds) as with_duration FROM meetings;
   ```

2. Check how many meetings have transcript segments:
   ```sql
   SELECT COUNT(DISTINCT meeting_id) FROM transcript_segments;
   ```

3. Preview what the backfill would produce:
   ```sql
   SELECT COUNT(*), ROUND(SUM(max_end) / 3600.0, 1) as total_hours
   FROM (SELECT MAX(end_time) as max_end FROM transcript_segments GROUP BY meeting_id) sub;
   ```

Then run the backfill SQL to populate `video_duration_seconds` from transcript data for all meetings that have transcripts but no duration:

```sql
UPDATE meetings m
SET video_duration_seconds = sub.max_end::int
FROM (
  SELECT meeting_id, MAX(end_time) as max_end
  FROM transcript_segments
  GROUP BY meeting_id
) sub
WHERE sub.meeting_id = m.id
AND m.video_duration_seconds IS NULL
AND sub.max_end > 0;
```

Verify the backfill worked:
```sql
SELECT COUNT(video_duration_seconds) as meetings_with_duration,
       ROUND(SUM(video_duration_seconds) / 3600.0, 1) as total_hours
FROM meetings
WHERE video_duration_seconds IS NOT NULL;
```

This backfill fixes the about page AND all other places in the codebase that use `video_duration_seconds` (meeting cards, meeting detail page, home page stats, meeting explorer).
  </action>
  <verify>
Run the verification query above. Should show a non-zero count and reasonable total_hours (likely hundreds of hours for 700+ meetings).
  </verify>
  <done>
`video_duration_seconds` is populated for all meetings that have transcript data. The count matches the number of meetings with transcripts.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add transcript-based fallback to getAboutStats</name>
  <files>apps/web/app/services/site.ts</files>
  <action>
Update the `getAboutStats` function in `apps/web/app/services/site.ts` to be resilient for future meetings that might have transcripts but not yet have `video_duration_seconds` backfilled.

The current approach (lines 57-66) queries `video_duration_seconds` from meetings where it's not null and sums them. After the backfill in Task 1, this already works. But add a fallback: if the sum from `video_duration_seconds` is 0 (suggesting no data), fall back to estimating from transcript_segments.

Modify the `getAboutStats` function:

1. Keep the existing `video_duration_seconds` query as-is (it will now return data after the backfill).
2. Add a fallback: if `totalSeconds` from the meetings query is 0, run a second query to get unique meeting_ids from transcript_segments along with the count of meetings that have transcripts. Use this to estimate: `count_of_meetings_with_transcripts * 5400` (1.5 hours average meeting length is a reasonable estimate for council meetings). This is a rough fallback only -- the primary path after backfill will use actual data.

Actually, a better fallback approach: instead of an estimate, query the actual max end_time from transcript_segments. Since Supabase JS doesn't support GROUP BY aggregates, use this approach:
- Query `transcript_segments` selecting `meeting_id, end_time`, ordered by `end_time` descending, with a reasonable limit (e.g., 5000 rows -- covers the last segment per meeting since they have the highest end_time).
- In JavaScript, group by meeting_id, take the max end_time per meeting, sum them.

But this is wasteful. Since the backfill in Task 1 fixes the data, the simplest resilient approach is:

Keep the current code as-is. It already works correctly -- the only issue was missing data, which Task 1 fixes. Just add a small comment explaining that `video_duration_seconds` is backfilled from transcript segment end_time data, so future pipeline runs should also populate this field.

Add this comment above the hours query in `getAboutStats`:
```typescript
// video_duration_seconds is backfilled from MAX(transcript_segments.end_time) per meeting.
// If this returns 0, run the backfill SQL in .planning/quick/3-fix-about-page-video-hours-showing-0/
```

Also: ensure the pipeline's ingestion phase populates `video_duration_seconds` going forward. Check `apps/pipeline/pipeline/` for the meeting upsert logic and add a TODO comment if appropriate, or note in the plan summary that this should be addressed in the pipeline.

Finally, verify the about page shows the correct stat by running `pnpm dev` in `apps/web/` and visiting `http://localhost:5173/about`.
  </action>
  <verify>
Run `pnpm dev` in `apps/web/` and visit `http://localhost:5173/about`. The "Video Hours Transcribed" stat should show a non-zero number (likely in the hundreds). Check the browser console for any errors.
  </verify>
  <done>
The about page displays a non-zero, accurate "Video Hours Transcribed" value. The code has a comment explaining the data source. No console errors on the about page.
  </done>
</task>

</tasks>

<verification>
- About page at `/about` shows non-zero "Video Hours Transcribed" stat
- The number is reasonable (roughly: number_of_meetings_with_transcripts * ~1.5 hours average)
- No console errors when loading the about page
- Other pages that use `video_duration_seconds` also benefit (meeting cards show duration, meeting explorer shows duration, home page recent meeting shows duration)
</verification>

<success_criteria>
The "Video Hours Transcribed" stat on the about page displays an accurate, non-zero number derived from actual meeting transcript/video data stored in Supabase.
</success_criteria>

<output>
After completion, create `.planning/quick/3-fix-about-page-video-hours-showing-0/3-SUMMARY.md`
</output>
