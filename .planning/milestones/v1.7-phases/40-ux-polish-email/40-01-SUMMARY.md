---
phase: 40-ux-polish-email
plan: 01
subsystem: ui
tags: [react, attendance, municipality-meta, lucide-react]

requires:
  - phase: none
    provides: existing municipality service and meeting detail page
provides:
  - AttendanceInfo interface and getAttendanceInfo() merge utility
  - Attendance snippet on home page upcoming meeting card
  - Full "How to Attend" section on meeting detail page for future meetings
affects: [40-02, email-digests]

tech-stack:
  added: []
  patterns: [municipality-meta-driven-UI, future-meeting-date-gating]

key-files:
  created:
    - apps/web/app/lib/attendance.ts
  modified:
    - apps/web/app/services/site.ts
    - apps/web/app/components/home/upcoming-meeting-section.tsx
    - apps/web/app/routes/meeting-detail.tsx
    - apps/web/app/routes/home.tsx

key-decisions:
  - "Attendance data driven by municipality.meta JSONB, not a separate table"
  - "Per-meeting overrides via meetings.meta.attendance_info (sparse merge)"
  - "Public hearing vs regular input process selected by meeting type string match"
  - "Attendance section only renders for future meetings (Vancouver timezone date comparison)"

patterns-established:
  - "Municipality meta pattern: store configurable UI data in meta JSONB, merge with per-entity overrides"
  - "Future-only gating: compare meeting_date >= today in Vancouver timezone in the server loader"

requirements-completed: [MTGX-03, MTGX-04]

duration: 2min
completed: 2026-03-23
---

# Phase 40 Plan 01: Meeting Attendance Info Summary

**AttendanceInfo utility merging municipality/meeting meta, with venue/watch-online snippet on home page and full "How to Attend" card on future meeting detail pages**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-23T23:14:40Z
- **Completed:** 2026-03-23T23:17:12Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created AttendanceInfo interface and getAttendanceInfo() utility that merges municipality defaults with per-meeting overrides
- Home page upcoming meeting card now shows venue, time, and watch-online link
- Meeting detail page shows full "How to Attend" section (venue, maps link, watch online, public input, time) only for future meetings
- MTGX-03 confirmed satisfied (financial visibility already present via DollarSign chip)
- MTGX-04 fully implemented

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AttendanceInfo utility and seed municipality meta** - `046e7438` (feat)
2. **Task 2: Add attendance info to home page and meeting detail page** - `becabbea` (feat)

## Files Created/Modified
- `apps/web/app/lib/attendance.ts` - AttendanceInfo interface, getAttendanceInfo() merge helper, SQL seed
- `apps/web/app/services/site.ts` - Added meta to upcoming meeting query, pass municipality meta for attendance merge
- `apps/web/app/components/home/upcoming-meeting-section.tsx` - Compact attendance snippet (venue, time, watch link)
- `apps/web/app/routes/meeting-detail.tsx` - Full "How to Attend" card with venue, maps, watch online, public input
- `apps/web/app/routes/home.tsx` - Pass municipality meta to getHomeData

## Decisions Made
- Attendance data stored in municipality.meta JSONB (not a separate table) for zero-migration deployment
- Per-meeting overrides via meetings.meta.attendance_info with sparse merge pattern
- Public hearing vs regular input process selected by meetingType string match
- Watch link defaults to YouTube channel (View Royal's livestream platform)
- Attendance section gated on future dates using Vancouver timezone comparison in server loader

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

**SQL seed required** to populate municipality attendance defaults. Run the SQL from the comment at the bottom of `apps/web/app/lib/attendance.ts`:

```sql
UPDATE municipalities SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{attendance_info}', '{
  "venue": "Council Chambers, View Royal Town Hall",
  "address": "45 View Royal Ave, Victoria, BC V9B 1A6",
  "maps_url": "https://maps.google.com/?q=View+Royal+Town+Hall+45+View+Royal+Ave+Victoria+BC",
  "watch_link": "https://www.youtube.com/@TownofViewRoyal",
  "watch_label": "Town YouTube channel",
  "public_input_process": "To speak during public comment, contact the municipal clerk at admin@viewroyal.ca or call 250-479-6800.",
  "public_hearing_process": "Written submissions accepted until 4pm on the hearing date. Speakers may register at the meeting or contact admin@viewroyal.ca.",
  "default_start_time": "7:00 PM"
}'::jsonb) WHERE slug = 'view-royal';
```

## Next Phase Readiness
- Attendance utility ready for reuse in email digest templates (40-02)
- Municipality meta pattern established for future configurable UI data

---
*Phase: 40-ux-polish-email*
*Completed: 2026-03-23*
