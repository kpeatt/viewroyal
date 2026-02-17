---
phase: 04-home-page-enhancements
verified: 2026-02-16T20:30:00Z
status: gaps_found
score: 10/12 must-haves verified
re_verification: false
gaps:
  - truth: "Home page shows 5-6 active matters as compact cards with title, category badge, last activity date, summary, and subscribe button for logged-in users"
    status: partial
    reason: "Query limit is 4, not 5-6. The requirement HOME-01 specifies 5-6 matters. The SUMMARY documents this as an intentional decision ('Active matters reduced from 6 to 4'), but the requirement was not updated."
    artifacts:
      - path: "apps/web/app/services/site.ts"
        issue: "Line 125: .limit(4) — should be .limit(6) to satisfy HOME-01"
    missing:
      - "Change .limit(4) to .limit(6) in the active matters query in getHomeData()"
  - truth: "Home page shows 10-15 recent non-procedural motions with summary, result, vote breakdown text and visual dots, meeting link, divided vote highlight, and financial cost badge when available"
    status: partial
    reason: "Data layer fetches 15 motions (correct), but UI displays only 8 by default (decisions.slice(0, 8)). HOME-02 requires 10-15 displayed. The SUMMARY notes this was deliberately reduced to 8."
    artifacts:
      - path: "apps/web/app/components/home/decisions-feed-section.tsx"
        issue: "Line 31: decisions.slice(0, 8) — should be .slice(0, 10) or more to satisfy HOME-02 minimum of 10"
    missing:
      - "Change decisions.slice(0, 8) to decisions.slice(0, 10) in DecisionsFeedSection"
human_verification:
  - test: "Visual layout across breakpoints"
    expected: "All five sections (Hero, Upcoming Meeting, Recent Meeting, Active Matters, Decisions Feed) plus Public Notices stack cleanly on mobile. Hero map background visible at opacity-40."
    why_human: "Responsive CSS behavior and visual appearance cannot be verified programmatically"
  - test: "Auth-conditional CTA in Hero"
    expected: "When logged out, 'Create an account to track what matters to you' link appears below AskQuestion. When logged in, CTA is hidden."
    why_human: "Requires browser session state to confirm conditional rendering works at runtime"
  - test: "Subscribe buttons on matter cards"
    expected: "SubscribeButton renders on each matter card. For logged-out users, it prompts login. For logged-in users, it allows subscribing."
    why_human: "Requires browser auth state and Supabase connection to verify subscribe flow"
---

# Phase 4: Home Page Enhancements Verification Report

**Phase Goal:** The home page surfaces what is happening in council right now — active matters, recent decisions, and upcoming meetings — so returning visitors get immediate value without navigating deeper.
**Verified:** 2026-02-16T20:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `getHomeData()` returns activeMatters with title, category, last_seen, first_seen, and summary from agenda_items join | VERIFIED | `site.ts` lines 120-125, 184-197, 294-302: queries matters table, joins agenda_items for summaries via matter_id Map |
| 2 | `getHomeData()` returns recentDecisions with vote counts from votes table, meeting link data | VERIFIED | `site.ts` lines 128-137, 305-326: nested `votes(vote)` select, yesCount/noCount derived from individual records |
| 3 | `getHomeData()` returns upcomingMeeting with agenda topic preview when available | VERIFIED | `site.ts` lines 107-116, 169-181, 328-331: agendaPreview populated conditionally when has_agenda is true |
| 4 | `getHomeData()` returns recentMeetingData with summary, key decisions, stats (motion count, divided votes, agenda items) | VERIFIED | `site.ts` lines 200-285: meetingMotions + agendaCount batch queries, dividedVotes counted via votes |
| 5 | Vote counts come from votes table (nested select), NOT from motions.yes_votes/no_votes | VERIFIED | `site.ts` line 132: `votes(vote)` in select, lines 306-313: client-side filter on v.vote |
| 6 | Matter summaries come from agenda_items join, NOT from matters.plain_english_summary | VERIFIED | `site.ts` line 190: selects `plain_english_summary` from `agenda_items` joined by `matter_id` |
| 7 | Static SVG map component renders View Royal neighbourhood boundaries as decorative outline | VERIFIED | `view-royal-map.tsx`: 192-line component, exports `ViewRoyalMap`, valid SVG with viewBox, aria-hidden, paths for land/water/roads/neighbourhoods |
| 8 | Hero section displays Ask input, decorative map background, auth-conditional CTA for logged-out users | VERIFIED | `hero-section.tsx`: AskQuestion imported and rendered (line 31), ViewRoyalMap rendered as bg (line 15), `!user` CTA guard (line 39) |
| 9 | Upcoming Meeting shows next meeting with type badge and agenda preview (or graceful fallback) | VERIFIED | `upcoming-meeting-section.tsx`: null guard shows "No meetings scheduled", agendaPreview renders with category badges and summaries |
| 10 | Recent Meeting shows AI summary, key decisions with icons, and stats (agenda items, motions, divided votes) | VERIFIED | `recent-meeting-section.tsx`: meeting.summary rendered (line 66-70), decisions with CheckCircle2/XCircle (lines 79-96), stats row (lines 99-129) |
| 11 | Active matters shows compact cards — but shows 4, not 5-6 as required by HOME-01 | FAILED | `site.ts` line 125: `.limit(4)` — requirement specifies 5-6 |
| 12 | Decisions feed shows 10-15 recent non-procedural motions — but shows 8 by default | FAILED | `decisions-feed-section.tsx` line 31: `decisions.slice(0, 8)` — requirement specifies 10-15 |

**Score:** 10/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/app/services/site.ts` | Refactored getHomeData() returning all six data sets | VERIFIED | 339 lines, returns upcomingMeeting, recentMeeting, recentMeetingStats, recentMeetingDecisions, activeMatters, recentDecisions |
| `apps/web/app/components/home/view-royal-map.tsx` | Static SVG map component | VERIFIED | 192 lines, exports ViewRoyalMap, valid SVG with viewBox="0 0 800 600", aria-hidden="true", multiple path elements |
| `apps/web/app/routes/home.tsx` | Rewritten home route with loader and five-section layout | VERIFIED | 77 lines, imports all 5+1 section components, loader calls getHomeData, component renders all sections |
| `apps/web/app/components/home/hero-section.tsx` | Hero with Ask input, map bg, auth-conditional CTA | VERIFIED | 52 lines, renders AskQuestion + ViewRoyalMap + conditional CTA |
| `apps/web/app/components/home/upcoming-meeting-section.tsx` | Next upcoming meeting card with agenda preview | VERIFIED | 118 lines, handles null meeting, agenda preview with category badges |
| `apps/web/app/components/home/recent-meeting-section.tsx` | Featured recent meeting with summary and stats | VERIFIED | 139 lines, AI summary + key decisions + stats row + divided votes |
| `apps/web/app/components/home/active-matters-section.tsx` | Active matters cards with subscribe buttons | VERIFIED | 88 lines, grid layout, SubscribeButton per card, category badges, first/last seen |
| `apps/web/app/components/home/decisions-feed-section.tsx` | Decisions feed with vote visuals and financial cost | VERIFIED | 170 lines, dot visuals, divided highlight, amber badge, financial cost, Recent/Controversial toggle |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/web/app/routes/home.tsx` | `apps/web/app/services/site.ts` | loader calls getHomeData() | WIRED | Line 2 import, line 18 call with supabase |
| `apps/web/app/components/home/hero-section.tsx` | `apps/web/app/components/ask-question.tsx` | imports AskQuestion | WIRED | Line 2 import, line 31 rendered with props |
| `apps/web/app/components/home/hero-section.tsx` | `apps/web/app/components/home/view-royal-map.tsx` | imports ViewRoyalMap for background | WIRED | Line 3 import, line 15 rendered as absolute bg |
| `apps/web/app/components/home/active-matters-section.tsx` | `apps/web/app/components/subscribe-button.tsx` | imports SubscribeButton for each matter card | WIRED | Line 5 import, line 76-80 rendered per matter |
| `apps/web/app/routes/home.tsx` | `useRouteLoaderData('root')` | accesses user auth state for conditional CTA and subscribe buttons | WIRED | Line 1 import, lines 50-53 call with "root" key |
| `apps/web/app/services/site.ts` | Supabase matters + agenda_items | join on matter_id for summaries | WIRED | Lines 184-197: agenda_items queried with .in("matter_id", matterIds), matterSummaryMap built |
| `apps/web/app/services/site.ts` | Supabase motions + votes | nested select with votes(vote) | WIRED | Line 132: `votes(vote)` in select string, lines 306-313: vote array filtered for Yes/No counts |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HOME-01 | 04-01, 04-02 | Active matters section shows 5-6 recently-active matters ordered by last_seen with title, category badge, duration, and 1-line summary | PARTIAL | All fields present and rendered; summaries from agenda_items join. Limit is 4 (not 5-6). The SUMMARY notes this was intentionally reduced. |
| HOME-02 | 04-01, 04-02 | Recent decisions feed shows last 10-15 non-procedural motions with plain English summary, result, vote breakdown, date, and link to meeting | PARTIAL | Data layer fetches 15 (correct). UI displays 8 in "Recent" mode (decisions.slice(0,8)). All other fields (summary, result, vote breakdown, date, link) are present. |
| HOME-03 | 04-01, 04-02 | Upcoming meetings section shows next scheduled meetings with agenda topic preview | SATISFIED | upcomingMeeting with agendaPreview array; UpcomingMeetingSection renders preview items with category badges and plain_english_summary |
| HOME-04 | 04-01, 04-02 | Divided votes highlighted with visual indicator in decisions feed | SATISFIED | `border-l-2 border-l-amber-400` on divided rows (line 93), amber "Divided" Badge (line 140), "Controversial" filter toggle counts divided decisions |
| HOME-05 | 04-01, 04-02 | Financial cost displayed on decisions when financial_cost is available | SATISFIED | Lines 146-151: `decision.financialCost != null && decision.financialCost > 0` guard, then `${decision.financialCost.toLocaleString()}` in Badge |

**Orphaned requirements check:** No HOME-* requirements in REQUIREMENTS.md are unmapped from plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `active-matters-section.tsx` | 19 | `if (matters.length === 0) return null;` | Info | Legitimate empty-state guard — section hidden when no active matters |
| `decisions-feed-section.tsx` | 25 | `if (decisions.length === 0) return null;` | Info | Legitimate empty-state guard — section hidden when no decisions |
| `recent-meeting-section.tsx` | 30 | `if (!meeting) return null;` | Info | Legitimate null guard — section hidden when no recent meeting |

No blocking anti-patterns found. No TODO/FIXME/placeholder stubs detected. The `placeholder` attribute match in `hero-section.tsx` line 33 is an HTML input placeholder attribute, not a stub.

### Human Verification Required

#### 1. Visual Layout and Responsive Design

**Test:** Run `pnpm dev` in `apps/web/`, visit http://localhost:5173/ and resize to mobile width
**Expected:** Hero full-width blue gradient with visible map outline; five content sections below in single column; all sections stack cleanly at mobile breakpoints; text readable at all sizes
**Why human:** Responsive CSS behavior and visual appearance require browser rendering

#### 2. Auth-Conditional CTA Rendering

**Test:** Visit home page while logged out, then while logged in
**Expected:** Logged-out: "Create an account to track what matters to you" link appears below AskQuestion. Logged-in: CTA is absent.
**Why human:** Requires browser session state; `!user` conditional depends on root loader auth context at runtime

#### 3. Subscribe Buttons on Matter Cards

**Test:** View Active Matters section while logged in and logged out
**Expected:** Logged-in: SubscribeButton renders on each card and submits subscription. Logged-out: SubscribeButton prompts login or shows appropriate state.
**Why human:** Requires Supabase auth and subscription table integration to verify end-to-end flow

### Gaps Summary

Two gaps block full requirement satisfaction. Both are deliberate display count reductions made during Plan 02 checkpoint approval, but neither requirement (HOME-01 or HOME-02) was updated to reflect the new targets.

**Gap 1 — Active matters count (HOME-01):** The data layer caps at `.limit(4)` (`site.ts` line 125). HOME-01 requires 5-6. Fix: change to `.limit(6)`.

**Gap 2 — Decisions feed display count (HOME-02):** The UI shows `decisions.slice(0, 8)` (`decisions-feed-section.tsx` line 31). HOME-02 requires 10-15 displayed. Fix: change to `.slice(0, 10)`. Note: the data layer already fetches 15 so no backend change is needed.

Both gaps share the same root cause: intentional UX simplifications made at the checkpoint were not backported as requirement amendments. The fixes are trivial (two one-line changes) and do not affect any other component or data flow.

---

_Verified: 2026-02-16T20:30:00Z_
_Verifier: Claude (gsd-verifier)_
