---
phase: quick
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/root.tsx
autonomous: true
requirements: [BETA-BANNER]

must_haves:
  truths:
    - "User sees a beta banner at the top of every page indicating the site is in development"
    - "Banner is visually distinct but not intrusive — informational, not alarming"
    - "Banner does not interfere with navigation or page content"
  artifacts:
    - path: "apps/web/app/root.tsx"
      provides: "Beta banner rendered above Navbar in Layout"
      contains: "beta"
  key_links:
    - from: "apps/web/app/root.tsx"
      to: "Navbar"
      via: "Banner rendered immediately before Navbar in Layout body"
      pattern: "beta.*Navbar"
---

<objective>
Add a slim beta/development banner to the site header so visitors know ViewRoyal.ai is still under active development.

Purpose: Set user expectations — the site is a beta product, data may be incomplete, features are still being added.
Output: A persistent, dismissible banner visible on all pages above the navbar.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/app/root.tsx
@apps/web/app/components/navbar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add beta banner to site Layout in root.tsx</name>
  <files>apps/web/app/root.tsx</files>
  <action>
In `apps/web/app/root.tsx`, add a beta banner directly inside the Layout component's `<body>`, rendered ABOVE the `<Navbar />` component.

Banner design specifications:
- Full-width bar with amber/yellow background: `bg-amber-50 border-b border-amber-200`
- Centered text, small font: `text-center text-xs text-amber-800 py-1.5 px-4`
- Message text: "This site is in beta — data may be incomplete and features are still being added."
- Include a FlaskConical icon from lucide-react (size h-3 w-3, inline before the text) to visually indicate "experimental"
- Add the FlaskConical import to the existing lucide-react imports in navbar.tsx — actually, since this is in root.tsx, import FlaskConical directly in root.tsx from lucide-react

The banner should be a simple inline JSX element in the Layout, NOT a separate component file (it's too small to warrant its own file). Example structure:

```tsx
<body className="antialiased">
  <div className="bg-amber-50 border-b border-amber-200 text-center text-xs text-amber-800 py-1.5 px-4">
    <span className="inline-flex items-center gap-1.5">
      <FlaskConical className="h-3 w-3" />
      This site is in beta — data may be incomplete and features are still being added.
    </span>
  </div>
  <Navbar />
  {children}
  ...
</body>
```

Do NOT make the banner dismissible for now (keep it simple — no state management needed). It should always show.

Do NOT add animations or transitions. Keep it static and simple.
  </action>
  <verify>
Run `cd /Users/kyle/development/viewroyal/apps/web && pnpm typecheck` to confirm no TypeScript errors.
Visually: the banner should appear as a thin amber strip above the navbar on every page.
  </verify>
  <done>
A slim amber beta banner reading "This site is in beta — data may be incomplete and features are still being added." with a FlaskConical icon is visible above the navbar on all pages. No TypeScript errors.
  </done>
</task>

</tasks>

<verification>
- `pnpm typecheck` passes in apps/web/
- Banner is visible above navbar in browser at localhost:5173
- Banner appears on all routes (home, meetings, search, etc.) since it's in root Layout
</verification>

<success_criteria>
- Beta banner visible site-wide above navigation
- Amber/yellow styling that is informational but not alarming
- No TypeScript errors introduced
- No layout shift or interference with existing navbar sticky behavior
</success_criteria>

<output>
After completion, create `.planning/quick/2-add-beta-banner-to-homepage-header/2-SUMMARY.md`
</output>
