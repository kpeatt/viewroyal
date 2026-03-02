---
phase: quick-13
plan: 01
subsystem: ui
tags: [react, transcript, cc-overlay, sentence-splitting, useMemo]

requires:
  - phase: none
    provides: n/a
provides:
  - splitSegmentIntoSentences utility for sentence-level transcript sub-segments
  - SubSegment interface with interpolated timestamps
  - Sentence-level CC overlay, transcript sidebar, and transcript drawer
affects: [meeting-detail, transcript-display, cc-overlay]

tech-stack:
  added: []
  patterns: [sentence-splitting with interpolated timestamps, speaker-grouped sub-segments]

key-files:
  created:
    - apps/web/app/lib/transcript-utils.ts
  modified:
    - apps/web/app/components/meeting/VideoWithSidebar.tsx
    - apps/web/app/components/meeting/TranscriptDrawer.tsx

key-decisions:
  - "Split on sentence boundaries using /(?<=[.!?])\\s+/ regex, merge fragments under 15 chars"
  - "Interpolate sub-segment timestamps proportionally by character position within parent segment"
  - "Show speaker headers only on speaker/parentId changes for cleaner visual grouping"
  - "Widened resolveSpeakerName prop type to accept SubSegment-compatible shapes"

patterns-established:
  - "SubSegment pattern: sentence-level transcript entries derived from TranscriptSegment with interpolated times"

requirements-completed: [QUICK-13]

duration: 5min
completed: 2026-03-02
---

# Quick Task 13: Sentence-Level Transcript Sub-Segments Summary

**Sentence-splitting utility splits full speaker turns into 1-2 sentence sub-segments with interpolated timestamps for CC overlay, sidebar, and drawer**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-02T19:11:05Z
- **Completed:** 2026-03-02T19:16:25Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Created `transcript-utils.ts` with `SubSegment` interface, `splitSegmentIntoSentences`, `splitTranscript`, and `findCurrentSubSegment`
- CC overlay now shows 1-2 sentences at a time (like real subtitles) instead of entire speaker turns
- Transcript sidebar and drawer display sentence-level entries with speaker headers only on speaker changes
- Auto-scroll and click-to-seek work at sentence granularity in both sidebar and drawer
- Search in transcript drawer filters at sentence level

## Task Commits

Each task was committed atomically:

1. **Task 1: Create transcript splitting utility** - `ce9b4d93` (feat)
2. **Task 2: Update VideoWithSidebar to use sub-segments** - `33c6bb70` (feat)
3. **Task 3: Update TranscriptDrawer to use sub-segments** - `70f4d078` (feat)

## Files Created/Modified
- `apps/web/app/lib/transcript-utils.ts` - SubSegment interface, sentence splitting with interpolated timestamps, transcript splitting, current segment finder
- `apps/web/app/components/meeting/VideoWithSidebar.tsx` - CC overlay uses sub-segments, sidebar renders sentence-level entries with speaker grouping
- `apps/web/app/components/meeting/TranscriptDrawer.tsx` - Drawer renders sentence-level entries, search/scroll/seek at sentence granularity

## Decisions Made
- Used `/(?<=[.!?])\s+/` regex for sentence boundary detection -- keeps punctuation with preceding sentence
- Merge fragments under 15 chars with the next sentence to avoid tiny CC lines like "So moved."
- Skip splitting for segments already under 120 chars or that produce only 1 sentence
- Interpolate timestamps proportionally by character offset within parent segment duration
- Show speaker name + color dot only when speaker changes between consecutive sub-segments (via parentId/speaker_name comparison)
- Widened `resolveSpeakerName` prop type from `(seg: TranscriptSegment) => string` to `(seg: { person?: { name: string } | null; speaker_name?: string | null }) => string` for SubSegment compatibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm typecheck` passes with zero errors
- `pnpm build` succeeds for Cloudflare Workers
- Manual verification needed: open a meeting with transcript, enable CC to confirm 1-2 sentences at a time

## Self-Check: PASSED

All 3 created/modified files verified on disk. All 3 task commits verified in git log.

---
*Quick Task: 13*
*Completed: 2026-03-02*
