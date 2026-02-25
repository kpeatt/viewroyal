# Phase 24: Tech Debt Cleanup — Research

## Phase Goal
Documentation build and deploy pipeline is clean, self-contained, and production-ready.

## Current State Analysis

### 1. Duplicate `generate-openapi.mjs` Execution

**Problem:** The script runs twice during `pnpm build`:
```json
{
  "prebuild": "node scripts/generate-openapi.mjs",
  "build": "node scripts/generate-openapi.mjs && next build"
}
```
npm lifecycle hooks mean `prebuild` fires automatically before `build`. Then `build` also calls the script explicitly. Result: the OpenAPI spec is fetched, cleaned, and MDX generated twice per build.

**Fix:** Remove the explicit call from `build` — rely solely on the `prebuild` hook:
```json
{
  "prebuild": "node scripts/generate-openapi.mjs",
  "build": "next build"
}
```
This is the standard npm/pnpm lifecycle pattern. `prebuild` runs automatically before `build`.

### 2. Missing `deploy` Script

**Problem:** `apps/docs/package.json` has no `deploy` script. Deployment requires manual multi-step commands.

**Fix:** Add a deploy script following the pattern from `apps/web/package.json`:
```json
"deploy": "tsc --noEmit && pnpm build && wrangler deploy"
```
This matches the CONTEXT.md decision: typecheck → build (which triggers prebuild) → deploy.

The root `package.json` should also get a convenience script:
```json
"deploy:docs": "pnpm --filter docs deploy"
```

### 3. Wrangler Not a Direct devDependency

**Problem:** `apps/docs` does not list `wrangler` in its `devDependencies`. It currently works only because `.npmrc` has `shamefully-hoist=true`, which hoists `wrangler` from sibling packages (`apps/web` and `apps/vimeo-proxy`) to the root `node_modules/.bin/`.

**Fix:** Add `wrangler` as a direct devDependency of `apps/docs`:
```json
"devDependencies": {
  "wrangler": "^4.64.0",
  ...
}
```
This matches the pattern in both `apps/web` and `apps/vimeo-proxy`.

### 4. Custom Domain Configuration (docs.viewroyal.ai)

**Problem:** The docs site is deployed as a Cloudflare Worker (`viewroyal-docs`) but has no custom domain routing. It's only accessible via `*.workers.dev`.

**Fix options:**
1. **Workers route in wrangler.toml:** Add a route pattern like `docs.viewroyal.ai/*` with `zone_name = "viewroyal.ai"` — mirrors `apps/web/wrangler.toml` pattern.
2. **DNS CNAME record:** Add `docs` CNAME pointing to `viewroyal-docs.<account>.workers.dev` in Cloudflare DNS.
3. **Custom domain via wrangler.toml:** Use the `[route]` or `routes` directive with zone_name.

The `apps/web/wrangler.toml` uses:
```toml
routes = [
  { pattern = "viewroyal.ai/*", zone_name = "viewroyal.ai" }
]
```

For docs, the equivalent would be:
```toml
routes = [
  { pattern = "docs.viewroyal.ai/*", zone_name = "viewroyal.ai" }
]
```
Plus a DNS CNAME record: `docs` → `viewroyal-docs.<account>.workers.dev`.

**Note from CONTEXT.md:** "Document steps if blocked by DNS propagation or access."

## Key Files

| File | Role |
|------|------|
| `apps/docs/package.json` | Build scripts, dependencies |
| `apps/docs/wrangler.toml` | Cloudflare Worker config |
| `apps/docs/scripts/generate-openapi.mjs` | Prebuild script |
| `apps/docs/next.config.mjs` | Next.js config (output: export) |
| `apps/web/wrangler.toml` | Reference for route pattern |
| `package.json` (root) | Workspace scripts |
| `.npmrc` | shamefully-hoist=true |

## Risk Assessment

- **Low risk:** All changes are to build/deploy configuration only — no runtime code changes
- **Prebuild dedup:** Standard npm lifecycle — well-understood behavior
- **Wrangler dep:** Just adding what already works via hoisting — no behavioral change
- **DNS:** May need propagation time; documenting fallback is acceptable per success criteria

## RESEARCH COMPLETE
