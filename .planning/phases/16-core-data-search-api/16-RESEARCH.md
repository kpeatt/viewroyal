# Phase 16: Core Data & Search API - Research

**Researched:** 2026-02-21
**Domain:** REST API data endpoints, cursor-based pagination, response serialization, and hybrid search -- built on Hono + chanfana foundation from Phase 15
**Confidence:** HIGH

## Summary

Phase 16 adds 10 data endpoints (5 list + 5 detail) and a search endpoint to the Hono API established in Phase 15. The foundation is solid: Hono app with chanfana OpenAPI integration, API key auth, rate limiting, municipality middleware, and consistent error handling are all in place. This phase is primarily about building chanfana `OpenAPIRoute` endpoint classes, cursor-based pagination utilities, serializer functions, and a search endpoint that bridges the existing hybrid search infrastructure.

The database already has `tsvector` columns on motions, matters, agenda_items, key_statements, transcript_segments, and document_sections. It also has `halfvec` embedding columns and RPC functions (`hybrid_search_motions`, `hybrid_search_key_statements`, `hybrid_search_document_sections`, plus `match_*` functions for vector-only search). The existing `hybrid-search.server.ts` and `search.ts` services provide battle-tested patterns for combining keyword and vector results. The API search endpoint can leverage these directly for keyword search, and conditionally activate vector search when a consumer supplies an embedding API key.

Slug generation is the main new infrastructure needed. No slug columns currently exist on any entity tables. The decision to use slugs as API-facing identifiers (e.g., `/meetings/2024-01-15-regular-council`) means we need a migration to add computed slug columns, plus a lookup-by-slug query pattern. Meetings have 5 cases of duplicate date+type combos (out of 737), so the slug formula needs a disambiguation suffix. People names are unique (no duplicates among 837 rows). Bylaws have unique bylaw_numbers. Matters have varied identifier formats that are not reliably slugifiable, so a numeric-prefixed approach (e.g., `2600-ocp-project-update-western-gateway`) is safer.

**Primary recommendation:** Add `slug` columns to meetings, people, matters, motions, and bylaws via a migration with generated-always-as-stored or trigger-based slugs. Build a shared pagination utility (`cursor.ts`) and serializer module per entity type. Register chanfana endpoints following the exact patterns already established by `HealthEndpoint` and `TestAuthEndpoint`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Related data strategy:** Hybrid -- compact summaries inline (title, date, id), full detail via separate request. e.g., a meeting detail includes agenda item summaries but full agenda item detail requires `/agenda-items/:slug`
- **Identifiers:** Slug-based IDs for all API-facing entities, not raw integer PKs. e.g., `/meetings/2024-01-15-regular-council` not `/meetings/42`. Slugs should be human-readable and deterministic from existing data (date + type for meetings, name for people, etc.)
- **Serializers:** All entities pass through explicit serializer functions -- no raw DB rows in responses. Internal fields (created_at timestamps, internal flags, raw FKs) are stripped
- **Two search tiers:** Keyword search available to all API key holders (uses Postgres tsvector). Hybrid/semantic search (vector + keyword) requires consumer to supply their own embedding API key (since generating query embeddings has a per-query cost)
- **Type filtering:** Results filterable by content type via query param (e.g., `?type=motions,meetings`). Consumers can narrow to specific entity types

### Claude's Discretion
- Field naming convention (snake_case vs camelCase) -- pick what fits best for a civic data API
- Null handling strategy (include nulls vs omit empty fields)
- Snippet length and format for search results
- No-results behavior (empty array, suggestions, etc.)
- Default sort orders per entity type
- Default and max page sizes for pagination
- Cursor encoding approach (base64 opaque cursors per requirements)

### Deferred Ideas (OUT OF SCOPE)
- Migrate React Router web app routes from integer IDs to slug-based URLs -- separate phase/task, but slug generation should be designed to support this
- "Bring your own Gemini key" for RAG Q&A feature (noted from todo: let users supply their own API key)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | List meetings with cursor-based pagination and filters (date range, type, has_transcript, organization) | Existing `getMeetings()` in `meetings.ts` already implements all these filters via Supabase query builder; add cursor pagination + slug serialization |
| DATA-02 | Get meeting detail including agenda items, motions, and attendance | Existing `getMeetingById()` fetches meeting + agenda items + motions + votes + attendance; serialize with inline summaries per locked decision |
| DATA-03 | List people with filters (is_councillor, name search) | Existing `getPeopleWithStats()` fetches council members with memberships; simplify for API (no attendance stats in list view) |
| DATA-04 | Get person detail including memberships and voting summary | Existing `getPersonProfile()` fetches person + memberships + vote counts; serialize relevant subset |
| DATA-05 | List matters with filters (status, category, date range) | Existing `getMatters()` fetches all matters; add filter params and cursor pagination |
| DATA-06 | Get matter detail including agenda items and timeline | Existing `getMatterById()` fetches matter + agenda items + motions + votes; serialize timeline |
| DATA-07 | List motions with filters (result, meeting, mover) | No existing list function; build new Supabase query with filters on result, meeting_id, mover_id |
| DATA-08 | Get motion detail including individual roll call votes | Existing motion data is embedded in agenda item queries; build dedicated query with votes join |
| DATA-09 | List bylaws with filters (status, category, year) | Existing `getBylaws()` fetches all with basic fields; add filter params and cursor pagination |
| DATA-10 | Get bylaw detail including linked matters | Existing `getBylawById()` fetches bylaw + matters + agenda items; serialize per locked decision |
| DATA-11 | All list endpoints use cursor-based pagination with opaque base64 cursors, per_page (max 100), and has_more indicator | Build shared `cursor.ts` utility: encode/decode base64 cursors wrapping sort key + id, Supabase range-based pagination |
| DATA-12 | All responses use consistent envelope: { data, pagination, meta } with request ID | Build shared `envelope.ts` helper that wraps any data + pagination + meta (request ID from context) |
| SRCH-01 | Search across all content types via `GET /api/v1/search?q=` using existing hybrid vector+keyword search | Existing `hybridSearchAll()` in `hybrid-search.server.ts` runs parallel searches across motions, key_statements, document_sections, transcript_segments; adapt for API |
| SRCH-02 | Search results include content type, relevance score, and text snippets | Existing `UnifiedSearchResult` type already has `type`, `rank_score`, and `content` (preview text); serialize for API |
| SRCH-03 | Search results are paginated and filterable by content type | Existing `hybridSearchAll()` accepts `types` filter; add cursor-based pagination over results |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hono | ^4.12 | API router framework | Already installed from Phase 15; chanfana endpoints extend OpenAPIRoute |
| chanfana | ^3.0 | OpenAPI 3.1 generation + validation | Already installed; class-based `OpenAPIRoute` pattern for all endpoints |
| zod | ^4.3 (via `zod/v4`) | Schema validation & OpenAPI generation | Already installed; used for request param validation and response schemas |
| @supabase/supabase-js | (already installed) | Database queries | Admin client (`getSupabaseAdminClient()`) for all API queries |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| slugify | (no new dependency) | Slug generation | Hand-roll a simple slugify function -- civic data has predictable patterns; avoid adding a dependency for 10 lines of code |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DB-stored slug columns | Computed slugs at query time | Stored slugs are indexed and queryable via `WHERE slug = ?`; computed slugs require scanning |
| Base64 cursor pagination | Offset-based pagination | Cursors are stable across inserts/deletes and don't skip/duplicate rows; required by DATA-11 |
| Shared serializer functions | Inline JSON mapping in each endpoint | Shared serializers ensure consistent field naming, prevent internal field leaks, and are reusable across list/detail endpoints |

**Installation:**
No new packages needed -- all dependencies installed in Phase 15.

## Architecture Patterns

### Recommended Project Structure
```
apps/web/app/api/
├── index.ts                   # Hono app + route registration (extend existing)
├── types.ts                   # API types (extend existing)
├── middleware/                 # Existing middleware (auth, rate-limit, municipality, etc.)
├── lib/
│   ├── api-errors.ts          # Existing error classes
│   ├── api-key.ts             # Existing key utilities
│   ├── cursor.ts              # NEW: Cursor encode/decode + pagination helpers
│   ├── envelope.ts            # NEW: Response envelope builder
│   └── slugs.ts               # NEW: Slug generation utilities
├── serializers/               # NEW: Entity serializer functions
│   ├── meeting.ts             # serializeMeeting, serializeMeetingSummary
│   ├── person.ts              # serializePerson, serializePersonSummary
│   ├── matter.ts              # serializeMatter, serializeMatterSummary
│   ├── motion.ts              # serializeMotion, serializeMotionSummary
│   ├── bylaw.ts               # serializeBylaw, serializeBylawSummary
│   └── search.ts              # serializeSearchResult
└── endpoints/
    ├── health.ts              # Existing
    ├── test-auth.ts           # Existing
    ├── meetings/
    │   ├── list.ts            # GET /api/v1/:municipality/meetings
    │   └── detail.ts          # GET /api/v1/:municipality/meetings/:slug
    ├── people/
    │   ├── list.ts            # GET /api/v1/:municipality/people
    │   └── detail.ts          # GET /api/v1/:municipality/people/:slug
    ├── matters/
    │   ├── list.ts            # GET /api/v1/:municipality/matters
    │   └── detail.ts          # GET /api/v1/:municipality/matters/:slug
    ├── motions/
    │   ├── list.ts            # GET /api/v1/:municipality/motions
    │   └── detail.ts          # GET /api/v1/:municipality/motions/:slug
    ├── bylaws/
    │   ├── list.ts            # GET /api/v1/:municipality/bylaws
    │   └── detail.ts          # GET /api/v1/:municipality/bylaws/:slug
    └── search.ts              # GET /api/v1/:municipality/search
```

### Pattern 1: Cursor-Based Pagination
**What:** Opaque base64 cursors that encode the sort value + row ID for keyset pagination.
**When to use:** All list endpoints (DATA-11).
**Example:**
```typescript
// app/api/lib/cursor.ts

interface CursorPayload {
  /** The value of the sort column for the last row */
  v: string | number;
  /** The row ID for tiebreaking */
  id: number;
}

export function encodeCursor(payload: CursorPayload): string {
  return btoa(JSON.stringify(payload));
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    return JSON.parse(atob(cursor));
  } catch {
    return null;
  }
}

/**
 * Build a paginated Supabase query using keyset pagination.
 * Fetches per_page + 1 rows to determine has_more.
 */
export function applyPagination<T extends { id: number }>(
  query: any, // Supabase query builder
  options: {
    cursor?: string | null;
    per_page: number;
    sort_column: string;
    sort_direction: 'asc' | 'desc';
  }
) {
  const { cursor, per_page, sort_column, sort_direction } = options;

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      // Keyset: WHERE (sort_col, id) > (cursor_val, cursor_id)
      // For desc: WHERE (sort_col, id) < (cursor_val, cursor_id)
      if (sort_direction === 'desc') {
        query = query.or(
          `${sort_column}.lt.${decoded.v},and(${sort_column}.eq.${decoded.v},id.lt.${decoded.id})`
        );
      } else {
        query = query.or(
          `${sort_column}.gt.${decoded.v},and(${sort_column}.eq.${decoded.v},id.gt.${decoded.id})`
        );
      }
    }
  }

  query = query
    .order(sort_column, { ascending: sort_direction === 'asc' })
    .order('id', { ascending: sort_direction === 'asc' })
    .limit(per_page + 1); // Fetch one extra to detect has_more

  return query;
}

export function extractPage<T extends { id: number }>(
  rows: T[],
  per_page: number,
  sort_column: keyof T
): {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
} {
  const has_more = rows.length > per_page;
  const data = has_more ? rows.slice(0, per_page) : rows;
  const last = data[data.length - 1];

  return {
    data,
    has_more,
    next_cursor: last
      ? encodeCursor({ v: last[sort_column] as any, id: last.id })
      : null,
  };
}
```

### Pattern 2: Response Envelope
**What:** Consistent `{ data, pagination, meta }` wrapper for all API responses.
**When to use:** Every endpoint response (DATA-12).
**Example:**
```typescript
// app/api/lib/envelope.ts
import type { Context } from "hono";
import type { ApiEnv } from "../types";

interface PaginationInfo {
  has_more: boolean;
  next_cursor: string | null;
  per_page: number;
}

export function listResponse<T>(
  c: Context<ApiEnv>,
  data: T[],
  pagination: PaginationInfo
) {
  return c.json({
    data,
    pagination,
    meta: {
      request_id: c.get("requestId"),
    },
  });
}

export function detailResponse<T>(c: Context<ApiEnv>, data: T) {
  return c.json({
    data,
    meta: {
      request_id: c.get("requestId"),
    },
  });
}
```

### Pattern 3: Entity Serializers
**What:** Pure functions that transform DB rows into public API shapes, stripping internal fields.
**When to use:** Every entity returned in API responses (all DATA requirements).
**Example:**
```typescript
// app/api/serializers/meeting.ts

/** Full meeting for list views */
export function serializeMeetingSummary(row: any) {
  return {
    slug: row.slug,
    title: row.title,
    date: row.meeting_date,
    type: row.type,
    has_agenda: row.has_agenda ?? false,
    has_minutes: row.has_minutes ?? false,
    has_transcript: row.has_transcript ?? false,
    organization: row.organization?.name ?? null,
    summary: row.summary ?? null,
  };
}

/** Full meeting detail with nested related data summaries */
export function serializeMeetingDetail(row: any, related: any) {
  return {
    ...serializeMeetingSummary(row),
    video_url: row.video_url ?? null,
    minutes_url: row.minutes_url ?? null,
    agenda_url: row.agenda_url ?? null,
    video_duration_seconds: row.video_duration_seconds ?? null,
    chair: row.chair ? { slug: row.chair.slug, name: row.chair.name } : null,
    agenda_items: (related.agendaItems || []).map(serializeAgendaItemSummary),
    attendance: (related.attendance || []).map(serializeAttendanceSummary),
  };
}
```

### Pattern 4: Chanfana List Endpoint
**What:** Class-based `OpenAPIRoute` with query parameter schemas for filters and pagination.
**When to use:** All list endpoints.
**Example:**
```typescript
// app/api/endpoints/meetings/list.ts
import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { ApiEnv } from "../../types";
import type { Context } from "hono";

export class ListMeetings extends OpenAPIRoute {
  schema = {
    summary: "List meetings",
    description: "Returns a paginated list of meetings with optional filters.",
    request: {
      query: z.object({
        cursor: z.string().optional().describe("Pagination cursor from previous response"),
        per_page: z.coerce.number().int().min(1).max(100).default(20)
          .describe("Number of results per page (max 100)"),
        type: z.string().optional().describe("Filter by meeting type"),
        date_from: z.string().optional().describe("Filter meetings on or after this date (YYYY-MM-DD)"),
        date_to: z.string().optional().describe("Filter meetings on or before this date (YYYY-MM-DD)"),
        has_transcript: z.coerce.boolean().optional()
          .describe("Filter by transcript availability"),
        organization: z.string().optional()
          .describe("Filter by organization slug"),
      }),
    },
    responses: {
      "200": {
        description: "Paginated list of meetings",
        content: { "application/json": { schema: z.object({ /* ... */ }) } },
      },
    },
  };

  async handle(c: Context<ApiEnv>) {
    const query = await this.getValidatedData<typeof this.schema>();
    const muni = c.get("municipality")!;
    // ... build Supabase query with filters, apply pagination, serialize
  }
}
```

### Pattern 5: Slug Lookup for Detail Endpoints
**What:** Query by slug column instead of integer ID for detail endpoints.
**When to use:** All detail endpoints.
**Example:**
```typescript
// app/api/endpoints/meetings/detail.ts
async handle(c: Context<ApiEnv>) {
  const { slug } = c.req.param();
  const muni = c.get("municipality")!;

  const { data: meeting, error } = await getSupabaseAdminClient()
    .from("meetings")
    .select("*, organization:organizations(name)")
    .eq("slug", slug)
    .eq("municipality_id", muni.id)
    .maybeSingle();

  if (!meeting) {
    throw new ApiError(404, "MEETING_NOT_FOUND",
      `Meeting "${slug}" not found in ${muni.name}.`);
  }
  // ... fetch related data, serialize, return envelope
}
```

### Anti-Patterns to Avoid
- **Returning raw DB rows:** Every response must go through a serializer. Internal fields like `embedding`, `text_search`, `meta`, `municipality_id`, `created_at` must never appear in API responses.
- **Offset-based pagination:** Do not use `.range(offset, limit)` for API pagination. Offset pagination breaks with concurrent inserts/deletes and gets slower for large offsets.
- **Fetching all rows for pagination:** The existing `getMatters()` fetches ALL matters then processes client-side. API endpoints must paginate at the database level.
- **Embedding integer PKs in responses:** All entity references use slugs, never raw `id` values. Internal IDs are for database joins only.
- **N+1 queries:** Use Supabase's nested `.select()` joins rather than fetching related data in loops.
- **Mixing serializer logic into endpoint handlers:** Keep serializers as pure functions in separate files for testability and reuse.

## Slug Generation Strategy

### Design Principles
1. **Deterministic:** Same data always produces the same slug (no random components)
2. **Human-readable:** Slugs should be meaningful to API consumers
3. **Unique per municipality:** Slug + municipality_id is the unique constraint
4. **Stable:** Slugs should not change when irrelevant data is updated

### Slug Formulas

| Entity | Formula | Example | Uniqueness |
|--------|---------|---------|------------|
| Meeting | `{date}-{type-slug}` | `2024-01-15-regular-council` | date + type is unique for 732/737 rows; 5 duplicates get `-2` suffix |
| Person | `{name-slug}` | `david-screech` | `name` column has UNIQUE constraint, 0 duplicates |
| Matter | `{id}-{title-slug-truncated}` | `2600-ocp-project-update-western-gateway` | ID prefix guarantees uniqueness; title truncated to ~60 chars |
| Motion | `{meeting-date}-{motion-seq}` | `2024-01-15-m3` | Sequence number within meeting (ordered by id) |
| Bylaw | `{bylaw-number}` or `{id}-{title-slug}` | `1154` or `43-tree-protection-bylaw` | bylaw_number is nearly unique (some nulls); fall back to id-prefix |

### Migration Approach
Add a `slug` TEXT column (NOT NULL, with unique index per municipality_id) to each entity table. Populate via a data migration that computes slugs from existing data. Use a trigger or application-level generation for new rows.

**Duplicate handling for meetings:** The 5 duplicate date+type pairs have different `id` values. Append `-2` to the second occurrence (by `id` order). This is a one-time migration concern -- the pipeline can be updated to detect duplicates and suffix accordingly.

## Discretionary Recommendations

### Field Naming: snake_case
**Recommendation:** Use `snake_case` for all API field names. Rationale: (1) the database uses snake_case, minimizing transformation; (2) civic data APIs (OpenStates, Civic Information API) use snake_case; (3) JSON API convention for government/civic data is snake_case; (4) the existing Supabase column names are already snake_case.

### Null Handling: Include nulls explicitly
**Recommendation:** Always include fields even when null (e.g., `"summary": null` not omitting `summary`). Rationale: (1) consumers can rely on a consistent schema -- every field is always present; (2) TypeScript consumers benefit from knowing a field exists but is null vs. not existing; (3) OpenAPI schema can accurately describe nullable fields.

### Snippet Length: 200 characters
**Recommendation:** Search result snippets should be 200 characters max, truncated at word boundary with ellipsis. This matches the existing `hybrid-search.server.ts` pattern (`.slice(0, 200)`). Long enough to be useful, short enough to keep response sizes reasonable.

### No-Results Behavior: Empty array, no suggestions
**Recommendation:** Return `{ "data": [], "pagination": { "has_more": false, "next_cursor": null, "per_page": 20 }, "meta": { "request_id": "..." } }`. No suggestions or did-you-mean -- that adds complexity and is better suited for v2. The consistent envelope makes empty results easy to handle programmatically.

### Default Sort Orders

| Entity | Default Sort | Rationale |
|--------|-------------|-----------|
| Meetings | `meeting_date DESC` | Most recent first -- users want current meetings |
| People | `name ASC` | Alphabetical -- natural for directory-style listing |
| Matters | `last_seen DESC` | Most recently active first |
| Motions | `id DESC` (effectively chronological) | Most recent decisions first |
| Bylaws | `bylaw_number DESC` (or `year DESC`) | Most recent bylaws first |

### Pagination Defaults
- **Default per_page:** 20 (reasonable for API consumers; matches common API conventions)
- **Max per_page:** 100 (prevents abuse; DATA-11 specifies this)
- **No minimum per_page enforcement** beyond 1

### Cursor Encoding
**Recommendation:** Base64-encode a JSON object containing the sort column value and the row ID. Example: `btoa(JSON.stringify({ v: "2024-01-15", id: 42 }))` produces `eyJ2IjoiMjAyNC0wMS0xNSIsImlkIjo0Mn0=`. The cursor is opaque to consumers (they should not parse it), but internally it enables keyset pagination. Use `btoa`/`atob` which are available in Cloudflare Workers.

## Search Architecture

### Keyword Search (Default Tier)
Available to all API key holders. Uses existing Postgres `tsvector` columns:
- `motions.text_search` (generated from `plain_english_summary` or `text_content`)
- `matters.text_search` (generated from `title` + `plain_english_summary`/`description`)
- `agenda_items.text_search` (generated from `title` + `plain_english_summary` + `debate_summary`)
- `key_statements.text_search` (generated from `statement_text` + `context` + `speaker_name`)
- `transcript_segments.text_search` (generated from `text_content`)
- `document_sections.text_search` (generated from `section_title` + `section_text`)

Pattern: Build a `plainto_tsquery` or `websearch_to_tsquery` from the query text, use Supabase `.textSearch()` with `ts_rank` scoring. Run searches across entity types in parallel.

### Hybrid Search (Premium Tier)
Requires consumer to pass an embedding in the request (or their own API key for embedding generation). Uses existing RPC functions:
- `hybrid_search_motions` (vector + FTS with RRF)
- `hybrid_search_key_statements` (vector + FTS with RRF)
- `hybrid_search_document_sections` (vector + FTS with RRF)
- Plus `match_*` functions for vector-only search on matters, agenda items, bylaws

The existing `hybridSearchAll()` function in `hybrid-search.server.ts` provides the exact pattern: run parallel searches, merge by rank_score, deduplicate by type+id.

### Search API Design
```
GET /api/v1/:municipality/search?q=housing+development&type=motions,matters&per_page=20&cursor=...
```

For the keyword tier, no additional auth beyond the API key is needed. For hybrid/semantic, the consumer would pass a header like `X-Embedding-Key` with their OpenAI API key, and the server generates the query embedding on their behalf.

**Important implementation note:** The existing `generateQueryEmbedding()` in `embeddings.server.ts` uses the server's `OPENAI_API_KEY` env var. For the "bring your own key" model, we need a variant that accepts a key parameter instead of reading from env. This is straightforward -- create a `generateQueryEmbeddingWithKey(query, apiKey)` function.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAPI schema for endpoints | Manual JSON responses | chanfana `OpenAPIRoute` with Zod schemas | Auto-generates OpenAPI spec; validates inputs |
| Full-text search ranking | Custom scoring algorithm | Postgres `ts_rank` + `tsvector` | Battle-tested, handles stemming, stop words, ranking |
| Vector similarity search | Custom cosine similarity | Existing `match_*` and `hybrid_search_*` RPCs | Already optimized with pgvector indexes |
| Cursor encode/decode | Custom binary format | Base64 + JSON | Human-debuggable, universally supported in Workers |
| Slug generation from text | Full slugify library | Simple regex: `text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')` | Civic data is English-only, ASCII names; no i18n complexity needed |
| Response envelope | Inline JSON construction per endpoint | Shared `listResponse`/`detailResponse` helpers | Guarantees consistent shape across all endpoints |

**Key insight:** The hard work (database schema, search indexes, hybrid search RPCs, entity query patterns) already exists. This phase is about building a clean API layer on top of proven infrastructure.

## Common Pitfalls

### Pitfall 1: Cursor Pagination with Null Sort Values
**What goes wrong:** Keyset pagination breaks when the sort column has NULL values because `NULL > 'some_value'` is always NULL (not true or false) in SQL.
**Why it happens:** Columns like `meeting_date`, `last_seen`, or `bylaw_number` can be NULL.
**How to avoid:** Use `COALESCE` in the sort expression or ensure the sort column is NOT NULL. For the default sorts recommended above, `meeting_date` is NOT NULL (required column), `name` is NOT NULL, `id` is always NOT NULL. For `last_seen` on matters, sort by `(last_seen, id)` and handle nulls by treating them as minimum values in the cursor comparison.
**Warning signs:** Rows with NULL sort values disappear from paginated results.

### Pitfall 2: Supabase `.or()` Filter for Keyset Pagination
**What goes wrong:** Supabase's PostgREST `.or()` syntax for compound keyset conditions (`WHERE (date, id) < (cursor_date, cursor_id)`) is tricky to express correctly.
**Why it happens:** PostgREST `.or()` does not support tuple comparison directly.
**How to avoid:** Express the keyset condition as: `sort_col < cursor_val OR (sort_col = cursor_val AND id < cursor_id)`. In Supabase syntax: `.or('meeting_date.lt.2024-01-15,and(meeting_date.eq.2024-01-15,id.lt.42)')`. Test this carefully with edge cases (same date, different IDs).
**Warning signs:** Duplicate or missing rows at page boundaries.

### Pitfall 3: Slug Collisions After Data Updates
**What goes wrong:** A meeting title or person name is updated, but the slug (which was generated from the original data) does not change, leading to stale slugs. Or worse, a trigger regenerates the slug, breaking existing API consumer bookmarks.
**How to avoid:** Generate slugs once at insert time and never update them. Use a `BEFORE INSERT` trigger or set them in the migration, and mark the slug column as immutable in application code. Slugs are permanent identifiers.
**Warning signs:** 404s for previously working slug URLs after data pipeline re-runs.

### Pitfall 4: N+1 Queries in Detail Endpoints
**What goes wrong:** Detail endpoints fetch the main entity, then make separate queries for each related entity type, then separate queries for each nested entity.
**Why it happens:** Supabase's nested select joins have limits (e.g., no nested aggregations).
**How to avoid:** Use `Promise.all()` for parallel fetches (the existing `getMeetingById()` does this well). Limit nesting depth -- inline summaries only, not full recursive trees.
**Warning signs:** Detail endpoint latency >500ms.

### Pitfall 5: Leaking Internal Fields
**What goes wrong:** A developer adds a new database column but forgets to exclude it from the serializer, and internal data (embeddings, tsvector, internal flags) appears in API responses.
**How to avoid:** Serializers should use an allowlist pattern (explicitly list included fields), not a blocklist pattern (exclude specific fields). The serializer functions in the `serializers/` directory should construct a new object with only the public fields, never spread `...row`.
**Warning signs:** Large response sizes (embedding vectors are 768 floats = ~6KB per row).

### Pitfall 6: Search Returning Too Many Results Without Pagination
**What goes wrong:** The search endpoint returns all matching results in a single response, causing slow responses and large payloads for broad queries.
**Why it happens:** The existing `hybridSearchAll()` returns up to 30 results with no pagination.
**How to avoid:** Apply `per_page` + cursor pagination to search results. Since search results come from multiple sources merged in application code (not a single SQL query), cursor pagination works differently -- use a combination of rank_score + row_id as the cursor, and apply it as a post-filter on the merged results. Alternatively, limit the total result count and use simple offset-style "page" cursors for search (since search results are inherently ephemeral and order-unstable).
**Warning signs:** Search responses >100KB or >1s latency.

## Code Examples

### Slug Generation Utility
```typescript
// app/api/lib/slugs.ts

/**
 * Convert a string to a URL-safe slug.
 * Handles ASCII text only (sufficient for BC civic data).
 */
export function slugify(text: string, maxLength = 60): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, maxLength)
    .replace(/-$/, ''); // Remove trailing dash if truncated mid-word
}

/** Meeting slug: 2024-01-15-regular-council */
export function meetingSlug(date: string, type: string): string {
  return `${date}-${slugify(type)}`;
}

/** Person slug: david-screech */
export function personSlug(name: string): string {
  return slugify(name);
}

/** Matter slug: 2600-ocp-project-update */
export function matterSlug(id: number, title: string): string {
  return `${id}-${slugify(title, 50)}`;
}

/** Bylaw slug: 1154 (use bylaw_number if available, else id-title) */
export function bylawSlug(id: number, bylawNumber: string | null, title: string): string {
  if (bylawNumber) return slugify(bylawNumber);
  return `${id}-${slugify(title, 50)}`;
}

/** Motion slug: m-{id} (motions don't have meaningful human-readable identifiers) */
export function motionSlug(id: number): string {
  return `m-${id}`;
}
```

### Database Migration for Slug Columns
```sql
-- Add slug columns to all API-facing entity tables
ALTER TABLE meetings ADD COLUMN slug text;
ALTER TABLE people ADD COLUMN slug text;
ALTER TABLE matters ADD COLUMN slug text;
ALTER TABLE motions ADD COLUMN slug text;
ALTER TABLE bylaws ADD COLUMN slug text;

-- Populate meeting slugs (handle 5 duplicate date+type cases)
WITH ranked AS (
  SELECT id,
    meeting_date || '-' || lower(regexp_replace(type::text, '[^a-zA-Z0-9]+', '-', 'g')) AS base_slug,
    ROW_NUMBER() OVER (PARTITION BY meeting_date, type ORDER BY id) AS rn
  FROM meetings
)
UPDATE meetings SET slug =
  CASE WHEN ranked.rn = 1 THEN ranked.base_slug
       ELSE ranked.base_slug || '-' || ranked.rn
  END
FROM ranked WHERE meetings.id = ranked.id;

-- Populate other entity slugs...

-- Add NOT NULL and unique constraints
ALTER TABLE meetings ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX idx_meetings_slug_municipality ON meetings(slug, municipality_id);
-- (repeat for other entities)
```

### Chanfana Endpoint with Full Pagination
```typescript
// app/api/endpoints/meetings/list.ts
import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { ApiEnv } from "../../types";
import type { Context } from "hono";
import { getSupabaseAdminClient } from "~/lib/supabase.server";
import { decodeCursor, encodeCursor } from "../../lib/cursor";
import { listResponse } from "../../lib/envelope";
import { serializeMeetingSummary } from "../../serializers/meeting";
import { ApiError } from "../../lib/api-errors";

export class ListMeetings extends OpenAPIRoute {
  schema = {
    summary: "List meetings",
    request: {
      query: z.object({
        cursor: z.string().optional(),
        per_page: z.coerce.number().int().min(1).max(100).default(20),
        type: z.string().optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
        has_transcript: z.coerce.boolean().optional(),
      }),
    },
    // ... responses schema
  };

  async handle(c: Context<ApiEnv>) {
    const data = await this.getValidatedData<typeof this.schema>();
    const { cursor, per_page, type, date_from, date_to, has_transcript } = data.query;
    const muni = c.get("municipality")!;
    const supabase = getSupabaseAdminClient();

    let query = supabase
      .from("meetings")
      .select("id, slug, title, meeting_date, type, status, has_agenda, has_minutes, has_transcript, video_url, summary, organization:organizations(name)")
      .eq("municipality_id", muni.id);

    // Apply filters
    if (type) query = query.eq("type", type);
    if (date_from) query = query.gte("meeting_date", date_from);
    if (date_to) query = query.lte("meeting_date", date_to);
    if (has_transcript !== undefined) query = query.eq("has_transcript", has_transcript);

    // Apply cursor pagination
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        query = query.or(
          `meeting_date.lt.${decoded.v},and(meeting_date.eq.${decoded.v},id.lt.${decoded.id})`
        );
      }
    }

    query = query
      .order("meeting_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(per_page + 1);

    const { data: rows, error } = await query;
    if (error) throw new ApiError(500, "QUERY_ERROR", "Failed to fetch meetings");

    const has_more = (rows?.length ?? 0) > per_page;
    const pageRows = has_more ? rows!.slice(0, per_page) : (rows ?? []);
    const last = pageRows[pageRows.length - 1];

    return listResponse(c, pageRows.map(serializeMeetingSummary), {
      has_more,
      next_cursor: last ? encodeCursor({ v: last.meeting_date, id: last.id }) : null,
      per_page,
    });
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Offset pagination (`?page=3`) | Cursor/keyset pagination | Industry standard since ~2020 | Stable results, better performance at scale |
| Integer PKs in URLs | Slug-based identifiers | Common in modern public APIs | Human-readable, SEO-friendly, hides internal structure |
| Raw DB rows in responses | Explicit serializer layer | Always best practice | Prevents field leaks, enables versioning |
| Single-query search | Parallel multi-table search with merge | Already implemented in project | Better relevance across content types |

**Deprecated/outdated:**
- The existing `search.ts` `keywordSearch()` uses `ilike` which is slow and doesn't leverage tsvector indexes. The API search endpoint should use `textSearch()` and `tsvector` columns instead.
- The `vectorSearchAll()` function in `vectorSearch.ts` uses individual `match_*` RPCs. The newer `hybridSearchAll()` in `hybrid-search.server.ts` uses the combined `hybrid_search_*` RPCs with RRF scoring, which produce better results.

## Data Scale Context

| Entity | Row Count | Pagination Important? |
|--------|-----------|----------------------|
| Meetings | 737 | Yes -- fits in few pages but will grow |
| People | 837 | Yes -- mostly non-councillors (staff, public delegates) |
| Matters | 1,727 | Yes -- significant data, grows with each meeting |
| Motions | 10,536 | Yes -- large table, must paginate |
| Bylaws | 43 | Less critical but still paginate for consistency |
| Votes | 44,919 | Not directly listed but nested in motion detail |

## Open Questions

1. **Slug migration: trigger vs. application-level?**
   - What we know: Slugs need to be generated for ~737 meetings, ~837 people, ~1727 matters, ~10536 motions, ~43 bylaws. Migration handles backfill.
   - What's unclear: Should new rows get slugs via a Postgres trigger (guaranteed consistency) or application code (more flexible, easier to test)?
   - Recommendation: Use a Postgres trigger for guaranteed consistency. The pipeline inserts data directly into Supabase, so application-level slug generation would require pipeline changes. A trigger handles both pipeline inserts and any future insert path.

2. **Search pagination: cursor or offset?**
   - What we know: Search results are merged from multiple parallel queries in application code, not a single SQL query. Cursor pagination over merged results is awkward because the sort key (rank_score) is ephemeral.
   - What's unclear: Whether cursor pagination is meaningful for search results (the same query may return different results moments later as data changes).
   - Recommendation: Use simple limit-based pagination for search (`per_page` + `page` number or `offset`). Search results are inherently volatile. Return `has_more` based on whether the total result count exceeds the current page. This is how most search APIs (Elasticsearch, Algolia, OpenStates) work.

3. **Motion slugs: human-readable or ID-based?**
   - What we know: Motions don't have meaningful unique identifiers beyond their text content (which is too long for a slug) and their database ID. The `motion_code` field is sparsely populated.
   - What's unclear: Whether API consumers would benefit from a human-readable motion slug vs. a simple `m-{id}` pattern.
   - Recommendation: Use `m-{id}` for now. Motions are typically accessed via their parent meeting or agenda item, not browsed directly. The slug is still opaque to consumers.

## Sources

### Primary (HIGH confidence)
- **Project codebase inspection** -- All service files (`meetings.ts`, `people.ts`, `matters.ts`, `bylaws.ts`, `search.ts`, `hybrid-search.server.ts`, `vectorSearch.ts`), API foundation (`app/api/`), database schema (via `list_tables`), and sample data queries
- **Phase 15 Research** (`.planning/phases/15-api-foundation/15-RESEARCH.md`) -- Hono + chanfana patterns, OpenAPIRoute structure, middleware chain
- **Supabase database inspection** -- Table schemas, column types, tsvector columns, existing RPC functions, row counts, sample data for slug patterns

### Secondary (MEDIUM confidence)
- **Cursor-based pagination pattern** -- Well-established keyset pagination pattern using `(sort_col, id)` tuples; standard in Stripe, Slack, and GitHub APIs
- **Slug generation conventions** -- Standard URL slug patterns for civic data from OpenStates API conventions

### Tertiary (LOW confidence)
- **Search pagination with offset** -- Recommendation to use offset-based pagination for search is based on how search APIs typically work (Elasticsearch, Algolia), but should be validated against the actual user experience

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries already installed and proven in Phase 15; no new dependencies needed
- Architecture: HIGH -- Extends established patterns (chanfana endpoints, Hono middleware chain, Supabase queries) with well-understood additions (serializers, cursors, slugs)
- Slug strategy: HIGH -- Verified against actual data (duplicate analysis, uniqueness checks, sample slug generation)
- Pitfalls: HIGH -- Based on direct codebase analysis and known Supabase/PostgREST limitations
- Search design: MEDIUM -- Two-tier search approach is specified in CONTEXT.md; keyword tier is straightforward, but "bring your own key" for embeddings needs implementation details validated

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (stable ecosystem; 30-day validity)
