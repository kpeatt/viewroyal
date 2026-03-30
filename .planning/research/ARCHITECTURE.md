# Architecture Patterns

**Domain:** Esquimalt municipality ingestion + hostname-based subdomain routing
**Researched:** 2026-03-30
**Confidence:** HIGH (based on direct codebase analysis + Cloudflare docs verification)

## Current Architecture Summary

The platform already has multi-tenancy built in:
- **Pipeline:** `--municipality esquimalt` flag, `MunicipalityConfig` from DB, pluggable scraper registry with `LegistarScraper` registered for `"legistar"` type, per-municipality archive directories via `get_municipality_archive_root()`
- **Web app:** `getMunicipality(supabase, slug)` in root loader, municipality context flows through all routes via `getMunicipalityFromMatches()`, API routes use `:municipality` URL param with middleware resolution
- **Database:** `municipalities` table with `source_config` JSONB, `municipality_id` FK on all core tables (meetings, motions, agenda_items, documents, key_statements, etc.)

**The gap:** The web app hardcodes `slug = "view-royal"` as the default parameter in `getMunicipality()`, and there is no hostname-to-slug resolution. The pipeline's Legistar scraper exists but is untested against real Esquimalt data.

## Integration Architecture

### Component 1: Hostname-to-Municipality Resolution (Worker)

**What changes:** The Worker's fetch handler (`workers/app.ts`) needs to resolve municipality from the request hostname and pass it through to React Router.

**How it works:**

```
Request: https://esquimalt.viewroyal.ai/meetings
  -> Worker fetch() extracts hostname "esquimalt.viewroyal.ai"
  -> Static map resolves subdomain "esquimalt" to slug "esquimalt"
  -> Slug passed via AppLoadContext to React Router
  -> Root loader calls getMunicipality(supabase, "esquimalt")
  -> Municipality context propagates to all downstream routes
```

**Implementation approach:**

```typescript
// workers/app.ts

const HOSTNAME_MAP: Record<string, string> = {
  "viewroyal.ai": "view-royal",
  "www.viewroyal.ai": "view-royal",
  "esquimalt.viewroyal.ai": "esquimalt",
};

function resolveSlugFromHostname(hostname: string): string | null {
  if (HOSTNAME_MAP[hostname]) return HOSTNAME_MAP[hostname];
  if (hostname.endsWith(".workers.dev") || hostname === "localhost") return "view-royal";
  return null; // Unknown subdomain -> 404
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const slug = resolveSlugFromHostname(url.hostname);

    if (!slug) {
      return new Response("Not Found", { status: 404 });
    }

    if (url.pathname.startsWith("/api/v1/") || /* ... */) {
      return apiApp.fetch(request, env, ctx);
    }

    return requestHandler(request, {
      cloudflare: { env, ctx, municipalitySlug: slug },
    });
  },
};
```

**Why static map over DB lookup:** The number of municipalities is tiny (2 now, maybe 5 ever). A hardcoded map avoids an extra Supabase query on every request. Adding a municipality requires a deploy anyway (to add the custom domain in wrangler.toml and DNS).

### Component 2: AppLoadContext Type Extension

**What changes:** Extend the `AppLoadContext` interface to carry the resolved slug:

```typescript
declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
      municipalitySlug: string; // NEW
    };
  }
}
```

### Component 3: Root Loader Reads Slug from Context

**What changes:** `root.tsx` loader reads slug from `AppLoadContext` instead of using the hardcoded default.

```typescript
// root.tsx
export async function loader({ request, context }: Route.LoaderArgs) {
  const slug = context.cloudflare.municipalitySlug;
  const { supabase, headers } = createSupabaseServerClient(request);
  const [{ data: { user } }, municipality] = await Promise.all([
    supabase.auth.getUser(),
    getMunicipality(supabase, slug),
  ]);
  // ... rest unchanged
}
```

**What does NOT change downstream:** Every route already reads municipality from root loader data via `getMunicipalityFromMatches(matches)`. All Supabase service queries already filter by `municipality_id`. No changes needed in any route loader or component.

### Component 4: getMunicipality Signature Update

**What changes:** Remove the default `"view-royal"` parameter from `getMunicipality()` in `app/services/municipality.ts` to make the slug required:

```typescript
// Before
export async function getMunicipality(supabase: SupabaseClient, slug = "view-royal")

// After
export async function getMunicipality(supabase: SupabaseClient, slug: string)
```

This surfaces any callers that forgot to pass a slug (currently `root.tsx`, `home.tsx`, `meeting-detail.tsx`, `api.vimeo-url.ts`). All need updating to read from context.

### Component 5: Cloudflare Custom Domain Configuration

**What changes:** Add `esquimalt.viewroyal.ai` as a custom domain route in `wrangler.toml`:

```toml
routes = [
  { pattern = "viewroyal.ai/*", zone_name = "viewroyal.ai" },
  { pattern = "esquimalt.viewroyal.ai/*", zone_name = "viewroyal.ai", custom_domain = true }
]
```

**DNS:** Cloudflare Custom Domains automatically create the required DNS records when configured through wrangler. Verify the `viewroyal.ai` zone is proxied in Cloudflare dashboard.

**Confidence:** MEDIUM -- Custom domain with `custom_domain = true` is the documented approach per Cloudflare docs. The exact interaction with the existing bare-domain route entry should be verified during deployment.

### Component 6: Dynamic Meta/OG Tags

**What changes:** The root `meta` function already reads municipality from matches, but several strings are hardcoded:

| Current Hardcoded Value | Should Be |
|------------------------|-----------|
| `"ViewRoyal.ai \| Council Meeting Intelligence"` | `"{short_name}.ai \| Council Meeting Intelligence"` |
| `"https://viewroyal.ai"` | Dynamic from request hostname |
| `"ViewRoyal.ai"` (og:site_name) | Dynamic from municipality |

The `Navbar` and `Footer` components may also contain hardcoded "ViewRoyal" text that needs checking.

### Component 7: Esquimalt Municipality Row in Supabase

**What changes:** Insert Esquimalt row into `municipalities` table:

```sql
INSERT INTO municipalities (slug, name, short_name, province, classification, website_url, source_config)
VALUES (
  'esquimalt',
  'Township of Esquimalt',
  'Esquimalt',
  'BC',
  'Township',
  'https://www.esquimalt.ca',
  '{
    "type": "legistar",
    "client_id": "esquimalt",
    "timezone": "America/Vancouver",
    "video_source": {"type": "legistar_inline"}
  }'::jsonb
);
```

This should be done as a Supabase migration or direct insert. The `source_config` matches what `LegistarScraper.__init__` expects.

### Component 8: Pipeline Execution for Esquimalt

**What changes:** Nothing structural. The pipeline already supports:

```bash
cd apps/pipeline
uv run python main.py --municipality esquimalt --limit 5    # Test run
uv run python main.py --municipality esquimalt               # Full run
```

The Legistar scraper is registered in `__init__.py`. The `Archiver` class reads `source_config.type` to select the scraper and `get_municipality_archive_root("esquimalt")` creates `archive/esquimalt/`.

**Potential issues requiring fixes during testing:**
- Date parsing edge cases in Legistar API responses (the `EventDate` field format)
- Missing or null fields that the scraper assumes exist (`EventAgendaFile`, `EventMinutesFile`, `EventVideoPath`)
- Attachment URL formats may differ from expectations
- Organization/body name mapping for Esquimalt committee structures
- Rate limiting from the Legistar public API during bulk discovery
- Video URL handling -- `legistar_inline` video source type may need implementation in the video abstraction layer

**No diarization needed initially:** Esquimalt meetings may have video but diarization is optional. Documents-only ingestion works through the existing pipeline.

## Data Flow Diagram

```
                    PIPELINE (one-time + daily)
                    ==========================
   Legistar API  -->  LegistarScraper  -->  Archiver  -->  Supabase
   (esquimalt)       (discover+download)   (ingest+embed)  (municipality_id=N)

                    WEB APP (per-request)
                    =====================
   Browser: esquimalt.viewroyal.ai/meetings
       |
       v
   Worker fetch()
       |-- Extract hostname -> "esquimalt.viewroyal.ai"
       |-- Static map -> slug = "esquimalt"
       |-- Fail-fast 404 if unknown subdomain
       |-- Pass slug via AppLoadContext
       |
       +-- /api/v1/* -> Hono (already has :municipality param)
       |
       +-- Everything else -> React Router
               |
               v
           Root loader
               |-- getMunicipality(supabase, "esquimalt")
               |-- Returns municipality context (id=N)
               |
               v
           Route loaders
               |-- All queries filter by municipality_id
               |-- Identical code paths as View Royal
               |
               v
           SSR Response -> Browser
```

## New vs Modified Components

| Component | Status | File(s) | Change Description |
|-----------|--------|---------|-------------------|
| Hostname resolver | **NEW** | `workers/app.ts` | Static map + `resolveSlugFromHostname()` function |
| AppLoadContext type | **MODIFY** | `workers/app.ts` | Add `municipalitySlug: string` field |
| Root loader | **MODIFY** | `app/root.tsx` | Read slug from context, pass to `getMunicipality()` |
| getMunicipality | **MODIFY** | `app/services/municipality.ts` | Remove default slug, make param required |
| Other callers of getMunicipality | **MODIFY** | `home.tsx`, `meeting-detail.tsx`, `api.vimeo-url.ts` | Pass slug from context/root data |
| Root meta function | **MODIFY** | `app/root.tsx` | Dynamic municipality name in OG tags |
| wrangler.toml | **MODIFY** | `wrangler.toml` | Add esquimalt custom domain route |
| Esquimalt DB row | **NEW** | SQL migration or direct insert | Municipality row with source_config |
| Legistar scraper | **MODIFY** (bugfixes) | `pipeline/scrapers/legistar.py` | Fixes discovered during real-data testing |
| Navbar/Footer | **AUDIT** | Various components | Check for hardcoded "ViewRoyal" text |

**Unchanged components:** All route loaders, all service files (meetings.ts, people.ts, etc.), all Supabase RPCs, all API endpoints, email functions, pipeline orchestrator, scraper registry.

## Patterns to Follow

### Pattern 1: Static Hostname Map
**What:** Hardcode hostname-to-slug mapping in the Worker.
**When:** Number of municipalities is small (<10) and changes require a deploy anyway.
**Why:** Eliminates a DB round-trip on every request. Unknown hostnames get 404 instantly. Adding a municipality requires a deploy to add the custom domain in wrangler.toml anyway.

### Pattern 2: Context Passthrough (Not Global State)
**What:** Pass municipality slug through `AppLoadContext` rather than global state, cookies, or environment variables.
**When:** Always, for request-scoped data in Cloudflare Workers.
**Why:** Workers handle concurrent requests across isolates. Global state would cause municipality cross-contamination. `AppLoadContext` is per-request by design.

### Pattern 3: Fail-Fast Unknown Subdomains
**What:** Return 404 from the Worker fetch handler before React Router processes the request.
**When:** Hostname does not map to a known municipality.
**Why:** Saves SSR rendering cost, DB queries, and auth checks for invalid hosts.

### Pattern 4: Slug-Required Function Signatures
**What:** Remove default slug values from `getMunicipality()` and similar functions.
**When:** Transitioning from single-tenant defaults to explicit multi-tenant routing.
**Why:** Compile-time enforcement that every call site provides a municipality slug. Prevents silent fallback to View Royal when a route forgets to pass the slug.

## Anti-Patterns to Avoid

### Anti-Pattern 1: DB Lookup for Hostname Resolution
**What:** Querying `municipalities` table on every request to resolve hostname to slug.
**Why bad:** Adds latency and a DB round-trip to every page load. The municipalities table changes extremely rarely.
**Instead:** Static map in Worker code.

### Anti-Pattern 2: Wildcard Subdomain Pattern
**What:** Using `*.viewroyal.ai/*` as a route pattern in wrangler.toml.
**Why bad:** Cloudflare Custom Domains do not support wildcard DNS records. Each subdomain must be explicitly configured. Wildcards would also catch unintended subdomains.
**Instead:** Explicit route per municipality subdomain.

### Anti-Pattern 3: Separate Workers Per Municipality
**What:** Deploying a separate Cloudflare Worker for each municipality.
**Why bad:** Code duplication, separate deployments, separate secret management. The codebase is already multi-tenant.
**Instead:** Single Worker, differentiated by hostname.

### Anti-Pattern 4: Modifying Downstream Route Loaders
**What:** Adding hostname/municipality resolution logic to individual route loaders.
**Why bad:** Municipality context already flows from root loader. Per-route resolution creates redundancy and risks inconsistency.
**Instead:** Resolve once in Worker + root loader.

### Anti-Pattern 5: Subdomain-Implied API Municipality
**What:** Making `esquimalt.viewroyal.ai/api/v1/meetings` automatically scope to Esquimalt without the `:municipality` URL param.
**Why bad:** The API is already built with explicit `:municipality` in the URL path. API consumers (developers, docs) reference this convention. Changing it breaks the existing contract.
**Instead:** Keep API routes with explicit municipality slug. Subdomain routing is for the web UI only.

## Suggested Build Order

Dependencies dictate this sequence:

```
1. Esquimalt DB row (no code deps, enables everything else)
   |
   +-- 2a. Pipeline: Test Legistar scraper (--municipality esquimalt --limit 5)
   |        |
   |        +-- 2b. Pipeline: Fix scraper bugs found in testing
   |        |
   |        +-- 2c. Pipeline: Full Esquimalt ingest
   |
   +-- 3a. Worker: Hostname resolver + AppLoadContext extension
   |        |
   |        +-- 3b. Root loader + getMunicipality signature change
   |        |
   |        +-- 3c. Fix all other getMunicipality callers
   |        |
   |        +-- 3d. Dynamic meta/OG tags + audit hardcoded strings
   |
   +-- 4. wrangler.toml: Add esquimalt custom domain route
         |
         +-- 5. Deploy + verify esquimalt.viewroyal.ai works
```

**Steps 2a-2c and 3a-3d can run in parallel** since pipeline and web app are independent.

**Recommended milestone phases:**

1. **Foundation** -- DB row + pipeline validation (test scraper, fix bugs)
2. **Data** -- Full Esquimalt pipeline run (scrape, ingest, embed)
3. **Routing** -- Hostname resolver, context passthrough, getMunicipality changes, dynamic meta
4. **Ship** -- wrangler.toml update, DNS, deploy, end-to-end verification

## Scalability Considerations

| Concern | At 2 municipalities | At 10 municipalities | At 50 municipalities |
|---------|---------------------|----------------------|----------------------|
| Hostname map | 3-4 entries, trivial | 15-20 entries, fine | Consider DB lookup with KV edge cache |
| wrangler.toml routes | 2 routes | 10 routes, manageable | Script to generate wrangler.toml |
| Pipeline runs | Sequential per municipality | `--all` flag or parallel | Queue-based job scheduling |
| DB query performance | `municipality_id` indexes handle it | Same | Partition if data exceeds millions |
| Worker cold start | Negligible | Negligible | Negligible |

At current scale (2 municipalities), the static map approach is ideal. Revisit at 10+.

## Sources

- [Cloudflare Workers Custom Domains docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) -- MEDIUM confidence
- [Cloudflare Workers Routes docs](https://developers.cloudflare.com/workers/configuration/routing/routes/) -- MEDIUM confidence
- [Wrangler Configuration Reference](https://developers.cloudflare.com/workers/wrangler/configuration/) -- HIGH confidence
- Codebase analysis: `workers/app.ts`, `root.tsx`, `municipality.ts`, `municipality-helpers.ts`, `legistar.py`, `scrapers/__init__.py`, `orchestrator.py`, `paths.py`, `main.py`, `api/index.ts`, `api/middleware/municipality.ts` -- HIGH confidence
