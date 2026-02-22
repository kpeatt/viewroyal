# Phase 18: Documentation & Key Management - Research

**Researched:** 2026-02-21
**Domain:** OpenAPI specification generation, Swagger UI, API key self-service management
**Confidence:** HIGH

## Summary

Phase 18 has two deliverables: (1) serve an OpenAPI 3.1 spec and interactive Swagger UI for all public API endpoints, and (2) build a self-service API key management page for authenticated users.

The good news is that both deliverables are largely enabled by existing infrastructure. chanfana v3.0.0 (already installed and configured) auto-generates both the OpenAPI spec at `/api/v1/openapi.json` and a Swagger UI page at `/api/v1/docs`. The v1 endpoints already use `OpenAPIRoute` classes with Zod schemas, so they are already partially documented in the generated spec. The `api_keys` table already exists with RLS policies for user CRUD. The primary work is: (a) enriching the spec with security schemes, tags, error schemas, and a custom intro, (b) ensuring the Swagger UI is served correctly through the Worker fetch handler, (c) handling the fact that OCD endpoints use plain Hono handlers (not chanfana) and need manual spec entries, and (d) building the key management React page with create/view/revoke actions.

**Primary recommendation:** Leverage chanfana's existing `docs_url`/`openapi_url` configuration and `registry.registerComponent` for security schemes. Build the key management page as a new React Router route at `/settings/api-keys` (or a new section within the existing `/settings` page) using the existing Supabase auth + RLS patterns.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Standalone Swagger UI at `/api/v1/docs` -- no site chrome, full-page Swagger
- Default Swagger theme -- standard green, no custom branding
- Standard "Authorize" button for API key auth -- user pastes their key to use "Try it out"
- Brief intro section at top with API overview and link to get an API key
- Key management lives under settings/account section (e.g. `/settings/api-keys`)
- Inline reveal on key creation -- new key appears in the list with copy button, highlighted until dismissed, with clear warning "Save this now -- you won't see it again"
- No key names/labels -- keys identified by prefix + creation date only (per requirement)
- Maximum 3 keys per user
- Spec generated from code (decorators/annotations on route handlers), not a separate handwritten file
- Key list shows prefix + creation date only (per requirement)
- Confirmation dialog before revoking: "Are you sure? This key will stop working immediately." with confirm/cancel
- Being logged in is sufficient to revoke -- no re-authentication required

### Claude's Discretion
- Single spec vs separate specs for v1 and OCD endpoints
- Description/example detail level per endpoint -- calibrate based on complexity
- Error response documentation strategy
- API key prefix format
- Exact key length and entropy

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOCS-01 | OpenAPI 3.1 spec is served at `/api/v1/openapi.json` documenting all public endpoints | chanfana already configured with `openapi_url: "/api/v1/openapi.json"` and `openapiVersion: "3.1"`. v1 endpoints auto-documented via OpenAPIRoute schemas. OCD endpoints need manual addition. Worker fetch handler needs to route `/api/v1/docs` and `/api/v1/openapi.json` to Hono. |
| DOCS-02 | Interactive Swagger UI is served at `/api/v1/docs` for API exploration | chanfana already configured with `docs_url: "/api/v1/docs"`. Serves CDN-hosted swagger-ui-dist@5.17.14. Need to verify Worker routing passes these paths through. Security scheme must be registered for "Authorize" button. |
| DOCS-03 | Authenticated user can create, view, and revoke API keys via a self-service management page | `api_keys` table exists with RLS policies for user CRUD. Key generation utility (`generateApiKey`) already implemented. Need new route + UI + server actions. |
| DOCS-04 | API key management page shows key prefix (not full key) and creation date | `key_prefix` (varchar(8)) and `created_at` columns already exist on `api_keys` table. RLS policy allows users to SELECT their own keys. |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| chanfana | 3.0.0 | OpenAPI 3.1 spec generation from Hono routes | Already configured with `fromHono()`, auto-generates spec + Swagger UI |
| hono | 4.12.0 | API router | Already in use for all API endpoints |
| zod | 4.3.6 | Request/response schema validation | Already used in all OpenAPIRoute classes |
| @supabase/ssr | 0.8.0 | Server-side auth (cookie-based) | Already used in settings page for user context |
| @supabase/supabase-js | 2.90.1 | Supabase client for DB operations | Already used throughout |
| react-router | 7.12.0 | Page routing + server loaders/actions | Already used for settings page |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-dialog | 1.15 | Confirmation dialog for key revocation | Revoke confirmation modal |
| lucide-react | 0.562.0 | Icons for key management UI | Key, Copy, Trash icons |
| @asteasolutions/zod-to-openapi | 8.4.1 | OpenAPI registry (used by chanfana internally) | `registerComponent` for security schemes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chanfana built-in Swagger UI | @hono/swagger-ui middleware | No benefit -- chanfana already bundles it; adding another package is redundant |
| Separate handwritten OpenAPI YAML | Code-generated spec | User locked decision: spec generated from code |
| Separate `/api/ocd/openapi.json` | Single combined spec | Single spec is simpler; OCD endpoints can be tagged separately within one spec |

**Installation:** No new packages needed. Everything is already installed.

## Architecture Patterns

### Current API Architecture
```
workers/app.ts (fetch handler)
  ├── /api/v1/* → apiApp (Hono + chanfana OpenAPIRoute classes)
  │   ├── /api/v1/openapi.json  (auto-generated by chanfana)
  │   ├── /api/v1/docs           (auto-generated Swagger UI by chanfana)
  │   ├── /api/v1/health         (OpenAPIRoute)
  │   ├── /api/v1/:muni/meetings (OpenAPIRoute + middleware)
  │   └── ... (all data + search endpoints)
  ├── /api/ocd/* → ocdApp (plain Hono handlers, NOT chanfana)
  └── everything else → React Router
```

### Pattern 1: Register Security Scheme for "Authorize" Button
**What:** Register an API key security scheme with chanfana's registry so Swagger UI shows the "Authorize" button.
**When to use:** After `fromHono()` initialization, before exporting the app.
**Example:**
```typescript
// In apps/web/app/api/index.ts, after fromHono() call:
openapi.registry.registerComponent("securitySchemes", "ApiKeyAuth", {
  type: "apiKey",
  in: "header",
  name: "X-API-Key",
  description: "API key for authentication. Get one at /settings/api-keys",
});
```
Source: chanfana exposes `registry` property (type `OpenAPIRegistryMerger extends OpenAPIRegistry` from @asteasolutions/zod-to-openapi). The `registerComponent` method accepts `securitySchemes` as the component type key.

### Pattern 2: Per-Endpoint Security Annotation
**What:** Add `security` field to individual endpoint schemas so Swagger knows which endpoints require auth.
**When to use:** On each authenticated endpoint's schema.
**Example:**
```typescript
export class ListMeetings extends OpenAPIRoute {
  schema = {
    security: [{ ApiKeyAuth: [] }],
    summary: "List meetings",
    // ... rest of schema
  };
}
```
Source: The `security` field is part of `OpenAPIRouteSchema` (confirmed in chanfana type definitions at line 313 of index.d.ts).

### Pattern 3: Worker Fetch Handler Routing
**What:** The Worker fetch handler in `workers/app.ts` currently only routes `/api/v1/*` and `/api/ocd/*` to Hono. The chanfana docs routes (`/api/v1/docs`, `/api/v1/openapi.json`) are already under `/api/v1/` so they should be routed already.
**When to use:** Verify existing routing covers docs endpoints.
**Critical note:** The current check is `url.pathname.startsWith("/api/v1/")` which WILL match `/api/v1/docs` and `/api/v1/openapi.json`. No change needed here.

### Pattern 4: Key Management as React Router Route
**What:** New page at `/settings/api-keys` with server loader + actions, following the same pattern as the existing `/settings` page.
**When to use:** For the key management UI.
**Example structure:**
```typescript
// apps/web/app/routes/settings.api-keys.tsx
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createSupabaseServerClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw redirect("/login?redirectTo=/settings/api-keys", { headers });

  const { data: keys } = await supabase
    .from("api_keys")
    .select("id, key_prefix, is_active, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return { keys: keys ?? [] };
}

export async function action({ request }: Route.ActionArgs) {
  // intent: "create_key" | "revoke_key"
  // For create: generate key, hash, insert, return plaintext key ONCE
  // For revoke: update is_active = false
}
```

### Pattern 5: API Key Generation Flow
**What:** Generate key server-side, return plaintext to user exactly once, store only hash.
**When to use:** On "Create API Key" action.
**Example:**
```typescript
import { generateApiKey, hashApiKey } from "~/api/lib/api-key";

// In action handler:
const plainKey = generateApiKey(); // "vr_" + 64 hex chars
const keyHash = await hashApiKey(plainKey);
const prefix = plainKey.substring(0, 8); // "vr_xxxxx"

const { error } = await supabase.from("api_keys").insert({
  user_id: user.id,
  key_hash: keyHash,
  key_prefix: prefix,
  name: "Default",
  is_active: true,
});

// Return plainKey in action data -- shown to user once
return { newKey: plainKey, prefix };
```
Source: `generateApiKey()` and `hashApiKey()` already exist in `apps/web/app/api/lib/api-key.ts`.

### Pattern 6: OCD Endpoint Documentation Strategy
**What:** OCD endpoints use plain Hono handlers, not chanfana's OpenAPIRoute. They need manual spec entries.
**Options:**
1. **Register OCD routes as chanfana OpenAPIRoute classes** -- would require refactoring all OCD endpoints, against the Phase 17 decision of "plain Hono handlers for OCD"
2. **Manually add OCD paths to the OpenAPI schema** -- use `openapi.registry.registerPath()` to add route documentation without changing handlers
3. **Skip OCD in the spec** -- OCD has its own spec standard, separate from our API docs

**Recommendation:** Option 2 (manual path registration). This documents OCD endpoints in the combined spec without refactoring handlers. The `registerPath` method from `@asteasolutions/zod-to-openapi` accepts path, method, description, parameters, and responses -- all the standard OpenAPI path item fields.

### Anti-Patterns to Avoid
- **Storing plaintext API keys anywhere:** Keys are displayed exactly once on creation, then only the hash is stored. Never log the key.
- **Building a separate static OpenAPI YAML file:** User decision is code-generated spec. Don't maintain a parallel spec file.
- **Custom Swagger UI theming:** User decision is default Swagger theme. Don't customize colors or branding.
- **Requiring re-authentication for revocation:** User decision -- being logged in is sufficient.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAPI spec generation | Custom JSON spec builder | chanfana `fromHono()` + `OpenAPIRoute` schemas | Already auto-generates from Zod schemas; handles OpenAPI 3.1 correctly |
| Swagger UI hosting | Custom HTML page with swagger-ui bundle | chanfana `docs_url` config | chanfana already embeds a CDN-hosted swagger-ui-dist@5.17.14 with SRI integrity |
| API key generation | Custom random string function | Existing `generateApiKey()` in `api-key.ts` | Already implements `vr_` prefix + 32 random bytes (256 bits entropy) |
| API key hashing | Custom hash function | Existing `hashApiKey()` in `api-key.ts` | Already implements SHA-256 via Web Crypto |
| Security scheme in spec | Manual JSON injection into spec | `openapi.registry.registerComponent("securitySchemes", ...)` | Standard zod-to-openapi API, properly structured |
| Timing-safe comparison | Custom comparison | Existing `timingSafeCompare()` | Already handles the double-hash approach for CF Workers |

**Key insight:** Almost all the building blocks exist. The phase is primarily about wiring together existing pieces and adding the UI layer.

## Common Pitfalls

### Pitfall 1: Swagger UI "Try it out" Fails Due to CORS
**What goes wrong:** Swagger UI at `/api/v1/docs` sends requests to `/api/v1/:muni/meetings` etc. If CORS isn't configured to allow the Swagger UI origin, "Try it out" fails.
**Why it happens:** Swagger UI sends requests from the same origin, so this shouldn't be a problem since CORS is set to `origin: "*"`. But if someone opens Swagger UI from a different domain, CORS could block.
**How to avoid:** CORS is already set to `origin: "*"` in the API middleware. This is fine for a read-only public API.
**Warning signs:** "Try it out" shows network errors in browser console.

### Pitfall 2: Key Prefix Collision in Auth Lookup
**What goes wrong:** The auth middleware looks up keys by `key_prefix` (first 8 chars). If two users have keys with the same prefix, `maybeSingle()` returns null.
**Why it happens:** With format `vr_` + 5 hex chars = only 1,048,576 possible prefixes. As key count grows, collision probability increases.
**How to avoid:** The current auth middleware uses `maybeSingle()` which will return an error when multiple rows match. The middleware should handle this by querying all matching active keys by prefix, then timing-safe comparing each hash. With 3 keys max per user and few users, collision is astronomically unlikely in practice, but the code should handle it.
**Warning signs:** Auth middleware returning 500 errors when `maybeSingle()` finds multiple matches.

### Pitfall 3: Plaintext Key Exposure in Server Logs
**What goes wrong:** The generated plaintext key could appear in server logs, error traces, or response headers.
**Why it happens:** Accidental `console.log` of action data, or error boundary exposing action response.
**How to avoid:** Never log the key. Return it only in the action response to the client, displayed once in the UI.
**Warning signs:** Keys appearing in Cloudflare Worker logs.

### Pitfall 4: chanfana Base Path and Docs URL Interaction
**What goes wrong:** chanfana's `docs_url` and `openapi_url` are relative to the `base` path. If configured incorrectly, Swagger UI can't find the schema.
**Why it happens:** The current config sets `base: "/api/v1"`, `docs_url: "/api/v1/docs"`, `openapi_url: "/api/v1/openapi.json"`. chanfana constructs the schema URL for Swagger as `base + openapi_url`, which would be `/api/v1/api/v1/openapi.json` -- WRONG.
**How to avoid:** Looking at chanfana source: `getSwaggerUI((this.options?.base || "") + (this.options?.openapi_url || "/openapi.json"))`. With current config, this produces `/api/v1/api/v1/openapi.json`. The `docs_url` and `openapi_url` should NOT include the base prefix since chanfana prepends it. Fix: `docs_url: "/docs"`, `openapi_url: "/openapi.json"`. Then chanfana will register the routes at the correct paths relative to the base and construct the correct schema URL.
**Warning signs:** Swagger UI shows "Failed to load API definition" or the schema URL returns 404.

### Pitfall 5: `generateApiKey` Runs in Server Context Only
**What goes wrong:** Attempting to import `generateApiKey` in a client-side React component fails because `crypto.getRandomValues` is available but the module imports might pull in other server-only code.
**Why it happens:** The `api-key.ts` file is in the `app/api/` directory which is server-only.
**How to avoid:** Key generation happens in the action handler (server-side), not in the React component. The component only displays the returned key.
**Warning signs:** Build errors about missing `crypto.subtle` or bundling errors.

### Pitfall 6: Race Condition on Key Count Check
**What goes wrong:** User has 2 keys, sends two create requests simultaneously, both pass the "< 3 keys" check, ends up with 4 keys.
**Why it happens:** No database-level constraint on key count per user.
**How to avoid:** Use a Supabase RPC function that atomically checks count + inserts, or use a partial unique index/constraint. Alternatively, count-then-insert within a transaction. For this app's scale (few users), the risk is negligible, but the RPC approach is cleaner.
**Warning signs:** Users with more than 3 keys.

## Code Examples

### Registering API Key Security Scheme
```typescript
// In apps/web/app/api/index.ts, after fromHono():
openapi.registry.registerComponent("securitySchemes", "ApiKeyAuth", {
  type: "apiKey",
  in: "header",
  name: "X-API-Key",
  description:
    "API key passed in the X-API-Key header. " +
    "Get your key at /settings/api-keys. " +
    "Alternatively, pass as ?apikey= query parameter.",
});
```
Source: chanfana types show `registry: OpenAPIRegistryMerger extends OpenAPIRegistry`. `OpenAPIRegistry.registerComponent` from @asteasolutions/zod-to-openapi@8.4.1 supports `securitySchemes` component type.

### Adding Security to Endpoint Schema
```typescript
export class ListMeetings extends OpenAPIRoute {
  schema = {
    tags: ["Meetings"],
    security: [{ ApiKeyAuth: [] }],
    summary: "List meetings",
    description: "Returns a paginated list of meetings...",
    // ... existing request/response schemas
  };
}
```

### Tagging Endpoints for Organization
```typescript
// Add tags to the global schema in fromHono():
const openapi = fromHono(app, {
  base: "/api/v1",
  docs_url: "/docs",        // relative to base
  openapi_url: "/openapi.json", // relative to base
  openapiVersion: "3.1",
  schema: {
    info: {
      title: "ViewRoyal.ai API",
      version: "1.0.0",
      description: "Public API for ViewRoyal.ai civic intelligence platform. " +
        "Get an API key at /settings/api-keys to start making requests.",
    },
    tags: [
      { name: "Meetings", description: "Council meeting data" },
      { name: "People", description: "Council members and staff" },
      { name: "Matters", description: "Agenda matters and issues" },
      { name: "Motions", description: "Motions and voting records" },
      { name: "Bylaws", description: "Municipal bylaws" },
      { name: "Search", description: "Cross-content keyword search" },
      { name: "OCD", description: "Open Civic Data Specification endpoints" },
      { name: "System", description: "Health checks and status" },
    ],
  },
});
```

### Key Management Page -- Loader Pattern
```typescript
// apps/web/app/routes/settings.api-keys.tsx
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createSupabaseServerClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw redirect("/login?redirectTo=/settings/api-keys", { headers });

  const { data: keys } = await supabase
    .from("api_keys")
    .select("id, key_prefix, is_active, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return { keys: keys ?? [], user };
}
```

### Key Creation Action Pattern
```typescript
if (intent === "create_key") {
  // Check key count
  const { count } = await supabase
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true);

  if ((count ?? 0) >= 3) {
    return { error: "Maximum 3 active API keys allowed." };
  }

  const plainKey = generateApiKey();
  const keyHash = await hashApiKey(plainKey);
  const prefix = plainKey.substring(0, 8);

  const { error } = await supabase.from("api_keys").insert({
    user_id: user.id,
    key_hash: keyHash,
    key_prefix: prefix,
    name: "Default",
  });

  if (error) {
    return { error: "Failed to create API key." };
  }

  return { newKey: plainKey, prefix, success: true };
}
```

### Key Revocation Action Pattern
```typescript
if (intent === "revoke_key") {
  const keyId = formData.get("key_id") as string;

  const { error } = await supabase
    .from("api_keys")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("user_id", user.id); // RLS also enforces this

  if (error) {
    return { error: "Failed to revoke API key." };
  }

  return { success: true, message: "API key revoked." };
}
```

### OCD Manual Path Registration
```typescript
// For documenting OCD endpoints in the combined spec:
import { z } from "zod";

openapi.registry.registerPath({
  method: "get",
  path: "/api/ocd/{municipality}/jurisdictions",
  tags: ["OCD"],
  summary: "List OCD jurisdictions",
  description: "Returns jurisdictions in Open Civic Data format.",
  request: {
    params: z.object({
      municipality: z.string().describe("Municipality slug"),
    }),
    query: z.object({
      page: z.coerce.number().optional().describe("Page number"),
      per_page: z.coerce.number().optional().describe("Results per page"),
    }),
  },
  responses: {
    "200": {
      description: "List of OCD jurisdictions",
    },
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Swagger UI 4.x | swagger-ui-dist 5.17.14 (bundled in chanfana) | 2024 | Better OpenAPI 3.1 support, improved "Try it out" |
| OpenAPI 3.0 | OpenAPI 3.1 (JSON Schema alignment) | 2021, widespread 2023+ | chanfana already uses 3.1 |
| Manual YAML spec files | Code-generated from route schemas | Current best practice | Keeps spec in sync with implementation |
| bcrypt for API keys | SHA-256 (high-entropy keys) | Ongoing | Correct for API keys -- bcrypt adds latency without benefit for random keys |

**Deprecated/outdated:**
- chanfana v2.x had different API -- v3.0.0 is current (installed)
- `@hono/swagger-ui` package -- unnecessary when using chanfana which bundles its own
- OpenAPI 2.0 (Swagger) -- chanfana targets 3.0/3.1

## Discretion Recommendations

### Single Spec vs Separate Specs
**Recommendation: Single spec.** Combine v1 and OCD endpoints in one spec, differentiated by tags. This gives API consumers a single URL to discover everything. OCD endpoints get tagged as "OCD" and grouped separately in Swagger UI.

### Description/Example Detail Level
**Recommendation: Moderate detail.** Each endpoint should have:
- A clear one-line summary
- A 1-2 sentence description explaining what it returns and key filters
- Request parameters with descriptions (already present in Zod schemas)
- Response schema for the 200 case (already present in most endpoints)
- Don't add examples for every field -- Swagger UI auto-generates them from Zod schemas

### Error Response Documentation Strategy
**Recommendation: Shared error schema.** Register a reusable error response component and reference it in endpoint schemas:
```typescript
openapi.registry.registerComponent("schemas", "ApiError", {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string", example: "NOT_FOUND" },
        message: { type: "string", example: "Resource not found" },
        status: { type: "integer", example: 404 },
      },
    },
  },
});
```
Document 401 (missing/invalid key), 404, 429 (rate limited), and 500 as common error responses.

### API Key Prefix Format
**Recommendation: Keep existing `vr_` prefix.** The `generateApiKey()` function already produces `vr_` + 64 hex chars. The `key_prefix` stores the first 8 characters (`vr_` + 5 hex chars). This is visually identifiable and unique enough for display purposes.

### Exact Key Length and Entropy
**Recommendation: Keep existing 32 bytes (256 bits).** The current `generateApiKey()` produces 32 random bytes = 256 bits of entropy. This far exceeds the minimum recommended 128 bits for API keys. No change needed.

## Open Questions

1. **chanfana `docs_url` / `openapi_url` path resolution**
   - What we know: chanfana constructs the Swagger schema URL as `base + openapi_url`. Current config has `base: "/api/v1"` and `openapi_url: "/api/v1/openapi.json"` which would produce `/api/v1/api/v1/openapi.json` (doubled path).
   - What's unclear: Whether chanfana does path deduplication internally. Looking at chanfana source: `schemaUrl = schemaUrl.replace(/\/+(\/|$)/g, "$1")` -- this removes duplicate slashes but won't fix doubled `/api/v1` prefixes.
   - Recommendation: Change `docs_url` to `"/docs"` and `openapi_url` to `"/openapi.json"` (relative to base). Verify by checking the generated Swagger HTML to confirm the schema URL is correct. **HIGH confidence this is the fix** based on reading chanfana source code directly.

2. **OCD endpoints in the spec**
   - What we know: OCD endpoints use plain Hono handlers, not chanfana OpenAPIRoute. They could be documented via `registry.registerPath()`.
   - What's unclear: Whether there are edge cases with `registerPath` when the path is outside the chanfana `base` path (`/api/v1`). OCD paths start with `/api/ocd/`.
   - Recommendation: Test `registerPath` with OCD paths. If it doesn't work due to base path mismatch, document OCD endpoints as a note in the API description with a link to the OCD discovery endpoint. This is a LOW priority since OCD follows its own specification.

3. **Do existing `key_prefix` + `maybeSingle()` auth lookups handle collisions?**
   - What we know: Auth middleware queries by `key_prefix` + `is_active` using `maybeSingle()`. If two active keys share a prefix, this returns an error.
   - What's unclear: How likely collisions are with the `vr_` + 5 hex chars format.
   - Recommendation: With max ~3 keys per user and very few users, collision probability is negligible (birthday problem: ~50% collision at ~1,024 keys out of 1,048,576 possible prefixes). No action needed for this phase, but document as technical debt if user base grows significantly.

## Sources

### Primary (HIGH confidence)
- chanfana v3.0.0 source code at `apps/web/node_modules/.pnpm/chanfana@3.0.0/` -- verified `getSwaggerUI()`, `createDocsRoutes()`, `RouterOptions`, `registry` property, and OpenAPI generation
- @asteasolutions/zod-to-openapi@8.4.1 types -- verified `registerComponent("securitySchemes", ...)` API
- Existing codebase: `apps/web/app/api/index.ts`, `apps/web/app/api/lib/api-key.ts`, `apps/web/app/api/middleware/auth.ts`, `supabase/migrations/create_api_keys.sql`
- Supabase `api_keys` table schema (verified via `list_tables` -- columns: id, user_id, key_hash, key_prefix, name, is_active, last_used_at, created_at, updated_at, RLS enabled)

### Secondary (MEDIUM confidence)
- [chanfana OpenAPI Configuration docs](https://chanfana.pages.dev/openapi-configuration-customization) -- docs_url, openapi_url, redoc_url, schema.info configuration
- [chanfana Getting Started](https://chanfana.pages.dev/getting-started) -- fromHono() usage, endpoint registration
- [chanfana Security page](https://chanfana.pages.dev/user-guide/security/) -- security scheme registration via `registry.registerComponent`

### Tertiary (LOW confidence)
- WebSearch results for chanfana security scheme configuration -- limited official documentation on this topic, patterns inferred from codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use, no new dependencies
- Architecture: HIGH -- patterns directly observable in existing codebase, chanfana source verified
- Pitfalls: HIGH -- identified through direct source code analysis and real configuration review
- OCD spec integration: MEDIUM -- `registerPath` usage with out-of-base paths unverified

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (stable -- no fast-moving dependencies)
