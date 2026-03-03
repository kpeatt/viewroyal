---
phase: quick-14
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/package.json
  - apps/web/app/components/posthog-provider.tsx
  - apps/web/app/root.tsx
  - apps/web/vite.config.ts
  - apps/web/wrangler.toml
autonomous: false
requirements: [QUICK-14]
must_haves:
  truths:
    - "PostHog captures automatic pageview events for every route navigation"
    - "PostHog only initializes in the browser, never during SSR"
    - "PostHog API key is configurable via environment variable, not hardcoded"
  artifacts:
    - path: "apps/web/app/components/posthog-provider.tsx"
      provides: "Client-side PostHog initialization and pageview tracking"
    - path: "apps/web/app/root.tsx"
      provides: "PostHogProvider rendered in Layout"
  key_links:
    - from: "apps/web/app/root.tsx"
      to: "apps/web/app/components/posthog-provider.tsx"
      via: "PostHogProvider component in Layout body"
      pattern: "PostHogProvider"
---

<objective>
Add PostHog analytics to the web app. PostHog captures pageviews, user sessions, and provides a dashboard for understanding site usage patterns.

Purpose: Gain visibility into how citizens use ViewRoyal.ai -- which pages get traffic, how people navigate, what features get used.
Output: PostHog JS SDK integrated, automatic pageviews tracked on every route change.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/app/root.tsx
@apps/web/vite.config.ts
@apps/web/wrangler.toml
@apps/web/package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install posthog-js and create client-side provider</name>
  <files>apps/web/package.json, apps/web/app/components/posthog-provider.tsx, apps/web/vite.config.ts, apps/web/wrangler.toml</files>
  <action>
1. Install posthog-js: `cd apps/web && pnpm add posthog-js`

2. Add the PostHog API key to wrangler.toml [vars] section:
   ```
   VITE_POSTHOG_KEY = ""
   ```
   Leave it empty -- the user will fill it in. The key is public (safe in wrangler.toml).

3. Add the env var to the vite.config.ts `define` block so it is available at build time on Cloudflare Workers:
   ```ts
   "process.env.VITE_POSTHOG_KEY": JSON.stringify(env.VITE_POSTHOG_KEY || ""),
   ```

4. Create `apps/web/app/components/posthog-provider.tsx`:
   - Import `posthog` from `posthog-js`
   - Import `useEffect` from `react` and `useLocation` from `react-router`
   - Create a `PostHogProvider` component that:
     a. Uses `useEffect` (empty deps) to init PostHog on mount with:
        - `posthog.init(key, { api_host: "https://us.i.posthog.com", person_profiles: "identified_only", capture_pageview: false })`
        - Set `capture_pageview: false` because we track route changes manually (SPA)
        - Read the key from `import.meta.env.VITE_POSTHOG_KEY` first, falling back to `process.env.VITE_POSTHOG_KEY`
        - If key is empty/missing, skip initialization entirely (graceful no-op in dev)
     b. Uses a second `useEffect` with `[pathname, search]` deps from `useLocation()` to call `posthog.capture("$pageview")` on every route change
   - The component renders `null` (no UI)
   - Guard all posthog calls with `typeof window !== "undefined"` to be SSR-safe

IMPORTANT: Do NOT use `PostHogProvider` from `posthog-js/react` -- that package has SSR/bundling issues on Cloudflare Workers. Use the core `posthog-js` directly with manual init.
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/web && pnpm typecheck</automated>
  </verify>
  <done>posthog-js installed, provider component created, env var wired through vite.config.ts and wrangler.toml</done>
</task>

<task type="auto">
  <name>Task 2: Wire PostHogProvider into root layout</name>
  <files>apps/web/app/root.tsx</files>
  <action>
1. Import `PostHogProvider` from `~/components/posthog-provider`

2. Add `<PostHogProvider />` inside the `<Layout>` component's `<body>`, AFTER `<Scripts />` (so it loads after hydration):
   ```tsx
   <body className="antialiased">
     {children}
     <ScrollRestoration />
     <Scripts />
     <PostHogProvider />
   </body>
   ```

This placement ensures PostHog initializes after React hydrates, and the provider tracks all route changes via useLocation.
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/web && pnpm build</automated>
  </verify>
  <done>PostHogProvider renders in root layout, build succeeds without errors</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Verify PostHog captures pageviews</name>
  <files>apps/web/wrangler.toml</files>
  <action>
What was built: PostHog analytics integration. Once you add your PostHog API key, pageviews will be tracked automatically on every route navigation.

How to verify:
1. Create a PostHog account at https://us.posthog.com/signup if you don't have one
2. Get your Project API Key from PostHog Settings > Project > API Key
3. Add the key to `apps/web/wrangler.toml` [vars]: `VITE_POSTHOG_KEY = "phc_yourkey"`
4. Also add it to your local `.env`: `VITE_POSTHOG_KEY=phc_yourkey`
5. Run `cd apps/web && pnpm dev`
6. Visit http://localhost:5173 and navigate between a few pages
7. Check PostHog dashboard > Activity > Live Events -- you should see $pageview events appearing
8. For production: deploy with `pnpm deploy` (the wrangler.toml key will be used at build time)

Resume: Type "approved" or describe issues
  </action>
  <verify>User confirms pageview events appear in PostHog dashboard</verify>
  <done>PostHog is receiving $pageview events from the running app</done>
</task>

</tasks>

<verification>
- `pnpm typecheck` passes
- `pnpm build` succeeds
- PostHogProvider component exists and is SSR-safe (no window references without guards)
- No PostHog code runs during SSR (all behind useEffect or typeof window check)
</verification>

<success_criteria>
- posthog-js is installed as a dependency
- PostHogProvider component initializes PostHog client-side only
- Automatic $pageview events fire on every React Router navigation
- API key is configurable via VITE_POSTHOG_KEY env var
- Build and typecheck pass cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/14-add-posthog-or-similar-analytics/14-SUMMARY.md`
</output>
