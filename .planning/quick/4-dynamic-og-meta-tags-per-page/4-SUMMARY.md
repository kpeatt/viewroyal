---
phase: quick-4
plan: 01
subsystem: ui
tags: [og-image, meta-tags, seo, workers-og, satori, opengraph]

provides:
  - Dynamic OG meta tags on all content routes
  - /api/og-image endpoint generating branded PNG images
  - Shared ogImageUrl() and ogUrl() helpers in app/lib/og.ts
affects: [any new route needs meta export with ogImageUrl]

tech-stack:
  added: [workers-og]
  patterns: [ogImageUrl helper for consistent OG image URLs, meta export pattern with og:url + og:image:width/height]

key-files:
  created:
    - apps/web/app/routes/api.og-image.tsx
    - apps/web/app/lib/og.ts
  modified:
    - apps/web/app/root.tsx
    - apps/web/app/routes.ts
    - apps/web/app/routes/search.tsx
    - apps/web/app/routes/home.tsx
    - apps/web/app/routes/bylaws.tsx
    - apps/web/app/routes/matters.tsx
    - apps/web/app/routes/elections.tsx
    - apps/web/app/routes/about.tsx
    - apps/web/app/routes/document-viewer.tsx
    - apps/web/app/routes/meeting-documents.tsx
    - apps/web/app/routes/compare.tsx
    - apps/web/app/routes/meeting-detail.tsx
    - apps/web/app/routes/person-profile.tsx
    - apps/web/app/routes/meetings.tsx
    - apps/web/app/routes/people.tsx
    - apps/web/app/routes/bylaw-detail.tsx
    - apps/web/app/routes/matter-detail.tsx
    - apps/web/app/routes/election-detail.tsx
    - apps/web/app/routes/meeting-explorer.tsx
    - apps/web/app/routes/person-votes.tsx
    - apps/web/app/routes/person-proposals.tsx
    - apps/web/app/routes/alignment.tsx

key-decisions:
  - "workers-og chosen for Cloudflare Workers-compatible OG image generation (satori + resvg-wasm)"
  - "Person profile uses actual photo for og:image when available, falls back to generated branded image"
  - "OG images cached 7 days at CDN level (s-maxage=604800) to avoid regeneration on crawler requests"
  - "alignment.tsx added to plan scope as a content-facing route that was missing meta"

requirements-completed: []

duration: 8min
completed: 2026-02-19
---

# Quick Task 4: Dynamic OG Meta Tags Summary

**Dynamic OG image API via workers-og + per-route meta tags with contextual titles, descriptions, and branded images across 20+ routes**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-19T07:12:50Z
- **Completed:** 2026-02-19T07:21:06Z
- **Tasks:** 3
- **Files modified:** 24

## Accomplishments
- Every content-facing route now has a complete meta export with og:title, og:description, og:image, og:url, og:image:width/height, and twitter:card
- New /api/og-image endpoint generates 1200x630 branded PNG images with contextual title, subtitle, and type badge
- Search page shows the query in og:title when sharing cached search result URLs
- Person profile pages use actual headshot photos for og:image when available

## Task Commits

Each task was committed atomically:

1. **Task 1: Add/complete meta exports on all content routes** - `97999be4` (feat)
2. **Task 2: Create dynamic OG image API route** - `ce956854` (feat)
3. **Task 3: Wire dynamic OG images into all route meta functions** - `64256f7f` (feat)

## Files Created/Modified
- `apps/web/app/lib/og.ts` - Shared ogImageUrl() and ogUrl() helpers for consistent OG URLs
- `apps/web/app/routes/api.og-image.tsx` - Dynamic OG image generation endpoint using workers-og
- `apps/web/app/routes.ts` - Added /api/og-image route registration
- `apps/web/app/root.tsx` - Updated root meta to use dynamic OG image
- `apps/web/app/routes/search.tsx` - Dynamic meta with query in og:title for cached results
- `apps/web/app/routes/home.tsx` - Explicit meta with municipality name
- `apps/web/app/routes/bylaws.tsx` - New meta export with bylaw type badge
- `apps/web/app/routes/matters.tsx` - New meta export with matter type badge
- `apps/web/app/routes/elections.tsx` - New meta export with election type badge
- `apps/web/app/routes/about.tsx` - New meta export
- `apps/web/app/routes/meeting-explorer.tsx` - New meta using meeting title from loader
- `apps/web/app/routes/person-votes.tsx` - New meta using person name from loader
- `apps/web/app/routes/person-proposals.tsx` - New meta using person name from loader
- `apps/web/app/routes/alignment.tsx` - New meta export (added to scope)
- `apps/web/app/routes/meeting-detail.tsx` - Updated to dynamic OG image with meeting date subtitle
- `apps/web/app/routes/person-profile.tsx` - Uses photo when available, generated image as fallback
- `apps/web/app/routes/meetings.tsx` - Updated to dynamic OG image with year context
- `apps/web/app/routes/people.tsx` - Updated to dynamic OG image
- `apps/web/app/routes/bylaw-detail.tsx` - Updated with bylaw number and status in OG image
- `apps/web/app/routes/matter-detail.tsx` - Updated with matter status in OG image
- `apps/web/app/routes/election-detail.tsx` - Updated with election date in OG image
- `apps/web/app/routes/document-viewer.tsx` - Completed OG tags with dynamic image
- `apps/web/app/routes/meeting-documents.tsx` - Completed OG tags with dynamic image
- `apps/web/app/routes/compare.tsx` - Completed OG tags with "vs" comparison title

## Decisions Made
- Used workers-og (satori + resvg-wasm) for Cloudflare Workers-compatible image generation -- no Node.js APIs needed
- Person profile keeps using actual photo URL for og:image when p.image_url exists, with ogImageUrl() as fallback
- OG images use aggressive caching (1 day browser, 7 days CDN) since content rarely changes
- Added alignment.tsx to scope since it is a content-facing page that was missing meta tags
- Dark theme gradient (#18181b to #27272a) with blue accent (#2563eb) for branded look

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added meta to alignment.tsx**
- **Found during:** Task 1 (meta exports audit)
- **Issue:** alignment.tsx is a content-facing page that was not listed in the plan but had no meta export
- **Fix:** Added full meta export with og:title, og:description, og:image, og:url, twitter:card
- **Files modified:** apps/web/app/routes/alignment.tsx
- **Verification:** pnpm typecheck passes, meta export confirmed via grep
- **Committed in:** 97999be4 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Minor scope addition for completeness. No architectural changes.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Steps
- Deploy to Cloudflare Workers to enable OG image generation in production
- Verify link unfurls work correctly on iMessage, Slack, and Twitter by sharing page URLs

## Self-Check: PASSED

All created files exist. All commit hashes verified.

---
*Quick Task: 4-dynamic-og-meta-tags-per-page*
*Completed: 2026-02-19*
