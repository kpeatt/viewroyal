---
phase: quick-13
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/lib/transcript-utils.ts
  - apps/web/app/components/meeting/VideoWithSidebar.tsx
  - apps/web/app/components/meeting/TranscriptDrawer.tsx
autonomous: true
requirements: [QUICK-13]
must_haves:
  truths:
    - "CC overlay shows 1-2 sentences at a time, advancing as video plays"
    - "Transcript sidebar shows sentence-level entries instead of full speaker turns"
    - "Transcript drawer shows sentence-level entries instead of full speaker turns"
    - "Clicking a sentence-level entry seeks to the correct interpolated time"
    - "Auto-scroll follows the current sentence, not the whole speaker turn"
  artifacts:
    - path: "apps/web/app/lib/transcript-utils.ts"
      provides: "splitSegmentIntoSentences utility"
      exports: ["splitSegmentIntoSentences", "SubSegment"]
    - path: "apps/web/app/components/meeting/VideoWithSidebar.tsx"
      provides: "Updated CC overlay and transcript sidebar using sub-segments"
    - path: "apps/web/app/components/meeting/TranscriptDrawer.tsx"
      provides: "Updated transcript drawer using sub-segments"
  key_links:
    - from: "apps/web/app/lib/transcript-utils.ts"
      to: "apps/web/app/components/meeting/VideoWithSidebar.tsx"
      via: "splitSegmentIntoSentences import"
      pattern: "import.*splitSegmentIntoSentences.*transcript-utils"
    - from: "apps/web/app/lib/transcript-utils.ts"
      to: "apps/web/app/components/meeting/TranscriptDrawer.tsx"
      via: "splitSegmentIntoSentences import"
      pattern: "import.*splitSegmentIntoSentences.*transcript-utils"
---

<objective>
Split full speaker-turn transcript segments into sentence-level sub-segments for CC overlay and transcript display.

Purpose: Currently, when CC is on, the entire speaker turn text is shown at once -- if a councillor speaks for 2 minutes, all that text appears simultaneously. Similarly, the transcript sidebar and drawer show large text blocks per speaker turn. This makes CC unreadable and the transcript hard to follow. By splitting into sentence-level sub-segments with interpolated timestamps, the CC acts like real subtitles (1-2 sentences at a time) and the transcript becomes scannable.

Output: A transcript-utils utility that splits TranscriptSegments into SubSegments, and updated VideoWithSidebar + TranscriptDrawer components that use sub-segments.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/app/lib/types.ts (TranscriptSegment interface)
@apps/web/app/lib/timeline-utils.ts (formatTimestamp, findAgendaItemForTime)
@apps/web/app/components/meeting/VideoWithSidebar.tsx (CC overlay + transcript sidebar)
@apps/web/app/components/meeting/TranscriptDrawer.tsx (full transcript drawer)

<interfaces>
From apps/web/app/lib/types.ts:
```typescript
export interface TranscriptSegment {
  id: number;
  meeting_id: number;
  speaker_name?: string;
  speaker_role?: string;
  person_id: number | null;
  agenda_item_id: number | null;
  matter_id: number | null;
  motion_id: number | null;
  attribution_source: string;
  is_verified: boolean;
  is_procedural: boolean;
  sentiment_score?: number;
  start_time: number;
  end_time: number;
  text_content: string;
  created_at: string;
  person?: Person;
}
```

From apps/web/app/lib/timeline-utils.ts:
```typescript
export function formatTimestamp(seconds: number): string;
export function findAgendaItemForTime(agendaItems: AgendaItem[], time: number): AgendaItem | undefined;
```

From apps/web/app/lib/colors.ts:
```typescript
export function getSpeakerColorIndex(name: string): number;
export const SPEAKER_COLORS: string[];
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create transcript splitting utility</name>
  <files>apps/web/app/lib/transcript-utils.ts</files>
  <action>
Create a new file `apps/web/app/lib/transcript-utils.ts` with:

1. A `SubSegment` interface:
```typescript
export interface SubSegment {
  id: string;           // e.g. "seg-{parentId}-{index}"
  parentId: number;     // original TranscriptSegment.id
  speaker_name?: string;
  speaker_role?: string;
  person_id: number | null;
  person?: Person;
  start_time: number;   // interpolated from parent
  end_time: number;     // interpolated from parent
  text_content: string; // 1-2 sentences
}
```

2. A `splitSegmentIntoSentences(segment: TranscriptSegment): SubSegment[]` function that:
   - Splits `text_content` on sentence boundaries (`. `, `? `, `! `, plus end-of-string)
   - Use a regex like `/(?<=[.!?])\s+/` to split, keeping punctuation with the preceding sentence
   - If a sentence is very short (under 15 chars) and there's a next sentence, merge it with the next one to avoid tiny fragments like "So moved."
   - If the original segment text is already short (under 120 chars or only 1 sentence), return it as a single SubSegment (no splitting needed)
   - Interpolate `start_time` and `end_time` proportionally based on character position within the full text:
     - `subStart = parentStart + (charOffset / totalChars) * duration`
     - `subEnd = parentStart + ((charOffset + sentenceLength) / totalChars) * duration`
   - Copy `speaker_name`, `speaker_role`, `person_id`, `person` from parent segment

3. A `splitTranscript(segments: TranscriptSegment[]): SubSegment[]` function that:
   - Maps each segment through `splitSegmentIntoSentences`
   - Flattens into a single array
   - Returns the array sorted by `start_time` (should already be sorted if input was)

4. A `findCurrentSubSegment(subSegments: SubSegment[], currentTime: number): SubSegment | undefined` function that:
   - Returns the sub-segment where `currentTime >= start_time && currentTime < end_time`
   - This replaces the inline `.find()` calls in VideoWithSidebar
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/web && npx tsc --noEmit app/lib/transcript-utils.ts 2>&1 | head -20</automated>
  </verify>
  <done>transcript-utils.ts exports SubSegment, splitSegmentIntoSentences, splitTranscript, and findCurrentSubSegment. TypeScript compiles without errors.</done>
</task>

<task type="auto">
  <name>Task 2: Update VideoWithSidebar to use sub-segments for CC and transcript sidebar</name>
  <files>apps/web/app/components/meeting/VideoWithSidebar.tsx</files>
  <action>
Modify VideoWithSidebar.tsx to use sentence-level sub-segments:

1. Import: `import { splitTranscript, findCurrentSubSegment, type SubSegment } from "../../lib/transcript-utils";`

2. Add a `useMemo` near the top of the component to split transcript:
```typescript
const subSegments = useMemo(() => splitTranscript(transcript), [transcript]);
```

3. Update `currentSegment` to find the current sub-segment instead:
```typescript
const currentSubSegment = useMemo(() => {
  return findCurrentSubSegment(subSegments, videoPlayer.currentTime);
}, [subSegments, videoPlayer.currentTime]);
```

4. Update BOTH CC overlays (mobile line ~314 and desktop line ~342) to use `currentSubSegment` instead of `currentSegment`:
   - Replace `currentSegment` with `currentSubSegment` in the conditional rendering
   - Replace `currentSegment.text_content` with `currentSubSegment.text_content`
   - Replace `resolveSpeakerName(currentSegment)` calls -- since SubSegment has `speaker_name` directly, create a small helper or inline: use the same `resolveSpeakerName` by passing a SubSegment-compatible object (SubSegment has the same speaker_name/person_id/person fields)

5. Update `TranscriptSidebarContent` to accept and render sub-segments instead of full transcript segments:
   - Change the `transcript` prop type from `TranscriptSegment[]` to `SubSegment[]`
   - Update the map rendering to use sub-segment fields
   - Since sub-segments from the same speaker will appear consecutively, add visual grouping: only show the speaker name + color dot when the speaker changes from the previous sub-segment (compare `parentId` or `speaker_name` to the previous item). For continuation sub-segments, omit the speaker header row to create a cleaner flow.
   - Update the element ID from `sidebar-seg-${segment.id}` to `sidebar-seg-${subSegment.id}` (string IDs now)

6. Update auto-scroll logic (the `useEffect` around line 119) to find current sub-segment via `findCurrentSubSegment(subSegments, ...)` and use `sidebar-seg-${currentSub.id}` for element lookup.

7. Pass `subSegments` instead of `transcript` to `TranscriptSidebarContent` in both the desktop sidebar call and the mobile drawer call.

8. Keep `agendaTranscript` filtering working: filter `subSegments` by the parent segment's agenda_item_id range instead of the sub-segment directly, or filter sub-segments where their `start_time` falls within the agenda item's discussion time range.

9. Keep the original `transcript` prop on `VideoWithSidebarProps` unchanged -- the splitting happens inside the component.

NOTE: The `resolveSpeakerName` function from the parent takes a `TranscriptSegment` and uses `person?.name || speaker_name || "Unknown"`. SubSegment carries the same fields, so it should work if we pass it (TypeScript may need a type assertion or the function signature needs to accept `{ person_id: number | null; speaker_name?: string; person?: Person }`). The simplest approach: make `resolveSpeakerName` accept `Pick<TranscriptSegment, 'speaker_name' | 'person_id' | 'person'>` or just cast the SubSegment.
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/web && pnpm typecheck 2>&1 | tail -20</automated>
  </verify>
  <done>CC overlay shows 1-2 sentences at a time advancing with video playback. Transcript sidebar shows sentence-level entries with speaker headers only on speaker changes. Auto-scroll tracks the current sentence. Clicking a sentence seeks to its interpolated time. TypeScript compiles cleanly.</done>
</task>

<task type="auto">
  <name>Task 3: Update TranscriptDrawer to use sub-segments</name>
  <files>apps/web/app/components/meeting/TranscriptDrawer.tsx</files>
  <action>
Modify TranscriptDrawer.tsx to use sentence-level sub-segments:

1. Import: `import { splitTranscript, findCurrentSubSegment, type SubSegment } from "../../lib/transcript-utils";`

2. Change the `transcript` prop to stay as `TranscriptSegment[]` (the parent passes the original transcript). Inside the component, create sub-segments:
```typescript
const subSegments = useMemo(() => splitTranscript(transcript), [transcript]);
```

3. Update the search filter to work on sub-segments:
```typescript
const filteredSubSegments = subSegments.filter((sub) => {
  if (!searchQuery) return true;
  const text = sub.text_content.toLowerCase();
  const speaker = resolveSpeakerName(sub as any).toLowerCase();
  const query = searchQuery.toLowerCase();
  return text.includes(query) || speaker.includes(query);
});
```

4. Update the segment count badge to show `filteredSubSegments.length` instead of `filteredTranscript.length`.

5. Update auto-scroll `useEffect` to find current sub-segment via `findCurrentSubSegment(subSegments, currentTime)` and use `drawer-segment-${currentSub.id}`.

6. Update `jumpToLive` similarly to find and scroll to the current sub-segment.

7. Update the rendering loop to map over `filteredSubSegments` instead of `filteredTranscript`:
   - Use `sub.id` (string) as key and element ID prefix
   - Show speaker name + color dot only when speaker changes (compare to previous item's `speaker_name` or `parentId`)
   - For continuation sub-segments from the same speaker, render just the text with a small left indent but no speaker header
   - Each sub-segment still clickable, seeking to `sub.start_time`
   - Use `sub.text_content` for the HighlightText component

8. Update the `resolveSpeakerName` call -- SubSegment has the same fields needed, so cast or adjust the prop type to accept the SubSegment shape.
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/web && pnpm typecheck 2>&1 | tail -20</automated>
  </verify>
  <done>TranscriptDrawer shows sentence-level entries with speaker headers on speaker changes only. Search filters by sentence. Auto-scroll and jump-to-live work at sentence granularity. Clicking a sentence seeks to the correct time. TypeScript compiles cleanly.</done>
</task>

</tasks>

<verification>
1. `cd apps/web && pnpm typecheck` -- no type errors
2. `cd apps/web && pnpm build` -- builds successfully for Cloudflare Workers
3. Manual: Open a meeting with transcript, enable CC -- should show 1-2 sentences at a time
4. Manual: Check transcript sidebar -- should show sentence-level entries, not full speaker turns
5. Manual: Open transcript drawer -- should show sentence-level entries with search working
</verification>

<success_criteria>
- CC overlay displays 1-2 sentences at a time, advancing naturally as video plays (like real subtitles)
- Transcript sidebar and drawer show sentence-level entries grouped by speaker
- Speaker headers appear only on speaker changes, not repeated for every sentence
- Clicking any sentence seeks to the correct interpolated timestamp
- Auto-scroll tracks the current sentence in both sidebar and drawer
- Search in transcript drawer works at sentence level
- No TypeScript errors, build succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/13-use-transcript-segments-for-transcript-c/13-SUMMARY.md`
</output>
