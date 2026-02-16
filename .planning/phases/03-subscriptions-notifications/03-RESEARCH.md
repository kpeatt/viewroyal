# Phase 3: Subscriptions & Notifications - Research

**Researched:** 2026-02-16
**Domain:** User authentication, subscriptions, email notifications (Supabase Auth + Resend + Edge Functions)
**Confidence:** HIGH

## Summary

Phase 3 is substantially pre-built. PR #13 contains all the necessary code -- database schema, frontend components, API routes, service layer, and a Supabase Edge Function -- and critically, the database schema and Edge Function have ALREADY been applied to the production Supabase instance. The `user_profiles`, `subscriptions`, and `alert_log` tables exist in the live database with RLS policies. The `send-alerts` Edge Function is deployed and active. PostGIS is enabled with `geo` columns on `agenda_items` and `matters`.

The work for this phase is therefore NOT "build from scratch" but rather "merge PR #13 into main, adapt for multi-tenancy context from Phase 2, configure Supabase Auth for public signup, set up Resend domain/API key, and end-to-end test." The primary risk is merge conflicts between PR #13 (branched from older main) and the current main (which now has municipality context from Phase 2).

**Primary recommendation:** Cherry-pick or rebase PR #13 onto current main, adapting its code to use the municipality context layer pattern established in Phase 2. Then configure Supabase Auth for public signup and Resend for email delivery. Do NOT rebuild what PR #13 already provides.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SUB-01 | User can subscribe to a specific matter and receive email when it has new activity | PR #13 provides: `SubscribeButton` component, `api.subscribe.tsx` route, `subscriptions` table with `matter_id` FK, `find_meeting_subscribers` RPC matching matter subscriptions, `send-alerts` Edge Function sending emails via Resend. All DB schema already applied. |
| SUB-02 | User can subscribe to a specific councillor and receive email on their motions/votes | PR #13 provides: `SubscribeButton` with `type="person"`, `subscriptions.person_id` FK, `find_meeting_subscribers` RPC matching person subscriptions via `motions.mover_id/seconder_id`. All DB schema already applied. |
| SUB-06 | User can manage subscription preferences (frequency, channels, unsubscribe) from settings page | PR #13 provides: `settings.tsx` route with profile form (digest frequency, digest enabled toggle), subscription list with remove buttons, `subscriptions.ts` service with `removeSubscription`. Needs multi-tenancy adaptation. |
| SUB-07 | Email delivery works via Resend through Supabase Edge Function | PR #13 provides: `send-alerts/index.ts` Edge Function already deployed. Requires: RESEND_API_KEY secret set, viewroyal.ai domain verified in Resend, custom SMTP configured in Supabase Auth for confirmation emails. |
| SUB-08 | user_profiles table exists with address, neighbourhood, notification preferences | Already applied to production DB. Table has: `id` (uuid FK to auth.users), `display_name`, `address`, `neighborhood`, `location` (PostGIS geography), `notification_email`, `email_verified`, `digest_frequency`, `digest_enabled`. 1 row exists (admin user). |
| SUB-09 | subscriptions table supports polymorphic subscription types (matter, topic, person, neighbourhood, digest) | Already applied to production DB. Table has: `subscription_type` enum with all 5 types, nullable FKs (`matter_id`, `topic_id`, `person_id`), `neighborhood` text, `proximity_radius_m`, `UNIQUE NULLS NOT DISTINCT` constraint. |
| SUB-10 | alert_log table tracks sent alerts with deduplication | Already applied to production DB. Table has: `user_id`, `subscription_id`, `meeting_id`, `agenda_item_id`, `motion_id`, `alert_type`, `email_sent`, `sent_at`, `error_message`. Index on `(user_id, meeting_id, alert_type)` for dedup queries. |
| SUB-11 | Public user signup available (currently admin-only auth) | PR #13 provides: `signup.tsx` route with email/password/displayName form, auto-creates `user_profiles` row and digest subscription on signup. Needs: Supabase Auth dashboard configuration to enable public signup, Site URL set to `https://viewroyal.ai`, redirect URL configured. |
| SUB-12 | PR #13 merged to main after PR #36, with necessary adaptations for multi-tenancy context | PR #13 was written before Phase 2's municipality context layer. Files needing adaptation: `settings.tsx` (needs `useRouteLoaderData('root')` pattern), `navbar.tsx` (will conflict with Phase 2 changes), `routes.ts` (will conflict), `login.tsx` (will conflict), `person-profile.tsx` (will conflict), `types.ts` (will conflict). |
</phase_requirements>

## Standard Stack

### Core (already in use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.90.1 | Supabase client for DB queries, auth, RPC calls | Already used throughout the app |
| `@supabase/ssr` | ^0.8.0 | Server-side auth with cookie handling | Already configured in `supabase.server.ts` |
| Supabase Auth | (managed) | User authentication, session management | Built into Supabase, no additional dependency |
| PostGIS | (extension) | Geographic queries for proximity subscriptions | Already enabled in production DB |

### Supporting (new for this phase)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Resend | (API only) | Transactional email delivery | Sending digest/alert emails from Edge Function |
| Supabase Edge Functions | (Deno runtime) | Serverless function for alert processing | `send-alerts` function, already deployed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Resend | SendGrid, AWS SES | Resend is simpler API, better DX, already chosen in PR #13 |
| Edge Function for email | Cloudflare Worker | Edge Function has direct Supabase DB access via service role, simpler auth |
| Custom SMTP for Auth emails | Supabase default mailer | Default allows only 2 emails/hour -- must use custom SMTP for production |

**No new npm packages required.** PR #13 adds no new npm dependencies to the web app.

## Architecture Patterns

### Current State: What Already Exists in Production

```
Database (LIVE):
├── user_profiles          # 1 row (admin), RLS enabled with user-scoped policies
├── subscriptions          # 0 rows, RLS enabled, polymorphic FK design
├── alert_log              # 0 rows, RLS enabled, dedup index
├── subscription_type enum # matter, topic, person, neighborhood, digest
├── digest_frequency enum  # each_meeting, weekly
├── geo columns            # On agenda_items and matters (PostGIS geography)
├── find_matters_near()    # RPC function
├── build_meeting_digest() # RPC function
└── find_meeting_subscribers() # RPC function

Edge Functions (DEPLOYED):
└── send-alerts            # Active, verify_jwt=true, Resend integration

Code (in PR #13, NOT on main):
├── apps/web/app/routes/signup.tsx
├── apps/web/app/routes/settings.tsx
├── apps/web/app/routes/api.subscribe.tsx
├── apps/web/app/routes/api.digest.tsx
├── apps/web/app/components/subscribe-button.tsx
├── apps/web/app/services/subscriptions.ts
└── apps/web/app/lib/types.ts (additions)
```

### Pattern 1: Subscription Flow (from PR #13)
**What:** User subscribes to a matter/person via `SubscribeButton` component, which calls `/api/subscribe` API route, which uses `subscriptions.ts` service to insert into `subscriptions` table.
**When to use:** On matter detail pages and person profile pages.
**Key files:**
- `subscribe-button.tsx` - Client-side toggle with optimistic state
- `api.subscribe.tsx` - Server route handling POST/DELETE/GET
- `subscriptions.ts` - Service layer with typed Supabase queries

### Pattern 2: Email Alert Pipeline (from PR #13)
**What:** After pipeline ingestion, call `send-alerts` Edge Function with `meeting_id`. It calls `build_meeting_digest` RPC to get content, `find_meeting_subscribers` RPC to get recipients, deduplicates via `alert_log`, then sends via Resend API.
**When to use:** Post-pipeline ingestion hook.
**Key flow:**
```
Pipeline completes meeting → POST /send-alerts { meeting_id } →
  build_meeting_digest(meeting_id) → find_meeting_subscribers(meeting_id) →
  Dedup check in alert_log → Resend API → Log to alert_log
```

### Pattern 3: Auth + Profile Creation (from PR #13)
**What:** On signup, create Supabase Auth user via `signUp()`, then insert matching `user_profiles` row and auto-subscribe to digest.
**When to use:** New user registration only.
**Important:** The signup route creates the profile using the SERVER client (with the user's auth context), which means RLS policies must allow the newly authenticated user to insert their own profile row.

### Pattern 4: Multi-tenancy Adaptation (NEW - not in PR #13)
**What:** PR #13 was written before municipality context existed. Routes must be adapted to use `useRouteLoaderData('root')` for municipality data, matching the pattern established in Phase 2.
**Files needing adaptation:**
- `settings.tsx` - Could use municipality for neighborhood list
- `navbar.tsx` - PR #13 adds Settings/Bell icons; must merge with Phase 2's navbar
- Email templates - Hardcoded "ViewRoyal.ai" should use municipality name

### Anti-Patterns to Avoid
- **Rebuilding what PR #13 already provides:** The subscription system is fully designed. Do not redesign the schema or service layer.
- **Applying PR #13's SQL migration:** The schema is ALREADY in production. Do NOT re-run `002_subscriptions_and_geolocation.sql`. Only merge the frontend/service code.
- **Skipping email configuration:** The Edge Function will silently fail without RESEND_API_KEY. Must configure before testing.
- **Using Supabase default email for production:** Limited to 2 emails/hour. Must configure custom SMTP or Resend hook for auth emails.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email delivery | Custom SMTP integration | Resend API (already in Edge Function) | Handles delivery, bounce tracking, rate limiting |
| Auth session management | Custom cookie/JWT handling | `@supabase/ssr` `createServerClient` | Already handles PKCE flow, cookie serialization, token refresh |
| Subscription deduplication | Custom unique constraint logic | `UNIQUE NULLS NOT DISTINCT` constraint + `alert_log` dedup | DB enforces uniqueness, Edge Function checks alert_log |
| Geographic proximity search | Custom distance calculation | PostGIS `ST_DWithin()` via `find_matters_near` RPC | PostGIS uses spatial indexes, handles Earth curvature |
| Email HTML templates | React Email or template engine | Inline HTML in Edge Function | PR #13's approach works, avoids adding build dependencies to Deno |

**Key insight:** PR #13 has already solved these problems. The planner should focus on integration, not reimplementation.

## Common Pitfalls

### Pitfall 1: Merge Conflicts with Phase 2
**What goes wrong:** PR #13 modifies `navbar.tsx`, `routes.ts`, `login.tsx`, `person-profile.tsx`, and `types.ts` -- all of which were also modified in Phase 2's municipality context layer (PR #36, already merged).
**Why it happens:** PR #13 was branched before Phase 2 work. Git cannot auto-merge these changes.
**How to avoid:** Do NOT use `git merge`. Instead, manually apply PR #13's changes file-by-file onto current main, resolving conflicts as you go. Or rebase PR #13 onto main.
**Warning signs:** `git merge` reports conflicts in 5+ files.

### Pitfall 2: Schema Already Applied
**What goes wrong:** Attempting to run `002_subscriptions_and_geolocation.sql` causes errors because tables, types, and functions already exist.
**Why it happens:** PR #13's schema was applied directly to Supabase during its development, before it was merged to main.
**How to avoid:** Skip the SQL migration file entirely. The database is already in the correct state. If formal migration tracking is desired, create a no-op migration that records the schema as applied.
**Warning signs:** Errors like `relation "user_profiles" already exists` or `type "subscription_type" already exists`.

### Pitfall 3: Supabase Auth Not Configured for Public Signup
**What goes wrong:** `signUp()` returns an error or creates users that can never confirm their email.
**Why it happens:** Supabase Auth may be configured for admin-only signup, or the Site URL / redirect URLs are not set.
**How to avoid:** In Supabase Dashboard: (1) Enable email signups in Auth > Providers, (2) Set Site URL to `https://viewroyal.ai`, (3) Add redirect URLs for `https://viewroyal.ai/**` and `http://localhost:5173/**`, (4) Optionally configure email templates.
**Warning signs:** 403 errors on signup, confirmation emails with `localhost` links.

### Pitfall 4: Default Email Rate Limit
**What goes wrong:** Supabase's built-in email service only sends 2 emails per hour, so confirmation emails silently fail or are severely delayed.
**Why it happens:** Supabase intentionally limits their default SMTP to prevent abuse.
**How to avoid:** Configure custom SMTP in Supabase Auth settings (can use Resend's SMTP relay), or use the Send Email Hook to route auth emails through Resend.
**Warning signs:** Users sign up but never receive confirmation email.

### Pitfall 5: Resend Domain Not Verified
**What goes wrong:** Resend API returns 403 or sends from `onboarding@resend.dev` instead of `alerts@viewroyal.ai`.
**Why it happens:** The `viewroyal.ai` domain has not been verified in Resend with proper DNS records (SPF, DKIM, DMARC).
**How to avoid:** Before going live: (1) Add `viewroyal.ai` domain in Resend dashboard, (2) Add required DNS records (SPF TXT, DKIM CNAME, MX for bounce handling), (3) Verify in Resend dashboard, (4) Set RESEND_API_KEY as Edge Function secret.
**Warning signs:** Emails land in spam, `from` address shows Resend default.

### Pitfall 6: Edge Function JWT Verification
**What goes wrong:** `send-alerts` returns 401 even with correct authorization.
**Why it happens:** The function has `verify_jwt: true`, meaning it expects a valid Supabase JWT in the Authorization header. The pipeline must use the service role key.
**How to avoid:** Call the Edge Function with `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`. This is the current implementation. Alternatively, if called from the Python pipeline, use the service role key from environment variables.
**Warning signs:** 401 Unauthorized responses when triggering alerts.

### Pitfall 7: RLS Policy Gap on user_profiles INSERT
**What goes wrong:** New users cannot create their own profile during signup because RLS blocks the insert.
**Why it happens:** The signup flow creates the profile using the server client with the new user's auth context. The RLS policy `"Users can insert own profile"` uses `WITH CHECK (auth.uid() = id)`, which should work -- but if the user is not yet confirmed, `auth.uid()` may not be set.
**How to avoid:** Test the full signup flow end-to-end. If RLS blocks the insert, the signup route may need to use the admin client for profile creation (it currently uses the user's server client).
**Warning signs:** Profile creation fails silently during signup; `user_profiles` row not created.

## Code Examples

### Existing Auth Pattern (from current codebase)
```typescript
// Source: apps/web/app/lib/supabase.server.ts
// Server client with cookie-based auth (already working)
export function createSupabaseServerClient(request: Request, responseHeaders = new Headers()) {
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        const cookies = parseCookieHeader(request.headers.get('Cookie') ?? '');
        return cookies.map((c) => ({ name: c.name, value: c.value ?? '' }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          responseHeaders.append('Set-Cookie', serializeCookieHeader(name, value, options))
        );
      },
    },
  });
  return { supabase, headers: responseHeaders };
}
```

### Signup Pattern (from PR #13)
```typescript
// Source: PR #13 - apps/web/app/routes/signup.tsx
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: { display_name: displayName },
  },
});
// Then create profile + auto-subscribe to digest
if (data.user) {
  await supabase.from("user_profiles").insert({
    id: data.user.id,
    display_name: displayName || null,
    notification_email: email,
  });
  await supabase.from("subscriptions").insert({
    user_id: data.user.id,
    type: "digest",
  });
}
```

### Subscribe Button Pattern (from PR #13)
```typescript
// Source: PR #13 - apps/web/app/components/subscribe-button.tsx
// Client-side component that checks subscription status on mount,
// then toggles via /api/subscribe POST/DELETE
<SubscribeButton type="matter" targetId={matter.id} />
<SubscribeButton type="person" targetId={person.id} />
```

### Edge Function Invocation Pattern
```bash
# Source: Supabase Edge Functions docs
curl -X POST 'https://bfpnsfmraazfhxckmcqk.supabase.co/functions/v1/send-alerts' \
  -H 'Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"meeting_id": 42}'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Supabase implicit auth flow | PKCE flow for SSR | @supabase/ssr 0.x | Server-side auth requires PKCE; already configured in this project |
| Manual cookie handling | `@supabase/ssr` helpers | 2024 | `parseCookieHeader`/`serializeCookieHeader` from @supabase/ssr handle all cookie serialization |
| Supabase default email | Custom SMTP required | Always for production | Default allows only 2 emails/hour; must configure custom SMTP for any real email sending |
| `supabase.auth.getSession()` | `supabase.auth.getUser()` | Supabase SSR best practice | `getUser()` validates with server, `getSession()` only reads local; this project already uses `getUser()` |

**Deprecated/outdated:**
- `getSession()` on server side: This project correctly uses `getUser()` instead
- Legacy anon keys (JWT format): This project already uses publishable keys (`sb_publishable_...` format)

## Open Questions

1. **Is Supabase Auth currently configured for public signup?**
   - What we know: Auth works for admin login (1 user exists: `kpeatt@gmail.com`). The login page says "Admin Access". No evidence of signup being tested.
   - What's unclear: Whether the Supabase dashboard has email signup enabled for public use, or if it's restricted.
   - Recommendation: Check Supabase Dashboard > Authentication > Providers > Email and ensure "Enable Sign Ups" is toggled on. This is a dashboard-only setting, not code.

2. **Is RESEND_API_KEY set as an Edge Function secret?**
   - What we know: The `send-alerts` Edge Function is deployed and references `Deno.env.get("RESEND_API_KEY")`. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-available.
   - What's unclear: Whether the RESEND_API_KEY has been configured via `supabase secrets set` or the dashboard.
   - Recommendation: Check via Supabase Dashboard > Edge Functions > Secrets, or run `supabase secrets list`. If not set, user must create a Resend account, get API key, and set it.

3. **Is viewroyal.ai domain verified in Resend?**
   - What we know: The Edge Function sends from `ViewRoyal.ai <alerts@viewroyal.ai>`. This requires domain verification.
   - What's unclear: Whether Resend account exists, whether DNS records are configured.
   - Recommendation: This is a manual setup step requiring DNS access to viewroyal.ai. Must add SPF, DKIM, and optional DMARC records.

4. **What is the email confirmation flow for new signups?**
   - What we know: Supabase Auth sends confirmation emails by default on hosted projects. PR #13's signup.tsx handles the `!data.session` case (shows "check your email" message).
   - What's unclear: Whether email confirmation should be required or disabled for MVP. If required, the confirmation email needs custom SMTP to avoid the 2/hour limit.
   - Recommendation: Enable email confirmation. Configure Resend as custom SMTP in Supabase Auth settings to ensure delivery. Set email redirect URL to `https://viewroyal.ai/login`.

5. **How should the pipeline trigger send-alerts?**
   - What we know: The Edge Function expects a POST with `meeting_id`. The Python pipeline currently does NOT call this function.
   - What's unclear: Whether to add the call to the Python pipeline or use a Supabase database webhook trigger.
   - Recommendation: Add a call at the end of the pipeline's ingestion phase. Use `httpx` or `requests` to POST to the Edge Function with the service role key. This is simpler than database triggers and gives explicit control.

6. **Security advisors flagged mutable search_path on subscription RPC functions**
   - What we know: `find_matters_near`, `build_meeting_digest`, and `find_meeting_subscribers` all have mutable search paths (missing `SET search_path = 'public'`).
   - What's unclear: Whether this is a blocking security issue.
   - Recommendation: Fix by adding `SET search_path = 'public'` to these functions. Can be done in a migration as part of this phase.

## Sources

### Primary (HIGH confidence)
- Supabase production database: Direct inspection via `list_tables`, `list_migrations`, `list_edge_functions`, `get_edge_function` MCP tools -- confirmed schema state
- PR #13 source code: Read directly from `claude/add-geolocation-proximity-5lwv4` branch via `git show`
- Current codebase: Read directly from main branch files
- Supabase security advisors: `get_advisors` MCP tool output

### Secondary (MEDIUM confidence)
- [Supabase Auth Password docs](https://supabase.com/docs/guides/auth/passwords) - Signup flow, PKCE vs implicit, email confirmation
- [Supabase Auth Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) - Site URL, wildcard patterns
- [Supabase Auth Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates) - Template variables, customization
- [Supabase Edge Function Secrets](https://supabase.com/docs/guides/functions/secrets) - How to set RESEND_API_KEY
- [Supabase Send Emails guide](https://supabase.com/docs/guides/functions/examples/send-emails) - Resend integration pattern
- [Resend Domain Management](https://resend.com/docs/dashboard/domains/introduction) - Domain verification DNS records

### Tertiary (LOW confidence)
- Supabase Auth public signup toggle: Known from docs but not verified on this specific project's dashboard settings. Needs manual verification.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, no new dependencies
- Architecture: HIGH - PR #13 provides complete implementation, DB schema verified in production
- Pitfalls: HIGH - Identified from direct codebase inspection and known Supabase gotchas
- Multi-tenancy adaptation: MEDIUM - Clear pattern from Phase 2, but exact merge conflicts unknown until attempted

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable -- core tech is unlikely to change)
