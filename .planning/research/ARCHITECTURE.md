# Architecture Patterns: v1.3 Platform APIs

**Domain:** Public API + OCD API for civic intelligence platform
**Researched:** 2026-02-19

---

## 1. Current Architecture Summary

```
Browser  --->  Cloudflare Worker (React Router 7 SSR)  --->  Supabase PostgreSQL
                  |-- SSR routes (meetings, people, matters, etc.)
                  |-- API routes (api.ask, api.search, api.vimeo-url, etc.)
                  |-- Service layer (app/services/*.ts)
                  |-- Supabase clients (browser, server auth, server admin)
```

**Key characteristics:**
- Single Worker deployment (`viewroyal-intelligence`)
- React Router 7.12.0 with flat file routes in `app/routes/`
- API routes use loader/action pattern (GET via `loader`, POST via `action`)
- In-memory rate limiting per IP (Map-based, per-isolate)
- Env vars inlined at build time via Vite `define` block
- Supabase admin client as a lazy singleton (bypasses RLS)
- Worker entry point at `workers/app.ts` delegates everything to React Router

**Existing API routes (8 total):**
| Route file | Method | Auth | Purpose |
|---|---|---|---|
| `api.ask.tsx` | GET/POST | None (rate limited) | RAG Q&A streaming |
| `api.search.tsx` | GET | None (rate limited) | Hybrid search + AI answers |
| `api.subscribe.tsx` | GET/POST/DELETE | Supabase user auth | Manage subscriptions |
| `api.digest.tsx` | GET | None | Meeting digest JSON |
| `api.intel.tsx` | POST | Supabase user auth | AI intelligence generation |
| `api.geocode.tsx` | POST | Supabase user auth | Address geocoding |
| `api.vimeo-url.ts` | GET | None | Vimeo direct URL extraction |
| `api.og-image.tsx` | GET | None | OG image generation |

---

## 2. Architectural Decision: Same Worker vs Separate Worker

### Recommendation: Same Worker, separate route prefix

**Decision:** Keep the public API in the same Worker deployment, served under `/api/v1/` for the public data/search API and `/api/ocd/` for OCD-standard endpoints.

**Rationale:**

1. **The existing architecture already mixes SSR + API routes.** Eight API routes already coexist with 20+ SSR page routes in the same Worker. Adding more API routes follows the established pattern.

2. **Shared service layer.** The existing service functions in `app/services/` (meetings, people, matters, bylaws, search, etc.) contain all the query logic the API needs. A separate Worker would need to duplicate this code or import it as a shared package -- unnecessary complexity for the current scale.

3. **Shared Supabase client initialization.** The lazy singleton admin client, env var inlining, and auth helpers are already wired up. A separate Worker would need its own copies of all secrets and initialization logic.

4. **Cloudflare Workers have 128MB memory and 30s CPU time.** API endpoints returning paginated JSON are lightweight -- well under these limits. The Worker is nowhere near resource constraints.

5. **Single domain routing.** All traffic goes through `viewroyal.ai/*`. A separate Worker would need subdomain routing (`api.viewroyal.ai`) or path-based routing via Cloudflare Workers Routes, adding DNS/routing configuration for no benefit.

**When to split (not now):** If API traffic reaches >10x web traffic, or if API responses need different caching strategies at the CDN level, or if the Worker bundle exceeds 10MB compressed. None of these apply at current scale.

---

## 3. Route Structure and Organization

### File naming convention

React Router 7 uses dot-separated flat file routes. The existing pattern is:

```
api.ask.tsx           -> /api/ask
api.search.tsx        -> /api/search
api.vimeo-url.ts      -> /api/vimeo-url
```

For the public API, use the `api.v1.` prefix:

```
# Public Data API routes
api.v1.meetings.ts          -> /api/v1/meetings
api.v1.meetings.$id.ts      -> /api/v1/meetings/:id
api.v1.matters.ts            -> /api/v1/matters
api.v1.matters.$id.ts        -> /api/v1/matters/:id
api.v1.people.ts             -> /api/v1/people
api.v1.people.$id.ts         -> /api/v1/people/:id
api.v1.motions.ts            -> /api/v1/motions
api.v1.bylaws.ts             -> /api/v1/bylaws
api.v1.bylaws.$id.ts         -> /api/v1/bylaws/:id
api.v1.search.ts             -> /api/v1/search
api.v1.ask.ts                -> /api/v1/ask
api.v1.openapi.ts            -> /api/v1/openapi.json (handled via loader)

# OCD API routes
api.ocd.jurisdictions.ts              -> /api/ocd/jurisdictions
api.ocd.jurisdictions.$ocdId.ts       -> /api/ocd/jurisdictions/:ocdId
api.ocd.organizations.ts              -> /api/ocd/organizations
api.ocd.organizations.$ocdId.ts       -> /api/ocd/organizations/:ocdId
api.ocd.people.ts                     -> /api/ocd/people
api.ocd.people.$ocdId.ts              -> /api/ocd/people/:ocdId
api.ocd.events.ts                     -> /api/ocd/events
api.ocd.events.$ocdId.ts              -> /api/ocd/events/:ocdId
api.ocd.bills.ts                      -> /api/ocd/bills
api.ocd.bills.$ocdId.ts               -> /api/ocd/bills/:ocdId
api.ocd.votes.ts                      -> /api/ocd/votes
api.ocd.votes.$ocdId.ts               -> /api/ocd/votes/:ocdId
```

**Why `.ts` not `.tsx`:** API routes return JSON, no React components. Use `.ts` for clarity (same pattern as existing `api.vimeo-url.ts`).

### Directory alternative considered and rejected

An alternative would be organizing API routes in subdirectories (`routes/api/v1/meetings.ts`). This was rejected because React Router 7 flat file routes use dots for path segments -- the existing codebase uses this pattern consistently, and mixing conventions would be confusing.

---

## 4. API Middleware Architecture

### The middleware problem

Every public API route needs:
1. API key validation
2. Rate limiting (per API key)
3. Municipality scoping
4. JSON error formatting (RFC 7807-style)
5. CORS headers
6. Response metadata (pagination, rate limit headers)

React Router 7.12.0 (current version) does NOT have stable middleware support. Middleware was stabilized in 7.13.0. Upgrading is possible but introduces risk for a feature we only need on API routes.

### Recommendation: Utility wrapper function, not middleware

Instead of React Router middleware, use a composable wrapper function that every API route calls at the top of its loader/action. This is the pattern already used in the codebase (e.g., `isRateLimited()` in `api.ask.tsx`), just formalized.

```typescript
// app/lib/api.server.ts

export interface ApiContext {
  apiKey: ApiKeyRecord;
  supabase: SupabaseClient;
  municipalityId: number;
}

export interface ApiKeyRecord {
  id: number;
  key_prefix: string;   // first 8 chars for logging
  owner_name: string;
  municipality_id: number | null;
  tier: "free" | "pro";
  rate_limit: number;    // requests per minute
  is_active: boolean;
  created_at: string;
}

/**
 * Authenticate and authorize an API request.
 * Returns ApiContext or throws a Response with appropriate error.
 */
export async function authenticateApiRequest(
  request: Request
): Promise<ApiContext> {
  // 1. Extract API key from Authorization header
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw apiError(401, "missing_api_key",
      "Provide an API key via Authorization: Bearer <key>");
  }
  const apiKey = authHeader.slice(7);

  // 2. Validate API key against database
  const supabase = getSupabaseAdminClient();
  const keyRecord = await validateApiKey(supabase, apiKey);
  if (!keyRecord) {
    throw apiError(401, "invalid_api_key", "The provided API key is invalid");
  }
  if (!keyRecord.is_active) {
    throw apiError(403, "api_key_disabled", "This API key has been disabled");
  }

  // 3. Rate limit check (per API key)
  const limited = await checkRateLimit(keyRecord);
  if (limited) {
    throw apiError(429, "rate_limit_exceeded",
      `Rate limit of ${keyRecord.rate_limit} requests/minute exceeded`,
      { "Retry-After": "60" });
  }

  // 4. Determine municipality scope
  const municipalityId = keyRecord.municipality_id ?? 1; // default to View Royal

  return { apiKey: keyRecord, supabase, municipalityId };
}

/**
 * Create a standardized JSON error response.
 */
function apiError(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>
): Response {
  return Response.json(
    { error: { code, message, status } },
    { status, headers: { ...corsHeaders(), ...headers } }
  );
}
```

**Usage in a route:**

```typescript
// app/routes/api.v1.meetings.ts
import { authenticateApiRequest } from "../lib/api.server";

export async function loader({ request }: { request: Request }) {
  const ctx = await authenticateApiRequest(request);

  // ... fetch meetings using ctx.supabase, scoped to ctx.municipalityId
  // ... apply pagination from query params
  // ... return JSON response with pagination metadata
}
```

**Why this over React Router middleware:**

1. **No version upgrade required.** Works with current React Router 7.12.0.
2. **Explicit.** Every API route clearly shows it requires auth. No magic inheritance.
3. **Matches existing patterns.** `api.ask.tsx` already calls `isRateLimited()` at the top of its handler.
4. **Only applies to API routes.** SSR page routes don't need API key auth.
5. **Easy to test.** Pure function, no framework coupling.

**Future migration path:** If React Router is upgraded to 7.13+ later, the wrapper can be extracted into a middleware function without changing the underlying logic.

---

## 5. API Key Authentication Design

### Database schema

```sql
CREATE TABLE api_keys (
  id serial PRIMARY KEY,
  key_hash text NOT NULL,           -- SHA-256 hash of the full key
  key_prefix varchar(8) NOT NULL,   -- First 8 chars for display/logging
  owner_name text NOT NULL,
  owner_email text,
  municipality_id integer REFERENCES municipalities(id),
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
  rate_limit integer NOT NULL DEFAULT 60,  -- requests per minute
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
```

### Key format and validation

```
viewroyal_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
^^^^^^^^^^ ^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  prefix   env              random (32 chars)
```

- **Prefix:** `viewroyal_` (brand identity, easy to recognize in logs)
- **Environment:** `live_` or `test_` (distinguish prod vs test)
- **Random:** 32 hex characters (128 bits of entropy)
- **Total length:** 47 characters

**Validation flow:**

1. Extract key from `Authorization: Bearer <key>` header
2. Compute SHA-256 hash of the key
3. Look up hash in `api_keys` table
4. Check `is_active` flag
5. Update `last_used_at` timestamp (fire-and-forget, don't block response)

**Why SHA-256 not bcrypt:** API keys are validated on every request. SHA-256 is O(1) with negligible CPU cost. Bcrypt at cost factor 12 takes ~250ms -- unacceptable per-request overhead. API keys have 128+ bits of entropy, so brute-force resistance from bcrypt is unnecessary (unlike short user passwords).

---

## 6. Rate Limiting Architecture

### Recommendation: Cloudflare Workers Rate Limiting binding (primary) + in-memory fallback

The Cloudflare Workers Rate Limiting API is now GA (September 2025). It provides per-key rate limiting with no meaningful latency overhead.

**Configuration in `wrangler.toml`:**

```toml
[[ratelimits]]
name = "API_RATE_LIMITER"
namespace_id = "1001"

[ratelimits.simple]
limit = 60
period = 60
```

**Usage:**

```typescript
// In the Worker entry point or api.server.ts
// Access via env binding

async function checkRateLimit(
  env: Env,
  keyPrefix: string,
  limit: number
): Promise<boolean> {
  // Use the API key prefix as the rate limit key
  const { success } = await env.API_RATE_LIMITER.limit({
    key: `api:${keyPrefix}`
  });
  return !success; // true if rate limited
}
```

**Tiered limits:**

| Tier | Requests/minute | Requests/day |
|------|----------------|--------------|
| Free | 60 | 1,000 |
| Pro | 300 | 10,000 |

**Challenge: Accessing env bindings from React Router routes.** The Worker entry point receives `env` but React Router routes only get `request`. Two options:

1. **Pass env through AppLoadContext** (recommended). Modify `workers/app.ts` to include env bindings in the context. Routes access via `context.cloudflare.env`.

2. **In-memory fallback.** Keep the existing Map-based rate limiter for development and as a fallback. It works per-isolate (not globally consistent) but is good enough for MVP.

**Implementation plan:**

```typescript
// workers/app.ts - Modified to expose env
interface Env {
  API_RATE_LIMITER: RateLimit;
  [key: string]: unknown;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
  // ...
}
```

Routes access it via `context.cloudflare.env.API_RATE_LIMITER`. This already works -- the `Env` interface and `AppLoadContext` augmentation are already in `workers/app.ts`.

**BUT: The `authenticateApiRequest()` wrapper does not receive route context.** Solution: pass `env` as a parameter:

```typescript
export async function authenticateApiRequest(
  request: Request,
  env?: Env
): Promise<ApiContext> {
  // ...
  if (env?.API_RATE_LIMITER) {
    const { success } = await env.API_RATE_LIMITER.limit({
      key: `api:${keyRecord.key_prefix}`
    });
    if (!success) throw apiError(429, ...);
  } else {
    // Fallback: in-memory rate limiting (dev mode)
    if (inMemoryRateLimited(keyRecord)) throw apiError(429, ...);
  }
}
```

**Rate limit response headers (industry standard):**

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1708300860
Retry-After: 60  (only on 429)
```

**Note:** The CF Workers Rate Limiting binding only returns `{ success: boolean }` -- it does not provide remaining count or reset time. To include `X-RateLimit-Remaining`, we would need to track counts ourselves (in-memory or KV). For MVP, include `X-RateLimit-Limit` and `Retry-After` but omit `X-RateLimit-Remaining`.

---

## 7. Cursor-Based Pagination Design

### Why cursor-based, not offset-based

The existing codebase uses `.range(offset, offset + pageSize - 1)` (offset pagination) in several services. This works but has known performance issues with large datasets -- Supabase/PostgreSQL must scan and skip `offset` rows before returning results.

For the public API, cursor-based pagination is better because:
1. **Consistent results** when data changes between page requests
2. **O(1) performance** regardless of page depth (uses index seek, not offset scan)
3. **API standard** -- cursor pagination is expected in modern APIs (GitHub, Stripe, etc.)

### Implementation pattern

The cursor is a base64-encoded composite of the sort column value and the row ID (for tiebreaking):

```typescript
// app/lib/pagination.ts

export interface PaginationParams {
  limit: number;
  cursor?: string;
  direction: "next" | "prev";
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    next_cursor: string | null;
    prev_cursor: string | null;
    has_more: boolean;
    limit: number;
  };
}

interface DecodedCursor {
  value: string;  // sort column value
  id: number;     // row ID for tiebreaking
}

export function encodeCursor(value: string, id: number): string {
  return btoa(JSON.stringify({ v: value, i: id }));
}

export function decodeCursor(cursor: string): DecodedCursor {
  try {
    const { v, i } = JSON.parse(atob(cursor));
    return { value: v, id: i };
  } catch {
    throw apiError(400, "invalid_cursor", "The cursor parameter is malformed");
  }
}

export function parsePaginationParams(url: URL): PaginationParams {
  const limitStr = url.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitStr || "20", 10), 1), 100);
  const cursor = url.searchParams.get("cursor") || undefined;
  const direction = url.searchParams.get("direction") === "prev" ? "prev" : "next";
  return { limit, cursor, direction };
}
```

### Supabase query pattern for cursor pagination

```typescript
// Example: meetings sorted by meeting_date DESC, id DESC

async function getMeetingsPaginated(
  supabase: SupabaseClient,
  params: PaginationParams,
  municipalityId: number
): Promise<PaginatedResponse<MeetingApiResponse>> {
  let query = supabase
    .from("meetings")
    .select("id, title, meeting_date, type, status, ...")
    .eq("municipality_id", municipalityId)
    .order("meeting_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(params.limit + 1);  // fetch one extra to detect has_more

  if (params.cursor) {
    const { value, id } = decodeCursor(params.cursor);
    // Keyset condition: (meeting_date, id) < (cursor_date, cursor_id)
    query = query.or(
      `meeting_date.lt.${value},` +
      `and(meeting_date.eq.${value},id.lt.${id})`
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  const hasMore = (data?.length || 0) > params.limit;
  const items = (data || []).slice(0, params.limit);

  const lastItem = items[items.length - 1];
  const firstItem = items[0];

  return {
    data: items.map(transformToApiResponse),
    pagination: {
      next_cursor: hasMore && lastItem
        ? encodeCursor(lastItem.meeting_date, lastItem.id)
        : null,
      prev_cursor: params.cursor && firstItem
        ? encodeCursor(firstItem.meeting_date, firstItem.id)
        : null,
      has_more: hasMore,
      limit: params.limit,
    },
  };
}
```

**Key design choices:**

1. **Composite cursor (sort_value + id):** Handles duplicate values in the sort column (e.g., multiple meetings on the same date).
2. **Fetch limit + 1:** Efficiently detect if more pages exist without a separate COUNT query.
3. **Base64-encoded JSON cursor:** Opaque to the consumer (they shouldn't parse it), but debuggable by the developer.
4. **Default limit: 20, max: 100.** Prevents clients from requesting unbounded result sets.

### OCD pagination note

The OCD convention uses `?page=1&per_page=20` with `max_page` in response metadata (offset-based). Since the OCD standard itself is no longer actively maintained and cursor-based is objectively better for API consumers, the OCD endpoints should use cursor pagination but include an `ocd_compat` wrapper that includes `meta.page` and `meta.max_page` fields computed from the result set for backward compatibility.

---

## 8. Response Envelope and Error Format

### Success response

```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJ2IjoiMjAyNi0wMi0xNSIsImkiOjQyfQ==",
    "prev_cursor": null,
    "has_more": true,
    "limit": 20
  },
  "meta": {
    "municipality": "view-royal",
    "request_id": "req_abc123",
    "timestamp": "2026-02-19T10:30:00Z"
  }
}
```

### Single resource response

```json
{
  "data": { ... },
  "meta": {
    "municipality": "view-royal",
    "request_id": "req_abc123"
  }
}
```

### Error response (RFC 7807 inspired)

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit of 60 requests/minute exceeded",
    "status": 429
  }
}
```

HTTP status codes used:
- `200` -- success
- `400` -- bad request (invalid params, bad cursor)
- `401` -- missing or invalid API key
- `403` -- API key disabled
- `404` -- resource not found
- `429` -- rate limited
- `500` -- internal server error

---

## 9. OCD Serialization Layer

### Architecture: Separate serializer modules

The OCD API serves the same underlying data as the public API but in OCD-standard JSON format. Rather than duplicating query logic, use serializer functions that transform internal data models to OCD format.

```
app/
  services/
    meetings.ts          # Existing query functions (shared)
    people.ts            # Existing query functions (shared)
    matters.ts           # Existing query functions (shared)
    ...
  lib/
    api.server.ts        # API auth, rate limiting, error handling
    pagination.ts        # Cursor pagination utilities
    ocd/
      serializers.ts     # All OCD entity serializers
      types.ts           # OCD TypeScript interfaces
      ids.ts             # OCD ID generation/resolution
```

### OCD ID mapping

The `municipalities` table already has an `ocd_id` column. The PLAN-multi-town-ingestion.md specifies `ocd_id` columns on organizations, people, meetings, matters, and motions -- but these columns may not exist yet.

**Strategy:** Generate OCD IDs deterministically from internal IDs at serialization time if the `ocd_id` column is empty. Store generated IDs back to the database on first access (lazy population).

```typescript
// app/lib/ocd/ids.ts

const OCD_JURISDICTION = "ocd-jurisdiction/country:ca/province:bc/place:view_royal";

export function generateOcdId(type: string, internalId: number): string {
  // Deterministic UUID v5 from internal ID + type
  // This ensures the same internal ID always maps to the same OCD ID
  return `ocd-${type}/${uuidV5(`${type}:${internalId}`, NAMESPACE_OCD)}`;
}

export function getOcdIdForEntity(
  type: "person" | "organization" | "event" | "bill" | "vote",
  row: { id: number; ocd_id?: string | null }
): string {
  return row.ocd_id || generateOcdId(type, row.id);
}
```

### Serializer pattern

```typescript
// app/lib/ocd/serializers.ts

import type { Meeting, Person, Matter, Motion } from "../types";

export function serializeEvent(
  meeting: Meeting,
  agendaItems: AgendaItem[],
  attendance: Attendance[]
): OcdEvent {
  return {
    id: getOcdIdForEntity("event", meeting),
    _type: "event",
    name: meeting.title,
    description: meeting.summary || meeting.title,
    classification: mapMeetingTypeToOcd(meeting.type),
    start_time: `${meeting.meeting_date}T19:00:00-08:00`, // Default 7 PM PT
    timezone: "America/Vancouver",
    end_time: null,
    all_day: false,
    status: meeting.has_minutes ? "passed" : "confirmed",
    location: {
      name: "View Royal Town Hall - Council Chambers",
      url: "https://www.viewroyal.ca",
      coordinates: null,
    },
    participants: attendance.map(a => ({
      name: a.person?.name || "Unknown",
      id: getOcdIdForEntity("person", a.person || { id: a.person_id }),
      type: "person",
      note: a.attendance_mode,
    })),
    agenda: agendaItems.map(item => ({
      description: item.title,
      order: item.item_order || String(item.id),
      subjects: item.keywords || [],
      related_entities: (item.motions || []).map(m => ({
        id: getOcdIdForEntity("vote", m),
        _type: "vote",
        note: m.text_content?.slice(0, 100),
      })),
      notes: item.description ? [item.description] : [],
    })),
    media: meeting.video_url ? [{
      name: "Video Recording",
      type: "recording",
      links: [{ media_type: "text/html", url: meeting.video_url }],
    }] : [],
    documents: [],
    sources: [{
      url: `https://viewroyal.ai/meetings/${meeting.id}`,
      note: "ViewRoyal.ai civic intelligence platform",
    }],
    created_at: meeting.created_at,
    updated_at: meeting.created_at,
  };
}

// Similar functions: serializePerson, serializeOrganization,
// serializeBill (from Matter), serializeVote (from Motion + Votes)
```

### Entity mapping (internal -> OCD)

| Internal Entity | OCD Entity | Notes |
|---|---|---|
| `municipalities` | `jurisdiction` | 1:1 mapping. Use existing `ocd_id` column |
| `organizations` | `organization` | Council, committees -> OCD org types |
| `people` + `memberships` | `person` | Memberships become OCD posts/contact_details |
| `meetings` + `attendance` | `event` | Agenda items become event agenda array |
| `matters` + `bylaws` | `bill` | Status maps to OCD bill actions |
| `motions` + `votes` | `vote` | Roll call from individual vote records |

---

## 10. OpenAPI Documentation

### Approach: Static JSON served from a route

Rather than using a framework like Chanfana (which requires itty-router or Hono), serve a hand-crafted OpenAPI 3.1 JSON spec from a React Router route. The spec is a TypeScript object exported from a module, ensuring it stays in sync with the code.

```typescript
// app/lib/openapi-spec.ts
export const openapiSpec = {
  openapi: "3.1.0",
  info: {
    title: "ViewRoyal.ai Civic Data API",
    version: "1.0.0",
    description: "Public API for civic intelligence data...",
    contact: { ... },
    license: { name: "MIT" },
  },
  servers: [{ url: "https://viewroyal.ai/api/v1" }],
  security: [{ bearerAuth: [] }],
  paths: { ... },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "API key via Authorization: Bearer <key>",
      },
    },
    schemas: { ... },
  },
};
```

```typescript
// app/routes/api.v1.openapi.ts
import { openapiSpec } from "../lib/openapi-spec";

export function loader() {
  return new Response(JSON.stringify(openapiSpec, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
```

**Why hand-crafted, not auto-generated:** The API surface is small (~15 endpoints). Auto-generation frameworks add dependencies and runtime overhead. A TypeScript object can use shared type definitions and is easy to keep accurate.

---

## 11. CORS Configuration

Public APIs must serve CORS headers. Add them to all `/api/v1/` and `/api/ocd/` responses:

```typescript
// app/lib/api.server.ts

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function apiJsonResponse(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
): Response {
  return Response.json(data, {
    status,
    headers: {
      ...corsHeaders(),
      "Cache-Control": "public, max-age=60",
      ...extraHeaders,
    },
  });
}
```

Each API route should also handle OPTIONS preflight:

```typescript
// In each api.v1.*.ts route:
export function loader({ request }: { request: Request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  // ... normal handler
}
```

---

## 12. Component Boundaries

### New components (to be created)

| Component | Path | Responsibility |
|---|---|---|
| `api.server.ts` | `app/lib/api.server.ts` | API key auth, rate limiting, error formatting, CORS |
| `pagination.ts` | `app/lib/pagination.ts` | Cursor encoding/decoding, pagination param parsing |
| `openapi-spec.ts` | `app/lib/openapi-spec.ts` | OpenAPI 3.1 specification object |
| `ocd/serializers.ts` | `app/lib/ocd/serializers.ts` | OCD entity serialization functions |
| `ocd/types.ts` | `app/lib/ocd/types.ts` | OCD TypeScript interfaces |
| `ocd/ids.ts` | `app/lib/ocd/ids.ts` | OCD ID generation and resolution |
| API route files | `app/routes/api.v1.*.ts` | ~10 public API endpoint routes |
| OCD route files | `app/routes/api.ocd.*.ts` | ~12 OCD endpoint routes |

### Modified components

| Component | Path | Change |
|---|---|---|
| `workers/app.ts` | Worker entry | Add `RateLimit` to Env interface |
| `wrangler.toml` | Config | Add `[[ratelimits]]` binding |
| `vite.config.ts` | Build config | No changes needed (env vars already handled) |

### Unchanged components (reused as-is)

| Component | Path | How it's used |
|---|---|---|
| `services/meetings.ts` | Query functions | Called by API routes for data |
| `services/people.ts` | Query functions | Called by API routes |
| `services/matters.ts` | Query functions | Called by API routes |
| `services/bylaws.ts` | Query functions | Called by API routes |
| `services/elections.ts` | Query functions | Called by API routes |
| `services/organizations.ts` | Query functions | Called by API routes |
| `services/hybrid-search.server.ts` | Unified search | Called by search API route |
| `services/rag.server.ts` | RAG Q&A | Called by ask API route |
| `lib/supabase.server.ts` | Supabase clients | Admin client used by all API routes |

---

## 13. Data Flow

### Public API request flow

```
Client                  Cloudflare Worker               Supabase
  |                          |                             |
  |-- GET /api/v1/meetings -->|                             |
  |    Authorization: Bearer  |                             |
  |                          |                              |
  |                    [1] Extract API key from header      |
  |                    [2] SHA-256 hash -> lookup in DB ---->|
  |                                                    <----|  api_keys row
  |                    [3] Check is_active                  |
  |                    [4] Rate limit check (CF binding)    |
  |                    [5] Parse pagination params          |
  |                    [6] Query meetings (existing svc) -->|
  |                                                    <----|  meeting rows
  |                    [7] Transform to API response        |
  |                    [8] Add pagination metadata          |
  |<-- 200 JSON envelope ---|                              |
```

### OCD API request flow

```
Client                  Cloudflare Worker               Supabase
  |                          |                             |
  |-- GET /api/ocd/events -->|                             |
  |    Authorization: Bearer  |                             |
  |                          |                              |
  |                    [1-5] Same auth + rate limit flow    |
  |                    [6] Query meetings (existing svc) -->|
  |                                                    <----|  meeting rows
  |                    [7] OCD serializer transforms       |
  |                    [8] Add OCD pagination metadata     |
  |<-- 200 OCD JSON --------|                              |
```

---

## 14. Suggested Build Order

Based on dependencies between components:

### Phase 1: Foundation (no external-facing changes)
1. **Database migration:** Create `api_keys` table
2. **`api.server.ts`:** API key validation, error formatting, CORS helpers
3. **`pagination.ts`:** Cursor encoding/decoding utilities
4. **Key generation script:** CLI tool to create API keys

### Phase 2: Core Data API
5. **First endpoint pair:** `api.v1.meetings.ts` + `api.v1.meetings.$id.ts`
   - Validates the full auth -> query -> paginate -> respond flow
6. **Rate limiting integration:** Wire up CF Workers Rate Limiting binding
7. **Remaining data endpoints:** matters, people, motions, bylaws
8. **Search + Ask endpoints:** `api.v1.search.ts`, `api.v1.ask.ts`

### Phase 3: OCD Layer
9. **`ocd/types.ts` + `ocd/ids.ts`:** OCD type definitions and ID generation
10. **`ocd/serializers.ts`:** Transform functions for all 6 entity types
11. **OCD route files:** All 12 OCD endpoint routes
12. **OCD ID backfill:** Migration to populate `ocd_id` columns on existing rows

### Phase 4: Documentation + Polish
13. **`openapi-spec.ts`:** Complete OpenAPI 3.1 specification
14. **`api.v1.openapi.ts`:** Serve the spec
15. **Developer documentation page** (optional web page)
16. **Response header polish:** Rate limit headers, caching headers

**Build order rationale:**
- Foundation first because everything depends on auth + pagination
- Data API before OCD because OCD is a serialization layer on top of the same queries
- OpenAPI last because the spec documents what was built (writing it first would require changing it constantly)
- Rate limiting after first endpoint so you can test the full flow incrementally

---

## 15. Scalability Considerations

| Concern | At 10 API keys | At 100 API keys | At 1,000 API keys |
|---|---|---|---|
| API key lookup | Single DB query per request | Add KV cache (5 min TTL) | KV cache + bloom filter |
| Rate limiting | CF binding handles it | CF binding handles it | CF binding handles it |
| DB connection pool | Admin client singleton sufficient | Monitor connection count | Consider connection pooler (Supavisor) |
| Response caching | None needed | Cache-Control headers | Add KV response cache for list endpoints |
| OpenAPI spec | Static JSON | Static JSON | Static JSON |

**None of these scaling concerns apply at current scale.** The platform serves one municipality with a handful of expected API consumers. The singleton admin client and CF rate limiting binding are more than sufficient.

---

## Sources

- [Cloudflare Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) -- Rate limiting binding API, GA since September 2025
- [React Router Middleware](https://reactrouter.com/how-to/middleware) -- Middleware API documentation, stable since 7.13.0
- [Open Civic Data Formats](https://open-civic-data.readthedocs.io/en/latest/data/index.html) -- OCD entity type specifications
- [OCD Identifiers](https://open-civic-data.readthedocs.io/en/latest/ocdids.html) -- OCD ID format specification
- [Supabase cursor-based pagination discussion](https://github.com/orgs/supabase/discussions/3938) -- Community patterns for keyset pagination
- [Chanfana OpenAPI framework](https://github.com/cloudflare/chanfana) -- OpenAPI schema generator for Workers (considered, not recommended)
- [Cloudflare React Router guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/) -- Official deployment guide
- Existing codebase: `apps/web/workers/app.ts`, `app/routes/api.*.tsx`, `app/services/*.ts`, `app/lib/supabase.server.ts`, `PLAN-multi-town-ingestion.md`
