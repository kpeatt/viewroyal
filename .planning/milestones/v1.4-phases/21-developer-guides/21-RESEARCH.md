# Phase 21: Developer Guides - Research

**Researched:** 2026-02-23
**Domain:** Technical documentation (MDX content for fumadocs)
**Confidence:** HIGH

## Summary

Phase 21 is a content-authoring phase, not a framework/library phase. The infrastructure already exists from Phase 19 (fumadocs v16, Next.js 16, static export) and Phase 20 (OpenAPI integration, APIPage components, prebuild pipeline). All four guides (Getting Started, Authentication, Pagination, Error Handling) are hand-written MDX files placed in the existing `apps/docs/content/docs/` directory tree with `meta.json` navigation entries.

The API implementation is fully built and well-structured. Authentication uses `X-API-Key` header (or `?apikey=` query param), rate limiting is 100 req/60s per API key via Cloudflare Workers Rate Limit binding, and error responses follow a consistent `{ error: { code, message, status } }` envelope. There are two distinct pagination patterns: cursor-based for v1 API endpoints and page-based (OpenStates-style) for OCD endpoints. All of this is documented in the OpenAPI spec and implemented in source code -- the guides need to explain it in developer-friendly prose with working code examples.

**Primary recommendation:** Create four MDX files under `apps/docs/content/docs/guides/`, add a `meta.json` for sidebar navigation, update the root `meta.json` to include the guides section, and cross-link to existing API reference pages. Each guide should include curl, JavaScript (fetch), and Python (requests) code examples that developers can copy verbatim.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GUID-01 | Getting Started guide: zero to first API call in under 5 minutes | Content file at `guides/getting-started.mdx` with step-by-step walkthrough: sign up, get key at `/settings/api-keys`, make curl request to health endpoint, then authenticated request to list meetings. Verified all endpoints exist and response shapes are documented in OpenAPI spec. |
| GUID-02 | Authentication guide: API key usage, headers, error responses, security best practices | Content file at `guides/authentication.mdx` documenting `X-API-Key` header, `?apikey=` query param fallback, key format (`vr_` + 64 hex), all auth error codes (MISSING_API_KEY, INVALID_API_KEY), rate limiting (100/60s, RATE_LIMIT_EXCEEDED, Retry-After header), and link to `/settings/api-keys` management page. All error codes verified in source. |
| GUID-03 | Pagination guide: cursor-based (v1) and page-based (OCD) with working examples | Content file at `guides/pagination.mdx` documenting two systems: (1) v1 cursor-based with `cursor` + `per_page` params yielding `{ has_more, next_cursor, per_page }` pagination object, (2) OCD page-based with `page` + `per_page` params yielding `{ page, per_page, max_page, total_items }`. Search endpoint uses page-based within v1 envelope. All pagination shapes verified in source code. |
| GUID-04 | Error Handling guide: all error codes, response shapes, retry logic | Content file at `guides/error-handling.mdx` documenting the `{ error: { code, message, status } }` shape, every error code found in the codebase, HTTP status mapping, and retry logic examples. Complete error code inventory compiled from source. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fumadocs-mdx | ^14.2.8 | MDX content processing | Already installed, processes `content/docs/**/*.mdx` |
| fumadocs-ui | ^16.6.5 | Doc page rendering (DocsPage, DocsBody, etc.) | Already installed, renders all pages |
| fumadocs-core | ^16.6.5 | Source loader, page tree, navigation | Already installed, generates sidebar from `meta.json` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| N/A | - | - | No new dependencies needed -- this phase is pure MDX content |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written MDX guides | Auto-generated from OpenAPI descriptions | Auto-gen produces reference docs, not narrative guides. Hand-written is correct for tutorial/guide content. |
| fumadocs built-in `<Tabs>` | Custom tab component | fumadocs-ui exports `<Tabs>` and `<Tab>` components for language switching. Use the built-in ones. |
| fumadocs built-in `<Callout>` | Custom admonition component | fumadocs-ui exports `<Callout>` for tips/warnings. Already available via `defaultComponents`. |

**Installation:**
```bash
# No installation needed -- all dependencies are already in apps/docs/package.json
```

## Architecture Patterns

### Recommended Content Structure
```
apps/docs/content/docs/
├── index.mdx                     # Landing page (exists)
├── meta.json                     # Root nav (exists, needs update)
├── guides/                       # NEW: Developer guides
│   ├── meta.json                 # Sidebar ordering for guides section
│   ├── getting-started.mdx       # GUID-01
│   ├── authentication.mdx        # GUID-02
│   ├── pagination.mdx            # GUID-03
│   └── error-handling.mdx        # GUID-04
└── api-reference/                # Existing auto-generated API reference
    ├── meta.json
    ├── system/
    ├── meetings/
    └── ...
```

### Pattern 1: MDX Guide File Structure
**What:** Each guide follows fumadocs frontmatter conventions with title and description.
**When to use:** All guide MDX files.
**Example:**
```mdx
---
title: Getting Started
description: Make your first API call in under 5 minutes
---

## Step 1: Get an API Key

Navigate to [viewroyal.ai/settings/api-keys](https://viewroyal.ai/settings/api-keys)...
```

### Pattern 2: Navigation via meta.json
**What:** The root `meta.json` controls sidebar grouping. A `guides/meta.json` controls page ordering within the guides section.
**When to use:** Adding the guides section to sidebar navigation.
**Example (root meta.json update):**
```json
{
  "root": true,
  "pages": [
    "---Getting Started---",
    "...",
    "---Guides---",
    "guides",
    "---API Reference---",
    "api-reference"
  ]
}
```
**Example (guides/meta.json):**
```json
{
  "title": "Guides",
  "pages": [
    "getting-started",
    "authentication",
    "pagination",
    "error-handling"
  ]
}
```

### Pattern 3: Multi-Language Code Examples with Tabs
**What:** fumadocs-ui provides `<Tabs>` and `<Tab>` components for language selection. These are already registered via `defaultComponents` in `mdx-components.tsx`.
**When to use:** Every code example block showing curl/JS/Python.
**Example:**
```mdx
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';

<Tabs items={['curl', 'JavaScript', 'Python']}>
  <Tab value="curl">
    ```bash
    curl -H "X-API-Key: YOUR_KEY" \
      https://viewroyal.ai/api/v1/view-royal/meetings
    ```
  </Tab>
  <Tab value="JavaScript">
    ```javascript
    const res = await fetch(
      'https://viewroyal.ai/api/v1/view-royal/meetings',
      { headers: { 'X-API-Key': 'YOUR_KEY' } }
    );
    const data = await res.json();
    ```
  </Tab>
  <Tab value="Python">
    ```python
    import requests

    resp = requests.get(
        'https://viewroyal.ai/api/v1/view-royal/meetings',
        headers={'X-API-Key': 'YOUR_KEY'}
    )
    data = resp.json()
    ```
  </Tab>
</Tabs>
```

### Pattern 4: Cross-Linking to API Reference
**What:** Link from guide prose to the auto-generated API reference pages for full endpoint details.
**When to use:** Whenever mentioning a specific endpoint.
**Example:**
```mdx
See the full [List Meetings endpoint reference](/docs/api-reference/meetings/get_ListMeetings)
for all query parameters and response fields.
```

### Pattern 5: Callout Components for Tips/Warnings
**What:** fumadocs-ui `<Callout>` component for highlighting important information.
**When to use:** Security warnings, important notes, tips.
**Example:**
```mdx
import { Callout } from 'fumadocs-ui/components/callout';

<Callout type="warn">
  Never expose your API key in client-side code. Always make API calls from your server.
</Callout>
```

### Anti-Patterns to Avoid
- **Duplicating API reference content in guides:** Guides should explain *how* and *why*, not re-list all parameters. Cross-link to reference pages instead.
- **Hard-coding response examples that drift:** Use realistic but clearly-marked example responses. Don't copy actual API responses that will change as data updates.
- **Assuming a specific municipality slug:** Always use `view-royal` in examples (it's the only municipality), but mention the `{municipality}` URL pattern.
- **Forgetting to show error responses:** Every guide should demonstrate what happens when things go wrong, not just the happy path.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Language tabs in code examples | Custom tab component | `fumadocs-ui/components/tabs` (`<Tabs>`, `<Tab>`) | Already available, styled consistently with the rest of the docs |
| Callout/admonition boxes | Custom styled divs | `fumadocs-ui/components/callout` (`<Callout>`) | Built-in, matches theme |
| Sidebar navigation | Manual link lists | `meta.json` files + fumadocs page tree | Automatic sidebar generation from file structure |
| Syntax highlighting | Custom highlighter | Shiki (already configured via fumadocs) | `shiki ^3.22.0` already in `package.json` |

**Key insight:** This phase is 100% content authoring. No new components, libraries, or infrastructure are needed. All building blocks exist from Phases 19 and 20.

## Common Pitfalls

### Pitfall 1: Incorrect fumadocs Tabs Import Path
**What goes wrong:** Importing `Tabs`/`Tab` from the wrong package path causes build failures in static export.
**Why it happens:** fumadocs has multiple export paths; only `fumadocs-ui/components/tabs` works in MDX.
**How to avoid:** Use `import { Tab, Tabs } from 'fumadocs-ui/components/tabs';` at the top of each MDX file that uses tabs.
**Warning signs:** Next.js build error mentioning "module not found" or "not a valid export."

### Pitfall 2: MDX Import Syntax in Static Export
**What goes wrong:** ESM imports in MDX may need specific handling for Next.js static export mode.
**Why it happens:** `output: 'export'` in `next.config.mjs` means no server runtime; all MDX must be statically analyzable.
**How to avoid:** Use standard ESM imports at the top of MDX files. fumadocs-mdx handles this correctly in static mode since fumadocs v16 supports it.
**Warning signs:** Build errors about "cannot use import in this context."

### Pitfall 3: meta.json Page List Must Match File Names
**What goes wrong:** Sidebar shows "missing page" or guide doesn't appear in navigation.
**Why it happens:** `meta.json` `pages` array entries must match the MDX filename (without extension). A mismatch makes the page invisible.
**How to avoid:** Ensure `meta.json` entry matches the MDX filename exactly: `"getting-started"` matches `getting-started.mdx`.
**Warning signs:** Page exists at URL but doesn't appear in the sidebar.

### Pitfall 4: Not Updating Root meta.json
**What goes wrong:** Guides section doesn't appear in the sidebar at all.
**Why it happens:** The root `content/docs/meta.json` controls top-level navigation sections. If `"guides"` isn't added, the section is invisible.
**How to avoid:** Add both the section separator and folder reference to the root meta.json pages array.
**Warning signs:** Individual guide pages render at their URL but have no sidebar presence.

### Pitfall 5: Code Examples That Don't Actually Work
**What goes wrong:** Developers copy examples, they fail, trust in docs is lost.
**Why it happens:** API base URL, municipality slug, or response shape changes aren't reflected in guide examples.
**How to avoid:** Use the actual production URL (`https://viewroyal.ai`), actual municipality slug (`view-royal`), and verify each example matches the current OpenAPI spec response shape.
**Warning signs:** Developers report "the example doesn't work" in issues.

## Code Examples

### Complete Error Code Inventory (from source code analysis)

All error codes found across the API codebase:

| HTTP Status | Error Code | Source | Description |
|-------------|------------|--------|-------------|
| 400 | `VALIDATION_ERROR` | error-handler.ts | Request validation failed (invalid params) |
| 400 | `INVALID_TYPE` | search.ts | Invalid search type filter |
| 401 | `MISSING_API_KEY` | auth.ts | No API key provided |
| 401 | `INVALID_API_KEY` | auth.ts | API key not found or inactive |
| 404 | `NOT_FOUND` | index.ts | Endpoint does not exist |
| 404 | `MUNICIPALITY_NOT_FOUND` | municipality.ts | Invalid municipality slug |
| 404 | `MEETING_NOT_FOUND` | meetings/detail.ts | Meeting slug not found |
| 404 | `PERSON_NOT_FOUND` | people/detail.ts | Person slug not found |
| 404 | `MATTER_NOT_FOUND` | matters/detail.ts | Matter slug not found |
| 404 | `MOTION_NOT_FOUND` | motions/detail.ts | Motion slug not found |
| 404 | `BYLAW_NOT_FOUND` | bylaws/detail.ts | Bylaw slug not found |
| 404 | `EVENT_NOT_FOUND` | ocd/events.ts | OCD event not found |
| 404 | `BILL_NOT_FOUND` | ocd/bills.ts | OCD bill not found |
| 404 | `VOTE_NOT_FOUND` | ocd/votes.ts | OCD vote not found |
| 404 | `ORGANIZATION_NOT_FOUND` | ocd/organizations.ts | OCD org not found |
| 404 | `JURISDICTION_NOT_FOUND` | ocd/jurisdictions.ts | OCD jurisdiction not found |
| 429 | `RATE_LIMIT_EXCEEDED` | rate-limit.ts | 100 requests per 60 seconds exceeded |
| 500 | `INTERNAL_ERROR` | error-handler.ts | Unexpected server error |
| 500 | `QUERY_ERROR` | various endpoints | Database query failure |

### API Response Envelope Shapes

**v1 List Response:**
```json
{
  "data": [...],
  "pagination": {
    "has_more": true,
    "next_cursor": "eyJ2IjoiMjAyNC0wMS0xNSIsImlkIjo0Mn0=",
    "per_page": 20
  },
  "meta": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**v1 Detail Response:**
```json
{
  "data": { ... },
  "meta": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**v1 Error Response:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "The requested endpoint GET /api/v1/view-royal/nonexistent does not exist",
    "status": 404
  }
}
```

**OCD List Response:**
```json
{
  "results": [...],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "max_page": 5,
    "total_items": 93
  }
}
```

**OCD Detail Response:**
```json
{
  "id": "ocd-person/...",
  "name": "...",
  ...
}
```

### Authentication Flow
```
1. User signs up at viewroyal.ai
2. User navigates to /settings/api-keys
3. User creates a new API key (format: vr_ + 64 hex chars)
4. Key is shown ONCE (stored as SHA-256 hash, prefix stored for lookup)
5. User includes key in X-API-Key header (or ?apikey= query param)
6. Auth middleware: extract key -> hash -> prefix lookup -> timing-safe compare
```

### Rate Limiting Details
```
- Scope: Per API key (not per IP)
- Limit: 100 requests per 60 seconds
- Binding: Cloudflare Workers Rate Limit (API_RATE_LIMITER)
- Headers: X-RateLimit-Limit: 100 (always), Retry-After: 60 (on 429)
- Error: { code: "RATE_LIMIT_EXCEEDED", message: "...", status: 429 }
```

### Pagination: Cursor-Based (v1 Endpoints)
```
Request:  GET /api/v1/view-royal/meetings?per_page=5
Response: { pagination: { has_more: true, next_cursor: "abc123", per_page: 5 } }

Next page: GET /api/v1/view-royal/meetings?per_page=5&cursor=abc123
Response: { pagination: { has_more: false, next_cursor: null, per_page: 5 } }
```

Cursors are opaque base64-encoded JSON containing sort column value + row ID for keyset pagination. Consumers should never decode or construct cursors manually.

### Pagination: Page-Based (OCD Endpoints)
```
Request:  GET /api/ocd/view-royal/people?page=1&per_page=10
Response: { pagination: { page: 1, per_page: 10, max_page: 3, total_items: 27 } }

Next page: GET /api/ocd/view-royal/people?page=2&per_page=10
```

### Pagination: Search Endpoint (Hybrid)
The search endpoint uses page-based pagination (`page` + `per_page` params) but returns v1-style envelope (`data` + `pagination` + `meta`). Its pagination object includes `has_more`, `per_page`, and `page` but `next_cursor` is always `null`.

### CORS Configuration
```
Origin: * (open)
Methods: GET, HEAD, OPTIONS
Allowed Headers: X-API-Key, Content-Type
Exposed Headers: X-Request-Id, X-RateLimit-Limit, Retry-After
Max Age: 86400
```

### Response Headers
```
X-Request-Id: <uuid>        # Every response
X-RateLimit-Limit: 100      # Authenticated endpoints
Retry-After: 60             # Only on 429 responses
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw Markdown docs | MDX + fumadocs component library | Phase 19 (2026-02-23) | Rich interactive docs with tabs, callouts, code highlighting |
| No API docs | Auto-generated OpenAPI reference | Phase 20 (2026-02-23) | Guides can cross-link to reference pages |

**Deprecated/outdated:**
- None. The fumadocs setup is brand new from Phase 19-20.

## Open Questions

1. **Should the Getting Started guide require user registration?**
   - What we know: API keys require a user account at viewroyal.ai. The `/settings/api-keys` page redirects to `/login` if not authenticated.
   - What's unclear: Whether there's a way to try the API without registration (health endpoint doesn't need auth).
   - Recommendation: Guide should start with the unauthenticated health check as "Step 0" (instant gratification), then walk through registration + key creation for authenticated endpoints.

2. **Should guides use persistent language tabs (fumadocs `groupId` feature)?**
   - What we know: fumadocs `<Tabs>` supports a `groupId` prop that syncs tab selection across all tab groups on a page (and potentially across pages with persistence).
   - What's unclear: Whether `groupId` works correctly in static export mode with `output: 'export'`.
   - Recommendation: Use `groupId="language"` on all code example tab groups. If it works in static export, developers get a consistent language selection. If not, tabs still work independently -- no downside.

3. **What is the exact URL for the API key management page?**
   - What we know: Route file is `settings.api-keys.tsx`, which maps to `/settings/api-keys` in React Router 7.
   - What's unclear: Whether there's a more developer-friendly URL alias.
   - Recommendation: Link to `https://viewroyal.ai/settings/api-keys` in all guides. This is the canonical URL.

## Sources

### Primary (HIGH confidence)
- `apps/web/app/api/lib/api-errors.ts` -- Error class shape verification
- `apps/web/app/api/middleware/auth.ts` -- Auth flow, error codes (MISSING_API_KEY, INVALID_API_KEY)
- `apps/web/app/api/middleware/rate-limit.ts` -- Rate limit config (100/60s, RATE_LIMIT_EXCEEDED)
- `apps/web/app/api/middleware/error-handler.ts` -- Error handler, VALIDATION_ERROR, INTERNAL_ERROR
- `apps/web/app/api/middleware/municipality.ts` -- MUNICIPALITY_NOT_FOUND error code
- `apps/web/app/api/lib/cursor.ts` -- Cursor pagination implementation
- `apps/web/app/api/lib/envelope.ts` -- v1 response envelope (list + detail)
- `apps/web/app/api/ocd/lib/pagination.ts` -- OCD page-based pagination
- `apps/web/app/api/ocd/lib/ocd-envelope.ts` -- OCD response envelope (results + pagination)
- `apps/web/app/api/index.ts` -- Route registration, NOT_FOUND handler, CORS config
- `apps/web/app/api/endpoints/search.ts` -- Search pagination (page-based in v1 envelope)
- `apps/web/app/api/lib/api-key.ts` -- Key format (vr_ prefix), generation, hashing
- `apps/web/wrangler.toml` -- Rate limit binding config (100 req / 60s)
- `apps/docs/content/docs/meta.json` -- Current root navigation structure
- `apps/docs/source.config.ts` -- fumadocs-mdx content directory config
- `apps/docs/mdx-components.tsx` -- MDX component registration
- `apps/docs/openapi.json` -- Committed OpenAPI spec (all endpoints documented)

### Secondary (MEDIUM confidence)
- fumadocs-ui components (`<Tabs>`, `<Tab>`, `<Callout>`) -- verified in package.json as fumadocs-ui ^16.6.5, standard components documented in fumadocs docs

### Tertiary (LOW confidence)
- `groupId` tab persistence in static export -- untested in this project's configuration

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all dependencies already installed and working from Phase 19-20
- Architecture: HIGH - verified file structure, meta.json patterns, and MDX rendering pipeline in existing codebase
- Pitfalls: HIGH - identified from direct source code analysis and fumadocs conventions
- Content accuracy: HIGH - every error code, response shape, and pagination pattern verified against source code

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable -- content structure and API are established)
