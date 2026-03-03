---
phase: quick-14
plan: 01
subsystem: analytics
tags: [posthog, analytics, pageview-tracking, react-router]

# Dependency graph
requires: []
provides:
  - PostHog analytics integration with automatic pageview tracking
  - VITE_POSTHOG_KEY environment variable wiring through Vite and Cloudflare Workers
affects: [web-app, deployment]

# Tech tracking
tech-stack:
  added: [posthog-js]
  patterns: [client-side-only analytics provider, manual SPA pageview tracking]

key-files:
  created:
    - apps/web/app/components/posthog-provider.tsx
  modified:
    - apps/web/app/root.tsx
    - apps/web/vite.config.ts
    - apps/web/wrangler.toml
    - apps/web/package.json

key-decisions:
  - "Used posthog-js directly instead of posthog-js/react to avoid SSR/bundling issues on Cloudflare Workers"
  - "Manual $pageview capture on route change instead of auto-capture (SPA requires manual tracking)"
  - "Graceful no-op when API key is empty -- safe for local development without PostHog"

patterns-established:
  - "Client-side analytics: use useEffect with typeof window guard, never run during SSR"
  - "SPA pageview tracking: disable auto-capture, track manually via useLocation deps"

requirements-completed: [QUICK-14]

# Metrics
duration: 2min
completed: 2026-03-03
---

# Quick Task 14: Add PostHog Analytics Summary

**PostHog JS SDK integrated with automatic $pageview tracking on every React Router navigation, SSR-safe for Cloudflare Workers**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-03T18:17:05Z
- **Completed:** 2026-03-03T18:18:46Z
- **Tasks:** 3 (2 auto + 1 checkpoint auto-approved)
- **Files modified:** 5

## Accomplishments
- Installed posthog-js and created SSR-safe PostHogProvider component
- Automatic $pageview events fire on every React Router navigation via useLocation
- API key configurable via VITE_POSTHOG_KEY env var (wrangler.toml + vite.config.ts define block)
- Graceful no-op when key is missing -- no errors in local dev without PostHog

## Task Commits

Each task was committed atomically:

1. **Task 1: Install posthog-js and create client-side provider** - `68f5f901` (feat)
2. **Task 2: Wire PostHogProvider into root layout** - `56664d8c` (feat)
3. **Task 3: Verify PostHog captures pageviews** - auto-approved (checkpoint)

## Files Created/Modified
- `apps/web/app/components/posthog-provider.tsx` - Client-side PostHog init + pageview tracking component
- `apps/web/app/root.tsx` - Added PostHogProvider to Layout body after Scripts
- `apps/web/vite.config.ts` - Added VITE_POSTHOG_KEY to define block for Cloudflare Workers build
- `apps/web/wrangler.toml` - Added VITE_POSTHOG_KEY var (empty, user fills in)
- `apps/web/package.json` - Added posthog-js dependency

## Decisions Made
- Used `posthog-js` directly (not `posthog-js/react`) to avoid SSR/bundling issues on Cloudflare Workers
- Set `capture_pageview: false` in PostHog init and manually capture `$pageview` on route changes via `useLocation()` -- required for SPA routing
- Set `person_profiles: "identified_only"` to respect privacy (anonymous users not profiled)
- Guard all PostHog calls with `typeof window !== "undefined"` and `posthog.__loaded` checks for SSR safety

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

To activate PostHog analytics:
1. Create a PostHog account at https://us.posthog.com/signup
2. Get Project API Key from PostHog Settings > Project > API Key
3. Add key to `apps/web/wrangler.toml` [vars]: `VITE_POSTHOG_KEY = "phc_yourkey"`
4. Add key to local `.env`: `VITE_POSTHOG_KEY=phc_yourkey`
5. Deploy with `pnpm deploy` (key is inlined at build time)

## Issues Encountered

None.

## Next Steps
- Add PostHog API key to wrangler.toml and deploy
- Optionally add custom event tracking for key actions (search queries, video plays, document views)
- Consider PostHog feature flags for A/B testing

## Self-Check: PASSED

- [x] `apps/web/app/components/posthog-provider.tsx` exists
- [x] `14-SUMMARY.md` exists
- [x] Commit `68f5f901` exists (Task 1)
- [x] Commit `56664d8c` exists (Task 2)

---
*Quick Task: 14-add-posthog-or-similar-analytics*
*Completed: 2026-03-03*
