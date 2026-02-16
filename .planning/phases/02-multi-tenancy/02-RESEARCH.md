# Phase 2: Multi-Tenancy - Research

**Researched:** 2026-02-16
**Domain:** PR merge, conflict resolution, and validation of municipality context layer
**Confidence:** HIGH

## Summary

This phase is a merge-and-validate operation, not a greenfield implementation. PR #36 (`phase4/municipality-context-layer`) contains 24 changed files in a single commit (fa65707c) that adds a municipality context layer to the web app. The merge is **conflict-free** -- `git merge-tree` confirms zero conflicts between main and the PR branch. The PR's earlier commits (from phases 0-3c) are already on main via previous merges.

The core pattern is straightforward: a `getMunicipality(supabase, slug)` service fetches the municipality row in the root loader, and all routes/services access it either via `useRouteLoaderData("root")` (client components) or `getMunicipalityFromMatches(matches)` (meta functions). The database schema already has the `municipalities` table with `rss_url` and `contact_email` columns, and all migrations are applied.

**Primary recommendation:** Merge PR #36 via `git merge phase4/municipality-context-layer`, then validate with `pnpm typecheck`, `pnpm build`, and manual page checks. No conflict resolution needed. The only adaptation concern is whether Phase 1's changes to `rag.server.ts` (key_statements search) interact with PR #36's RAG prompt changes -- they do not, as Phase 1 did not modify that file.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Hardcoded slug `"view-royal"` in the root loader for now -- single tenant
- Slug stays in root loader code, not extracted to a config constant
- When a second municipality is added, detection strategy will be revisited (likely env var or subdomain routing)
- Hard error (500) if municipality lookup fails -- municipality data is essential for every page
- No graceful fallback to hardcoded defaults; if the DB query fails, the site should error rather than show broken/stale data
- Include all pipeline changes from PR #36 (ai_refiner.py, embed.py, ingester.py) -- merge everything together
- Pipeline and web app multi-tenancy land as one unit

### Claude's Discretion
- Conflict resolution strategy when merging PR #36 onto main (after #35/#37 landed)
- Validation approach and test ordering
- Whether to adapt any PR #36 code for changes introduced by Phase 1

### Deferred Ideas (OUT OF SCOPE)
- Environment variable or subdomain-based municipality detection -- revisit when second town is onboarded
- Per-municipality branding (logos, color themes, custom styling) -- not in scope for text-based multi-tenancy
- RLS policies for data isolation -- query filtering by municipality_id is sufficient for now
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MT-01 | Municipality context loaded in root loader from `municipalities` table | PR #36's `root.tsx` adds `getMunicipality(supabase)` call in parallel with auth. Municipality table exists with View Royal data. Merge delivers this. |
| MT-02 | All hardcoded "View Royal" strings replaced with dynamic municipality data (22+ files) | PR #36 replaces hardcoded strings in 14 routes + 3 components + 4 services. Remaining "ViewRoyal.ai" branding strings (navbar, about, og:site_name) are intentional product name, not municipality name. 5 route files NOT touched by PR #36 still have "ViewRoyal.ai" in meta tags (meeting-detail, election-detail, matter-detail, about, navbar) -- these are product branding, not municipality references. |
| MT-03 | Service queries accept and filter by `municipality_id` | PR #36 modifies `site.ts` (accepts municipality for council org_id + RSS URL), `people.ts` (accepts municipalityId for membership query), `municipality.ts` (new service). The `municipality_id` column already exists on meetings, matters, organizations, elections, bylaws, documents, key_statements tables with default value 1. |
| MT-04 | RAG system prompts dynamically reference municipality name | PR #36 converts `orchestratorSystemPrompt` and `finalSystemPrompt` from constants to functions (`getOrchestratorSystemPrompt(name)`, `getFinalSystemPrompt(name)`), threading `municipalityName` from `api.ask.tsx`. |
| MT-05 | Vimeo proxy uses dynamic `websiteUrl` for Referer/Origin | PR #36 adds `websiteUrl` parameter to `getVimeoVideoData()`, `getDirectUrlViaPlayerConfig()`, and `getDirectUrlFallback()`, replacing hardcoded `https://www.viewroyal.ca`. |
| MT-06 | PR #36 merged to main after PRs #35 and #37 | PRs #35 and #37 merged 2026-02-16. Merge-tree confirms zero conflicts. Clean merge possible. |
</phase_requirements>

## Standard Stack

Not applicable -- this phase introduces no new libraries. It uses existing React Router 7 patterns (`useRouteLoaderData`, `meta` function `matches` parameter) and existing Supabase client patterns.

## Architecture Patterns

### Pattern 1: Root Loader Municipality Threading
**What:** The root loader fetches the municipality row once, and all child routes access it without additional DB calls.
**When to use:** Every route and meta function that needs municipality data.
**Confidence:** HIGH (verified from PR #36 source)

Two access patterns exist:

**In components (client-side):**
```typescript
// Any route component
const rootData = useRouteLoaderData("root") as { municipality?: Municipality } | undefined;
const shortName = rootData?.municipality?.short_name || "View Royal";
```

**In meta functions (server-side, no hooks):**
```typescript
// Uses matches array from meta function args
import { getMunicipalityFromMatches } from "../lib/municipality-helpers";

export const meta: Route.MetaFunction = ({ matches }) => {
  const municipality = getMunicipalityFromMatches(matches);
  const shortName = municipality?.short_name || "View Royal";
  return [{ title: `${shortName} Meetings | ViewRoyal.ai` }];
};
```

### Pattern 2: Service Parameter Injection
**What:** Services accept municipality data as parameters rather than fetching it themselves.
**Confidence:** HIGH (verified from PR #36 source)

```typescript
// site.ts -- accepts municipality object
export async function getHomeData(supabase: SupabaseClient, municipality?: Municipality)

// people.ts -- accepts just the ID
export async function getPersonProfile(supabase, id, attendancePage, municipalityId?: number)

// rag.server.ts -- accepts municipality name string
export async function* runQuestionAgent(question, context, maxSteps, municipalityName?: string)

// vimeo.server.ts -- accepts website URL string
export async function getVimeoVideoData(videoUrl, meetingId, websiteUrl?: string)
```

### Pattern 3: Hardcoded Fallback Defaults
**What:** All dynamic municipality references include `|| "View Royal"` or `|| "Town of View Royal"` fallbacks.
**Confidence:** HIGH (verified from PR #36 source)

This is intentional defensive coding. If municipality data fails to load for any reason, the fallback ensures the page still renders with sensible defaults. This is consistent with the hard-error-on-load decision -- the fallbacks protect against undefined access if code paths are reached without municipality context.

### Anti-Patterns to Avoid
- **Fetching municipality in every route loader:** The root loader handles this once. Routes should access via `useRouteLoaderData("root")` or receive it from the root loader chain.
- **Putting municipality detection logic in a shared constant:** The user explicitly decided the slug stays in root loader code, not extracted to a config constant.

## Merge Analysis

### Conflict Status: ZERO CONFLICTS
**Confidence:** HIGH (verified via `git merge-tree`)

The merge base is commit `4b7708b7` (the `README.md` update commit in PR #36's branch history). Since that point:
- **Main changed:** 30 files (all `.planning/` docs + 4 pipeline files from Phase 1)
- **PR #36 changed:** 24 files (all in `apps/web/` + `README.md`)
- **Overlap:** Zero files changed in both branches

The only shared-path file is `README.md`, and `merge-tree` confirms it merges cleanly (additive changes to different sections).

### Pipeline Files Clarification
PR #36 shows 38 changed files in the GitHub UI, but 14 of those are from earlier commits (phases 0-3c) that are already on main. The actual Phase 4 commit (fa65707c) changes only 24 files, all in `apps/web/` plus `README.md`.

The pipeline files (`ai_refiner.py`, `embed.py`, `ingester.py`) mentioned in the PR description are from earlier branch commits already merged. Phase 1 made its own changes to these files on main (key statement speaker field, embedding dimension update, key_statement deletion in ingester). These are already reconciled because the merge base includes the earlier state and main has the newer Phase 1 changes. The merge will keep main's versions.

### Phase 1 Interaction Assessment
**Confidence:** HIGH

Phase 1 (PRs #35/#37) changed:
- `apps/pipeline/pipeline/ingestion/ai_refiner.py` -- KeyStatement.speaker field nullable
- `apps/pipeline/pipeline/ingestion/embed.py` -- dimension/doc updates
- `apps/pipeline/pipeline/ingestion/ingester.py` -- key_statement deletion in cleanup
- `apps/pipeline/pyproject.toml` -- removed fastembed dependency

PR #36 did NOT change any of these files in its Phase 4 commit. The overlap is only in earlier branch history commits, which are already the merge base. No adaptation needed.

For the web app, Phase 1 added:
- `key_statements` search to `rag.server.ts` (search_key_statements tool, key_statement handling in get_statements_by_person)
- Removed fastembed, switched to OpenAI embeddings in `embeddings.server.ts`

PR #36 changes to `rag.server.ts`:
- Converts system prompt constants to functions with municipality name parameter
- Adds `municipalityName` parameter to `runQuestionAgent`

These changes are in **different parts of the file** (prompts vs search tools). The merge will cleanly combine them. No manual adaptation required.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessing root loader data | Custom context provider | `useRouteLoaderData("root")` | React Router 7 built-in, type-safe, SSR-compatible |
| Municipality data in meta functions | Passing data through route hierarchy | `getMunicipalityFromMatches(matches)` helper | Meta functions don't have access to hooks; matches parameter is the standard RR7 approach |
| Municipality DB query | Raw SQL | `supabase.from("municipalities").select().eq("slug", slug).single()` | Standard Supabase pattern, already implemented in `municipality.ts` |

## Common Pitfalls

### Pitfall 1: Assuming Pipeline Files Need Conflict Resolution
**What goes wrong:** Planner creates tasks for resolving pipeline file conflicts that don't exist.
**Why it happens:** PR #36's GitHub UI shows 38 files including pipeline changes, but those are from earlier commits already on main.
**How to avoid:** The merge command handles this automatically. Only the Phase 4 commit (fa65707c) introduces new changes, and those are exclusively in `apps/web/`.
**Warning signs:** If `git merge` reports conflicts in pipeline files, something has changed since this research -- re-run `git merge-tree` before proceeding.

### Pitfall 2: Files NOT Touched by PR #36 Still Have "View Royal"
**What goes wrong:** Assuming all hardcoded references are fixed after merge.
**Why it happens:** PR #36 does not modify these files: `about.tsx`, `navbar.tsx`, `meeting-detail.tsx`, `election-detail.tsx`, `matter-detail.tsx`. They contain "ViewRoyal.ai" branding strings in meta tags and headings.
**How to avoid:** Distinguish between **municipality name** references (must be dynamic) and **product branding** references ("ViewRoyal.ai" is the product name, not a municipality reference). The remaining strings like `ViewRoyal.ai` in `<title>` tags are product branding.
**Warning signs:** If validation grep for "View Royal" finds references, check whether they are municipality names (need fixing) or product brand (acceptable).

### Pitfall 3: The workers/app.ts Type Fix
**What goes wrong:** PR #36 includes a `ScheduledEvent` to `ScheduledController` type fix in `workers/app.ts` that isn't related to multi-tenancy.
**Why it happens:** It was bundled into the PR as a drive-by fix.
**How to avoid:** This is fine -- it's a legitimate type correction. Accept it as part of the merge.

### Pitfall 4: Missing Municipality Data in DB
**What goes wrong:** Hard 500 error on all pages if municipality row doesn't exist.
**Why it happens:** User decided on hard error, no graceful fallback.
**How to avoid:** Verify the municipalities table has the View Royal row before deploying. Current data confirmed: row exists with id=1, slug="view-royal", all fields populated including rss_url and contact_email.

## Code Examples

### Municipality Service (new file from PR #36)
```typescript
// apps/web/app/services/municipality.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Municipality } from "../lib/types";

export async function getMunicipality(
  supabase: SupabaseClient,
  slug = "view-royal",   // Hardcoded slug per user decision
): Promise<Municipality> {
  const { data, error } = await supabase
    .from("municipalities")
    .select("id, slug, name, short_name, province, classification, website_url, rss_url, contact_email, map_center_lat, map_center_lng, ocd_id, meta, created_at, updated_at")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    throw new Error(`Municipality not found: ${slug}`);  // Hard error per user decision
  }

  return data as Municipality;
}
```

### Root Loader (modified by PR #36)
```typescript
// apps/web/app/root.tsx
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createSupabaseServerClient(request);
  const [{ data: { user } }, municipality] = await Promise.all([
    supabase.auth.getUser(),
    getMunicipality(supabase),
  ]);
  return { user, municipality };
}
```

### Municipality Type (added to types.ts)
```typescript
export interface Municipality {
  id: number;
  slug: string;
  name: string;            // "Town of View Royal"
  short_name: string;      // "View Royal"
  province?: string;       // "BC"
  classification?: string; // "Town"
  website_url?: string;    // "https://www.viewroyal.ca"
  rss_url?: string;
  contact_email?: string;
  map_center_lat?: number;
  map_center_lng?: number;
  ocd_id?: string;
  meta?: any;
  created_at: string;
  updated_at: string;
}
```

## Merge Strategy Recommendation (Claude's Discretion)

**Recommended approach:** Direct merge from the branch.

```bash
git merge phase4/municipality-context-layer --no-ff -m "feat(multi-tenancy): merge municipality context layer (PR #36)"
```

Rationale:
- Zero conflicts confirmed via `git merge-tree`
- `--no-ff` creates a merge commit for clear history
- The branch has multiple commits (phases 0-3c + phase 4), but only the Phase 4 commit introduces new changes; the rest are already on main via previous merges, so git handles deduplication automatically

**Alternative considered:** Cherry-pick only commit fa65707c. This would be cleaner in git history (one commit, only Phase 4 changes) but risks missing any branch state that git merge would automatically handle. The merge approach is safer and standard.

## Validation Strategy Recommendation (Claude's Discretion)

**Recommended order:**

1. **Pre-merge verification:** Run `git merge-tree` to confirm zero conflicts (already done, but re-verify at merge time)
2. **Merge:** `git merge phase4/municipality-context-layer`
3. **Type check:** `cd apps/web && pnpm typecheck` -- catches type errors from merged code
4. **Build:** `cd apps/web && pnpm build` -- confirms Cloudflare Workers build succeeds
5. **Manual smoke test:** `pnpm dev`, then:
   - Home page loads with council members and public notices
   - View page source: meta tags use dynamic municipality data
   - Ask a question: RAG prompt references municipality dynamically
   - Meeting detail page: Vimeo video playback works
6. **Hardcoded string audit:** Grep for remaining "View Royal" references in `apps/web/app/` and verify they are either:
   - Fallback defaults (e.g., `|| "View Royal"`) -- acceptable
   - Product branding (e.g., "ViewRoyal.ai") -- acceptable
   - Actual hardcoded municipality names -- needs fixing (none expected)

## Phase 1 Adaptation Assessment (Claude's Discretion)

**No adaptation needed.** Phase 1 and PR #36 modified completely different files and code paths. Specifically:

- Phase 1 changed pipeline files and pyproject.toml -- PR #36's Phase 4 commit does not touch these
- Phase 1 added key_statements search to rag.server.ts (new tools, new normalizer) -- PR #36 only modifies the system prompt strings in rag.server.ts, in a different section
- The embeddings.server.ts file is identical between main and the PR branch

The merge will cleanly combine Phase 1's key_statements improvements with PR #36's dynamic municipality prompts.

## Database State

**Confirmed via live query:**
- `municipalities` table exists with 1 row (View Royal)
- All columns present: id, slug, name, short_name, province, classification, website_url, rss_url, contact_email, map_center_lat, map_center_lng, ocd_id
- `municipality_id` column exists on: meetings, matters, organizations, elections, bylaws, documents, key_statements (all defaulting to 1)
- Migration `20260216190505_add_municipality_rss_url_and_contact_email` already applied
- No additional database migrations needed for this phase

## Open Questions

1. **PR #36 branch diverged from an older main**
   - What we know: The merge base is commit 4b7708b7 (the branch's Phase 3c commit). Main has advanced with Phase 1 changes. Merge-tree confirms no conflicts.
   - What's unclear: Nothing -- this is fully resolved.
   - Recommendation: Proceed with merge. Git handles the divergent history correctly.

2. **Should the PR be closed after merge?**
   - What we know: PR #36 targets main. After merging locally and pushing, the PR will auto-close.
   - What's unclear: Whether to close via `gh pr merge` or manual local merge + push.
   - Recommendation: Local merge + push is safer for verifying build before it hits main. Use `gh pr close 36` if the push auto-closes doesn't trigger.

## Sources

### Primary (HIGH confidence)
- `git merge-tree` output -- zero conflicts confirmed
- `git diff` between merge base and both branches -- all file changes analyzed
- `git show` of PR #36 branch files -- actual implementation reviewed
- Live Supabase `municipalities` table query -- schema and data verified
- `mcp__supabase__list_tables` -- full schema with foreign keys verified
- `mcp__supabase__list_migrations` -- all 23 migrations confirmed applied

### Secondary (MEDIUM confidence)
- PR #36 description and file list on GitHub -- cross-verified with actual diffs

## Metadata

**Confidence breakdown:**
- Merge conflict analysis: HIGH -- verified with git merge-tree, zero conflicts
- Architecture patterns: HIGH -- read actual PR #36 source code for all 24 changed files
- Phase 1 interaction: HIGH -- compared exact diffs on both branches, no overlap in Phase 4 commit
- Database state: HIGH -- live query confirmed schema and data
- Pitfalls: HIGH -- based on direct codebase analysis, not assumptions

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable -- no external dependencies that change rapidly)
