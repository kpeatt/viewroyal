---
phase: quick-20
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/components/meeting/VideoWithSidebar.tsx
autonomous: true
requirements: [QUICK-20]

must_haves:
  truths:
    - "On large screens (lg+), the sidebar fills the same height as the video player area without extra whitespace or overflow"
    - "The video maintains 16:9 aspect ratio within its column"
    - "The sidebar scrolls independently when content exceeds available height"
    - "Mobile layout remains unchanged (stacked, not side-by-side)"
  artifacts:
    - path: "apps/web/app/components/meeting/VideoWithSidebar.tsx"
      provides: "Fixed video+sidebar layout for large screens"
  key_links:
    - from: "parent flex container"
      to: "video column + sidebar column"
      via: "flex-row layout with height driven by video aspect ratio"
      pattern: "lg:flex-row"
---

<objective>
Fix the agenda/transcript sidebar alignment on larger screens in the meeting video viewer.

Purpose: On large screens, the `VideoWithSidebar` component uses `lg:aspect-video` on the parent flex container to set height, but this computes the aspect ratio based on the full container width -- not the 2/3 video column width. This causes the sidebar to be taller than necessary (the 16:9 ratio applies to 100% width, but the video only occupies 66%). The fix should make the container height driven by the video's actual 16:9 rendering within its 2/3 column.

Output: Updated VideoWithSidebar.tsx with correct sidebar/video height alignment on lg+ screens.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/app/components/meeting/VideoWithSidebar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix video+sidebar layout height alignment on large screens</name>
  <files>apps/web/app/components/meeting/VideoWithSidebar.tsx</files>
  <action>
The current layout structure (line ~184-185):
```
<div className="bg-zinc-900 rounded-2xl shadow-lg overflow-hidden">
  <div className="flex flex-col lg:flex-row lg:aspect-video lg:max-h-[70vh]">
    <div className={cn("relative", sidebarCollapsed ? "flex-1" : "lg:w-2/3")}>
      <div className="aspect-video lg:aspect-auto lg:absolute lg:inset-0 ...">
```

Problem: `lg:aspect-video` on the parent flex row means the container's height = width / (16/9). But the video only occupies 2/3 of that width. So the container is taller than the video's natural 16:9 height at 2/3 width, creating wasted space or misalignment in the sidebar.

Fix approach: Remove `lg:aspect-video` from the parent flex container. Instead, use a height constraint that matches what a 16:9 video would be at the video column's actual width. The cleanest approach:

1. On the outer flex container (line 185), replace `lg:aspect-video lg:max-h-[70vh]` with just `lg:max-h-[70vh]`.

2. On the video column (line 188, the `cn("relative", ...)` div), add `lg:aspect-video` so the VIDEO column itself drives its own height from its own width at 2/3.

3. On the inner video div (line 190), change from `lg:aspect-auto lg:absolute lg:inset-0` to just `lg:absolute lg:inset-0` (the aspect ratio is now on the parent column, not needed here).

4. On the sidebar (line 495), it already has `flex-col overflow-hidden` and flex-1 behavior. It will naturally fill the height set by the video column's aspect ratio since both are in the same flex row.

5. For the collapsed sidebar toggle (line 595), same principle applies -- it sits in the flex row and gets the height from the video column.

This ensures:
- The video column's aspect-video drives the row height based on its actual 2/3 width
- The sidebar fills exactly that height
- max-h-[70vh] still caps the overall height on very wide screens
- Mobile layout is unaffected (flex-col, aspect-video on inner div handles it)

IMPORTANT: Test that the mobile layout still works -- on mobile (below lg breakpoint), the video should still show with its own aspect-video ratio in the stacked layout. The video column's `aspect-video` class should only apply at `lg:` breakpoint to avoid doubling the aspect-ratio constraint on mobile where the inner div already has `aspect-video`.

So the video column classes should be:
```
cn("relative lg:aspect-video", sidebarCollapsed ? "flex-1" : "lg:w-2/3")
```

And the inner video div should be:
```
"aspect-video lg:aspect-auto lg:absolute lg:inset-0 bg-black relative group"
```
(keep lg:aspect-auto to cancel the inner aspect on desktop since the outer column now handles it)

Wait -- re-reading more carefully, the inner div has `aspect-video` for mobile and `lg:aspect-auto lg:absolute lg:inset-0` for desktop. This is correct: on mobile, the inner div sets the 16:9 box; on desktop, the inner div fills the column via absolute positioning.

So the change is:
- Line 185: Remove `lg:aspect-video`, keep `lg:max-h-[70vh]`
- Line 188: Add `lg:aspect-video` to the video column div

That's it. The video column at lg:w-2/3 will compute its height as (2/3 of container width) / (16/9), and the sidebar will match that height.
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/web && pnpm typecheck</automated>
  </verify>
  <done>On large screens, the sidebar height matches the video player's 16:9 height at its actual 2/3 column width, with no excess whitespace. Mobile layout unchanged.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Fixed sidebar alignment so it matches video height on large screens</what-built>
  <how-to-verify>
    1. Run `cd apps/web && pnpm dev`
    2. Visit http://localhost:5173/meetings/42 (or any meeting with video)
    3. On a wide browser window (1200px+), verify the sidebar (agenda/transcript panel) aligns flush with the video -- no extra dark space below the video or sidebar cut off
    4. Toggle between agenda and transcript tabs in the sidebar
    5. Collapse and expand the sidebar
    6. Resize browser to mobile width -- verify video still shows correctly in stacked layout with drawer for agenda/transcript
  </how-to-verify>
  <resume-signal>Type "approved" or describe alignment issues</resume-signal>
</task>

</tasks>

<verification>
- `pnpm typecheck` passes in apps/web
- Visual inspection confirms sidebar height matches video on lg+ screens
- Mobile layout unchanged
</verification>

<success_criteria>
The sidebar (agenda/transcript panel) aligns vertically with the video player on large screens -- no excess whitespace below either panel, and the sidebar fills exactly the height of the 16:9 video at its rendered width.
</success_criteria>

<output>
After completion, create `.planning/quick/20-fix-agenda-transcript-sidebar-alignment-/20-01-SUMMARY.md`
</output>
