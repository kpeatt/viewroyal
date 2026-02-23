---
phase: 19-infrastructure-scaffolding
plan: 02
subsystem: infra
tags: [fumadocs, next.js, static-export, documentation]

requires:
  - phase: 19-01
    provides: pnpm workspace with apps/docs as recognized member
provides:
  - fumadocs v16 + Next.js 16 documentation site scaffold in apps/docs/
  - static export build pipeline producing out/ directory
  - Orama client-side search with static search index
  - dark mode via fumadocs-ui RootProvider
  - sidebar navigation via DocsLayout
affects: [20-api-reference-content, 21-guides-content, 22-deployment]

tech-stack:
  added: [fumadocs-ui@16, fumadocs-core@16, fumadocs-mdx@14, next@16, tailwindcss@4]
  patterns: [fumadocs-collections-api, static-export, css-first-tailwind, turbopack-build]

key-files:
  created:
    - apps/docs/package.json
    - apps/docs/next.config.mjs
    - apps/docs/source.config.ts
    - apps/docs/tsconfig.json
    - apps/docs/app/layout.tsx
    - apps/docs/app/docs/layout.tsx
    - apps/docs/app/docs/[[...slug]]/page.tsx
    - apps/docs/app/api/search/route.ts
    - apps/docs/lib/source.ts
    - apps/docs/mdx-components.tsx
    - apps/docs/tailwind.css
    - apps/docs/content/docs/index.mdx
    - apps/docs/content/docs/meta.json
    - apps/docs/.gitignore
  modified: []

key-decisions:
  - "Manual scaffold instead of create-fumadocs-app for full control over file contents"
  - "Next.js 16 with Turbopack default bundler produces flat HTML files (docs.html not docs/index.html)"
  - "baseUrl: '.' required in tsconfig.json for fumadocs-mdx collections path resolution"

patterns-established:
  - "fumadocs content: MDX files in content/docs/ with meta.json for sidebar ordering"
  - "fumadocs source: source.config.ts defines collections, lib/source.ts creates loader"
  - "CSS imports: Tailwind v4 CSS-first with fumadocs preset imports (no tailwind.config.js)"
  - "Provider import: fumadocs-ui/provider/next (v16 framework-specific path)"

requirements-completed: [FWRK-01, FWRK-02]

duration: 3min
completed: 2026-02-23
---

# Phase 19 Plan 02: fumadocs Scaffold Summary

**fumadocs v16 + Next.js 16 static documentation site with sidebar, search, and dark mode in apps/docs/**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-23T21:15:37Z
- **Completed:** 2026-02-23T21:18:48Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Scaffolded complete fumadocs v16 documentation site in apps/docs/ with 13 source files
- Configured static export via `output: 'export'` producing working out/ directory
- Static build compiles with zero errors via Next.js 16 Turbopack
- Orama search index generated at out/api/search (12KB static JSON)
- Dark mode toggle functional via RootProvider + next-themes
- Sidebar navigation with DocsLayout auto-generated from page tree
- Placeholder landing page with ViewRoyal.ai API documentation content
- No regression in apps/web build after workspace expansion

## Task Commits

Each task was committed atomically:

1. **Task 1: Create fumadocs scaffold with all source files** - `12527b66` (feat)
2. **Task 2: Build static site and verify output** - `8ba940b4` (fix -- CSS path + tsconfig fixes + .gitignore)

## Files Created/Modified
- `apps/docs/package.json` - App dependencies (fumadocs-ui, fumadocs-core, fumadocs-mdx, next, react)
- `apps/docs/next.config.mjs` - Static export config with fumadocs MDX plugin
- `apps/docs/source.config.ts` - fumadocs-mdx collection definitions
- `apps/docs/tsconfig.json` - TypeScript config with fumadocs paths and baseUrl
- `apps/docs/app/layout.tsx` - Root layout with RootProvider for dark mode
- `apps/docs/app/docs/layout.tsx` - Docs layout with sidebar navigation
- `apps/docs/app/docs/[[...slug]]/page.tsx` - Dynamic page renderer with generateStaticParams
- `apps/docs/app/api/search/route.ts` - Static search index endpoint (Orama)
- `apps/docs/lib/source.ts` - Content source loader
- `apps/docs/mdx-components.tsx` - MDX component overrides
- `apps/docs/tailwind.css` - Tailwind v4 CSS-first with fumadocs presets
- `apps/docs/content/docs/index.mdx` - Placeholder landing page
- `apps/docs/content/docs/meta.json` - Sidebar navigation ordering
- `apps/docs/.gitignore` - Excludes .next/, out/, .source/, node_modules/

## Decisions Made
- Used manual scaffold for full control (not create-fumadocs-app)
- Added `baseUrl: "."` to tsconfig.json (required for fumadocs-mdx collections path)
- Next.js 16 auto-modified tsconfig: jsx -> react-jsx, added .next/types to include

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CSS import path incorrect in layout.tsx**
- **Found during:** Task 2 (Build static site)
- **Issue:** Plan specified `import './tailwind.css'` but tailwind.css is in parent directory relative to app/layout.tsx
- **Fix:** Changed to `import '../tailwind.css'`
- **Files modified:** apps/docs/app/layout.tsx
- **Verification:** Build succeeds after fix
- **Committed in:** 8ba940b4

**2. [Rule 3 - Blocking] tsconfig.json missing baseUrl for path resolution**
- **Found during:** Task 2 (Build static site)
- **Issue:** tsconfig `paths` with `.source/*` requires `baseUrl` to resolve relative paths
- **Fix:** Added `"baseUrl": "."` to compilerOptions
- **Files modified:** apps/docs/tsconfig.json
- **Verification:** Build succeeds with no path warnings
- **Committed in:** 8ba940b4

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for build to succeed. Plan's code examples had minor path issues; fixes are trivial corrections.

## Issues Encountered
- Next.js 16 Turbopack static export produces flat HTML files (docs.html) instead of directory-based (docs/index.html). This is the expected Next.js 16 behavior and works correctly for Cloudflare Workers static assets deployment.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Documentation site scaffold complete, ready for Phase 20 (API Reference content)
- Static build pipeline verified: `pnpm --filter docs build` produces working out/ directory
- Content authors can add MDX files to content/docs/ and they'll be auto-discovered

---
*Phase: 19-infrastructure-scaffolding*
*Completed: 2026-02-23*
