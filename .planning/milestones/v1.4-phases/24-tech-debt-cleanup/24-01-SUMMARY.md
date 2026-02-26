---
phase: 24-tech-debt-cleanup
plan: 01
subsystem: infra
tags: [wrangler, cloudflare, next.js, build-pipeline, dns]

requires:
  - phase: 22-reference-content-production
    provides: Initial docs deployment to Cloudflare Workers
provides:
  - Clean docs build pipeline with single prebuild execution
  - One-command deploy script for docs site
  - Self-contained wrangler dependency in apps/docs
  - Custom domain route for docs.viewroyal.ai
affects: []

tech-stack:
  added: [wrangler (direct devDep in apps/docs)]
  patterns: [npm prebuild lifecycle hook for pre-build generation]

key-files:
  created: []
  modified:
    - apps/docs/package.json
    - apps/docs/wrangler.toml
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Rely on npm prebuild lifecycle hook instead of explicit script call in build"
  - "Deploy script: tsc --noEmit && pnpm build && wrangler deploy (typecheck before build)"
  - "Wrangler ^4.64.0 as direct devDep matching apps/web and apps/vimeo-proxy"
  - "Custom domain via routes directive (same pattern as apps/web)"

patterns-established:
  - "npm prebuild hook: use for pre-build generation scripts, avoid duplicating in build"

requirements-completed: []

duration: 3min
completed: 2026-02-24
---

# Phase 24: Tech Debt Cleanup Summary

**Docs build pipeline cleaned up: single prebuild execution, one-command deploy, self-contained wrangler dependency, and custom domain routing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-24
- **Completed:** 2026-02-24
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Fixed duplicate `generate-openapi.mjs` execution by removing explicit call from `build` script (now relies solely on `prebuild` lifecycle hook)
- Added `deploy` script for one-command deployment: typecheck, build (with prebuild), wrangler deploy
- Added `wrangler` as direct devDependency of `apps/docs` — no longer relies on `shamefully-hoist` from `.npmrc`
- Configured `docs.viewroyal.ai` custom domain route in `wrangler.toml`
- Added `deploy:docs` convenience script to root `package.json`

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix duplicate prebuild and add deploy script with wrangler dependency** - `fe2bb7f2` (fix)
2. **Task 2: Configure custom domain routing for docs.viewroyal.ai** - `c6cac40a` (fix)
3. **Task 3: Verify end-to-end build pipeline** - verified, no file changes needed

## Files Created/Modified
- `apps/docs/package.json` - Fixed build script, added deploy script, added wrangler devDependency
- `apps/docs/wrangler.toml` - Added routes directive for docs.viewroyal.ai custom domain
- `package.json` (root) - Added deploy:docs convenience script
- `pnpm-lock.yaml` - Updated with wrangler dependency

## Decisions Made
- Kept `prebuild` hook as the single entry point for generate-openapi.mjs — standard npm lifecycle pattern
- Deploy script includes typecheck (`tsc --noEmit`) before build per CONTEXT.md decision
- Used `routes` directive with `zone_name` for custom domain (same pattern as apps/web)

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
- Live OpenAPI spec fetch returned HTTP 404 during build verification (expected — the double-prefixed URL is a known chanfana behavior). Fallback to committed `openapi.json` worked correctly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- v1.4 milestone complete — all documentation portal phases delivered
- DNS CNAME record for `docs` should be verified in Cloudflare dashboard if not already configured

---
*Phase: 24-tech-debt-cleanup*
*Completed: 2026-02-24*
