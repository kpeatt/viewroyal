# Phase 20: OpenAPI Integration & API Reference - Research

**Researched:** 2026-02-23
**Domain:** fumadocs-openapi v10, OpenAPI 3.1 spec generation, interactive API playground, multi-language code examples
**Confidence:** HIGH

## Summary

Phase 20 integrates the existing live OpenAPI 3.1 spec (served by chanfana at `/api/v1/openapi.json`) into the fumadocs docs site scaffolded in Phase 19. The primary tool is `fumadocs-openapi` v10.x, which provides `generateFiles()` to create MDX pages from the spec, `createAPIPage` + `createOpenAPI` for rendering, and a built-in interactive playground and code example system.

The architecture is straightforward: a prebuild script fetches the OpenAPI JSON from the live API (`https://viewroyal.ai/api/v1/openapi.json`) and writes it to a local fallback file (`apps/docs/openapi.json`). Then `generateFiles()` reads the local spec and generates MDX files grouped by tag (Meetings, People, Matters, Motions, Bylaws, Search, OCD, System). The `APIPage` component renders each page with endpoint details, an interactive playground, and auto-generated code examples. Since the API already has `CORS origin: *` configured, the playground can make direct browser requests without needing a server-side proxy -- this is critical because the docs site uses `output: 'export'` (static HTML) and cannot run route handlers.

The main technical challenge is the split between server and client components in fumadocs-openapi v10. The `createAPIPage` function creates a React Server Component that reads the spec at build time, while `defineClientConfig` handles client-side interactive features (playground, syntax highlighting). For static export, the RSC parts render at build time into static HTML, and the playground runs entirely client-side via JavaScript hydration. Code examples for curl, JavaScript, and Python must be configured via the `generateCodeSamples` option on `createOpenAPI`, since fumadocs only auto-generates curl by default.

**Primary recommendation:** Use `fumadocs-openapi` v10.x with `generateFiles()` (per: 'operation', groupBy: 'tag') to create MDX files at build time. Write a `scripts/generate-openapi.mjs` prebuild script that fetches the spec, falls back to the committed copy, and runs `generateFiles()`. Configure `generateCodeSamples` to produce curl, JavaScript (fetch), and Python (requests) examples for every endpoint.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AREF-01 | OpenAPI spec fetched at build time from live API with checked-in fallback | Prebuild script pattern: fetch from `https://viewroyal.ai/api/v1/openapi.json`, write to `apps/docs/openapi.json` as fallback, `createOpenAPI({ input: ['./openapi.json'] })` reads the local file |
| AREF-02 | API reference pages auto-generated from OpenAPI 3.1 spec grouped by tag | `generateFiles({ per: 'operation', groupBy: 'tag' })` creates one MDX per endpoint, organized in tag folders (meetings/, people/, etc.). `meta.json` files needed per folder for sidebar ordering |
| AREF-03 | Interactive playground on API reference pages for live API requests | fumadocs-openapi includes a built-in playground component rendered by `createAPIPage`. Playground sends requests directly to the API server URL from the browser. API has CORS `origin: *` so no proxy needed. Must add `servers` array to OpenAPI spec for playground to know where to send requests |
| AREF-04 | Multi-language code examples (curl, JavaScript, Python) on reference pages | Configure `generateCodeSamples` in `createOpenAPI` to return samples in curl, JS (fetch), and Python (requests). curl can use `source: false` for auto-generation; JS and Python need custom template functions |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fumadocs-openapi | ^10.3.7 | OpenAPI spec parsing, MDX generation, API page rendering, playground | Official fumadocs OpenAPI integration; provides `generateFiles()`, `createAPIPage`, `createOpenAPI`, playground UI |
| shiki | latest | Syntax highlighting for code examples | Required peer dependency of fumadocs-openapi; used for playground and code blocks |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fumadocs-ui | ^16.6.5 | (already installed) DocsLayout, DocsPage components | Already in Phase 19 scaffold |
| fumadocs-core | ^16.6.5 | (already installed) Loader API, source management | Already in Phase 19 scaffold |
| fumadocs-mdx | ^14.2.8 | (already installed) MDX content source | Already in Phase 19 scaffold |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `generateFiles()` (static MDX) | `openapiSource()` (virtual/dynamic) | openapiSource generates pages at runtime via RSC -- incompatible with `output: 'export'` static build. generateFiles is the ONLY option for static export |
| Built-in playground | Scalar API client (fumadocs-openapi/scalar) | Scalar is heavier; built-in playground is sufficient for a GET-only API |
| Custom prebuild script | fumadocs CLI fetch | No CLI support for fetching remote specs; custom script is the standard pattern |

**Installation (in apps/docs/):**
```bash
pnpm add fumadocs-openapi shiki
```

## Architecture Patterns

### Recommended Project Structure (additions to Phase 19 scaffold)
```
apps/docs/
├── content/
│   └── docs/
│       ├── index.mdx                    # (existing) Landing page
│       ├── meta.json                    # (update) Add API Reference section
│       └── api-reference/               # NEW: generated OpenAPI pages
│           ├── meta.json                # Sidebar ordering for tag groups
│           ├── meetings/                # Tag group folder
│           │   ├── meta.json            # Sidebar ordering within group
│           │   ├── list-meetings.mdx    # Generated per operation
│           │   └── get-meeting.mdx      # Generated per operation
│           ├── people/
│           ├── matters/
│           ├── motions/
│           ├── bylaws/
│           ├── search/
│           ├── ocd/
│           └── system/
├── components/
│   ├── api-page.tsx                     # NEW: server-side APIPage wrapper
│   └── api-page.client.tsx              # NEW: client-side config (playground, shiki)
├── lib/
│   ├── source.ts                        # (existing) Content source -- no changes needed
│   └── openapi.ts                       # NEW: createOpenAPI instance
├── scripts/
│   └── generate-openapi.mjs            # NEW: prebuild script (fetch + generateFiles)
├── openapi.json                         # NEW: committed fallback spec
├── mdx-components.tsx                   # (update) Register APIPage component
├── tailwind.css                         # (update) Add openapi CSS preset import
└── package.json                         # (update) Add prebuild script
```

### Pattern 1: Prebuild Script (Fetch + Generate)
**What:** A Node.js script that fetches the live OpenAPI spec, falls back to committed copy, and generates MDX files
**When to use:** Before every `next build` (wired as `prebuild` npm script)

```javascript
// scripts/generate-openapi.mjs
// Source: Project decision from STATE.md + fumadocs-openapi docs
import { createOpenAPI } from 'fumadocs-openapi/server';
import { generateFiles } from 'fumadocs-openapi';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const SPEC_URL = 'https://viewroyal.ai/api/v1/openapi.json';
const FALLBACK_PATH = './openapi.json';
const OUTPUT_DIR = './content/docs/api-reference';

async function fetchSpec() {
  try {
    const res = await fetch(SPEC_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const spec = await res.text();
    // Update the committed fallback
    writeFileSync(FALLBACK_PATH, spec);
    console.log('[openapi] Fetched live spec from', SPEC_URL);
    return spec;
  } catch (err) {
    console.warn('[openapi] Live fetch failed, using fallback:', err.message);
    if (!existsSync(FALLBACK_PATH)) {
      throw new Error('No fallback spec found at ' + FALLBACK_PATH);
    }
    return readFileSync(FALLBACK_PATH, 'utf-8');
  }
}

const spec = await fetchSpec();
// Write the spec for createOpenAPI to read
writeFileSync(FALLBACK_PATH, spec);

const openapi = createOpenAPI({
  input: [FALLBACK_PATH],
});

await generateFiles({
  input: openapi,
  output: OUTPUT_DIR,
  per: 'operation',
  groupBy: 'tag',
  addGeneratedComment: true,
});

console.log('[openapi] Generated API reference MDX files');
```

### Pattern 2: createOpenAPI Server Configuration
**What:** Server-side OpenAPI instance with code sample generation
**When to use:** `lib/openapi.ts` -- imported by both the prebuild script and the APIPage component

```typescript
// lib/openapi.ts
// Source: fumadocs-openapi v10 docs
import { createOpenAPI } from 'fumadocs-openapi/server';

export const openapi = createOpenAPI({
  input: ['./openapi.json'],
  generateCodeSamples(endpoint) {
    const { method, path, parameters } = endpoint;
    const url = `https://viewroyal.ai${path}`;

    return [
      {
        lang: 'bash',
        label: 'cURL',
        source: `curl -X ${method.toUpperCase()} '${url}' \\
  -H 'X-API-Key: YOUR_API_KEY'`,
      },
      {
        lang: 'js',
        label: 'JavaScript',
        source: `const res = await fetch('${url}', {
  headers: { 'X-API-Key': 'YOUR_API_KEY' }
});
const data = await res.json();`,
      },
      {
        lang: 'python',
        label: 'Python',
        source: `import requests

res = requests.get('${url}',
    headers={'X-API-Key': 'YOUR_API_KEY'})
data = res.json()`,
      },
    ];
  },
});
```

### Pattern 3: APIPage Component (Server + Client)
**What:** The component that renders each API reference page with endpoint details, playground, and code examples
**When to use:** Registered in mdx-components.tsx, used by generated MDX files

```typescript
// components/api-page.tsx (server component)
// Source: fumadocs-openapi v10 docs
import { openapi } from '@/lib/openapi';
import { createAPIPage } from 'fumadocs-openapi/ui';
import client from './api-page.client';

export const APIPage = createAPIPage(openapi, {
  client,
});
```

```typescript
// components/api-page.client.tsx (client component)
// Source: fumadocs-openapi v10 docs
'use client';
import { defineClientConfig } from 'fumadocs-openapi/ui/client';

export default defineClientConfig({
  // playground.enabled defaults to true
  // storageKeyPrefix isolates localStorage state
  storageKeyPrefix: 'viewroyal-api',
});
```

### Pattern 4: MDX Components Registration
**What:** Register APIPage so generated MDX files can use `<APIPage />` tag
**When to use:** mdx-components.tsx update

```typescript
// mdx-components.tsx (update)
import defaultComponents from 'fumadocs-ui/mdx';
import { APIPage } from '@/components/api-page';
import type { MDXComponents } from 'mdx/types';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...defaultComponents,
    APIPage,
    ...components,
  };
}
```

### Pattern 5: CSS Import for OpenAPI Styles
**What:** Import fumadocs-openapi CSS preset for playground and API page styling
**When to use:** tailwind.css update

```css
/* tailwind.css (add this import) */
@import 'fumadocs-openapi/css/preset.css';
```

### Pattern 6: Package.json Prebuild Script
**What:** Wire the generate script to run before `next build`
**When to use:** package.json scripts update

```json
{
  "scripts": {
    "prebuild": "node scripts/generate-openapi.mjs",
    "build": "next build",
    "dev": "next dev --turbopack"
  }
}
```

### Pattern 7: meta.json for Sidebar Navigation
**What:** Configure sidebar ordering so API reference sections appear correctly
**When to use:** Each tag group folder needs a meta.json

```json
// content/docs/meta.json (update root)
{
  "root": true,
  "pages": [
    "---Getting Started---",
    "...",
    "---API Reference---",
    "api-reference"
  ]
}
```

```json
// content/docs/api-reference/meta.json
{
  "pages": [
    "meetings",
    "people",
    "matters",
    "motions",
    "bylaws",
    "search",
    "ocd",
    "system"
  ]
}
```

### Pattern 8: Adding servers Array to OpenAPI Spec
**What:** The chanfana-generated spec currently has no `servers` array. The playground needs it to know where to send requests.
**When to use:** Either add to chanfana config in `apps/web/app/api/index.ts`, or post-process the spec in the prebuild script

The prebuild script can inject the servers array after fetching:
```javascript
const specObj = JSON.parse(spec);
if (!specObj.servers || specObj.servers.length === 0) {
  specObj.servers = [
    { url: 'https://viewroyal.ai', description: 'Production' }
  ];
}
writeFileSync(FALLBACK_PATH, JSON.stringify(specObj, null, 2));
```

### Anti-Patterns to Avoid
- **Using `openapiSource()` with static export:** `openapiSource()` generates pages at runtime via RSC -- it will NOT work with `output: 'export'`. Must use `generateFiles()` to produce static MDX files at build time.
- **Creating a proxy route handler:** The proxy pattern (`/api/proxy/route.ts`) requires a running server. With `output: 'export'`, there is no server. Since the API has CORS `origin: *`, direct browser requests work fine.
- **Hand-writing API reference MDX:** The whole point is auto-generation. Never manually author endpoint documentation; it will drift from the actual spec.
- **Putting generateFiles in next.config.mjs:** The generation script should be a separate prebuild step, not inside the Next.js config. This keeps the build deterministic and allows the script to handle fetch failures gracefully.
- **Forgetting meta.json files:** `generateFiles()` in v9+ no longer auto-generates meta.json. Each tag folder needs a manually created meta.json for sidebar ordering.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API reference pages | Custom MDX per endpoint | `generateFiles()` from fumadocs-openapi | Auto-generates from spec; stays in sync; handles request/response schemas |
| Interactive playground | Custom fetch UI | fumadocs-openapi built-in playground | Handles parameter input, request execution, response display, auth headers |
| Code examples | Manual curl/JS/Python snippets | `generateCodeSamples` on `createOpenAPI` | Auto-generates for every endpoint; consistent format; updates when spec changes |
| OpenAPI spec parsing | Custom JSON parsing | fumadocs-openapi `createOpenAPI` | Handles $ref resolution, schema inheritance, OpenAPI 3.0/3.1 differences |
| Syntax highlighting | Custom Prism/Highlight.js | Shiki via fumadocs-openapi | Already integrated; tree-shaking; server-rendered for static export |
| Endpoint grouping by tag | Custom directory structure | `groupBy: 'tag'` option | Reads tags from spec; creates correct folder hierarchy |

**Key insight:** fumadocs-openapi handles the entire pipeline from spec parsing to rendered interactive docs. The only custom code needed is the prebuild script (fetch + fallback) and the `generateCodeSamples` function (for Python, since only curl and JS are semi-automatic).

## Common Pitfalls

### Pitfall 1: openapiSource vs generateFiles with Static Export
**What goes wrong:** Using `openapiSource()` with `output: 'export'` fails at build time because it requires RSC runtime page generation
**Why it happens:** `openapiSource()` dynamically generates pages through the Loader API at request time; static export pre-renders all pages and cannot run dynamic generation
**How to avoid:** Use `generateFiles()` exclusively. This was already identified in STATE.md as the correct approach.
**Warning signs:** Build errors about dynamic routes or server-only APIs during `next build`

### Pitfall 2: Missing servers Array in OpenAPI Spec
**What goes wrong:** The playground doesn't know where to send requests; may default to the docs site's own domain
**Why it happens:** chanfana's `fromHono()` with a `base` path doesn't automatically add a `servers` array to the generated spec
**How to avoid:** Inject a `servers` array into the spec during the prebuild script, or add it to chanfana's schema config
**Warning signs:** Playground requests go to wrong URL or return CORS/404 errors

### Pitfall 3: meta.json Not Auto-Generated (v9+ Change)
**What goes wrong:** Generated API reference pages don't appear in the sidebar, or appear in random order
**Why it happens:** fumadocs-openapi v9 removed auto-generation of meta.json. Developers must create them manually.
**How to avoid:** Create meta.json files for each tag group folder. The prebuild script can also generate these based on the spec's tag list.
**Warning signs:** Pages exist in `content/docs/api-reference/` but don't show in sidebar

### Pitfall 4: Playground CORS Issues on Non-Production Domains
**What goes wrong:** Playground works locally but fails when docs are deployed to a different domain
**Why it happens:** Even though the API has `origin: *` CORS, there could be edge cases with preflight requests or non-standard headers
**How to avoid:** Test the playground from the deployed docs site against the production API. The API already allows `X-API-Key` in `allowHeaders`, which covers the auth header the playground will send.
**Warning signs:** Browser console CORS errors when using the playground

### Pitfall 5: generateCodeSamples Endpoint Parameter Shape
**What goes wrong:** Code samples have wrong URLs, missing path parameters, or incorrect method
**Why it happens:** The `endpoint` parameter passed to `generateCodeSamples` has a specific shape that includes `method`, `path`, and `parameters` -- but the exact property names may differ from what's expected
**How to avoid:** Log the endpoint object during development to inspect its actual structure. Build code sample templates that handle path parameters (`:municipality`, `:slug`) correctly.
**Warning signs:** Code examples show literal `:municipality` instead of `{municipality}` or vice versa

### Pitfall 6: Generated MDX Files in Git
**What goes wrong:** Generated MDX files create noise in git diff and PR reviews
**Why it happens:** `generateFiles()` produces MDX files in `content/docs/api-reference/` which is inside the repo
**How to avoid:** Add `content/docs/api-reference/` to `.gitignore` since files are regenerated at build time. Keep only the `openapi.json` fallback committed.
**Warning signs:** Large diffs full of auto-generated MDX content

### Pitfall 7: fumadocs-openapi v10 Server/Client Split
**What goes wrong:** Build errors about using server-only imports in client components, or client-only imports in server components
**Why it happens:** v10 split options between `createOpenAPI` (server) and `defineClientConfig` (client). Mixing them causes RSC boundary violations.
**How to avoid:** Keep `lib/openapi.ts` server-only (imported by `components/api-page.tsx`). Keep `components/api-page.client.tsx` with `'use client'` directive. Never cross-import between them.
**Warning signs:** "Cannot import server-only module" or "use client" directive errors

## Code Examples

### Complete lib/openapi.ts
```typescript
// Source: fumadocs-openapi v10 docs + project-specific code sample templates
import { createOpenAPI } from 'fumadocs-openapi/server';

export const openapi = createOpenAPI({
  input: ['./openapi.json'],
  generateCodeSamples(endpoint) {
    const { method, path } = endpoint;
    const baseUrl = 'https://viewroyal.ai';
    const url = `${baseUrl}${path}`;

    return [
      {
        lang: 'bash',
        label: 'cURL',
        source: `curl -X ${method.toUpperCase()} '${url}' \\
  -H 'X-API-Key: YOUR_API_KEY'`,
      },
      {
        lang: 'js',
        label: 'JavaScript',
        source: `const res = await fetch('${url}', {
  headers: { 'X-API-Key': 'YOUR_API_KEY' }
});
const data = await res.json();
console.log(data);`,
      },
      {
        lang: 'python',
        label: 'Python',
        source: `import requests

response = requests.get(
    '${url}',
    headers={'X-API-Key': 'YOUR_API_KEY'}
)
data = response.json()
print(data)`,
      },
    ];
  },
});
```

### Complete components/api-page.tsx
```typescript
// Source: fumadocs-openapi v10 integration guide
import { openapi } from '@/lib/openapi';
import { createAPIPage } from 'fumadocs-openapi/ui';
import client from './api-page.client';

export const APIPage = createAPIPage(openapi, {
  client,
});
```

### Complete components/api-page.client.tsx
```typescript
// Source: fumadocs-openapi v10 integration guide
'use client';
import { defineClientConfig } from 'fumadocs-openapi/ui/client';

export default defineClientConfig({
  storageKeyPrefix: 'viewroyal-api',
});
```

### Generated MDX File Example (what generateFiles produces)
```mdx
---
title: List Meetings
description: Returns a paginated list of meetings with optional filters.
full: true
method: GET
route: /api/v1/{municipality}/meetings
---

<APIPage document="./openapi.json" operationId="listMeetings" />
```

### Complete tailwind.css Update
```css
@import 'tailwindcss';
@import 'fumadocs-ui/css/neutral.css';
@import 'fumadocs-ui/css/preset.css';
@import 'fumadocs-openapi/css/preset.css';
@source '../node_modules/fumadocs-ui/dist/**/*.js';
@source '../node_modules/fumadocs-openapi/dist/**/*.js';
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single createOpenAPI with all options | Split server (createOpenAPI) + client (defineClientConfig) | fumadocs-openapi v10 (Nov 2025) | Must create separate api-page.tsx and api-page.client.tsx files |
| `disablePlayground` boolean | `playground.enabled` option in defineClientConfig | fumadocs-openapi v10 (Nov 2025) | New option name; playground enabled by default |
| `renderer` and `fields` APIs | Removed; use `content` option in createAPIPage | fumadocs-openapi v10 (Nov 2025) | Simpler API surface for customization |
| meta.json auto-generated by generateFiles | Must create meta.json manually | fumadocs-openapi v9 (May 2025) | Extra step to create sidebar navigation files per tag folder |
| `name` option as string template | `name` option as function | fumadocs-openapi v9 (May 2025) | More flexible custom file naming |
| mediaAdapters/shikiOptions in createOpenAPI | Moved to defineClientConfig | fumadocs-openapi v10 (Nov 2025) | Client-side options separated from server config |

**Deprecated/outdated:**
- `disablePlayground`: Replaced by `playground.enabled` in defineClientConfig
- `renderer` API: Removed in v10; use `content` option instead
- `fields` API: Removed in v10; use client-side `playground.renderParameterField`
- Auto-generated `meta.json` from generateFiles: Removed in v9

## Open Questions

1. **Exact shape of the `endpoint` parameter in `generateCodeSamples`**
   - What we know: It includes `method`, `path`, and `parameters`. fumadocs-openapi docs show it but don't provide a full TypeScript type definition.
   - What's unclear: The exact property names and structure (e.g., is it `endpoint.method` or `endpoint.operation.method`? Are path parameters pre-resolved?)
   - Recommendation: During implementation, log the endpoint object to inspect its shape. Start with a simple template and refine based on actual data. LOW confidence on exact property names.

2. **Whether `generateFiles()` can be imported in a standalone script vs requiring Next.js context**
   - What we know: Documentation shows `generateFiles()` called from a script file. The import from `fumadocs-openapi` should be framework-agnostic.
   - What's unclear: Whether `createOpenAPI` (from `fumadocs-openapi/server`) has Next.js server dependencies that fail outside the Next.js build context.
   - Recommendation: Spike this early. If the imports fail in a standalone Node.js script, the generation can alternatively be wired as a `prebuild` step that Next.js runs as part of its build pipeline (e.g., in a custom plugin or via `next.config.mjs` webpack plugin). MEDIUM confidence -- most examples show standalone scripts.

3. **Static export compatibility of the playground interactive features**
   - What we know: The playground is a client-side React component. Static export produces HTML + JS. The JS should hydrate and enable interactivity. The API has `origin: *` CORS.
   - What's unclear: Whether all playground features (parameter input, request execution, response display) work when the page is statically exported rather than server-rendered. Documentation says APIPage "only works under RSC environments" but static export IS an RSC environment at build time.
   - Recommendation: This should work because static export pre-renders RSC at build time and the playground's interactive parts run client-side via hydration. Validate with a test build. MEDIUM confidence.

4. **chanfana OpenAPI spec completeness**
   - What we know: chanfana generates OpenAPI 3.1 from the Hono route definitions. Each `OpenAPIRoute` class has a `schema` property with request/response definitions.
   - What's unclear: Whether the generated spec includes full response schemas, parameter descriptions, and operation IDs that fumadocs needs for good docs.
   - Recommendation: Fetch the live spec and inspect it manually before generating docs. May need to enrich chanfana route schemas with more detailed descriptions or operation IDs. MEDIUM confidence.

## Sources

### Primary (HIGH confidence)
- [fumadocs-openapi integration guide](https://www.fumadocs.dev/docs/integrations/openapi) - Full setup flow, createOpenAPI, createAPIPage, generateFiles
- [fumadocs-openapi v10 blog post](https://www.fumadocs.dev/blog/openapi-v10) - Breaking changes, server/client split, migration
- [fumadocs-openapi v9 blog post](https://www.fumadocs.dev/blog/openapi-v9) - generateFiles groupBy/per options, meta.json removal
- [fumadocs-openapi npm](https://www.npmjs.com/package/fumadocs-openapi) - Latest version 10.3.7, published Feb 2026
- [Phase 19 Research](../../phases/19-infrastructure-scaffolding/19-RESEARCH.md) - Existing scaffold architecture, static export patterns
- Project codebase: `apps/web/app/api/index.ts` - chanfana OpenAPI configuration, all endpoints registered

### Secondary (MEDIUM confidence)
- [fumadocs OpenAPI configurations](https://fumadocs.dev/docs/ui/openapi/configurations) - generateCodeSamples, frontmatter, generateFiles options
- [fumadocs static export docs](https://www.fumadocs.dev/docs/deploying/static) - Static build requirements
- [fumadocs proxy docs](https://fumadocs.dev/docs/ui/openapi/proxy) - Proxy pattern (NOT needed for this project due to CORS `origin: *`)
- [GitHub issue #1131](https://github.com/fuma-nama/fumadocs/issues/1131) - Server URL handling in playground
- [DeepWiki fumadocs](https://deepwiki.com/fuma-nama/fumadocs) - Architecture overview, PlaygroundClient

### Tertiary (LOW confidence)
- `generateCodeSamples` endpoint parameter shape - Only documented via examples, no TypeScript interface found
- Static export + playground compatibility - No explicit documentation confirming this works; inferred from architecture

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - fumadocs-openapi v10.3.7 verified on npm, actively maintained, version confirmed Feb 2026
- Architecture: HIGH - generateFiles with static export is the documented approach; Phase 19 scaffold already configured correctly
- Pitfalls: HIGH - v9/v10 breaking changes well-documented in blog posts; CORS setup verified in codebase
- Code examples: MEDIUM - generateCodeSamples function signature verified but endpoint parameter shape not fully documented
- Playground in static export: MEDIUM - Should work based on architecture (RSC at build time + client hydration) but not explicitly confirmed

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (fumadocs-openapi actively maintained with frequent releases)
