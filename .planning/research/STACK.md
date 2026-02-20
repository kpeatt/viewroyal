# Technology Stack: v1.3 Public API + OCD API

**Project:** ViewRoyal.ai v1.3 Platform APIs
**Researched:** 2026-02-19
**Scope:** New dependencies for Public API with API key auth, rate limiting, OpenAPI 3.1 docs, cursor-based pagination, and OCD-standard endpoints on Cloudflare Workers.
**Out of scope:** Existing stack (React Router 7, Tailwind 4, shadcn/ui, Cloudflare Workers, Supabase, Gemini, fastembed) -- all validated and unchanged.

---

## Recommended Stack Additions

### 1. API Framework: Hono (alongside React Router 7)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| hono | ^4.12.0 | API router for `/api/v1/*` endpoints | Cloudflare-native, tiny (12kB), zero dependencies, first-class OpenAPI support via chanfana. React Router handles pages; Hono handles the public API. Avoids shoehorning REST API patterns into React Router's loader/action model. |

**Integration pattern:** Modify `workers/app.ts` to intercept `/api/v1/*` requests with Hono before passing remaining requests to React Router's `createRequestHandler`. This is a simple fetch-level split -- no adapter library needed.

```typescript
// workers/app.ts (simplified)
import { Hono } from "hono";
import { createRequestHandler } from "react-router";

const api = new Hono().basePath("/api/v1");
// ... mount API routes on `api` ...

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/v1")) {
      return api.fetch(request, env, ctx);
    }
    return requestHandler(request, { cloudflare: { env, ctx } });
  },
};
```

**Why NOT `hono-react-router-adapter`:** The adapter (`yusukebe/hono-react-router-adapter`) is explicitly marked as "currently unstable" with API changes possible without notice, has only 281 GitHub stars and 92 commits. A simple URL-prefix split in the worker entry is stable, trivial, and zero-dependency.

**Why NOT keep API routes in React Router:** The existing `api.*.tsx` routes (search, subscribe, geocode, etc.) work for internal frontend use, but a public API needs middleware chains (auth, rate limiting, CORS, versioning), OpenAPI spec generation, and structured error responses. Hono provides all of this natively. The internal React Router API routes remain untouched.

**Why NOT itty-router:** itty-router is lighter but Hono has a larger middleware ecosystem, better TypeScript types, and tighter chanfana integration. Both work; Hono is the better investment.

**Confidence:** HIGH -- Hono is Cloudflare's recommended framework, documented in their Workers guides, battle-tested at scale.

---

### 2. OpenAPI 3.1: chanfana

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| chanfana | ^3.0.0 | OpenAPI 3.1 schema generation + request validation from Zod schemas | Cloudflare's own library, used in production for Radar 2.0 API. Integrates directly with Hono via `fromHono()`. Auto-generates `/docs` (Swagger UI) and `/openapi.json`. Class-based endpoint definitions keep schema and handler co-located. |

chanfana v3 requires Zod v4 (current stable Zod release). Since the project does not currently use Zod, there is no migration burden -- it is a fresh addition.

**What chanfana provides that manual approaches do not:**
- Request/response validation from the same schema that generates docs
- Built-in Swagger UI at `/docs` with zero configuration
- CLI tool to extract static OpenAPI schema for CI/CD
- Battle-tested at Cloudflare scale (Radar 2.0 public API)

**Why NOT `@asteasolutions/zod-to-openapi` (v8.4.0):** Works standalone but is spec-generation only. You still need to wire up validation middleware, error formatting, and docs serving yourself. chanfana integrates all three with Hono.

**Why NOT `@hono/zod-openapi`:** Similar capability but chanfana is Cloudflare-maintained, more mature, and already proven in their production APIs.

**Why NOT manual OpenAPI JSON:** Tedious, error-prone, drifts from implementation. Schema-first with chanfana keeps spec and code in sync.

**Confidence:** HIGH -- Cloudflare-maintained, 3.0.0 stable release, production-proven.

---

### 3. Schema Validation: Zod v4

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| zod | ^4.3.5 | Request/response schema validation | Required by chanfana v3. Also used to define API response shapes, query parameter parsing, and OCD entity schemas. Zod v4 has better tree-shaking and error messages than v3. |

**Note:** Zod v4 is a fresh dependency. The existing codebase does not use Zod -- all validation is ad-hoc TypeScript types. Zod is added solely for the API layer; no need to retrofit existing code.

**Confidence:** HIGH -- Zod v4 is the current stable release, widely adopted.

---

### 4. Rate Limiting: Cloudflare Workers Rate Limit Binding

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Workers Rate Limit Binding | GA (built-in) | Per-key and per-IP rate limiting | Native Cloudflare binding, no external dependency. Configured in `wrangler.toml`. Returns `{ success: boolean }` -- trivial to wrap in Hono middleware. Location-scoped (permissive, not exact-count) which is appropriate for API abuse prevention. |

**wrangler.toml additions:**

```toml
[[ratelimits]]
name = "API_RATE_LIMITER"
namespace_id = "1001"
[ratelimits.simple]
limit = 100
period = 60
```

**Tiered limits via multiple bindings (future):**

```toml
[[ratelimits]]
name = "API_RATE_LIMITER_PAID"
namespace_id = "1002"
[ratelimits.simple]
limit = 1000
period = 60
```

**Usage:** `env.API_RATE_LIMITER.limit({ key: apiKeyOrIp })` returns `{ success: boolean }`.

**Pricing:** Appears included in Workers plans (no separate charge documented in pricing page). The rate limit binding went GA in September 2025. Requires Wrangler 4.36.0+ -- project uses ^4.64.0, so compatible.

**Why NOT KV for rate limiting:** KV is eventually consistent -- concurrent requests can race past limits. The rate limit binding is purpose-built for this use case.

**Why NOT Durable Objects:** Overkill for simple token-bucket rate limiting. DOs are for stateful coordination (WebSockets, exact counters). The binding is simpler, cheaper, and sufficient.

**Why NOT the existing in-memory rate limiter:** The current `api.search.tsx` uses an in-memory `Map` (line 16), which resets on every Worker cold start and does not persist across isolates. The binding persists across requests at each Cloudflare location.

**Why NOT upstash/ratelimit:** External dependency, added network latency, additional cost. The built-in binding is free and faster.

**Confidence:** HIGH -- GA announcement, official Cloudflare docs, wrangler.toml configuration documented.

---

### 5. API Key Management: SHA-256 Hash in Supabase

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Web Crypto API (SHA-256) | Built-in | Hash API keys for storage and verification | Cloudflare Workers support SHA-256 natively via `crypto.subtle`. API keys are high-entropy random tokens (not user-chosen passwords), so bcrypt's slow-hash protection against dictionary attacks is unnecessary. SHA-256 is sufficient and enables direct indexed lookup. |

**Table schema:**

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix VARCHAR(8) NOT NULL,    -- "vr_abcd" for display/identification
  key_hash TEXT NOT NULL,             -- SHA-256 hex digest
  scopes TEXT[] NOT NULL DEFAULT '{}', -- e.g. {'read:meetings', 'read:people'}
  rate_limit_tier TEXT NOT NULL DEFAULT 'free',
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
```

**Key generation (Worker-side):**

```typescript
// Generate: 32 random bytes -> base64url -> prefix with "vr_"
const raw = crypto.getRandomValues(new Uint8Array(32));
const encoded = btoa(String.fromCharCode(...raw))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const key = `vr_${encoded}`;
const prefix = key.substring(0, 8);

// Hash for storage
const hashBuffer = await crypto.subtle.digest(
  'SHA-256', new TextEncoder().encode(key)
);
const keyHash = [...new Uint8Array(hashBuffer)]
  .map(b => b.toString(16).padStart(2, '0')).join('');

// Store: INSERT INTO api_keys (key_prefix, key_hash, ...) VALUES ($1, $2, ...)
// Return `key` to user ONCE. Never stored in plaintext.
```

**Verification (on each request):**

```typescript
// Hash the provided key, direct index lookup
const hash = await sha256(bearerToken);
const { data } = await supabase
  .from('api_keys')
  .select('id, user_id, scopes, rate_limit_tier, is_active, expires_at')
  .eq('key_hash', hash)
  .single();
// Check is_active, expires_at, then proceed
```

**Why SHA-256 over bcrypt:**
- API keys are 32+ random bytes -- immune to dictionary attacks (bcrypt's raison d'etre)
- bcrypt's `crypt()` in PostgreSQL adds ~250ms per verification -- unacceptable for every API request
- SHA-256 is deterministic, enabling direct `WHERE key_hash = $1` lookups with an index (O(1))
- bcrypt requires fetching candidate rows by prefix, then comparing -- slower and more complex
- SHA-256 is natively available via `crypto.subtle` on Workers with zero dependencies
- This is the standard pattern used by Stripe, GitHub, and other API-key-based services

**Why NOT Supabase Vault:** Vault is for secrets the server needs to read back (decryption). API keys are verified by hash comparison, not decryption.

**Why NOT JWTs as API keys:** JWTs are self-contained tokens with claims. API keys are opaque identifiers looked up in the database. Database lookup gives us instant revocation, usage tracking, and rate limit tier association. JWTs require clock synchronization, short expiry + refresh tokens, and cannot be instantly revoked.

**Confidence:** HIGH -- Web Crypto SHA-256 documented in Cloudflare Workers docs, standard API key pattern.

---

### 6. API Documentation UI: chanfana Built-in Swagger UI

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| chanfana built-in Swagger UI | Included | Interactive API documentation at `/api/v1/docs` | Zero-config, comes with chanfana. Serves Swagger UI and raw OpenAPI JSON. No additional dependency needed. |

**Optional future upgrade:** Scalar (`@scalar/hono-api-reference`) provides a more modern UI with better DX. Can be swapped in later by replacing the docs route. Not needed for launch.

**Confidence:** HIGH -- built into chanfana.

---

### 7. Cursor-Based Pagination: Manual Keyset Pattern

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Keyset pagination | N/A (code pattern) | Efficient deep pagination for all list endpoints | No library needed. Supabase JS client supports `.gt()`, `.lt()`, `.order()` filters natively. Encode `(sort_value, id)` tuples as opaque base64 cursor strings. |

**Pattern:**

```typescript
// Cursor = base64(JSON({ d: "2024-01-15", i: 42 }))
// Decode -> { meeting_date: "2024-01-15", id: 42 }

const query = supabase
  .from('meetings')
  .select('id, title, meeting_date, ...')
  .order('meeting_date', { ascending: false })
  .order('id', { ascending: false })
  .limit(pageSize + 1); // +1 to detect "has next page"

if (cursor) {
  const { d, i } = decodeCursor(cursor);
  query.or(`meeting_date.lt.${d},and(meeting_date.eq.${d},id.lt.${i})`);
}

const { data } = await query;
const hasNext = data.length > pageSize;
const items = hasNext ? data.slice(0, pageSize) : data;
const nextCursor = hasNext ? encodeCursor(items[items.length - 1]) : null;
```

**Response envelope:**

```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJkIjoiMjAyNC0wMS0xNSIsImkiOjQyfQ==",
    "has_more": true,
    "page_size": 20
  }
}
```

**Why NOT offset pagination:** Performance degrades linearly with depth -- page 10,000 scans 200,000 rows. Cursor pagination is O(1) regardless of depth. For a civic data API where consumers may paginate through hundreds of meetings, this matters.

**Why NOT a pagination library:** The pattern is ~30 lines of code. Libraries add abstraction for no benefit.

**Confidence:** HIGH -- standard pattern, Supabase best practices doc confirms keyset approach.

---

### 8. OCD Compliance: Manual Mapping (No Library)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| OCD ID format | Spec (no lib) | Generate OCD-compliant identifiers and entity responses | The OCD specification is a data format standard, not an API framework. No maintained libraries exist. The spec is simple enough that a utility module suffices. |

**OCD entity mapping to existing tables:**

| OCD Type | ViewRoyal Table(s) | OCD ID Format | Notes |
|----------|-------------------|---------------|-------|
| Division | municipalities | `ocd-division/country:ca/csd:5917044` | `ocd_id` column already exists on municipalities |
| Jurisdiction | municipalities | `ocd-jurisdiction/country:ca/csd:5917044/council` | Derived from division ID + org type |
| Organization | organizations | `ocd-organization/{uuid}` | UUID generated from existing `id` |
| Person | people | `ocd-person/{uuid}` | UUID generated from existing `id` |
| Event | meetings | `ocd-event/{uuid}` | Maps to meeting with agenda items |
| Bill | matters + bylaws | `ocd-bill/{uuid}` | Matters are the closest analog |
| Vote | motions + votes | `ocd-vote/{uuid}` | Motion + individual vote records |

**Implementation approach:** OCD IDs are computed at API response time from existing primary keys (using UUID v5 with a project namespace to make them deterministic). No database migration needed for OCD ID columns on every table.

**UUID v5 for deterministic OCD IDs:**

```typescript
// Same input always produces same UUID
const OCD_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // or custom
const personOcdId = `ocd-person/${await uuidv5(`person:${person.id}`, OCD_NAMESPACE)}`;
```

**OCD specification status:** The official OCD API (by Open States/Sunlight Foundation) is no longer maintained. But the data format remains the de facto standard for civic data interoperability in North America. The spec is stable and will not change.

**OCD response format:** Follow the Popolo standard for Person/Organization, with OCD-specific extensions for Bills, Votes, Events. The shapes are documented at `open-civic-data.readthedocs.io`.

**Confidence:** MEDIUM -- Spec is stable but dormant. No community has updated it since ~2020. Implementation based on reading the spec docs directly, not from any reference implementation.

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| hono (built-in cors) | included | CORS middleware for API | Always -- public API needs `Access-Control-Allow-Origin` headers |
| hono (built-in bearer-auth) | included | Bearer token extraction from Authorization header | API key auth middleware |

These are built into Hono -- no additional packages.

---

## What NOT to Add

| Technology | Why Not |
|------------|---------|
| express / fastify | Not compatible with Cloudflare Workers runtime |
| jsonwebtoken / jose | API keys are opaque bearer tokens, not JWTs |
| passport.js | Node.js auth framework, not Workers-compatible |
| redis / upstash | External rate limiting when a free built-in binding exists |
| swagger-jsdoc | JSDoc-based OpenAPI gen is fragile and drifts; chanfana is schema-first |
| hono-react-router-adapter | Marked "unstable" by author; URL-prefix split is simpler |
| @hono/zod-openapi | chanfana is Cloudflare-maintained and more mature for this use case |
| any OCD npm package | None exist that are maintained |
| bcrypt / bcryptjs | Slow-hash unnecessary for high-entropy API keys; SHA-256 is correct |
| graphql / apollo | REST with OpenAPI is simpler, better tooling for civic data consumers |
| trpc | Designed for full-stack TypeScript apps, not public APIs with external consumers |
| Cloudflare KV (for rate limiting) | Eventually consistent -- unsuitable for rate limiting |
| Durable Objects (for rate limiting) | Overkill when the rate limit binding exists |

---

## Installation Summary

```bash
# From apps/web/
pnpm add hono chanfana zod
```

**Three new production dependencies. No new dev dependencies** -- chanfana, Hono, and Zod all include their own TypeScript types.

**wrangler.toml additions:**

```toml
# Rate limiting binding
[[ratelimits]]
name = "API_RATE_LIMITER"
namespace_id = "1001"
[ratelimits.simple]
limit = 100
period = 60
```

**Env type update (`workers/app.ts`):**

```typescript
interface Env {
  API_RATE_LIMITER: RateLimit;
  [key: string]: unknown;
}
```

---

## Version Compatibility Matrix

| Dependency | Version | Requires | Compatible With |
|------------|---------|----------|-----------------|
| chanfana | ^3.0.0 | zod ^4.3.5 | hono ^4.x |
| hono | ^4.12.0 | none | Cloudflare Workers, Wrangler ^4.x |
| zod | ^4.3.5 | none | chanfana ^3.0.0 |
| Rate Limit Binding | GA (Sept 2025) | Wrangler ^4.36.0 | Project uses ^4.64.0 |
| Web Crypto (SHA-256) | Built-in | nodejs_compat flag | Already enabled in wrangler.toml |

---

## New Database Objects

### Tables

| Table | Purpose |
|-------|---------|
| `api_keys` | Hashed API keys with scopes, rate limit tier, expiry |

### No New RPC Functions Required

Cursor pagination and OCD ID generation are handled in application code, not database functions.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| chanfana v3 breaking changes (Zod v4 churn) | Low | Medium | Pin to ^3.0.0, chanfana is Cloudflare-maintained with stability commitment |
| Rate limit binding pricing surprise | Low | Low | Appears free; worst case is nominal per-request cost on Workers Paid plan |
| OCD spec ambiguity (dormant project) | Medium | Low | Implement the subset that maps cleanly to our data; document deviations |
| Hono + React Router in same Worker conflicts | Low | Medium | URL-prefix split is clean; no shared middleware. Test thoroughly. |
| SHA-256 key hash collision | Negligible | High | SHA-256 collision probability is astronomically low (~10^-77 for 32-byte keys) |

---

## Sources

### HIGH Confidence (Official docs, first-party)
- [Cloudflare Workers Rate Limit Binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) -- GA API, configuration, usage
- [Rate Limiting GA announcement (Sept 2025)](https://developers.cloudflare.com/changelog/2025-09-19-ratelimit-workers-ga/) -- Production-ready
- [chanfana GitHub](https://github.com/cloudflare/chanfana) -- v3.0.0, Zod v4, Hono adapter
- [chanfana docs: router adapters](https://chanfana.pages.dev/router-adapters) -- Hono and itty-router support
- [chanfana v2->v3 migration](https://chanfana.pages.dev/migration-to-chanfana-3) -- Zod v4 breaking changes
- [OCD specification](https://open-civic-data.readthedocs.io/en/latest/data/index.html) -- Entity types
- [OCD Identifiers](https://open-civic-data.readthedocs.io/en/latest/ocdids.html) -- ID format spec
- [Cloudflare Web Crypto API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) -- SHA-256 support
- [Hono on Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers) -- Official guide
- [Hono Swagger UI middleware](https://hono.dev/examples/swagger-ui) -- Docs serving
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) -- Plan structure

### MEDIUM Confidence (Multiple sources, community-verified)
- [Supabase API key management (MakerKit)](https://makerkit.dev/blog/tutorials/supabase-api-key-management) -- Table schema, bcrypt/SHA-256 patterns
- [Supabase pagination best practices](https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/references/data-pagination.md) -- Keyset pagination
- [hono-react-router-adapter](https://github.com/yusukebe/hono-react-router-adapter) -- Stability warning confirmed
- [zod-to-openapi](https://github.com/asteasolutions/zod-to-openapi) -- v8.4.0, alternative considered

### LOW Confidence (Needs validation)
- Rate limit binding pricing (appears free/included but not explicitly stated on pricing page)
- chanfana custom router adapter extensibility (docs mention it, no examples found)

---
*Last updated: 2026-02-19*
