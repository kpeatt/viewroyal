# Phase 15: API Foundation - Research

**Researched:** 2026-02-20
**Domain:** API infrastructure (auth, rate limiting, error handling, CORS, routing) on Cloudflare Workers
**Confidence:** HIGH

## Summary

Phase 15 introduces a public API layer (`/api/v1/`) alongside the existing React Router 7 web app, all served from the same Cloudflare Worker. The architecture decision (from STATE.md) is to mount a Hono router at the fetch handler level, routing `/api/v1/*` requests to Hono and everything else to the existing React Router request handler. Chanfana (Cloudflare's own library) wraps Hono to provide OpenAPI 3.1 schema generation and request validation via Zod v4 schemas.

The key infrastructure components are: (1) API key authentication using SHA-256 hashing with `crypto.subtle.timingSafeEqual`, (2) durable rate limiting via the Cloudflare Workers Rate Limit binding (GA since September 2025), (3) consistent JSON error responses, (4) CORS via Hono's built-in middleware, and (5) municipality-scoped URL routing (`/api/v1/{municipality}/...`).

This is a well-trodden path -- Hono + chanfana is Cloudflare's recommended stack for API development on Workers, all components are GA, and the project already runs on Cloudflare Workers with the exact compatibility flags needed.

**Primary recommendation:** Mount a Hono app with chanfana at `/api/v1/` via a URL-prefix check in `workers/app.ts`, keeping the existing React Router handler untouched for all other routes. Use class-based `OpenAPIRoute` endpoints for all API routes to get automatic validation and OpenAPI spec generation from day one.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Keys are tied to a Supabase auth user (user_id FK on api_keys table)
- Schema migration creates the api_keys table; a seed SQL statement creates initial test key(s)
- Keys are shown once at creation only -- store SHA-256 hash, never the raw key
- Key prefix is stored separately for identification (e.g., first 8 chars) so keys can be listed without exposing the full value
- Errors are detailed and helpful -- include what's wrong and how to fix it
- All errors return consistent JSON shape: `{ "error": { "code", "message", "status" } }`
- API versioning is URL path only (`/api/v1/`) -- no version headers
- Both `X-API-Key` header and `?apikey` query parameter as authentication methods (INFRA-01)
- Rate limiting must use Cloudflare Workers Rate Limit binding to persist across isolate evictions (INFRA-03)
- Municipality scoping via URL path parameter: `/api/v1/{municipality}/...` (INFRA-07)

### Claude's Discretion
- Request IDs: whether to include on all responses or errors only, and the header name convention
- Rate limit headers: whether to include `X-RateLimit-*` headers on every response or only on 429s
- Rate limit thresholds: actual requests-per-minute/hour numbers
- CORS policy specifics (allowed origins, methods, headers)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | API consumers can authenticate via API key passed in `X-API-Key` header or `?apikey` query parameter | Hono middleware extracts key from header/query, SHA-256 hashes it, looks up in `api_keys` table via Supabase admin client |
| INFRA-02 | API keys are stored as SHA-256 hashes with timing-safe comparison to prevent timing attacks | Workers Web Crypto API: `crypto.subtle.digest("SHA-256", ...)` + `crypto.subtle.timingSafeEqual()` -- verified pattern from official CF docs |
| INFRA-03 | API consumers are rate limited per-key using Cloudflare Workers Rate Limit binding (durable across isolate eviction) | Rate Limit binding is GA (Sep 2025), configured via `[[ratelimits]]` in wrangler.toml, uses `env.RATE_LIMITER.limit({ key })` |
| INFRA-04 | Rate-limited requests receive HTTP 429 with `Retry-After` header | Middleware checks `{ success }` from `limit()` call, returns 429 with `Retry-After` based on the configured period |
| INFRA-05 | All API errors return consistent JSON shape: `{ "error": { "code", "message", "status" } }` | Hono `onError` handler + custom error classes; chanfana validation errors can be caught and reformatted |
| INFRA-06 | Public API routes (`/api/v1/*`, `/api/ocd/*`) include proper CORS headers for cross-origin access | Hono built-in `cors()` middleware applied to API routes |
| INFRA-07 | All API endpoints are scoped to a municipality via URL path parameter | Hono route pattern: `/api/v1/:municipality/*` with middleware to resolve slug to municipality record |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hono | ^4.12 | API router framework | Cloudflare's recommended API framework for Workers; ultra-fast, typed, middleware ecosystem |
| chanfana | ^3.0 | OpenAPI 3.1 generation + validation | Cloudflare's own library; wraps Hono with class-based endpoints, Zod validation, auto-generated spec |
| zod | ^4.3 (via `zod/v4`) | Schema validation | Required by chanfana v3; provides typed request validation and OpenAPI schema generation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @cloudflare/workers-types | ^4.x (already installed) | TypeScript types for Workers bindings | Already in project; provides `RateLimit` type for the rate limit binding |
| hono/cors | (built-in) | CORS middleware | Apply to all `/api/v1/*` routes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chanfana | hono-openapi | chanfana is Cloudflare-maintained, tighter integration, class-based pattern is cleaner for large APIs |
| Zod v4 (standalone) | zod@3 | chanfana v3 requires Zod v4; Zod v4 is imported via `zod/v4` subpath alongside v3 for compatibility |
| Hono rate limit middleware | CF Rate Limit binding | Binding is durable across isolate evictions; in-memory middleware is not |

**Installation:**
```bash
cd apps/web && pnpm add hono chanfana zod
```

Note: Zod v4 is accessed via `import { z } from "zod/v4"` -- the `zod` npm package exports v4 at a subpath. Chanfana v3 handles this internally.

## Architecture Patterns

### Recommended Project Structure
```
apps/web/
├── workers/
│   └── app.ts              # Fetch handler: URL-prefix split between Hono and React Router
├── app/
│   ├── api/                 # NEW: Hono API layer
│   │   ├── index.ts         # Hono app + chanfana setup, route registration
│   │   ├── middleware/
│   │   │   ├── auth.ts      # API key authentication middleware
│   │   │   ├── rate-limit.ts # Rate limiting middleware
│   │   │   ├── error-handler.ts # Consistent error formatting
│   │   │   └── municipality.ts  # Municipality resolution from URL param
│   │   ├── endpoints/
│   │   │   └── health.ts    # Test/health endpoint (Phase 15 only)
│   │   ├── lib/
│   │   │   ├── api-errors.ts # Error classes and types
│   │   │   └── api-key.ts    # SHA-256 hashing and comparison utilities
│   │   └── types.ts         # API-specific types (Env bindings, etc.)
│   ├── lib/                 # Existing app lib (supabase.server.ts, etc.)
│   ├── routes/              # Existing React Router routes
│   └── services/            # Existing service layer
```

### Pattern 1: URL-Prefix Split in Worker Fetch Handler
**What:** The Worker's `fetch` handler checks the URL path prefix to decide whether to route to Hono (API) or React Router (web app).
**When to use:** When mounting a separate API framework alongside an existing SSR framework in the same Worker.
**Example:**
```typescript
// workers/app.ts
import { createRequestHandler } from "react-router";
import apiApp from "../app/api";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Route /api/v1/* to Hono
    if (url.pathname.startsWith("/api/v1/")) {
      return apiApp.fetch(request, env, ctx);
    }

    // Everything else goes to React Router
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // existing cron handler
  },
} satisfies ExportedHandler<Env>;
```

### Pattern 2: Chanfana OpenAPI Setup with Hono
**What:** Initialize chanfana on a Hono app with base path, OpenAPI metadata, and endpoint registration.
**When to use:** Setting up the API router with auto-generated OpenAPI spec.
**Example:**
```typescript
// app/api/index.ts
import { Hono } from "hono";
import { fromHono } from "chanfana";
import { cors } from "hono/cors";
import { HealthEndpoint } from "./endpoints/health";
import type { ApiEnv } from "./types";

const app = new Hono<{ Bindings: ApiEnv }>();

// CORS for all API routes
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "HEAD", "OPTIONS"],
  allowHeaders: ["X-API-Key", "Content-Type"],
  exposeHeaders: ["X-Request-Id", "X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"],
  maxAge: 86400,
}));

// Initialize chanfana OpenAPI
const openapi = fromHono(app, {
  base: "/api/v1",
  docs_url: "/api/v1/docs",
  openapi_url: "/api/v1/openapi.json",
  redoc_url: null, // disable redoc
  openapiVersion: "3.1",
  schema: {
    info: {
      title: "ViewRoyal.ai API",
      version: "1.0.0",
      description: "Civic intelligence API for the Town of View Royal, BC",
    },
    servers: [
      { url: "https://viewroyal.ai", description: "Production" },
    ],
  },
});

// Register endpoints
openapi.get("/api/v1/health", HealthEndpoint);
openapi.get("/api/v1/:municipality/health", HealthEndpoint);

export default app;
```

### Pattern 3: API Key Authentication Middleware
**What:** Hono middleware that extracts API key from header or query param, hashes it, and looks up in database.
**When to use:** Applied to all authenticated API routes (everything except health/docs).
**Example:**
```typescript
// app/api/middleware/auth.ts
import { createMiddleware } from "hono/factory";
import type { ApiEnv } from "../types";
import { hashApiKey, timingSafeCompare } from "../lib/api-key";
import { ApiError } from "../lib/api-errors";

export const apiKeyAuth = createMiddleware<{ Bindings: ApiEnv }>(async (c, next) => {
  // Extract API key from header or query parameter
  const apiKey = c.req.header("X-API-Key") || c.req.query("apikey");

  if (!apiKey) {
    throw new ApiError(401, "MISSING_API_KEY",
      "API key required. Pass via X-API-Key header or ?apikey query parameter.");
  }

  // Hash the provided key
  const keyHash = await hashApiKey(apiKey);
  const prefix = apiKey.substring(0, 8);

  // Look up by prefix, then timing-safe compare the full hash
  const { data: keyRecord } = await getSupabaseAdminClient()
    .from("api_keys")
    .select("id, user_id, key_hash, is_active")
    .eq("key_prefix", prefix)
    .eq("is_active", true)
    .maybeSingle();

  if (!keyRecord || !(await timingSafeCompare(keyHash, keyRecord.key_hash))) {
    throw new ApiError(401, "INVALID_API_KEY",
      "Invalid API key. Check your key and try again.");
  }

  // Store key info in context for downstream use (rate limiting, logging)
  c.set("apiKeyId", keyRecord.id);
  c.set("userId", keyRecord.user_id);
  await next();
});
```

### Pattern 4: Rate Limiting Middleware
**What:** Hono middleware using the Cloudflare Workers Rate Limit binding.
**When to use:** Applied after authentication to enforce per-key rate limits.
**Example:**
```typescript
// app/api/middleware/rate-limit.ts
import { createMiddleware } from "hono/factory";
import type { ApiEnv } from "../types";
import { ApiError } from "../lib/api-errors";

export const rateLimit = createMiddleware<{ Bindings: ApiEnv }>(async (c, next) => {
  const apiKeyId = c.get("apiKeyId");
  const { success } = await c.env.API_RATE_LIMITER.limit({ key: `api:${apiKeyId}` });

  if (!success) {
    throw new ApiError(429, "RATE_LIMIT_EXCEEDED",
      "Rate limit exceeded. Please wait before making more requests.",
      { "Retry-After": "60" }
    );
  }

  await next();
});
```

### Pattern 5: Municipality Resolution Middleware
**What:** Resolves the `:municipality` URL parameter to a database record.
**When to use:** Applied to all municipality-scoped routes.
**Example:**
```typescript
// app/api/middleware/municipality.ts
import { createMiddleware } from "hono/factory";
import type { ApiEnv } from "../types";
import { ApiError } from "../lib/api-errors";

export const resolveMunicipality = createMiddleware<{ Bindings: ApiEnv }>(async (c, next) => {
  const slug = c.req.param("municipality");
  if (!slug) {
    throw new ApiError(400, "MISSING_MUNICIPALITY", "Municipality slug is required in the URL path.");
  }

  const { data, error } = await getSupabaseAdminClient()
    .from("municipalities")
    .select("id, slug, name, short_name")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) {
    throw new ApiError(404, "MUNICIPALITY_NOT_FOUND",
      `Municipality "${slug}" not found. Use the municipality slug (e.g., "view-royal").`);
  }

  c.set("municipality", data);
  await next();
});
```

### Anti-Patterns to Avoid
- **In-memory rate limiting:** The existing `api.ask.tsx` and `api.search.tsx` use in-memory `Map`-based rate limiting that resets on isolate eviction. The Rate Limit binding is durable.
- **String comparison for secrets:** Never use `===` to compare API key hashes. Always use `crypto.subtle.timingSafeEqual`.
- **Mounting Hono inside React Router:** Do not try to use React Router's route files for the API. The URL-prefix split in the fetch handler is cleaner and avoids React Router's loader/action overhead.
- **Mixing chanfana and raw Hono routes for API endpoints:** Use chanfana's `OpenAPIRoute` classes for all `/api/v1/` endpoints so the OpenAPI spec is always complete and accurate.
- **Registering routes AFTER calling `app.route()`:** Hono captures routes at registration time. Sub-app routes must be defined before mounting.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAPI spec generation | Manual JSON spec file | chanfana `fromHono()` | Spec stays in sync with code automatically; manual specs drift |
| Request validation | Custom validation logic | chanfana + Zod schemas | Type-safe, auto-generates OpenAPI, consistent error messages |
| CORS handling | Manual header setting | `hono/cors` middleware | Handles preflight OPTIONS, varies by origin, edge cases covered |
| Rate limiting | In-memory Map counters | CF Rate Limit binding | Durable across isolate evictions; shared across same namespace_id |
| Timing-safe comparison | Custom constant-time compare | `crypto.subtle.timingSafeEqual` | Platform-native, audited, handles length mismatch correctly |
| API key generation | `Math.random()` | `crypto.randomUUID()` or `crypto.getRandomValues()` | Cryptographically secure randomness |

**Key insight:** Every component in this phase has a platform-native or Cloudflare-blessed solution. The only custom code should be the api_keys table schema, the middleware that wires these components together, and the error formatting.

## Common Pitfalls

### Pitfall 1: Rate Limit Binding Period Constraints
**What goes wrong:** Configuring the rate limit period to anything other than 10 or 60 seconds causes a deployment error.
**Why it happens:** The Rate Limit binding only supports `period: 10` or `period: 60` (seconds).
**How to avoid:** Use `period: 60` for standard API rate limiting. If you need a per-minute limit, that maps directly. For per-hour limits, you would need a second binding or track windows differently.
**Warning signs:** Wrangler deploy fails with an opaque error about rate limit configuration.

### Pitfall 2: timingSafeEqual Length Mismatch
**What goes wrong:** `crypto.subtle.timingSafeEqual` throws an exception when the two buffers have different lengths, which leaks information about the expected value's length.
**Why it happens:** The function is not constant-time with respect to buffer length.
**How to avoid:** Always hash both values with SHA-256 first (producing fixed 32-byte outputs), then compare the hashes. This is the pattern from Cloudflare's official best practices documentation.
**Warning signs:** Uncaught exceptions on auth middleware when key format varies.

### Pitfall 3: Chanfana Route Registration Order
**What goes wrong:** Routes return 404 even though they appear to be registered.
**Why it happens:** In Hono, routes must be defined on sub-apps *before* the sub-app is mounted on the parent. If you call `app.route()` before registering endpoints on the child app, they won't be captured.
**How to avoid:** Define all routes on the chanfana openapi object first, then export the app. Since we use a single flat app (not nested sub-apps), this is less of a concern, but be careful if refactoring into sub-routers.
**Warning signs:** 404 responses for routes that are clearly registered in code.

### Pitfall 4: Hono Env Type Not Propagated to Middleware
**What goes wrong:** `c.env.API_RATE_LIMITER` is typed as `unknown` or doesn't autocomplete.
**Why it happens:** The `Hono<{ Bindings: Env }>` generic must be passed consistently to `createMiddleware<{ Bindings: Env }>()` and the main app instance.
**How to avoid:** Define an `ApiEnv` type centrally and use it everywhere. Export it from `app/api/types.ts`.
**Warning signs:** TypeScript errors about `Property does not exist on type 'unknown'`.

### Pitfall 5: wrangler.toml Env Overwrite
**What goes wrong:** The Rate Limit binding configuration is missing after deploy because `wrangler deploy` overwrites dashboard-set configurations.
**Why it happens:** Known issue documented in CLAUDE.md -- `wrangler deploy` uses `wrangler.toml` as source of truth.
**How to avoid:** Always define the `[[ratelimits]]` binding in `wrangler.toml`, not just in the dashboard.
**Warning signs:** Rate limiting stops working after a deploy.

### Pitfall 6: Chanfana Error Format vs. Custom Error Format
**What goes wrong:** Validation errors from chanfana return a different JSON shape than the project's required `{ "error": { "code", "message", "status" } }` format.
**Why it happens:** Chanfana returns its own validation error format (based on Zod errors) by default.
**How to avoid:** Use Hono's `app.onError()` handler to catch all errors (including chanfana's `InputValidationException`) and reformat them to the consistent shape before returning.
**Warning signs:** Inconsistent error shapes between validation errors and business logic errors.

## Code Examples

### SHA-256 Key Hashing and Timing-Safe Comparison
```typescript
// Source: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
// Source: https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/

export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  // Convert to hex string for storage
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function timingSafeCompare(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  // Hash both to fixed-size buffers to avoid leaking length
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(hashA, hashB);
}
```

### Consistent Error Handler
```typescript
// app/api/lib/api-errors.ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        status: this.status,
      },
    };
  }
}

// In app/api/index.ts - Hono onError handler
app.onError((err, c) => {
  if (err instanceof ApiError) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (err.headers) Object.assign(headers, err.headers);
    return c.json(err.toJSON(), err.status as any, headers);
  }

  // Chanfana validation errors
  if (err.name === "InputValidationException" || err.message?.includes("validation")) {
    return c.json({
      error: {
        code: "VALIDATION_ERROR",
        message: err.message,
        status: 400,
      },
    }, 400);
  }

  // Unexpected errors
  console.error("Unhandled API error:", err);
  return c.json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      status: 500,
    },
  }, 500);
});
```

### Rate Limit Binding Configuration (wrangler.toml)
```toml
# Source: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
[[ratelimits]]
name = "API_RATE_LIMITER"
namespace_id = "1001"

  [ratelimits.simple]
  limit = 100
  period = 60
```

### API Key Generation (for seed/creation)
```typescript
// Source: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "vr_" + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
// Produces: vr_a1b2c3d4e5f6...  (67 chars: 3 prefix + 64 hex)
// Prefix for DB: "vr_a1b2c" (first 8 chars)
```

### Env Type Definition
```typescript
// app/api/types.ts
export interface ApiEnv {
  // Existing vars (from wrangler.toml [vars])
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: string;
  // Secrets
  SUPABASE_SECRET_KEY: string;
  GEMINI_API_KEY: string;
  // Rate limit binding
  API_RATE_LIMITER: RateLimit;
  // Context variables set by middleware
  [key: string]: unknown;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `unsafe` rate limit binding (beta) | `ratelimits` binding (GA) | Sep 2025 | Stable for production use; no migration needed for new projects |
| chanfana v2 + Zod v3 | chanfana v3 + Zod v4 | ~Feb 2026 | Must use `zod/v4` import path; chanfana v3 requires it |
| itty-router-openapi | chanfana | ~2024 | chanfana is the renamed/rewritten successor; supports Hono natively |
| Manual OpenAPI spec files | Code-first with chanfana | Current | Spec auto-generated from endpoint schemas |

**Deprecated/outdated:**
- `itty-router-openapi`: Predecessor to chanfana. Do not use; chanfana is the official successor.
- `unsafe` rate limit binding: The old experimental binding name. Use `ratelimits` in wrangler.toml.

## Discretionary Recommendations

For the areas marked as "Claude's Discretion" in CONTEXT.md:

### Request IDs
**Recommendation:** Include `X-Request-Id` on ALL responses (not just errors). Use `crypto.randomUUID()` to generate. This is industry standard (Stripe, GitHub, Twilio all do this) and invaluable for debugging. Minimal overhead.

### Rate Limit Headers
**Recommendation:** Include `X-RateLimit-Limit` and `X-RateLimit-Remaining` on ALL successful responses. The Rate Limit binding's `limit()` call returns `{ success }` but does not return remaining count. Since we only get a boolean, we can include `X-RateLimit-Limit` (the configured max) on every response but cannot provide accurate `X-RateLimit-Remaining` without additional tracking. Keep it simple: include `X-RateLimit-Limit` on all responses, and `Retry-After` only on 429s.

### Rate Limit Thresholds
**Recommendation:** 100 requests per 60 seconds per API key. This is generous for a civic data API (mostly read-only, cacheable data). The Rate Limit binding period must be either 10 or 60 seconds -- use 60 for a natural "per minute" mental model. Can be adjusted later by changing `wrangler.toml`.

### CORS Policy
**Recommendation:** Allow all origins (`*`) since this is a public API with API key auth. Restrict methods to `GET, HEAD, OPTIONS` (Phase 15 only has read endpoints; expand when write endpoints are added). Expose rate limit headers and request ID. Set `maxAge: 86400` (24 hours) for preflight caching.

## Open Questions

1. **Rate Limit binding pricing**
   - What we know: The binding is GA and included in Workers pricing. No separate per-call pricing is documented anywhere.
   - What's unclear: Whether there are hidden costs at scale or if it's truly unlimited within the Workers plan.
   - Recommendation: Proceed with implementation; monitor billing. This was already flagged in STATE.md as a concern to verify before production launch.

2. **Chanfana v3 maturity**
   - What we know: chanfana v3.0.0 was published ~13 days ago (early Feb 2026). It requires Zod v4.
   - What's unclear: Whether there are edge-case bugs in this very new major version.
   - Recommendation: Proceed -- it's Cloudflare-maintained, and the v2 -> v3 changes are primarily about Zod v4 compatibility, not architectural changes. Pin to `^3.0.0`.

3. **Zod v4 import path**
   - What we know: Zod v4 is available via `import { z } from "zod/v4"` subpath. The `zod` package on npm (v4.3.6) supports both v3 (main export) and v4 (subpath export).
   - What's unclear: Whether chanfana v3 handles this internally or if the user must import from `zod/v4` explicitly.
   - Recommendation: Import from `zod/v4` explicitly in endpoint files to be safe. Test during implementation.

## Sources

### Primary (HIGH confidence)
- [Cloudflare Workers Rate Limit binding docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) -- binding configuration, `limit()` API, wrangler.toml syntax
- [Cloudflare Workers best practices: timing-safe comparison](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) -- SHA-256 + timingSafeEqual pattern
- [Cloudflare Workers timingSafeEqual example](https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/) -- complete implementation pattern
- [Cloudflare Rate Limit binding GA announcement](https://developers.cloudflare.com/changelog/2025-09-19-ratelimit-workers-ga/) -- confirms GA status
- [Hono CORS middleware docs](https://hono.dev/docs/middleware/builtin/cors) -- all CORS options
- [Hono routing and app composition](https://hono.dev/docs/api/routing) -- route(), basePath(), mount()
- [Hono Cloudflare Workers bindings](https://hono.dev/docs/getting-started/cloudflare-workers) -- c.env access pattern

### Secondary (MEDIUM confidence)
- [chanfana GitHub README](https://github.com/cloudflare/chanfana) -- fromHono() usage, OpenAPIRoute pattern
- [chanfana router options docs](https://chanfana.pages.dev/user-guide/router-options/) -- base, docs_url, openapi_url, openapiVersion, schema config
- [chanfana defining endpoints docs](https://chanfana.pages.dev/endpoints/defining-endpoints) -- full schema structure, getValidatedData
- [chanfana OpenAPI configuration](https://chanfana.pages.dev/openapi-configuration-customization) -- RouterOptions complete reference
- [chanfana v2 to v3 migration guide](https://chanfana.pages.dev/migration-to-chanfana-3) -- Zod v4 changes, import paths
- [chanfana Hono integration docs](https://chanfana.pages.dev/routers/hono/) -- Hono-specific setup

### Tertiary (LOW confidence)
- Rate Limit binding pricing: No explicit pricing documentation found. Appears included in Workers plan based on absence of separate billing page (unlike KV, R2, D1 which all have dedicated pricing pages).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Hono, chanfana, and Rate Limit binding are all Cloudflare-maintained/recommended, GA, and well-documented
- Architecture: HIGH -- URL-prefix split is straightforward; the existing `workers/app.ts` fetch handler makes this a natural insertion point
- Pitfalls: HIGH -- all pitfalls documented from official sources with verified workarounds
- Discretionary items: MEDIUM -- recommendations based on industry conventions, not project-specific testing

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable ecosystem; 30-day validity)
