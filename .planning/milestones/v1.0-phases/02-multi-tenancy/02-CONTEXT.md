# Phase 2: Multi-Tenancy - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Merge PR #36 and validate: the web app dynamically adapts to any municipality in the database. No hardcoded "View Royal" references remain in user-facing code. PR #36 already implements this — phase work is merging, conflict resolution against PRs #35/#37 (now on main), and validation.

</domain>

<decisions>
## Implementation Decisions

### Municipality detection
- Hardcoded slug `"view-royal"` in the root loader for now — single tenant
- Slug stays in root loader code, not extracted to a config constant
- When a second municipality is added, detection strategy will be revisited (likely env var or subdomain routing)

### Failure behavior
- Hard error (500) if municipality lookup fails — municipality data is essential for every page
- No graceful fallback to hardcoded defaults; if the DB query fails, the site should error rather than show broken/stale data

### Pipeline scope
- Include all pipeline changes from PR #36 (ai_refiner.py, embed.py, ingester.py) — merge everything together
- Pipeline and web app multi-tenancy land as one unit

### Claude's Discretion
- Conflict resolution strategy when merging PR #36 onto main (after #35/#37 landed)
- Validation approach and test ordering
- Whether to adapt any PR #36 code for changes introduced by Phase 1

</decisions>

<specifics>
## Specific Ideas

- PR #36 is the implementation spec — 38 files, new `municipality.ts` service, root loader threading, dynamic meta tags, RAG prompt updates, Vimeo referer updates
- PR #36 adds `rss_url` and `contact_email` columns to `municipalities` table via Supabase migration

</specifics>

<deferred>
## Deferred Ideas

- Environment variable or subdomain-based municipality detection — revisit when second town is onboarded
- Per-municipality branding (logos, color themes, custom styling) — not in scope for text-based multi-tenancy
- RLS policies for data isolation — query filtering by municipality_id is sufficient for now

</deferred>

---

*Phase: 02-multi-tenancy*
*Context gathered: 2026-02-16*
