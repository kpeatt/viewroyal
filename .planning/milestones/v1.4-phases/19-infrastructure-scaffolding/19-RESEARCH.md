# Phase 19: Infrastructure & Scaffolding - Research

**Researched:** 2026-02-23
**Domain:** pnpm monorepo workspaces, fumadocs v16, Next.js 16 static export, Cloudflare Workers static assets
**Confidence:** HIGH

## Summary

Phase 19 has two distinct work streams: (1) migrating the existing project to a pnpm workspace monorepo, and (2) scaffolding a fumadocs v16 + Next.js 16 docs site with static export. Both are well-understood patterns with mature tooling.

The monorepo migration is straightforward -- create a root `pnpm-workspace.yaml`, move the existing `apps/web/pnpm-lock.yaml` to root, and verify existing apps still build. The key risk is the Cloudflare Builds issue (#10941) where pnpm monorepos cause all workspace members to have their dependencies installed during CI -- but since `apps/docs` is an independent Next.js site (no shared workspace dependencies with `apps/web`), the mitigation is already built into the architecture decision documented in STATE.md.

The fumadocs scaffold uses `fumadocs-ui`, `fumadocs-core`, and `fumadocs-mdx` with a Next.js 16 App Router project configured for `output: 'export'`. Fumadocs explicitly states it "doesn't work on Edge runtime" -- but this is irrelevant for static export since the build produces plain HTML/CSS/JS files that get served as Cloudflare Workers static assets. The Orama search works client-side in static mode by downloading a pre-built search index at runtime. Dark mode is built into fumadocs-ui's `RootProvider` via `next-themes`.

**Primary recommendation:** Use `pnpm create fumadocs-app` to scaffold `apps/docs`, then configure `output: 'export'` in `next.config.mjs` and static search. Verify the existing `apps/web` build is unaffected by the workspace migration before touching fumadocs.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MONO-01 | Root pnpm-workspace.yaml configures apps/web, apps/docs, and apps/vimeo-proxy as workspace members | pnpm workspace YAML format is well-documented; `packages: ['apps/*']` glob covers all three apps |
| MONO-02 | Existing apps/web and apps/vimeo-proxy build and deploy correctly after workspace migration | Requires consolidating lock files to root, verifying `pnpm install` from root, then running existing build/deploy commands from each app directory |
| FWRK-01 | Fumadocs site scaffolded in apps/docs with Next.js 16 and fumadocs v16 | fumadocs-ui@16.6.5, fumadocs-core@16.6.5, fumadocs-mdx@14.2.8 with Next.js 16; scaffold via create-fumadocs-app or manual installation |
| FWRK-02 | Static export builds successfully (output: 'export') | Next.js `output: 'export'` in next.config.mjs + fumadocs static search + `images: { unoptimized: true }` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fumadocs-ui | ^16.6.5 | UI components for docs (sidebar, nav, search dialog, dark mode) | Official fumadocs UI layer; includes RootProvider with next-themes, DocsLayout, DocsPage |
| fumadocs-core | ^16.6.5 | Headless library for content loading, search server, page tree | Core engine; provides `loader()`, `createFromSource()`, search indexing |
| fumadocs-mdx | ^14.2.8 | MDX content source with collections API | Standard content source for fumadocs; provides `defineDocs()`, `defineConfig()`, generates `.source/` directory |
| next | ^16.0.0 | React framework with App Router, static export | Required by fumadocs v16 (minimum Next.js 16); Turbopack default bundler |
| react / react-dom | ^19.2.0 | UI rendering | Required by fumadocs v16 (minimum React 19.2.0) |
| @types/mdx | latest | TypeScript types for MDX | Required for TypeScript MDX support |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tailwindcss | ^4.0.0 | CSS framework (CSS-first config in v4) | fumadocs v15+ uses Tailwind v4 CSS imports, not JS config |
| next-themes | (bundled) | Dark/light mode toggle | Included automatically via fumadocs-ui RootProvider |
| @orama/orama | (bundled) | Client-side search | Included via fumadocs-core search; static mode for export |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fumadocs-mdx | @fumadocs/mdx-remote | mdx-remote is for CMS/remote sources; mdx is standard for file-based docs |
| Orama (built-in) | Algolia / Orama Cloud | Cloud search avoids downloading index; overkill for small docs site |
| Static export | OpenNext Cloudflare adapter | Full SSR on Workers; but project decision is static export for simplicity |

**Installation (in apps/docs/):**
```bash
pnpm add fumadocs-ui fumadocs-core fumadocs-mdx @types/mdx next react react-dom tailwindcss
```

## Architecture Patterns

### Recommended Project Structure
```
apps/docs/
├── content/
│   └── docs/
│       ├── index.mdx              # Landing/getting started page
│       └── meta.json              # Sidebar navigation ordering
├── app/
│   ├── layout.tsx                 # Root layout with RootProvider
│   ├── docs/
│   │   ├── layout.tsx             # DocsLayout with sidebar + nav
│   │   └── [[...slug]]/
│   │       └── page.tsx           # Dynamic doc page renderer
│   └── api/
│       └── search/
│           └── route.ts           # Static search index endpoint
├── lib/
│   └── source.ts                  # Content source configuration
├── mdx-components.tsx             # MDX component overrides
├── source.config.ts               # fumadocs-mdx collection definitions
├── next.config.mjs                # Static export + fumadocs MDX plugin
├── tailwind.css                   # Tailwind v4 CSS-first config
├── tsconfig.json                  # TypeScript config with fumadocs paths
├── package.json                   # App dependencies
└── wrangler.toml                  # Cloudflare Workers static assets (Phase 22)
```

### Monorepo Root Structure
```
viewroyal/
├── pnpm-workspace.yaml            # NEW: workspace definition
├── package.json                   # NEW: root package.json (scripts only)
├── pnpm-lock.yaml                 # MOVED: consolidated from apps/web/
├── .npmrc                         # NEW: pnpm settings (optional)
├── apps/
│   ├── web/                       # Existing React Router app
│   ├── docs/                      # NEW: fumadocs site
│   ├── vimeo-proxy/               # Existing Cloudflare Worker
│   └── pipeline/                  # Existing Python ETL (not in workspace)
└── ...
```

### Pattern 1: pnpm Workspace Configuration
**What:** Define workspace members so pnpm resolves all JS apps from a single lock file
**When to use:** Always, for the monorepo root

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/web'
  - 'apps/docs'
  - 'apps/vimeo-proxy'
```

Note: `apps/pipeline` is Python (uv-managed) and is NOT a pnpm workspace member.

### Pattern 2: fumadocs-mdx Collections API (Current)
**What:** Define content collections using `defineDocs()` and `defineConfig()`
**When to use:** Setting up the content source

```typescript
// source.config.ts
import { defineDocs, defineConfig } from 'fumadocs-mdx/config';

export const docs = defineDocs({
  dir: 'content/docs',
});

export default defineConfig();
```

```typescript
// lib/source.ts
import { docs } from 'fumadocs-mdx:collections/server';
import { loader } from 'fumadocs-core/source';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
```

### Pattern 3: Static Export with Static Search
**What:** Configure Next.js for static HTML output with client-side Orama search
**When to use:** Required for FWRK-02

```javascript
// next.config.mjs
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
};

export default withMDX(nextConfig);
```

```typescript
// app/api/search/route.ts
import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

// staticGET exports search index as static JSON
export const revalidate = false;
export const { staticGET: GET } = createFromSource(source);
```

Client-side search uses `type: 'static'` which downloads the pre-built index and runs Orama in the browser.

### Pattern 4: Tailwind CSS v4 for fumadocs
**What:** CSS-first Tailwind configuration (no tailwind.config.js)
**When to use:** Styling fumadocs site

```css
/* tailwind.css (or globals.css) */
@import 'tailwindcss';
@import 'fumadocs-ui/css/neutral.css';
@import 'fumadocs-ui/css/preset.css';
@source '../node_modules/fumadocs-ui/dist/**/*.js';
```

### Pattern 5: fumadocs Root Layout with Dark Mode
**What:** RootProvider wraps the entire app and provides theme switching via next-themes
**When to use:** Root layout.tsx

```typescript
// app/layout.tsx
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import './tailwind.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
```

Note: In fumadocs v16, the provider import changed from `fumadocs-ui/provider` to `fumadocs-ui/provider/next`.

### Pattern 6: Docs Layout with Sidebar
**What:** DocsLayout auto-generates sidebar from page tree
**When to use:** docs/layout.tsx

```typescript
// app/docs/layout.tsx
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { source } from '@/lib/source';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{ title: 'ViewRoyal.ai API Docs' }}
    >
      {children}
    </DocsLayout>
  );
}
```

### Anti-Patterns to Avoid
- **Using `fumadocs-ui/provider` instead of `fumadocs-ui/provider/next`:** v16 removed the generic provider; use the framework-specific import
- **Using `fumadocs-core/sidebar`:** Removed in v16; use pre-built DocsLayout which handles sidebar automatically
- **Using WASM Shiki engine:** v16 defaults to JavaScript engine for Cloudflare compatibility; don't override
- **Importing from `fumadocs-core/server`:** v16 redistributed exports to specialized modules (`fumadocs-core/content/github`, `fumadocs-core/page-tree`, `fumadocs-core/toc`)
- **Creating tailwind.config.js:** fumadocs v15+ uses Tailwind v4 CSS-first config; no JS config file needed

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Documentation sidebar | Custom sidebar component | `DocsLayout` from fumadocs-ui | Auto-generates from page tree, handles mobile, collapsible sections |
| Search | Custom search implementation | fumadocs-core `createFromSource` + `staticGET` | Orama indexing, structured data search, UI dialog included |
| Dark mode | Custom theme toggle | fumadocs-ui `RootProvider` (includes next-themes) | Handles SSR hydration, system preference detection, cookie persistence |
| MDX rendering | Custom MDX pipeline | fumadocs-mdx with `source.config.ts` | Handles frontmatter, structured data extraction, page tree generation |
| Code highlighting | Custom Shiki/Prism setup | fumadocs built-in (Shiki JS engine) | Pre-configured with v16 JS engine, handles static export |
| Table of contents | Custom TOC parser | fumadocs-ui `DocsPage` component | Auto-extracted from MDX headings, sticky sidebar |

**Key insight:** fumadocs is a batteries-included framework. The scaffold should use its built-in components rather than recreating any standard docs features.

## Common Pitfalls

### Pitfall 1: Lock File Location After Workspace Migration
**What goes wrong:** `pnpm install` fails or produces incorrect resolution because the lock file is in the wrong location
**Why it happens:** Before workspace migration, the lock file lives in `apps/web/`. After, it must be at the monorepo root.
**How to avoid:** Delete `apps/web/pnpm-lock.yaml` and `apps/web/node_modules/`, create root `pnpm-workspace.yaml`, run `pnpm install` from root to generate a fresh root-level `pnpm-lock.yaml`
**Warning signs:** `pnpm install` warnings about "ignoring workspace" or packages not found

### Pitfall 2: Root node_modules Conflict
**What goes wrong:** The existing `node_modules/` at the repo root (contains `pg` and related packages) conflicts with pnpm workspace hoisting
**Why it happens:** There's already a `node_modules/` directory at the repo root from some previous install
**How to avoid:** Delete the existing root `node_modules/` before setting up the workspace. It contains only `pg`-related packages that are not needed at root level.
**Warning signs:** Unexpected packages in root `node_modules/`, version conflicts

### Pitfall 3: Cloudflare Builds Installs All Workspace Members
**What goes wrong:** Cloudflare Builds runs `pnpm install` at the monorepo root, which installs dependencies for ALL workspace members (including apps/docs which needs Next.js 16)
**Why it happens:** workers-sdk #10941 -- Cloudflare doesn't respect build root directory for pnpm install scoping
**How to avoid:** This is the reason STATE.md specifies `apps/docs` as "fully independent in pnpm workspace." As long as all workspace members have compatible Node.js requirements (they do -- all use Node 20+), this is not a blocking issue. The extra install time is the main cost. If it becomes a problem, the workspace can use `pnpm deploy` or `.cfignore` to scope builds.
**Warning signs:** Cloudflare build times increase; build failures from incompatible dependencies in other workspace members

### Pitfall 4: Missing `images: { unoptimized: true }` for Static Export
**What goes wrong:** `next build` fails when `output: 'export'` is set because Next.js Image Optimization requires a server
**Why it happens:** Default `next/image` uses server-side optimization unavailable in static export
**How to avoid:** Always set `images: { unoptimized: true }` in `next.config.mjs` when using `output: 'export'`
**Warning signs:** Build error mentioning Image Optimization API

### Pitfall 5: Using Wrong fumadocs Provider Import (v16 Breaking Change)
**What goes wrong:** Build error or runtime crash when importing `RootProvider` from `fumadocs-ui/provider`
**Why it happens:** fumadocs v16 removed the generic provider export; must use framework-specific import
**How to avoid:** Import from `fumadocs-ui/provider/next` for Next.js projects
**Warning signs:** Module not found error for `fumadocs-ui/provider`

### Pitfall 6: API Route Handler Incompatible with Static Export
**What goes wrong:** Build fails because API route uses dynamic handler (GET function) incompatible with static export
**Why it happens:** Static export cannot have dynamic API routes; search must use `staticGET`
**How to avoid:** Use `export const { staticGET: GET } = createFromSource(source)` and `export const revalidate = false` in the search route
**Warning signs:** Build error about dynamic API routes in static export

### Pitfall 7: TypeScript Path for fumadocs-mdx Collections
**What goes wrong:** TypeScript cannot resolve `fumadocs-mdx:collections/server` import
**Why it happens:** fumadocs-mdx uses a virtual module path that needs a tsconfig path alias
**How to avoid:** Add `"fumadocs-mdx:collections/*": [".source/*"]` to tsconfig.json `compilerOptions.paths`
**Warning signs:** TS error "Cannot find module 'fumadocs-mdx:collections/server'"

### Pitfall 8: Existing vite.config.ts Root Env Path
**What goes wrong:** After workspace migration, `apps/web/vite.config.ts` cannot find the root `.env` file
**Why it happens:** The config uses `path.resolve(process.cwd(), "../../")` which assumes a specific directory depth
**How to avoid:** Verify that `../../` from `apps/web/` still points to the monorepo root (it does -- the directory structure doesn't change). Test `pnpm dev` from `apps/web/` after migration.
**Warning signs:** Missing environment variables during local dev

## Code Examples

### Complete next.config.mjs for Static Export
```javascript
// Source: fumadocs docs + Next.js static export docs
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
};

export default withMDX(nextConfig);
```

### Complete source.config.ts
```typescript
// Source: fumadocs-mdx docs
import { defineDocs, defineConfig } from 'fumadocs-mdx/config';

export const docs = defineDocs({
  dir: 'content/docs',
});

export default defineConfig();
```

### Complete lib/source.ts
```typescript
// Source: fumadocs-mdx Next.js integration docs
import { docs } from 'fumadocs-mdx:collections/server';
import { loader } from 'fumadocs-core/source';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
```

### Complete Docs Page with generateStaticParams
```typescript
// Source: fumadocs manual installation guide
// app/docs/[[...slug]]/page.tsx
import { source } from '@/lib/source';
import { notFound } from 'next/navigation';
import {
  DocsPage,
  DocsBody,
  DocsTitle,
  DocsDescription,
} from 'fumadocs-ui/page';
import defaultMdxComponents from 'fumadocs-ui/mdx';

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={{ ...defaultMdxComponents }} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}
```

### Complete Static Search Route
```typescript
// Source: fumadocs Orama search docs
// app/api/search/route.ts
import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

export const revalidate = false;
export const { staticGET: GET } = createFromSource(source);
```

### Root pnpm-workspace.yaml
```yaml
packages:
  - 'apps/web'
  - 'apps/docs'
  - 'apps/vimeo-proxy'
```

### Root package.json (Minimal)
```json
{
  "name": "viewroyal",
  "private": true,
  "scripts": {
    "dev:web": "pnpm --filter web dev",
    "dev:docs": "pnpm --filter docs dev",
    "build:web": "pnpm --filter web build",
    "build:docs": "pnpm --filter docs build"
  }
}
```

### mdx-components.tsx
```typescript
// Source: fumadocs manual installation guide
import defaultComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...defaultComponents,
    ...components,
  };
}
```

### Tailwind CSS v4 Configuration
```css
/* tailwind.css */
@import 'tailwindcss';
@import 'fumadocs-ui/css/neutral.css';
@import 'fumadocs-ui/css/preset.css';
@source '../node_modules/fumadocs-ui/dist/**/*.js';
```

### Sample content/docs/index.mdx
```mdx
---
title: ViewRoyal.ai API Documentation
description: Developer documentation for the ViewRoyal.ai civic intelligence API
---

## Welcome

ViewRoyal.ai provides a RESTful API for accessing council meeting data,
agenda items, motions, and more for the Town of View Royal, BC.

## Getting Started

[Placeholder for Phase 21 content]
```

### Sample content/docs/meta.json
```json
{
  "root": true,
  "pages": ["---Getting Started---", "..."]
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| fumadocs-core/sidebar module | DocsLayout auto-sidebar from page tree | fumadocs v16 (Oct 2025) | Don't import sidebar utilities; DocsLayout handles everything |
| fumadocs-ui/provider | fumadocs-ui/provider/next | fumadocs v16 (Oct 2025) | Framework-specific provider imports required |
| fumadocs-core/server exports | Redistributed to specialized modules | fumadocs v16 (Oct 2025) | Import from fumadocs-core/page-tree, fumadocs-core/toc, etc. |
| Tailwind JS config (tailwind.config.ts) | CSS-first config (@import) | fumadocs v15 / Tailwind v4 (Jan 2025) | No tailwind.config.js needed; use CSS imports |
| WASM Shiki engine (Oniguruma) | JavaScript Shiki engine | fumadocs v16 (Oct 2025) | JS engine is default; better Cloudflare Workers compat |
| createMetadataImage API | Removed | fumadocs v16 (Oct 2025) | Use Next.js built-in OG image generation if needed |
| middleware.ts | proxy.ts | Next.js 16 (Oct 2025) | Rename if using middleware (not relevant for static export) |
| Webpack bundler | Turbopack (default) | Next.js 16 (Oct 2025) | Turbopack is now the default; faster builds |

**Deprecated/outdated:**
- `fumadocs-core/sidebar`: Removed in v16; use DocsLayout
- `fumadocs-ui/provider`: Removed in v16; use `fumadocs-ui/provider/next`
- `createFromSource()` deprecated signature in `useSearch()`: Removed in v16
- `tailwind.config.js` for fumadocs: Replaced by CSS-first Tailwind v4 imports
- `next export` command: Removed in Next.js 14+; use `output: 'export'` in config

## Open Questions

1. **Exact `create-fumadocs-app` template string for Next.js + fumadocs-mdx**
   - What we know: The CLI accepts a `--template` flag, example shown as `+next+fuma-docs-mdx`
   - What's unclear: Whether the interactive CLI or the programmatic API produces a cleaner scaffold for our needs
   - Recommendation: Use `pnpm create fumadocs-app` interactively in `apps/docs/` directory, selecting Next.js and fumadocs-mdx. If the scaffold includes a package-lock or unnecessary files, clean them up. Alternatively, manual installation following the patterns documented above is equally viable and gives more control.

2. **fumadocs-ui search dialog auto-configuration in static mode**
   - What we know: The `RootProvider` includes search dialog; `staticGET` exports the index; client uses `type: 'static'`
   - What's unclear: Whether additional `SearchDialog` configuration is needed, or if it "just works" with the default RootProvider when the static search route exists
   - Recommendation: Start with the default RootProvider setup. The fumadocs UI search dialog should auto-detect the search endpoint. If it doesn't work, explicitly configure the search type in the provider.

3. **Next.js 16 async params in static export with generateStaticParams**
   - What we know: Next.js 16 requires `await params` (async params). fumadocs docs page uses `params.slug`.
   - What's unclear: Whether `generateStaticParams` works smoothly with `output: 'export'` for the `[[...slug]]` catch-all route in Next.js 16
   - Recommendation: This is a standard pattern that fumadocs officially documents. Follow their exact code pattern with `Promise<{ slug?: string[] }>` type for params.

## Sources

### Primary (HIGH confidence)
- [Fumadocs v16 release blog](https://www.fumadocs.dev/blog/v16) - Breaking changes, new APIs, migration details
- [Fumadocs static export docs](https://fumadocs.dev/docs/deploying/static) - Static build configuration for Next.js
- [Fumadocs Orama search docs](https://www.fumadocs.dev/docs/headless/search/orama) - Static search setup with `staticGET`
- [Fumadocs MDX Next.js setup](https://www.fumadocs.dev/docs/mdx/next) - `defineDocs()`, `defineConfig()`, source.config.ts
- [Next.js 16 blog post](https://nextjs.org/blog/next-16) - Breaking changes, version requirements, Turbopack default
- [Next.js static exports guide](https://nextjs.org/docs/app/guides/static-exports) - `output: 'export'` configuration and limitations
- [pnpm workspace docs](https://pnpm.io/workspaces) - Workspace YAML configuration
- [GitHub fumadocs releases](https://github.com/fuma-nama/fumadocs/releases) - Current versions: fumadocs-ui@16.6.5, fumadocs-core@16.6.5, fumadocs-mdx@14.2.8

### Secondary (MEDIUM confidence)
- [danielfullstack.com fumadocs guide](https://www.danielfullstack.com/article/setup-fumadocs-with-nextjs-in-5-minutes) - Verified manual installation walkthrough
- [zephinax.com fumadocs + GitHub Pages](https://zephinax.com/blog/deploy-nextjs-fumadocs-github-pages) - Static export deployment pattern
- [Cloudflare Workers static assets docs](https://developers.cloudflare.com/workers/static-assets/) - `[assets]` directive configuration
- [Cloudflare advanced build setups](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/) - Monorepo build configuration

### Tertiary (LOW confidence)
- [workers-sdk #10941](https://github.com/cloudflare/workers-sdk/issues/10941) - pnpm monorepo install issue; status may have changed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All package versions verified via GitHub releases and npm; fumadocs v16 + Next.js 16 well-documented
- Architecture: HIGH - Static export pattern is explicitly documented by both fumadocs and Next.js; monorepo workspace pattern is standard pnpm
- Pitfalls: HIGH - Breaking changes documented in v16 release blog; static export limitations documented by Next.js; workers-sdk #10941 documented in project STATE.md

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (fumadocs actively maintained, minor versions releasing frequently)
