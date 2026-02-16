# Project Research Summary

**Project:** ViewRoyal.ai Milestone — Notifications, Subscriptions & Active Matters Feed
**Domain:** Civic transparency platform / Municipal council data platform
**Researched:** 2026-02-16
**Confidence:** HIGH

## Executive Summary

ViewRoyal.ai is adding user engagement capabilities to an existing production system. The project combines three feature sets: email notifications for civic updates, subscription management for residents, and an active matters feed on the home page. Research reveals this is not greenfield development but a complex merge-and-extend operation across 4 open PRs totaling 10,000+ lines of code with overlapping schema changes.

The recommended approach prioritizes schema stability before feature development. The existing codebase has 23 database migrations already applied to production that diverge from the tracked `bootstrap.sql` file. Four open PRs (embedding migration, key statement prompts, multi-tenancy, and subscriptions/geolocation) modify the same schema files with critical dependencies. The research identifies a strict merge order — embedding changes first (schema foundation), then key statement improvements, then multi-tenancy context layer, finally subscriptions — to prevent runtime failures from missing columns or type mismatches.

The key risk is data model fragmentation during the merge process. The database already uses `halfvec(384)` embeddings while web app code still generates 768-dimensional vectors. Multi-tenancy added `municipality_id` columns but left 11 related tables without them, creating isolation gaps. The subscription PR introduces PostGIS and public user registration without rate limiting. Each of these issues compounds if PRs merge out of order. The mitigation strategy is defensive: verify each PR's migrations against the live schema before merge, test auth flows in production-like Workers environment, and reconcile `bootstrap.sql` after all merges complete.

## Key Findings

### Recommended Stack

The research confirms using existing infrastructure with targeted additions. No replacement of the current Cloudflare Workers + Supabase + React Router 7 stack is needed. The additions are tactical: Resend for email delivery, React Email for templates, Cloudflare cron for scheduled digests, and Supabase Edge Functions for post-ingestion notification triggers.

**Core technologies:**
- **Resend v4.2+**: Email delivery API with Cloudflare Workers tutorial, batch API (100 emails/call), React Email integration. Free tier (3,000/month) covers initial subscriber base. **Why:** First-class Workers support, no adapter needed, mature batch API for digest efficiency.
- **React Email v5.2.8**: Email templates as React components with Tailwind 4 support. Rendered at send-time via Resend's `react` parameter. **Why:** Shares React 19 toolchain already in project, Tailwind 4 compatibility, local preview server for template dev.
- **Cloudflare Cron Triggers**: Already configured in `wrangler.toml` for Render keepalive. Extend to trigger weekly digest jobs. **Why:** Zero new dependencies, proven in production, simple cron expression additions.
- **Supabase Edge Functions (Deno)**: Post-ingestion notification delivery. Called by Python pipeline after meeting ingestion completes. **Why:** Direct database access with service role, infrequent execution (cold start acceptable), keeps email logic close to data.
- **PostGIS extension**: Geographic subscriptions and matter proximity alerts. Required for "notify me about matters in my neighborhood" feature. **Why:** Standard Postgres extension, already available in Supabase, enables spatial queries without external geocoding service.

**Critical version lock:** OpenAI `text-embedding-3-small` dimension parameter must be set to `384` to match the database's `halfvec(384)` columns after embedding migration.

### Expected Features

Civic transparency platforms differentiate through proactive surfacing of data, not passive browsing. Subscriptions and notifications are table stakes (every competitor has them), but personalized digests and activity feeds are differentiators.

**Must have (table stakes):**
- **Email subscriptions to matters** — Councilmatic, Legistar, Civic1 all offer this. Users expect to follow specific development proposals or council agenda items and get notified on updates.
- **Email subscriptions to people** — Follow a councillor, get notified when they speak or vote. Standard in legislative trackers. Residents care about "what is MY ward councillor doing."
- **Unsubscribe and preference management** — CAN-SPAM/CASL legal requirement. One-click unsubscribe in every email, preference center for frequency control (immediate/daily/weekly). Without this, email sending is illegal.
- **Home page activity feed** — Recent council decisions (motions passed/failed, bylaws adopted) from last 1-2 weeks. Municipal website best practices (Institute for Local Government, GovStack) emphasize surfacing decisions on the home page. Currently home page only shows latest single meeting.
- **Upcoming meetings with agenda preview** — Home page already shows upcoming meetings, but adding top agenda item titles makes it actionable. Peak Agenda and Legistar both surface agenda previews.

**Should have (competitive):**
- **Topic/keyword subscriptions with AI matching** — Combine structured topic tags with full-text search and embedding similarity to match new content. Goes beyond Councilmatic's basic keyword alerts by using key statements and transcripts.
- **Neighbourhood/geographic subscriptions** — PostGIS point-in-polygon matching for "notify me about matters near my address." Rare in civic platforms (Civita App does geo-fencing for emergencies but not for matter tracking).
- **Weekly civic digest email** — Curated summary of meetings, decisions, new matters, upcoming agendas. Personalized if user has subscriptions, generic if not. CivicPlus offers digests but an AI-curated summary with key statement excerpts is differentiating.
- **"What Changed" indicators for returning users** — Visual markers on matters/meetings since last visit. Standard in social platforms, nonexistent in civic transparency tools.
- **Active matters dashboard on home page** — Dedicated section showing matters with status "In Progress" or "Under Review." Most municipal sites bury this in planning department pages. Surfacing it with timeline context is rare.
- **RSS feeds** — Power users and journalists use RSS readers. Low implementation cost, serves power users. Most modern civic platforms dropped RSS but Councilmatic originally offered it.

**Defer (v2+):**
- Push notifications / native app — User base for single municipality doesn't justify complexity. Email and RSS cover use cases.
- Social features (comments, reactions) — Harvard Ash Center research warns civic platforms with social features become moderation nightmares. This is a transparency tool, not a social platform.
- Real-time / live meeting notifications — Pipeline is batch, not streaming. Alert fatigue from live updates would be severe.
- SMS notifications — Per-message costs, TCPA compliance, overkill for council updates. Email digests serve same purpose at zero marginal cost.

### Architecture Approach

The system extends an existing SSR Cloudflare Workers app with stateless notification orchestration. Data lives in Supabase Postgres (single source of truth), email delivery runs through Edge Functions triggered by the Python pipeline, and web app routes manage subscription CRUD with RLS-protected tables.

**Major components:**

1. **Web App (Cloudflare Workers)** — React Router 7 SSR with three Supabase client patterns: browser client (lazy-init, client-side only), server client with auth (respects RLS, used in loaders/actions), admin client (bypasses RLS, used for RAG and admin operations). New routes for subscription management (`settings.tsx`, `signup.tsx`, `api.subscribe.tsx`) and home page sections for active matters feed.

2. **Supabase Schema** — New tables: `notification_preferences` (digest frequency, email enabled per user), `matter_subscriptions` (follow specific matters), `topic_subscriptions` (follow categories), `notification_log` (audit trail + deduplication). RLS policies restrict to own user except service role. Multi-tenancy via `municipality_id` foreign key on relevant tables (already partially applied — `municipalities` table exists, but 11 child tables lack the column).

3. **Email Delivery (Supabase Edge Function)** — Deno runtime, called by Python pipeline after Phase 4 ingestion completes. Flow: `build_meeting_digest()` RPC generates JSON payload → `find_meeting_subscribers()` RPC matches subscriptions via JOIN → deduplicate by email → check `notification_log` for already-sent → Resend batch API (up to 100 emails/call) → log to `notification_log`. Uses service role to access `auth.users` for email addresses.

4. **Email Templates (React Email)** — TSX files in `apps/web/emails/` directory. Templates render to HTML strings at send-time via Resend's `react` parameter. Tailwind 4 support for consistent styling. Local preview server at `localhost:3000` via `pnpm email:dev`.

5. **Scheduled Digests (Cloudflare Cron)** — Extend existing `wrangler.toml` cron config (currently `*/5 * * * *` for Render keepalive). Add weekly digest cron (e.g., `0 17 * * 0` for Sunday 5pm UTC / Monday 9am PT). The `scheduled()` handler in `workers/app.ts` dispatches based on `event.cron` to differentiate keepalive vs digest sends.

6. **Home Page Data Aggregation** — Extend `getHomeData()` in `apps/web/app/services/site.ts` to add active matters query in parallel batch. Query: `matters` table where `status = 'Active'` and `last_seen >= (today - 90 days)` ordered by recency, limit 8. No new dependencies, follows existing service layer pattern.

**Component boundaries preserved:**
- Web App <-> Supabase: PostgREST over HTTPS, SSR cookies parsed per-request, services receive client injection (never instantiate own client)
- Pipeline <-> Supabase: Python client with service role key, write-only bulk upserts
- Edge Function <-> Resend: Simple fetch to `api.resend.com/emails`, no SDK needed
- Edge Function <-> Supabase: Deno runtime with service role (full DB access, bypasses RLS)

### Critical Pitfalls

Research identified 14 pitfalls ranging from critical schema mismatches to medium-severity operational gaps. Top 5 below:

1. **Missing `match_transcript_segments` RPC function (LIVE BUG)** — The `cleanup_transcript_columns` migration dropped `transcript_segments.embedding` but web app code still calls the RPC. RAG Q&A and vector search will fail. **Prevention:** Run `SELECT proname FROM pg_proc WHERE proname LIKE 'match_transcript%';` to confirm, then update calling code to use `match_key_statements` (which exists) or recreate the RPC against the new schema.

2. **Database schema already partially applied vs PR branch code** — 23 migrations already applied to production include `migrate_to_halfvec_384`, `create_key_statements_table`, `create_municipalities_table`, but `sql/bootstrap.sql` on main still shows `vector(768)` and lacks these tables. PRs may try to re-apply migrations causing "relation already exists" errors. **Prevention:** Compare each PR's migration SQL against the 23 applied migrations before merging. Strip redundant migrations, merge only application code changes.

3. **Embedding dimension mismatch between web app and database** — Database uses `halfvec(384)`, but `apps/web/app/lib/embeddings.server.ts` line 5 still sets `EMBEDDING_DIMENSIONS = 768`. RPC functions expect `halfvec` input, web app sends 768-dim arrays. This will cause silent failures or dimension mismatch errors. **Prevention:** Update embeddings.server.ts to `dimensions: 384` immediately after embedding migration PR merges. Test Ask page with known-good question to verify.

4. **Hardcoded "View Royal" strings in 21+ files** — RAG system prompts, meta tags, Vimeo referer, RSS feed URL, map center coordinates, council org ID all hardcoded to View Royal. After multi-tenancy merge, second-town pages will still say "View Royal" or RAG answers will mention View Royal. **Prevention:** After PR #36 merges, grep for remaining references: `grep -rn "View Royal\|viewroyal\|viewroyal\.ca\|organization_id.*1" apps/web/app/`. Audit RAG prompts specifically (invisible to users until they affect answer quality).

5. **Supabase Auth opening to public without rate limiting** — Current auth is admin-only. Subscriptions require public sign-up. Platform has in-memory rate limiting on Ask API (doesn't work across Workers instances) and no rate limiting on auth endpoints. Bot sign-ups could flood system, email bombing on every meeting without throttling. **Prevention:** Implement Cloudflare Turnstile (CAPTCHA) on sign-up form, add email verification before enabling subscriptions, rate limit Edge Function email sends, set Supabase auth rate limit via dashboard.

## Implications for Roadmap

Based on research, the milestone must address PR merges before building new features. The database schema is out of sync with tracked files, and PRs have critical dependencies that require strict sequencing. Treating this as a schema stabilization project first, feature delivery second.

### Phase 1: Schema Foundation & PR Consolidation
**Rationale:** All new features depend on a stable, known schema state. The 23 applied migrations diverge from `bootstrap.sql`, and 4 PRs modify overlapping tables. Merging in the wrong order causes runtime failures from missing columns or type mismatches (Pitfall P3). Embedding dimension changes affect vector search across the entire app (Pitfall P4).

**Delivers:**
- Merged PR #35 (embedding migration: `halfvec(384)`, `key_statements` table, tsvector columns)
- Merged PR #37 (key statement prompt improvements)
- Fixed embedding dimension mismatch in `embeddings.server.ts`
- Verified `match_transcript_segments` RPC exists or calling code updated to `match_key_statements`

**Addresses:** Stack foundation for all downstream features. Embedding changes from STACK.md research (OpenAI 384-dim parameter).

**Avoids:** Pitfall P1 (missing RPC), Pitfall P4 (dimension mismatch), part of Pitfall P2 (schema drift).

**Research flag:** No additional research needed. PRs already contain implementation. Focus on merge validation.

### Phase 2: Multi-Tenancy Context Layer
**Rationale:** The `municipalities` table and multi-tenancy context must exist before subscriptions because subscription tables reference `municipalities(id)` via foreign keys. The root loader pattern changes to inject municipality context (ARCHITECTURE.md boundary analysis). PR #36 touches 38 files including service layers and route loaders. All subsequent feature work builds on this foundation.

**Delivers:**
- Merged PR #36 (multi-tenancy: `municipalities` table, dynamic meta tags, municipality context in root loader)
- Hardcoded "View Royal" strings replaced with municipality context
- Updated RAG prompts to use dynamic municipality name
- `municipality_id` columns present on core tables (already partially applied, verify completeness)

**Addresses:** Multi-municipality hardening (STACK.md section 6). Enables future second-town onboarding.

**Avoids:** Pitfall P5 (hardcoded View Royal strings), Pitfall P10 (multi-tenancy data isolation gaps).

**Research flag:** No additional research. Audit all 21+ hardcoded reference locations during merge review (grep command provided in Pitfall P5).

### Phase 3: Subscription Infrastructure & Email Delivery
**Rationale:** This is the largest PR (9800+ lines, Pitfall P14) and introduces new attack surfaces (public auth, email sending). Must merge after schema foundation (Phase 1) and multi-tenancy (Phase 2) because it references `municipalities` and depends on settled embedding dimensions for any future vector-based subscription matching.

**Delivers:**
- Merged PR #13 (subscriptions: `user_profiles`, `subscriptions`, `alert_log` tables, PostGIS extension, Edge Function `send-alerts`)
- New web app routes: `settings.tsx`, `signup.tsx`, `api.subscribe.tsx`, `api.digest.tsx`
- Email templates in `apps/web/emails/` using React Email
- Resend integration with DNS verification on `viewroyal.ai` domain
- Rate limiting via Cloudflare Turnstile and Supabase auth limits
- Email verification flow before subscription activation

**Addresses:** Table stakes features from FEATURES.md (TS-1: matter subscriptions, TS-2: people subscriptions, TS-3: preference management). Differentiators D-2 (neighbourhood subscriptions via PostGIS).

**Avoids:** Pitfall P7 (public auth without rate limiting), Pitfall P8 (Edge Functions without deployment pipeline), Pitfall P9 (email deliverability — requires DNS setup).

**Uses:** Stack elements from STACK.md (Resend v4.2+, React Email v5.2.8, Supabase Edge Functions).

**Implements:** Architecture components 2 (Supabase schema), 3 (Email delivery Edge Function), 4 (Email templates).

**Research flag:** Test email deliverability across Gmail, Outlook, Apple Mail after DNS verification. Monitor Resend dashboard for spam indicators (open rates below 10%).

### Phase 4: Home Page Enhancements (Active Matters Feed)
**Rationale:** Pure feature work with no new infrastructure dependencies. Extends existing `getHomeData()` pattern in `site.ts`. Can run in parallel with Phase 3 after multi-tenancy (Phase 2) merges, or sequentially after subscriptions land. No PR exists for this — it's new work.

**Delivers:**
- Active matters section on home page (status="Active", `last_seen >= today - 90 days`, limit 8)
- Agenda preview on upcoming meetings (top agenda item titles)
- `getActiveMatters()` service function in `matters.ts`
- Component for active matters display (list or card format)

**Addresses:** Table stakes feature TS-4 (activity feed), TS-5 (agenda preview). Differentiator D-5 (active matters dashboard).

**Avoids:** Pitfall P11 (undefined "active" heuristic — use 90-day recency filter). Performance impact (add query to existing parallel batch).

**Implements:** Architecture component 6 (home page data aggregation).

**Research flag:** No research needed. Query pattern already validated in existing `getHomeData()`. Test load time impact before/after.

### Phase 5: Digest Orchestration & Advanced Subscriptions
**Rationale:** Scheduled weekly digest (cron-based) builds on subscription infrastructure from Phase 3. Topic subscriptions and RSS feeds extend the data model but are not critical path. This phase polishes the engagement layer with differentiators.

**Delivers:**
- Weekly digest cron job (extend `wrangler.toml` cron config, add `scheduled()` handler logic)
- Topic/keyword subscriptions (AI matching via key_statements, tsvector search)
- RSS feeds for matters, people, topics, decisions
- Digest email template (personalized if user has subscriptions, generic if not)

**Addresses:** Differentiators D-1 (topic subscriptions), D-3 (weekly digest), D-6 (RSS feeds).

**Avoids:** Pitfall P13 (Workers SSR auth state limitations — tested in Phase 3). Digest generation timeout (Phase 1 of STACK.md section 3b — skip Queues initially, direct Resend batch API).

**Research flag:** Potential research needed for digest content selection algorithm (which decisions to include, how to rank/personalize). Low priority — can use simple heuristics (all motions from last 7 days) for v1.

### Phase 6: Post-Merge Cleanup & Schema Reconciliation
**Rationale:** After all PRs merge, `bootstrap.sql` is severely out of date (Pitfall P12). This technical debt compounds over time and breaks new developer onboarding. Not user-facing but critical for maintainability.

**Delivers:**
- Fresh `bootstrap.sql` generated from live schema via `supabase db dump --schema public`
- Verification that all RPC functions referenced in web app code exist in database
- Updated CLAUDE.md with current schema state (e.g., `neighborhood` column status)
- CI check for schema drift (optional)

**Addresses:** Technical debt from Pitfall P2, P12.

**Research flag:** None. This is maintenance, not feature work.

### Phase Ordering Rationale

- **Phases 1-2 must be sequential:** Schema foundation before multi-tenancy before subscriptions. Each phase depends on previous schema changes. Merging out of order causes missing column errors.
- **Phase 3 (subscriptions) is the critical path:** Largest PR, highest risk (new auth surface, email delivery), longest test cycle. Must happen before Phase 5 (digests) but can run parallel to Phase 4 (home page) if desired.
- **Phase 4 (home page) can overlap:** No dependencies on subscriptions. Can start after Phase 2 completes while Phase 3 is in review.
- **Phase 5 (digests) is the polish layer:** Builds on Phase 3 infrastructure. Weekly digests are lower priority than basic subscriptions.
- **Phase 6 is ongoing maintenance:** Can run anytime after Phase 3 merges. Does not block feature delivery but should happen before second-town onboarding.

The ordering avoids all critical pitfalls (P1-P5) and most medium-severity ones (P6-P14) by ensuring schema stability, proper auth testing, and incremental delivery of email capabilities.

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 3 (Subscriptions):** Email template design (visual/UX research), CASL compliance verification (legal research), PostGIS spatial query optimization (if performance issues arise).
- **Phase 5 (Digests):** Content selection algorithm for digest personalization. Low priority — can use simple heuristics for v1 and iterate based on user feedback.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Schema Foundation):** Merge validation, not new feature work. No research needed.
- **Phase 2 (Multi-Tenancy):** Pattern already established in codebase (municipality context in root loader). Execution, not discovery.
- **Phase 4 (Home Page):** Query pattern matches existing `getHomeData()`. Component work, not architectural research.
- **Phase 6 (Cleanup):** Maintenance, no research required.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommended technologies have official Cloudflare Workers tutorials or are already in production use. Version numbers verified via npm registry searches. Resend batch API documented, React Email Tailwind 4 support confirmed. No greenfield technology bets. |
| Features | HIGH | Feature classifications (table stakes vs differentiators) based on competitor analysis across 6 civic platforms (Granicus, Councilmatic, Civic1, CivicPlus, OpenGov, Plural). Harvard Ash Center research validates anti-features (no social features). User expectations grounded in municipal website best practices (Institute for Local Government, GovStack). |
| Architecture | HIGH | Existing system architecture well-documented in CLAUDE.md. All 4 open PRs analyzed (file-by-file diffs reviewed). Component boundaries validated against current codebase patterns. Edge Function approach matches Supabase documentation. Multi-tenancy pattern already partially implemented in database. |
| Pitfalls | HIGH | 14 pitfalls identified through code analysis (live database queries, PR diffs, TypeScript type checking). Critical pitfalls (P1-P5) verified with specific line numbers and file references. Schema drift confirmed via migration count mismatch. Embedding dimension issue found in current `embeddings.server.ts`. All pitfalls have concrete prevention strategies with commands/steps provided. |

**Overall confidence:** HIGH

The research is grounded in existing codebase analysis (not hypothetical planning) and official documentation. The main uncertainty is execution risk (merge complexity, test coverage) rather than technical feasibility. All recommended technologies are proven in production at scale.

### Gaps to Address

**Schema state reconciliation** — The live database has 23 migrations applied but `bootstrap.sql` reflects an earlier state. Before any PR merges, create a canonical schema snapshot (either update `bootstrap.sql` or adopt Supabase CLI migration workflow). This is a one-time upfront effort that prevents cascading merge conflicts.

**PostGIS availability** — Research assumes PostGIS extension is available in the Supabase project. Verify via Supabase dashboard (Database → Extensions) before merging PR #13. If not available, enable it via dashboard or a migration file.

**Resend domain verification timing** — Email delivery requires DNS records (SPF, DKIM, DMARC) on `viewroyal.ai` domain. This is not instant (DNS propagation + Resend verification can take 24-48 hours). Start domain verification process before Phase 3 completion to avoid blocking email testing.

**Weekly digest content algorithm** — Phase 5 assumes a simple heuristic (all motions from last 7 days) for v1 digest content. If user feedback indicates digest noise (too many irrelevant items), this will require iteration. Not blocking for launch, but should be monitored post-launch with open rates and unsubscribe rates as metrics.

**Auth flow testing in production Workers environment** — Cloudflare Workers have different auth state handling than local dev (SSR cookies, no persistent sessions). All auth flows (sign-up, login, subscription management, magic links) must be tested on deployed staging Workers, not just local dev. Gap is operational (test plan) not technical.

## Sources

### Primary (HIGH confidence)
- **Cloudflare Workers Documentation** — Resend integration tutorial, cron triggers, Edge Functions API
- **Supabase Documentation** — Edge Functions (Deno runtime), RLS policies, PostGIS extension, Auth magic links
- **Resend API Documentation** — Batch API, rate limits, pricing tiers, React Email integration
- **React Email Documentation** — Tailwind 4 support, component library, preview server
- **ViewRoyal.ai Codebase** — CLAUDE.md, existing PRs (#35, #36, #37, #13), live database schema queries, service layer patterns in `apps/web/app/services/`, root loader in `root.tsx`

### Secondary (MEDIUM confidence)
- **Civic Platform Competitor Analysis** — Granicus/Legistar feature comparison, Councilmatic open-source code review, CivicPlus marketing materials, Civic1 product pages, OpenGov transparency software overview, Plural/Open States about pages
- **Municipal Website Best Practices** — Institute for Local Government website guidelines, GovStack municipal homepage best practices
- **Harvard Ash Center Research** — Framework for Digital Civic Infrastructure, "Transparency is Insufficient" lessons from civic technology

### Tertiary (LOW confidence)
- **Email Marketing Best Practices** — CivicPlus blog on resident email marketing, Mailfloss email preference center guide
- **CAN-SPAM / CASL Compliance** — General knowledge of email compliance requirements (specific legal review not conducted)

---
*Research completed: 2026-02-16*
*Ready for roadmap: yes*
