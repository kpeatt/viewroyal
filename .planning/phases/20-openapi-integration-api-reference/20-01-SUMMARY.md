---
phase: 20-openapi-integration-api-reference
plan: 01
subsystem: api
tags: [fumadocs-openapi, openapi, shiki, mdx, prebuild]

requires:
  - phase: 19-infrastructure-scaffolding
    provides: fumadocs v16 + Next.js 16 scaffold with static export
provides:
  - Prebuild script that fetches live OpenAPI spec with committed fallback
  - Cleaned openapi.json with fixed paths, tags, servers, security
  - Generated MDX files in content/docs/api-reference/ grouped by tag
  - createOpenAPI server instance in lib/openapi.ts
affects: [20-02, api-reference, docs-build]

tech-stack:
  added: [fumadocs-openapi@10.3.9, shiki@3.22.0]
  patterns: [prebuild-script-fetch-fallback, generateFiles-per-operation-groupBy-tag]

key-files:
  created:
    - apps/docs/scripts/generate-openapi.mjs
    - apps/docs/lib/openapi.ts
    - apps/docs/openapi.json
  modified:
    - apps/docs/package.json
    - apps/docs/.gitignore

key-decisions:
  - "fumadocs-openapi v10 has built-in code generators for curl, JS, Python, Go, Java, C# -- no custom generateCodeSamples needed"
  - "Prebuild script fixes chanfana double-prefix bug (/api/v1/api/v1 -> /api/v1) and injects missing tags/servers/security"
  - "Live spec URL is /api/v1/api/v1/openapi.json due to chanfana base-path double-prefixing"

patterns-established:
  - "Prebuild fetch-with-fallback: fetch live spec, fix known issues, write fallback, generate files"

requirements-completed: [AREF-01, AREF-04]

duration: 8min
completed: 2026-02-23
---

# Plan 20-01: OpenAPI Infrastructure Summary

**Prebuild script fetches live spec, fixes chanfana quirks, generates 14 MDX files across 7 tag groups with fumadocs-openapi v10**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-23T21:35:00Z
- **Completed:** 2026-02-23T21:43:00Z
- **Tasks:** 2 (consolidated into 1 commit -- Task 2's openapi.ts was simple enough to include)
- **Files modified:** 5

## Accomplishments
- Prebuild script fetches live OpenAPI spec from viewroyal.ai with 10s timeout and committed JSON fallback
- Script fixes chanfana's double path prefix, injects missing tags/servers/security scheme
- generateFiles() produces 14 MDX files across 7 tag groups (system, meetings, people, matters, motions, bylaws, search)
- lib/openapi.ts provides createOpenAPI instance for the APIPage component

## Task Commits

1. **Task 1+2: Prebuild script, spec fallback, and openapi.ts** - `1c8e01c2` (feat)

## Files Created/Modified
- `apps/docs/scripts/generate-openapi.mjs` - Prebuild: fetch spec, fix paths/tags/servers, run generateFiles
- `apps/docs/lib/openapi.ts` - createOpenAPI server instance
- `apps/docs/openapi.json` - Committed fallback OpenAPI 3.1 spec (cleaned)
- `apps/docs/package.json` - Added prebuild script, wired into build chain
- `apps/docs/.gitignore` - Excluded generated content/docs/api-reference/

## Decisions Made
- fumadocs-openapi v10 includes built-in client-side code generators for 6 languages -- custom generateCodeSamples on createOpenAPI is unnecessary (and the option doesn't exist on createOpenAPI in v10, only on createAPIPage)
- Chanfana has a double-prefix bug where base="/api/v1" causes paths to be /api/v1/api/v1/... -- the prebuild script corrects this
- Tags are defined in the Hono app's chanfana config but not emitted into the spec by chanfana -- the prebuild script injects them based on operationId patterns

## Deviations from Plan

### Auto-fixed Issues

**1. Live spec URL discovery**
- **Found during:** Task 1 (spec fetch)
- **Issue:** The documented URL /api/v1/openapi.json returns 404. The actual URL is /api/v1/api/v1/openapi.json due to chanfana double-prefixing the base path
- **Fix:** Updated SPEC_URL in prebuild script to the actual working URL
- **Verification:** Successful fetch confirmed

**2. Tags, servers, and security schemes missing from live spec**
- **Found during:** Task 1 (spec inspection)
- **Issue:** chanfana generates an empty tags array on operations, no servers array, and no securitySchemes despite them being registered
- **Fix:** Prebuild script injects tags (based on operationId patterns), servers array, and ApiKeyAuth security scheme
- **Verification:** Cleaned openapi.json has all expected metadata

**3. Custom generateCodeSamples not needed**
- **Found during:** Task 2 (openapi.ts)
- **Issue:** Plan specified custom generateCodeSamples on createOpenAPI, but v10's createOpenAPI doesn't accept that option. It's on createAPIPage instead. Moreover, v10 ships built-in generators for curl, JS, Python, Go, Java, C#.
- **Fix:** Created minimal openapi.ts with just input config. Code samples come from built-in generators.
- **Verification:** Inspected fumadocs-openapi dist/requests/generators/ -- all 6 languages present

---

**Total deviations:** 3 auto-fixed (API discovery, spec enrichment, simplified code samples)
**Impact on plan:** All fixes necessary due to chanfana spec generation quirks and fumadocs v10 API changes. No scope creep.

## Issues Encountered
- OCD endpoints registered via `registerPath()` are not included in the chanfana-generated spec (they appear in the Hono router but not the OpenAPI output). These will need separate handling if OCD API docs are needed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Generated MDX files use `<APIPage>` component which Plan 20-02 will create and register
- openapi.json fallback is committed and ready for the build pipeline
- lib/openapi.ts is ready to be imported by the api-page.tsx component

---
*Plan: 20-01-openapi-integration-api-reference*
*Completed: 2026-02-23*
