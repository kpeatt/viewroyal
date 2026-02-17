# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** Citizens can understand what their council decided, why, and who said what — without attending meetings or reading hundreds of pages of PDFs.
**Current focus:** Phase 5: Advanced Subscriptions

## Current Position

Phase: 5 of 5 (Advanced Subscriptions)
Plan: 3 of 3 in current phase
Status: Phase Complete
Last activity: 2026-02-17 — Completed 05-03-PLAN.md

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 10
- Average duration: 9.6min
- Total execution time: 1.6 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-schema-foundation | 2 | 6min | 3min |
| 02-multi-tenancy | 1 | 8min | 8min |
| 03-subscriptions-notifications | 2 | 19min | 10min |
| 04-home-page-enhancements | 2 | 30min | 15min |
| 05-advanced-subscriptions | 3 | 25min | 8min |

**Recent Trend:**
- Last 5 plans: 5min, 25min, 17min, ~10min, 8min
- Trend: variable (mix of schema, UI, and API work)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: PR merge order is #35 -> #37 -> #36 -> #13 (strict dependency chain)
- [Roadmap]: Phase 4 (Home Page) can run parallel to Phase 3 (Subscriptions) since both depend only on Phase 2
- [Roadmap]: Advanced subscriptions (topic, neighbourhood, digest) split into Phase 5 as they need work beyond PR #13
- [01-01]: Merged PR #35 as-is (conflict-free, pre-verified)
- [01-01]: Removed fastembed dependency; OpenAI text-embedding-3-small is sole embedding provider
- [01-01]: Pre-existing workers/app.ts type error is out of scope (deferred)
- [01-02]: Took PR #37 versions for all conflict sections (nullable speaker, simpler syntax, stricter prompt)
- [01-02]: Removed duplicate key_statements deletion block from merge overlap
- [02-01]: Hardcoded slug 'view-royal' stays in municipality service, not extracted to config constant
- [02-01]: Municipality lookup failure throws hard error (no graceful fallback)
- [02-01]: Remaining 'View Royal' strings are fallback defaults or product branding -- acceptable
- [02-01]: PR #36 merged via --no-ff to preserve branch history
- [03-01]: Hardcoded VIEW_ROYAL_NEIGHBORHOODS array left as-is with TODO for future dynamic loading
- [03-01]: SubscribeButton placed inline with status badges on matter-detail, alongside CardTitle on person-profile
- [03-01]: Anonymous users get 'Get Alerts' link to /signup in navbar
- [03-02]: Used ALTER FUNCTION SET search_path (not CREATE OR REPLACE) for simpler security fix
- [03-02]: Auto-create user_profiles row on first subscribe to handle pre-existing accounts (FK constraint fix)
- [04-01]: Removed municipality parameter from getHomeData() (council members and public notices removed from home page)
- [04-01]: Async IIFE pattern for Supabase batch queries to resolve PromiseLike/Promise type mismatch
- [04-01]: Hand-drawn simplified SVG outline for ViewRoyalMap instead of GeoJSON conversion (per user directive)
- [04-01]: Transitional home.tsx UI using new data shape (full redesign in Plan 02)
- [04-02]: Map opacity increased from 0.07 to 0.4 for better visual impact in hero background
- [04-02]: Agenda items display plain_english_summary with category badges for richer context
- [04-02]: Decisions limited to 8 recent + toggle to view divided votes (improved UX)
- [04-02]: Active matters shown as 4-6 visible cards for focus and performance
- [04-02]: Public Notices RSS feed restored per user feedback for civic awareness
- [05-01]: Preserved existing find_meeting_subscribers plpgsql signature when adding topic branches
- [05-01]: Cosine similarity threshold 0.45 for keyword matching (tunable in RPC)
- [05-01]: Digest auto-subscribe removed from signup -- now opt-in only
- [05-01]: Onboarding route registered as placeholder (redirects to /settings until Plan 02)
- [05-01]: Pipeline geocoding uses bounded=0 for better coverage near View Royal borders
- [05-02]: React state for wizard steps (not URL params) for smoother UX
- [05-02]: Root loader redirect excludes /onboarding, /logout, /api/*, /login to prevent loops
- [05-02]: Subscription insert changed to upsert with composite onConflict for deduplication
- [05-03]: Highlighting uses RPC results directly -- no re-matching logic in Edge Function
- [05-03]: Keyword subscribers highlight ALL items (RPC already confirmed match at meeting level)
- [05-03]: Pre-meeting mode skips person subscription matching (no motions pre-meeting)
- [05-03]: View Royal attending info hardcoded (Town Hall, YouTube, clerk email)

### Pending Todos

None yet.

### Blockers/Concerns

- ~~LIVE BUG: match_transcript_segments RPC may be missing~~ RESOLVED in 01-01 (replaced with tsvector FTS)
- ~~Embedding dimension mismatch: web app generates 768-dim vectors~~ RESOLVED in 01-01 (aligned to halfvec(384))
- ~~PR #13 is 9800+ lines — may need adaptation for multi-tenancy context added in Phase 2~~ RESOLVED in 03-01 (cherry-picked cleanly, Phase 2 patterns preserved)
- bootstrap.sql is out of date with 23 applied migrations — technical debt to track
- ~~Pre-existing type error in workers/app.ts (ScheduledEvent type mismatch)~~ RESOLVED in 02-01 (PR #36 fixed to ScheduledController)

## Session Continuity

Last session: 2026-02-17
Stopped at: Completed 05-02-PLAN.md (backfill after checkpoint approval) and 05-03-PLAN.md (Phase 05 complete, all phases complete)
Resume file: .planning/phases/05-advanced-subscriptions/05-03-SUMMARY.md
