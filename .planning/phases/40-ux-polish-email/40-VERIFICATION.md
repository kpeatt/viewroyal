---
phase: 40-ux-polish-email
verified: 2026-03-23T23:45:00Z
status: passed
score: 11/11 must-haves verified
gaps:
  - truth: "Digest email has a 'Coming Up' footer section with next meeting date, venue, and watch link"
    status: resolved
    reason: "Fixed in commit d6e9ae51 — email now falls back to watch_link when zoom_link is undefined."
    artifacts:
      - path: "supabase/functions/send-alerts/index.ts"
        issue: "Line 1098: `const zoomLink = attendanceDefaults.zoom_link;` — should also check `attendanceDefaults.watch_link` as the primary field since View Royal uses YouTube not Zoom"
    missing:
      - "Change line 1098 to: `const zoomLink = attendanceDefaults.zoom_link || attendanceDefaults.watch_link;` so the YouTube watch link appears in the Coming Up footer"
human_verification:
  - test: "View upcoming meeting on home page with municipality meta seeded"
    expected: "Compact row showing clock icon + time, map pin + venue, video icon + watch link below the meeting date"
    why_human: "Requires seeded municipality meta in production DB to visually verify attendance snippet renders"
  - test: "View future meeting detail page vs past meeting detail page"
    expected: "Future meeting shows green-tinted 'How to Attend' card. Past meeting shows no attendance card."
    why_human: "Date-gating behavior requires a future meeting in DB to test the positive case"
  - test: "Trigger a digest email for a recent meeting"
    expected: "Email opens with summary paragraph, shows 'Why this matters to you' if subscriber has matches, includes Ask AI CTA button, Coming Up footer with next meeting"
    why_human: "Email HTML rendering requires visual inspection in an email client"
  - test: "Trigger a pre-meeting email"
    expected: "All agenda items listed (not just subscriber matches), matched items have blue left border and Following badge, How to Attend section with data-driven values"
    why_human: "Email rendering requires visual inspection; full-agenda behavior needs a real pre-meeting trigger"
---

# Phase 40: UX Polish + Email Verification Report

**Phase Goal:** Users see financial data on relevant agenda items, know how to attend upcoming meetings, and receive better-designed email digests
**Verified:** 2026-03-23T23:45:00Z
**Status:** gaps_found (1 gap) + human verification needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Financial data on agenda items is already visible (MTGX-03 confirmed satisfied) | VERIFIED | `AgendaOverview.tsx` renders `DollarSign` chip (line 395-402) and "Financial Impact" section (line 502-514) when `item.financial_cost > 0` |
| 2  | Upcoming meeting on home page shows venue address, watch-online link, and meeting time | VERIFIED | `upcoming-meeting-section.tsx` renders Clock, MapPin, Video icons from `meeting.attendanceInfo`; `site.ts` calls `getAttendanceInfo()` at line 332; `home.tsx` passes `municipality.meta` |
| 3  | Meeting detail page for a future meeting shows full attendance info section | VERIFIED | `meeting-detail.tsx` loader computes `attendanceInfo` only when `isFutureMeeting` (lines 159-166); renders "How to Attend" card at lines 499-580 with venue, maps link, watch online, public input, time |
| 4  | Meeting detail page for a past meeting does NOT show attendance info section | VERIFIED | `attendanceInfo` is `null` for past meetings (loader sets it null when `!isFutureMeeting`); JSX renders nothing when `attendanceInfo` is falsy |
| 5  | Digest email opens with a 2-3 sentence meeting summary as the lead paragraph | VERIFIED | `buildDigestHtml()` line 968 reads `digest.meeting.summary` with fallback; rendered at line 1128 as `font-size:16px;line-height:1.6` paragraph before all other content |
| 6  | Digest email shows "Why this matters to you" personalization callout | VERIFIED | Lines 971-1001 build `personalizationHtml` from `highlights` map; transforms reasons to natural language phrases |
| 7  | Digest email has a prominent "Ask AI" CTA linking to the search page | VERIFIED | Lines 1074-1081 render centered Ask AI button linking to `${BASE_URL}/search` |
| 8  | Digest email has a "Coming Up" footer section with next meeting date, venue, and watch link | PARTIAL — watch link never renders | `comingUpHtml` at lines 1083-1109: next meeting title, date, type, venue, maps link all correct; but watch link reads `attendanceDefaults.zoom_link` (line 1098) while municipality meta seeds `watch_link`. The YouTube link will always be absent. |
| 9  | Pre-meeting email shows full agenda (all items, not just matches) with subscription highlights | VERIFIED | `buildPreMeetingHtml()` lines 838-865 iterate `allItems` array; matched items get blue left border; unmatched items plain style |
| 10 | Pre-meeting email shows data-driven attendance info from municipality meta (not hardcoded) | VERIFIED | Lines 868-889 merge `municipalityMeta?.attendance_info` with `meeting.meta?.attendance_info`; falls back to hardcoded values when meta not seeded |
| 11 | Both emails are mobile-friendly, single-column, news-digest style | VERIFIED | Both functions return `max-width:600px` single-column HTML with inline styles; no CSS classes or style blocks |

**Score:** 10/11 truths verified (1 partial)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/app/lib/attendance.ts` | AttendanceInfo interface and getAttendanceInfo() merge helper | VERIFIED | Exports `AttendanceInfo` and `getAttendanceInfo()`, 56 lines, substantive implementation with merge logic, SQL seed comment |
| `apps/web/app/components/home/upcoming-meeting-section.tsx` | Attendance snippet (venue + watch link) on home page | VERIFIED | Imports `AttendanceInfo` type; renders Clock, MapPin, Video icons from `meeting.attendanceInfo`; wired via `site.ts` → `getAttendanceInfo()` |
| `apps/web/app/routes/meeting-detail.tsx` | Full attendance info section for upcoming/future meetings | VERIFIED | Imports `getAttendanceInfo`, `getMunicipality`; loader computes attendance; renders full "How to Attend" card only when attendanceInfo present |
| `supabase/functions/send-alerts/index.ts` | Redesigned buildDigestHtml() and buildPreMeetingHtml() | VERIFIED (with gap) | 1155 lines; both functions rewritten; file contains "Ask AI" string |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/web/app/routes/home.tsx` | `apps/web/app/services/site.ts` | `getAttendanceInfo` via `municipalityMeta` | WIRED | `home.tsx` line 40 calls `getHomeData(supabase, municipality?.meta)`; `site.ts` line 332 calls `getAttendanceInfo()` |
| `apps/web/app/routes/meeting-detail.tsx` | `apps/web/app/lib/attendance.ts` | `getAttendanceInfo` in loader | WIRED | Lines 8-9 import both exports; loader lines 164-166 call `getAttendanceInfo()` with municipality.meta, meeting.meta, meeting.type |
| `buildDigestHtml` | `DigestPayload` | Renders meeting summary as lead paragraph | WIRED | Line 968 reads `digest.meeting.summary`; rendered at line 1128 |
| `buildDigestHtml` | next meeting query | "Coming Up" footer with next meeting info | PARTIAL | Section renders (line 1102 "Coming Up" header) and shows venue/directions; watch link broken (zoom_link vs watch_link mismatch) |
| `buildPreMeetingHtml` | municipality meta | Data-driven attendance info instead of hardcoded values | WIRED | Lines 868-889 read `municipalityMeta?.attendance_info`; `handlePreMeeting` queries municipality at lines 536-540 and passes `municipality?.meta` at line 639 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MTGX-03 | 40-01 | Agenda items with financial cost/funding data show it visually | SATISFIED | Pre-existing: `AgendaOverview.tsx` DollarSign chip + "Financial Impact" section on items with `financial_cost > 0` |
| MTGX-04 | 40-01 | Upcoming meetings show attendance info (how to attend, location, public input process) | SATISFIED | Home page: `attendanceInfo` snippet. Meeting detail: full "How to Attend" card for future meetings. Both data-driven from municipality meta. |
| MAIL-01 | 40-02 | Email digest has improved mobile-friendly design with meeting summary at top | SATISFIED | `buildDigestHtml()` rewrites to lead with summary paragraph at 16px line-height 1.6; single-column 600px max-width; inline styles |
| MAIL-02 | 40-02 | Email includes upcoming meeting dates with attendance information | SATISFIED — with minor gap | Digest Coming Up footer shows next meeting with venue; pre-meeting email shows full data-driven attendance. Gap: watch link in digest Coming Up footer does not render (zoom_link vs watch_link). Core requirement met. |

### Anti-Patterns Found

None found in any of the five modified web app files or the edge function.

### Human Verification Required

#### 1. Home page attendance snippet renders with seeded data

**Test:** Seed municipality meta (SQL in `apps/web/app/lib/attendance.ts` comment), then load the home page.
**Expected:** Upcoming meeting card shows a compact row with clock icon + "7:00 PM", map pin + venue name, and a "Town YouTube channel" watch link below the meeting date.
**Why human:** Requires municipality meta seeded in production/staging DB. Attendance info only appears when `getAttendanceInfo()` returns non-null.

#### 2. Future vs past meeting attendance section gating

**Test:** Navigate to a future meeting detail page, then a past meeting detail page.
**Expected:** Future meeting shows a green-tinted "How to Attend" card. Past meeting shows no such card.
**Why human:** Positive case requires a future meeting date in the DB. Date comparison is Vancouver-timezone-aware.

#### 3. Digest email visual rendering

**Test:** Trigger `handleDigest` for a recent meeting that has a summary and a future meeting in DB.
**Expected:** Email renders summary paragraph first, then personalization callout (if subscriber has matches), then decisions, then Ask AI CTA button, then Coming Up footer with next meeting details.
**Why human:** HTML email rendering requires visual verification in an email client.

#### 4. Pre-meeting email full agenda and highlights

**Test:** Trigger `handlePreMeeting` for an upcoming meeting with agenda items. Use a subscriber with at least one matched item.
**Expected:** All agenda items listed; matched items have blue left border and "Following" badge; unmatched items plain; How to Attend section shows venue and YouTube link.
**Why human:** Requires a real pre-meeting trigger with a matched subscriber.

### Gaps Summary

One partial implementation found in the digest email's Coming Up footer. The section exists and renders correctly for venue, directions, and next meeting date/time — but the "Watch online" link is dead code.

**Root cause:** `buildDigestHtml` Coming Up section reads `attendanceDefaults.zoom_link` (line 1098), but the municipality meta uses `watch_link` as the key for the YouTube channel URL. Since the seed SQL only sets `watch_link`, `zoom_link` is always undefined, and the conditional watch link in the footer template never renders.

**Fix:** One-line change at `supabase/functions/send-alerts/index.ts` line 1098:
```typescript
// Before:
const zoomLink = attendanceDefaults.zoom_link;
// After:
const zoomLink = attendanceDefaults.zoom_link || attendanceDefaults.watch_link;
```

This is a low-severity gap — the Coming Up footer still shows next meeting title, date, type, venue, and directions. The watch link is additive. MAIL-02 ("Email includes upcoming meeting dates with attendance information") is still substantively satisfied.

---

_Verified: 2026-03-23T23:45:00Z_
_Verifier: Claude (gsd-verifier)_
