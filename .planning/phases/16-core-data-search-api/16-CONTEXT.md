# Phase 16: Core Data & Search API - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

REST endpoints for meetings, people, matters, motions, and bylaws — each with list and detail views, cursor-based pagination, and consistent response envelopes. Plus a hybrid search endpoint across all content types. Built on the Hono API foundation from Phase 15.

</domain>

<decisions>
## Implementation Decisions

### Response serialization
- **Related data strategy:** Hybrid — compact summaries inline (title, date, id), full detail via separate request. e.g., a meeting detail includes agenda item summaries but full agenda item detail requires `/agenda-items/:slug`
- **Identifiers:** Slug-based IDs for all API-facing entities, not raw integer PKs. e.g., `/meetings/2024-01-15-regular-council` not `/meetings/42`. Slugs should be human-readable and deterministic from existing data (date + type for meetings, name for people, etc.)
- **Serializers:** All entities pass through explicit serializer functions — no raw DB rows in responses. Internal fields (created_at timestamps, internal flags, raw FKs) are stripped

### Search behavior
- **Two search tiers:** Keyword search available to all API key holders (uses Postgres tsvector). Hybrid/semantic search (vector + keyword) requires consumer to supply their own embedding API key (since generating query embeddings has a per-query cost)
- **Type filtering:** Results filterable by content type via query param (e.g., `?type=motions,meetings`). Consumers can narrow to specific entity types

### Claude's Discretion
- Field naming convention (snake_case vs camelCase) — pick what fits best for a civic data API
- Null handling strategy (include nulls vs omit empty fields)
- Snippet length and format for search results
- No-results behavior (empty array, suggestions, etc.)
- Default sort orders per entity type
- Default and max page sizes for pagination
- Cursor encoding approach (base64 opaque cursors per requirements)

</decisions>

<specifics>
## Specific Ideas

- Slug-based IDs should also be adopted in React Router routes (deferred — not this phase, but keep slug generation consistent so it can be reused)
- Hybrid search should leverage the existing Supabase vector+keyword infrastructure already used by the RAG Q&A feature
- The "bring your own API key for semantic search" model keeps the free tier sustainable while offering power users better results

</specifics>

<deferred>
## Deferred Ideas

- Migrate React Router web app routes from integer IDs to slug-based URLs — separate phase/task, but slug generation should be designed to support this
- "Bring your own Gemini key" for RAG Q&A feature (noted from todo: let users supply their own API key)

</deferred>

---

*Phase: 16-core-data-search-api*
*Context gathered: 2026-02-21*
