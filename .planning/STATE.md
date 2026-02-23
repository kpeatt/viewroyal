# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Citizens can understand what their council decided, why, and who said what -- without attending meetings or reading hundreds of pages of PDFs.
**Current focus:** Planning next milestone

## Current Position

Milestone: v1.3 Platform APIs -- SHIPPED 2026-02-22
Status: Milestone Complete
Last activity: 2026-02-22 -- v1.3 milestone archived

Progress: [███████████████████████████████████] 100% overall (50/50 plans across all milestones)

## Performance Metrics

**Velocity:**
- Total plans completed: 50 (across v1.0 + v1.1 + v1.2 + v1.3)
- Average duration: 4.2min
- Total execution time: ~5.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-schema-foundation | 2 | 6min | 3min |
| 02-multi-tenancy | 1 | 8min | 8min |
| 03-subscriptions-notifications | 2 | 19min | 10min |
| 04-home-page-enhancements | 2 | 30min | 15min |
| 05-advanced-subscriptions | 3 | 25min | 8min |
| 06-gap-closure-cleanup | 1 | 3min | 3min |
| 07-document-intelligence | 3 | 15min | 5min |
| 07.1-upgrade-document-extraction | 2 | 8min | 4min |
| 08-unified-search-hybrid-rag | 5 | 12min | 2min |
| 09-ai-profiling-comparison | 4 | 25min | 6min |
| 10-add-better-test-suite | 5 | 26min | 5min |
| 11-gap-closure-gemini-fix | 1 | 3min | 3min |
| 12-update-detection | 2 | 6min | 3min |
| 13-notifications | 1 | 2min | 2min |
| 14-scheduled-automation | 2 | 4min | 2min |
| 15-api-foundation | 2 | 11min | 6min |
| 16-core-data-search-api | 4 | 18min | 5min |
| 17-ocd-interoperability | 6 | 12min | 2min |
| 18-documentation-key-management | 2 | 9min | 5min |

## Accumulated Context

### Decisions

All v1.0-v1.2 decisions archived -- see PROJECT.md Key Decisions table.

New for v1.3:
- Hono router mounted in same Worker alongside React Router 7 (URL-prefix split at fetch level)
- chanfana for OpenAPI 3.1 generation, Zod v4 for schema validation
- SHA-256 key hashing with timing-safe comparison (not bcrypt -- keys are high-entropy)
- Cloudflare Workers Rate Limit binding for durable per-key rate limiting
- `/api/v1/*` prefix for public API; existing `/api/*` internal routes untouched
- [Phase 15]: Per-route municipality middleware pattern instead of wildcard catch-all to preserve NOT_FOUND for unregistered paths
- [Phase 15]: wrangler.toml [[ratelimits]] uses name field (not binding) per wrangler v4 schema
- [Phase 15]: Per-route auth middleware chaining (apiKeyAuth, rateLimit, municipality) for authenticated routes
- [Phase 15]: timingSafeEqual typed via inline SubtleCrypto extension (CF Workers types don't merge with DOM global)
- [Phase 16]: snake_case for all API field names (matches DB columns and civic API conventions)
- [Phase 16]: Always include null fields explicitly in responses (never omit empty fields)
- [Phase 16]: Slug dedup via ranked CTEs + suffixes for people (duplicate names) and bylaws (shared bylaw_numbers)
- [Phase 16]: People scoped to municipality via memberships -> organizations join (no municipality_id on people table)
- [Phase 16]: Voting summary aggregates Yes/In Favour as votes_for, No/Opposed as votes_against, Abstain/Recused as abstentions
- [Phase 16]: Motions scoped to municipality via inner join on meetings (no municipality_id on motions table)
- [Phase 16]: Mover filter resolves person slug to ID before applying filter (avoids complex join filter)
- [Phase 16]: Matter detail fetches motions via agenda_item_ids (motions linked to matters through agenda items)
- [Phase 16]: Page-based pagination for search (not cursor-based -- merged cross-type results are volatile)
- [Phase 16]: Position-based relevance scoring for textSearch results (PostgREST ordering as ts_rank proxy)
- [Phase 17]: Hand-rolled UUID v5 via Web Crypto (no uuid npm dep) with hardcoded namespace UUID for deterministic OCD IDs
- [Phase 17]: Separate OCD pagination (page-based) and envelope (results+pagination) from v1 API (cursor-based, data+pagination+meta)
- [Phase 17]: Plain Hono handlers (not chanfana) for OCD endpoints -- OCD has its own spec, no OpenAPI generation needed
- [Phase 17]: OCD ID reverse-lookup for detail endpoints -- fetch all entities, compute OCD IDs, find match (acceptable for small datasets)
- [Phase 17]: Wildcard :id{.+} route params to handle OCD IDs containing slashes
- [Phase 17]: Municipality middleware includes ocd_id in select; OCD endpoints use municipality.ocd_id directly instead of broken ocd_divisions join
- [Phase 17]: Worker fetch handler extended to route both /api/v1/* and /api/ocd/* to same Hono app (gap closure)
- [Phase 17]: Explicit .limit(100000) on full-table reverse-lookup queries to bypass PostgREST default row limit
- [Phase 18]: chanfana docs_url/openapi_url must be relative to base (chanfana prepends base automatically) -- /docs and /openapi.json not /api/v1/docs
- [Phase 18]: OCD endpoints registered via registerPath() even though outside chanfana base /api/v1 -- registerPath adds to spec JSON regardless of base path
- [Phase 18]: API key management route registered explicitly in routes.ts (not flat-file auto-discovery) because settings.tsx layout parent would swallow child route
- [Phase 18]: Per-key dialog state (revokeKeyId: string | null) for revoke confirmation to handle multiple active keys independently

### Pending Todos

1. **Let users supply their own Gemini API key** (api) -- Allow power users to provide their own Gemini key for RAG queries

### Blockers/Concerns

- bootstrap.sql is out of date with 30+ applied migrations -- technical debt to track
- Email delivery requires external Resend configuration
- Phase 7.1 Gemini Batch API backfill paused -- waiting on quota
- OCD division ID for View Royal corrected to `csd:5917047` (was Victoria `csd:5917034`) -- migration applied in 17-01
- Rate Limit binding pricing needs verification before production launch

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Change hero background to faded map view of View Royal with Ken Burns effect | 2026-02-18 | fb1d7909 | [1-change-the-hero-background-to-be-a-faded](./quick/1-change-the-hero-background-to-be-a-faded/) |
| 2 | Add beta banner to homepage header | 2026-02-18 | 77b17c18 | [2-add-beta-banner-to-homepage-header](./quick/2-add-beta-banner-to-homepage-header/) |
| 3 | Fix about page video hours showing 0 | 2026-02-18 | f8e1097d | [3-fix-about-page-video-hours-showing-0](./quick/3-fix-about-page-video-hours-showing-0/) |
| 4 | Dynamic OG meta tags per page | 2026-02-19 | 64256f7f | [4-dynamic-og-meta-tags-per-page](./quick/4-dynamic-og-meta-tags-per-page/) |
| 5 | Fix missing email alerts after pipeline ingestion | 2026-02-20 | dc50f436 | [5-bug-i-didn-t-get-an-email-sent-after-the](./quick/5-bug-i-didn-t-get-an-email-sent-after-the/) |
| 6 | Restructure root README as monorepo overview + pipeline README | 2026-02-20 | 18a6d11b | [6-update-main-readme-as-monorepo-readme-an](./quick/6-update-main-readme-as-monorepo-readme-an/) |

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 18-02-PLAN.md (API Key Management Page) -- Phase 18 Complete
Resume file: None

### Paused Work: Phase 7.1
Resume file: .planning/phases/07.1-upgrade-document-extraction-with-docling-and-gemini/.continue-here.md
Status: 309 meetings queued for re-extraction. 40,805 sections need embeddings. Waiting on Gemini quota.
