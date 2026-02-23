# Project Research Summary

**Project:** ViewRoyal.ai v1.4 — Developer Documentation Portal
**Domain:** Static documentation site with auto-generated API reference (fumadocs + Next.js + Cloudflare)
**Researched:** 2026-02-23
**Confidence:** HIGH

## Executive Summary

This milestone adds a developer documentation portal at `docs.viewroyal.ai` for the ViewRoyal.ai civic data API. The research is unusually clear-cut: fumadocs is the right tool, static export is the right deployment model, and all the core technical decisions are backed by npm-verified peer dependencies and official documentation. The existing platform (React Router 7 on Cloudflare Workers) already handles the API — the docs site is a net-new, fully independent `apps/docs/` directory that consumes the existing OpenAPI 3.1 spec and builds ~33 documentation pages, roughly 25 of which are auto-generated from that spec.

The recommended approach is fumadocs v16 + Next.js 16 with `output: 'export'`, deployed as static assets on Cloudflare Workers via the `[assets]` `wrangler.toml` directive. The docs site has zero runtime requirements: all content is known at build time, search runs client-side via Orama, and the API playground runs client-side against the existing API. This means no OpenNext adapter, no Worker runtime complexity, no Node.js compatibility shims, and no billable Worker invocations for serving documentation pages.

The principal risks concentrate in scaffolding (Phase 1): fumadocs configuration has changed significantly across versions, stale tutorials cause cryptic errors, and the wrong deployment target (OpenNext/Workers runtime instead of static export) poisons everything downstream. The mitigation is simple — use the `create-fumadocs-app` CLI to scaffold, pin all fumadocs packages to matching versions, and validate the build locally before wiring any deployment. The one open technical question is the exact `generateFiles()` invocation for the OpenAPI integration with static export; both researchers agree it is the correct approach but the exact script setup needs to be confirmed at implementation time.

## Key Findings

### Recommended Stack

The docs site is a self-contained Next.js 16 application using fumadocs v16 for documentation infrastructure. fumadocs was chosen over alternatives (Nextra v4 beta, Docusaurus, Starlight/Astro, VitePress) because it has the best OpenAPI integration in the React ecosystem, is actively maintained, and stays within the existing TypeScript/React family. It must be Next.js (not React Router 7) because `fumadocs-openapi` requires React Server Components for API reference rendering, which React Router 7 does not support.

The `apps/docs/` directory is kept fully independent (its own `package.json`, `node_modules/`, `pnpm-workspace.yaml`) to avoid dependency conflicts with `apps/web/`'s React Router 7 + Vite 7 stack. This matches the existing monorepo pattern — no root workspace, no shared `node_modules`.

**Core technologies:**
- `next@^16.1.5`: Required by fumadocs-ui v16; verified via `npm view fumadocs-ui@16.6.5 peerDependencies` — hard constraint, not negotiable
- `fumadocs-core@^16.6.5` + `fumadocs-ui@^16.6.5`: Documentation engine and pre-built UI (sidebar, TOC, breadcrumbs, dark mode, responsive layout)
- `fumadocs-mdx@^14.2.8`: MDX compilation plugin; generates `.source/` build artifacts from `content/docs/`
- `fumadocs-openapi@^10.3.9`: Auto-generates API reference pages from the existing OpenAPI 3.1 spec; includes interactive playground, multi-language code samples, schema browser
- `shiki@^3.22.0`: Syntax highlighting; required peer dep of fumadocs-openapi; uses JS regex engine (not WASM) for Cloudflare compatibility
- `tailwindcss@^4.0.0`: Required by fumadocs-ui; configured CSS-first via `@import` directives, no `tailwind.config.js` needed
- `wrangler@^4.65.0`: Static asset deployment to Cloudflare Workers via `[assets]` directive pointing to the `./out/` directory

**Deployment decision (resolved):** Cloudflare Workers static assets — NOT Cloudflare Pages. The Architecture and Pitfalls researchers both recommended Cloudflare Pages, but the Stack researcher identified that Pages was deprecated in April 2025. Workers with the `[assets]` `wrangler.toml` directive is the current Cloudflare recommendation for static sites. This also eliminates routing ambiguity: `docs.viewroyal.ai` is simply a separate named Worker (`viewroyal-docs`) from the main `viewroyal-web` Worker, with no CNAME or Pages dashboard required.

**Next.js version decision (resolved):** Next.js 16 is correct. fumadocs-ui v16.6.x has a verified hard peer dependency on `next: 16.x.x` per npm registry. The Pitfalls researcher's suggestion to pin Next.js 15 (Pitfall 9) was motivated by OpenNext/Workers runtime concerns that are entirely irrelevant for a static export deployment. Since the docs site uses `output: 'export'` and no Worker runtime features, none of the Next.js 16 / OpenNext incompatibilities apply.

See `.planning/research/STACK.md` for the full version compatibility matrix, configuration file templates, and installation commands.

### Expected Features

API developer documentation portals have a well-understood hierarchy. The ~25 auto-generated API reference pages come for free from the existing OpenAPI spec. The real work is ~8-9 hand-written guide pages. Total estimated content: 33-34 pages.

**Must have (table stakes):**
- Auto-generated API reference from OpenAPI spec (TS-1) — without it the docs are useless; fumadocs-openapi generates these from the existing chanfana spec
- Getting Started / Quickstart guide (TS-2) — time-to-first-API-call is the key onboarding metric; the Twilio "5-minute quickstart" pattern is now universal
- Authentication guide (TS-3) — first hurdle every developer hits; covers X-API-Key header, rate limits, error shapes
- Code examples in curl, JavaScript, Python (TS-4) — most-used section of any API docs; fumadocs Tabs with `persist` for language selection
- Full-text search via Orama (TS-5) — built-in to fumadocs; client-side, no external service, zero configuration for ~100 pages
- Navigation sidebar (TS-6) — auto-generated from content directory structure by fumadocs
- Responsive design (TS-7) — automatic from fumadocs-ui; no work needed

**Should have (differentiators):**
- Interactive API playground / "Try It" (D-1) — included in fumadocs-openapi at no extra cost; more polished than the existing Swagger UI
- Data model documentation with Mermaid ER diagram (D-2) — explains domain concepts (Matter vs Motion vs Bylaw) the spec alone cannot convey
- Pagination and filtering guide (D-3) — documents the two pagination systems (cursor-based v1, page-based OCD) with full working examples
- Error handling guide (D-5) — all error codes with retry logic examples; reduces support burden
- OCD Standard reference (D-7) — explains the Open Civic Data endpoints and when to use v1 vs OCD API
- Changelog (D-4) — simple MDX page; establishes the pattern for future API evolution communication

**Defer (v2+):**
- Auto-generated client SDKs (AF-1) — maintenance burden; developers can generate from the spec themselves with openapi-generator
- Versioned documentation (AF-2) — only one API version exists; add when v2 ships
- Personalized docs with API key pre-population (AF-3) — requires auth integration between docs and main app; significant complexity for limited benefit
- AI-powered search (AF-5) — Orama is sufficient for <100 pages; revisit if docs grow substantially
- Blog/tutorials (AF-8) — belongs on the main site, not developer docs

See `.planning/research/FEATURES.md` for the full feature dependency graph and build order implications.

### Architecture Approach

The docs site sits alongside existing apps as a fully independent deployment. The key architectural decision is OpenAPI spec synchronization: chanfana generates the spec dynamically at runtime, so the docs build uses a `prebuild` script that fetches the live spec from `viewroyal.ai/api/v1/openapi.json` and saves it locally as `openapi.json` (committed to git as a fallback). `generateFiles()` then converts that JSON into MDX files before `next build` runs. This build-time fetch + checked-in fallback pattern ensures docs builds never fail due to network issues, and the committed spec serves as a diff-able record of API changes.

**Major components:**
1. `apps/docs/` — Self-contained Next.js 16 app deployed to Cloudflare Workers static assets at `docs.viewroyal.ai`
2. `apps/docs/scripts/fetch-openapi.mjs` — Pre-build script; fetches live OpenAPI spec; falls back to committed `openapi.json` if unreachable
3. `content/docs/` — Hand-written MDX guides (~8-9 pages: getting started, auth, pagination, data model, error handling, OCD, changelog, contributing)
4. Generated API reference MDX — Created at build time by `generateFiles()` from the OpenAPI spec; gitignored, never committed
5. `lib/source.ts` + `lib/openapi.ts` — fumadocs loader configuration that builds the sidebar page tree from both hand-written and generated content

**OpenAPI approach flag (needs implementation validation):** Both researchers agree `generateFiles()` is required for static export — virtual files (`openapiSource()`) require an RSC server that doesn't exist in a static export. The Stack researcher notes APIPage renders at build time via `generateStaticParams`, which is consistent with `generateFiles()` output. However, the exact script invocation, whether `generateFiles()` auto-generates `meta.json` for the API reference sidebar section, and whether generated MDX files should be gitignored all need to be confirmed against the actual fumadocs CLI output during Phase 2.

See `.planning/research/ARCHITECTURE.md` for the full directory structure, configuration file content, deployment pipeline, and build order dependencies.

### Critical Pitfalls

1. **Deploying via OpenNext/Workers runtime instead of static export** (Critical) — Use `output: 'export'` in `next.config.mjs` and Cloudflare Workers static assets from day one. OpenNext adds complexity (3 MiB worker size limits, Node.js compat shims, cold starts, FinalizationRegistry errors) that is unnecessary for a static docs site. Wrong deployment target must be caught in Phase 1 — it poisons everything else.

2. **OpenAPI spec not available at build time** (Critical) — The spec is generated dynamically by chanfana at runtime, not a static file. Add a `prebuild` script that fetches it and saves to `openapi.json`. Commit that file as a fallback. Use `generateFiles()` (not `openapiSource()`) since static export has no RSC server. Address in Phase 1 (script) and Phase 2 (integration).

3. **Introducing pnpm workspaces and breaking existing apps** (Critical) — Do NOT create a root `pnpm-workspace.yaml`. Keep `apps/docs/` fully independent. Cloudflare's build system installs all workspace packages when building any single app (workers-sdk issue #10941), which breaks existing `apps/web/` deployments. Lock this in Phase 1 scaffolding.

4. **Stale fumadocs configuration from outdated tutorials** (Critical) — Use `npx create-fumadocs-app` to scaffold; do not manually configure. Pin all fumadocs packages to matching versions. Configuration API changed significantly between v15 and v16 (`source.config.ts` replaced earlier patterns, import paths changed, `mdx-components.tsx` is no longer the component registration mechanism). Address in Phase 1.

5. **Static export breaks default fumadocs search** (Moderate) — Default search uses server-side route handlers. For static export, client-side Orama search must be explicitly configured during setup. It appears to work in `next dev` but silently fails in production static builds. Configure and verify in Phase 1.

6. **Generated MDX files going stale** (Moderate) — Do not commit generated API reference MDX to git. Add the generated directory to `.gitignore`. Run `generateFiles()` as part of `prebuild` so it regenerates automatically on every build. Address in Phase 2.

See `.planning/research/PITFALLS.md` for 14 documented pitfalls with phase-specific warnings, error messages, and Cloudflare issue numbers.

## Implications for Roadmap

The FEATURES.md MVP recommendation maps cleanly to four phases with a clear dependency order. The framework must exist before content can be created; the API reference must be generated before guides that cross-reference specific endpoints can be written.

### Phase 1: Framework Scaffolding and Deployment

**Rationale:** Every subsequent phase depends on this. The wrong deployment target (OpenNext vs static export) or wrong scaffolding (manual config vs CLI) is expensive to fix later. This phase locks the architectural decisions that research flagged as highest-risk.
**Delivers:** Working fumadocs site deployed at `docs.viewroyal.ai` with navigation, dark mode, search, and responsive layout — no content yet, but the full build and deploy pipeline is validated
**Addresses:** TS-5 (search), TS-6 (navigation), TS-7 (responsive design) — all automatic from fumadocs scaffolding
**Avoids:** Pitfalls 1 (OpenNext), 3 (pnpm workspaces), 4 (stale config), 5 (Tailwind conflicts)
**Key tasks:** `create-fumadocs-app` scaffold, `wrangler.toml` with `[assets]` directive pointing to `./out/`, `output: 'export'` in `next.config.mjs`, prebuild spec fetch script, independent `pnpm-workspace.yaml`, client-side Orama search configuration

### Phase 2: OpenAPI Integration and API Reference

**Rationale:** The OpenAPI spec integration is the highest-complexity technical task. It must come before content guides because guides link to specific endpoints. Getting `generateFiles()` working correctly validates the entire build pipeline and delivers ~25 pages automatically.
**Delivers:** Complete auto-generated API reference at `docs.viewroyal.ai/api-reference/` with interactive playground and multi-language code examples; covers all API endpoints grouped by tag (Meetings, People, Matters, Motions, Bylaws, Search, OCD, System)
**Addresses:** TS-1 (API reference), D-1 (interactive playground)
**Uses:** `fumadocs-openapi@^10.3.9`, `shiki@^3.22.0`, prebuild fetch script from Phase 1
**Avoids:** Pitfalls 2 (spec sync), 7 (stale generated files), 12 (wrong server URLs in playground), 14 (missing fumadocs-openapi CSS preset)
**Key tasks:** `generateFiles()` integration in prebuild, spec `servers` array validation, `fumadocs-openapi/css/preset.css` CSS import, meta.json for API reference sidebar section, CORS verification for playground requests

### Phase 3: Core Developer Guides

**Rationale:** The guides depend on the API reference existing so cross-links to specific endpoints are valid. This is the editorial phase — content, not infrastructure. Time-to-first-API-call reduction is the primary metric.
**Delivers:** Complete developer onboarding path: getting started quickstart, authentication guide, code examples in curl/JS/Python with persistent language selection
**Addresses:** TS-2 (getting started), TS-3 (authentication), TS-4 (code examples)
**Avoids:** Pitfall 10 (missing `meta.json` breaks sidebar — plan the full content directory structure before writing any pages)
**Key tasks:** Quickstart guide with curl/JS/Python examples, auth guide with error shape documentation, fumadocs Tabs with `groupId` + `persist` for language selection, cross-links to `/developers` API key management page

### Phase 4: Reference Content and Production Deployment

**Rationale:** Reference content guides are independent of each other and lower priority than the core onboarding path. Deployment setup completes the milestone and validates all prior phases end-to-end.
**Delivers:** Data model docs with Mermaid ER diagram, pagination guide, error handling guide with error code index, OCD standard reference, changelog, contribution guide, production deployment at `docs.viewroyal.ai` with custom domain
**Addresses:** D-2, D-3, D-5, D-7, D-4, D-6
**Avoids:** Pitfall 8 (DNS routing conflict — verify existing Worker route pattern `viewroyal.ai/*` does not wildcard subdomains before pointing custom domain), Pitfall 11 (unoptimized images — use SVG for all diagrams), Pitfall 13 (wrong build output directory — Cloudflare Workers `[assets] directory` must be `./out`)
**Key tasks:** Mermaid ER diagram for entities, error code index (NOT_FOUND, UNAUTHORIZED, RATE_LIMITED, etc.), OCD entity mapping table, wrangler deployment with `docs.viewroyal.ai` custom domain, cross-links from main app footer and `/developers` page to docs

### Phase Ordering Rationale

- Phase 1 must be first — the deployment target and scaffolding decisions are the most dangerous pitfalls; wrong choices here affect every subsequent phase
- Phase 2 must precede Phase 3 — guides cross-reference specific API endpoints; having the reference generated first ensures links are valid and developers can verify
- Phase 3 must precede Phase 4 — getting started and authentication guides are higher priority than reference content; most developers will hit quickstart before data model docs
- Phase 4 is naturally last — production deployment validates all prior phases; reference content is independent and lower priority than the core onboarding path

### Research Flags

Phases needing deeper research during planning:

- **Phase 2 (OpenAPI integration):** The `generateFiles()` exact invocation, whether generated MDX files should be gitignored, and how `meta.json` is handled for the API reference sidebar section are not fully resolved in the research. Recommend running a spike (`npx create-fumadocs-app --openapi`) and examining the generated scaffold before planning Phase 2 tasks in detail.

Phases with standard well-documented patterns (skip `/gsd:research-phase`):

- **Phase 1 (Scaffolding):** `create-fumadocs-app` produces a working scaffold. Static export + Cloudflare Workers static assets is thoroughly documented by both Cloudflare and fumadocs.
- **Phase 3 (Guides):** Pure editorial content with fumadocs MDX components. Tabs, code blocks, copy buttons, and heading anchors are all built-in fumadocs-ui features with clear documentation.
- **Phase 4 (Reference content and deployment):** Mermaid in MDX, wrangler deployment with static assets, and custom domain setup are all standard patterns with official documentation.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions npm-verified on 2026-02-23. Peer dependency chain confirmed. Next.js 16 requirement is a hard constraint from fumadocs-ui peer deps, not a suggestion. Deployment target (Workers static assets) is documented by Cloudflare. |
| Features | HIGH | Well-established API documentation patterns from Stripe, Twilio, Supabase, and OpenAI. Feature tier classifications are grounded in industry consensus and explicit "why expected" rationale per feature. |
| Architecture | HIGH | Core pattern (static export + independent app) is definitively correct. The one open question (`generateFiles()` exact invocation) is a well-scoped implementation detail, not an architectural uncertainty. |
| Pitfalls | HIGH | 14 pitfalls documented with specific error messages, Cloudflare issue numbers (workers-sdk #10941), and fumadocs GitHub issues (#1875, #2456). Most are based on official docs confirming behaviors, not inference. |

**Overall confidence:** HIGH

### Gaps to Address

- **`generateFiles()` exact integration:** Both researchers agree this is the right mechanism for static export. The exact script invocation, whether `generateFiles()` also generates `meta.json` for the API sidebar, and whether generated MDX files should be committed or gitignored need to be confirmed by running `create-fumadocs-app --openapi` and reading the generated output. Address as a spike at the start of Phase 2.

- **Interactive playground CORS:** The playground makes client-side requests from `docs.viewroyal.ai` to `viewroyal.ai/api/v1/*`. FEATURES.md notes the API already allows `*` origin. Verify this is still true by checking the chanfana/Hono CORS middleware configuration in `apps/web/app/api/` before completing Phase 2.

- **Cloudflare Pages deprecation date:** The Stack researcher cites April 2025 deprecation from community posts but no official Cloudflare deprecation announcement was found. Workers static assets is clearly the recommended direction regardless — Cloudflare has invested heavily in the `[assets]` directive documentation. If Pages still works at implementation time, it is also acceptable, but Workers static assets is the safer, future-proof choice.

- **Node.js 25 fumadocs compatibility:** The system runs Node.js v25.3.0. fumadocs GitHub issue #2456 documents potential Node.js 25 compatibility issues. If `create-fumadocs-app` scaffold fails with Node 25, switch to Node 22 LTS for the docs build environment only.

## Sources

### Primary (HIGH confidence — official docs, npm registry)
- [fumadocs.dev OpenAPI integration](https://www.fumadocs.dev/docs/integrations/openapi) — generateFiles(), APIPage, playground configuration
- [fumadocs.dev static build guide](https://www.fumadocs.dev/docs/deploying/static) — output: 'export', client-side search configuration
- [fumadocs.dev v16 blog post](https://www.fumadocs.dev/blog/v16) — Next.js 16 requirement, breaking changes, Cloudflare JS engine default
- [npm: fumadocs-ui@16.6.5](https://www.npmjs.com/package/fumadocs-ui) — peer deps: `next: 16.x.x`, `react >= 19.2.0` (npm-verified)
- [npm: fumadocs-openapi@10.3.9](https://www.npmjs.com/package/fumadocs-openapi) — peer deps: fumadocs-core/ui >= 16.5 (npm-verified)
- [npm: next@16.1.6](https://www.npmjs.com/package/next) — engine requirements: node >= 20.9.0 (npm-verified)
- [Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/) — `[assets]` wrangler.toml config, not_found_handling, html_handling
- [Cloudflare workers-sdk issue #10941](https://github.com/cloudflare/workers-sdk/issues/10941) — pnpm monorepo installs all workspaces (confirmed blocker)
- [fumadocs GitHub issue #1875](https://github.com/fuma-nama/fumadocs/issues/1875) — version mismatch type errors when packages are mismatched

### Secondary (MEDIUM confidence — multiple sources agree)
- [fumadocs GitHub issue #2456](https://github.com/fuma-nama/fumadocs/issues/2456) — Node.js 25 compatibility concerns
- [fumadocs static search / Orama](https://www.fumadocs.dev/docs/headless/search/orama) — client-side search configuration for static mode
- [Deploy Next.js + fumadocs to GitHub Pages](https://zephinax.com/blog/deploy-nextjs-fumadocs-github-pages) — static export workflow validation (confirms trailingSlash, images.unoptimized)
- [OpenNext troubleshooting](https://opennext.js.org/cloudflare/troubleshooting) — worker size limits, FinalizationRegistry errors, Next.js 16 instrumentation hook issues
- [Stripe API docs patterns](https://apidog.com/blog/stripe-docs/) — three-panel layout, persistent language selection, copy buttons

### Tertiary (LOW confidence — single source or inference)
- Cloudflare Pages deprecation date (April 2025) — referenced in community posts, no official Cloudflare deprecation announcement found; Workers static assets is the replacement regardless
- Static search performance with OpenAPI-generated pages — untested at scale with API reference content (estimated fine for <100 pages)

---
*Research completed: 2026-02-23*
*Ready for roadmap: yes*
