# Technology Stack

**Project:** v1.8 Esquimalt Launch -- Legistar Ingestion + Subdomain Routing
**Researched:** 2026-03-30

## Critical Finding: Legistar Web API Unavailable for Esquimalt

The existing `LegistarScraper` in `pipeline/scrapers/legistar.py` uses the Legistar Web API (`webapi.legistar.com/v1/{client}/...`). **This API is NOT enabled for Esquimalt.** Tested client IDs `esquimalt`, `Esquimalt`, `esquimalt.ca` -- all return `LegistarConnectionString setting is not set up in InSite for client`. The InSite HTML frontend at `esquimalt.ca.legistar.com` works fine. The existing scraper must be rewritten to scrape InSite HTML pages instead of calling the Web API.

**Confidence: HIGH** -- verified by direct API calls returning explicit error messages.

## Stack Changes Required

### No New Dependencies Needed

The v1.8 milestone requires zero new npm packages and zero new Python packages. Everything needed already exists in the stack.

| Capability | Already Have | Version | Notes |
|------------|-------------|---------|-------|
| HTML scraping | beautifulsoup4 | >=4.14.3 | In pyproject.toml, used by StaticHtmlScraper |
| HTTP requests | requests | >=2.32.5 | In pyproject.toml, used by all scrapers |
| Video download | yt-dlp | >=2025.12.8 | In pyproject.toml, handles Granicus/YouTube/Vimeo |
| Subdomain routing | Cloudflare Workers | -- | `request.url` hostname available in fetch handler |
| Municipality lookup | Supabase | >=2.27.2 | `municipalities` table with slug column already exists |

### Pipeline: Legistar InSite HTML Scraper

**What changes:** Replace `LegistarScraper._get()` (Web API calls) with BeautifulSoup HTML parsing of InSite pages.

**Source type in registry:** Register as `"legistar_insite"` (new type) to distinguish from the Web API scraper (keep `"legistar"` for municipalities where the API works).

**Data sources on Esquimalt InSite:**

| Page | URL Pattern | Data Available |
|------|-------------|---------------|
| Calendar | `esquimalt.ca.legistar.com/Calendar.aspx` | Meeting list with dates, body names, agenda/minutes/video links |
| Meeting Detail | `esquimalt.ca.legistar.com/MeetingDetail.aspx?ID={id}&GUID={guid}` | Agenda items with file#, title, type, action, result; video links |
| Agenda PDF | `esquimalt.ca.legistar.com/View.ashx?M=A&ID={id}&GUID={guid}` | Full agenda package PDF |
| Attachment | `esquimalt.ca.legistar.com/View.ashx?M=AO&ID={id}&GUID={guid}` | Individual attachment PDF |
| Video | `esquimalt.ca.legistar.com/Video.aspx?Mode=Granicus&ID1={id}&Mode2=Video` | Granicus-hosted video player |

**Video source:** Esquimalt uses Granicus streaming (`esquimalt.ca.granicus.com`). The InSite pages call `running_events.php` via JSONP and have onclick handlers like `Video.aspx?Mode=Granicus&ID1=1335&Mode2=Video`. The video source abstraction already supports multiple types -- add `"granicus"` as a new video source type. `yt-dlp` may handle Granicus URLs directly (it supports many video platforms); test this first before building a custom extractor.

**source_config for Esquimalt:**
```json
{
  "type": "legistar_insite",
  "insite_url": "https://esquimalt.ca.legistar.com",
  "timezone": "America/Vancouver",
  "video_source": {"type": "granicus", "base_url": "https://esquimalt.ca.granicus.com"}
}
```

**Implementation approach:** Use the `StaticHtmlScraper` as the pattern. The InSite pages use Telerik RadGrid controls with predictable HTML structure. Parse the Calendar page for meeting links, then parse each MeetingDetail page for agenda items. BeautifulSoup handles this well -- no headless browser needed since the calendar data is server-rendered in the HTML.

### Web App: Subdomain Routing

**What changes:** Modify `workers/app.ts` fetch handler to extract hostname, map subdomain to municipality slug, pass to React Router and Hono contexts.

**Cloudflare Workers configuration (wrangler.toml):**

Current:
```toml
routes = [
  { pattern = "viewroyal.ai/*", zone_name = "viewroyal.ai" }
]
```

Change to:
```toml
routes = [
  { pattern = "viewroyal.ai/*", zone_name = "viewroyal.ai" },
  { pattern = "*.viewroyal.ai/*", zone_name = "viewroyal.ai" }
]
```

This makes the same Worker handle both `viewroyal.ai` and `esquimalt.viewroyal.ai`. The Worker reads `new URL(request.url).hostname` to determine which municipality to serve. No custom domain configuration needed -- wildcard routes handle it.

**DNS:** Add a CNAME record for `*.viewroyal.ai` pointing to the Worker (or use Cloudflare proxy). Since the zone is already on Cloudflare, this is a one-click DNS record addition.

**Hostname-to-slug mapping logic in `workers/app.ts`:**
```typescript
function getMunicipalitySlug(hostname: string): string {
  // esquimalt.viewroyal.ai -> "esquimalt"
  // viewroyal.ai -> "view-royal" (default)
  // localhost -> "view-royal" (dev)
  const parts = hostname.split(".");
  if (parts.length >= 3 && parts[1] === "viewroyal") {
    return parts[0]; // subdomain
  }
  return "view-royal"; // default
}
```

**Integration points:**
1. `workers/app.ts` -- extract slug from hostname, pass in `AppLoadContext`
2. `root.tsx` loader -- use slug from context instead of hardcoded `"view-royal"`
3. `app/api/index.ts` -- Hono API already resolves municipality from URL param; no change needed for API routes
4. `getMunicipality()` in `services/municipality.ts` -- already accepts slug parameter, just needs the right slug passed in

**No new npm packages required.** Standard `URL` API is available in Cloudflare Workers.

### Web App: Municipality Context Flow

**Current flow:**
```
request -> workers/app.ts -> root.tsx loader -> getMunicipality(supabase) [hardcoded "view-royal"]
```

**New flow:**
```
request -> workers/app.ts [extract slug from hostname] -> AppLoadContext.municipalitySlug
-> root.tsx loader -> getMunicipality(supabase, context.municipalitySlug)
```

**AppLoadContext type change:**
```typescript
interface AppLoadContext {
  cloudflare: {
    env: Env;
    ctx: ExecutionContext;
  };
  municipalitySlug: string; // NEW
}
```

## What NOT to Add

| Technology | Why Not |
|------------|---------|
| `python-legistar-scraper` (pip) | Heavyweight OCD-focused library; we only need calendar + meeting detail parsing. Our BaseScraper interface is simpler and already works. |
| `legistar-scrape` (pip) | Deprecated in favor of python-legistar-scraper. |
| `cdp-scrapers` (pip) | CDP project tooling; different data model. Too opinionated for our pipeline. |
| Puppeteer/Playwright for InSite | Overkill. InSite pages are server-rendered HTML. BeautifulSoup handles them fine. |
| Cloudflare Workers for Platforms | Enterprise feature for true multi-tenant SaaS. We have 2-3 municipalities; simple hostname parsing is sufficient. |
| Wildcard SSL certificate | Cloudflare automatically provisions SSL for routes. No manual cert management. |
| Redis/KV for municipality cache | Municipality lookups hit Supabase. At 2-3 municipalities, caching is premature optimization. |
| Separate Workers per municipality | One Worker with hostname routing is simpler, cheaper, and shares code. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Esquimalt scraping | Custom InSite HTML scraper (BeautifulSoup) | python-legistar-scraper library | Different data model, heavy dependency, we need 2 pages parsed not a full OCD pipeline |
| Subdomain routing | Wildcard route in wrangler.toml + hostname parsing | Cloudflare Custom Domains per municipality | Routes are simpler for subdomains under one zone; Custom Domains better for separate TLDs |
| Subdomain routing | Wildcard route in wrangler.toml | Path-based routing (/esquimalt/*) | Subdomains are cleaner for municipality identity; path-based requires URL rewrites everywhere |
| Municipality context | AppLoadContext injection | Cookie/header-based | Hostname is authoritative; cookies can be wrong or missing |
| Video extraction | yt-dlp (test first) | Custom Granicus extractor | yt-dlp supports many platforms; only build custom if yt-dlp fails |

## Configuration Changes

### wrangler.toml
```toml
# Add wildcard route for subdomains
routes = [
  { pattern = "viewroyal.ai/*", zone_name = "viewroyal.ai" },
  { pattern = "*.viewroyal.ai/*", zone_name = "viewroyal.ai" }
]
```

### Cloudflare DNS
```
Type: CNAME
Name: *
Target: viewroyal-intelligence.{account}.workers.dev
Proxy: Yes (orange cloud)
```

### Supabase municipalities table
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
    "type": "legistar_insite",
    "insite_url": "https://esquimalt.ca.legistar.com",
    "timezone": "America/Vancouver",
    "video_source": {"type": "granicus", "base_url": "https://esquimalt.ca.granicus.com"}
  }'::jsonb
);
```

## Confidence Assessment

| Decision | Confidence | Basis |
|----------|------------|-------|
| Legistar Web API unavailable | HIGH | Direct API testing, explicit error messages |
| InSite HTML scrapable with BeautifulSoup | HIGH | Verified server-rendered HTML structure, predictable Telerik grid layout |
| Wildcard routes in wrangler.toml | HIGH | Cloudflare official docs confirm `*.domain.com/*` pattern |
| No new dependencies needed | HIGH | beautifulsoup4, requests, yt-dlp all in pyproject.toml already |
| yt-dlp handles Granicus video | MEDIUM | yt-dlp has wide platform support but Granicus not confirmed; needs testing |
| Hostname available in Worker request | HIGH | Standard Web API URL parsing, confirmed in existing `workers/app.ts` code |

## Sources

- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Cloudflare Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [Legistar Web API Help](https://webapi.legistar.com/Help)
- [Esquimalt Legistar InSite](https://esquimalt.ca.legistar.com/)
- [Esquimalt Municipality Page](https://www.esquimalt.ca/government-bylaws/council-meetings/council-committee-meetings-online-legistar)
- [CDP Scrapers - Finding Legistar ID](https://councildataproject.org/cdp-scrapers/finding_legistar_id.html)
- [python-legistar-scraper](https://github.com/opencivicdata/python-legistar-scraper)
