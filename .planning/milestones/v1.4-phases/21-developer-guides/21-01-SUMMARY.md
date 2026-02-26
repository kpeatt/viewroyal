---
phase: 21-developer-guides
plan: 01
subsystem: docs
tags: [mdx, fumadocs, guides, authentication, getting-started, developer-experience]

# Dependency graph
requires:
  - phase: 19-infrastructure-scaffolding
    provides: fumadocs v16 + Next.js 16 static export docs site
  - phase: 20-openapi-integration-api-reference
    provides: API reference pages for cross-linking
provides:
  - Guides sidebar navigation structure with meta.json ordering
  - Getting Started guide with zero-to-first-call walkthrough
  - Authentication guide with API key usage, rate limits, and error codes
  - Updated docs index page with links to all sections
affects: [21-02-developer-guides]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - fumadocs Tabs with groupId="language" for multi-language code examples
    - fumadocs Callout for security warnings and tips
    - Cross-linking from guides to API reference pages

key-files:
  created:
    - apps/docs/content/docs/guides/meta.json
    - apps/docs/content/docs/guides/getting-started.mdx
    - apps/docs/content/docs/guides/authentication.mdx
  modified:
    - apps/docs/content/docs/meta.json
    - apps/docs/content/docs/index.mdx

key-decisions:
  - "Used groupId='language' on all Tabs for cross-page language preference persistence"
  - "Included unauthenticated health check as Step 0 for instant developer gratification before signup"

patterns-established:
  - "Multi-language code examples: always use Tabs with groupId='language' and items=['curl', 'JavaScript', 'Python']"
  - "Security warnings: use Callout type='warn' for API key exposure, client-side usage, query param auth"
  - "Cross-linking: link to specific API reference pages like /docs/api-reference/meetings/get_ListMeetings"

requirements-completed: [GUID-01, GUID-02]

# Metrics
duration: 2min
completed: 2026-02-23
---

# Phase 21 Plan 01: Developer Guides Summary

**Getting Started and Authentication guides with multi-language code examples, rate limit documentation, and cross-links to API reference pages**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-24T01:01:28Z
- **Completed:** 2026-02-24T01:03:47Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created guides navigation structure with sidebar ordering for all 4 planned guides
- Built Getting Started guide walking developers from health check to first authenticated API call
- Built Authentication guide documenting X-API-Key header, query param fallback, rate limits (100/60s), all auth error codes, CORS config, and security best practices
- Updated docs index page with links to all guide and API reference sections
- Both guides include curl, JavaScript, and Python code examples using fumadocs Tabs

## Task Commits

Each task was committed atomically:

1. **Task 1: Create guides navigation structure and Getting Started guide** - `ea21e5a1` (feat)
2. **Task 2: Create Authentication guide** - `60883c60` (feat)

## Files Created/Modified
- `apps/docs/content/docs/guides/meta.json` - Sidebar ordering for all 4 guides (including placeholders for pagination and error-handling)
- `apps/docs/content/docs/guides/getting-started.mdx` - Step-by-step first API call walkthrough (146 lines)
- `apps/docs/content/docs/guides/authentication.mdx` - API key usage, rate limits, error codes, CORS, best practices (206 lines)
- `apps/docs/content/docs/meta.json` - Added Guides section between Getting Started and API Reference
- `apps/docs/content/docs/index.mdx` - Replaced placeholder content with links to all docs sections

## Decisions Made
- Used `groupId="language"` on all Tabs components for synchronized language selection across guides
- Started Getting Started guide with unauthenticated health check (Step 0) before requiring signup -- gives developers instant gratification
- Included realistic but clearly example response bodies in Getting Started guide to show the data/pagination/meta envelope shape

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Guides section navigation is fully wired with placeholders for pagination and error-handling guides
- Plan 21-02 can create `guides/pagination.mdx` and `guides/error-handling.mdx` which will immediately appear in the sidebar
- All cross-links between guides already reference the correct paths

## Self-Check: PASSED

- All 5 files verified present on disk
- Both task commits (ea21e5a1, 60883c60) verified in git history
- `pnpm --filter docs build` completes with zero errors
- Build output contains HTML for both /docs/guides/getting-started and /docs/guides/authentication
- getting-started.mdx: 146 lines (min 80)
- authentication.mdx: 206 lines (min 80)

---
*Phase: 21-developer-guides*
*Completed: 2026-02-23*
