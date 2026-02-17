# Phase 6: Gap Closure & Cleanup - Research

**Researched:** 2026-02-16
**Domain:** Bug fixes, dead code removal, UX polish (no new libraries or architecture)
**Confidence:** HIGH

## Summary

Phase 6 is a cleanup phase that closes audit gaps identified in `v1-MILESTONE-AUDIT.md`. All 8 success criteria are small, well-scoped changes to existing files -- no new dependencies, no schema migrations, no architectural changes. The work is purely mechanical: adjust numeric limits, fix conditional logic, remove dead code, add a UI selector, and correct a geocoding parameter.

Every file that needs modification already exists and has been read and analyzed. The changes range from single-character edits (changing `bounded=1` to `bounded=0`) to adding a small `<select>` element for digest frequency. The highest-effort item is the digest frequency selector in `settings.tsx`, which requires a new form field and wiring it into the existing `update_profile` action. Even that is straightforward -- the database enum already supports `each_meeting` and `weekly`, and the `upsertUserProfile` service function already accepts `digest_frequency`.

**Primary recommendation:** Implement all 8 fixes in a single plan with one task per fix, ordered by dependency (service layer first, then routes, then UI components). No new files needed.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HOME-01 | Active matters section shows 5-6 recently-active matters ordered by last_seen with title, category badge, duration, and 1-line summary | Change `.limit(5)` to `.limit(6)` in `site.ts` line 125. All other aspects (ordering, badges, summary) already satisfied. |
| HOME-02 | Recent decisions feed shows last 10-15 non-procedural motions with plain English summary, result, vote breakdown, date, and link to meeting | Already showing `.slice(0, 10)` in `decisions-feed-section.tsx` line 31 (fixed in commit `ffe1f4e5`). Query fetches 15 from DB. All display aspects already satisfied. Criterion says "10+" so current code passes. |
</phase_requirements>

## Standard Stack

No new libraries needed. All changes use existing dependencies:

### Core (already installed)
| Library | Purpose | Relevance to Phase 6 |
|---------|---------|---------------------|
| React 19 | UI components | Settings page digest frequency selector |
| React Router 7 | Routing/loaders/actions | Signup redirectTo, home loader cleanup |
| @supabase/supabase-js | Database client | Subscription check fix |
| Tailwind CSS 4 | Styling | Digest frequency selector styling |

### No New Dependencies
This phase requires zero `pnpm add` or `uv add` commands.

## Architecture Patterns

### Existing Pattern: Root Loader Data Access
Routes access root loader data via `useRouteLoaderData("root")`. The root loader at `apps/web/app/root.tsx` line 69-95 already fetches `municipality` and returns `{ user, municipality }`. Child routes that need municipality data should use this instead of calling `getMunicipality()` again.

**Current pattern in other routes (correct):**
```typescript
// apps/web/app/routes/matters.tsx
const rootData = useRouteLoaderData("root") as { municipality?: Municipality } | undefined;
```

**Current pattern in home.tsx (redundant -- needs fixing):**
```typescript
// apps/web/app/routes/home.tsx -- CURRENT (bad)
import { getMunicipality } from "../services/municipality";
const municipality = await getMunicipality(supabase); // redundant DB call
```

### Existing Pattern: Settings Form Action
The settings page uses a `Form` with `intent` hidden field to multiplex actions. The `update_profile` intent calls `upsertUserProfile()` which accepts `digest_frequency`. Currently hardcoded to `"each_meeting"` at `settings.tsx` line 84.

### Existing Pattern: Subscription Type Check
`checkSubscription()` in `subscriptions.ts` maps subscription type to column name. Currently handles `matter`, `person`, `topic` but returns `null` for `neighborhood` and `digest`. The `neighborhood` type uses a string `neighborhood` column (not a numeric ID), which requires different lookup logic than the numeric-ID types.

### Anti-Patterns to Avoid
- **Don't add a new `checkNeighborhoodSubscription` function:** Extend the existing `checkSubscription` or fix the `api.subscribe` GET handler to handle string-based lookups.
- **Don't add a migration for digest_frequency:** The enum already has both values (`each_meeting`, `weekly`) in the database.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Digest frequency options | Custom state management | Native `<select>` element | Only 2 options, form submission already handles it |
| Root loader data access | New data-fetching hook | `useRouteLoaderData("root")` | React Router 7 built-in, already used in 12+ routes |

## Common Pitfalls

### Pitfall 1: Neighborhood Subscription Check Architecture Mismatch
**What goes wrong:** The `api.subscribe` GET handler expects `target_id` as a number, but neighborhood subscriptions are keyed by a string `neighborhood` column, not a numeric foreign key.
**Why it happens:** `checkSubscription()` was designed for numeric FK lookups (matter_id, person_id, topic_id). Neighborhoods use a text field.
**How to avoid:** The GET handler needs to accept an optional `neighborhood` query param (string) in addition to `target_id` (number). The `checkSubscription` function needs a `neighborhood` branch that queries by the `neighborhood` column instead of a numeric ID column.
**Warning signs:** Any fix that tries to parse neighborhood name as a number will silently fail.

### Pitfall 2: Signup redirectTo and Onboarding Gate Interaction
**What goes wrong:** User signs up -> redirected to `/settings` (current default) -> root loader checks `onboarding_completed` -> redirects to `/onboarding` -> double redirect.
**Why it happens:** The signup `redirectTo` default is `/settings`, but the root loader's onboarding gate redirects all non-onboarded users to `/onboarding` anyway (root.tsx lines 86-92).
**How to avoid:** Change signup `redirectTo` default from `/settings` to `/onboarding`. After onboarding completes, users can navigate to settings naturally. Alternative: default to `/` which also triggers the onboarding gate but is semantically cleaner.
**Warning signs:** The root loader's onboarding gate skips redirect for `/onboarding`, `/login`, `/logout`, `/signup`, and API routes. So redirecting to `/onboarding` directly is safe and avoids the double-redirect.

### Pitfall 3: Home Loader Municipality - Must Also Get RSS URL
**What goes wrong:** Removing the `getMunicipality` call from home.tsx loader breaks the `getPublicNotices(municipality.rss_url)` call.
**Why it happens:** The root loader returns municipality data, but the home loader needs `rss_url` at the server level (in the loader, not the component). `useRouteLoaderData` is client-side only.
**How to avoid:** Two approaches:
1. **Server-side:** Use `getMunicipality` in the home loader but source it from the root loader's return value if React Router 7 supports parent data access in child loaders. (React Router 7 does NOT easily support accessing parent loader data from child loaders on the server side.)
2. **Accept the redundant call:** If server-side parent data access isn't straightforward in React Router 7 SSR on Cloudflare Workers, the redundant `getMunicipality` call may be acceptable. The audit flags it as tech debt, not a bug.
3. **Pass municipality through route context:** React Router 7 supports `context` in loaders, but this requires architectural changes.

**Recommendation:** Investigate whether the home route can access root loader data server-side. If not feasible without refactoring, document the trade-off and leave the redundant call (or move the RSS fetch to the client side).

### Pitfall 4: Decisions Feed Slice Already Fixed
**What goes wrong:** Attempting to fix something that's already been fixed, potentially introducing a regression.
**Why it happens:** Commit `ffe1f4e5` already changed `.slice(0, 8)` to `.slice(0, 10)` on 2026-02-16, after the audit was planned but before Phase 6 executes.
**How to avoid:** Verify current state before making changes. The decisions feed currently shows 10 items, meeting the "10+" criterion. No change needed for this specific item.

## Code Examples

### Fix 1: Active Matters Limit (site.ts)
```typescript
// File: apps/web/app/services/site.ts, line 125
// BEFORE:
.limit(5),
// AFTER:
.limit(6),
```
Also update the comment on line 118 from "5" to "6".

### Fix 2: Decisions Feed (decisions-feed-section.tsx)
```typescript
// File: apps/web/app/components/home/decisions-feed-section.tsx, line 31
// CURRENT STATE: .slice(0, 10) -- ALREADY CORRECT, no change needed
```

### Fix 3: Neighborhood Subscription Check (subscriptions.ts + api.subscribe.tsx)
```typescript
// File: apps/web/app/services/subscriptions.ts
// Add neighborhood handling to checkSubscription:
export async function checkSubscription(
  supabase: SupabaseClient,
  userId: string,
  type: SubscriptionType,
  targetId?: number,
  neighborhoodName?: string,
): Promise<Subscription | null> {
  if (type === "neighborhood") {
    // Neighborhood subscriptions are keyed by string, not numeric ID
    let query = supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("type", "neighborhood")
      .eq("is_active", true);

    if (neighborhoodName) {
      query = query.eq("neighborhood", neighborhoodName);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data as Subscription | null;
  }

  const column =
    type === "matter" ? "matter_id"
    : type === "person" ? "person_id"
    : type === "topic" ? "topic_id"
    : null;

  if (!column || !targetId) return null;
  // ... rest unchanged
}
```

```typescript
// File: apps/web/app/routes/api.subscribe.tsx
// Update GET handler to support neighborhood type:
const type = url.searchParams.get("type") as SubscriptionType;
const targetId = url.searchParams.get("target_id")
  ? Number(url.searchParams.get("target_id"))
  : undefined;
const neighborhood = url.searchParams.get("neighborhood") || undefined;

if (!type || (!targetId && type !== "neighborhood")) {
  return Response.json({ error: "type and target_id required" }, { status: 400 });
}

const sub = await checkSubscription(supabase, user.id, type, targetId, neighborhood);
```

### Fix 4: Remove Orphaned Export (subscriptions.ts)
```typescript
// File: apps/web/app/services/subscriptions.ts
// DELETE lines 117-150 (entire addKeywordSubscription function)
// The addSubscription function already handles keyword subscriptions
// via the keyword + keyword_embedding fields in the target parameter.
```

### Fix 5: Home Loader Municipality (home.tsx)
```typescript
// File: apps/web/app/routes/home.tsx
// If server-side parent data access is not feasible, keep getMunicipality call
// but document why it's needed (RSS URL required at loader level).
// If feasible, replace with root loader data access.
```

### Fix 6: Signup redirectTo (signup.tsx)
```typescript
// File: apps/web/app/routes/signup.tsx, line 14
// BEFORE:
const redirectTo = url.searchParams.get("redirectTo") || "/settings";
// AFTER:
const redirectTo = url.searchParams.get("redirectTo") || "/onboarding";
```

### Fix 7: Digest Frequency Selector (settings.tsx)
```typescript
// File: apps/web/app/routes/settings.tsx
// In the action (line 84), replace hardcoded value:
// BEFORE:
digest_frequency: "each_meeting",
// AFTER:
digest_frequency: (formData.get("digest_frequency") as DigestFrequency) || "each_meeting",

// In the form, add a <select> near the digest_enabled checkbox:
<div className="space-y-1">
  <label className="text-sm font-medium text-zinc-700">
    Digest Frequency
  </label>
  <select
    name="digest_frequency"
    defaultValue={profile?.digest_frequency || "each_meeting"}
    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
  >
    <option value="each_meeting">After each meeting</option>
    <option value="weekly">Weekly summary</option>
  </select>
  <p className="text-xs text-zinc-400">
    Choose how often you receive digest emails.
  </p>
</div>
```

### Fix 8: Geocode bounded Parameter (api.geocode.tsx)
```typescript
// File: apps/web/app/routes/api.geocode.tsx, line 36
// BEFORE:
const url = `...&bounded=1`;
// AFTER:
const url = `...&bounded=0`;
```
This matches the pipeline behavior at `apps/pipeline/pipeline/ingestion/ingester.py` line 572 where `"bounded": 0` is used to prefer but not restrict results to the viewbox.

## State of the Art

No technology changes apply to this phase. All fixes use existing patterns and APIs.

| Item | Current State | Target State | Change Type |
|------|--------------|--------------|-------------|
| Active matters limit | `.limit(5)` | `.limit(6)` | Parameter tweak |
| Decisions feed limit | `.slice(0, 10)` | `.slice(0, 10)` | Already correct |
| Neighborhood sub check | Returns null | Returns subscription | Logic fix |
| addKeywordSubscription | Exported, never imported | Removed | Dead code removal |
| Home municipality query | Redundant DB call | Root loader or documented | Optimization |
| Signup redirectTo | `/settings` (double-redirect) | `/onboarding` | Default value change |
| Digest frequency | Hardcoded `each_meeting` | User-selectable | UI addition |
| Geocode bounded | `bounded=1` | `bounded=0` | Parameter fix |

## Open Questions

1. **Home loader municipality: can child loaders access parent loader data in React Router 7 SSR?**
   - What we know: `useRouteLoaderData("root")` works client-side. The root loader returns `{ user, municipality }`. Other routes use `useRouteLoaderData` in components, not loaders.
   - What's unclear: Whether React Router 7 on Cloudflare Workers supports accessing parent loader data from child loaders on the server side. The `context` API or `loader` function signature may support this.
   - Recommendation: Check if React Router 7's `Route.LoaderArgs` includes a way to access parent data (e.g., via `context` or `matches`). If not, document the redundant call as intentional (needed for RSS URL at server time) and move on. The overhead of one extra `SELECT ... WHERE slug = 'view-royal'` query is negligible.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all 8 affected files
- Supabase database schema query confirming `digest_frequency` enum values (`each_meeting`, `weekly`)
- Supabase database schema query confirming `subscriptions` table columns
- Git history (`ffe1f4e5`) confirming decisions feed was already partially fixed
- Pipeline source (`ingester.py` line 572) confirming `bounded=0` is the intended behavior

### Secondary (MEDIUM confidence)
- Audit document (`v1-MILESTONE-AUDIT.md`) identifying all 8 gaps -- verified each against current code state

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries, all existing dependencies
- Architecture: HIGH - All patterns already established in codebase, just fixing/adjusting
- Pitfalls: HIGH - Each pitfall identified from direct code analysis

**Research date:** 2026-02-16
**Valid until:** Indefinite (cleanup phase, no external API changes expected)
