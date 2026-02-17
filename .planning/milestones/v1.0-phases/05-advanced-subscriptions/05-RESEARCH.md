# Phase 5: Advanced Subscriptions - Research

**Researched:** 2026-02-16
**Domain:** Subscription matching (topic/semantic, geospatial, digest emails), onboarding UX, scheduled Edge Functions
**Confidence:** HIGH

## Summary

Phase 5 extends the Phase 3 subscription infrastructure with three new subscription capabilities: topic-based alerts using predefined categories and semantic keyword matching, neighbourhood/address-based alerts using PostGIS radius matching, and post-meeting digest emails. It also adds a post-signup onboarding wizard and pre-meeting alert emails.

The existing infrastructure is substantial and well-structured. Phase 3 delivered: `subscriptions` table with polymorphic type column (including `topic` and `neighborhood` enum values already), `user_profiles` table with `location` geography column, `subscribe-button.tsx` component, `settings.tsx` page, `send-alerts` Edge Function with HTML email builder, and three critical RPCs (`build_meeting_digest`, `find_meeting_subscribers`, `find_matters_near`). The `find_meeting_subscribers` RPC already has a UNION branch for neighbourhood matching via `ST_DWithin`. The database has PostGIS 3.3.7 and pgvector 0.8.0 installed. Embeddings use OpenAI `text-embedding-3-small` at 384 dimensions.

**Primary recommendation:** Extend existing subscription infrastructure (not rebuild). Seed the empty `topics` table from the 8 clean matter categories. Add a `keyword` text column plus `keyword_embedding` halfvec(384) column to `subscriptions` for semantic matching. Integrate Nominatim geocoding into the pipeline ingester. Extend `find_meeting_subscribers` RPC with a topic-matching UNION branch. Build the onboarding wizard as a multi-step form on a new `/onboarding` route that redirects from signup completion.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Topic Matching:**
- Users can subscribe via **predefined categories** (existing agenda item categories in DB) AND **free-text keywords**
- Keyword matching uses **semantic/embedding matching** — "housing" should catch "affordable homes", "residential development" etc.
- Topic alerts fire as part of the **post-meeting digest**, not as individual real-time emails

**Neighbourhood / Address Subscriptions:**
- Users can provide their **street address** (precision) OR **pick a neighbourhood** from the existing list (simpler)
- Matching uses **simple radius match** from user's address to matter addresses — no neighbourhood boundary data needed yet
- Pipeline **geocodes matter addresses at ingestion time** (adds lat/lng) for fast matching later
- Neighbourhood boundary geocoding is manual/future work — radius match is the v1 approach

**Notification Timing (Post-Meeting + Pre-Meeting):**
- **Post-meeting digest** replaces the weekly digest concept — fires after each meeting, not on a fixed weekly schedule
- Post-meeting digest is a **full meeting summary with subscribed items highlighted** (not just personalized items)
- **Pre-meeting alert** includes matching agenda items with titles/context PLUS practical info about attending (location, online link, time)
- No meetings = no emails (meeting-aligned, not calendar-aligned)

**Digest Email Style:**
- **Friendly/accessible tone** — plain language, like a neighbour explaining what happened
- **Opt-in subscription type** — users explicitly subscribe to meeting digests (not auto-enrolled on account creation)

**Subscription UX:**
- **Post-signup onboarding wizard** — after email verification, walk user through: pick topics -> set address/neighbourhood -> opt into digest
- Digest opt-in offered in **both** onboarding wizard AND settings page
- Topic/neighbourhood management lives in the **existing subscription settings page** after initial setup

### Claude's Discretion

- Whether to show all categories or only active ones in onboarding topic picker
- Loading/empty state design for onboarding wizard
- Exact radius distance for neighbourhood matching
- Email template layout and responsive design
- How to handle matters with no geocodable address

### Deferred Ideas (OUT OF SCOPE)

- Neighbourhood boundary geocoding (manual data entry by project owner) — future enhancement to replace radius matching
- Dynamic neighbourhood list loading from DB (currently hardcoded VIEW_ROYAL_NEIGHBORHOODS array, TODO noted in Phase 3)

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SUB-03 | User can subscribe to a topic/category and receive email on matching items | Topics table exists but is empty (0 rows). 8 clean matter categories available to seed it. Subscriptions table already has `topic_id` FK column. Need to add `keyword` + `keyword_embedding` columns for semantic matching. `find_meeting_subscribers` RPC needs new UNION branch for topic matching. Embeddings infrastructure exists (`embeddings.server.ts` with OpenAI text-embedding-3-small at 384 dims). |
| SUB-04 | User can subscribe to a neighbourhood and receive email on geographically relevant items | `user_profiles.location` geography column exists but is NULL for all users. `subscriptions` table has `neighborhood` and `proximity_radius_m` columns. `find_meeting_subscribers` already has neighbourhood UNION branch using `ST_DWithin`. PostGIS 3.3.7 installed. 565/1727 matters have geo data, 1553/12200 agenda items have geo. Nominatim geocoding script exists but is not integrated into pipeline. Need: user address geocoding on profile save, pipeline geocoding at ingestion, UI for address/neighbourhood selection in settings + onboarding. |
| SUB-05 | User can subscribe to weekly meeting digest email | Context decision changed this to **post-meeting digest** (meeting-aligned, not weekly). `send-alerts` Edge Function already builds and sends digest HTML emails via Resend. `build_meeting_digest` RPC returns full meeting summary. Current `signup.tsx` auto-subscribes to digest — must change to opt-in per user decision. Need: onboarding wizard with digest opt-in, update signup to NOT auto-subscribe, enhance digest email to highlight user's subscribed items, add pre-meeting alert capability, scheduling via pg_cron or pipeline trigger. |

</phase_requirements>

## Standard Stack

### Core (Already in Project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase JS | 2.x | Database client, auth, RLS | Already used throughout; service layer pattern established |
| PostGIS | 3.3.7 | Geospatial queries (ST_DWithin, ST_Distance, ST_MakePoint) | Already installed and used by `find_matters_near` RPC |
| pgvector | 0.8.0 | Vector similarity search for semantic matching | Already installed; HNSW indexes on all major tables |
| OpenAI text-embedding-3-small | - | 384-dim embeddings for keyword matching | Already used by RAG system (`embeddings.server.ts`) and pipeline (`embed.py`) |
| Resend | - | Email delivery API | Already used by `send-alerts` Edge Function |
| React Router 7 | 7.x | SSR routing, loaders, actions | App framework; flat file routes in `apps/web/app/routes/` |
| Tailwind CSS 4 | 4.x | Styling | Project standard |
| shadcn/ui + Radix UI | - | UI components (Input, Button, Badge, etc.) | Project standard |
| lucide-react | - | Icons (Bell, MapPin, Tag, etc.) | Project standard |

### Supporting (May Need)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Nominatim API | - | Address geocoding (lat/lng from street address) | When user saves address in profile; when pipeline processes new agenda items with `related_address` |
| pg_cron | - | Schedule Edge Function invocations | For pre-meeting alerts (fire N hours before meeting_date) |
| pg_net | - | HTTP requests from PostgreSQL | pg_cron job calls Edge Function via HTTP |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Nominatim (geocoding) | Google Maps Geocoding API | Google is more accurate but costs money and requires API key; Nominatim is free but rate-limited (1 req/sec) and less accurate for Canadian addresses |
| pg_cron (scheduling) | Cloudflare Workers Cron | Workers cron already exists (*/5 * * * *) but only pings Render; pg_cron can directly invoke Edge Functions via pg_net without external infrastructure |
| OpenAI embeddings (semantic match) | Full-text search with tsvector | Full-text is simpler but doesn't handle semantic similarity ("housing" won't match "residential development"); embeddings already exist on 12,183 agenda items |

**Installation:** No new packages needed. All libraries already in project.

## Architecture Patterns

### Existing File Structure (Relevant to Phase 5)

```
apps/web/app/
  routes/
    signup.tsx           # Signup form — needs redirect to onboarding
    settings.tsx         # Profile + subscriptions — needs topic/neighbourhood UI
    api.subscribe.tsx    # Subscribe/unsubscribe API — needs keyword support
    api.digest.tsx       # Digest preview API — may need enhancement
  services/
    subscriptions.ts     # Query functions — needs topic/keyword additions
  components/
    subscribe-button.tsx # Toggle button — may need topic variant
  lib/
    types.ts             # TypeScript interfaces — needs keyword fields
    embeddings.server.ts # OpenAI embedding generation — reuse for keyword matching
    supabase.server.ts   # Server client creation

apps/pipeline/
  pipeline/ingestion/
    ingester.py          # Meeting ingestion — needs geocoding integration
    embed.py             # Bulk embeddings — unchanged
  scripts/db/
    geocode_addresses.py # Standalone geocoder — pattern for pipeline integration
```

### New Files Phase 5 Will Create

```
apps/web/app/
  routes/
    onboarding.tsx       # Post-signup onboarding wizard (multi-step form)
    api.geocode.tsx      # Server-side geocoding endpoint (Nominatim)
  services/
    topics.ts            # Topic/category query functions
```

### Pattern 1: Semantic Keyword Matching via Embedding Cosine Similarity

**What:** When a user subscribes with a free-text keyword, embed it using OpenAI and store the 384-dim vector alongside the subscription. At notification time, compare the keyword embedding against agenda item embeddings using cosine similarity with a threshold.

**When to use:** For topic subscriptions with keyword type (not predefined category).

**Example:**
```sql
-- At subscription creation time, store keyword + its embedding
ALTER TABLE subscriptions ADD COLUMN keyword text;
ALTER TABLE subscriptions ADD COLUMN keyword_embedding halfvec(384);

-- At notification time, find agenda items matching keyword subscriptions
-- (new UNION branch in find_meeting_subscribers)
SELECT DISTINCT
    s.user_id,
    s.id AS subscription_id,
    s.type AS subscription_type,
    COALESCE(up.notification_email, au.email) AS notification_email
FROM subscriptions s
JOIN user_profiles up ON up.id = s.user_id
JOIN auth.users au ON au.id = s.user_id
JOIN agenda_items ai ON ai.meeting_id = target_meeting_id
WHERE s.type = 'topic'
  AND s.is_active = true
  AND s.keyword_embedding IS NOT NULL
  AND ai.embedding IS NOT NULL
  AND 1 - (ai.embedding <=> s.keyword_embedding) > 0.45  -- cosine similarity threshold
```

**Threshold rationale:** 0.45 cosine similarity is a reasonable starting point for `text-embedding-3-small`. The `<=>` operator in pgvector computes cosine distance (1 - similarity), so `1 - distance > 0.45` means similarity > 0.45. This can be tuned later.

### Pattern 2: Category-Based Topic Matching via FK Join

**What:** For predefined category subscriptions, match by joining subscriptions.topic_id to topics table, then matching topics.name against agenda_items.category or matters.category.

**When to use:** For topic subscriptions using predefined categories.

**Example:**
```sql
-- Seed topics from existing matter categories
INSERT INTO topics (name, description)
SELECT DISTINCT category, 'Matters categorized as ' || category
FROM matters
WHERE category IS NOT NULL
ORDER BY category;

-- Category matching branch in find_meeting_subscribers
SELECT DISTINCT
    s.user_id,
    s.id AS subscription_id,
    s.type AS subscription_type,
    COALESCE(up.notification_email, au.email) AS notification_email
FROM subscriptions s
JOIN user_profiles up ON up.id = s.user_id
JOIN auth.users au ON au.id = s.user_id
JOIN topics t ON t.id = s.topic_id
JOIN agenda_items ai ON ai.meeting_id = target_meeting_id
JOIN matters m ON m.id = ai.matter_id
WHERE s.type = 'topic'
  AND s.is_active = true
  AND s.topic_id IS NOT NULL
  AND m.category = t.name
```

### Pattern 3: User Address Geocoding on Profile Save

**What:** When user saves a street address in their profile (settings or onboarding), geocode it server-side using Nominatim and store as PostGIS geography point in `user_profiles.location`.

**When to use:** Every time user updates their address.

**Example:**
```typescript
// In api.geocode.tsx or within settings action
async function geocodeAddress(address: string): Promise<{lat: number, lng: number} | null> {
  // Bias to View Royal bounding box for accuracy
  const viewBox = "-123.55,48.42,-123.40,48.48";
  const url = `https://nominatim.openstreetmap.org/search?` +
    `q=${encodeURIComponent(address + ", View Royal, BC, Canada")}` +
    `&format=json&limit=1&viewbox=${viewBox}&bounded=1`;

  const res = await fetch(url, {
    headers: { "User-Agent": "ViewRoyal.ai/1.0 (civic platform)" }
  });

  const results = await res.json();
  if (results.length === 0) return null;

  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
}

// Then update user_profiles.location
// SQL: UPDATE user_profiles SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
```

**Rate limiting note:** Nominatim requires max 1 request/second and a descriptive User-Agent. This is fine for individual user profile saves but must NOT be used for bulk geocoding during pipeline runs (the existing `geocode_addresses.py` script handles that with proper rate limiting).

### Pattern 4: Post-Signup Onboarding Wizard

**What:** Multi-step form flow after email verification. Steps: (1) Pick topic categories, (2) Set address or neighbourhood, (3) Opt into digest. Each step creates subscriptions via the existing API.

**When to use:** Once, immediately after first login post-signup.

**Example flow:**
```
signup.tsx → email confirmation → login → root loader detects new user (no subscriptions, no address) → redirect to /onboarding

/onboarding step 1: Category checkboxes (8 categories from topics table)
                     → POST /api/subscribe for each selected category

/onboarding step 2: Address input with geocode OR neighbourhood dropdown
                     → POST settings action to save profile

/onboarding step 3: Digest opt-in checkbox
                     → POST /api/subscribe with type="digest" if opted in

Complete → redirect to /settings or home
```

**Detection logic:** Root loader checks if user has completed onboarding. Simplest approach: check if user has any subscriptions beyond the auto-created ones, or add an `onboarding_completed` boolean to `user_profiles`.

### Pattern 5: Digest Email with Highlighted Subscribed Items

**What:** The post-meeting digest email is a full meeting summary (same as current), but items matching the user's specific subscriptions (topic, neighbourhood, person, matter) are visually highlighted with a "You follow this" indicator.

**When to use:** When building digest email HTML per subscriber.

**Current state:** `buildDigestHtml` in `send-alerts` Edge Function receives `subs: Subscriber[]` array but does NOT currently use it to highlight items. The enhancement adds subscription-aware highlighting.

### Anti-Patterns to Avoid

- **Real-time email per subscription match:** User decision locks post-meeting digest as the notification vehicle. Do NOT send individual emails for each topic/neighbourhood match. Batch everything into the digest.
- **Client-side geocoding:** Nominatim API calls must happen server-side (API route or Edge Function), never from the browser. Nominatim ToS prohibits client-side use from web apps.
- **Auto-enrolling digest on signup:** User decision explicitly changed digest to opt-in. Current `signup.tsx` auto-subscribes to digest (line 46-49) — this MUST be removed.
- **Polling for new meetings:** Notification trigger should be meeting-aligned (pipeline calls Edge Function after ingestion), not calendar-aligned (cron job checking for new meetings).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Geospatial distance | Custom Haversine formula in JS | PostGIS `ST_DWithin` / `ST_Distance` | Already working in `find_matters_near` and `find_meeting_subscribers`; handles edge cases, projections, indexes |
| Semantic text matching | Custom word overlap / fuzzy matching | pgvector cosine similarity on OpenAI embeddings | Already have 12,183 embedded agenda items; pgvector HNSW indexes make queries fast |
| Address geocoding | Custom address parser | Nominatim API (or existing `geocode_addresses.py` pattern) | Street address parsing is notoriously hard; Nominatim handles Canadian addressing |
| Email HTML rendering | Custom string concatenation | Extend existing `buildDigestHtml` in Edge Function | Already has responsive email template with all sections; just needs enhancement |
| Subscription deduplication | Custom dedup logic | Existing `alert_log` table with unique check | `send-alerts` Edge Function already deduplicates by checking `alert_log` before sending |
| Multi-step form state | Custom React state machine | React Router actions with redirect chains or URL state | Form state is already the pattern used by signup/settings; keep it consistent |

**Key insight:** Phase 3 built the complete subscription pipeline (UI -> API -> DB -> RPC -> Edge Function -> Email). Phase 5 extends each layer, not replaces.

## Common Pitfalls

### Pitfall 1: Empty Topics Table Causes No Category Matches

**What goes wrong:** The `topics` table has 0 rows. If topic subscriptions try to FK join against it, nothing matches.
**Why it happens:** Topics table was created in schema but never seeded.
**How to avoid:** Migration must seed topics from the 8 distinct matter categories before any UI references them. Verify with: `SELECT count(*) FROM topics` after migration.
**Warning signs:** Category picker shows empty list; topic subscriptions never fire.

### Pitfall 2: Signup Auto-Subscribes to Digest (Contradicts Opt-In Decision)

**What goes wrong:** Current `signup.tsx` lines 46-49 auto-insert a digest subscription for every new user. User decision says digest is opt-in.
**Why it happens:** Phase 3 implemented auto-enrollment before the opt-in decision was made.
**How to avoid:** Remove the auto-subscribe code from `signup.tsx`. Offer digest opt-in only in onboarding wizard and settings page.
**Warning signs:** New users immediately see a "digest" subscription in settings they didn't ask for.

### Pitfall 3: Nominatim Rate Limiting in Pipeline

**What goes wrong:** Pipeline processes many agenda items at once. If geocoding each one synchronously via Nominatim, it takes minutes and may get throttled/blocked.
**Why it happens:** Nominatim enforces 1 req/sec policy.
**How to avoid:** Use the existing pattern from `geocode_addresses.py` — batch with 1.1s delay between requests. Cache results. Only geocode items with `related_address IS NOT NULL AND geo IS NULL` (incremental).
**Warning signs:** Nominatim returns 429 errors; pipeline hangs or takes extremely long.

### Pitfall 4: Cosine Similarity Threshold Too Strict or Too Loose

**What goes wrong:** If threshold is too high (>0.7), almost nothing matches ("housing" won't match "affordable residential"). If too low (<0.3), everything matches and alerts are noisy.
**Why it happens:** `text-embedding-3-small` at 384 dims has specific similarity distributions that differ from larger models.
**How to avoid:** Start with 0.45 threshold. Log matches in dev to tune. Consider exposing as a configurable constant, not a hardcoded value in the RPC.
**Warning signs:** Users get zero keyword matches (too strict) or get alerted for every meeting (too loose).

### Pitfall 5: Missing Geo Data on Agenda Items

**What goes wrong:** Only 1,553/12,200 agenda items have `geo` data. Neighbourhood subscriptions won't match the 87% of items without coordinates.
**Why it happens:** Geocoding has only been run once as a standalone script, and many `related_address` values aren't geocodable addresses (they're descriptions like "Various Locations").
**How to avoid:** Accept that geo matching is best-effort. Items without geo data simply won't trigger neighbourhood alerts. Document this — users should also subscribe to specific matters/topics as a fallback. Don't try to geocode non-address strings.
**Warning signs:** User subscribes to neighbourhood but never gets alerts despite relevant items existing.

### Pitfall 6: Onboarding Redirect Loop

**What goes wrong:** User completes onboarding but something fails (no subscriptions saved). Root loader keeps redirecting to /onboarding.
**Why it happens:** Detection logic based on "has subscriptions" is fragile — user might skip all steps.
**How to avoid:** Use a dedicated `onboarding_completed` boolean on `user_profiles`. Set it at the end of the wizard regardless of what was selected. Check this flag, not subscription presence.
**Warning signs:** User cannot reach home page after signup; stuck in redirect loop.

### Pitfall 7: Edge Function Timeout on Large Subscriber Sets

**What goes wrong:** `send-alerts` Edge Function iterates subscribers sequentially. With many subscribers + Resend API calls, it could timeout (Supabase Edge Functions have a 150s limit on Pro plan).
**Why it happens:** Current implementation does one Resend API call per unique email sequentially.
**How to avoid:** Keep sequential for now (subscriber count is small for View Royal). If scaling becomes an issue, batch Resend calls or use Resend batch API. Monitor execution time in logs.
**Warning signs:** Edge Function returns 504/timeout; some subscribers don't get emails.

## Code Examples

### Existing: Subscribe Button Usage (Already Working)
```tsx
// From matter-detail.tsx line 126
<SubscribeButton type="matter" targetId={matter.id} />

// From person-profile.tsx line 262
{person.is_councillor && <SubscribeButton type="person" targetId={person.id} />}
```

### Existing: Subscription Service Functions
```typescript
// From subscriptions.ts — addSubscription already accepts topic_id, neighborhood, proximity_radius_m
const sub = await addSubscription(supabase, userId, "topic", {
  topic_id: 5,        // predefined category
});

const sub = await addSubscription(supabase, userId, "topic", {
  // keyword subscription — needs new column
});

const sub = await addSubscription(supabase, userId, "neighborhood", {
  neighborhood: "Thetis Heights",
  proximity_radius_m: 1000,
});
```

### Existing: Geocoding Pattern (from geocode_addresses.py)
```python
# Nominatim geocoding with View Royal bounding box bias
def geocode(address: str) -> tuple[float, float] | None:
    params = {
        "q": f"{address}, View Royal, BC, Canada",
        "format": "json",
        "limit": 1,
        "viewbox": "-123.55,48.42,-123.40,48.48",
        "bounded": 1,
    }
    headers = {"User-Agent": "ViewRoyal.ai/1.0 (civic platform)"}
    resp = requests.get("https://nominatim.openstreetmap.org/search",
                        params=params, headers=headers)
    results = resp.json()
    if not results:
        return None
    return float(results[0]["lat"]), float(results[0]["lon"])
```

### Existing: find_meeting_subscribers Neighbourhood Branch
```sql
-- Already in the RPC — matches agenda items near user's location
SELECT DISTINCT
    s.user_id, s.id AS subscription_id,
    s.type AS subscription_type,
    COALESCE(up.notification_email, au.email) AS notification_email
FROM subscriptions s
JOIN user_profiles up ON up.id = s.user_id
JOIN auth.users au ON au.id = s.user_id
JOIN agenda_items ai ON ai.meeting_id = target_meeting_id
WHERE s.type = 'neighborhood'
  AND s.is_active = true
  AND up.location IS NOT NULL
  AND ai.geo IS NOT NULL
  AND ST_DWithin(ai.geo, up.location, s.proximity_radius_m);
```

### Existing: Embedding Generation (from embeddings.server.ts)
```typescript
// Reuse for keyword embedding at subscription time
import { generateQueryEmbedding } from "../lib/embeddings.server";

const embedding = await generateQueryEmbedding("housing development");
// Returns: number[384] or null
```

### New: Topic Subscription with Keyword Embedding
```typescript
// Service layer addition for keyword subscriptions
export async function addKeywordSubscription(
  supabase: SupabaseClient,
  userId: string,
  keyword: string,
  embedding: number[],
): Promise<Subscription> {
  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      user_id: userId,
      type: "topic",
      keyword,
      keyword_embedding: embedding,  // halfvec(384)
    })
    .select()
    .single();

  if (error) throw error;
  return data as Subscription;
}
```

### New: Onboarding Detection in Root Loader
```typescript
// In root.tsx loader — redirect new users to onboarding
if (user) {
  const profile = await getUserProfile(supabase, user.id);
  if (profile && !profile.onboarding_completed) {
    throw redirect("/onboarding");
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Weekly digest on fixed schedule | Post-meeting digest (meeting-aligned) | Phase 5 decision | Digest fires after each meeting, not on calendar schedule |
| Auto-subscribe digest on signup | Opt-in digest via onboarding | Phase 5 decision | Must remove auto-subscribe from `signup.tsx` |
| Standalone geocoding script | Pipeline-integrated geocoding | Phase 5 requirement | `ingester.py` will geocode `related_address` at ingestion time |
| Text-based keyword matching | Semantic embedding similarity | Phase 5 decision | Uses existing pgvector + OpenAI infrastructure |

**Deprecated/outdated:**
- `signup.tsx` auto-digest subscription (lines 46-49): Must be removed per opt-in decision
- `digest_frequency` enum values `each_meeting` / `weekly`: The "weekly" option is being replaced by meeting-aligned triggers. The enum may need updating or the UI should only show relevant options.

## Data Coverage Analysis

Critical data for Phase 5 features:

| Table | Total Rows | With `geo` | With `embedding` | With `related_address` | Notes |
|-------|-----------|-----------|-----------------|----------------------|-------|
| `agenda_items` | 12,200 | 1,553 (12.7%) | 12,183 (99.9%) | 12,196 (99.97%) | Good embedding coverage for semantic matching. Low geo coverage means many items won't trigger neighbourhood alerts. |
| `matters` | 1,727 | 565 (32.7%) | - | - | Geocoded via backfill from agenda_items |
| `topics` | 0 | - | - | - | EMPTY — must be seeded |
| `user_profiles` | exists | 0 with `location` | - | - | No users have geocoded addresses yet |

**Matter categories (clean, 8 values):**
Administration, Bylaw, Development, Environment, Finance, General, Public Safety, Transportation

**Agenda item categories:** 400+ inconsistent values — NOT suitable for subscription matching. Use matter categories only.

## Database Schema Extensions Needed

```sql
-- 1. Seed topics table from matter categories
INSERT INTO topics (name, description) VALUES
  ('Administration', 'Administrative matters, council procedures, appointments'),
  ('Bylaw', 'Bylaw readings, amendments, enforcement'),
  ('Development', 'Land use, rezoning, development permits, subdivisions'),
  ('Environment', 'Environmental protection, parks, trails, conservation'),
  ('Finance', 'Budget, taxation, grants, financial planning'),
  ('General', 'General business, correspondence, presentations'),
  ('Public Safety', 'Policing, fire, emergency management, public safety'),
  ('Transportation', 'Roads, transit, cycling, pedestrian infrastructure');

-- 2. Add keyword columns to subscriptions
ALTER TABLE subscriptions ADD COLUMN keyword text;
ALTER TABLE subscriptions ADD COLUMN keyword_embedding halfvec(384);
CREATE INDEX idx_subscriptions_keyword_embedding
  ON subscriptions USING hnsw (keyword_embedding halfvec_cosine_ops);

-- 3. Add onboarding flag to user_profiles
ALTER TABLE user_profiles ADD COLUMN onboarding_completed boolean DEFAULT false;
```

## Open Questions

1. **Cosine similarity threshold for keyword matching**
   - What we know: `text-embedding-3-small` at 384 dims; 0.45 is a commonly used threshold
   - What's unclear: Optimal threshold for civic domain (matter titles, agenda summaries)
   - Recommendation: Start at 0.45, log matches during testing, adjust based on precision/recall. Store as a constant in the RPC, not as user-configurable.

2. **Pre-meeting alert trigger timing**
   - What we know: User wants pre-meeting alerts with agenda items + attending info. Meetings have `meeting_date` in the database.
   - What's unclear: How far in advance to send (24h? 48h?). How to detect "meeting has published agenda" vs "meeting date exists but no agenda yet".
   - Recommendation: Send 24h before `meeting_date` when `has_agenda = true`. Use pg_cron to check daily for meetings in the next 24-48h window. Skip meetings without published agenda.

3. **Default neighbourhood radius**
   - What we know: `proximity_radius_m` defaults to 1000 (1km) in subscriptions table. View Royal is ~14.5 km2 total area.
   - What's unclear: Whether 1km is appropriate for a town this size (the whole town is roughly 5km across).
   - Recommendation: Default to 1000m (1km) which covers a walkable neighbourhood. Let users adjust in settings. For neighbourhood-name subscriptions (not address), use a larger default (2000m) centered on the neighbourhood centroid.

4. **How to handle the `digest_frequency` enum change**
   - What we know: Current enum has `each_meeting` and `weekly`. User decision says post-meeting digest (meeting-aligned), removing the weekly concept.
   - What's unclear: Whether to drop the `weekly` value or leave it and just not use it.
   - Recommendation: Keep the enum as-is (dropping enum values in Postgres is complex). The UI should only show the meeting-aligned option. Treat any existing `weekly` subscribers as `each_meeting`.

## Sources

### Primary (HIGH confidence)
- **Supabase database direct queries** — Verified all table schemas, column types, enum values, RPC source code, row counts, and data coverage via `execute_sql`
- **Codebase file reads** — Verified all existing components, services, routes, types, and Edge Function code via Read tool
- **PostGIS documentation** — `ST_DWithin`, `ST_Distance`, `ST_MakePoint` usage verified from existing working code in `find_matters_near` and `find_meeting_subscribers` RPCs
- **pgvector documentation** — `<=>` cosine distance operator and HNSW indexes verified from existing working code in RAG system

### Secondary (MEDIUM confidence)
- **Nominatim API** — Usage pattern verified from existing `geocode_addresses.py` script in project. Rate limiting policy (1 req/sec) is well-documented in Nominatim's usage policy.
- **OpenAI text-embedding-3-small** — Model and dimensions verified from existing `embeddings.server.ts` and `embed.py` in project.

### Tertiary (LOW confidence)
- **Cosine similarity threshold (0.45)** — Based on general embedding matching experience. Needs validation with actual civic domain data. Flagged for tuning during implementation.
- **pg_cron + pg_net for pre-meeting scheduling** — Extensions are available in Supabase but not currently enabled in this project. Verified availability but not tested.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries already in use; verified from working code
- Architecture: HIGH — Extending existing patterns (RPCs, Edge Function, service layer); no new architectural concepts
- Pitfalls: HIGH — Based on actual data analysis (empty topics table, geo coverage gaps, auto-subscribe code) not speculation
- Data coverage: HIGH — Exact row counts and column presence verified via SQL queries
- Semantic matching threshold: LOW — Needs empirical validation; theoretical starting point only

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable domain; no fast-moving dependencies)
