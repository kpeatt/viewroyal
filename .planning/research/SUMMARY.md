# Project Research Summary

**Project:** v1.8 Esquimalt Launch — Legistar Ingestion + Subdomain Routing
**Domain:** Multi-municipality civic intelligence platform expansion
**Researched:** 2026-03-30
**Confidence:** HIGH

## Executive Summary

This milestone expands viewroyal.ai from a single-municipality platform (View Royal) to a multi-municipality one by adding Esquimalt as a second municipality. The work splits into two independent tracks: (1) a pipeline track that ingests Esquimalt council meeting data, and (2) a web app track that routes `esquimalt.viewroyal.ai` to Esquimalt-scoped data. The platform's multi-tenancy foundations (municipality_id on all core tables, pluggable scraper registry, slug-based municipality resolution) were built in earlier milestones. What remains is wiring them together and fixing the gaps.

The single highest-risk item is that the existing Legistar scraper uses the Legistar Web API, which is not enabled for Esquimalt. This is a confirmed, verified blocker — API calls return an explicit HTTP 500 error. The scraper must be rewritten to parse Legistar's ASP.NET InSite HTML pages (Calendar.aspx, MeetingDetail.aspx) using BeautifulSoup. No new dependencies are needed. The existing `StaticHtmlScraper` provides the correct pattern. The InSite HTML is server-rendered, so no headless browser is required.

The web app risks are concentrated in two places: service layer queries that currently have zero municipality scoping (allowing data leakage the moment Esquimalt data enters the DB), and 30+ files with hardcoded "ViewRoyal.ai" branding that will render on Esquimalt pages. The service layer scoping fix must happen before any Esquimalt data is ingested. The branding cleanup, while broad, is mechanical — grep-and-replace guided by the pitfalls research. The infrastructure changes (wrangler.toml wildcard route, DNS CNAME) are straightforward Cloudflare configuration with no novel complexity.

## Key Findings

### Recommended Stack

No new packages are required for either the pipeline or the web app. BeautifulSoup4, requests, and yt-dlp are already in `pyproject.toml`. Subdomain routing uses the standard `URL` API available in Cloudflare Workers. Municipality context flows through `AppLoadContext` — an existing React Router pattern. The only Cloudflare-specific configuration change is adding a wildcard route pattern (`*.viewroyal.ai/*`) to `wrangler.toml` and a DNS CNAME record.

**Core technologies:**
- **BeautifulSoup4**: HTML parsing for Legistar InSite pages — already installed, used by `StaticHtmlScraper`
- **requests**: HTTP downloads of PDFs and HTML pages — already installed
- **yt-dlp**: Granicus video extraction — already installed; Granicus support unconfirmed, needs testing
- **Cloudflare Workers URL API**: hostname-to-slug resolution — built-in, no package needed
- **Supabase**: municipality row + organizations seeding — existing infrastructure

### Expected Features

**Must have (table stakes):**
- Legistar HTML scraper (`legistar_insite` type) — the Web API is blocked, HTML scraping is the only path
- Municipality scoping on all service layer queries — prevents data leakage between municipalities
- Hostname routing in Worker + AppLoadContext passthrough — makes subdomain resolve to correct data
- Esquimalt municipality and organizations rows in DB — prerequisite for everything else
- Wildcard DNS + wrangler.toml route — makes the subdomain reachable at the infrastructure level
- Unknown subdomain 404 — prevents garbage subdomains from serving View Royal data
- Dynamic branding (page titles, OG tags, navbar, footer) — Esquimalt users must not see "ViewRoyal.ai"
- Onboarding neighbourhood list from municipality context — Esquimalt users must not see View Royal neighbourhoods

**Should have (differentiators):**
- Granicus video links (as external links, no download/diarization) — feature parity with View Royal video
- Structured data fast path for Legistar — agenda items arrive pre-structured, skip AI refinement
- People auto-discovery from Legistar body member lists — avoids manual people seeding
- Municipality landing page at apex domain — discovery for multiple municipalities

**Defer (v2+):**
- Granicus video download + MLX diarization — significant effort, not needed for document-only launch
- Historical backfill beyond 6-12 months — validate scraper stability before committing to large backfill
- Cross-municipality search — not useful at 2 municipalities
- Custom domains per municipality (e.g., `esquimalt.civic.ai`) — Cloudflare for Platforms is over-engineered at this scale

### Architecture Approach

The architecture is already multi-tenant. The Worker resolves municipality from hostname via a static in-code map (no DB lookup — municipalities change rarely and require a deploy anyway), passes the slug through `AppLoadContext`, and the root loader fetches the municipality object. All downstream routes and service queries already accept municipality ID. The changes are surgical: inject slug at the Worker layer, remove the hardcoded `"view-royal"` default from `getMunicipality()`, and add `municipality_id` filters to every service function. The pipeline needs a new `LegistarInsiteScraper` class registered as `"legistar_insite"` source type, keeping the existing `LegistarScraper` (Web API) intact for municipalities where the API does work.

**Major components:**
1. `workers/app.ts` — NEW static hostname map + `resolveSlugFromHostname()`, slug passed into `AppLoadContext`
2. `pipeline/scrapers/legistar_insite.py` — NEW HTML scraper using BeautifulSoup, registered as `"legistar_insite"` type
3. `app/services/*.ts` — MODIFY all service functions to accept and filter by `municipality_id`
4. `app/root.tsx` — MODIFY root loader to read slug from context, pass to required `getMunicipality()`
5. `app/services/municipality.ts` — MODIFY `getMunicipality()` to require slug (remove default parameter)
6. Supabase migration — NEW Esquimalt municipality row with `legistar_insite` source config
7. `wrangler.toml` — MODIFY to add wildcard subdomain route and Esquimalt custom domain entry

### Critical Pitfalls

1. **Service layer has zero municipality scoping** — Add `municipality_id` filter to every function in `apps/web/app/services/` before ingesting any Esquimalt data. The `apps/web/app/api/endpoints/` layer shows exactly how to do this.

2. **Legistar Web API not available for Esquimalt** — Do not attempt Web API calls. Rewrite the scraper to parse InSite HTML. This is confirmed by direct API testing — not a configuration issue that can be fixed.

3. **Wrangler routes only match apex domain** — Add `*.viewroyal.ai/*` wildcard pattern to `wrangler.toml` AND create a DNS CNAME record. Without both changes, the Worker never receives subdomain requests.

4. **Hardcoded "ViewRoyal.ai" in 30+ files** — Create a branding utility derived from municipality context. Grep for `ViewRoyal` and `viewroyal.ai` across `apps/web/app/` (77 files match). Root meta function, navbar logo, footer, OG image generator, settings page, and about page all need updating.

5. **Legistar organization name always set to municipality name** — Change `organization_name=self.municipality.name` to `organization_name=event.get("EventBodyName")` so Council, Committee of the Whole, Advisory Planning Commission, etc. become separate organizations rather than collapsing under one.

## Implications for Roadmap

The dependency graph dictates a 4-phase structure with two parallel tracks in phase 2.

### Phase 1: Foundation — DB Seeding + Service Layer Scoping

**Rationale:** Two blocking prerequisites before anything else works. The municipality row must exist in DB before the pipeline can run or the web app can resolve to Esquimalt. The service layer must be scoped before Esquimalt data enters the DB — contamination is immediate and requires a DB wipe to reverse.

**Delivers:** Esquimalt municipality + organizations rows in DB; all service functions filtered by `municipality_id`; `getMunicipality()` signature updated to require slug.

**Addresses:** Table stakes: Esquimalt DB row, municipality context, service scoping.

**Avoids:** Pitfall 1 (data leakage between municipalities), Pitfall 2 (hardcoded `"view-royal"` slug default).

### Phase 2: Scraper + Routing (parallel tracks)

**Rationale:** Pipeline and web app routing are independent and can proceed in parallel once Phase 1 is complete. The scraper is the highest-risk track and benefits from an early start.

**Track A — Pipeline:** New `LegistarInsiteScraper` parsing `Calendar.aspx` and `MeetingDetail.aspx`. Test run against recent 5-10 Esquimalt meetings. Fix bugs (org name mapping, date parsing, pagination for 1000+ event limit). Full pipeline run (scrape + ingest + embed). No diarization at launch.

**Track B — Web App Routing:** Hostname resolver in `workers/app.ts` with static map. `AppLoadContext` type extension. Root loader reads slug from context. Fix all `getMunicipality()` call sites. Unknown subdomain 404. `wrangler.toml` wildcard route + DNS CNAME.

**Addresses:** All remaining table stakes features.

**Avoids:** Pitfall 4 (OData pagination for 1000-result limit), Pitfall 5 (wrangler routes miss subdomains), Pitfall 6 (org names collapse to municipality name), Pitfall 13 (date parsing edge cases), Pitfall 14 (attachment URLs pointing to HTML viewer), Pitfall 15 (unknown subdomains served without 404).

### Phase 3: Branding Cleanup

**Rationale:** Cannot ship a multi-municipality platform with "ViewRoyal.ai" hardcoded everywhere. This phase is broad (30+ files) but mechanical. Must complete before public launch.

**Delivers:** Dynamic page titles, OG tags, navbar logo, footer derived from municipality context. Municipality-aware hero background. Onboarding neighbourhood list loaded from municipality meta JSONB. R2 image base URL configurable. RAG system prompts use correct municipality name.

**Addresses:** Pitfall 3 (30+ hardcoded branding files), Pitfall 7 (hero map is View Royal geography), Pitfall 8 (onboarding hardcodes View Royal neighbourhoods), Pitfall 10 (R2 image URLs hardcoded to `images.viewroyal.ai`), Pitfall 11 (RAG defaults to "Town of View Royal").

**Note:** Create DNS records during this phase — do not wait until Phase 4. DNS propagation takes time and should be done well before go-live.

### Phase 4: Verification + Ship

**Rationale:** End-to-end verification catches integration issues before public launch. Checks that both subdomains work, data is isolated, and no hardcoded branding remains.

**Delivers:** `viewroyal.ai` still serves View Royal; `esquimalt.viewroyal.ai` serves Esquimalt; unknown subdomains return 404; data does not leak between municipalities; branding is correct on both subdomains; Granicus video links resolve.

**Avoids:** Pitfall 16 (DNS propagation delay — records already created in Phase 3).

### Phase Ordering Rationale

- DB seeding comes before the scraper because the pipeline needs `municipality_id` to insert data
- Service scoping comes before data ingestion because contamination is immediate and requires a DB wipe to fix
- Scraper and routing are parallel because they share no code and neither blocks the other
- Branding cleanup comes after routing because it depends on municipality context flowing correctly end-to-end
- DNS records are created in Phase 3 (not Phase 4) to allow propagation time before go-live

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 Track A (scraper):** Granicus video URL extraction via yt-dlp is unconfirmed. Test actual `EventVideoPath` values from Legistar HTML before coding video support. May need a custom Granicus extractor if yt-dlp does not support the platform.
- **Phase 2 Track B (routing):** The exact behavior of a `custom_domain = true` route entry coexisting with the existing bare-domain route entry in `wrangler.toml` is rated MEDIUM confidence. Verify on first deploy to staging before touching production.

Phases with standard patterns (skip research-phase):
- **Phase 1 (DB + service scoping):** Supabase SQL inserts and adding `.eq("municipality_id", id)` filters are mechanical. No research needed.
- **Phase 3 (branding):** Grep-and-replace pattern guided by the pitfalls research. No novel architecture decisions.
- **Phase 4 (verification):** Standard deployment checklist.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new packages. Legistar Web API blockage confirmed by direct API calls with explicit error messages. |
| Features | HIGH | Blockers are concrete (API error, observed code). Table stakes list derived from direct codebase inspection. |
| Architecture | HIGH | Based on direct codebase analysis of all affected files. Static hostname map pattern well-justified. One MEDIUM item: `custom_domain` route interaction in wrangler.toml needs deploy-time verification. |
| Pitfalls | HIGH | All critical pitfalls verified with specific file/line references. Not inferred — directly observed in the codebase. |

**Overall confidence:** HIGH

### Gaps to Address

- **yt-dlp Granicus support:** Unverified. Test against `esquimalt.ca.granicus.com` video URL before deciding whether to rely on yt-dlp or build a custom Granicus extractor. This decision gates Phase 2 Track A video work.
- **Legistar InSite HTML structure variation:** Research describes the predictable Telerik RadGrid pattern, but actual scraper implementation will encounter Esquimalt-specific field variations. Expect 1-2 days of iteration on the HTML parser during Phase 2.
- **wrangler.toml custom_domain + wildcard route interaction:** Rated MEDIUM confidence on whether `custom_domain = true` on a subdomain route coexists cleanly with a wildcard pattern route. Verify on first staging deploy before production.
- **People table scoping for Esquimalt:** The `people` table has no direct `municipality_id` — it joins through memberships/organizations. The service layer scoping fix must handle this join correctly (follow the OCD API endpoint patterns). See Pitfall 17.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of `workers/app.ts`, `root.tsx`, `municipality.ts`, `services/*.ts`, `api/endpoints/`, `scrapers/legistar.py`, `scrapers/__init__.py`, `orchestrator.py`, `wrangler.toml` — architecture and pitfall findings
- Legistar Web API error responses (tested 2026-03-30): HTTP 500 for all Esquimalt client ID variants — API blockage confirmation
- [Cloudflare Workers Routes docs](https://developers.cloudflare.com/workers/configuration/routing/routes/) — wildcard subdomain route pattern syntax
- [Wrangler Configuration Reference](https://developers.cloudflare.com/workers/wrangler/configuration/) — custom_domain route entries

### Secondary (MEDIUM confidence)
- [Cloudflare Workers Custom Domains docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) — custom_domain route behavior
- [Esquimalt Legistar Portal](https://esquimalt.ca.legistar.com/) — verified HTML scraping surface and body types
- [opencivicdata/python-legistar-scraper](https://github.com/opencivicdata/python-legistar-scraper) — HTML scraping reference implementation
- [Legistar Web API Help](https://webapi.legistar.com/Help) — 1000-result pagination limit documented

### Tertiary (LOW confidence)
- yt-dlp Granicus support — inferred from yt-dlp's broad platform support; needs testing against actual Esquimalt Granicus URLs before relying on it

---
*Research completed: 2026-03-30*
*Ready for roadmap: yes*
