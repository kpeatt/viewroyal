---
phase: quick
plan: 01
subsystem: ui
tags: [svg, geojson, css-animation, ken-burns, hero-section, tailwind]

# Dependency graph
requires:
  - phase: 04-home-page-enhancements
    provides: hero section component with ViewRoyalMap SVG background
provides:
  - "Real cartographic map SVG generated from GeoJSON boundary data"
  - "Ken Burns CSS animation for hero background"
  - "Multi-layer gradient overlay system for map/theme blending"
affects: [home-page, hero-section]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GeoJSON-to-SVG conversion with Mercator projection for map assets"
    - "Ken Burns animation via CSS keyframes with overflow-hidden container"
    - "Multi-layer gradient overlays for background image blending"

key-files:
  created:
    - apps/web/public/view-royal-map.svg
  modified:
    - apps/web/app/components/home/hero-section.tsx
    - apps/web/app/app.css

key-decisions:
  - "Used GeoJSON-to-SVG approach instead of raster tile API (higher quality, no API key, vector-crisp at any size)"
  - "SVG uses transparent background with low-opacity white elements to blend naturally with any blue theme"
  - "Map kept as very subtle texture hint (opacity-40 + heavy gradient overlays) per user feedback"

patterns-established:
  - "GeoJSON data in data/ can be converted to SVG assets for the web app"

requirements-completed: [QUICK-01]

# Metrics
duration: 4min
completed: 2026-02-17
---

# Quick Task 01: Hero Map Background Summary

**Real cartographic SVG map of View Royal from GeoJSON data with Ken Burns animation and blue gradient overlays as subtle hero background texture**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T02:43:09Z
- **Completed:** 2026-02-18T02:47:33Z
- **Tasks:** 3 (2 auto + 1 checkpoint with feedback adjustment)
- **Files modified:** 3

## Accomplishments
- Generated a detailed SVG map from real GeoJSON boundary and neighbourhood data (8 zones, 1201 boundary coordinates, road network, labels)
- Added Ken Burns keyframe animation (35s ease-in-out infinite pan/zoom cycle)
- Replaced hand-drawn ViewRoyalMap SVG component with real cartographic map background
- Tuned map visibility per user feedback: subtle texture hint rather than dominant map

## Task Commits

Each task was committed atomically:

1. **Task 1: Generate static map tile and add Ken Burns animation** - `455ab095` (feat)
2. **Task 2: Update hero-section to use map image with gradient overlay and Ken Burns** - `ecb2530d` (feat)
3. **Task 3: Reduce map prominence per user feedback** - `5fe2215c` (fix)

## Files Created/Modified
- `apps/web/public/view-royal-map.svg` - Mercator-projected SVG map from GeoJSON boundary + neighbourhood data with transparent background and low-opacity elements
- `apps/web/app/components/home/hero-section.tsx` - Replaced ViewRoyalMap SVG component with map image background, Ken Burns animation, and multi-layer gradient overlays
- `apps/web/app/app.css` - Added ken-burns keyframe animation (scale 1.0 to 1.15 with translate, 35s cycle)

## Decisions Made
- Used GeoJSON-to-SVG approach instead of raster map tiles: the boundary data at `data/view_royal_boundary_land_only.geojson` and `data/vrneighbourhoods.geojson` provided much higher quality than a single 256x256 OSM tile, required no API key, and renders crisp at any resolution
- SVG uses transparent background with rgba white elements instead of opaque dark background: this allows the CSS blue gradient to show through naturally without fighting the SVG's own coloring
- Three-layer subtlety system: (1) SVG has inherently low-opacity elements, (2) map div has `opacity-40`, (3) heavy gradient overlays (90/80/95% vertical, 60% horizontal) ensure map is barely visible

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Map too visually dominant**
- **Found during:** Task 3 (checkpoint verification)
- **Issue:** User reported map was "too big" -- too prominent and visually dominant in the hero section
- **Fix:** Regenerated SVG with transparent background and very low-opacity white elements (6% fills, 12% strokes instead of opaque dark fills with bright strokes). Added `opacity-40` directly on the map div. Increased gradient overlay opacities from 70/80/60/90 to 90/80/95 vertical and 60% horizontal. Removed the solid blue overlay layer.
- **Files modified:** `apps/web/public/view-royal-map.svg`, `apps/web/app/components/home/hero-section.tsx`
- **Verification:** Build passes, dev server shows subtle map texture
- **Committed in:** `5fe2215c`

---

**Total deviations:** 1 auto-fixed (1 bug from user feedback)
**Impact on plan:** Necessary visual tuning based on live review. No scope creep.

## Issues Encountered
- OSM static tile API returned only a 256x256 tile (433 bytes) -- far too small for a hero background. Switched to GeoJSON-to-SVG approach as the plan suggested for fallback.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `view-royal-map.tsx` component left in place (unused) in case needed elsewhere
- Map SVG can be regenerated from GeoJSON data if neighbourhood boundaries change

---
*Plan: quick-01*
*Completed: 2026-02-17*
