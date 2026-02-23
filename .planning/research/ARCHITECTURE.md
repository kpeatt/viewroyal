# Architecture Patterns: v1.4 Developer Documentation Portal

**Domain:** Fumadocs.dev documentation site integration into existing monorepo
**Researched:** 2026-02-23

---

## 1. Current Architecture Summary

```
viewroyal.ai (Cloudflare Workers)
  apps/web/         React Router 7, Vite 7, Cloudflare Workers
  apps/vimeo-proxy/  Cloudflare Worker + Puppeteer
  apps/pipeline/     Python ETL (uv, local execution)
```

**Key characteristics:**
- No root-level pnpm workspace -- each app is independently managed
- `apps/web/pnpm-workspace.yaml` has `packages: ["."]` (self-contained)
- `apps/vimeo-proxy/` has its own independent `package.json`
- DNS: `viewroyal.ai/*` routed to web Worker via `wrangler.toml` routes
- OpenAPI 3.1 spec served at runtime: `https://viewroyal.ai/api/v1/openapi.json`
- Node.js v25.3.0 available (exceeds fumadocs minimum of v22)

---

## 2. Recommended Architecture

### High-Level Deployment

```
viewroyal.ai/*           --> Cloudflare Worker (apps/web/ - React Router 7)
docs.viewroyal.ai/*      --> Cloudflare Pages (apps/docs/ - Next.js 16 static export)
vimeo-proxy.kpeatt.workers.dev --> Cloudflare Worker (apps/vimeo-proxy/)
```

### Why Static Export to Cloudflare Pages (Not Workers)

**Decision: Use `next build` with `output: 'export'` deployed to Cloudflare Pages.**

Rationale:
1. **Fumadocs does not work on Edge runtime** -- the official docs explicitly state this
2. **OpenNext/Workers adds unnecessary complexity** -- docs are pure content, no server-side features needed
3. **Static export is the simplest path** -- generates HTML/CSS/JS files, served from Cloudflare CDN
4. **Cloudflare Pages is free** -- no Worker execution costs, just CDN serving
5. **Pages supports custom subdomains natively** -- `docs.viewroyal.ai` CNAME to `<project>.pages.dev`
6. **Search works client-side in static mode** -- fumadocs stores search indexes statically, computed in browser
7. **No OpenNext adapter needed** -- static HTML export is vanilla Next.js, no Cloudflare-specific adapter

The only feature lost with static export vs. SSR is server-side search (browser-computed search is sufficient for docs).

### Component Boundaries

| Component | Location | Responsibility | Communicates With |
|-----------|----------|---------------|-------------------|
| Docs site | `apps/docs/` | Developer documentation, API reference | Fetches OpenAPI spec at build time from viewroyal.ai |
| Web app | `apps/web/` | Main civic app + API server | Serves OpenAPI spec at `/api/v1/openapi.json` |
| Pipeline | `apps/pipeline/` | ETL data ingestion | Writes to Supabase (no docs interaction) |
| Vimeo proxy | `apps/vimeo-proxy/` | Video URL extraction | No docs interaction |

### Data Flow for OpenAPI Spec

```
Build Time:
  apps/docs/ build script
    --> fetch https://viewroyal.ai/api/v1/openapi.json
    --> save to apps/docs/openapi.json (checked into repo as fallback)
    --> fumadocs-openapi generates API reference pages
    --> next build --output export
    --> deploy static files to Cloudflare Pages

Runtime:
  Browser hits docs.viewroyal.ai
    --> Cloudflare Pages CDN serves static HTML/CSS/JS
    --> Client-side search indexes computed in browser
    --> API playground links point to viewroyal.ai/api/v1/*
```

---

## 3. Detailed Component Architecture

### 3.1 `apps/docs/` Project Structure

```
apps/docs/
  app/
    layout.tsx              # Root layout with fumadocs-ui DocsLayout
    global.css              # Tailwind CSS 4 + fumadocs preset imports
    docs/
      [[...slug]]/
        page.tsx            # Catch-all route rendering MDX + OpenAPI pages
    api-reference/
      [[...slug]]/
        page.tsx            # OpenAPI API reference pages (if separate section)
  content/
    docs/
      index.mdx             # Landing page
      getting-started/
        index.mdx            # Quick start guide
        authentication.mdx   # API key auth guide
        code-examples.mdx    # Language-specific examples
      guides/
        search.mdx           # Search API guide
        pagination.mdx       # Cursor vs page-based pagination
        ocd-api.mdx          # Open Civic Data endpoints
        webhooks.mdx         # (future) Webhook integration
      data-model/
        overview.mdx         # Entity relationship overview
        meetings.mdx         # Meetings data model
        people.mdx           # People data model
        matters.mdx          # Matters data model
        motions.mdx          # Motions data model
        bylaws.mdx           # Bylaws data model
      contributing/
        index.mdx            # Contribution guide
        architecture.mdx     # System architecture overview
      meta.json              # Navigation tree definition
    openapi/                 # Generated API reference pages (from script)
      meta.json
  lib/
    source.ts               # Fumadocs loader configuration
    openapi.ts              # OpenAPI instance configuration
  components/
    api-page.tsx            # APIPage component for OpenAPI rendering
    api-page.client.tsx     # Client-side API page config
  scripts/
    generate-openapi.mts    # Build-time script to fetch + generate API docs
  openapi.json              # Checked-in OpenAPI spec (fallback)
  source.config.ts          # Fumadocs MDX collection definitions
  next.config.mjs           # Next.js config with static export
  tailwind.config.ts        # Tailwind config (if needed beyond CSS imports)
  tsconfig.json
  package.json
  pnpm-workspace.yaml       # packages: ["."] (self-contained like other apps)
```

### 3.2 Key Configuration Files

#### `next.config.mjs`

```js
import { createMDX } from 'fumadocs-mdx/config';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  images: { unoptimized: true },
  // trailingSlash: true,  // optional, for cleaner URLs on static hosts
};

export default withMDX(config);
```

#### `source.config.ts`

```ts
import { defineCollections, defineConfig } from 'fumadocs-mdx/config';
import { z } from 'zod';

export const docs = defineCollections({
  type: 'doc',
  dir: 'content/docs',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    // additional frontmatter fields as needed
  }),
});

export default defineConfig({ collections: [docs] });
```

#### `lib/openapi.ts`

```ts
import { createOpenAPI } from 'fumadocs-openapi/server';

export const openapi = createOpenAPI({
  // Use local checked-in copy (generated by build script)
  input: ['./openapi.json'],
});
```

#### `scripts/generate-openapi.mts` (Build-time spec fetch)

```ts
import { writeFileSync } from 'node:fs';

const SPEC_URL = 'https://viewroyal.ai/api/v1/openapi.json';
const OUTPUT = './openapi.json';

async function fetchSpec() {
  console.log(`Fetching OpenAPI spec from ${SPEC_URL}...`);
  const res = await fetch(SPEC_URL);
  if (!res.ok) {
    console.warn(`Failed to fetch spec (${res.status}), using existing copy`);
    return;
  }
  const spec = await res.json();
  writeFileSync(OUTPUT, JSON.stringify(spec, null, 2));
  console.log(`Spec written to ${OUTPUT}`);
}

fetchSpec().catch(console.error);
```

#### `package.json` scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "prebuild": "node --import tsx scripts/generate-openapi.mts",
    "build": "next build",
    "deploy": "pnpm run build && wrangler pages deploy out --project-name viewroyal-docs",
    "typecheck": "tsc --noEmit"
  }
}
```

### 3.3 OpenAPI Spec Consumption Strategy

**Recommended: Hybrid approach (build-time fetch + checked-in fallback)**

1. The `prebuild` script attempts to fetch the live spec from `viewroyal.ai/api/v1/openapi.json`
2. If fetch succeeds, it overwrites `openapi.json` in the docs root
3. If fetch fails (network issue, site down), the existing checked-in copy is used
4. The `openapi.json` file IS checked into git as a fallback
5. fumadocs-openapi reads the local file to generate API reference pages

**Why not a remote URL at build time directly in fumadocs config?**
- fumadocs-openapi `input` accepts URLs, but a pre-fetch script gives better error handling
- A checked-in fallback means builds never fail due to network issues
- The checked-in spec also serves as a diff-able record of API changes

**When to update the spec:**
- Automatically during every docs build (prebuild script)
- Manually by running `node --import tsx scripts/generate-openapi.mts` and committing
- As part of CI/CD: API changes in apps/web trigger docs rebuild

### 3.4 Fumadocs Version Strategy

**Decision: Use fumadocs v16 (latest) with Next.js 16.**

| Package | Version | Requires |
|---------|---------|----------|
| fumadocs-core | ^16.6.5 | Next.js 16, React 19, Zod 4 |
| fumadocs-ui | ^16.6.5 | Next.js 16, React 19, fumadocs-core 16 |
| fumadocs-mdx | ^14.2.8 | Next.js 15+ or 16, fumadocs-core 15+ or 16 |
| fumadocs-openapi | ^10.3.9 | fumadocs-core ^16.5, fumadocs-ui ^16.5, React 19 |
| next | ^16.1.6 | Node.js 22+ (have v25.3.0) |

**Rationale for v16 over v15:**
- fumadocs-openapi v10 (current/latest) requires fumadocs-core/ui ^16.5 -- there is no way to use the latest OpenAPI integration with fumadocs v15
- fumadocs-openapi v5.x worked with Next.js 15, but it used a different API surface and is now significantly behind
- Next.js 16 is stable (released, multiple patch versions) and works with static export
- The docs site is a new greenfield app -- no migration cost, no risk to existing apps/web
- Next.js 16 has broader Cloudflare compatibility via OpenNext (though we use static export, not relevant but good to know)

**Note on Zod version:** fumadocs-core v16 requires Zod 4.x as a peer dependency. The main app (apps/web) uses Zod 4.3.6. Since apps/docs is a fully independent package with its own node_modules, there is zero risk of Zod version conflicts.

---

## 4. Workspace Integration Pattern

### Current State: Independent Apps, No Root Workspace

The repo currently has no root `pnpm-workspace.yaml`. Each app manages its own dependencies independently. This is an unconventional but functional pattern.

**Recommendation: Keep the independent app pattern.** Do not create a root workspace.

Rationale:
1. **Zero coupling** -- `apps/docs/` has completely different dependencies (Next.js 16, fumadocs) from `apps/web/` (React Router 7, Vite 7). A shared workspace would create phantom dependency risks
2. **Independent deployment** -- docs deploy to Cloudflare Pages, web deploys to Cloudflare Workers. Different CI pipelines, different build tools
3. **Consistency** -- matches how `apps/web/` and `apps/vimeo-proxy/` already work
4. **No shared packages** -- there are no shared UI libraries or utilities between apps. The docs site has no runtime dependency on the web app

### `apps/docs/pnpm-workspace.yaml`

```yaml
packages: ["."]
onlyBuiltDependencies:
  - esbuild
  - sharp
```

(Mirrors the pattern in `apps/web/pnpm-workspace.yaml`)

---

## 5. DNS and Deployment Architecture

### Cloudflare Pages Project Setup

```
Project name: viewroyal-docs
Production branch: main
Build command: pnpm run build
Build output directory: out
Root directory: apps/docs
```

### DNS Configuration

Since `viewroyal.ai` is already a Cloudflare zone:

1. In Cloudflare Pages dashboard: Add custom domain `docs.viewroyal.ai` to the `viewroyal-docs` project
2. Cloudflare automatically creates the CNAME record: `docs.viewroyal.ai -> viewroyal-docs.pages.dev`
3. SSL certificate is auto-provisioned by Cloudflare

No manual DNS records needed -- Cloudflare handles it since the zone is already managed.

### Deployment Pipeline

```
Manual (current pattern):
  cd apps/docs
  pnpm run build   # prebuild fetches spec, next build exports to /out
  wrangler pages deploy out --project-name viewroyal-docs

Future (Cloudflare Pages Git integration):
  Push to main branch
  Cloudflare Pages auto-builds from apps/docs/ root directory
  Build command: cd apps/docs && pnpm install && pnpm run build
  Output directory: apps/docs/out
```

**Note:** Cloudflare Pages Git integration supports configuring a root directory within the repo, making monorepo deployment straightforward.

### No Conflict with Existing Worker

The existing `apps/web/wrangler.toml` routes `viewroyal.ai/*` to the Worker. Since `docs.viewroyal.ai` is a different subdomain, there is zero routing conflict. Cloudflare resolves subdomains independently:
- `viewroyal.ai` -> Worker (apps/web)
- `docs.viewroyal.ai` -> Pages (apps/docs)

---

## 6. Build Pipeline Integration

### Build Order and Dependencies

```
apps/web (must be deployed first for OpenAPI spec availability)
  |
  v
apps/docs (fetches spec from deployed apps/web, then builds)
```

The docs site has a **build-time dependency** on the web app being deployed (for the OpenAPI spec). However, the checked-in `openapi.json` fallback means docs can always build even if the web app is unreachable.

### CI/CD Considerations

**Current state:** No CI/CD pipeline -- manual deploys via `pnpm run deploy` from apps/web and `wrangler deploy` from apps/vimeo-proxy.

**Recommended for docs:** Same manual pattern initially:
```bash
cd apps/docs
pnpm run deploy  # fetches spec + builds + deploys to Pages
```

**Future enhancement:** Cloudflare Pages Git integration for automatic deploys on push to main. This eliminates the need to run local builds for docs.

### Triggering Docs Rebuild After API Changes

When the API spec changes (new endpoints, schema changes in apps/web):
1. Deploy apps/web first (`cd apps/web && pnpm run deploy`)
2. Then rebuild docs (`cd apps/docs && pnpm run deploy`)
3. The prebuild script fetches the updated spec automatically

This is a manual two-step process. An automated solution (GitHub Actions workflow that deploys docs after web) is a future enhancement.

---

## 7. Patterns to Follow

### Pattern 1: Content-Code Separation

**What:** Keep MDX content in `content/docs/` and code in `app/`, `lib/`, `components/`
**When:** Always -- this is the fumadocs convention
**Why:** Clean separation enables non-developers to contribute documentation via MDX without touching app code

### Pattern 2: Generated OpenAPI + Hand-Written Guides

**What:** Auto-generate API reference from the OpenAPI spec, hand-write conceptual guides
**When:** API reference pages should never be manually maintained
**Why:** Auto-generated reference stays in sync with the API. Hand-written guides provide context, tutorials, and examples that auto-generation cannot

### Pattern 3: MDX File Generation for OpenAPI (Not Virtual Files)

**What:** Use `generateFiles()` to create physical MDX files from the OpenAPI spec, not the virtual files approach
**When:** For static export deployment
**Why:** Static export requires all pages to exist at build time. Virtual files use a runtime loader that requires RSC server capabilities. MDX file generation produces actual files that `next build --export` can process.

**Note:** This is a critical architectural decision. The fumadocs docs describe two approaches: MDX generation and virtual files. Only MDX generation works reliably with `output: 'export'`.

### Pattern 4: Fallback-First External Dependencies

**What:** Always have a checked-in fallback for any data fetched at build time
**When:** The OpenAPI spec, any external content
**Why:** Builds should never fail due to network issues. The fallback ensures deterministic builds.

---

## 8. Anti-Patterns to Avoid

### Anti-Pattern 1: Root pnpm Workspace

**What:** Creating a `pnpm-workspace.yaml` at the repo root to link apps/web and apps/docs
**Why bad:** Different frameworks (React Router 7 vs Next.js 16), different React versions possible, different build tools (Vite vs Next.js). Shared hoisting would cause version conflicts and phantom dependencies
**Instead:** Keep each app self-contained with its own workspace config

### Anti-Pattern 2: Sharing UI Components Between Web and Docs

**What:** Creating a `packages/ui/` shared component library
**Why bad:** apps/web uses React Router 7 + Tailwind CSS 4 + shadcn/ui. apps/docs uses Next.js 16 + fumadocs-ui. The component models are incompatible. Trying to share would create a maintenance nightmare
**Instead:** Let each app own its UI stack entirely

### Anti-Pattern 3: Runtime OpenAPI Spec Fetching

**What:** Having fumadocs fetch the OpenAPI spec from the live URL at page render time
**Why bad:** With static export, there is no runtime. And even with SSR, it couples docs availability to API availability
**Instead:** Fetch at build time, check in as fallback

### Anti-Pattern 4: Deploying Docs to Cloudflare Workers via OpenNext

**What:** Using @opennextjs/cloudflare to deploy the docs site as a Worker
**Why bad:** Adds significant complexity (Worker size limits, OpenNext adapter quirks). Docs are pure static content -- no server features needed. Workers cost compute per request; Pages CDN is free
**Instead:** Static export to Cloudflare Pages

### Anti-Pattern 5: Embedding Docs in the Main Web App

**What:** Adding fumadocs as a dependency of apps/web and serving docs from viewroyal.ai/docs
**Why bad:** apps/web is a React Router 7 app on Cloudflare Workers. Fumadocs is a Next.js framework. They cannot coexist in the same deployment. Even if they could, it would bloat the Worker bundle far beyond size limits
**Instead:** Separate app on separate subdomain

---

## 9. Scalability Considerations

| Concern | At Launch | At 50 Pages | At 200+ Pages |
|---------|-----------|-------------|---------------|
| Build time | <30s static export | ~1 min | ~3 min (still fast for static) |
| Search | Client-side, instant | Client-side, search index ~50KB | May need to split index or use Algolia |
| Bundle size | Negligible (static HTML) | Negligible | Negligible -- each page is independent |
| Deployment | Manual wrangler pages deploy | Same | Cloudflare Pages Git integration recommended |
| Spec changes | Manual two-step deploy | Same | GitHub Actions to auto-trigger docs rebuild |
| Content contributors | Developer only | Developer only | Consider CMS integration for non-dev contributors |

---

## 10. Cross-Linking Between Docs and Main App

The docs site should link to the main app where appropriate:

| From (docs.viewroyal.ai) | To (viewroyal.ai) | Purpose |
|--------------------------|-------------------|---------|
| API reference endpoint | `/api/v1/docs` | Interactive Swagger UI (already exists) |
| Getting started guide | `/developers` | API key management page |
| Authentication guide | `/developers` | Key creation flow |
| Home page | `viewroyal.ai` | Back to main product |

The main app should link back to docs:
| From (viewroyal.ai) | To (docs.viewroyal.ai) | Purpose |
|---------------------|----------------------|---------|
| `/api/v1/docs` Swagger UI | `docs.viewroyal.ai` | Full documentation |
| `/developers` API key page | `docs.viewroyal.ai/docs/getting-started` | Getting started guide |
| Footer | `docs.viewroyal.ai` | Developer docs link |

---

## Sources

- [Fumadocs Official Documentation](https://www.fumadocs.dev/docs) - Framework overview, installation, deployment
- [Fumadocs OpenAPI Integration](https://www.fumadocs.dev/docs/integrations/openapi) - OpenAPI setup, generateFiles(), virtual files
- [Fumadocs Deploying](https://www.fumadocs.dev/docs/deploying) - Cloudflare requires OpenNext; Edge runtime not supported
- [Fumadocs Static Build](https://www.fumadocs.dev/docs/deploying/static) - Static export configuration
- [Cloudflare Pages Custom Domains](https://developers.cloudflare.com/pages/configuration/custom-domains/) - Subdomain CNAME setup
- [Cloudflare Pages Static Next.js](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/) - Framework preset for static export
- [OpenNext Cloudflare](https://opennext.js.org/cloudflare) - Next.js on Workers (not recommended for this use case)
- npm registry version checks: fumadocs-core@16.6.5, fumadocs-ui@16.6.5, fumadocs-mdx@14.2.8, fumadocs-openapi@10.3.9, next@16.1.6

### Confidence Levels

| Finding | Confidence | Source |
|---------|------------|--------|
| Static export to CF Pages | HIGH | Official fumadocs docs + CF docs |
| fumadocs v16 requires Next.js 16 | HIGH | npm registry peer dependencies |
| fumadocs-openapi v10 requires fumadocs v16 | HIGH | npm registry peer dependencies |
| OpenAPI spec fetch at build time | HIGH | fumadocs docs + code examples |
| generateFiles() needed for static export | MEDIUM | Logical inference: virtual files need RSC server; confirmed by docs stating server-first approach |
| Client-side search works in static mode | HIGH | fumadocs static build docs |
| No root workspace needed | HIGH | Existing repo pattern, framework incompatibility |
| CNAME auto-created for CF-managed zones | HIGH | CF custom domains docs |
