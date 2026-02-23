# Domain Pitfalls: v1.4 Developer Documentation Portal

**Domain:** Adding fumadocs/Next.js documentation site to existing Cloudflare-deployed monorepo
**Researched:** 2026-02-23

---

## Critical Pitfalls

Mistakes that cause rewrites, deployment failures, or major integration breakage.

---

### Pitfall 1: Deploying fumadocs via OpenNext/Workers Instead of Static Export

**What goes wrong:** Attempting to run fumadocs as a server-rendered Next.js app on Cloudflare Workers via `@opennextjs/cloudflare`. This introduces massive complexity (worker size limits, Edge runtime incompatibility, Node.js compatibility shims, I/O context errors) for what is fundamentally a static content site. Fumadocs official docs explicitly state: "Use https://opennext.js.org/cloudflare, Fumadocs doesn't work on Edge runtime." This warning steers people toward OpenNext, but the far better path for a docs site is static export entirely.

**Why it happens:** The existing web app deploys to Cloudflare Workers, so the natural instinct is to deploy the docs site the same way. OpenNext's marketing makes it seem straightforward. But a documentation site has zero dynamic server requirements -- all content is known at build time.

**Consequences:**
- Worker compressed size limit: 3 MiB (free) / 10 MiB (paid). Next.js + fumadocs + shiki syntax highlighter can easily exceed 3 MiB compressed.
- `@opennextjs/cloudflare` drops Edge runtime support -- must use Node.js runtime with `nodejs_compat` flag and compatibility date >= 2024-09-23.
- Runtime I/O context errors ("Cannot perform I/O on behalf of a different request") if any module-level state persists across requests.
- FinalizationRegistry errors require compatibility_date >= 2025-05-05.
- Cold starts on every request for a docs site that should be instant.
- Next.js 16 has known OpenNext instrumentation hook errors; workaround is downgrading to 15.3.

**Prevention:** Deploy fumadocs as a static site (`output: 'export'` in next.config.mjs) to Cloudflare Pages. A documentation site is 100% static content. Cloudflare Pages serves static assets from their CDN with zero cold starts, no worker size limits, and free unlimited bandwidth. Assign `docs.viewroyal.ai` as a custom domain on the Pages project.

**Detection:** Worker deployment fails with size errors, or succeeds but has 200-500ms cold starts on doc pages that should be instant.

**Phase:** Address in Phase 1 (project setup). Wrong deployment target poisons every subsequent phase.

**Confidence:** HIGH -- fumadocs official docs confirm static export support and note "doesn't work on Edge runtime"; Cloudflare Pages is the standard static hosting platform.

**Sources:**
- [fumadocs Deployment Docs](https://www.fumadocs.dev/docs/deploying) -- "Use https://opennext.js.org/cloudflare, Fumadocs doesn't work on Edge runtime"
- [fumadocs Static Build Guide](https://www.fumadocs.dev/docs/deploying/static)
- [OpenNext Cloudflare Troubleshooting](https://opennext.js.org/cloudflare/troubleshooting) -- worker size limits, FinalizationRegistry errors
- [Cloudflare Pages Static Next.js](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/)

---

### Pitfall 2: OpenAPI Spec Synchronization -- Runtime vs Build-Time Mismatch

**What goes wrong:** The existing API generates its OpenAPI 3.1 spec at runtime via chanfana (Hono middleware) at `/api/v1/openapi.json`. It is NOT a static file -- chanfana builds it dynamically from Zod schemas registered in `apps/web/app/api/index.ts`. fumadocs-openapi needs to consume this spec to generate API reference pages, but the spec only exists when the Worker is running.

**Why it happens:** fumadocs-openapi offers two approaches: `generateFiles()` (build-time MDX generation from a spec file) and `openapiSource()` (runtime server-side generation via RSC). Both expect a spec file or URL. But if you point `generateFiles()` at the production URL, the docs build depends on the production API being up and having the latest spec. If you point it at a local file, the file goes stale whenever API endpoints change. And `openapiSource()` requires a running Next.js server with RSC context, which contradicts static export (`output: 'export'`).

**Consequences:**
- API reference pages show outdated endpoints, missing parameters, or wrong response schemas.
- Build failures when production API is unreachable during docs CI build.
- Circular dependency: API changes deploy first, then docs must rebuild, creating a window where docs are wrong.
- Using `openapiSource()` forces server-side rendering, which contradicts the static export strategy from Pitfall 1.

**Prevention:**
1. Add a spec extraction script to `apps/docs/scripts/` that programmatically generates the OpenAPI JSON without starting the full Worker. chanfana's `fromHono()` builds the spec in-memory -- the registry can be imported and serialized to JSON in a Node.js script.
2. Simpler alternative: run `wrangler dev` for the web app, `curl http://localhost:8787/api/v1/openapi.json > apps/docs/content/openapi.json`, then kill wrangler. Wire this as a `prebuild` script.
3. Use `generateFiles()` (NOT `openapiSource()`) since static export cannot use RSC server-side APIs at runtime.
4. Commit the spec JSON file to version control. Treat it as a build artifact that gets regenerated when API endpoints change.
5. Add a CI step that regenerates and diffs -- warn if the committed spec is stale.

**Detection:** API reference pages don't match actual API behavior. New endpoints missing from docs after API deployment.

**Phase:** Address in Phase 1 (spec extraction script) and Phase 2 (OpenAPI integration). This is foundational -- get it wrong and every API reference page is unreliable.

**Confidence:** HIGH -- verified that chanfana generates spec at runtime from `apps/web/app/api/index.ts`; fumadocs-openapi docs confirm the two approaches and their tradeoffs.

**Sources:**
- [fumadocs OpenAPI Integration](https://www.fumadocs.dev/docs/integrations/openapi)
- [fumadocs OpenAPI generateFiles()](https://fumadocs.dev/docs/ui/openapi/generate-files)
- [fumadocs OpenAPI v10 Blog](https://www.fumadocs.dev/blog/openapi-v10) -- comparison of approaches

---

### Pitfall 3: Breaking Existing Apps by Introducing pnpm Workspaces

**What goes wrong:** The current repo has `apps/web/`, `apps/pipeline/`, and `apps/vimeo-proxy/` as fully independent apps. There is NO root `package.json` and NO `pnpm-workspace.yaml`. Each app has its own `node_modules` and lockfile. Adding `pnpm-workspace.yaml` to enable shared packages would fundamentally change how dependencies are resolved for ALL existing apps, breaking their builds.

**Why it happens:** Sharing the OpenAPI spec or a Tailwind config between `apps/web/` and `apps/docs/` seems like it needs workspaces. The "proper monorepo" instinct leads to adding workspace configuration. But Cloudflare's build system installs ALL workspace packages even when building a single app (workers-sdk issue #10941), causing builds to fail when unrelated workspaces have incompatible dependencies. Adding workspaces retroactively also changes pnpm's hoisting behavior, which can break existing `pnpm install` for `apps/web/` and `apps/vimeo-proxy/`.

**Consequences:**
- `pnpm install` in `apps/web/` starts resolving packages from other workspaces, finding conflicting versions.
- Cloudflare Workers build for `apps/web/` fails because pnpm tries to install `apps/docs/`'s Next.js dependencies.
- Build cache invalidation -- pnpm monorepo build cache on Cloudflare is broken for pnpm workspaces (community report).
- The Python pipeline in `apps/pipeline/` is unaffected (uses `uv`, not pnpm), but the Node apps are not isolated anymore.

**Prevention:**
1. Keep `apps/docs/` as a fully independent app with its own `package.json`, `pnpm-lock.yaml`, and deployment pipeline. Do NOT introduce pnpm workspaces.
2. Share the OpenAPI spec via a simple file copy in a build script, not via workspace package imports.
3. Deploy `apps/docs/` to Cloudflare Pages as a separate project from the Workers deployment of `apps/web/`.
4. If workspaces become necessary later, that is a separate refactoring milestone with full testing of all existing deployment pipelines.

**Detection:** `pnpm install` in one app directory starts pulling dependencies from other apps. Build times spike. Cloudflare Workers build fails with module resolution errors.

**Phase:** Address in Phase 1 (project scaffolding). This decision must be locked before any code is written.

**Confidence:** HIGH -- verified repo has no root package.json or workspace config; Cloudflare monorepo issues documented in workers-sdk issue #10941 and community forum reports.

**Sources:**
- [Cloudflare workers-sdk Issue #10941](https://github.com/cloudflare/workers-sdk/issues/10941) -- pnpm monorepo installs all workspaces
- [Cloudflare Workers Build Cache + pnpm issues](https://community.cloudflare.com/t/workers-build-cache-not-working-as-expected-in-monorepos-pnpm/803213)
- [Cloudflare Pages Monorepo Docs](https://developers.cloudflare.com/pages/configuration/monorepos/)

---

### Pitfall 4: fumadocs-mdx ESM-Only Requirement and Configuration Churn

**What goes wrong:** fumadocs-mdx is ESM-only. It requires `next.config.mjs` (not `.js` or `.ts` with CommonJS). The configuration API has changed significantly across recent versions: `source.config.ts` replaced earlier patterns, the import path changed from `fumadocs-mdx/config` to `fumadocs-mdx/next`, and `mdx-components.tsx` is no longer used -- MDX components must be passed via the `components` prop explicitly. Blog posts and tutorials from even 6 months ago show outdated patterns.

**Why it happens:** fumadocs has evolved rapidly. The project releases frequently (MDX v10, v14; fumadocs v15, v16). Each major version changes configuration patterns. Developers following tutorials or AI-generated code get stale patterns that produce cryptic errors.

**Consequences:**
- Build errors: "Cannot use require() in ES module" if using `.js` config.
- Runtime errors: "Unexpected FunctionDeclaration in code: only import/exports are supported" if MDX config is wrong.
- Type errors: `tree={source.pageTree}` type mismatches if fumadocs-core version doesn't match fumadocs-mdx version.
- The `.source` directory must be auto-generated during `next dev` or `next build` -- if missing, pages fail silently.
- TypeScript path alias `"fumadocs-mdx:collections/*": [".source/*"]` must be in `tsconfig.json` or imports break.
- Collections are defined in `source.config.ts`, not in the Next.js config -- putting them in the wrong file produces no error but no content.

**Prevention:**
- Use the official fumadocs CLI (`npx create-fumadocs-app`) to scaffold. This generates correct config for the current version. Do NOT manually set up the project.
- Pin ALL fumadocs packages to the exact same version: fumadocs-core, fumadocs-mdx, fumadocs-ui, fumadocs-openapi. Mixed versions cause type mismatches (GitHub issue #1875).
- Add `.source/` to `.gitignore` -- it is a build artifact regenerated on every build.
- Verify the build works locally (`pnpm build`) before setting up any CI/CD.

**Detection:** Build fails immediately with import errors or type errors. Easy to catch early if you build before deploying.

**Phase:** Address in Phase 1 (scaffolding). Use the CLI, do not manually configure.

**Confidence:** HIGH -- verified from fumadocs official docs, MDX v10 blog post, and GitHub issues (#1875, #2456).

**Sources:**
- [fumadocs MDX Getting Started](https://www.fumadocs.dev/docs/mdx)
- [fumadocs MDX Next.js Setup](https://www.fumadocs.dev/docs/mdx/next) -- ESM requirement, source.config.ts
- [fumadocs MDX v10 Summary](https://www.fumadocs.dev/blog/mdx-v10-summary) -- configuration changes
- [fumadocs GitHub Issue #1875](https://github.com/fuma-nama/fumadocs/issues/1875) -- version mismatch type errors

---

## Moderate Pitfalls

---

### Pitfall 5: Tailwind CSS 4 Configuration Collision Between Apps

**What goes wrong:** The existing web app uses Tailwind CSS 4 with `@tailwindcss/vite`, `tw-animate-css`, and shadcn/ui presets. fumadocs v15+ also uses Tailwind CSS 4 but with its own CSS presets (`fumadocs-ui/css/neutral.css`, `fumadocs-ui/css/preset.css`). Copying Tailwind configuration from the existing web app into the docs app causes style conflicts because both use different Tailwind plugin configurations and different CSS variable naming conventions.

**Why it happens:** Both apps use Tailwind 4 but configure it differently. The web app has custom theme colors, shadcn/ui component styles, and animation utilities. fumadocs has its own design system built on Tailwind that must not be mixed. Since fumadocs v15, it no longer uses `--fd-<color>` CSS variables -- it directly defines colors in `@theme` using `hsl()`.

**Prevention:**
- Do NOT copy the web app's Tailwind configuration to the docs app. Start fresh.
- Follow the fumadocs v15 migration guide exactly for CSS setup.
- Required CSS imports in the docs app's global stylesheet:
  ```css
  @import 'tailwindcss';
  @import 'fumadocs-ui/css/neutral.css';
  @import 'fumadocs-ui/css/preset.css';
  @source '../node_modules/fumadocs-ui/dist/**/*.js';
  ```
- Do NOT use fumadocs-ui's pre-built `style.css` alongside custom Tailwind -- they conflict.
- The docs app's Tailwind config is completely independent from the web app's. No sharing.

**Phase:** Address in Phase 1 (scaffolding, theme setup).

**Confidence:** HIGH -- fumadocs v15 blog post documents the Tailwind 4 migration explicitly.

**Sources:**
- [fumadocs v15 Blog Post](https://www.fumadocs.dev/blog/v15) -- Tailwind CSS 4 support details

---

### Pitfall 6: Static Export Breaks Default fumadocs Search

**What goes wrong:** fumadocs defaults to a "server-first approach which always requires a running server." When using `output: 'export'` for static deployment, the built-in search functionality requires explicit reconfiguration for client-side operation. Without this, search appears to work in `next dev` but returns nothing or errors in the production static build.

**Why it happens:** Default fumadocs search uses server-side route handlers or React Server Components. Static export has no server -- route handlers cannot execute.

**Consequences:** Search field renders but silently fails in production. Users type queries and get nothing. The developer thinks search is broken and wastes hours debugging.

**Prevention:**
1. During initial setup, configure fumadocs Search Server for static export mode -- this generates a search index at build time.
2. Configure Search UI/Client for static mode (client-side index).
3. After setup, search indexes are stored statically and computed client-side in the browser.
4. Alternative: use Orama Cloud or Algolia which use remote servers and work without configuration changes.
5. For a developer docs site with fewer than 100 pages, client-side search (built-in Orama) is more than sufficient.

**Phase:** Address in Phase 1 (static export configuration) or Phase 3 (polish/search).

**Confidence:** MEDIUM -- fumadocs static build docs confirm the requirement exists but exact configuration steps should be verified against the current version at build time.

**Sources:**
- [fumadocs Static Build Guide](https://www.fumadocs.dev/docs/deploying/static) -- search configuration for static mode

---

### Pitfall 7: `generateFiles()` Output Goes Stale as API Evolves

**What goes wrong:** Using fumadocs-openapi's `generateFiles()` to produce MDX files from the OpenAPI spec creates files like `content/docs/api/list-meetings.mdx`. These files get committed to git. When the API changes (new endpoint, renamed parameter, changed response schema), the generated MDX files remain unchanged until someone manually reruns the generation script. Documentation silently drifts from the actual API.

**Why it happens:** There is no automatic mechanism to detect API spec changes and regenerate docs. The generation script is manual. Developers update the API, deploy, and forget to regenerate docs.

**Consequences:** API reference documentation shows outdated information. Users encounter endpoints that behave differently than documented. Trust in documentation erodes, and the docs site becomes counterproductive.

**Prevention:**
1. Add the generation script to the docs app's `prebuild` npm script so it runs automatically before every build.
2. Do NOT commit generated MDX files to git. Add the generated API reference directory to `.gitignore`. Only commit the source OpenAPI spec JSON.
3. The build pipeline should: (a) copy/fetch the latest spec, (b) run `generateFiles()`, (c) run `next build`.
4. For local dev, run the generation as part of the `dev` script.
5. Optionally add a CI check that regenerates and diffs, failing if the spec is stale relative to the source of truth.

**Phase:** Address in Phase 2 (OpenAPI integration).

**Confidence:** HIGH -- this is a universal documentation drift problem.

**Sources:**
- [fumadocs generateFiles()](https://fumadocs.dev/docs/ui/openapi/generate-files)

---

### Pitfall 8: Cloudflare DNS Routing Conflict Between Workers and Pages

**What goes wrong:** Setting up `docs.viewroyal.ai` as a custom domain on a Cloudflare Pages project requires a CNAME record. The existing web app's `wrangler.toml` has `routes = [{ pattern = "viewroyal.ai/*", zone_name = "viewroyal.ai" }]`. If the route pattern were broadened to a wildcard subdomain pattern (e.g., `*.viewroyal.ai/*`), it would intercept requests to `docs.viewroyal.ai` and route them to the main Worker instead of the Pages project.

**Why it happens:** Route pattern editing or copy-paste errors. The current pattern `viewroyal.ai/*` correctly matches only the apex domain, but during a Cloudflare dashboard session, it could accidentally be changed. Additionally, Cloudflare requires DNS records to exist before a custom domain is active -- forgetting the CNAME results in `ERR_NAME_NOT_RESOLVED`.

**Consequences:** Requests to `docs.viewroyal.ai` serve the main web app or return a 404. The docs site is unreachable but the main site works fine, making the issue confusing to diagnose.

**Prevention:**
1. Verify the existing Worker route pattern does NOT include a wildcard subdomain before adding the Pages custom domain.
2. Add CNAME record: `docs` -> `<pages-project>.pages.dev`.
3. Use Cloudflare Pages custom domain configuration (not Worker routes) for the docs subdomain.
4. Test subdomain resolution independently: `curl -I https://docs.viewroyal.ai` before and after Pages setup.
5. The current route `viewroyal.ai/*` is correct as-is. Do not modify it.

**Phase:** Address in the deployment phase (final phase).

**Confidence:** HIGH -- existing wrangler.toml verified; Cloudflare routing precedence well-documented.

**Sources:**
- [Cloudflare Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [Cloudflare Pages Custom Domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)

---

### Pitfall 9: Next.js Version Incompatibility Chain

**What goes wrong:** Next.js, fumadocs, and (if used) OpenNext all evolve independently with tight coupling. Next.js 16 has known issues with `@opennextjs/cloudflare` (instrumentation hook loading error). fumadocs packages are tightly coupled to specific Next.js versions. Even for static export, a Next.js minor version bump can break fumadocs-mdx's build plugin.

**Why it happens:** fumadocs-mdx hooks deeply into Next.js's build pipeline via `createMDX()`. Each fumadocs release targets specific Next.js versions. Using `^` ranges in package.json allows silent upgrades that break the build.

**Prevention:**
- Use Next.js 15.x LTS for the docs site. It is stable, well-tested with fumadocs, and avoids Next.js 16 edge cases.
- Pin the exact Next.js version in `package.json` (e.g., `"next": "15.3.2"`, not `"^15.3.2"`). Next.js minor/patch versions can introduce changes that break fumadocs.
- Check fumadocs release notes for supported Next.js versions before upgrading either.
- Use `pnpm --frozen-lockfile` in CI to prevent version drift.
- Node.js version matters too: fumadocs has reported issues with Node.js 25 (#2456). Use Node.js 22 LTS.

**Phase:** Address in Phase 1 (scaffolding, dependency decisions).

**Confidence:** MEDIUM -- Next.js 16 issues documented in OpenNext troubleshooting; fumadocs #2456 documents Node.js version sensitivity. Exact compatibility matrix needs verification at scaffold time.

**Sources:**
- [OpenNext Cloudflare Troubleshooting](https://opennext.js.org/cloudflare/troubleshooting) -- Next.js 16 issues
- [fumadocs GitHub Issue #2456](https://github.com/fuma-nama/fumadocs/issues/2456) -- Node.js 25 compatibility

---

## Minor Pitfalls

---

### Pitfall 10: Content Directory Missing meta.json Breaks Sidebar

**What goes wrong:** fumadocs uses `meta.json` files in each content directory to control sidebar ordering and page titles. When mixing hand-written MDX guides with auto-generated OpenAPI reference pages, every directory and subdirectory needs its own `meta.json`. Missing `meta.json` in any directory causes pages to appear in alphabetical order or not appear in the sidebar at all.

**Why it happens:** It's easy to add a new directory (e.g., `content/docs/data-model/`) and forget the `meta.json`. fumadocs does not warn about missing `meta.json` files -- it silently falls back to alphabetical ordering. Developers don't notice until they check the sidebar.

**Prevention:**
- Plan the content directory structure before writing any content:
  ```
  content/docs/
    meta.json              (top-level section ordering)
    index.mdx              (docs home)
    getting-started/
      meta.json
      index.mdx
      authentication.mdx
    guides/
      meta.json
      ...
    api/                   (generated from OpenAPI)
      meta.json            (may be auto-generated by generateFiles())
      ...
    data-model/
      meta.json
      ...
  ```
- Include `meta.json` in every content directory from the start.
- Test sidebar navigation after adding each new directory.

**Phase:** Address in Phase 2 (content organization planning).

**Confidence:** MEDIUM -- based on fumadocs GitHub discussion reports about directory renaming breaking meta.json resolution.

---

### Pitfall 11: Image Optimization Disabled in Static Export

**What goes wrong:** Next.js static export requires `images: { unoptimized: true }` in `next.config.mjs`. This means no automatic image resizing, WebP conversion, or lazy loading optimization from the `next/image` component.

**Why it happens:** Next.js Image Optimization requires a server-side component unavailable in static export mode.

**Prevention:**
- Pre-optimize all images before committing (sharp CLI, imagemin, or Squoosh).
- Use SVGs for architecture diagrams and illustrations.
- Use standard `<img>` tags or fumadocs's image handling instead of `next/image`.
- For a developer docs site, this is low-impact -- content is primarily text and code.

**Phase:** Minor concern, address during content creation phases.

**Confidence:** HIGH -- Next.js static export limitation is deterministic and well-documented.

---

### Pitfall 12: OpenAPI Spec Server URLs Point to Wrong Origin

**What goes wrong:** The OpenAPI spec generated by chanfana at `/api/v1/openapi.json` may not include an explicit `servers` array, or it may use relative paths. When fumadocs renders API reference pages on `docs.viewroyal.ai`, the "Try it" playground (if enabled) attempts to send requests to the docs domain, not the API domain. Code examples may show incorrect base URLs.

**Why it happens:** chanfana generates the spec based on the request context. When extracted to a static JSON file for the docs build, server context is lost. The spec may default to relative URLs.

**Prevention:**
1. Ensure the extracted OpenAPI spec includes an explicit `servers` array: `[{ "url": "https://viewroyal.ai" }]`. Add this post-extraction if chanfana doesn't generate it.
2. Configure fumadocs-openapi to use the correct API base URL for code examples.
3. If the interactive playground causes CORS issues (docs domain calling API domain), either add `docs.viewroyal.ai` to the API's CORS allowed origins or disable the playground in favor of static code examples (curl, JavaScript, Python).

**Phase:** Address in Phase 2 (OpenAPI integration).

**Confidence:** MEDIUM -- depends on how chanfana populates the servers array; fumadocs-openapi playground configuration needs testing.

---

### Pitfall 13: Build Output Directory Misconfigured for Cloudflare Pages

**What goes wrong:** Next.js static export outputs to `out/` by default (not `.next/` or `build/`). Configuring Cloudflare Pages with the wrong build output directory produces a 404 site with no obvious error message.

**Why it happens:** Confusion between Next.js output modes: `output: 'export'` -> `out/`, `output: 'standalone'` -> `.next/standalone/`, default -> `.next/`. Each mode outputs to a different directory.

**Prevention:**
- Set Cloudflare Pages build output directory to `out/`.
- Add `out/` to `.gitignore`.
- Verify locally after `next build` that HTML files are present in `out/` before configuring CI.
- If using `trailingSlash: true` (recommended for Cloudflare Pages), routes like `/docs` become `/docs/index.html`.

**Phase:** Address in deployment phase.

**Confidence:** HIGH -- deterministic Next.js behavior.

---

### Pitfall 14: fumadocs-openapi CSS Preset Not Imported

**What goes wrong:** The OpenAPI integration has its own CSS styles (`fumadocs-openapi/css/preset.css`) that must be imported separately from the main fumadocs-ui styles. Without this import, API reference pages render without proper styling -- request/response sections look broken, parameter tables are unstyled, and the interactive playground is unusable.

**Why it happens:** The OpenAPI CSS is a separate package import, not bundled with fumadocs-ui. It's easy to miss because the main docs pages look fine without it.

**Prevention:**
- Add `@import 'fumadocs-openapi/css/preset.css';` to the docs app's global CSS file alongside the fumadocs-ui imports.
- Check the API reference pages visually after initial setup, not just the hand-written docs pages.

**Phase:** Address in Phase 2 (OpenAPI integration setup).

**Confidence:** HIGH -- documented in fumadocs OpenAPI integration guide.

**Sources:**
- [fumadocs OpenAPI Integration](https://www.fumadocs.dev/docs/integrations/openapi) -- CSS import requirement

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Project scaffolding | Using OpenNext Workers instead of static export (#1) | Static export to Cloudflare Pages from day one |
| Project scaffolding | Introducing pnpm workspaces, breaking existing apps (#3) | Keep apps independent, no workspace config |
| Project scaffolding | Wrong fumadocs config from stale tutorials (#4) | Use `create-fumadocs-app` CLI, pin versions |
| Project scaffolding | Tailwind CSS 4 style conflicts (#5) | Independent Tailwind config per app |
| Project scaffolding | Next.js version breaks fumadocs (#9) | Pin Next.js 15.x LTS, Node.js 22 LTS |
| OpenAPI integration | Runtime spec not available at build time (#2) | Prebuild spec extraction script |
| OpenAPI integration | Generated MDX files go stale (#7) | Prebuild generation, don't commit generated files |
| OpenAPI integration | Server URLs point to wrong origin (#12) | Explicit servers array in extracted spec |
| OpenAPI integration | Missing OpenAPI CSS (#14) | Import fumadocs-openapi/css/preset.css |
| Content organization | Missing meta.json breaks sidebar (#10) | Plan directory structure upfront, meta.json everywhere |
| Search setup | Static search not configured (#6) | Client-side search setup for static export |
| Deployment | DNS routing conflict (#8) | Verify Worker route patterns, add CNAME |
| Deployment | Wrong build output directory (#13) | Set Pages output to `out/` |
| Content creation | Unoptimized images (#11) | Pre-optimize, prefer SVG |

---

## Sources

- [fumadocs Official Documentation](https://www.fumadocs.dev/)
- [fumadocs OpenAPI Integration](https://www.fumadocs.dev/docs/integrations/openapi)
- [fumadocs Static Build Guide](https://www.fumadocs.dev/docs/deploying/static)
- [fumadocs Deployment Docs](https://www.fumadocs.dev/docs/deploying) -- "Fumadocs doesn't work on Edge runtime"
- [fumadocs v15 Blog (Tailwind CSS 4)](https://www.fumadocs.dev/blog/v15)
- [fumadocs MDX v10 Summary](https://www.fumadocs.dev/blog/mdx-v10-summary)
- [fumadocs MDX Next.js Setup](https://www.fumadocs.dev/docs/mdx/next)
- [fumadocs OpenAPI v10 Blog](https://www.fumadocs.dev/blog/openapi-v10)
- [fumadocs generateFiles()](https://fumadocs.dev/docs/ui/openapi/generate-files)
- [fumadocs GitHub Issue #1875](https://github.com/fuma-nama/fumadocs/issues/1875) -- version mismatch type errors
- [fumadocs GitHub Issue #2456](https://github.com/fuma-nama/fumadocs/issues/2456) -- Node.js 25 compatibility
- [OpenNext Cloudflare Get Started](https://opennext.js.org/cloudflare/get-started)
- [OpenNext Cloudflare Troubleshooting](https://opennext.js.org/cloudflare/troubleshooting)
- [Cloudflare Workers Next.js Guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Cloudflare Pages Static Next.js](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/)
- [Cloudflare Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [Cloudflare workers-sdk Issue #10941](https://github.com/cloudflare/workers-sdk/issues/10941) -- pnpm monorepo installs all workspaces
- [Cloudflare Workers Build Cache + pnpm](https://community.cloudflare.com/t/workers-build-cache-not-working-as-expected-in-monorepos-pnpm/803213)
- [Deploy Next.js fumadocs to GitHub Pages](https://zephinax.com/blog/deploy-nextjs-fumadocs-github-pages) -- static export pitfalls
- [Deploying Next.js on Cloudflare Troubleshooting](https://devinvinson.com/2025/11/deploying-fullstack-next-js-on-cloudflare-my-troubleshooting-guide/)
- [Cloudflare OpenNext Size Optimization](https://developers.cloudflare.com/changelog/2025-06-05-open-next-size/)

*Last updated: 2026-02-23*
