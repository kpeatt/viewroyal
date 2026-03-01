---
phase: 31-search-controls-polish
plan: 02
status: complete
duration: ~5min
started: 2026-03-01T13:08:00Z
completed: 2026-03-01T13:13:00Z
---

# Plan 31-02 Summary: Source Panel + Related Section Polish

## What Was Built

Polished the AI answer layout: source panel now collapsed by default with "N sources used" header, and follow-up suggestions redesigned as a prominent collapsible "Related" section with full-width vertical pill buttons.

## Key Changes

### Task 1: Collapse source panel by default and update header text
- **ai-answer.tsx**: Changed `sourcesOpen` default from `true` to `false`; added `useEffect` to reset `sourcesOpen` to `false` when `isStreaming` becomes true (so each new answer starts with sources collapsed)
- **source-cards.tsx**: Changed header text from "Sources (N)" to "N sources used"

### Task 2: Redesign FollowUp as collapsible Related section
- **follow-up.tsx**: Replaced horizontal chip layout with collapsible "Related" section using the same toggle pattern as Research steps and Sources sections (Sparkles icon, uppercase tracking-wider header, ChevronDown rotation). Full-width vertical pill buttons for each suggestion. Starts expanded by default.
- **search.tsx**: Layout order verified correct after Plan 31-01 changes: AiAnswer -> FollowUp -> Follow-up input. No changes needed.

## Commits

1. `a3662b15` - feat(31-02): collapse source panel by default and update header text
2. `99b60cb2` - feat(31-02): redesign FollowUp as collapsible Related section with pill buttons

## Self-Check: PASSED

- [x] All 7 must_have truths verified
- [x] All artifact paths exist
- [x] Full test suite (179 tests) passes with no regressions
- [x] TypeScript compiles cleanly

## Key Files

### Modified
- `apps/web/app/components/search/ai-answer.tsx`
- `apps/web/app/components/search/source-cards.tsx`
- `apps/web/app/components/search/follow-up.tsx`

## Deviations

None. All plan tasks executed as specified.
