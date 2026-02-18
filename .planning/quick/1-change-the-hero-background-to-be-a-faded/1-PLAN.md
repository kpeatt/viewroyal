---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/components/home/hero-section.tsx
  - apps/web/app/components/home/view-royal-map.tsx
  - apps/web/app/app.css
  - apps/web/public/view-royal-map.png
autonomous: false
requirements: [QUICK-01]

must_haves:
  truths:
    - "Hero section displays a real map image of View Royal as background"
    - "Map is faded/stylized with gradient overlays blending into the blue theme"
    - "Map has a subtle slow Ken Burns zoom/pan animation"
    - "Text content and AskQuestion remain readable and prominent over the map"
  artifacts:
    - path: "apps/web/public/view-royal-map.png"
      provides: "Static map tile image of View Royal area"
    - path: "apps/web/app/components/home/hero-section.tsx"
      provides: "Updated hero with map background image, gradient overlays, Ken Burns"
    - path: "apps/web/app/app.css"
      provides: "Ken Burns keyframe animation"
  key_links:
    - from: "apps/web/app/components/home/hero-section.tsx"
      to: "apps/web/public/view-royal-map.png"
      via: "img src or background-image reference"
      pattern: "view-royal-map\\.png"
---

<objective>
Replace the hero section's hand-drawn SVG map background with a real, stylized map image of View Royal featuring gradient overlays and a subtle Ken Burns (slow zoom/pan) animation.

Purpose: Give the hero a polished, professional look using an actual map of the town rather than a simplified SVG outline.
Output: Updated hero section with map image background, CSS gradients, and Ken Burns animation.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/app/components/home/hero-section.tsx
@apps/web/app/components/home/view-royal-map.tsx
@apps/web/app/app.css
@apps/web/app/routes/home.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Generate static map tile and add Ken Burns animation</name>
  <files>apps/web/public/view-royal-map.png, apps/web/app/app.css</files>
  <action>
1. Download a static map tile of View Royal, BC from a free tile service. Use curl to fetch from OpenStreetMap static tile API or Stadia Maps static API. Target the area around coordinates 48.45, -123.45 (View Royal center). Get a high-res image (~1200x800 or larger) so it looks good on retina screens. Apply a blue/teal color treatment if possible via query params, otherwise we will handle styling with CSS.

   Example approach using OpenStreetMap static tiles:
   ```
   curl -o apps/web/public/view-royal-map.png "https://maps.geoapify.com/v1/staticmap?style=dark-matter-dark-grey&width=1600&height=900&center=lonlat:-123.45,48.45&zoom=13&apiKey=FREE_KEY"
   ```

   If free tile APIs require keys or are unavailable, use an alternative approach:
   - Try Stamen/Stadia toner-lite or watercolor style tiles
   - Or compose a screenshot-quality map from OSM tile grid (z=13, covering View Royal bbox roughly -123.50,48.43 to -123.40,48.47)
   - As a last resort, use the geojson boundary data at `data/view_royal_boundary_land_only.geojson` and `data/vrneighbourhoods.geojson` to create a detailed SVG rendering as a fallback — convert geojson coordinates to SVG paths with proper mercator projection, style with stroke/fill for a cartographic look, and export or inline as the background.

   The final image should be saved to `apps/web/public/view-royal-map.png` (or `.svg` if using the GeoJSON approach — update references accordingly).

2. Add Ken Burns keyframe animation to `apps/web/app/app.css`. Add this after the existing keyframes:

   ```css
   @keyframes ken-burns {
     0% {
       transform: scale(1.0) translate(0, 0);
     }
     50% {
       transform: scale(1.15) translate(-2%, -1%);
     }
     100% {
       transform: scale(1.0) translate(0, 0);
     }
   }
   ```

   The animation should be slow (30-40 seconds), infinite, ease-in-out for a gentle, barely-noticeable drift.
  </action>
  <verify>
    - File exists at `apps/web/public/view-royal-map.png` (or `.svg`) and is a reasonable size (>50KB for raster, >5KB for SVG)
    - `apps/web/app/app.css` contains the `ken-burns` keyframe definition
    - `ls -la apps/web/public/view-royal-map.*` shows the file
  </verify>
  <done>Static map asset exists in public directory and Ken Burns CSS animation is defined.</done>
</task>

<task type="auto">
  <name>Task 2: Update hero-section to use map image with gradient overlay and Ken Burns</name>
  <files>apps/web/app/components/home/hero-section.tsx, apps/web/app/components/home/view-royal-map.tsx</files>
  <action>
Update `apps/web/app/components/home/hero-section.tsx` to replace the SVG map background with the new map image:

1. Remove the import of `ViewRoyalMap` from hero-section.tsx.

2. Replace the current decorative map background div:
   ```tsx
   {/* Decorative map background */}
   <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
     <ViewRoyalMap className="w-[900px] h-[700px] opacity-40" />
   </div>
   ```

   With a layered map image background:
   ```tsx
   {/* Map background with Ken Burns animation */}
   <div className="absolute inset-0 overflow-hidden pointer-events-none">
     <div
       className="absolute inset-[-10%] bg-cover bg-center"
       style={{
         backgroundImage: 'url(/view-royal-map.png)',
         animation: 'ken-burns 35s ease-in-out infinite',
       }}
     />
     {/* Gradient overlays for stylized/faded look */}
     <div className="absolute inset-0 bg-blue-700/70" />
     <div className="absolute inset-0 bg-gradient-to-b from-blue-600/80 via-blue-700/60 to-blue-800/90" />
     <div className="absolute inset-0 bg-gradient-to-r from-blue-700/40 via-transparent to-blue-700/40" />
   </div>
   ```

   Key design notes:
   - The map image div uses `inset-[-10%]` to extend beyond the container — this gives the Ken Burns animation room to pan without revealing edges.
   - First overlay (`bg-blue-700/70`): Base blue tint that colorizes the map to match the existing blue theme.
   - Second overlay (vertical gradient): Fades stronger at top and bottom to keep text areas clean.
   - Third overlay (horizontal gradient): Subtle vignette from left/right edges.
   - Adjust opacity values if the map is too visible or not visible enough. The map should be clearly recognizable as a map but not compete with the text. Target: map details visible at roughly 25-35% apparent opacity.

3. If the map asset ended up as SVG rather than PNG, adjust the backgroundImage URL accordingly (e.g., `/view-royal-map.svg`). Alternatively, if using an inline SVG approach, render it as a component within the animated div instead of using backgroundImage.

4. Keep ALL other hero content exactly as-is: the h1, subtitle paragraph, AskQuestion component, and sign-up CTA link. Only the background layer changes.

5. The `view-royal-map.tsx` file can be left in place (it is not imported anywhere else) or deleted. Prefer leaving it in case it is useful elsewhere later.
  </action>
  <verify>
    - `pnpm --filter web typecheck` passes (no TS errors from removed import)
    - `pnpm --filter web build` succeeds
    - Hero section renders with map background visible through blue gradient overlays
    - Ken Burns animation is running (inspect element shows animation property)
    - All text content remains readable
  </verify>
  <done>Hero section displays a faded, blue-tinted real map of View Royal with a smooth Ken Burns zoom/pan animation. Text and AskQuestion component remain prominent and readable.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Replaced the hero SVG map background with a real map image of View Royal, styled with blue gradient overlays and a subtle Ken Burns (slow pan/zoom) animation.</what-built>
  <how-to-verify>
    1. Run `pnpm --filter web dev` from the repo root
    2. Visit http://localhost:5173 in your browser
    3. Observe the hero section at the top of the page:
       - You should see a real map of View Royal visible through blue gradient overlays
       - The map should slowly, subtly zoom/pan (Ken Burns effect — watch for ~15 seconds to see movement)
       - The map should feel "faded" and stylized, not dominating the section
    4. Verify text readability: "What's happening in View Royal?" headline and subtitle should be clearly legible
    5. Verify the AskQuestion search box is prominent and usable
    6. Check on mobile viewport (resize browser narrow): map should still look good, no awkward cropping
  </how-to-verify>
  <resume-signal>Type "approved" if the hero looks good, or describe any adjustments needed (e.g., "map too visible", "animation too fast", "needs more blue tint").</resume-signal>
</task>

</tasks>

<verification>
- Hero section renders without errors
- Map image loads successfully (no 404 in network tab)
- Ken Burns animation is smooth and subtle (not jarring)
- Blue gradient overlays create a cohesive, stylized look
- All existing hero functionality preserved (search, CTA link)
- TypeScript compilation passes
- Build succeeds
</verification>

<success_criteria>
The hero section background is a faded, blue-tinted real map of View Royal with a gentle Ken Burns animation, replacing the previous hand-drawn SVG. All text and interactive elements remain readable and functional.
</success_criteria>

<output>
After completion, create `.planning/quick/1-change-the-hero-background-to-be-a-faded/1-SUMMARY.md`
</output>
