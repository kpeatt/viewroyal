# Stack Research: Notifications, Subscriptions & Active Matters Feed

> **Research date**: 2026-02-16
> **Scope**: New capabilities for ViewRoyal.ai milestone -- user subscriptions/email alerts, active matters home page feed, multi-tenancy hardening
> **Out of scope**: Existing stack (React Router 7, Tailwind 4, shadcn/ui, Cloudflare Workers, Supabase, Gemini, fastembed, MLX) -- already in production

---

## 1. Email Delivery: Resend

| Attribute | Detail |
|-----------|--------|
| **Package** | `resend` v4.2+ (latest: 4.2.0 on npm) |
| **Confidence** | **High** -- official Cloudflare Workers tutorial, actively maintained, batch API |
| **Install** | `pnpm add resend` in `apps/web` |
| **Secret** | `RESEND_API_KEY` as Cloudflare Worker secret |

### Why Resend

- **First-class Cloudflare Workers support**: Official tutorial in Cloudflare docs, works with `nodejs_compat` flag (already enabled in wrangler.toml). No adapter needed -- standard `fetch`-based SDK.
- **Batch API**: `/emails/batch` endpoint sends up to 100 emails per call with per-recipient personalization. Supports idempotency keys (added 2025). This is critical for digest emails -- one API call per batch instead of N individual calls.
- **React Email integration**: Templates authored as React components, rendered at send time via `react` parameter. Shares the existing React toolchain.
- **Rate limits**: Default 2 req/s on free tier, 10 req/s on Pro. Batch endpoint counts as 1 request for up to 100 emails. For a municipality of View Royal's size (~12,000 population, likely <500 subscribers initially), free tier is more than sufficient.
- **Pricing**: Free tier = 100 emails/day, 3,000/month. Pro = $20/month for 50,000 emails. Weekly digests to 500 subscribers = ~2,000/month = well within free tier.

### What NOT to use

- **Cloudflare Email Service**: Still in private beta as of Feb 2026. No public SDK, no React Email support, no batch API. Not production-ready.
- **SendGrid/Mailgun/SES**: Heavier SDKs, more complex auth, no native Cloudflare tutorial. Overkill for transactional digest volumes.
- **Supabase Edge Functions for email**: Would split the notification logic across two runtimes (Deno + Workers). Keep everything in the Cloudflare Workers runtime for simplicity.

---

## 2. Email Templates: React Email

| Attribute | Detail |
|-----------|--------|
| **Packages** | `@react-email/components` v1.0.7, `react-email` v5.2.8 (dev preview tool) |
| **Confidence** | **High** -- same team as Resend, 920K weekly downloads, Tailwind 4 support |
| **Install** | `pnpm add @react-email/components` in `apps/web` |

### Why React Email

- **Shared component model**: Email templates are `.tsx` files using the same React 19 already in the project. No new templating language to learn.
- **Tailwind 4 support**: React Email 5.0 added Tailwind 4 integration. The project already uses Tailwind 4, so email styling is consistent.
- **Cloudflare Workers compatible**: Templates render to HTML strings at send time via Resend's `react` parameter. No Node.js-only APIs required.
- **Preview tooling**: `react-email` dev server lets you preview templates locally at `localhost:3000` without sending real emails. Add to `apps/web/package.json` scripts as `"email:dev": "email dev"`.

### Template structure

```
apps/web/
  emails/                    # Email templates directory
    weekly-digest.tsx         # Weekly council digest
    matter-update.tsx         # Matter status change alert
    new-meeting-alert.tsx     # Upcoming meeting notification
    components/               # Shared email layout components
      header.tsx
      footer.tsx
```

---

## 3. Notification Orchestration: Cloudflare Cron Triggers + Queues

### 3a. Cron Triggers (already partially configured)

| Attribute | Detail |
|-----------|--------|
| **Configuration** | `wrangler.toml` `[triggers]` section |
| **Confidence** | **High** -- already using cron in the project for Render health pings |
| **Current config** | `*/5 * * * *` (every 5 min, used for Render keepalive) |

The existing `scheduled()` handler in `apps/web/workers/app.ts` already handles cron events. Add additional cron expressions for digest scheduling:

```toml
[triggers]
crons = ["*/5 * * * *", "0 9 * * 1"]  # Keep existing + Monday 9am PT digest
```

The `scheduled()` handler will dispatch based on `event.cron` to differentiate between keepalive pings and digest sends.

### 3b. Cloudflare Queues (for email delivery reliability)

| Attribute | Detail |
|-----------|--------|
| **Pricing** | Free tier: 10,000 ops/day (new as of Feb 2026). Paid: first 1M ops free, then $0.40/M ops |
| **Confidence** | **Medium-High** -- well-documented, but adds operational complexity |
| **Wrangler config** | Producer + Consumer bindings in `wrangler.toml` |

### Why Queues (and when to add them)

Queues add reliability guarantees: if Resend is temporarily down, messages are retried automatically. However, for the initial launch with <500 subscribers and weekly digests:

**Phase 1 (MVP -- skip Queues)**: Cron trigger directly calls Resend batch API. If the batch fails, log the error. Weekly digests are not time-critical -- a retry on the next cron cycle is acceptable. This keeps the architecture simple.

**Phase 2 (scale trigger: >1000 subscribers OR daily digests)**: Add Queues between cron and Resend. Cron produces subscriber batches to the queue, consumer Worker sends via Resend with automatic retries.

```toml
# Phase 2 wrangler.toml addition
[[queues.producers]]
queue = "email-digest"
binding = "DIGEST_QUEUE"

[[queues.consumers]]
queue = "email-digest"
max_batch_size = 10
max_batch_timeout = 5
```

### What NOT to use

- **Cloudflare Workflows**: Durable execution engine (GA June 2025). Designed for multi-step, long-running processes. Overkill for "fetch subscribers, render template, call Resend" which completes in <5 seconds. Workflows add SQLite Durable Object overhead per execution. Reserve for future complex pipelines (e.g., multi-step approval workflows).
- **Supabase pg_cron + pg_net**: Could trigger emails from database level, but this splits notification logic across Postgres and Workers. Harder to debug, harder to test, harder to template. Keep email sending in the application layer.
- **Supabase Database Webhooks**: At-most-once delivery, no retry guarantees. Fine for real-time UI updates but not for email delivery where missed notifications erode user trust.

---

## 4. Subscription Data Model: Supabase Tables

| Attribute | Detail |
|-----------|--------|
| **Approach** | New tables in existing Supabase Postgres instance |
| **Auth** | Supabase Auth (already configured -- login.tsx exists) |
| **Confidence** | **High** -- extends existing schema pattern, uses existing RLS infrastructure |

### Schema Design

Subscriptions live in Supabase alongside all other data. No separate storage (D1/KV) needed -- the data is relational (user -> subscriptions -> matters/topics) and needs JOIN capabilities for digest generation.

```sql
-- User notification preferences
CREATE TABLE notification_preferences (
    id bigint generated by default as identity primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    municipality_id bigint references municipalities(id) default 1,
    digest_frequency text check (digest_frequency in ('daily', 'weekly', 'none')) default 'weekly',
    email_enabled boolean default true,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null,
    unique(user_id, municipality_id)
);

-- Matter-level subscriptions ("follow this topic")
CREATE TABLE matter_subscriptions (
    id bigint generated by default as identity primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    matter_id bigint references matters(id) on delete cascade not null,
    municipality_id bigint references municipalities(id) default 1,
    notify_on_update boolean default true,
    notify_on_vote boolean default true,
    created_at timestamptz default now() not null,
    unique(user_id, matter_id)
);

-- Topic/category subscriptions ("follow all zoning matters")
CREATE TABLE topic_subscriptions (
    id bigint generated by default as identity primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    category text not null,  -- matches agenda_items.category
    municipality_id bigint references municipalities(id) default 1,
    created_at timestamptz default now() not null,
    unique(user_id, category, municipality_id)
);

-- Notification log (audit trail + deduplication)
CREATE TABLE notification_log (
    id bigint generated by default as identity primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    notification_type text not null,  -- 'digest', 'matter_update', 'new_meeting'
    resend_email_id text,             -- Resend API response ID
    metadata jsonb,                   -- { matter_ids: [...], meeting_id: ... }
    sent_at timestamptz default now() not null
);
```

### RLS Policies

```sql
-- Users can only read/write their own preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own preferences" ON notification_preferences
    FOR ALL USING (auth.uid() = user_id);

ALTER TABLE matter_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own matter subscriptions" ON matter_subscriptions
    FOR ALL USING (auth.uid() = user_id);

ALTER TABLE topic_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own topic subscriptions" ON topic_subscriptions
    FOR ALL USING (auth.uid() = user_id);

-- Service role reads all subscriptions for digest generation
-- (already handled by admin client bypassing RLS)

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notification log" ON notification_log
    FOR SELECT USING (auth.uid() = user_id);
```

### Why NOT separate storage

- **Not Cloudflare KV**: Subscriptions are relational (user -> matter, user -> category). KV is key-value with no JOIN support. Would require denormalization and manual consistency management.
- **Not Cloudflare D1**: Would split data across two databases. Digest generation needs to JOIN subscriptions with matters, agenda_items, and motions -- all in Supabase. Cross-database JOINs are impossible.
- **Not a separate Supabase project**: Same tenancy model, same auth system, same RLS patterns. Adding tables to the existing project is the simplest path.

---

## 5. Active Matters Feed: Query Pattern

| Attribute | Detail |
|-----------|--------|
| **Approach** | New Supabase query function + home page section |
| **Confidence** | **High** -- uses existing `matters` table, existing service pattern |
| **New dependency** | None -- pure query logic |

### Query Design

"Active matters" = matters with `status = 'Active'` that have had agenda_item activity in the last 90 days, ordered by recency. The `matters` table already has `last_seen`, `status`, and `first_seen` columns.

```typescript
// apps/web/app/services/matters.ts -- new function
export async function getActiveMatters(supabase: SupabaseClient, limit = 6) {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data, error } = await supabase
    .from("matters")
    .select(`
      id, title, identifier, category, status,
      first_seen, last_seen,
      agenda_items(
        id, title, meeting_id, is_controversial,
        meetings(id, meeting_date)
      )
    `)
    .eq("status", "Active")
    .gte("last_seen", ninetyDaysAgo.toISOString().split("T")[0])
    .order("last_seen", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}
```

This follows the exact same patterns as the existing `getMatters()` and `getHomeData()` functions in the codebase.

---

## 6. Multi-Tenancy: Municipality Context Layer

| Attribute | Detail |
|-----------|--------|
| **Approach** | `municipality_id` foreign key on relevant tables + RLS policies |
| **Existing work** | `documents` table already has `municipality_id` column; `municipalities` table referenced in bootstrap.sql |
| **Confidence** | **High** for shared-database approach; the schema already points this direction |

### Architecture Decision: Shared Database with Row-Level Isolation

The existing `bootstrap.sql` already references a `municipalities` table (the `documents` table has `municipality_id bigint REFERENCES municipalities(id) DEFAULT 1`). The multi-tenancy pattern is:

1. **Add `municipality_id`** to tables that need tenant isolation: `meetings`, `agenda_items`, `matters`, `motions`, `transcript_segments`, `people`, `organizations`. Default to `1` (View Royal) for backward compatibility.
2. **RLS policies** filter by municipality context. For public read access, all municipalities are visible (civic transparency). For write access, service role handles pipeline ingestion per-municipality.
3. **URL routing**: `viewroyal.ai` vs future `saanich.ai` resolved at the edge via hostname -> municipality_id lookup.

### What NOT to do

- **Separate Supabase projects per municipality**: Would prevent cross-municipality search and comparison features. Makes the embedding/vector search fragmented. Increases operational overhead linearly.
- **Schema-per-tenant**: PostgreSQL schema isolation is overkill when all municipalities share the same table structure. Adds migration complexity.
- **Separate Workers per municipality**: All municipalities share the same Worker code. Hostname-based routing resolves the tenant context at request time.

### Municipality Resolution Pattern

```typescript
// apps/web/app/lib/municipality.server.ts
const MUNICIPALITY_MAP: Record<string, number> = {
  "viewroyal.ai": 1,
  "www.viewroyal.ai": 1,
  // Future: "saanich.ai": 2, "esquimalt.ai": 3
};

export function getMunicipalityId(request: Request): number {
  const hostname = new URL(request.url).hostname;
  return MUNICIPALITY_MAP[hostname] ?? 1;
}
```

---

## 7. Auth Enhancement: Public Subscriptions

| Attribute | Detail |
|-----------|--------|
| **Current state** | Admin-only login via `login.tsx` with email/password |
| **Needed** | Public user signup for subscription management |
| **Approach** | Supabase Auth magic links (passwordless email) |
| **Confidence** | **High** -- built into existing `@supabase/ssr` v0.8.0 |

### Why Magic Links

- **Low friction**: Users enter email, click a link, done. No password to remember for a civic notification service.
- **Email verification built-in**: The magic link itself verifies the email address, which is the same address that will receive digests.
- **Already supported**: `@supabase/ssr` (already installed) handles the auth flow. The `createSupabaseServerClient` function in `supabase.server.ts` already manages auth cookies.
- **No new dependencies**: Magic link auth is a Supabase dashboard configuration change + a new route component.

### What NOT to use

- **OAuth providers (Google, GitHub)**: Civic platform users are general public, not developers. Many residents won't have GitHub accounts. Google OAuth adds privacy concerns for a government transparency tool.
- **Separate auth system (Auth0, Clerk)**: Adds a dependency and monthly cost. Supabase Auth is already configured and running.

---

## 8. Dependency Summary

### New Production Dependencies

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| `resend` | ^4.2.0 | Email delivery API | High |
| `@react-email/components` | ^1.0.7 | Email template components | High |

### New Dev Dependencies

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| `react-email` | ^5.2.8 | Local email template preview | High |

### New Cloudflare Worker Secrets

| Secret | Purpose |
|--------|---------|
| `RESEND_API_KEY` | Resend API authentication |

### New `wrangler.toml` Configuration

```toml
[triggers]
crons = ["*/5 * * * *", "0 17 * * 0"]  # Existing keepalive + Sunday 5pm UTC (9am PT Monday) digest
```

### New `vite.config.ts` Define Entries

```typescript
"process.env.RESEND_API_KEY": JSON.stringify(env.RESEND_API_KEY || ""),
```

### Supabase Migrations

4 new tables: `notification_preferences`, `matter_subscriptions`, `topic_subscriptions`, `notification_log`
Column additions: `municipality_id` on core tables (if not already added by phase4 branch)

---

## 9. Architecture Diagram

```
                    ┌─────────────────────────────────────────┐
                    │         Cloudflare Workers               │
                    │                                          │
  User Request ───> │  React Router 7 SSR                     │
                    │    ├── home.tsx (active matters feed)    │
                    │    ├── subscribe.tsx (manage alerts)     │
                    │    └── api/unsubscribe.ts               │
                    │                                          │
  Cron (weekly) ──> │  scheduled() handler                    │
                    │    ├── Query subscribers (Supabase)      │
                    │    ├── Query new activity (Supabase)     │
                    │    ├── Render templates (React Email)    │
                    │    └── Send batch (Resend API)           │
                    │                                          │
                    └──────────────┬───────────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────────┐
                    │         Supabase (PostgreSQL)             │
                    │                                          │
                    │  Existing:                               │
                    │    meetings, agenda_items, matters,       │
                    │    motions, transcript_segments, ...      │
                    │                                          │
                    │  New:                                     │
                    │    notification_preferences               │
                    │    matter_subscriptions                   │
                    │    topic_subscriptions                    │
                    │    notification_log                       │
                    │                                          │
                    │  Auth:                                    │
                    │    auth.users (magic link signup)         │
                    └──────────────────────────────────────────┘
```

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Resend free tier limit hit | Low (need >3000 emails/month) | Low -- upgrade to $20/month Pro | Monitor via Resend dashboard; alerts at 80% |
| Cron handler timeout (30s limit on Workers) | Medium (if >500 subscribers) | Medium -- digest not sent | Batch subscribers into groups of 100; use Queues for Phase 2 |
| Magic link emails land in spam | Medium | High -- users never activate | Configure SPF/DKIM/DMARC on viewroyal.ai domain; use Resend's managed sending domain initially |
| Multi-tenancy column migration on large tables | Low (tables are <100K rows) | Low | Run during off-hours; add DEFAULT 1 for backward compat |
| Cloudflare Workers 128MB memory limit | Low | Medium | Email template rendering is lightweight; Resend handles heavy lifting |

---

## 11. Implementation Priority

1. **Active matters feed** (no new dependencies, pure query + UI) -- ship first
2. **Subscription data model** (Supabase migration only) -- schema before code
3. **Magic link auth** (Supabase config + new route) -- users before notifications
4. **Email templates** (Resend + React Email) -- visual design
5. **Digest cron job** (wrangler.toml + scheduled handler) -- wire it all together
6. **Multi-tenancy hardening** (municipality_id columns + RLS) -- can run in parallel with items 2-5

---

## 12. Version Verification Notes

| Package | Claimed Version | Verification Method | Date Checked |
|---------|----------------|-------------------|-------------|
| `resend` | 4.2.0+ | npm registry search result ("last published 5 days ago") | 2026-02-16 |
| `@react-email/components` | 1.0.7 | npm registry search result ("last published 7 days ago") | 2026-02-16 |
| `react-email` | 5.2.8 | npm registry search result ("last published 9 days ago") | 2026-02-16 |
| `@supabase/supabase-js` | 2.95.3 (already installed as ^2.90.1) | npm registry search result | 2026-02-16 |
| `@supabase/ssr` | 0.8.0 (already installed) | package.json in project | 2026-02-16 |
| Cloudflare Queues free tier | 10K ops/day | Cloudflare changelog 2026-02-04 | 2026-02-16 |
| Cloudflare Workflows | GA | Cloudflare blog June 2025 | 2026-02-16 |

> **Note on resend version**: Web search returned "6.9.2" in one result and general npm search indicated recent active publishing. The exact latest minor version should be confirmed via `pnpm info resend version` before adding to package.json. The `^4.2.0` range in recommendations is based on the Cloudflare Workers tutorial compatibility baseline; any v4+ release is compatible.
