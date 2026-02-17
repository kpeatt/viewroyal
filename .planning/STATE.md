# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** Citizens can understand what their council decided, why, and who said what — without attending meetings or reading hundreds of pages of PDFs.
**Current focus:** Phase 3: Subscriptions & Notifications

## Current Position

Phase: 3 of 5 (Subscriptions & Notifications)
Plan: 2 of 2 in current phase (PHASE COMPLETE)
Status: Phase Complete
Last activity: 2026-02-16 — Completed 03-02-PLAN.md

Progress: [██████░░░░] 60%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 7min
- Total execution time: 0.6 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-schema-foundation | 2 | 6min | 3min |
| 02-multi-tenancy | 1 | 8min | 8min |
| 03-subscriptions-notifications | 2 | 19min | 10min |

**Recent Trend:**
- Last 5 plans: 2min, 4min, 8min, 4min, 15min
- Trend: stable (spike due to smoke test + bugfix)

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

### Pending Todos

None yet.

### Blockers/Concerns

- ~~LIVE BUG: match_transcript_segments RPC may be missing~~ RESOLVED in 01-01 (replaced with tsvector FTS)
- ~~Embedding dimension mismatch: web app generates 768-dim vectors~~ RESOLVED in 01-01 (aligned to halfvec(384))
- ~~PR #13 is 9800+ lines — may need adaptation for multi-tenancy context added in Phase 2~~ RESOLVED in 03-01 (cherry-picked cleanly, Phase 2 patterns preserved)
- bootstrap.sql is out of date with 23 applied migrations — technical debt to track
- ~~Pre-existing type error in workers/app.ts (ScheduledEvent type mismatch)~~ RESOLVED in 02-01 (PR #36 fixed to ScheduledController)

## Session Continuity

Last session: 2026-02-16
Stopped at: Completed 03-02-PLAN.md (Phase 03 complete)
Resume file: .planning/phases/03-subscriptions-notifications/03-02-SUMMARY.md
