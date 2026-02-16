# Pitfalls

**Research Date:** 2026-02-16
**Dimension:** Pitfalls for subsequent milestone (merging 4 PRs + adding features)

---

## P1. Missing `match_transcript_segments` RPC Function (LIVE BUG)

**Severity:** Critical
**Phase:** Must fix before any PR merges

The `cleanup_transcript_columns` migration (20260216063604) dropped the `embedding` column from `transcript_segments` and the `update_transcript_rpc_after_column_cleanup` migration (20260216063641) was supposed to handle the RPC function. However, `match_transcript_segments` does not exist in the database right now. Two production code paths call it:

- `apps/web/app/services/rag.server.ts` line 464: `getSupabase().rpc("match_transcript_segments", ...)`
- `apps/web/app/services/vectorSearch.ts` line 62: `supabase.rpc("match_transcript_segments", ...)`

**Warning signs:**
- RAG Q&A returns empty results or errors for transcript-based questions
- Vector search page returns no transcript matches
- Supabase logs show "function match_transcript_segments does not exist" errors

**Prevention strategy:**
1. Run `SELECT proname FROM pg_proc WHERE proname LIKE 'match_transcript%';` to confirm the function is missing
2. Either recreate the RPC function against `key_statements` (the replacement table) or update the calling code to use `match_key_statements` which does exist
3. If transcript segment search is no longer desired (since embeddings were removed from that table), update `rag.server.ts` and `vectorSearch.ts` to use `match_key_statements` instead

**Which phase should address it:** Immediately, before merging PR #35. The embedding migration already ran, but the web app code still references the old function.

---

## P2. Database Schema Already Partially Applied vs PR Branch Code

**Severity:** Critical
**Phase:** Before merging PR #35 (Embedding Migration)

The Supabase database already has 23 migrations applied, including `migrate_to_halfvec_384`, `create_key_statements_table`, `create_municipalities_table`, `add_municipality_id_to_core_tables`, `add_tsvector_columns`, and `cleanup_transcript_columns`. These correspond to changes from PRs #35 and #36. However, the `sql/bootstrap.sql` file on `main` still shows `vector(768)` and lacks the `municipalities` table.

This means: **The PRs' migration SQL may try to re-apply changes that already exist in production**, causing migration failures.

**Warning signs:**
- Migration scripts in PRs fail with "relation already exists" or "column already exists" errors
- PR branch code assumes columns exist that were added by a different PR's migration
- `bootstrap.sql` diverges from actual database state

**Prevention strategy:**
1. Before merging any PR, compare its migration SQL against the 23 already-applied migrations listed above
2. If a PR includes migration SQL that's already been applied, strip those migrations from the PR and only merge the application code changes
3. After all PRs merge, reconcile `sql/bootstrap.sql` with the actual database state (it's currently out of date)
4. Adopt Supabase CLI migrations going forward to prevent drift (`supabase db diff` to generate migrations from live DB)

**Which phase should address it:** Merge planning phase. Build a dependency graph of which PR migrations overlap before merging any of them.

---

## P3. PR Merge Order Dependencies (Schema vs Code Coupling)

**Severity:** High
**Phase:** Merge planning

The 4 PRs have hidden dependencies:

- **PR #35** (Embedding migration) changes embedding column types from `vector(768)` to `halfvec(384)`, drops `transcript_segments.embedding`, adds `key_statements` table, adds `tsvector` columns
- **PR #36** (Multi-tenancy) touches 38 files, replaces hardcoded "View Royal" strings, adds municipality context — requires `municipalities` table to exist
- **PR #37** (Key statement prompts) depends on key_statements infrastructure from PR #35
- **PR #13** (Subscriptions) adds `user_profiles`, `subscriptions`, `alert_log` tables + PostGIS + Edge Functions — 9800+ additions

If merged in the wrong order:
- PR #36 merged before #35: Multi-tenancy code references `municipality_id` columns that might not exist on all tables
- PR #37 merged before #35: Key statement prompt fixes target a pipeline that might not have the schema it needs
- PR #13 merged before #36: Subscription code may hardcode "View Royal" assumptions that #36 was supposed to remove

**Warning signs:**
- Merge conflicts in shared files (especially `types.ts`, `bootstrap.sql`, service files)
- Runtime errors from missing columns or tables after a merge
- TypeScript type errors post-merge

**Prevention strategy:**
1. Merge in this order: PR #35 (schema) -> PR #37 (depends on #35) -> PR #36 (multi-tenancy) -> PR #13 (subscriptions)
2. After each merge, run `pnpm typecheck` in `apps/web/` and `uv run pytest` in `apps/pipeline/`
3. Test the home page, meeting detail page, ask page, and matters page after each merge
4. Keep a running diff of `apps/web/app/lib/types.ts` to catch type mismatches early

**Which phase should address it:** Before starting any merges. Create a merge checklist with the exact order and post-merge validation steps.

---

## P4. Embedding Dimension Mismatch Between Web App and Database

**Severity:** High
**Phase:** PR #35 merge

The database now uses `halfvec(384)` for all embedding columns and RPC functions accept `halfvec` parameters. However, the web app's embedding generation still produces 768-dimensional vectors:

- `apps/web/app/lib/embeddings.server.ts` line 5: `const EMBEDDING_DIMENSIONS = 768;`
- `apps/web/app/lib/embeddings.server.ts` line 39-42: Calls OpenAI with `dimensions: 768`

The RPC functions now expect `halfvec` input. The web app sends 768-dim float arrays. This will either:
- Silently fail (wrong dimension, no matches)
- Error at the database level (dimension mismatch)
- Work by accident if Postgres casts/truncates (unlikely)

**Warning signs:**
- RAG Q&A on the Ask page returns no results or generic "I couldn't find information" responses
- Vector search returns 0 results despite data being present
- Supabase logs show dimension mismatch errors

**Prevention strategy:**
1. Update `apps/web/app/lib/embeddings.server.ts` to use `dimensions: 384` to match the database
2. Verify the OpenAI `text-embedding-3-small` model supports Matryoshka truncation to 384 dimensions (it does)
3. After updating, test the Ask page with a known-good question like "What has council decided about housing?"
4. Verify the RPC functions accept the truncated embeddings without error

**Which phase should address it:** Must be part of PR #35 or a follow-up immediately after merging it.

---

## P5. Hardcoded "View Royal" Strings in 21+ Files

**Severity:** High
**Phase:** PR #36 merge

There are at least 21 files in `apps/web/app/` containing hardcoded references to "View Royal", `viewroyal.ca`, or View Royal-specific data. PR #36 targets these, but the risk is incomplete replacement. Specific areas of concern:

- **RAG system prompts** (`rag.server.ts` lines 768, 818): "You are a research agent for the Town of View Royal" - these prompts shape all AI answers. If these aren't made dynamic, every municipality's Q&A will sound like it's about View Royal.
- **Meta tags** (`root.tsx` lines 22-28): OG images, titles, descriptions all say "View Royal"
- **Vimeo referer** (`vimeo.server.ts` line 513): Hardcoded `viewroyal.ca` as Referer header
- **RSS feed URL** (`site.ts` line 9): Hardcoded `viewroyal.ca` RSS URL
- **Map center** (`matters-map.tsx` line 90): Hardcoded `[48.455, -123.44]` coordinates
- **Content pages** (`about.md`, `terms.tsx`, `privacy.tsx`): Multiple references
- **Council org ID** (`site.ts` line 133): Hardcoded `.eq("organization_id", 1)` assumes View Royal council

**Warning signs:**
- After multi-tenancy merge, second-town pages still say "View Royal"
- RAG answers for a different municipality mention View Royal
- Map centers on View Royal regardless of municipality context

**Prevention strategy:**
1. After PR #36 merges, grep for remaining hardcoded references: `grep -rn "View Royal\|viewroyal\|viewroyal\.ca\|organization_id.*1" apps/web/app/`
2. Create a `MunicipalityContext` provider that surfaces name, slug, map center, RSS URL, and Vimeo config
3. Audit RAG prompts specifically - these are the highest-risk because they're invisible to users until they affect answer quality
4. Replace hardcoded org ID `1` with a lookup by municipality

**Which phase should address it:** During PR #36 review. Create a checklist of all 21+ locations and verify each is addressed.

---

## P6. `neighborhood` Column Ghost (TypeScript vs Database Mismatch)

**Severity:** Medium
**Phase:** PR #13 merge

The `neighborhood` column does NOT exist on the `agenda_items` table in the actual database (confirmed via live query), despite:
- Being defined in `sql/bootstrap.sql` line 210
- Being in the TypeScript types at `apps/web/app/lib/types.ts` line 90
- Having an index defined in `bootstrap.sql` line 229

PR #13 (Subscriptions) includes a `subscriptions` table with a `neighborhood` column and subscription type `'neighborhood'`. If PR #13's code attempts to query `agenda_items.neighborhood` for neighborhood-based subscriptions (e.g., "notify me about agenda items in my neighborhood"), it will fail at runtime.

Meanwhile, CONCERNS.md line 113-116 says the column DOES exist, contradicting CLAUDE.md. The actual database confirms it does NOT exist.

**Warning signs:**
- Subscription code referencing `agenda_items.neighborhood` returns errors
- Neighborhood-based filtering shows no results
- `subscriptions` table has `neighborhood` column but nothing to join against

**Prevention strategy:**
1. Before merging PR #13, search its code for any references to `agenda_items.neighborhood`
2. Decide: either add the `neighborhood` column to `agenda_items` via migration, or remove neighborhood-based subscription features from PR #13
3. Update CONCERNS.md line 113-116 to correctly state the column does NOT exist
4. If the column is added, ensure the pipeline populates it (currently nothing writes to it)

**Which phase should address it:** PR #13 review. This is a known gotcha documented in CLAUDE.md.

---

## P7. Supabase Auth Opening to Public Without Rate Limiting

**Severity:** High
**Phase:** PR #13 merge

Currently, auth is admin-only (`apps/web/app/routes/login.tsx` uses `signInWithPassword` and is labeled "Admin Access"). PR #13 opens auth to public sign-up for subscriptions. The platform currently has:

- **In-memory rate limiting** on the Ask API (`apps/web/app/routes/api.ask.tsx`) that doesn't work across Cloudflare Workers instances (documented in CONCERNS.md)
- **No rate limiting** on auth endpoints
- **No email verification** flow visible in the current codebase
- **Public read-only RLS policies** on all data tables (safe, but any auth bugs could be exploited)

Opening auth creates these risks:
- Bot sign-ups flooding the system with fake accounts
- Email bombing if the subscription system sends emails on every meeting without throttling
- Abuse of Edge Functions that send emails (Resend API key costs)

**Warning signs:**
- Spike in Supabase auth user count
- Resend email sending limits hit
- Edge Function invocation costs increase

**Prevention strategy:**
1. Implement Cloudflare Turnstile (CAPTCHA) on the sign-up form
2. Add email verification before enabling any subscriptions (check if PR #13 includes this - `email_verified` column exists in `user_profiles`)
3. Rate limit the Edge Function that sends emails (check Resend's built-in rate limits)
4. Set a Supabase auth rate limit via dashboard (Settings > Auth > Rate Limits)
5. Add an email sending budget/circuit breaker to the Edge Function

**Which phase should address it:** PR #13 review and immediately post-merge.

---

## P8. Edge Functions Without Corresponding Deployment Pipeline

**Severity:** Medium
**Phase:** PR #13 merge

PR #13 adds Supabase Edge Functions for sending notification emails. The current project has no Edge Function deployment pipeline - the `supabase/functions/` directory doesn't exist yet and there are no Supabase CLI migrations being tracked in git (migrations were applied directly to the database as shown by the 23 applied migrations).

Risks:
- Edge Functions deployed manually become orphaned (not tracked in source control)
- No way to roll back a broken Edge Function
- Edge Function secrets (Resend API key) managed outside of the codebase
- No staging/preview environment for Edge Functions

**Warning signs:**
- Edge Functions work in development but fail in production (missing secrets)
- Can't reproduce an Edge Function bug locally
- Edge Function code diverges from what's in the PR

**Prevention strategy:**
1. Ensure PR #13 includes the Edge Function source in `supabase/functions/`
2. Document the deployment process: `supabase functions deploy <name>` with required secrets
3. Add the Resend API key to Supabase Edge Function secrets: `supabase secrets set RESEND_API_KEY=...`
4. Test the Edge Function locally with `supabase functions serve` before deploying
5. Consider adding Edge Function deployment to the CI/CD pipeline or at minimum a deploy script

**Which phase should address it:** PR #13 review. Ensure Edge Functions are in source control.

---

## P9. Email Deliverability for Civic Notifications

**Severity:** Medium
**Phase:** Post PR #13 merge

Sending civic notification emails through Resend requires:
- A verified sending domain (likely `viewroyal.ai`)
- SPF, DKIM, and DMARC records configured on the domain
- Content that doesn't trigger spam filters (council meeting content can contain keywords that look like spam: "proposal", "vote", "action required")

If emails land in spam, the entire subscription feature is invisible to users.

**Warning signs:**
- Users sign up for subscriptions but never receive emails
- Resend dashboard shows emails delivered but users report nothing
- Open rates below 10% (typical municipal email open rates are 30-50%)

**Prevention strategy:**
1. Set up DNS records for Resend on the `viewroyal.ai` domain before launching subscriptions
2. Send a test batch to a few accounts across Gmail, Outlook, and Apple Mail
3. Use a recognizable from address (e.g., `notifications@viewroyal.ai`)
4. Include an unsubscribe link in every email (required by CAN-SPAM/CASL)
5. Start with a simple digest format and iterate based on deliverability metrics
6. CASL (Canadian Anti-Spam Legislation) requires express consent - ensure the sign-up flow captures this

**Which phase should address it:** After PR #13 merges but before publicly promoting the subscription feature.

---

## P10. Multi-Tenancy Data Isolation Gaps

**Severity:** High
**Phase:** PR #36 merge + ongoing

The `municipality_id` column has been added to `organizations`, `meetings`, `matters`, `elections`, `bylaws`, `documents`, and `key_statements`, all defaulting to `1` (View Royal). However:

- `people`, `memberships`, `attendance`, `votes`, `transcript_segments`, `agenda_items`, `motions`, `meeting_events`, `meeting_speaker_aliases`, `bylaw_chunks`, `topics`, `agenda_item_topics` do NOT have `municipality_id` columns
- The current RLS policies are all "allow public read-only" with no municipality filtering
- No RPC functions filter by `municipality_id` - a search in one municipality returns results from all municipalities

When a second town is onboarded:
- People table could have name conflicts across municipalities (common names like "John Smith")
- Vector search results mix municipalities (search in Esquimalt returns View Royal results)
- Agenda item, motion, and vote data is only reachable via meeting -> municipality join

**Warning signs:**
- Adding second municipality data causes cross-contamination in search results
- Person name deduplication fails across municipalities
- Home page shows meetings from all municipalities

**Prevention strategy:**
1. Accept that child tables (agenda_items, motions, votes, etc.) inherit municipality scope through their parent meeting's `municipality_id` - don't add redundant columns
2. Update all RPC search functions to accept an optional `filter_municipality_id` parameter
3. Ensure every web app query that shows data to users filters by the current municipality context
4. For the `people` table, consider a junction table `municipality_people` since a person could serve on multiple municipal councils
5. Test with synthetic data for a second municipality before onboarding real data

**Which phase should address it:** PR #36 must establish the municipality context in the web app. The RPC function updates can follow, but must happen before second-town data is ingested.

---

## P11. Active Matters Home Page Feature Depends on Unresolved Schema Questions

**Severity:** Medium
**Phase:** Issue #3 (Active Matters on Home Page)

The planned "active matters on home page" feature needs to surface matters that are currently being discussed. The `matters` table has `status`, `first_seen`, `last_seen`, and `category` columns, plus a `geo_location` JSONB column and a `geo` geography column. However:

- What makes a matter "active" vs just having `status = 'Active'`? Many old matters are still marked Active
- `last_seen` is the date of the most recent agenda item, but there's no "trending" or "recently active" concept
- The home page already has many sections (latest meeting, recent meetings, upcoming meetings, council members, public notices) - adding active matters risks page bloat and slow load times
- The existing `getHomeData` function in `site.ts` already makes 5 parallel Supabase queries followed by 2 more - adding another could impact performance

**Warning signs:**
- Home page load time increases noticeably (currently depends on meeting data + RSS fetch)
- "Active matters" shows stale items from years ago
- Users don't engage with the matters section because it's too generic

**Prevention strategy:**
1. Define "active" as `last_seen >= (today - 90 days)` rather than just `status = 'Active'`
2. Limit to 3-5 matters, sorted by `last_seen DESC`
3. Consider showing matters with upcoming agenda items (join against future meetings) rather than just recently seen ones
4. Add the query to the existing `getHomeData` parallel batch to avoid sequential loading
5. Use a simple list format, not cards - the home page is already content-heavy

**Which phase should address it:** Feature implementation phase. Define the "active" heuristic before building the UI.

---

## P12. `bootstrap.sql` is Severely Out of Date

**Severity:** Medium
**Phase:** After all PRs merge

The `sql/bootstrap.sql` file represents the schema as of initial setup. The live database has diverged significantly through 23 migrations:

- `bootstrap.sql` uses `vector(768)` everywhere; database uses `halfvec`
- `bootstrap.sql` lacks `municipalities`, `key_statements`, `user_profiles`, `subscriptions`, `alert_log`, `voice_fingerprints`, `documents` tables
- `bootstrap.sql` defines the `neighborhood` column on `agenda_items`; database doesn't have it
- `bootstrap.sql` includes RPC functions for `vector(768)` that no longer exist
- `bootstrap.sql` doesn't include `tsvector` columns, `geography` columns, or `ocd_id` columns

If someone tries to bootstrap a new environment from `bootstrap.sql`, it will create a schema incompatible with the application code.

**Warning signs:**
- New developer or CI environment fails to start
- Schema mismatches cause subtle bugs in development that don't reproduce in production
- PR reviews of schema changes are based on wrong baseline

**Prevention strategy:**
1. After all PRs merge, generate a fresh bootstrap from the live schema: `supabase db dump --schema public > sql/bootstrap.sql`
2. Alternatively, switch to Supabase CLI migration workflow where `supabase/migrations/` is the source of truth
3. Add a CI check that the bootstrap file or migration history matches the live schema

**Which phase should address it:** Post-merge cleanup. Not blocking, but technical debt that compounds.

---

## P13. Cloudflare Workers SSR Limitations with Auth State

**Severity:** Medium
**Phase:** PR #13 merge

The web app runs on Cloudflare Workers with SSR. The root loader (`root.tsx` line 63-68) already calls `supabase.auth.getUser()` on every request. PR #13 will add:
- Sign-up flows
- Subscription management pages
- Protected routes that require auth

Cloudflare Workers limitations that affect auth:
- No persistent server-side sessions - auth state lives in cookies managed by `@supabase/ssr`
- Workers have a 128MB memory limit - auth state + large page data could exceed this
- Workers have a 30-second CPU time limit - complex auth + data fetching chains could timeout
- The browser Supabase client (`app/lib/supabase.ts`) creates a dummy object on the server (`{} as SupabaseClient`) - any code that accidentally uses this on the server for auth will silently fail

**Warning signs:**
- Auth state lost on page navigation (user appears logged out randomly)
- Subscription pages return 500 errors intermittently
- `getUser()` returns null despite valid cookies

**Prevention strategy:**
1. Always use `createSupabaseServerClient(request)` for auth in loaders/actions, never the browser client
2. Test auth flows specifically on the deployed Workers environment, not just local dev
3. Ensure all auth cookies are set with appropriate `SameSite`, `Secure`, and `Path` attributes
4. Add auth state to the root loader data and use React Router's `useRouteLoaderData` to access it from child routes instead of making redundant auth calls

**Which phase should address it:** PR #13 development and review.

---

## P14. PR #13's 9800+ Line Addition Size

**Severity:** Medium
**Phase:** PR #13 review

PR #13 adds 9800+ lines across multiple concerns:
- Database schema (new tables, RLS policies, geography extensions)
- Supabase Edge Functions (email sending)
- Web app routes (sign-up, subscription management)
- Geolocation features (PostGIS, address lookup)
- Email templates

Large PRs have these failure modes:
- Reviewers skim or skip sections, missing bugs
- Conflicts with other PRs accumulate (especially with PR #36's 38-file multi-tenancy changes)
- Partial rollback is impossible - if subscriptions work but email doesn't, you can't revert just the email part

**Warning signs:**
- Merge conflicts in shared files (types.ts, service files, route files)
- Post-merge bugs that are hard to attribute to a specific change
- Features that were partially implemented (schema exists but UI doesn't, or vice versa)

**Prevention strategy:**
1. Consider splitting PR #13 into smaller PRs if not already merged:
   - PR #13a: Schema only (user_profiles, subscriptions, alert_log tables + RLS)
   - PR #13b: Web app subscription UI
   - PR #13c: Edge Functions + email sending
2. If splitting isn't practical, do a two-pass review: first pass for schema/data model, second for application code
3. Test the feature end-to-end in a Supabase branch database before merging to production

**Which phase should address it:** Before merging PR #13. Evaluate whether it can be split.

---

*Last updated: 2026-02-16*
