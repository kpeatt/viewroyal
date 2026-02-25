# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** Citizens can understand what their council decided, why, and who said what -- without attending meetings or reading hundreds of pages of PDFs.
**Current focus:** Phase 24 Tech Debt Cleanup

## Current Position

Phase: 23 (Cross-Link Fix -- gap closure)
Plan: 1 of 1 in current phase
Status: Phase 23 complete
Last activity: 2026-02-24 -- Plan 23-01 complete (fix 18 broken cross-links, create API Reference landing page)

Progress: [███████████████████████████████████] 100% (v1.4)

## Performance Metrics

**Velocity:**
- Total plans completed: 59 (across v1.0 + v1.1 + v1.2 + v1.3 + v1.4 + gap closure)
- Average duration: 4.0min
- Total execution time: ~5.5 hours

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
| 19-infrastructure-scaffolding | 2 | 5min | 3min |
| 20-openapi-integration-api-reference | 2 | 13min | 7min |
| 21-developer-guides | 2 | 5min | 3min |
| 22-reference-content-production | 2 | 13min | 7min |
| 23-cross-link-fix | 1 | 2min | 2min |

## Accumulated Context

### Decisions

All v1.0-v1.3 decisions archived -- see PROJECT.md Key Decisions table.

New for v1.4:
- fumadocs v16 + Next.js 16 with `output: 'export'` for static site (no OpenNext/Workers runtime)
- Cloudflare Workers static assets via `[assets]` directive (not Cloudflare Pages -- deprecated)
- `apps/docs/` fully independent in pnpm workspace (avoids workers-sdk #10941 cross-install)
- `generateFiles()` for OpenAPI MDX generation (not `openapiSource()` -- no RSC server in static export)
- Prebuild script fetches live spec with committed fallback for offline builds
- fumadocs-openapi v10 has built-in code sample generators (curl, JS, Python, Go, Java, C#) -- no custom generateCodeSamples needed
- chanfana double-prefixes base path in spec (/api/v1/api/v1/...) -- prebuild script fixes this
- chanfana doesn't emit tags/securitySchemes into spec despite registration -- prebuild injects them
- Guides use groupId="language" on Tabs for cross-page language preference persistence
- Getting Started guide starts with unauthenticated health check (Step 0) for instant gratification
- Pagination guide covers three patterns (cursor, page, hybrid search) with comparison table
- Error handling retry logic differentiates retryable (429, 500) from non-retryable (400, 401, 404) errors
- Single comprehensive Mermaid ER diagram with 8 entities and key columns (not grouped sub-diagrams)
- OCD endpoints documented inline in reference page (not linked to API Reference -- they use Hono routing, not chanfana)
- next-themes installed explicitly for Mermaid dark/light theme support (not re-exported by fumadocs-ui)
- Docs site baseUrl changed from /docs to / for root-level serving (post-deploy fix)
- Workers Static Assets deployment with wrangler.toml [assets] directive pointing to ./out
- Created api-reference/index.mdx landing page (hand-authored, gitignore exception added)
- Internal MDX links must omit /docs/ prefix -- fumadocs baseUrl is /
- .gitignore negation pattern for hand-authored files in auto-generated directories

### Pending Todos

1. **Let users supply their own Gemini API key** (api) -- Allow power users to provide their own Gemini key for RAG queries

### Blockers/Concerns

- bootstrap.sql is out of date with 30+ applied migrations -- technical debt to track
- Email delivery requires external Resend configuration
- Phase 7.1 Gemini Batch API backfill paused -- waiting on quota
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

Last session: 2026-02-25
Stopped at: Phase 23 complete, ready to plan Phase 24
Resume file: None

### Paused Work: Phase 7.1
Resume file: .planning/phases/07.1-upgrade-document-extraction-with-docling-and-gemini/.continue-here.md
Status: 309 meetings queued for re-extraction. 40,805 sections need embeddings. Waiting on Gemini quota.
