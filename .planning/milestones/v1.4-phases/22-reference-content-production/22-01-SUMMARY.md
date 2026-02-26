---
phase: 22-reference-content-production
plan: 01
subsystem: docs
tags: [mermaid, mdx, fumadocs, ocd, data-model, sidebar]

requires:
  - phase: 21-developer-guides
    provides: Guide content pages (getting-started, authentication, pagination, error-handling)
provides:
  - Mermaid client component with dark/light theme support
  - Data Model reference page with ER diagram and civic entity descriptions
  - OCD Standard Reference page with entity mapping and decision guide
  - Sidebar configuration with all four top-level sections
affects: [22-02-reference-content-production, deployment]

tech-stack:
  added: [mermaid, next-themes]
  patterns: [client-side Mermaid rendering with useTheme, MDX component registration]

key-files:
  created:
    - apps/docs/components/mdx/mermaid.tsx
    - apps/docs/content/docs/reference/data-model.mdx
    - apps/docs/content/docs/reference/ocd-standard.mdx
    - apps/docs/content/docs/reference/meta.json
  modified:
    - apps/docs/mdx-components.tsx
    - apps/docs/content/docs/meta.json
    - apps/docs/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Single comprehensive Mermaid ER diagram with 8 entities and key columns (not relationship-only)"
  - "Civic domain language in entity descriptions with real record counts from live database"
  - "Real ViewRoyal CSD code 5917047 used in all OCD ID examples"
  - "OCD endpoints documented inline (not linked to API Reference) since they are not in OpenAPI spec"

patterns-established:
  - "Mermaid component: client-side with useTheme, clear innerHTML on re-render to avoid stale SVG caching"

requirements-completed: [REFC-01, REFC-02, FWRK-05]

duration: 3min
completed: 2026-02-24
---

# Phase 22 Plan 01: Mermaid Component, Data Model & OCD Reference Summary

**Client-side Mermaid ER diagram component with dark/light theme, Data Model page describing 8 civic entities with relationships, and OCD Standard Reference with entity mapping and real ViewRoyal OCD IDs**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-24T21:57:18Z
- **Completed:** 2026-02-24T22:00:54Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Mermaid client component with dark/light theme support, hydration-safe mounting, and stale SVG clearing
- Data Model page with comprehensive ER diagram showing Meeting, AgendaItem, Motion, Vote, Matter, Bylaw, Person, and Organization entities with civic domain descriptions
- OCD Standard Reference with v1 vs OCD comparison table, entity mapping table, OCD ID format with real ViewRoyal CSD code 5917047, inline OCD endpoint documentation, and response format examples
- Sidebar configured with all four top-level sections: Getting Started, Guides, API Reference, Reference

## Task Commits

Each task was committed atomically:

1. **Task 1: Install mermaid, create Mermaid component, and configure sidebar** - `d745a4b7` (feat)
2. **Task 2: Author Data Model and OCD Standard Reference pages** - `175fb3be` (feat)

## Files Created/Modified
- `apps/docs/components/mdx/mermaid.tsx` - Client-side Mermaid rendering component with dark/light theme
- `apps/docs/content/docs/reference/data-model.mdx` - Data Model page with ER diagram and entity descriptions
- `apps/docs/content/docs/reference/ocd-standard.mdx` - OCD Standard Reference with comparison and entity mapping tables
- `apps/docs/content/docs/reference/meta.json` - Reference section sidebar ordering
- `apps/docs/mdx-components.tsx` - Added Mermaid to MDX component registry
- `apps/docs/content/docs/meta.json` - Root sidebar with all four sections
- `apps/docs/package.json` - Added mermaid and next-themes dependencies

## Decisions Made
- Used single comprehensive ER diagram (not grouped sub-diagrams) -- all 8 entities fit well in one view
- Showed primary keys and key foreign keys in ER diagram (not just relationship lines) for developer utility
- Used real record counts from live database in entity descriptions for credibility
- Documented OCD endpoints inline rather than linking to non-existent API Reference pages (OCD uses Hono routing, not chanfana/OpenAPI)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed next-themes explicitly**
- **Found during:** Task 1 (Mermaid component creation)
- **Issue:** next-themes not available in node_modules despite being used by fumadocs-ui internally
- **Fix:** Installed next-themes as direct dependency
- **Files modified:** apps/docs/package.json, pnpm-lock.yaml
- **Verification:** Import resolves, build succeeds
- **Committed in:** d745a4b7 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for Mermaid component theme detection. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Mermaid component available for future MDX content
- Reference section established with meta.json ordering
- Ready for Plan 22-02: Changelog, Contributing, search configuration, and deployment

---
*Phase: 22-reference-content-production*
*Completed: 2026-02-24*
