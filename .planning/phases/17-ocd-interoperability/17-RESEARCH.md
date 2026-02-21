# Phase 17: OCD Interoperability - Research

**Researched:** 2026-02-21
**Domain:** Open Civic Data specification mapping, REST API endpoint layer for standardized civic data interop
**Confidence:** HIGH

## Summary

Phase 17 adds a parallel set of OCD-compliant endpoints at `/api/ocd/:municipality/*` on top of the existing Hono API infrastructure from Phases 15-16. The Open Civic Data specification defines six entity types (Jurisdiction, Organization, Person, Event, Bill, Vote) with required field shapes and ID formats. The existing database already has `ocd_id` columns on municipalities, organizations, people, meetings, matters, and motions -- all currently NULL except the municipality (which contains an incorrect CSD code that must be fixed).

The primary technical challenge is **field mapping** -- the OCD spec defines deeply nested response structures (e.g., Events have inline agenda items with related_entities, media, and participants) while the existing data lives in normalized relational tables. The Phase 16 serializer pattern (allowlist construction from DB rows, never spread) applies directly. The OCD endpoints use **page-based pagination** (page number + per_page) matching OpenStates v3 conventions, not the cursor-based pagination used by the v1 endpoints.

The user's decisions lock in: full OCD spec compliance (all fields present, null when empty), no extras/extensions, public endpoints (no auth), wide-open CORS, and deterministic OCD IDs derived from existing database primary keys. Since the DB uses bigint PKs (not UUIDs), the OCD IDs should use deterministic UUID v5 hashing with a project namespace to produce spec-compliant identifiers like `ocd-person/a3b2c1d4-...`.

**Primary recommendation:** Build a shared `ocd-ids.ts` utility for deterministic UUID v5 generation from entity type + bigint PK. Create OCD serializer functions per entity type that map DB rows to the OCD spec shape. Register plain Hono GET routes (not chanfana `OpenAPIRoute` classes -- the OCD endpoints have their own spec and don't need OpenAPI generation). Use page-based pagination with offset/limit. Fix the municipality OCD division ID from `5917034` (Victoria) to `5917047` (View Royal).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Full list endpoints for all entities, including Jurisdiction and Organization (even though View Royal only has one of each) -- spec-compliant and future-proof if committees are added
- Events, Bills, Votes, Persons all map from existing DB models (meetings, matters, motions, people)
- Use a reference/divisions table to store OCD division strings (not hardcoded config) -- maps jurisdictions to their OCD division paths
- Use the official StatsCan Census Subdivision code for View Royal (not a human-readable slug) -- proper interop with other OCD datasets
- Derive entity OCD IDs deterministically from existing database UUIDs (e.g., `ocd-person/{existing-uuid}`) -- no separate mapping table, no new UUIDs
- Format: `ocd-{entity_type}/{uuid}` using existing primary keys
- Include all OCD spec fields in responses, even when empty (as null) -- consumers can rely on a consistent shape
- Strict spec compliance only -- no `extras` field for View Royal-specific data (no Vimeo links, transcripts, or AI summaries in OCD responses)
- Match OpenStates response structure for list endpoints -- practical interop with the main OCD consumer ecosystem
- Fully public endpoints -- no authentication required, maximizing accessibility for civic tech consumers
- Wide open CORS headers -- allow all origins so browser-based tools can call directly
- Rate limiting and root discovery endpoint at Claude's discretion

### Claude's Discretion
- Agenda items nesting strategy in Event responses (inline vs linked)
- Bill action history scope (full history vs key actions only)
- Vote roll call handling when data is missing (omit vs placeholder)
- OCD ID storage approach (computed at query time vs stored column)
- Filtering support on list endpoints (none vs basic date/status filters)
- Rate limiting strategy (shared with Phase 16, separate, or none)
- Root discovery endpoint at `/api/ocd/` (include or skip)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OCD-01 | API consumer can list and get OCD Jurisdiction objects mapped from municipalities | Municipalities table has 1 row; Jurisdiction OCD spec requires name, url, classification, legislative_sessions, feature_flags. Map municipality + organizations for legislative_sessions. Division ID must be fixed from `5917034` to `5917047`. |
| OCD-02 | API consumer can list and get OCD Organization objects mapped from organizations | Organizations table has 10 rows with classification enum (Council, Committee, Board, etc.). OCD Organization spec requires name, classification, parent_id, contact_details, links, posts. Map memberships to posts. |
| OCD-03 | API consumer can list and get OCD Person objects mapped from people | People table has 837 rows. OCD Person spec requires name, image, contact_details, links, plus extended details (sort_name, family_name, given_name, etc.). Map memberships for roles. |
| OCD-04 | API consumer can list and get OCD Event objects mapped from meetings (with agenda, participants, media) | Meetings table has 737 rows. OCD Event spec requires name, description, classification, start_time, timezone, status, location, media, participants, agenda, documents, sources. Map agenda_items to Event.agenda, attendance to Event.participants, video_url to Event.media. |
| OCD-05 | API consumer can list and get OCD Bill objects mapped from matters (with actions, sponsors) | Matters table has 1727 rows. OCD Bill spec requires organization, session, name, title, type, subject, summaries, sponsors, actions, documents, versions. Map agenda_items timeline as actions, motions movers as sponsors. |
| OCD-06 | API consumer can list and get OCD Vote objects mapped from motions (with roll call) | Motions table has 10536 rows with 44919 individual votes. OCD Vote spec requires organization, date, motion (text), type, passed, vote_counts, roll_call. Map votes table for roll_call, derive passed from result field. |
| OCD-07 | OCD endpoints use page-based pagination matching the OpenStates convention | OpenStates v3 uses `page` (default 1) + `per_page` (default 10, max varies) returning `{ pagination: { per_page, page, max_page, total_items }, results: [...] }`. Implement matching format. |
| OCD-08 | All OCD entities include valid OCD IDs (deterministic for jurisdictions/divisions, UUID-based for others) | Division ID: `ocd-division/country:ca/csd:5917047`. Jurisdiction ID: `ocd-jurisdiction/country:ca/csd:5917047/government`. Entity IDs: `ocd-{type}/{uuid}` where UUID is deterministic v5 from bigint PK + namespace. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hono | ^4.12 | API router framework | Already installed; OCD routes mount in same Hono app at `/api/ocd/*` |
| @supabase/supabase-js | (installed) | Database queries | Admin client for all OCD queries, same pattern as Phase 16 |
| zod | ^4.3 | Query param validation | Already installed; validate page/per_page params |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (no new deps) | -- | UUID v5 generation | Hand-roll using Web Crypto API (`crypto.subtle.digest`) -- 20 lines of code, avoids dependency for a single function. Cloudflare Workers support SubtleCrypto natively. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled UUID v5 | `uuid` npm package | Adding a dependency for one function is overkill; Web Crypto is available in Workers |
| Plain Hono routes | chanfana OpenAPIRoute classes | OCD endpoints have their own specification; generating a separate OpenAPI doc for them adds complexity without value since OCD consumers use the OCD spec itself, not OpenAPI |
| Page-based pagination | Cursor-based (like v1 endpoints) | OCD-07 requires OpenStates-style page-based; cursor pagination would break consumer expectations |
| Computed OCD IDs at query time | Stored ocd_id column + migration | Computing at serialization time is simpler, avoids migration, and IDs are deterministic so always produce the same result. Stored columns only help if we need to query by OCD ID -- which we do for detail endpoints. **Recommendation: compute at query time for list responses, look up by computing the expected OCD ID from the URL param for detail endpoints.** |

**Installation:**
No new packages needed -- all dependencies installed in Phases 15-16.

## Architecture Patterns

### Recommended Project Structure
```
apps/web/app/api/
├── index.ts                    # Extend: mount OCD routes
├── ocd/
│   ├── router.ts               # OCD sub-router with page-based pagination
│   ├── lib/
│   │   ├── ocd-ids.ts          # UUID v5 generation, OCD ID formatting
│   │   ├── pagination.ts       # Page-based pagination (offset/limit + total count)
│   │   └── ocd-envelope.ts     # OCD response envelope (OpenStates format)
│   ├── serializers/
│   │   ├── jurisdiction.ts     # Municipality -> OCD Jurisdiction
│   │   ├── organization.ts     # Organization -> OCD Organization
│   │   ├── person.ts           # Person -> OCD Person
│   │   ├── event.ts            # Meeting -> OCD Event
│   │   ├── bill.ts             # Matter -> OCD Bill
│   │   └── vote.ts             # Motion -> OCD Vote
│   └── endpoints/
│       ├── jurisdictions.ts    # GET list + GET detail
│       ├── organizations.ts    # GET list + GET detail
│       ├── people.ts           # GET list + GET detail
│       ├── events.ts           # GET list + GET detail
│       ├── bills.ts            # GET list + GET detail
│       └── votes.ts            # GET list + GET detail
```

### Pattern 1: OCD Serializer (Allowlist with Full Spec Fields)
**What:** Each serializer maps a DB row + related data into the full OCD spec shape, always including all fields (null when empty).
**When to use:** Every OCD response.
**Example:**
```typescript
// apps/web/app/api/ocd/serializers/event.ts
export function serializeOcdEvent(
  meeting: any,
  related: { agendaItems: any[]; attendance: any[]; organization: any },
  divisionId: string,
) {
  return {
    id: ocdEventId(meeting.id),
    name: meeting.title ?? null,
    description: meeting.summary ?? "",
    classification: mapMeetingTypeToOcdClassification(meeting.type),
    start_time: meeting.meeting_date
      ? `${meeting.meeting_date}T00:00:00-08:00`
      : null,
    timezone: "America/Vancouver",
    end_time: null,
    all_day: false,
    status: "passed", // historical meetings
    location: {
      url: null,
      name: "View Royal Town Hall",
      coordinates: null,
    },
    media: meeting.video_url
      ? [{ note: "Video recording", date: meeting.meeting_date, offset: null,
           links: [{ media_type: "text/html", url: meeting.video_url, text: "" }] }]
      : [],
    links: buildMeetingLinks(meeting),
    participants: related.attendance.map(serializeParticipant),
    agenda: related.agendaItems.map(serializeAgendaItem),
    documents: buildMeetingDocuments(meeting),
    sources: [{ url: meeting.agenda_url ?? meeting.minutes_url ?? "", note: null }],
    created_at: meeting.created_at ?? null,
    updated_at: meeting.created_at ?? null,
  };
}
```

### Pattern 2: Deterministic OCD ID Generation
**What:** Generate stable UUIDs from entity type + integer PK using UUID v5 (SHA-1 name-based).
**When to use:** Every entity that needs an OCD ID.
**Example:**
```typescript
// apps/web/app/api/ocd/lib/ocd-ids.ts
// Namespace UUID for ViewRoyal.ai OCD IDs (generated once, hardcoded)
const NAMESPACE = "f47ac10b-58cc-4372-a567-0d02b2c3d479";

export async function uuidV5(name: string): Promise<string> {
  const namespaceBytes = parseUuid(NAMESPACE);
  const nameBytes = new TextEncoder().encode(name);
  const data = new Uint8Array(namespaceBytes.length + nameBytes.length);
  data.set(namespaceBytes);
  data.set(nameBytes, namespaceBytes.length);
  const hash = await crypto.subtle.digest("SHA-1", data);
  const bytes = new Uint8Array(hash);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  return formatUuid(bytes);
}

export async function ocdPersonId(pk: number): Promise<string> {
  const uuid = await uuidV5(`person:${pk}`);
  return `ocd-person/${uuid}`;
}

export async function ocdEventId(pk: number): Promise<string> {
  const uuid = await uuidV5(`event:${pk}`);
  return `ocd-event/${uuid}`;
}

// Division-based IDs (not UUID, deterministic from geography)
export function ocdDivisionId(csdCode: string): string {
  return `ocd-division/country:ca/csd:${csdCode}`;
}

export function ocdJurisdictionId(csdCode: string): string {
  return `ocd-jurisdiction/country:ca/csd:${csdCode}/government`;
}
```

### Pattern 3: OpenStates-Style Page-Based Pagination
**What:** Page number + per_page params, response includes total_items and max_page.
**When to use:** All OCD list endpoints.
**Example:**
```typescript
// apps/web/app/api/ocd/lib/pagination.ts
interface OcdPagination {
  page: number;
  per_page: number;
  max_page: number;
  total_items: number;
}

export function ocdListResponse<T>(
  c: Context,
  results: T[],
  pagination: OcdPagination,
) {
  return c.json({
    results,
    pagination,
  });
}

// Usage in endpoint:
const total = await countQuery(supabase, muniId);
const maxPage = Math.max(1, Math.ceil(total / perPage));
const offset = (page - 1) * perPage;
const { data } = await supabase
  .from("meetings")
  .select("...")
  .eq("municipality_id", muniId)
  .range(offset, offset + perPage - 1);
```

### Pattern 4: OCD Route Registration (Public, No Auth)
**What:** Mount OCD routes without apiKeyAuth or rateLimit middleware (public access per user decision).
**When to use:** All OCD endpoints.
**Example:**
```typescript
// In apps/web/app/api/index.ts or ocd/router.ts
const ocdApp = new Hono<ApiEnv>();

// Municipality middleware only (no auth, no rate limit)
ocdApp.use("/:municipality/*", municipality);

// Register routes
ocdApp.get("/:municipality/jurisdictions", listJurisdictions);
ocdApp.get("/:municipality/jurisdictions/:id", getJurisdiction);
// ... etc for all 6 entity types

// Mount in main app
app.route("/api/ocd", ocdApp);
```

### Anti-Patterns to Avoid
- **Mixing v1 and OCD response formats:** The v1 API uses `{ data, pagination: { has_more, next_cursor }, meta: { request_id } }`. OCD endpoints use `{ results, pagination: { page, per_page, max_page, total_items } }`. Keep these separate -- different envelope modules, not conditional logic in a shared one.
- **Partial spec compliance:** Including some OCD fields but omitting others breaks consumers that expect the full shape. Always include all spec fields, even as null/empty arrays.
- **Non-deterministic IDs:** If OCD IDs change between requests, consumers can't link or deduplicate data. The UUID v5 approach guarantees the same PK always produces the same OCD ID.
- **Putting OCD IDs in the database before getting them right:** The ocd_id columns exist but are empty. Computing at query time is safer until the ID format is validated. Can backfill later if needed for query performance.

## Critical Finding: Incorrect Municipality OCD Division ID

**Severity: HIGH -- must fix before any OCD endpoints go live.**

The `municipalities` table currently stores:
```
ocd_id = 'ocd-division/country:ca/csd:5917034'
```

**CSD code `5917034` is Victoria (City), not View Royal.** The correct StatsCan Census Subdivision code for View Royal is `5917047`.

Evidence:
- [StatsCan 2016 Census Profile for CSD 5917034](https://www12.statcan.gc.ca/census-recensement/2016/dp-pd/prof/details/page.cfm?Lang=E&Geo1=CSD&Code1=5917034) -- shows "Victoria, City [Census subdivision]"
- [StatsCan 2021 Census Profile for CSD 5917047](https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/page.cfm?Lang=E&SearchText=VIEW+ROYAL&DGUIDlist=2021A00055917047) -- shows "View Royal, Town (T) [Census subdivision]"

The correct OCD division ID is: `ocd-division/country:ca/csd:5917047`
The correct OCD jurisdiction ID is: `ocd-jurisdiction/country:ca/csd:5917047/government`

**Fix:** A migration must update `municipalities.ocd_id` to the correct value.

## Entity Mapping Reference

### DB -> OCD Entity Map
| OCD Entity | DB Source Table(s) | Key Fields | Notes |
|------------|-------------------|------------|-------|
| Jurisdiction | municipalities | name, website_url, classification | Only 1 row. legislative_sessions derived from meetings date ranges. |
| Organization | organizations | name, classification, municipality_id | 10 rows. Posts derived from memberships. Parent org = Council for committees. |
| Person | people | name, image_url, is_councillor, slug | 837 rows. Memberships for roles. contact_details from email field. |
| Event | meetings | title, meeting_date, type, video_url, summary | 737 rows. agenda from agenda_items, participants from attendance, media from video_url. |
| Bill | matters | title, identifier, description, status, category | 1727 rows. actions from agenda_item timeline, sponsors from motions movers. |
| Vote | motions | text_content, result, mover, seconder, meeting_id | 10536 rows. roll_call from votes table (44919 records). vote_counts from yes/no/abstain columns. |

### OCD Vote Type Mapping
The votes table contains these values that need mapping to OCD vote_type:
| DB vote value | OCD vote_type |
|---------------|---------------|
| Yes, YES, AYE, For | yes |
| No, NO, Against | no |
| Abstain, Recused | abstain |
| Absent, No Vote | absent |

### OCD Motion Result -> passed Boolean
| DB result | OCD passed |
|-----------|------------|
| CARRIED, CARRIED AS AMENDED, CARRRIED, AMENDED | true |
| DEFEATED, FAILED, FAILED FOR LACK OF A SECONDER, FAILED FOR LACK OF SECONDER, NOT CARRIED | false |
| TABLED, WITHDRAWN | false (or null -- these are not clear pass/fail) |

### OCD Event Classification Mapping
| DB meeting.type | OCD classification |
|-----------------|-------------------|
| Regular Council | meeting |
| Special Council | meeting |
| Committee of the Whole | meeting |
| Public Hearing | hearing |
| Board of Variance | hearing |
| Standing Committee | meeting |
| Advisory Committee | meeting |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID v5 generation | Full UUID library | Web Crypto `crypto.subtle.digest('SHA-1', ...)` | 20 lines of code; Workers support SubtleCrypto natively |
| Page-based pagination | Complex pagination framework | Simple offset/limit + count query | Math.ceil(total/perPage) is all you need |
| OCD spec validation | JSON Schema validator | Serializer allowlist pattern | If the serializer explicitly constructs every field, the shape is correct by construction |
| CORS | Custom CORS middleware | hono/cors (already configured) | The existing CORS middleware at `*` already applies to `/api/ocd/*` routes |

**Key insight:** The OCD spec is a data format specification, not a protocol. The hard part is correct field mapping, not API mechanics. Serializers are where 80% of the effort goes.

## Common Pitfalls

### Pitfall 1: Async OCD ID Generation
**What goes wrong:** UUID v5 uses `crypto.subtle.digest` which is async. Serializers become async, and calling them in `.map()` produces Promise arrays.
**Why it happens:** Web Crypto is intentionally async for non-blocking operation.
**How to avoid:** Pre-compute all OCD IDs before serialization using `Promise.all()`, then pass pre-computed IDs into the synchronous serializer functions. Or generate all entity IDs in a batch step at the top of each endpoint handler.
**Warning signs:** `[object Promise]` appearing in JSON responses.

### Pitfall 2: OCD Bill "session" Field
**What goes wrong:** The OCD Bill spec requires a `session` field (legislative session identifier). View Royal doesn't have legislative sessions -- it has a continuous council.
**Why it happens:** The OCD spec was designed for US state legislatures with discrete sessions.
**How to avoid:** Use the calendar year of the matter's `first_seen` date as the session identifier (e.g., "2024"). This is a reasonable convention for municipal governments that don't have formal sessions.
**Warning signs:** Null or empty session fields breaking OCD consumers that expect sessions.

### Pitfall 3: Missing vote_counts vs roll_call Consistency
**What goes wrong:** The motions table has summary counts (yes_votes, no_votes, abstain_votes) that may not match the detailed votes table rows. OCD Vote requires both vote_counts and roll_call.
**Why it happens:** Summary counts are scraped from meeting minutes; detailed votes are reconstructed from transcripts. They may disagree.
**How to avoid:** Compute vote_counts from the actual roll_call data (votes table) rather than using the pre-computed summary columns. This ensures consistency between the two fields in the OCD response.
**Warning signs:** vote_counts total not matching roll_call length.

### Pitfall 4: Total Count Performance
**What goes wrong:** Page-based pagination requires a total count for `max_page`. Running `SELECT COUNT(*)` on large tables alongside the page query doubles database load.
**Why it happens:** Unlike cursor-based pagination, page-based needs to know the total to compute `max_page`.
**How to avoid:** Use Supabase's `.select('*', { count: 'exact' })` which returns count alongside data. For the meetings (737), matters (1727), and motions (10536) tables, exact counts are fast enough. Only optimize if performance monitoring shows issues.
**Warning signs:** Slow OCD list endpoint responses (>500ms).

### Pitfall 5: OCD Division ID vs Jurisdiction ID Confusion
**What goes wrong:** Division IDs identify a geographic area (`ocd-division/country:ca/csd:5917047`). Jurisdiction IDs identify a governing body within a division (`ocd-jurisdiction/country:ca/csd:5917047/government`). Using one where the other is expected breaks entity references.
**Why it happens:** The naming is similar and both use the same CSD code.
**How to avoid:** Division ID: stored in `municipalities.ocd_id`, references geography. Jurisdiction ID: derived from division ID + `/government` suffix, references the governing body. Organizations reference the Jurisdiction ID, not the Division ID.

## Code Examples

### Example 1: OCD Jurisdiction Response
```json
{
  "id": "ocd-jurisdiction/country:ca/csd:5917047/government",
  "name": "Town of View Royal",
  "url": "https://www.viewroyal.ca",
  "classification": "government",
  "division": {
    "id": "ocd-division/country:ca/csd:5917047",
    "name": "View Royal"
  },
  "legislative_sessions": [],
  "feature_flags": [],
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "sources": [{ "url": "https://www.viewroyal.ca", "note": null }]
}
```

### Example 2: OCD Event Response (Meeting)
```json
{
  "id": "ocd-event/a3b2c1d4-5678-5abc-def0-123456789abc",
  "name": "Regular Council Meeting - January 15, 2024",
  "description": "AI-generated meeting summary...",
  "classification": "meeting",
  "start_time": "2024-01-15T00:00:00-08:00",
  "timezone": "America/Vancouver",
  "end_time": null,
  "all_day": false,
  "status": "passed",
  "location": {
    "url": null,
    "name": "View Royal Town Hall",
    "coordinates": null
  },
  "media": [{
    "note": "Video recording",
    "date": "2024-01-15",
    "offset": null,
    "links": [{ "media_type": "text/html", "url": "https://vimeo.com/...", "text": "" }]
  }],
  "links": [
    { "note": "Agenda", "url": "https://..." },
    { "note": "Minutes", "url": "https://..." }
  ],
  "participants": [{
    "note": "attendee",
    "name": "Graham Hill",
    "entity_type": "person",
    "entity_name": "Graham Hill",
    "entity_id": "ocd-person/b4c5d6e7-..."
  }],
  "agenda": [{
    "description": "Rezoning Application - 123 Main St",
    "classification": "Rezoning",
    "order": "5.1",
    "subjects": [],
    "notes": [],
    "related_entities": [],
    "media": []
  }],
  "documents": [{
    "note": "Agenda document",
    "date": "2024-01-15",
    "media_type": "application/pdf",
    "url": "https://...",
    "text": "",
    "links": []
  }],
  "sources": [{ "url": "https://...", "note": null }],
  "created_at": "2024-01-15T00:00:00Z",
  "updated_at": "2024-01-15T00:00:00Z"
}
```

### Example 3: OCD Vote Response (Motion)
```json
{
  "id": "ocd-vote/c5d6e7f8-...",
  "organization": "Council",
  "organization_id": "ocd-organization/...",
  "session": "2024",
  "chamber": null,
  "date": "2024-01-15",
  "motion": "That Council approve the rezoning...",
  "type": ["bill-passage"],
  "passed": true,
  "bill": {
    "id": "ocd-bill/...",
    "name": "Rezoning 123 Main St",
    "chamber": null
  },
  "vote_counts": [
    { "vote_type": "yes", "count": 5 },
    { "vote_type": "no", "count": 1 },
    { "vote_type": "absent", "count": 1 }
  ],
  "roll_call": [
    {
      "person": { "id": "ocd-person/...", "name": "Graham Hill" },
      "vote_type": "yes"
    }
  ],
  "sources": [{ "url": "...", "note": null }],
  "created_at": "2024-01-15T00:00:00Z",
  "updated_at": "2024-01-15T00:00:00Z"
}
```

### Example 4: OpenStates-Style Paginated List
```json
{
  "results": [
    { "id": "ocd-event/...", "name": "Regular Council Meeting - January 15, 2024", "..." : "..." }
  ],
  "pagination": {
    "per_page": 20,
    "page": 1,
    "max_page": 37,
    "total_items": 737
  }
}
```

## Discretion Recommendations

Based on research findings, here are recommendations for the areas left to Claude's discretion:

### Agenda Items in Event Responses: Inline
**Recommendation:** Inline agenda items directly in the Event response. The OCD Event spec requires an `agenda` array with `description`, `classification`, `order`, `subjects`, `notes`, `related_entities`, and `media` per item. This is the standard shape -- use it. Keep items lightweight (no full descriptions or summaries beyond the title).

### Bill Action History: Full History
**Recommendation:** Include all agenda item appearances as actions. Municipal matters don't have hundreds of actions like US state bills. The typical View Royal matter appears 2-5 times across meetings. Full history is small and valuable.

### Vote Roll Call When Missing: Omit
**Recommendation:** When no individual vote records exist for a motion, return an empty `roll_call` array (not placeholder entries). The `vote_counts` can still come from the summary columns. An empty roll_call is truthful; fabricated placeholders would mislead consumers.

### OCD ID Storage: Compute at Query Time
**Recommendation:** Compute OCD IDs at serialization time, not stored columns. Reasons: (1) IDs are deterministic -- same PK always produces same UUID v5. (2) Avoids a backfill migration. (3) Detail endpoint lookups can reverse the OCD ID from the URL param to extract the PK (or simply parse the UUID and look up). The `ocd_id` columns exist but can remain NULL for now; backfill only if query-by-OCD-ID performance becomes an issue.

### Filtering: Basic Date/Status Filters
**Recommendation:** Add basic filters matching what the existing v1 endpoints already support:
- Events: `before`, `after` (date range)
- Bills: `status`, `updated_since`
- Votes: `before`, `after`
- People: none needed (small dataset, list all)
- Jurisdictions/Organizations: none needed (tiny datasets)

### Rate Limiting: Shared with Phase 16
**Recommendation:** Apply the same rate limiter but at a more generous limit for OCD endpoints since they're public. Use the existing `rateLimit` middleware but with a higher per-IP limit instead of per-API-key. Or skip rate limiting entirely for the MVP since the data is small and queries are simple -- add it later if abuse is detected.

Actually, since the user said "fully public endpoints -- no authentication required," and rate limiting is at Claude's discretion, **skip rate limiting for now**. The datasets are small (max ~10k motions), all queries hit indexed columns, and there's no auth to bind rate limits to. If needed, add IP-based rate limiting later.

### Root Discovery Endpoint: Include
**Recommendation:** Include a simple discovery endpoint at `GET /api/ocd/:municipality/` that returns the list of available entity endpoints. This is low effort and helps consumers explore the API.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OCD API (official centralized) | Self-hosted OCD-compliant endpoints | ~2020 (OCD API deprecated) | Cities/vendors now self-host; no central aggregator |
| OpenStates GraphQL API v2 | OpenStates REST API v3 | 2021 | REST with page-based pagination is the current standard |
| UUID v1 (time-based) for OCD IDs | UUID v5 (name-based) or UUID v4 | Ongoing | v5 is better for deterministic IDs; v1 was the original pupa convention |

**Deprecated/outdated:**
- The official Open Civic Data API at `api.opencivicdata.org` is no longer maintained
- OpenStates GraphQL v2 API is deprecated in favor of REST v3
- The `pupa` scraping framework that originally generated OCD IDs is largely unmaintained

## Open Questions

1. **OCD Division ID Canonical Status**
   - What we know: View Royal's CSD code is `5917047`. The OCD division IDs GitHub repo has Canadian entries.
   - What's unclear: Whether `ocd-division/country:ca/csd:5917047` specifically appears in the canonical repo (the CSV is too large to fully search via web fetch).
   - Recommendation: Use the StatsCan code regardless -- even if not in the canonical repo, it follows the established format and is the correct government identifier. The canonical repo is community-maintained and not authoritative for all divisions.

2. **Bill-to-Vote Linkage**
   - What we know: Motions belong to agenda_items which belong to matters. The OCD Vote has a `bill` field referencing a Bill.
   - What's unclear: Some motions are procedural (e.g., "To adjourn") and don't correspond to any matter/bill.
   - Recommendation: Include `bill: null` for motions without a linked matter. Only populate `bill` when the motion's agenda_item has a non-null `matter_id`.

3. **OCD ID Reverse Lookup for Detail Endpoints**
   - What we know: Detail endpoints like `GET /events/:id` will receive an OCD ID (e.g., `ocd-event/a3b2c1d4-...`).
   - What's unclear: How to efficiently look up the DB row from an OCD ID without a stored column.
   - Recommendation: Pre-compute a small lookup map at startup? No -- too many entities. Instead, for the MVP, accept that detail endpoints might need a full scan or use the stored `ocd_id` column. **Better approach: use the slug as the detail endpoint key (e.g., `/events/:slug`) and include the OCD ID in the response.** This matches OpenStates which uses both OCD IDs and path-based lookups. Alternatively, store computed OCD IDs in the `ocd_id` columns via a one-time backfill, then index and query directly.

## Sources

### Primary (HIGH confidence)
- [OCD Identifiers Documentation](https://open-civic-data.readthedocs.io/en/latest/ocdids.html) -- ID format specification
- [OCD Event Data Type](https://open-civic-data.readthedocs.io/en/latest/data/event.html) -- Full Event schema with all fields
- [OCD Bill Data Type](https://open-civic-data.readthedocs.io/en/latest/data/bill.html) -- Full Bill schema
- [OCD Vote Data Type](https://open-civic-data.readthedocs.io/en/latest/data/vote.html) -- Full Vote schema
- [OCD Organization Data Type](https://open-civic-data.readthedocs.io/en/latest/data/organization.html) -- Full Organization schema
- [OCD Person Data Type](https://open-civic-data.readthedocs.io/en/latest/data/person.html) -- Full Person schema
- [OCD Jurisdiction Data Type](https://open-civic-data.readthedocs.io/en/latest/data/jurisdiction.html) -- Full Jurisdiction schema
- [OpenStates API v3 source: pagination.py](https://github.com/openstates/api-v3/blob/main/api/pagination.py) -- Page-based pagination implementation
- [StatsCan Census Profile: CSD 5917047 (View Royal)](https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/page.cfm?Lang=E&SearchText=VIEW+ROYAL&DGUIDlist=2021A00055917047) -- Confirms correct CSD code
- [StatsCan Census Profile: CSD 5917034 (Victoria)](https://www12.statcan.gc.ca/census-recensement/2016/dp-pd/prof/details/page.cfm?Lang=E&Geo1=CSD&Code1=5917034) -- Confirms incorrect CSD code in current DB

### Secondary (MEDIUM confidence)
- [OpenStates API v3 Overview](https://docs.openstates.org/api-v3/) -- Endpoint patterns and response conventions
- [OpenStates API v3 source: events.py](https://github.com/openstates/api-v3/blob/main/api/events.py) -- Event endpoint patterns
- [OpenStates API v3 source: bills.py](https://github.com/openstates/api-v3/blob/main/api/bills.py) -- Bill endpoint patterns
- [OCD Division IDs Repository](https://github.com/opencivicdata/ocd-division-ids) -- Canonical division ID registry

### Tertiary (LOW confidence)
- OCD division ID `ocd-division/country:ca/csd:5917047` -- assumed to follow the CSD pattern based on other Canadian entries, but not directly confirmed in the canonical CSV due to file size limitations

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- using exact same infrastructure as Phase 16, no new dependencies
- Architecture: HIGH -- patterns follow Phase 16 conventions with clear OCD spec mapping, well-documented field mappings
- Pitfalls: HIGH -- verified with actual DB data (vote values, result types, attendance modes), confirmed CSD code error with StatsCan census profiles
- OCD spec compliance: MEDIUM -- spec documentation is clear but some edge cases (municipal sessions, procedural motions) require interpretation for a municipal context vs the US state legislature context the spec was designed for

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (stable -- OCD spec hasn't changed in years, DB schema is locked)
