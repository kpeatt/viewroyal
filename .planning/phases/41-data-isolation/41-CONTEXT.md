# Phase 41: Data Isolation - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Municipality-scope all service layer queries, search RPCs, and RAG agent tools to prevent cross-municipality data leakage. This phase makes the web app safe for multi-municipality data before any Esquimalt data enters the database. Does NOT include hostname routing (Phase 43) or getMunicipality() default slug removal (Phase 43).

</domain>

<decisions>
## Implementation Decisions

### Scoping strategy
- Follow the API endpoint layer's join pattern for tables without direct municipality_id (motions via meetings.municipality_id inner join, people via org memberships)
- No schema changes — no adding municipality_id columns to motions/people tables
- Service functions receive the full municipality object (not just ID) — services can access slug, name, meta without extra lookups
- Leave getMunicipality() default slug ("view-royal") in place — Phase 43 removes it when hostname routing is wired

### Search & RAG scoping
- Add municipality_id parameter to the Postgres search RPCs themselves (keyword + vector) — filtering at query level, not post-query
- RAG agent tools receive municipality_id and scope their vector search + keyword search to the current municipality's data only
- No prompt-level scoping needed — tool-level scoping is sufficient

### Migration approach
- All 18 service files updated atomically in a single change — no partial state where some queries leak
- Add tests that verify municipality scoping (queries with municipality A don't return municipality B data)

### Claude's Discretion
- Exact test structure and test data setup
- Whether to create a helper/wrapper for the municipality_id filter pattern
- Order of file modifications within the atomic change

</decisions>

<specifics>
## Specific Ideas

No specific requirements — the API endpoint layer (`apps/web/app/api/endpoints/`) provides the exact pattern to follow for each table's scoping approach.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/app/api/endpoints/` — Every API endpoint already scopes by municipality_id, providing the exact pattern for each table
- `apps/web/app/api/endpoints/motions/list.ts` — Shows how to scope motions via `meetings.municipality_id` inner join
- `apps/web/app/api/endpoints/search.ts` — Shows municipality-scoped keyword search pattern

### Established Patterns
- API layer uses `muni.id` from resolved municipality object with `.eq("municipality_id", muni.id)`
- Tables without direct municipality_id use `!inner` join syntax: `.eq("meetings.municipality_id", muni.id)`
- Municipality object is already available in root loader and flows through route matches via `getMunicipalityFromMatches()`

### Integration Points
- `apps/web/app/services/*.ts` — All 18 service files need municipality_id filters
- `apps/web/app/services/hybrid-search.server.ts` — Search RPC calls need municipality_id parameter
- `apps/web/app/services/rag.server.ts` — RAG tool definitions need municipality context
- `apps/web/app/services/vectorSearch.ts` — Vector search needs municipality scoping
- Supabase RPCs (SQL functions) for hybrid search need municipality_id parameter added

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 41-data-isolation*
*Context gathered: 2026-03-30*
