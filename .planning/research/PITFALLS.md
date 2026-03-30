# Domain Pitfalls

**Domain:** Adding Esquimalt municipality ingestion (Legistar scraper) + subdomain-based multi-site routing to existing single-municipality civic platform
**Researched:** 2026-03-30

## Critical Pitfalls

Mistakes that cause data leakage between municipalities, broken production, or rewrites.

### Pitfall 1: Web App Service Layer Has Zero Municipality Scoping

**What goes wrong:** Every Supabase query in `apps/web/app/services/` (meetings.ts, people.ts, site.ts, etc.) queries tables WITHOUT filtering by `municipality_id`. Once Esquimalt data exists in the database, the View Royal site shows Esquimalt meetings, motions, matters, and people mixed in with View Royal data. The home page shows Esquimalt decisions in the feed. Search returns cross-municipality results.

**Why it happens:** The app was built for a single municipality. The API layer (Hono endpoints in `apps/web/app/api/`) was properly scoped with `municipality_id` filters in v1.3, but the React Router service layer that feeds the web UI was never updated.

**Consequences:** Data leakage between municipalities. View Royal users see Esquimalt agenda items. Esquimalt users see View Royal motions. Stats on the about page aggregate both towns. The home page "active matters" and "recent decisions" mix data from both municipalities.

**Evidence found:**
- `apps/web/app/services/meetings.ts` -- no `municipality_id` filter on any query
- `apps/web/app/services/` -- grep for `municipality_id` returns zero matches across all service files
- `apps/web/app/services/people.ts:419` -- uses `organization_id` with hardcoded fallback `|| 1`
- `apps/web/app/services/site.ts` -- `getAboutStats()` and `getHomeData()` query all rows globally with no municipality filter
- Contrast with `apps/web/app/api/endpoints/` which correctly filters `.eq("municipality_id", muni.id)` on every query

**Prevention:** Before ingesting ANY Esquimalt data, add `municipality_id` filtering to every service function. The root loader already fetches the municipality object -- pass `municipality.id` down to all service calls. The meetings table already has `municipality_id` via its organization FK. The API layer in `apps/web/app/api/endpoints/` shows exactly how to do this.

**Detection:** After ingesting even one Esquimalt meeting, visit viewroyal.ai and check if Esquimalt data appears on the home page, meetings list, people list, matters list, or search results.

**Phase:** Must be the very first task, before any Esquimalt data enters the database.

---

### Pitfall 2: getMunicipality() Hardcoded to "view-royal" Slug

**What goes wrong:** `apps/web/app/services/municipality.ts` has `slug = "view-royal"` as the default parameter. The root loader calls `getMunicipality(supabase)` with no slug argument. Every page load resolves to View Royal regardless of what hostname the request came from. Esquimalt subdomain will render with View Royal's name, map center, meta, RSS URL, and branding.

**Why it happens:** No hostname-to-slug resolution exists. The function signature has a default parameter that was never wired to hostname detection.

**Consequences:** esquimalt.viewroyal.ai loads but displays "Town of View Royal" everywhere, uses View Royal's map center for geographic features, fetches View Royal's RSS feed for public notices, and passes View Royal's municipality ID for all data queries (compounding Pitfall 1).

**Evidence found:**
- `apps/web/app/services/municipality.ts:7` -- `slug = "view-royal"` default
- `apps/web/app/root.tsx:79` -- `getMunicipality(supabase)` called with no slug
- `apps/web/app/routes/home.tsx:38` -- same pattern, no slug passed

**Prevention:** Add hostname parsing in the Worker entry point (`workers/app.ts`) or root loader. Extract subdomain from `request.url`, map it to a municipality slug, and pass it through. The `getMunicipality` function already accepts a slug parameter -- it just needs to receive the correct one based on the hostname.

**Detection:** Visit esquimalt.viewroyal.ai and check the page title, hero section text, and map center location.

**Phase:** Routing/subdomain phase -- must come before or alongside data ingestion.

---

### Pitfall 3: Hardcoded "ViewRoyal.ai" Branding Across 30+ Files

**What goes wrong:** The brand name "ViewRoyal.ai" is hardcoded in page titles, OG meta tags, the navbar logo, footer copyright, OG image generator, about page, settings page, and more. Esquimalt users see "ViewRoyal.ai" as the site name everywhere.

**Why it happens:** Branding was treated as a constant, not a municipality-derived value. The multi-tenancy work in v1.0 made data queries municipality-aware but never addressed branding strings.

**Consequences:** Esquimalt users see confusing "ViewRoyal.ai" branding everywhere. SEO metadata references "ViewRoyal.ai" on Esquimalt pages. OG images say "ViewRoyal.ai". Social shares look wrong.

**Evidence found (partial list of hardcoded locations):**
- `apps/web/app/root.tsx:30,35,42` -- title, og:title, og:url all hardcoded to "ViewRoyal.ai"
- `apps/web/app/components/navbar.tsx:146` -- `ViewRoyal<span>.ai</span>` hardcoded logo text
- `apps/web/app/components/footer.tsx:8` -- copyright text "ViewRoyal.ai"
- `apps/web/app/components/footer.tsx:12` -- docs link to `https://docs.viewroyal.ai`
- `apps/web/app/lib/og.ts:1` -- `const BASE = "https://viewroyal.ai"` hardcoded base URL
- `apps/web/app/routes/about.tsx:24-30` -- hardcoded title, description, OG tags
- `apps/web/app/routes/meetings.tsx:14-15` -- "ViewRoyal.ai" in page title
- `apps/web/app/routes/compare.tsx:73,89` -- hardcoded in meta
- `apps/web/app/routes/search.tsx:31-36` -- hardcoded in meta
- `apps/web/app/routes/document-viewer.tsx:37,41,244,549,556` -- page title + image URLs hardcoded to `images.viewroyal.ai`
- `apps/web/app/routes/settings.api-keys.tsx:176,271` -- "ViewRoyal.ai API" in body copy
- `apps/web/app/routes/api.og-image.tsx:27,33,54` -- OG image generator hardcoded brand
- `apps/web/app/lib/analytics.server.ts:1` -- PostHog host `https://k.viewroyal.ai`
- `apps/web/app/components/posthog-provider.tsx:26` -- same PostHog proxy

**Prevention:** Create a branding utility or extend the municipality context with site name and base URL. Replace all hardcoded instances. For `meta` functions, use `getMunicipalityFromMatches()` which already exists but is only used in a few places. Grep for "ViewRoyal" and "viewroyal.ai" across `apps/web/app/` to find all instances (77 files match).

**Detection:** Deploy with subdomain routing and view-source any Esquimalt page -- "ViewRoyal" will appear dozens of times.

**Phase:** Branding cleanup phase, which should be part of the routing/subdomain work.

---

### Pitfall 4: Legistar API 1000-Result Limit Without Pagination

**What goes wrong:** The Legistar scraper's `discover_meetings()` makes a single API call to the Events endpoint with no pagination. The Legistar API documentation explicitly states query replies are limited to 1000 responses. Esquimalt has been on Legistar for years with regular council meetings, committee meetings, advisory commission meetings, and more. If they have more than 1000 total events, the scraper silently truncates the result set.

**Why it happens:** The scraper was written but never tested against real Esquimalt data. No `$top`/`$skip` OData pagination parameters are used.

**Consequences:** Missing meetings with no error. The scraper reports N meetings discovered but older meetings are silently dropped. The API returns 200 OK with exactly 1000 results and the scraper treats it as complete.

**Evidence found:**
- `apps/pipeline/pipeline/scrapers/legistar.py:66-70` -- single `_get("Events", params)` call, no pagination loop
- Legistar API Help Page confirms 1000-result limit
- Legistar API recommends paging by `$top`/`$skip` or filtering by ID for stable pagination

**Prevention:** Add OData pagination: loop with `$top=1000&$skip=N` until fewer than 1000 results return. Or use `$filter` with `EventId gt {last_id}` for ID-based paging as Legistar recommends for busy sites.

**Detection:** Compare the count returned by the scraper vs the count visible on the esquimalt.ca.legistar.com calendar. If exactly 1000, pagination is needed.

**Phase:** Must be fixed before the initial Esquimalt scrape to avoid missing historical data.

---

### Pitfall 5: Wrangler Routes Only Match viewroyal.ai, Not Subdomains

**What goes wrong:** `wrangler.toml` has `routes = [{ pattern = "viewroyal.ai/*", zone_name = "viewroyal.ai" }]`. This pattern matches ONLY `viewroyal.ai/*`. Requests to `esquimalt.viewroyal.ai` will NOT be routed to the Worker. They will hit Cloudflare's default behavior -- a DNS error or Cloudflare error page, depending on DNS configuration.

**Why it happens:** The route was configured for a single domain. Cloudflare route patterns require explicit wildcard subdomain matching.

**Consequences:** esquimalt.viewroyal.ai returns a Cloudflare error page. The Worker never receives the request. The entire feature is broken at the infrastructure level.

**Evidence found:**
- `apps/web/wrangler.toml:7` -- `pattern = "viewroyal.ai/*"` (no wildcard for subdomains)
- Cloudflare Workers Routes docs confirm patterns like `*.viewroyal.ai/*` are needed for subdomain matching
- Must also set up DNS (CNAME or A record) for the subdomain or use a wildcard DNS record

**Prevention:** Update wrangler.toml to add the subdomain route:
```toml
routes = [
  { pattern = "viewroyal.ai/*", zone_name = "viewroyal.ai" },
  { pattern = "*.viewroyal.ai/*", zone_name = "viewroyal.ai" }
]
```
Also create a DNS record: either a specific CNAME for `esquimalt.viewroyal.ai` or a wildcard `*.viewroyal.ai` record pointing to the Worker. Use Cloudflare's proxied mode (orange cloud) for faster propagation.

**Detection:** Deploy and try to visit esquimalt.viewroyal.ai -- it will fail without this fix.

**Phase:** Infrastructure/routing phase. This is a prerequisite for everything else.

## Moderate Pitfalls

### Pitfall 6: Legistar Organization Name Mapping Loss

**What goes wrong:** The Legistar scraper sets `organization_name=self.municipality.name` for every meeting. Esquimalt has multiple bodies visible on their Legistar: Regular Council, Committee of the Whole, Advisory Planning Commission, and others. The scraper assigns the municipality name ("Corporation of the Township of Esquimalt") as the organization for ALL meetings, losing body differentiation entirely.

**Why it happens:** `meeting_type=event.get("EventBodyName")` is set correctly (it captures the body name), but `organization_name` uses the municipality name instead. The ingestion layer likely creates or matches organizations using `organization_name`, so all meetings end up under one org.

**Evidence found:**
- `apps/pipeline/pipeline/scrapers/legistar.py:91` -- `organization_name=self.municipality.name`
- Esquimalt's Legistar shows multiple bodies: Council, Committee of the Whole, Advisory Planning Commission, etc.

**Prevention:** Set `organization_name=event.get("EventBodyName")` so each Legistar body becomes its own organization in the database. Verify how the ingestion layer handles organization creation from this field.

**Phase:** Scraper validation phase.

---

### Pitfall 7: View Royal-Specific Hero Map Background on All Subdomains

**What goes wrong:** The home page hero section uses `backgroundImage: 'url(/view-royal-map.svg)'` -- a hand-drawn SVG map of View Royal's land mass, coastline, and neighbourhoods. The `ViewRoyalMap` component (`apps/web/app/components/home/view-royal-map.tsx`) is a 600-line SVG specifically depicting View Royal geography. Esquimalt users see View Royal's map outline behind their hero section.

**Prevention:** Either make the hero background municipality-aware (load a different asset per municipality) or replace with a generic/abstract background. The simplest fix: store a `hero_background` key in the municipality's `meta` JSONB field referencing the asset path, with a neutral default.

**Phase:** Branding phase.

---

### Pitfall 8: Onboarding Hardcodes View Royal Neighbourhoods

**What goes wrong:** `apps/web/app/routes/onboarding.tsx` has a hardcoded `NEIGHBOURHOODS` array with View Royal neighbourhoods ("Chilco", "Craigflower", "Eagle Creek", "Helmcken", etc.), placeholder text "e.g. 45 View Royal Ave", and heading "Where in View Royal?". Esquimalt users see View Royal neighbourhood names during signup.

**Consequences:** Esquimalt users select View Royal neighbourhoods. Their subscription is created for the wrong area. Proximity-based alerts will reference wrong geography.

**Prevention:** Move neighbourhood lists to the municipality's `meta` JSONB field or a separate table. Load dynamically based on the current municipality context. The onboarding loader already has access to the municipality.

**Phase:** Must be addressed before Esquimalt users can sign up.

---

### Pitfall 9: Legistar Video URL Format Unknown

**What goes wrong:** The scraper stores `event.get("EventVideoPath")` as the video URL. Esquimalt may use YouTube, Granicus MediaManager, or an inline player instead of Vimeo. The entire video infrastructure (Vimeo proxy Worker, video URL resolution in `vimeo.server.ts`, video player component) assumes Vimeo URLs.

**Evidence found:**
- `apps/web/app/services/vimeo.server.ts` -- Vimeo-specific URL resolution
- `apps/web/app/routes/api.vimeo-url.ts` -- Vimeo proxy API route
- Pipeline source_config has `"video_source": {"type": "legistar_inline"}` but this is untested
- The video source abstraction exists in the pipeline but web app video playback is Vimeo-centric

**Consequences:** Video links may not resolve. The Vimeo proxy rejects non-Vimeo URLs. Video playback fails silently on meeting detail pages. Users see broken video sections.

**Prevention:** Before building anything, make a test API call to Esquimalt's Legistar Events endpoint and examine `EventVideoPath` values. Determine the video hosting provider. Update the web app video player to handle non-Vimeo sources gracefully (direct URL embed, YouTube embed, or null state).

**Phase:** Scraper validation phase -- investigate before coding.

---

### Pitfall 10: R2 Image URLs Hardcoded to images.viewroyal.ai

**What goes wrong:** `apps/web/app/routes/document-viewer.tsx` hardcodes `https://images.viewroyal.ai/` in three places as the base URL for document images from R2 storage. If Esquimalt document images are stored in the same R2 bucket, the URL technically works but the domain is wrong for Esquimalt users. If separate buckets are used, images break completely.

**Prevention:** Make the image base URL configurable via environment variable or municipality context. Use a shared domain or derive from the current municipality's configuration.

**Phase:** Infrastructure phase.

---

### Pitfall 11: RAG System Prompt Defaults to "Town of View Royal"

**What goes wrong:** `apps/web/app/services/rag.server.ts` lines 883 and 961 have default parameters `municipalityName = "Town of View Royal"` for the orchestrator and final system prompts. If the municipality name isn't passed through correctly, the AI answers Esquimalt questions while believing it's analyzing View Royal data.

**Prevention:** Verify that the RAG pipeline receives the correct municipality context from the request. The default parameter is a fallback -- ensure the actual value is always passed.

**Phase:** Municipality scoping phase.

---

### Pitfall 12: About Page and Legal Pages Have Hardcoded Content

**What goes wrong:** `about.tsx` has hardcoded "ViewRoyal.ai" branding and refers to "Town of View Royal" in meta tags and body copy. `privacy.tsx` references "public records provided by [municipality]" with a View Royal fallback. The about page's "how it works" section references CivicWeb PDFs and Vimeo (View Royal's sources), not Legistar (Esquimalt's source). Contact email is `kyle@viewroyal.ai`.

**Prevention:** Make these pages municipality-aware. The about page should describe the correct data sources per municipality. Legal pages already have fallback patterns but need the meta tags and body content updated.

**Phase:** Branding phase, lower priority.

## Minor Pitfalls

### Pitfall 13: Legistar Date Parsing Edge Cases

**What goes wrong:** The scraper's date parsing (`event_date_str.replace("T", " ").split("+")[0].split("Z")[0]`) is fragile. Some Legistar instances return dates with unusual timezone offsets or formats the parser does not handle.

**Prevention:** Use `dateutil.parser.parse()` or at minimum test with actual Esquimalt API response date formats before running the full scrape.

**Phase:** Scraper validation.

---

### Pitfall 14: Legistar Attachment URLs May Point to HTML Viewer, Not PDFs

**What goes wrong:** Legistar `MatterAttachmentHyperlink` sometimes points to Legistar's HTML viewer page rather than a direct PDF download. The scraper's `_download_file` would download the HTML page and save it as if it were a PDF. The ingestion layer then fails or produces garbage when trying to parse the "PDF."

**Prevention:** Check `Content-Type` response headers on downloads. If the response is `text/html` instead of `application/pdf`, follow redirects or extract the actual PDF URL from the HTML page. Validate file magic bytes after download.

**Phase:** Scraper validation.

---

### Pitfall 15: Unknown Subdomain 404 Not Implemented

**What goes wrong:** The milestone requires "Unknown subdomains return 404" but the current Worker entry point (`workers/app.ts`) has no hostname checking at all. If wildcard DNS and wildcard routes are set up, ANY subdomain (e.g., `garbage.viewroyal.ai`) will render the app with View Royal data (due to the default slug).

**Prevention:** Add hostname validation early in the Worker fetch handler. Parse the subdomain, look it up against known municipality slugs. If unknown, return a 404 response immediately. This must come before the React Router handler.

**Phase:** Routing phase.

---

### Pitfall 16: DNS Propagation Window

**What goes wrong:** Adding DNS records for `esquimalt.viewroyal.ai` (or a wildcard `*.viewroyal.ai`) takes time to propagate outside Cloudflare's network. During this window, the subdomain may be unreachable for some users.

**Prevention:** Set up DNS records days before the launch announcement. Use Cloudflare's proxied records (orange cloud) which propagate quickly within Cloudflare's edge network. Test with `curl --resolve` to verify Worker routing before DNS propagation completes.

**Phase:** Infrastructure phase, do early.

---

### Pitfall 17: Supabase Queries Missing Municipality Filter on Joined Tables

**What goes wrong:** When adding `municipality_id` filters to service queries, it's easy to filter the primary table but forget joined tables. For example, filtering meetings by municipality but not filtering the people shown in meeting transcripts could still show cross-municipality people. The `people` table has no direct `municipality_id` column -- it uses memberships via organizations.

**Prevention:** Follow the pattern already established in the OCD API endpoints (e.g., `apps/web/app/api/ocd/endpoints/people.ts`) which joins through `memberships.organizations.municipality_id`. Document which tables have direct `municipality_id` and which require joins.

**Phase:** Municipality scoping phase.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Scraper validation | Legistar 1000-result limit (Pitfall 4) | Add OData pagination before first real scrape |
| Scraper validation | Video URL format unknown (Pitfall 9) | Test Esquimalt Legistar API manually first, check EventVideoPath values |
| Scraper validation | Organization name always municipality name (Pitfall 6) | Use EventBodyName for organization_name |
| Scraper validation | Attachment URLs may point to HTML viewer (Pitfall 14) | Validate Content-Type on downloads |
| Scraper validation | Date parsing edge cases (Pitfall 13) | Test with real API responses |
| Infrastructure/DNS | Wrangler routes miss subdomains (Pitfall 5) | Add wildcard route pattern and DNS CNAME before anything else |
| Infrastructure/DNS | DNS propagation delay (Pitfall 16) | Create DNS records days before launch |
| Municipality scoping | Service layer returns all municipalities' data (Pitfall 1) | Add municipality_id filter to every service function BEFORE ingesting data |
| Municipality scoping | getMunicipality defaults to view-royal (Pitfall 2) | Wire hostname to slug resolution |
| Municipality scoping | Joined table queries miss municipality filter (Pitfall 17) | Follow OCD API patterns for joins through organizations |
| Municipality scoping | RAG defaults to "Town of View Royal" (Pitfall 11) | Pass municipality context through to RAG system prompts |
| Subdomain routing | Unknown subdomains served without 404 (Pitfall 15) | Validate hostname in Worker, return 404 for unknowns |
| Branding | 30+ files with hardcoded "ViewRoyal.ai" (Pitfall 3) | Create branding utility, sweep all files |
| Branding | Hero map is View Royal specific (Pitfall 7) | Make hero background municipality-aware or generic |
| Branding | Onboarding has View Royal neighbourhoods (Pitfall 8) | Load neighbourhoods from municipality meta |
| Branding | R2 image URLs hardcoded (Pitfall 10) | Make image base URL configurable |
| Branding | About/legal pages hardcoded (Pitfall 12) | Update to use municipality context |

## Sources

- Direct codebase inspection of `apps/web/app/services/`, `apps/web/app/routes/`, `apps/web/app/components/`, `apps/web/app/api/`, `apps/pipeline/pipeline/scrapers/`, `apps/web/workers/app.ts`, `apps/web/wrangler.toml`
- [Legistar Web API Help Page](https://webapi.legistar.com/Help) -- 1000 result limit, OData pagination
- [Legistar Web API Examples](https://webapi.legistar.com/Home/Examples) -- query conventions
- [Cloudflare Workers Routes Documentation](https://developers.cloudflare.com/workers/configuration/routing/routes/) -- route pattern syntax, wildcard subdomain matching
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) -- alternative to route patterns for subdomains
- [Cloudflare Workers SDK Issue #4369](https://github.com/cloudflare/workers-sdk/issues/4369) -- wildcard subdomain routing discussion
- [Esquimalt Legistar Portal](https://esquimalt.ca.legistar.com/) -- confirms Legistar usage with multiple body types
- [Esquimalt Council Meetings Page](https://www.esquimalt.ca/government-bylaws/council-meetings/council-committee-meetings-online-legistar) -- confirms Legistar as primary platform
