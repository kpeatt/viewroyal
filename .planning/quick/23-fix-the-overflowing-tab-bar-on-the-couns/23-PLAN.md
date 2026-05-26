---
phase: quick-23
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/routes/person-profile.tsx
autonomous: true
requirements: [FIX-TAB-OVERFLOW]
must_haves:
  truths:
    - "Tab bar does not overflow its container on mobile or desktop"
    - "All 6 tabs are accessible without horizontal scrolling"
    - "Active tab styling still works correctly"
  artifacts:
    - path: "apps/web/app/routes/person-profile.tsx"
      provides: "Fixed tab bar layout"
  key_links: []
---

<objective>
Fix the overflowing tab bar on councillor profile pages (/people/:id).

Purpose: The profile page has 6 tabs (Profile, Policy, Key Votes, Votes, Speaking, Attendance) that overflow their container, causing layout issues especially on smaller screens.

Output: Tab bar that wraps cleanly on all screen sizes without horizontal overflow.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/app/routes/person-profile.tsx
@apps/web/app/components/ui/tabs.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix tab bar overflow on person profile page</name>
  <files>apps/web/app/routes/person-profile.tsx</files>
  <action>
Fix the tab bar layout at lines 404-450 in person-profile.tsx. The issue is a combination of:

1. The outer div (line 404) has `overflow-x-auto` which allows horizontal scrolling instead of wrapping
2. The TabsList has `flex-wrap` but the base component uses `inline-flex w-fit` which prevents wrapping from working

Changes needed:

1. On the outer container div (line 404), change classes from:
   `"bg-white p-2 rounded-xl border border-zinc-200 shadow-sm sticky top-20 z-10 overflow-x-auto"`
   to:
   `"bg-white p-2 rounded-xl border border-zinc-200 shadow-sm sticky top-20 z-10"`
   (Remove `overflow-x-auto` -- wrapping handles overflow instead of scrolling)

2. On the TabsList (line 405), change classes from:
   `"bg-transparent border-none flex-wrap"`
   to:
   `"bg-transparent border-none flex flex-wrap w-full gap-1"`
   (Override the base `inline-flex w-fit` with `flex w-full` so wrapping actually works, add `gap-1` for spacing between wrapped rows)

3. On each TabsTrigger (6 instances, lines 406-449), add `flex-none` to prevent tabs from shrinking below their content width. The existing classes like `"font-bold data-[state=active]:bg-zinc-900 data-[state=active]:text-white rounded-lg px-4"` should have `flex-none` prepended.

This approach lets tabs wrap to a second row on narrow screens rather than overflowing or requiring horizontal scroll.
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/web && pnpm typecheck</automated>
  </verify>
  <done>Tab bar wraps cleanly on all screen sizes. No horizontal overflow or scrollbar on the tab container. All 6 tabs remain visible and clickable with correct active styling.</done>
</task>

</tasks>

<verification>
- `pnpm typecheck` passes in apps/web
- Visual check: tab bar wraps to second row on narrow viewports instead of overflowing
</verification>

<success_criteria>
- Tab bar does not cause horizontal overflow on any screen size
- All tabs remain accessible and correctly styled
- Active tab indicator works as before
</success_criteria>

<output>
After completion, create `.planning/quick/23-fix-the-overflowing-tab-bar-on-the-couns/23-01-SUMMARY.md`
</output>
