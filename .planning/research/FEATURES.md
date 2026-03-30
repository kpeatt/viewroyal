# Feature Landscape

**Domain:** Esquimalt ingestion and subdomain-based multi-site launch
**Researched:** 2026-03-30

## Table Stakes

Features required for Esquimalt to feel like a real launch, not a broken mirror of View Royal.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Legistar HTML scraper (not Web API) | **CRITICAL:** The existing `LegistarScraper` uses the Legistar Web API (`webapi.legistar.com`), but Esquimalt has NOT enabled API access. All calls to `webapi.legistar.com/v1/esquimalt/...` return 500 with "LegistarConnectionString setting is not set up in InSite." Must scrape `esquimalt.ca.legistar.com` HTML instead. | High | Replaces or augments existing `scrapers/legistar.py` | This is the single biggest risk. The entire scraper needs rewriting from JSON API calls to HTML parsing of Legistar's ASP.NET pages. Calendar.aspx, MeetingDetail.aspx, View.ashx patterns are the scraping surface. |
| Hostname-based subdomain routing | Users at `esquimalt.viewroyal.ai` must see Esquimalt data, not View Royal. Currently `getMunicipality()` is hardcoded to `slug = "view-royal"`. | Med | wrangler.toml route config, DNS wildcard, Worker fetch handler | Worker extracts hostname, maps subdomain to municipality slug, passes to root loader. |
| Municipality context from hostname in root loader | Root loader must derive municipality slug from `request.url` hostname instead of hardcoded default. | Low | Hostname routing working | `getMunicipality(supabase, slug)` already accepts a slug parameter -- just need to extract it from hostname. |
| Esquimalt municipality row in DB | `municipalities` table needs an Esquimalt entry with correct `source_config`, `map_center_lat/lng`, `website_url`, etc. | Low | None | Seed via migration or manual insert. `source_config` must reflect actual scraping approach (HTML, not API). |
| Esquimalt organizations in DB | Council, Committee of the Whole, Advisory Planning Commission, etc. from Legistar's department list. | Low | Municipality row exists | Legistar shows 11 body types: Council, COTW, Special Meeting, APC, APC Design Review, Board of Variance, Local Grant Committee, etc. |
| Full pipeline run for Esquimalt | Scrape, download PDFs, ingest (AI refine), embed. No diarization initially (Granicus video is a separate concern). | Med | Scraper working, municipality row seeded | Pipeline already supports `--municipality esquimalt`. Ingester already takes `municipality_id`. |
| Unknown subdomain 404 | `random.viewroyal.ai` must return a proper 404, not crash or show View Royal data. | Low | Hostname routing | Lookup slug in `municipalities` table; if not found, return 404 response. |
| Wildcard DNS + SSL for `*.viewroyal.ai` | Subdomains must resolve and have valid TLS certificates. | Low | Cloudflare DNS access | Cloudflare provides free wildcard SSL. Add `*.viewroyal.ai` CNAME or use route patterns. |
| View Royal still works at apex domain | `viewroyal.ai` (no subdomain) must continue serving View Royal data, not break. | Low | Hostname routing | Map empty subdomain / apex to `view-royal` slug as default. |

## Differentiators

Features that would enhance the launch but are not strictly required for MVP.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Granicus video integration | Esquimalt uses `esquimalt.ca.granicus.com` for meeting recordings. Linking to or embedding these videos would provide feature parity with View Royal's Vimeo integration. | Med | Video URL extraction from Legistar HTML or Granicus API | Granicus player URLs follow `player/clip/{id}?view_id=1` pattern. Could store as external link initially without download/diarization. |
| Granicus video download + diarization | Full transcript extraction from Esquimalt meetings via yt-dlp or Granicus stream download, then MLX diarization. | High | Granicus video integration, yt-dlp Granicus support | Would give Esquimalt transcript search + RAG Q&A from video. Major effort; defer to post-launch. |
| Structured data fast path for Legistar | Legistar HTML has structured agenda items, motions, and vote records already parsed. Skip Gemini AI refinement for data that's already structured. | Med | HTML scraper complete | The PROJECT.md mentions "Legistar scraper with structured data fast path" as v1.0. If Legistar HTML exposes vote roll calls and motion text, ingest directly without AI. |
| People auto-discovery from Legistar | Legistar lists council members with titles and seats. Auto-seed `people` table from scraped data instead of manual entry. | Low | HTML scraper | Legistar's Departments.aspx and MainBody.aspx list members. |
| Cross-municipality search | Users searching on one subdomain could optionally see results from other municipalities. | High | Both municipalities ingested | Defer -- scope creep. Each subdomain is its own silo for now. |
| Municipality landing page | A page at `viewroyal.ai` (apex) showing all available municipalities with links to their subdomains. | Low | Multiple municipalities exist | Nice touch for discovery. Could be simple card grid. |

## Anti-Features

Features to explicitly NOT build for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Shared authentication across subdomains | Supabase Auth cookies are domain-scoped. Cross-subdomain SSO adds complexity (shared cookie domain, token relay). | Each subdomain has independent auth. Users sign up per-municipality. Acceptable at current scale. |
| Custom domains per municipality (e.g., `esquimalt.civic.ai`) | Requires Cloudflare for Platforms, custom hostname provisioning, SSL cert management. Way over-engineered for 2 municipalities. | Subdomain pattern (`{slug}.viewroyal.ai`) is sufficient. Revisit if/when serving 10+ municipalities. |
| Esquimalt-specific UI theming | Different colors/logos per municipality adds maintenance burden and brand confusion. | Shared UI with municipality name/classification dynamically rendered (already done in v1.7 multi-tenancy work). |
| Video diarization for Esquimalt at launch | Granicus video download + MLX diarization is a significant effort. Esquimalt meetings are useful even without transcripts. | Launch with documents only. Add video in a follow-up phase. Link to Granicus player as external video source. |
| Backfilling all historical Esquimalt meetings | Hundreds of meetings going back years. Unnecessary for launch validation. | Scrape recent 6-12 months. Backfill later once scraper is proven stable. |
| Legistar Web API integration | API is not enabled for Esquimalt. Don't waste time trying to get Granicus to enable it. | Scrape HTML directly. More resilient anyway -- many Canadian municipalities don't enable the API. |

## Feature Dependencies

```
Esquimalt municipality row in DB
  --> Esquimalt organizations in DB
  --> Legistar HTML scraper working
    --> Full pipeline run (scrape + ingest + embed)
      --> Granicus video links (differentiator)
      --> Structured data fast path (differentiator)

Wildcard DNS + SSL
  --> Hostname routing in Worker
    --> Municipality context from hostname in root loader
      --> Unknown subdomain 404
      --> View Royal apex domain still works
```

## MVP Recommendation

**Phase 1: Scraper validation (highest risk)**
1. Rewrite Legistar scraper from Web API to HTML scraping of `esquimalt.ca.legistar.com`
2. Seed Esquimalt municipality + organizations in DB
3. Run pipeline for recent meetings (3-6 months)
4. Verify data quality in DB

**Phase 2: Subdomain routing**
1. Add wildcard route to wrangler.toml (`*.viewroyal.ai/*`)
2. Extract subdomain from hostname in Worker fetch handler
3. Pass municipality slug to root loader's `getMunicipality()`
4. Handle unknown subdomains with 404
5. Verify View Royal apex domain unaffected

**Defer:**
- Granicus video integration: add as external links only, no download/diarization
- Historical backfill: do recent meetings first, expand once stable
- Cross-municipality search: not needed with 2 municipalities

## Critical Research Finding

**The existing Legistar scraper (`pipeline/scrapers/legistar.py`) will NOT work for Esquimalt.** It calls `webapi.legistar.com/v1/{client_id}/Events` which returns HTTP 500 because Esquimalt hasn't enabled the Legistar Web API in their Granicus/InSite configuration. The error message is explicit: "LegistarConnectionString setting is not set up in InSite for client: esquimalt."

This means the scraper must be rewritten to parse HTML from `esquimalt.ca.legistar.com` (ASP.NET WebForms pages: Calendar.aspx, MeetingDetail.aspx, View.ashx). This is the single highest-complexity, highest-risk item in this milestone.

Esquimalt's Legistar HTML site exposes:
- Calendar with all meeting types (Council, COTW, APC, Special Meetings, etc.)
- Agenda and Minutes PDFs via `View.ashx?M=A&ID={id}` and `View.ashx?M=M&ID={id}`
- Meeting detail pages with agenda items and attachments
- Video links to Granicus player (`esquimalt.ca.granicus.com/player/clip/{id}`)
- 11 body types across council and advisory committees

The `opencivicdata/python-legistar-scraper` project on GitHub is a maintained reference implementation for HTML-based Legistar scraping that could inform the approach.

## Sources

- [Esquimalt Legistar Calendar](https://esquimalt.ca.legistar.com/Calendar.aspx) - Verified HTML scraping surface
- [Esquimalt Council Meetings page](https://www.esquimalt.ca/government-bylaws/council-meetings/council-committee-meetings-online-legistar) - Confirms Legistar usage
- [CDP Scrapers - Finding Legistar ID](https://councildataproject.org/cdp-scrapers/finding_legistar_id.html) - Legistar client ID discovery process
- [CDP Scrapers - Legistar Notes](https://councildataproject.org/cdp-scrapers/legistar_scraper.html) - API-based approach (won't work here)
- [opencivicdata/python-legistar-scraper](https://github.com/opencivicdata/python-legistar-scraper) - HTML scraping reference implementation
- [Cloudflare Workers Routes docs](https://developers.cloudflare.com/workers/configuration/routing/routes/) - Wildcard subdomain routing
- [Cloudflare Custom Domains docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) - Alternative to routes
- [Esquimalt Granicus video example](https://esquimalt.ca.granicus.com/player/clip/1182?meta_id=141966) - Confirms Granicus for meeting video
- Legistar Web API error response (tested 2026-03-30): HTTP 500 for `esquimalt`, `esquimalt.ca`, `esquimaltca`, `Esquimalt` client IDs - all return "LegistarConnectionString not set up in InSite"
