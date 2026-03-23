---
phase: 40-ux-polish-email
plan: 02
subsystem: email
tags: [deno, edge-function, html-email, resend, supabase, personalization]

requires:
  - phase: 40-ux-polish-email
    provides: "Municipality meta attendance_info data model (plan 01)"
provides:
  - "Redesigned digest email with summary-first layout, Ask AI CTA, Coming Up footer"
  - "Redesigned pre-meeting email with full agenda, data-driven attendance, personalization"
  - "Municipality meta integration for both email templates"
affects: [email-delivery, subscriber-experience]

tech-stack:
  added: []
  patterns:
    - "Municipality meta merging: defaults from municipalities.meta, overrides from meetings.meta"
    - "Meeting-type-aware process text: public_hearing_process vs public_input_process"
    - "Natural language personalization from subscription reason strings"

key-files:
  created: []
  modified:
    - supabase/functions/send-alerts/index.ts

key-decisions:
  - "Compact list format for key decisions (not cards) -- optimized for mobile scanning"
  - "Ask AI CTA links to /search without query params -- lets user formulate their own question"
  - "Coming Up footer only renders when next meeting exists in DB"
  - "Full agenda always shown in pre-meeting email, with Following badges on matched items"
  - "Hardcoded fallback values retained for graceful degradation when municipality meta not yet seeded"

patterns-established:
  - "News-digest email style: summary-first, text-forward, inline styles, single-column 600px max-width"
  - "Why this matters to you: personalization callout with natural language reason transformation"
  - "Data-driven attendance info with municipality defaults + per-meeting overrides + hardcoded fallback chain"

requirements-completed: [MAIL-01, MAIL-02]

duration: 3min
completed: 2026-03-23
---

# Phase 40 Plan 02: Email Template Redesign Summary

**News-digest style email redesign with summary-first layout, Ask AI CTA, Coming Up footer, full agenda preview, and data-driven attendance info from municipality meta**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-23T23:15:06Z
- **Completed:** 2026-03-23T23:18:20Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Digest email leads with meeting summary, has "Why this matters to you" personalization, Ask AI CTA, and Coming Up footer with next meeting
- Pre-meeting email shows full agenda (all items) with subscription highlights, data-driven attendance info from municipality meta
- Both emails share consistent news-digest visual language with same header, fonts, color palette
- handleDigest and handlePreMeeting query municipality meta and next meeting data once before subscriber loops

## Task Commits

Each task was committed atomically:

1. **Task 1: Redesign digest email** - `5f05099b` (feat)
2. **Task 2: Redesign pre-meeting email** - `50bf7d6c` (feat)

## Files Created/Modified
- `supabase/functions/send-alerts/index.ts` - Complete rewrite of buildDigestHtml() and buildPreMeetingHtml(), updated handleDigest() and handlePreMeeting() with municipality meta queries

## Decisions Made
- Compact list format for key decisions instead of cards -- cards take too much vertical space in email, compact list scans better on mobile
- Ask AI CTA links to /search with no query params -- user can type their own question, pre-filling would be awkward
- Coming Up footer only renders when a future meeting exists in the DB (graceful omission)
- Full agenda always shown in pre-meeting (plan specified this as key change from current conditional display)
- Retained hardcoded fallback values (venue, YouTube link, email) for when municipality meta is not yet seeded
- Meeting type determines which public process text to show (public_hearing_process vs public_input_process)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required. Municipality meta seeding (plan 01) provides the data-driven values; hardcoded fallbacks ensure emails work without it.

## Next Phase Readiness
- Both email templates redesigned and ready for deployment via `supabase functions deploy send-alerts`
- Municipality meta seeding (from plan 01) will populate data-driven attendance info values
- Visual testing recommended: trigger a test digest and pre-meeting email to verify rendering

---
*Phase: 40-ux-polish-email*
*Completed: 2026-03-23*
