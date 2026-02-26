# Phase 22: Reference Content & Production - Research

**Researched:** 2026-02-24
**Domain:** Documentation authoring, static site deployment, Orama search, Mermaid diagrams
**Confidence:** HIGH

## Summary

Phase 22 completes the developer documentation portal by authoring four reference content pages (Data Model, OCD Standard Reference, Changelog, Contribution guide), configuring Orama search for all pages, finalizing sidebar navigation, and deploying the complete site to docs.viewroyal.ai.

The existing fumadocs infrastructure (v16 + Next.js 16 static export) is fully operational with API Reference and Developer Guides already built. The search index is already being generated as a 386KB static JSON file via `staticGET` -- it just needs the client configured for `type: 'static'`. Mermaid diagram support requires installing `mermaid` + creating a client component. Deployment uses Cloudflare Workers with Static Assets (the `[assets]` directive), not Cloudflare Pages which was deprecated in April 2025.

**Primary recommendation:** Author the four MDX content pages using existing fumadocs patterns (Tabs, Callout, Mermaid), fix search client to use static mode, create a wrangler.toml with `[assets] directory = "./out"`, and deploy via `wrangler deploy` with a custom domain for `docs.viewroyal.ai`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Data Model Page**: Frame entities in civic domain context ("A Meeting represents a council session..."), not pure technical docs. Mermaid ER diagram showing entity relationships (meetings, agenda items, motions, matters, bylaws, people, organizations).
- **OCD Standard Reference**: Comparison table format for v1 vs OCD API decision guide (not flowchart or narrative). ViewRoyal-focused OCD coverage -- explain OCD concepts only as they apply to ViewRoyal's API, link to OCD spec for deeper reading. Use real ViewRoyal OCD IDs as examples (e.g., `ocd-division/country:ca/csd:5917034`). Standalone entity mapping table showing v1 entities to OCD entities.
- **Changelog**: Follow Keep a Changelog format (keepachangelog.com): Added/Changed/Deprecated/Removed/Fixed sections per version. Initial v1.0 entry at high-level summary (group by capability: meetings API, people API, search, OCD interop -- not individual endpoints). Prominent version badge at top showing current API version.
- **Deployment**: Deploy via Cloudflare (not Vercel/Netlify). Auto-deploy on push via GitHub integration. Domain docs.viewroyal.ai needs setup (DNS + custom domain configuration).
- **Sidebar Organization**: Top-level order: Getting Started -> Guides -> API Reference -> Reference. Getting Started broken out as its own top-level item. API Reference endpoints grouped by resource with collapsible groups. OCD endpoints in separate section from v1 endpoints. All sidebar sections expanded by default.
- **Search**: Orama search indexes all documentation pages.

### Claude's Discretion
- ER diagram approach: single comprehensive vs grouped sub-diagrams
- Column detail level in ER diagram (relationships only vs key columns)
- Prose depth alongside diagram (brief descriptions vs diagram-only)
- Entity mapping placement (standalone table vs inline per endpoint)
- Search result presentation (grouped by type vs flat ranked list)
- Contribution guide scope (links-only vs lightweight workflow)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REFC-01 | Data Model page with entity relationships and Mermaid ER diagram | Mermaid component setup documented; DB schema with all FK relationships extracted from live Supabase; civic entity framing per user decision |
| REFC-02 | OCD Standard Reference: entity mapping, when to use v1 vs OCD, OCD ID format | OCD router (6 entity types) + OCD ID generation (UUID v5) code reviewed; entity mapping v1->OCD fully identified |
| REFC-03 | Changelog page with initial v1.0 API entry | Keep a Changelog format spec documented; MDX authoring pattern established from existing guides |
| REFC-04 | Contribution guide: bug reports, feature requests, GitHub links | Lightweight MDX page; follows existing content patterns |
| FWRK-03 | Docs site deployed to docs.viewroyal.ai via Cloudflare | Workers Static Assets (`[assets]` directive) with custom domain; wrangler.toml configuration researched |
| FWRK-04 | Built-in Orama search indexes all documentation pages | Search index already generates (386KB static JSON); client needs `type: 'static'` in RootProvider |
| FWRK-05 | Navigation sidebar auto-generated from content directory structure | meta.json files control ordering; `defaultOpen` property controls expansion; sidebar pattern established in existing content |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fumadocs-core | ^16.6.5 | Documentation framework headless layer | Already in project; handles search, source, MDX |
| fumadocs-ui | ^16.6.5 | Documentation UI components (DocsLayout, SearchDialog) | Already in project; provides sidebar, search dialog |
| fumadocs-mdx | ^14.2.8 | MDX compilation for fumadocs | Already in project |
| fumadocs-openapi | ^10.3.9 | OpenAPI-to-MDX generation | Already in project |
| next | ^16.0.0 | React framework with static export | Already in project |

### New Dependencies
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| mermaid | ^11.x | Client-side Mermaid diagram rendering | Required for REFC-01 ER diagram |
| next-themes | (check if installed) | Theme management for mermaid light/dark | Required by Mermaid component for theme detection |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side Mermaid | Pre-rendered SVG at build time | Simpler but loses dark mode support; client-side is fumadocs standard |
| Cloudflare Pages | Workers Static Assets | Pages deprecated April 2025; Workers is the recommended path |

**Installation:**
```bash
cd apps/docs && pnpm add mermaid
```
Note: `next-themes` may already be included via fumadocs-ui. Verify before installing.

## Architecture Patterns

### Content Directory Structure (Target)
```
content/docs/
├── index.mdx                          # Landing page (exists)
├── meta.json                          # Root sidebar config (update)
├── guides/                            # Developer guides (exists)
│   ├── meta.json
│   ├── getting-started.mdx
│   ├── authentication.mdx
│   ├── pagination.mdx
│   └── error-handling.mdx
├── api-reference/                     # Auto-generated (exists)
│   ├── meta.json                      # Update: add OCD section
│   ├── system/
│   ├── meetings/
│   ├── people/
│   ├── matters/
│   ├── motions/
│   ├── bylaws/
│   ├── search/
│   └── ocd/                           # NEW: OCD endpoints (if in spec)
├── reference/                         # NEW: Reference content
│   ├── meta.json
│   ├── data-model.mdx
│   ├── ocd-standard.mdx
│   ├── changelog.mdx
│   └── contributing.mdx
```

### Pattern 1: Sidebar Configuration via meta.json
**What:** Fumadocs auto-generates sidebar from file structure, with `meta.json` controlling order and grouping.
**When to use:** Every directory needs a meta.json to control page ordering.

Root `content/docs/meta.json` (target):
```json
{
  "root": true,
  "pages": [
    "---Getting Started---",
    "guides/getting-started",
    "---Guides---",
    "guides/authentication",
    "guides/pagination",
    "guides/error-handling",
    "---API Reference---",
    "api-reference",
    "---Reference---",
    "reference"
  ]
}
```

The `---Title---` syntax creates separator headings in the sidebar. Alternatively, the existing approach of folder grouping with meta.json per folder works. The user wants "Getting Started" broken out as its own top-level item with maximum visibility, then Guides, API Reference, and Reference as groups.

**Key detail:** `defaultOpen` property in meta.json defaults to `true`, meaning sidebar sections are expanded by default -- matching the user's requirement.

### Pattern 2: Mermaid Component for ER Diagrams
**What:** Client-side Mermaid rendering with dark/light theme support.
**When to use:** REFC-01 Data Model page.

Component (`components/mdx/mermaid.tsx`):
```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import mermaid from 'mermaid';

export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || !ref.current) return;
    mermaid.initialize({
      startOnLoad: false,
      theme: resolvedTheme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
    });
    mermaid.run({ nodes: [ref.current] });
  }, [mounted, resolvedTheme, chart]);

  if (!mounted) return null;
  return <div ref={ref} className="mermaid">{chart}</div>;
}
```

Register in `mdx-components.tsx`:
```tsx
import { Mermaid } from '@/components/mdx/mermaid';
// ... add Mermaid to the components object
```

### Pattern 3: Static Search Configuration
**What:** Configure search client for static export mode.
**When to use:** Required for FWRK-04.

The search route (`app/api/search/route.ts`) already uses `staticGET` which generates the JSON index at build time. The missing piece is telling the client to use static mode:

```tsx
// app/layout.tsx
<RootProvider search={{ options: { type: 'static' } }}>
  {children}
</RootProvider>
```

This tells the search dialog to download and use the pre-built index instead of making fetch requests to the API route.

### Pattern 4: Workers Static Assets Deployment
**What:** Deploy the static Next.js export to Cloudflare Workers using the `[assets]` directive.
**When to use:** FWRK-03 deployment.

`apps/docs/wrangler.toml`:
```toml
name = "viewroyal-docs"
compatibility_date = "2026-02-24"

[assets]
directory = "./out"
not_found_handling = "404-page"
```

Key points:
- No `main` entry point needed -- purely static, no Worker script
- `directory = "./out"` points to Next.js static export output
- `not_found_handling = "404-page"` serves the nearest 404.html for missing routes
- Custom domain configured via `routes` or Cloudflare dashboard

Custom domain in wrangler.toml:
```toml
[[routes]]
pattern = "docs.viewroyal.ai/*"
custom_domain = true
```

Or preferably configure via Cloudflare dashboard (Settings > Domains & Routes > Custom Domain) since DNS must be managed by Cloudflare.

### Anti-Patterns to Avoid
- **Using Cloudflare Pages:** Deprecated since April 2025. Use Workers Static Assets instead.
- **Server-side search route in static export:** The default Orama search uses fetch to the API route. In static export, must use `type: 'static'` to download pre-built index.
- **Hardcoding sidebar order in layout code:** Let meta.json files drive sidebar structure. Changes to content should not require code changes.
- **Including OCD endpoints mixed with v1 in same resource groups:** User explicitly wants separate sections.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Search indexing | Custom search implementation | Orama via fumadocs `staticGET` | Already generates 386KB index; just configure client |
| Sidebar generation | Manual sidebar config in layout | meta.json files per directory | fumadocs auto-generates from file structure |
| Mermaid rendering | Build-time SVG generation | Client-side `mermaid` package | Supports dark/light themes, simpler setup |
| Deploy pipeline | Custom GitHub Actions workflow | Cloudflare Workers Builds | Auto-deploys on push with GitHub integration |
| Custom domain SSL | Manual certificate management | Cloudflare custom domains | Auto-provisions DNS + SSL certificates |

**Key insight:** The fumadocs framework handles most of the infrastructure (search, sidebar, MDX rendering). This phase is primarily content authoring with minimal code changes.

## Common Pitfalls

### Pitfall 1: Search Not Working in Static Export
**What goes wrong:** Search dialog opens but returns no results or errors.
**Why it happens:** Default search client uses `type: 'fetch'` which tries to hit the API route at runtime. In static export, there is no server -- the route is pre-rendered as a static JSON file.
**How to avoid:** Set `search={{ options: { type: 'static' } }}` on `RootProvider`.
**Warning signs:** Search dialog shows loading spinner indefinitely or returns empty results.

### Pitfall 2: Mermaid Hydration Mismatch
**What goes wrong:** React hydration error when rendering Mermaid diagrams.
**Why it happens:** Mermaid runs client-side but SSR tries to render the chart content as text.
**How to avoid:** Guard with `mounted` state check; return `null` during SSR. Use `'use client'` directive on the Mermaid component.
**Warning signs:** Console hydration warnings, diagram renders then disappears.

### Pitfall 3: Sidebar Ordering Ignored
**What goes wrong:** Pages appear in wrong order or new reference pages don't show in sidebar.
**Why it happens:** Missing or incorrectly structured meta.json in the new `reference/` directory, or the root meta.json not updated to include the reference folder.
**How to avoid:** Add meta.json to every content directory; update root meta.json to include all sections in desired order.
**Warning signs:** Pages appear alphabetically rather than in specified order.

### Pitfall 4: Cloudflare Pages vs Workers Confusion
**What goes wrong:** Deploy fails or uses wrong platform.
**Why it happens:** CONTEXT.md says "Cloudflare Pages" but Pages was deprecated April 2025. STATE.md correctly says "Workers static assets via `[assets]` directive."
**How to avoid:** Use Workers Static Assets with `[assets]` directive in wrangler.toml. The build output (`./out`) is the same -- only the deploy mechanism changes.
**Warning signs:** Cloudflare dashboard shows project under "Pages" instead of "Workers & Pages."

### Pitfall 5: OCD Endpoints Not in OpenAPI Spec
**What goes wrong:** OCD reference page links to API Reference pages that don't exist.
**Why it happens:** The OCD endpoints use Hono routing (not chanfana) and are NOT included in the OpenAPI spec. The current spec only has 14 v1 endpoints.
**How to avoid:** The OCD Standard Reference page should document OCD endpoints manually (not auto-generated from spec). Link to the base URL pattern, not to auto-generated API Reference pages.
**Warning signs:** Broken links to non-existent OCD API reference pages.

### Pitfall 6: Monorepo Root Directory for Workers Builds
**What goes wrong:** Build command runs in repository root instead of `apps/docs/`.
**Why it happens:** Workers Builds defaults to repository root. Monorepo requires setting root directory to `apps/docs`.
**How to avoid:** Configure "Root directory" in Workers Builds settings to `apps/docs`.
**Warning signs:** Build fails with "next not found" or "package.json not found."

## Code Examples

### Entity Relationship Mapping (for Data Model page)

Based on live database schema inspection, the core API entities and relationships:

```
Meeting (738 rows) → belongs to Organization, chaired by Person
  ├── AgendaItem (12,194) → belongs to Meeting, links to Matter
  │     ├── Motion (10,536) → moved/seconded by Person
  │     │     └── Vote (44,919) → cast by Person
  │     └── TranscriptSegment (228,241) → attributed to Person
  ├── Attendance → Person attended Meeting
  └── Document (726) → attached to Meeting
        └── DocumentSection (65,802) → text chunks

Matter (1,727) → tracked across meetings, links to Bylaw
Bylaw (43) → municipal legislation
Person (837) → council members, staff
  └── Membership (80) → Person belongs to Organization
Organization (10) → Council, Committees, Boards
```

### v1 to OCD Entity Mapping (for OCD Reference page)

| v1 Entity | v1 Endpoint | OCD Entity | OCD Endpoint | Notes |
|-----------|-------------|------------|-------------|-------|
| Municipality | (implicit) | Jurisdiction | `/api/ocd/{muni}/jurisdictions` | Governing body |
| Organization | (via meetings) | Organization | `/api/ocd/{muni}/organizations` | Council, committees |
| Person | `/api/v1/{muni}/people` | Person | `/api/ocd/{muni}/people` | Council members, staff |
| Meeting | `/api/v1/{muni}/meetings` | Event | `/api/ocd/{muni}/events` | Council sessions |
| Matter | `/api/v1/{muni}/matters` | Bill | `/api/ocd/{muni}/bills` | Legislative items |
| Motion | `/api/v1/{muni}/motions` | Vote | `/api/ocd/{muni}/votes` | Formal decisions |
| Bylaw | `/api/v1/{muni}/bylaws` | (no equivalent) | -- | ViewRoyal-specific |
| Search | `/api/v1/{muni}/search` | (no equivalent) | -- | ViewRoyal-specific |

### OCD ID Format Examples (real ViewRoyal IDs)

```
Division:     ocd-division/country:ca/csd:5917034
Jurisdiction: ocd-jurisdiction/country:ca/csd:5917034/government
Person:       ocd-person/{uuid-v5}     (deterministic from PK)
Organization: ocd-organization/{uuid-v5}
Event:        ocd-event/{uuid-v5}
Bill:         ocd-bill/{uuid-v5}
Vote:         ocd-vote/{uuid-v5}
```

### Keep a Changelog Format (for Changelog page)

```markdown
---
title: Changelog
description: Notable changes to the ViewRoyal.ai API
---

import { Callout } from 'fumadocs-ui/components/callout';

<Callout type="info">
  **Current Version: v1.0**
</Callout>

## [1.0.0] - 2026-02-24

### Added
- **Meetings API**: List and retrieve council meetings with agenda items, motions, and attendance
- **People API**: Council members and staff with voting records and membership history
- **Matters API**: Legislative matters tracked across meetings with lifecycle status
- **Motions API**: Formal decisions with mover/seconder, vote tallies, and individual votes
- **Bylaws API**: Municipal legislation with full text and AI summaries
- **Search API**: Cross-content keyword search across motions, matters, and documents
- **OCD Interoperability**: Open Civic Data endpoints for civic tech integration
- **Authentication**: API key management via X-API-Key header
- **Pagination**: Cursor-based (v1) and page-based (OCD) pagination
```

### Wrangler.toml for Docs Deployment

```toml
name = "viewroyal-docs"
compatibility_date = "2026-02-24"

[assets]
directory = "./out"
not_found_handling = "404-page"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cloudflare Pages | Workers Static Assets | April 2025 | Pages deprecated; use `[assets]` directive |
| Workers Sites (`site.bucket`) | Workers Static Assets | Wrangler v4 | `site` config deprecated in favor of `[assets]` |
| `createFromSource` with fetch | `staticGET` + `type: 'static'` client | fumadocs v14+ | Required for static export |
| fumadocs `flexsearch` | fumadocs Orama | fumadocs v14 | Orama replaced FlexSearch as default |

**Deprecated/outdated:**
- Cloudflare Pages: Deprecated April 2025, auto-migration planned but not yet active. Use Workers Static Assets.
- Workers Sites: Deprecated in Wrangler v4. Use `[assets]` directive instead.

## Open Questions

1. **DNS for docs.viewroyal.ai**
   - What we know: Cloudflare manages DNS for viewroyal.ai. Custom domains auto-provision DNS + SSL.
   - What's unclear: Whether the subdomain `docs.` already has any DNS records that would conflict.
   - Recommendation: Check in Cloudflare dashboard before deploying. Custom Domains will auto-create the DNS record. Can also be set via wrangler.toml route or dashboard.

2. **OCD endpoints missing from OpenAPI spec**
   - What we know: The 14 v1 endpoints are in the spec (via chanfana). The 13 OCD endpoints use Hono routing and are NOT in the spec.
   - What's unclear: Whether OCD endpoints should be added to the API Reference auto-generation.
   - Recommendation: For Phase 22, document OCD endpoints manually in the OCD Standard Reference page. Adding OCD to the OpenAPI spec would be a separate task.

3. **Workers Builds monorepo support**
   - What we know: Workers Builds supports "Root directory" setting for monorepos. Build command runs in specified directory.
   - What's unclear: Exact configuration for the pnpm workspace setup (whether pnpm install at root is needed before building in apps/docs).
   - Recommendation: Set root directory to `apps/docs`. Build command: `pnpm install && pnpm build`. Deploy command: `npx wrangler deploy`.

4. **next-themes dependency for Mermaid**
   - What we know: Mermaid component needs `useTheme` for dark/light mode. fumadocs-ui uses `next-themes` internally.
   - What's unclear: Whether `next-themes` is exposed as a peer dependency or re-exported.
   - Recommendation: Check if `next-themes` is importable from the installed fumadocs-ui dependencies before adding it explicitly.

## Discretion Recommendations

Based on research, here are recommendations for areas marked as Claude's Discretion:

1. **ER diagram approach:** Use a single comprehensive diagram with grouped sub-sections. Mermaid `erDiagram` supports this well. Show the 7-8 core API entities (Meeting, AgendaItem, Motion, Vote, Matter, Bylaw, Person, Organization) in one diagram with relationship lines. Omit internal entities (transcript_segments, documents, voice_fingerprints) that are not API-facing.

2. **Column detail level:** Show only primary keys and key relationship columns (foreign keys). Full column lists belong in the API Reference pages. The ER diagram is for understanding relationships, not schema documentation.

3. **Prose depth:** Brief 2-3 sentence descriptions per entity explaining what it represents in civic context (e.g., "A Matter represents an ongoing issue or topic that may span multiple meetings..."). The diagram carries the relationship story; prose provides domain context.

4. **Entity mapping placement:** Standalone table as decided by user, placed prominently in the OCD Standard Reference page. Reference it from the v1 vs OCD comparison table.

5. **Search result presentation:** Use fumadocs default (flat ranked list). The docs site is small enough (~25 pages) that grouping by type adds complexity without clear benefit.

6. **Contribution guide scope:** Lightweight workflow -- a single page with: project GitHub repo link, how to report bugs (Issues template), how to request features, API feedback channels, and a note about the API being read-only (no write contributions). Keep it under 100 lines of MDX.

## Sources

### Primary (HIGH confidence)
- Live Supabase database schema inspection via `list_tables` -- all entity relationships, foreign keys, row counts
- Codebase inspection: `apps/docs/` -- all existing files, configurations, build output
- `apps/web/app/api/ocd/` -- OCD router, entity types, ID generation
- `apps/web/app/lib/types.ts` -- TypeScript entity interfaces
- Cloudflare Workers docs via MCP search -- Workers Static Assets configuration, custom domains, Workers Builds

### Secondary (MEDIUM confidence)
- [fumadocs.dev/docs/headless/search/orama](https://fumadocs.dev/docs/headless/search/orama) -- Orama static search configuration
- [fumadocs.dev/docs/markdown/mermaid](https://fumadocs.dev/docs/markdown/mermaid) -- Mermaid component setup
- [fumadocs.dev/docs/ui/search](https://fumadocs.dev/docs/ui/search) -- Search UI / RootProvider configuration
- [developers.cloudflare.com/workers/static-assets/](https://developers.cloudflare.com/workers/static-assets/) -- Workers Static Assets docs
- [developers.cloudflare.com/workers/ci-cd/builds/](https://developers.cloudflare.com/workers/ci-cd/builds/) -- Workers Builds auto-deploy
- [keepachangelog.com](https://keepachangelog.com) -- Changelog format specification

### Tertiary (LOW confidence)
- Cloudflare Pages deprecation timeline -- multiple community/blog sources confirm April 2025, but exact deprecation details may evolve

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed; only mermaid is new
- Architecture: HIGH - patterns directly observed in existing codebase; fumadocs conventions verified
- Pitfalls: HIGH - identified from direct code inspection and official documentation
- Deployment: MEDIUM - Workers Static Assets is well-documented but deploy configuration for this specific monorepo untested

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (30 days -- stable technologies, no fast-moving dependencies)
