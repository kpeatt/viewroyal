# Architecture Research: Subscriptions, Notifications & Content Feeds

**Question:** How do subscription/notification systems and content feed aggregations integrate with an existing Supabase + Cloudflare Workers architecture?

**Date:** 2026-02-16

---

## 1. Current System Architecture

### Component Map

```
                                   Internet
                                      |
                              Cloudflare Workers
                              (viewroyal-intelligence)
                                      |
                         React Router 7 SSR (app.ts)
                         ┌────────────────────────┐
                         │  root.tsx (auth loader) │
                         │         |               │
                         │   routes/*.tsx           │
                         │   (loaders + actions)    │
                         │         |               │
                         │  services/*.ts           │
                         │   (typed Supabase queries)│
                         └────────┬───────────────┘
                                  |
                    ┌─────────────┼─────────────────┐
                    |             |                  |
            Supabase Postgres  OpenAI API      Gemini API
            (pgvector, RLS)   (embeddings)   (RAG synthesis)
                    |
                    |
       Python ETL Pipeline (apps/pipeline/)
       ┌──────────────────────────────────┐
       │ Phase 1: Scrape (CivicWeb PDFs)  │
       │ Phase 2: Download Audio (Vimeo)  │
       │ Phase 3: Diarize (MLX, local)    │
       │ Phase 4: AI Refine + Ingest      │
       │ Phase 5: Embed (fastembed)       │
       └──────────────────────────────────┘
```

### Key Boundaries

| Component | Runtime | State Boundary | Auth Model |
|-----------|---------|----------------|------------|
| Web App | Cloudflare Workers (V8 isolate) | Stateless; Supabase is sole state store | Supabase Auth via SSR cookies |
| Root Loader | CF Worker request | Fetches `user` from Supabase Auth per-request | `createSupabaseServerClient(request)` |
| Services Layer | CF Worker request | Pure functions: `(SupabaseClient, params) -> data` | Client injected by caller |
| RAG Agent | CF Worker request | Stateless orchestrator loop (Gemini) | Uses admin Supabase client |
| Python Pipeline | Local macOS (Apple Silicon) | File archive + Supabase DB writes | Service role key |
| Vimeo Proxy | Separate CF Worker | Stateless Puppeteer proxy | API key auth |
| Supabase Edge Functions | Deno runtime on Supabase infra | Direct DB access via service role | Bearer token (service role) |

### Data Flow (Current)

```
CivicWeb RSS → Scraper → Local Archive → Parser → AI Refiner → Supabase DB
                                                        ↓
Vimeo → Audio Download → MLX Diarizer → Transcript Segments → Supabase DB
                                                        ↓
                                              Embeddings (fastembed local) → pgvector
                                                        ↓
Web App ← SSR Loaders ← Supabase PostgREST API ← pgvector cosine search
```

### Supabase Client Usage Pattern

Three clients serve distinct purposes (defined in `apps/web/app/lib/supabase.server.ts` and `apps/web/app/lib/supabase.ts`):

1. **Browser client** (`supabase.ts`): `createBrowserClient` -- lazy-init, only in browser. Used by React components needing real-time or client-side queries.
2. **Server client with auth** (`supabase.server.ts`): `createSupabaseServerClient(request)` -- respects RLS, handles auth cookies. Used in loaders/actions.
3. **Admin client** (`supabase.server.ts`): `getSupabaseAdminClient()` -- bypasses RLS. Cached singleton. Used by RAG agent and admin operations.

Services always receive a `SupabaseClient` as their first parameter, letting the caller control the auth context. This is the correct pattern and should be maintained.

---

## 2. Open PR Analysis

### PR Inventory

| Branch | Scope | Files Changed | Key Touchpoints |
|--------|-------|---------------|-----------------|
| `phase3c/embedding-migration` | Embedding model swap: `vector(768)` to `halfvec(384)`, adds `key_statements` table | ~25 files | `bootstrap.sql`, `embeddings.server.ts`, `vectorSearch.ts`, `rag.server.ts`, `embed.py` |
| `fix/key-statement-prompts` | Improves key statement extraction prompts in pipeline | 4 files | `ai_refiner.py`, `ingester.py` |
| `phase4/municipality-context-layer` | Multi-tenancy: `municipalities` table, root loader fetches municipality, meta tags dynamic | ~47 files | `root.tsx`, `bootstrap.sql`, all route loaders, `municipality.ts` service, `rag.server.ts` |
| `claude/add-geolocation-proximity-5lwv4` | Subscriptions, user profiles, PostGIS, Edge Function for alerts, pipeline restructure | ~103 files | New tables (`user_profiles`, `subscriptions`, `alert_log`), new routes (`settings`, `signup`, `api.subscribe`, `api.digest`), Edge Function `send-alerts`, **major pipeline directory restructure** |

### Conflict Risk Matrix

```
                    embedding   key-stmts   municipality   geolocation
embedding               -        LOW         HIGH           HIGH
key-stmts             LOW          -         LOW            HIGH
municipality          HIGH       LOW           -            CRITICAL
geolocation           HIGH       HIGH       CRITICAL          -
```

**Detail on each conflict zone:**

1. **Embedding <-> Municipality (HIGH):** Both modify `bootstrap.sql` extensively. Both change `vector(768)` to `halfvec(384)`. Both add `key_statements` table. Both modify `rag.server.ts` and `vectorSearch.ts`. The bootstrap.sql changes are nearly identical since municipality branch includes all embedding changes. **Resolution: Merge embedding-migration first, then rebase municipality-context-layer on top.**

2. **Municipality <-> Geolocation (CRITICAL):** Both modify `bootstrap.sql` (municipality adds `municipalities` table and `key_statements`; geolocation adds PostGIS, `user_profiles`, `subscriptions`, `alert_log`). Both modify `navbar.tsx`, `login.tsx`, `person-profile.tsx`. Geolocation branch also **restructures the entire pipeline directory** (`apps/pipeline/` to `src/`), which will conflict with any pipeline changes on other branches. **Resolution: Merge municipality first, then manually rebase geolocation. The geolocation branch's pipeline restructure must be evaluated separately -- it may need to be split out.**

3. **Key-stmts <-> Geolocation (HIGH):** Key-stmts modifies `apps/pipeline/pipeline/ingestion/ai_refiner.py` and `ingester.py`. Geolocation moves these files to `src/pipeline/`. These will auto-conflict. **Resolution: Merge key-stmts before geolocation.**

4. **Embedding <-> Key-stmts (LOW):** Minimal overlap. Embedding changes `embed.py`; key-stmts changes `ai_refiner.py` and `ingester.py`. Different files.

### Recommended Merge Order

```
1. phase3c/embedding-migration      (foundation: schema + embedding dimension change)
     ↓
2. fix/key-statement-prompts         (small, pipeline-only, no web changes)
     ↓
3. phase4/municipality-context-layer (rebase onto 1+2; adds multi-tenancy context)
     ↓
4. claude/add-geolocation-proximity  (rebase onto 1+2+3; largest, most risky)
```

**Critical warnings for step 4:**
- The geolocation branch restructures `apps/pipeline/` to `src/`. This is a massive directory move that will conflict with anything touching pipeline files. Consider **extracting the pipeline restructure as a separate PR** and merging it independently, or abandoning it and keeping the `apps/pipeline/` structure.
- The geolocation branch deletes `.planning/` files that other branches also delete. This will produce merge conflicts but they are trivially resolvable (just accept the deletion).
- The `sql/bootstrap.sql` in geolocation branch is based on the OLD schema (pre-embedding-migration). It removes 30 lines and adds `002_subscriptions_and_geolocation.sql` as a separate migration file. After rebasing, the 002 migration will need updating to reference `halfvec(384)` columns instead of `vector(768)`.

---

## 3. Subscription & Notification Architecture

### Existing Design (from geolocation branch)

The geolocation branch already implements a complete subscription system. Here is how it is designed:

#### Schema (from `sql/002_subscriptions_and_geolocation.sql`)

```
user_profiles
  ├── id (uuid, FK auth.users)
  ├── display_name, address, neighborhood
  ├── location (geography Point, PostGIS)
  ├── notification_email
  ├── digest_frequency (each_meeting | weekly)
  └── digest_enabled

subscriptions
  ├── id (bigint PK)
  ├── user_id (FK user_profiles)
  ├── type (matter | topic | person | neighborhood | digest)
  ├── matter_id / topic_id / person_id / neighborhood (polymorphic)
  ├── proximity_radius_m (for neighborhood type)
  └── is_active

alert_log
  ├── user_id, subscription_id, meeting_id
  ├── alert_type, email_sent, sent_at, error_message
  └── (deduplication via user_id + meeting_id + alert_type index)
```

#### Notification Flow

```
Pipeline completes meeting ingestion
          ↓
Pipeline calls Supabase Edge Function: POST /send-alerts { meeting_id }
          ↓
Edge Function (supabase/functions/send-alerts/index.ts):
  1. build_meeting_digest(meeting_id) — RPC builds JSON digest payload
  2. find_meeting_subscribers(meeting_id) — RPC matches subscriptions
  3. Deduplicate by email address
  4. Check alert_log for already-sent (dedup)
  5. Send via Resend API
  6. Log to alert_log table
          ↓
Email delivered to subscriber
```

#### Web App Integration (from branch)

- `apps/web/app/routes/settings.tsx` — User profile + subscription management page
- `apps/web/app/routes/signup.tsx` — User registration (creates user_profile)
- `apps/web/app/routes/api.subscribe.tsx` — REST API for subscription CRUD
- `apps/web/app/routes/api.digest.tsx` — Endpoint to preview/trigger digest
- `apps/web/app/components/subscribe-button.tsx` — Reusable subscribe toggle
- `apps/web/app/services/subscriptions.ts` — Typed service functions

#### RLS Policies

- `user_profiles`: Users read/write own profile only. Service role has full access.
- `subscriptions`: Users manage own subscriptions only. Service role has full access.
- `alert_log`: Users view own alerts only. Service role has full access.
- All core data tables (meetings, motions, etc.): Public read-only (unchanged).

### Architectural Decisions & Analysis

**Why Supabase Edge Function for alerts (not Cloudflare Worker)?**

The Edge Function runs on Supabase infrastructure with direct access to the database via the service role key. This is the correct choice because:
1. It needs service role access to query `auth.users` for email addresses (RLS bypass).
2. It is triggered by the Python pipeline after ingestion -- a server-to-server call, not user-initiated.
3. It runs infrequently (after each meeting ingestion), so cold start latency is acceptable.
4. Keeping email delivery close to the database reduces the blast radius of failures.

**Why not a Cloudflare Worker cron?**

The current cron in `wrangler.toml` (`*/5 * * * *`) only pings the Render fallback. Email notifications are event-driven (post-ingestion), not schedule-driven. The pipeline already knows when ingestion completes and can call the Edge Function. A cron-based approach would add unnecessary polling complexity.

**Why Resend for email?**

Resend is a developer-friendly transactional email API. The Edge Function uses it via simple HTTP `fetch()`, which works in Deno. No SMTP complexity. The `FROM_EMAIL` is `alerts@viewroyal.ai`, which requires DNS verification on the viewroyal.ai domain.

### Integration Points After Merge

After all 4 PRs are merged, the notification system connects to the rest of the app as follows:

```
┌────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers (Web App)                 │
│                                                                │
│  root.tsx loader: { user, municipality }                       │
│       ↓                                                        │
│  settings.tsx ──→ subscriptions.ts ──→ Supabase (user RLS)    │
│  signup.tsx   ──→ user_profiles upsert                        │
│  matter-detail.tsx ──→ subscribe-button.tsx (client component) │
│  person-profile.tsx ──→ subscribe-button.tsx                   │
│  api.subscribe.tsx ──→ subscriptions.ts CRUD                  │
│                                                                │
│  navbar.tsx ──→ shows Settings link when user is logged in    │
└────────────────────────────────────────────────────────────────┘
         ↕ (PostgREST + Auth)
┌────────────────────────────────────────────────────────────────┐
│                    Supabase Postgres                            │
│                                                                │
│  user_profiles ←→ auth.users (FK)                             │
│  subscriptions ←→ user_profiles (FK)                          │
│  alert_log ←→ subscriptions, meetings (FK)                    │
│                                                                │
│  RPCs: build_meeting_digest(), find_meeting_subscribers()      │
│  RPCs: find_matters_near() (PostGIS proximity)                │
└────────────────────────────────────────────────────────────────┘
         ↕ (Service role)
┌────────────────────────────────────────────────────────────────┐
│              Supabase Edge Function: send-alerts               │
│                                                                │
│  Called by: Python pipeline (POST with service role bearer)    │
│  Does: build digest → find subscribers → send Resend emails   │
│  Logs: alert_log for deduplication                            │
└────────────────────────────────────────────────────────────────┘
         ↑ (HTTP POST after ingestion)
┌────────────────────────────────────────────────────────────────┐
│                Python ETL Pipeline                              │
│                                                                │
│  orchestrator.py → ingester.py → [trigger send-alerts]        │
│  (Phase 4 completion triggers notification)                    │
└────────────────────────────────────────────────────────────────┘
```

---

## 4. Home Page Content Feed Architecture

### Current Home Page Data Loading

The home page (`apps/web/app/routes/home.tsx`) calls `getHomeData()` from `apps/web/app/services/site.ts`. This function runs on the Cloudflare Worker during SSR and makes the following parallel queries:

```
getHomeData(supabase):
  Batch 1 (parallel):
    ├── latestMeeting (meetings where has_transcript=true, limit 1)
    ├── upcomingMeetings (meeting_date > today, limit 4)
    ├── recentMeetings (meeting_date <= today, limit 5)
    ├── councilMembers (memberships where org=Council, active)
    └── publicNotices (external RSS fetch to viewroyal.ca, 3s timeout)

  Batch 2 (sequential, depends on latestMeeting.id):
    ├── motions for latest meeting (non-null result)
    └── agenda item count for latest meeting
```

Returns: `{ latestMeeting, latestMeetingStats, keyDecisions, upcomingMeetings, recentMeetings, councilMembers, publicNotices }`

### Adding "Active Matters" to the Home Page

An "Active Matters" section would show matters currently before council. This fits naturally into the existing pattern.

**Suggested data query** (add to `getHomeData` Batch 1):

```typescript
// Active matters with recent activity (last 90 days)
supabase
  .from("matters")
  .select("id, title, identifier, category, status, last_seen, first_seen")
  .eq("status", "Active")
  .order("last_seen", { ascending: false, nullsFirst: false })
  .limit(8)
```

**Why in Batch 1:** This query has no dependencies on other results, so it can run in the existing `Promise.all()` block alongside the other parallel queries.

**Component boundary:** Add an `ActiveMattersCard` or similar component that receives the matters array and renders them. The home page already follows the pattern of section components with heading + card list.

**After municipality-context-layer merges:** The `municipalities` table will exist. If matters gain a `municipality_id` column in the future, the query should filter by it. For now, there is only one municipality, so no filter is needed.

**After geolocation merges:** Matters will have a `geo` (PostGIS geography) column. The home page could optionally show a mini-map of active matters, using the same `matters-map.tsx` component that already exists.

### Performance Considerations

The home page SSR currently makes 5 parallel queries in Batch 1 + 2 sequential queries in Batch 2. Adding one more query to Batch 1 is negligible. The critical path is the RSS fetch with its 3-second timeout.

If more sections are added (e.g., recent key statements, trending topics), consider:
1. **Supabase materialized views or RPC functions** to pre-aggregate complex data, similar to `build_meeting_digest()`.
2. **Cloudflare KV caching** for data that changes infrequently (council members, public notices). The Worker already has `wrangler.toml` configured; KV bindings could be added.
3. **Streaming SSR** with React Router 7's `defer()` pattern for slow queries, though this adds complexity.

---

## 5. Component Boundaries Summary

### Boundary: Web App <-> Supabase

- **Protocol:** PostgREST (Supabase JS client) over HTTPS
- **Auth flow:** SSR cookies parsed by `createSupabaseServerClient(request)`, which creates a per-request Supabase client respecting RLS
- **Data contracts:** TypeScript interfaces in `apps/web/app/lib/types.ts` define the shape, but they can be ahead of the actual schema (see "Database Gotchas" in CLAUDE.md)
- **Service layer pattern:** Every route loader calls a service function, passing the Supabase client. Services never instantiate their own client.

### Boundary: Web App <-> External APIs

- **Gemini API:** Called by `rag.server.ts` for RAG Q&A synthesis. Uses `process.env.GEMINI_API_KEY` (Cloudflare Worker secret).
- **OpenAI API:** Called by `embeddings.server.ts` for query-time embedding generation. Uses `process.env.OPENAI_API_KEY`.
- **View Royal RSS:** Called by `site.ts/getPublicNotices()` with 3-second timeout. Fails gracefully to empty array.
- **Vimeo Proxy:** Separate Cloudflare Worker. Called by `api.vimeo-url.ts` to resolve video URLs.

### Boundary: Pipeline <-> Supabase

- **Protocol:** Supabase Python client with service role key
- **Direction:** Write-only from pipeline perspective (bulk upserts of meetings, agenda items, motions, transcripts, embeddings)
- **Trigger for notifications:** After Phase 4 ingestion completes for a meeting, the pipeline calls the Edge Function via HTTP POST

### Boundary: Edge Function <-> Supabase

- **Runtime:** Deno (Supabase-hosted)
- **Auth:** Service role key (full DB access, bypasses RLS)
- **Dependencies:** Resend API for email delivery
- **Invocation:** HTTP POST from pipeline (or future cron for weekly digests)

### Boundary: Edge Function <-> Email (Resend)

- **Protocol:** HTTPS (simple fetch to `api.resend.com/emails`)
- **Rate limits:** Resend free tier: 100 emails/day, 3000/month. Sufficient for early adoption.
- **DNS requirement:** Must verify `viewroyal.ai` domain with Resend for `alerts@viewroyal.ai` sender.

---

## 6. Data Flow Diagrams

### Subscription Data Flow

```
User signs up → auth.users row created
         ↓
User visits /settings → upsertUserProfile() creates user_profiles row
         ↓
User clicks "Follow" on matter/person → api.subscribe.tsx → addSubscription()
         ↓
subscriptions row: { user_id, type: 'matter', matter_id: 42 }
         ↓
[Time passes... pipeline ingests new meeting that discusses matter 42]
         ↓
Pipeline → POST /send-alerts { meeting_id: 99 }
         ↓
Edge Function:
  1. build_meeting_digest(99) → JSON payload with key decisions, attendance
  2. find_meeting_subscribers(99):
     - UNION of: digest subscribers + matter subscribers + person subscribers + proximity subscribers
     - Matches matter_id=42 in agenda_items for meeting 99 → finds our user
  3. Dedup by email, check alert_log
  4. Send email via Resend
  5. Log to alert_log
```

### Home Page Data Flow (After All PRs Merged)

```
Browser requests /
         ↓
Cloudflare Worker: root.tsx loader
  → Promise.all([supabase.auth.getUser(), getMunicipality(supabase)])
  → Returns { user, municipality }
         ↓
home.tsx loader → getHomeData(supabase)
  → Batch 1 (parallel):
     - latestMeeting (has_transcript, limit 1)
     - upcomingMeetings (future, limit 4)
     - recentMeetings (past, limit 5)
     - councilMembers (active, via memberships)
     - publicNotices (RSS fetch, 3s timeout)
     - activeMatters (status=Active, limit 8)   ← NEW
  → Batch 2 (sequential, needs latestMeeting.id):
     - motions for latest meeting
     - agenda item count
  → Returns aggregated object
         ↓
React SSR renders home page sections
         ↓
HTML response to browser
```

---

## 7. Build Order & Dependencies

### Phase 1: Schema Foundation (PRs #1 and #2)

**Merge `phase3c/embedding-migration` then `fix/key-statement-prompts`**

These are prerequisites for everything else:
- Embedding migration changes the vector dimension from 768 to 384 across all tables. Every downstream feature (RAG, search, subscriptions) depends on this being settled.
- Key statement prompts improve pipeline quality but touch few web files.

**Build artifacts:** Updated `bootstrap.sql`, updated `embeddings.server.ts` (OpenAI dimensions: 384), updated `vectorSearch.ts` RPC calls, new `key_statements` table.

### Phase 2: Multi-tenancy Context (PR #3)

**Merge `phase4/municipality-context-layer`**

This adds the `municipalities` table and context layer. Must go before subscriptions because:
- The `documents` table and `key_statements` table already reference `municipalities(id)`.
- The root loader pattern changes (adds `municipality` to root data).
- Route loaders throughout the app change to accept municipality context.
- The geolocation branch should build on top of this foundation.

**Build artifacts:** `municipalities` table, `getMunicipality()` service, updated root loader, municipality-aware meta tags.

### Phase 3: Subscriptions & Notifications (PR #4)

**Merge `claude/add-geolocation-proximity-5lwv4` (with careful rebasing)**

This is the largest and most risky merge. Dependencies:
- Requires `municipalities` table to exist (for `municipality_id` FKs).
- Requires settled embedding dimensions (the `002_subscriptions_and_geolocation.sql` migration adds no embedding columns, so this is a soft dependency).
- The pipeline directory restructure (`apps/pipeline/` to `src/`) is the highest-risk element and should be **evaluated for extraction** into a separate PR.

**Build artifacts:** `user_profiles`, `subscriptions`, `alert_log` tables. PostGIS extension. Edge Function `send-alerts`. New routes and components for subscription management.

### Phase 4: Home Page Active Matters (New Work)

**After all PRs merged, build the active matters section.**

This is new feature work that depends on the merged codebase:
- Requires `matters` table with data (already exists).
- Optionally uses `geo` column from PostGIS (from Phase 3).
- Optionally uses `municipality_id` filtering (from Phase 2).

**Build approach:**
1. Add `getActiveMatters()` to `apps/web/app/services/matters.ts`
2. Add the query to `getHomeData()` Batch 1 in `apps/web/app/services/site.ts`
3. Create an `ActiveMatters` section component
4. Render it in `apps/web/app/routes/home.tsx`

---

## 8. Risk Assessment

### High-Risk Areas

1. **Pipeline directory restructure in geolocation branch**: Moving `apps/pipeline/` to `src/` is a massive rename affecting imports across dozens of files. This will conflict with any pipeline work on other branches. **Recommendation:** Split this out or abandon it. The monorepo already uses `apps/` convention; `src/` breaks the pattern.

2. **PostGIS extension**: Adding PostGIS to Supabase requires it to be available in the Supabase project. It should be enabled via the Supabase dashboard or a migration, not just assumed. Verify PostGIS availability before merging.

3. **Auth requirement for subscriptions**: The current app uses Supabase Auth only for admin access (speaker aliases, admin people). Subscriptions require public user registration. The `signup.tsx` route in the geolocation branch adds this, but it changes the auth model from "admin-only" to "public registration." This has UX and security implications (spam accounts, abuse).

4. **Resend API key**: The Edge Function requires a `RESEND_API_KEY` environment variable. This must be set as a Supabase Edge Function secret. The domain `viewroyal.ai` must be verified with Resend for the `alerts@viewroyal.ai` sender.

5. **Bootstrap.sql as source of truth**: Both the embedding migration and municipality branches modify `bootstrap.sql` as a consolidated schema document. This is a "replace the whole file" approach, not incremental migrations. After merging, ensure the final `bootstrap.sql` is consistent. The geolocation branch separately uses `002_subscriptions_and_geolocation.sql` as an incremental migration, which is a better pattern going forward.

### Medium-Risk Areas

1. **Embedding dimension mismatch**: If the embedding migration runs on the database but the pipeline has not been updated to generate 384-dimensional embeddings, vector search will break. Coordinate the database migration with a pipeline redeployment.

2. **Edge Function deployment**: Supabase Edge Functions are deployed separately from the web app. Ensure the deployment pipeline (if any) handles `supabase/functions/send-alerts/`. The `supabase/` directory is currently mostly empty on main.

3. **RLS policy conflicts**: The geolocation branch adds RLS policies for new tables but also adds service role write policies. Ensure no policy conflicts with existing public-read policies on core tables.
