---
phase: 4-dynamic-og-meta-tags-per-page
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
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
  - apps/web/app/routes/meeting-explorer.tsx
  - apps/web/app/routes/person-votes.tsx
  - apps/web/app/routes/person-proposals.tsx
  - apps/web/app/routes/api.og-image.tsx
  - apps/web/app/routes.ts
  - apps/web/package.json
autonomous: true
requirements: []

must_haves:
  truths:
    - "Sharing a meeting detail link on iMessage/Slack/Twitter shows the meeting title and date, not generic site title"
    - "Sharing a cached search result link shows the search query in the unfurl preview"
    - "Sharing a person profile link shows the person's name and role"
    - "Each shareable page has a unique OG image containing the page title"
    - "Pages without meta functions no longer fall through to the generic root meta"
  artifacts:
    - path: "apps/web/app/routes/api.og-image.tsx"
      provides: "Dynamic OG image generation endpoint"
      exports: ["loader"]
    - path: "apps/web/app/routes/search.tsx"
      provides: "Search page meta tags"
      contains: "export const meta"
  key_links:
    - from: "apps/web/app/routes/meeting-detail.tsx"
      to: "/api/og-image"
      via: "og:image meta tag URL"
      pattern: "og:image.*api/og-image"
    - from: "apps/web/app/routes/search.tsx"
      to: "/api/og-image"
      via: "og:image meta tag URL"
      pattern: "og:image.*api/og-image"
---

<objective>
Add dynamic, per-route OG meta tags and a dynamic OG image API so that every shareable page on ViewRoyal.ai produces rich link unfurls on iMessage, Slack, Twitter, and other platforms.

Purpose: Currently all pages share the same generic OG image and many routes lack meta functions entirely, so link previews are generic and unhelpful. The user specifically wants cached search results and meeting pages to show contextual details when shared.

Output: Every content route has a `meta` export with dynamic og:title, og:description, og:image, og:url. A new API route generates SVG-based OG images with the page title rendered on a branded template.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/app/root.tsx
@apps/web/app/routes.ts
@apps/web/app/routes/meeting-detail.tsx (existing meta pattern to follow)
@apps/web/app/routes/person-profile.tsx (existing meta pattern to follow)
@apps/web/app/routes/search.tsx (needs meta added)
@apps/web/package.json
@apps/web/wrangler.toml
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add/complete meta exports on all content routes</name>
  <files>
    apps/web/app/routes/search.tsx
    apps/web/app/routes/home.tsx
    apps/web/app/routes/bylaws.tsx
    apps/web/app/routes/matters.tsx
    apps/web/app/routes/elections.tsx
    apps/web/app/routes/about.tsx
    apps/web/app/routes/document-viewer.tsx
    apps/web/app/routes/meeting-documents.tsx
    apps/web/app/routes/compare.tsx
    apps/web/app/routes/meeting-explorer.tsx
    apps/web/app/routes/person-votes.tsx
    apps/web/app/routes/person-proposals.tsx
  </files>
  <action>
Add or complete `export const meta: Route.MetaFunction` on every content route that is missing one or has incomplete OG tags.

**Routes needing NEW meta functions:**

1. `search.tsx` — PRIORITY. For cached search results (URL has `?id=xxx&q=...`), the meta should show:
   - title: `"{query}" — Search | ViewRoyal.ai`
   - og:title: `"{query}" — View Royal Council Search`
   - og:description: "AI-powered search result from View Royal council records"
   - When no query: title "Search | ViewRoyal.ai", description "Search View Royal council meetings..."
   - Note: The loader already returns `query` and `cachedId` — use those.

2. `home.tsx` — Uses root meta by default which is fine, but add explicit meta for clarity:
   - title: "ViewRoyal.ai | Council Meeting Intelligence"
   - og:description with municipality name from matches

3. `bylaws.tsx` — Add meta:
   - title: "Bylaws | ViewRoyal.ai"
   - og:description: "Browse View Royal municipal bylaws"

4. `matters.tsx` — Add meta:
   - title: "Council Matters | ViewRoyal.ai"
   - og:description: "Active and historical council matters for View Royal"

5. `elections.tsx` — Check if it has meta, add if missing:
   - title: "Elections | ViewRoyal.ai"

6. `about.tsx` — Add meta if missing:
   - title: "About | ViewRoyal.ai"

7. `meeting-explorer.tsx` — Add meta using meeting data from loader
8. `person-votes.tsx` — Add meta using person name from loader
9. `person-proposals.tsx` — Add meta using person name from loader

**Routes needing COMPLETED meta (have title but missing OG tags):**

10. `document-viewer.tsx` — Has title/description but missing og:title, og:description, og:image, og:type, twitter:card. Add them following the pattern from meeting-detail.tsx.

11. `meeting-documents.tsx` — Has title/description but missing og:title, og:description, og:image, twitter:card. Add them.

12. `compare.tsx` — Has title/description but missing og:image, twitter:card. Add them.

**Pattern to follow** (from meeting-detail.tsx and person-profile.tsx):
```typescript
export const meta: Route.MetaFunction = ({ data }) => {
  // Fallback for missing data
  if (!data?.thing) return [{ title: "Fallback | ViewRoyal.ai" }];
  const title = `${data.thing.name} | ViewRoyal.ai`;
  const description = data.thing.summary || "Fallback description";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: data.thing.name },
    { property: "og:description", content: description },
    { property: "og:type", content: "article" },  // or "website" for list pages
    { property: "og:image", content: "https://viewroyal.ai/og-image.png" },
    { name: "twitter:card", content: "summary_large_image" },
  ];
};
```

For this task, use the static og-image.png for og:image. Task 3 will swap to dynamic.

Do NOT modify routes that already have complete meta (meeting-detail, person-profile, meetings, people, bylaw-detail, matter-detail, election-detail). Those will be updated in Task 3.
  </action>
  <verify>
Run `pnpm typecheck` from apps/web/ to verify no type errors. Grep all route files for "export const meta" to confirm coverage: every .tsx file in routes/ that is NOT an api.* route and NOT ask.tsx (redirect), login.tsx, signup.tsx, logout.tsx, onboarding.tsx, settings.tsx, speaker-alias.tsx, admin-people.tsx, privacy.tsx, or terms.tsx should have a meta export.
  </verify>
  <done>
Every content-facing route has a complete meta export with title, description, og:title, og:description, og:type, og:image, and twitter:card. search.tsx specifically uses the query parameter for dynamic title/description. `pnpm typecheck` passes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create dynamic OG image API route</name>
  <files>
    apps/web/app/routes/api.og-image.tsx
    apps/web/app/routes.ts
    apps/web/package.json
  </files>
  <action>
Install `workers-og` (Cloudflare Workers-compatible OG image generation using satori + resvg-wasm):
```bash
cd apps/web && pnpm add workers-og
```

Create `apps/web/app/routes/api.og-image.tsx` as a new API route. Add to routes.ts:
```typescript
route("api/og-image", "routes/api.og-image.tsx"),
```

The loader accepts query parameters to customize the image:
- `title` (required) — main heading text
- `subtitle` (optional) — secondary line (e.g. date, role, type)
- `type` (optional) — page type for visual theming: "meeting", "person", "search", "bylaw", "matter", "election", "default"

Implementation:
```typescript
import { ImageResponse } from "workers-og";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const title = url.searchParams.get("title") || "ViewRoyal.ai";
  const subtitle = url.searchParams.get("subtitle") || "";
  const type = url.searchParams.get("type") || "default";

  // Use Inter font from Google Fonts (already loaded by the app)
  const html = `
    <div style="display: flex; flex-direction: column; width: 1200px; height: 630px; background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 60px; justify-content: space-between; font-family: Inter, sans-serif;">
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="background: #2563eb; color: white; font-size: 14px; font-weight: 800; padding: 6px 16px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.1em;">
            ${escapeHtml(typeLabel(type))}
          </div>
        </div>
        <div style="color: white; font-size: ${title.length > 60 ? 42 : 56}px; font-weight: 900; line-height: 1.1; max-width: 1000px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">
          ${escapeHtml(title)}
        </div>
        ${subtitle ? `<div style="color: #a1a1aa; font-size: 24px; font-weight: 600;">${escapeHtml(subtitle)}</div>` : ""}
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="color: #3b82f6; font-size: 28px; font-weight: 900;">ViewRoyal.ai</div>
          <div style="color: #52525b; font-size: 18px; font-weight: 500;">Council Meeting Intelligence</div>
        </div>
      </div>
    </div>
  `;

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
}
```

Helper functions in the same file:
- `escapeHtml(str)` — escape `<>&"'` for safe HTML embedding
- `typeLabel(type)` — maps type param to display label: "meeting" -> "Council Meeting", "person" -> "Council Member", "search" -> "Search Result", "bylaw" -> "Bylaw", "matter" -> "Council Matter", "election" -> "Election", "default" -> "ViewRoyal.ai"

Set cache headers: `Cache-Control: public, max-age=86400, s-maxage=604800` (1 day browser, 7 days CDN). This is critical for performance — OG image crawlers hit these URLs and we don't want to regenerate every time.

NOTE: `workers-og` uses HTML strings (not JSX/React elements) for its `ImageResponse`. Check the workers-og README to confirm the exact API. If `ImageResponse` takes HTML string, use the approach above. If it requires a different format, adapt accordingly. The key is: it must work on Cloudflare Workers without Node.js APIs.
  </action>
  <verify>
Run `pnpm build` from apps/web/ to verify the API route compiles for Cloudflare Workers. Then start dev server (`pnpm dev`) and test:
- `curl -s -o /dev/null -w "%{http_code}" "http://localhost:5173/api/og-image?title=Test+Meeting&type=meeting"` returns 200
- `curl -s -D - "http://localhost:5173/api/og-image?title=Test" | head -20` shows Content-Type: image/png and Cache-Control header
  </verify>
  <done>
API route at /api/og-image accepts title, subtitle, type params and returns a 1200x630 PNG image with branded layout. Compiles for Cloudflare Workers. Responses are cached for 7 days at CDN level.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire dynamic OG images into all route meta functions</name>
  <files>
    apps/web/app/routes/meeting-detail.tsx
    apps/web/app/routes/person-profile.tsx
    apps/web/app/routes/search.tsx
    apps/web/app/routes/meetings.tsx
    apps/web/app/routes/people.tsx
    apps/web/app/routes/bylaws.tsx
    apps/web/app/routes/bylaw-detail.tsx
    apps/web/app/routes/matters.tsx
    apps/web/app/routes/matter-detail.tsx
    apps/web/app/routes/elections.tsx
    apps/web/app/routes/election-detail.tsx
    apps/web/app/routes/document-viewer.tsx
    apps/web/app/routes/meeting-documents.tsx
    apps/web/app/routes/compare.tsx
    apps/web/app/routes/home.tsx
    apps/web/app/routes/meeting-explorer.tsx
    apps/web/app/routes/person-votes.tsx
    apps/web/app/routes/person-proposals.tsx
  </files>
  <action>
Create a shared helper function in `apps/web/app/lib/og.ts`:
```typescript
const BASE = "https://viewroyal.ai";

export function ogImageUrl(title: string, opts?: { subtitle?: string; type?: string }): string {
  const params = new URLSearchParams({ title });
  if (opts?.subtitle) params.set("subtitle", opts.subtitle);
  if (opts?.type) params.set("type", opts.type);
  return `${BASE}/api/og-image?${params.toString()}`;
}

export function ogUrl(path: string): string {
  return `${BASE}${path}`;
}
```

Then update EVERY route's meta function to replace the static `"https://viewroyal.ai/og-image.png"` with a call to `ogImageUrl()`, and add `og:url` where missing.

Specific mappings:

- **meeting-detail.tsx**: `ogImageUrl(m.title, { subtitle: m.meeting_date, type: "meeting" })`
- **person-profile.tsx**: Keep using `p.image_url` when available (person photo is better than generated), fall back to `ogImageUrl(p.name, { subtitle: role, type: "person" })`
- **search.tsx**: `ogImageUrl(query || "Search", { subtitle: "AI-powered council search", type: "search" })`
- **meetings.tsx**: `ogImageUrl(year ? \`${year} Council Meetings\` : "Council Meetings", { type: "meeting" })`
- **people.tsx**: `ogImageUrl("Council Members", { type: "person" })`
- **bylaw-detail.tsx**: `ogImageUrl(label, { subtitle: b.status, type: "bylaw" })`
- **matter-detail.tsx**: `ogImageUrl(m.title, { subtitle: m.status, type: "matter" })`
- **election-detail.tsx**: `ogImageUrl(e.name, { subtitle: e.election_date, type: "election" })`
- **document-viewer.tsx**: `ogImageUrl(ed.title, { type: "default" })`
- **meeting-documents.tsx**: `ogImageUrl(\`Documents — ${m.title}\`, { type: "meeting" })`
- **compare.tsx**: `ogImageUrl(\`${a.name} vs ${b.name}\`, { subtitle: "Voting Comparison", type: "person" })`
- **home.tsx**: `ogImageUrl("Council Meeting Intelligence")`
- **bylaws.tsx**, **matters.tsx**, **elections.tsx**: `ogImageUrl("Page Title", { type: "..." })`
- **meeting-explorer.tsx**, **person-votes.tsx**, **person-proposals.tsx**: Use entity name from loader data

Also add `og:url` to every meta function using `ogUrl()`. For routes with params, construct from the data: e.g., `ogUrl(\`/meetings/${m.id}\`)`.

Also add `og:image:width` (1200) and `og:image:height` (630) to all meta functions — these help platforms render the preview faster without fetching the image first.

Update root.tsx og:image to also use the dynamic URL: `ogImageUrl("Council Meeting Intelligence")`.
  </action>
  <verify>
Run `pnpm typecheck` from apps/web/ — no errors. Verify with grep that no route still references the static og-image.png in its meta function (the file stays in public/ as a fallback, but meta tags should not reference it). Specifically:
```bash
grep -r "og-image.png" apps/web/app/routes/ apps/web/app/root.tsx
```
Should return zero results.
  </verify>
  <done>
All route meta functions use dynamic OG image URLs via ogImageUrl(). Each page generates a unique, branded OG image with contextual title and type badge. og:url is set on every route. og:image:width/height are present for fast preview rendering. No route references the static og-image.png anymore. `pnpm typecheck` passes.
  </done>
</task>

</tasks>

<verification>
1. `pnpm typecheck` passes from apps/web/
2. `pnpm build` succeeds (no Cloudflare Workers compilation errors)
3. Every content route has a `meta` export with og:title, og:description, og:image, og:url, twitter:card
4. /api/og-image returns a valid PNG for various title/type combinations
5. No route references the static og-image.png in its meta function
6. Cached search result URLs (/search?id=xxx&q=...) show the query in og:title
</verification>

<success_criteria>
- Sharing any ViewRoyal.ai page link produces a rich unfurl with contextual title, description, and a unique branded OG image
- Meeting detail links show the meeting title and date in the preview
- Cached search links show the search query in the preview
- Person profile links show the person's photo (if available) or a branded image with their name
- OG images are cached at CDN level (7 day max-age) so crawlers don't cause repeated generation
- All existing functionality is preserved — no regressions in page rendering or routing
</success_criteria>

<output>
After completion, create `.planning/quick/4-dynamic-og-meta-tags-per-page/4-SUMMARY.md`
</output>
