---
phase: 09-ai-profiling-comparison
plan: 03
subsystem: ui
tags: [react, tailwind, shadcn, speaking-time, stances, sparkline, svg, profile]

# Dependency graph
requires:
  - phase: 09-01
    provides: profiling.ts service, topic-utils.ts, StanceSpectrum component, speaking time RPCs
  - phase: 09-02
    provides: councillor_stances table populated with AI-generated stance data
provides:
  - SpeakingTimeCard component with headline stat, SVG sparkline, topic breakdown, and time range selector
  - SpeakerRanking component with horizontal bar chart comparing all councillors
  - StanceSummary component with per-topic stance cards, evidence quotes, and confidence badges
  - Enhanced person-profile.tsx with speaking time sidebar, Positions tab, and Compare button
affects: [09-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hand-rolled SVG sparkline for trend data (polyline + area fill + council avg dashed line)"
    - "Time range selector via URL search params (?timeRange=12m|term|all) with Link-based navigation"
    - "Collapsible evidence sections with expand/collapse state for progressive disclosure"
    - "CSS width bars for horizontal bar chart ranking (no chart library needed)"

key-files:
  created:
    - apps/web/app/components/profile/speaking-time-card.tsx
    - apps/web/app/components/profile/speaker-ranking.tsx
    - apps/web/app/components/profile/stance-summary.tsx
  modified:
    - apps/web/app/routes/person-profile.tsx

key-decisions:
  - "Time range selector uses URL search params instead of client state, enabling loader re-fetch on filter change"
  - "Focus Areas sidebar card removed in favor of SpeakingTimeCard topic breakdown (more comprehensive data from RPCs)"
  - "Speaker ranking shown as standalone card below SpeakingTimeCard for visual separation"
  - "Positions tab placed between Attendance History and Roles tabs for discovery"

patterns-established:
  - "SVG sparkline pattern: polyline + polygon fill + dashed average line + hover titles"
  - "Time range filtering via URL params with Link-based tab navigation (preserves other params)"
  - "Confidence badge pattern: green/amber/zinc based on statement count thresholds"

requirements-completed: [PROF-02, PROF-04, PROF-05]

# Metrics
duration: 4min
completed: 2026-02-18
---

# Phase 09 Plan 03: Profile Page Speaking Time & Stances Summary

**Speaking time sparkline with topic breakdown, speaker ranking bar chart, and AI stance summaries with collapsible evidence on the councillor profile page**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T21:09:38Z
- **Completed:** 2026-02-18T21:13:28Z
- **Tasks:** 2
- **Files created/modified:** 4

## Accomplishments
- Created SpeakingTimeCard with headline hours, SVG sparkline trend, council average annotation, topic breakdown bars, and time range tabs (12m/term/all)
- Created SpeakerRanking with horizontal bar chart highlighting current councillor, linked to each person's profile
- Created StanceSummary with per-topic cards showing StanceSpectrum, confidence badges, collapsible evidence quotes with meeting links, and related motion links
- Integrated all components into person-profile.tsx: loader fetches 4 new data sources in parallel, sidebar shows speaking time + ranking, new "Positions" tab shows stance analysis
- Added "Compare" button linking to /compare?a={id} in the profile card header
- Replaced old Focus Areas section with comprehensive topic speaking time data from RPCs

## Task Commits

Each task was committed atomically:

1. **Task 1: Create speaking time and stance UI components** - `2bf341b3` (feat)
2. **Task 2: Integrate speaking time + stances into person-profile.tsx** - `6e8aab8f` (feat)

## Files Created/Modified
- `apps/web/app/components/profile/speaking-time-card.tsx` - SpeakingTimeCard with sparkline SVG, time range selector, topic bars (207 lines)
- `apps/web/app/components/profile/speaker-ranking.tsx` - SpeakerRanking horizontal bar chart with avatar + link per councillor (95 lines)
- `apps/web/app/components/profile/stance-summary.tsx` - StanceSummary with per-topic stance cards, evidence, confidence badges (177 lines)
- `apps/web/app/routes/person-profile.tsx` - Enhanced loader with parallel profiling queries, new Positions tab, Compare button, SpeakingTimeCard + SpeakerRanking in sidebar

## Decisions Made
- Time range selector uses URL search params (`?timeRange=12m|term|all`) so the loader re-fetches data on change -- avoids client-side state complexity
- Removed the old Focus Areas card entirely rather than keeping both, since the SpeakingTimeCard topic breakdown is strictly more comprehensive (uses normalized topics from RPCs vs raw category counting)
- Speaker ranking rendered as a standalone Card below SpeakingTimeCard for visual separation rather than collapsible section within
- Positions tab placed between "Attendance History" and "Roles & Organizations" for natural discovery flow

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Profile page fully enhanced with speaking time metrics and stance analysis
- Compare button links to /compare?a={id} ready for Plan 04 comparison page
- All components reusable: StanceSummary and SpeakerRanking can be imported by Plan 04

## Self-Check: PASSED

All 4 files verified on disk. Both commit hashes (2bf341b3, 6e8aab8f) verified in git log.

---
*Phase: 09-ai-profiling-comparison*
*Completed: 2026-02-18*
