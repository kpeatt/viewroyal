---
milestone: v1
audited: 2026-02-17T08:30:00Z
status: tech_debt
scores:
  requirements: 29/29
  phases: 6/6
  integration: 18/20
  flows: 4/5
gaps:
  requirements: []
  integration:
    - "search_key_statements tool missing from TOOL_LABELS in ask.tsx (cosmetic — raw name shown in UI)"
    - "searchKeyStatements export in vectorSearch.ts orphaned (never imported by any consumer)"
  flows:
    - "Email delivery silently no-ops if RESEND_API_KEY not configured in Edge Function secrets"
tech_debt:
  - phase: 01-schema-foundation
    items:
      - "vectorSearch.ts:75 — searchTranscriptSegments returns [] (intentional deprecated stub, in vectorSearchAll live path)"
      - "workers/app.ts:29 — Pre-existing ScheduledEvent type error (not introduced by milestone)"
  - phase: 03-subscriptions-notifications
    items:
      - "settings.tsx:111 — TODO: Make dynamic when multi-town support is needed (hardcoded VIEW_ROYAL_NEIGHBORHOODS)"
      - "External config not automated: Resend account, API key, DNS, Supabase Auth public signup toggle, custom SMTP"
  - phase: 05-advanced-subscriptions
    items:
      - "upsertUserProfile omits onboarding_completed — onboarding.tsx uses as-any cast + separate update (not atomic)"
      - "RPC embedding format inconsistency: vectorSearch.ts uses JSON.stringify, rag.server.ts passes raw array"
  - phase: cross-phase
    items:
      - "login.tsx labels itself 'Admin Access' — confusing for public users arriving from signup flow"
      - "searchTranscriptSegments stub returns [] inside vectorSearchAll live path (dead weight)"
---

# v1 Milestone Audit: Land & Launch

**Audited:** 2026-02-17 (post-Phase 6 re-audit)
**Status:** tech_debt — All 29 requirements met at code level. No critical blockers. Accumulated tech debt needs review.

## Executive Summary

All 6 phases completed and verified. All 29 v1 requirements satisfied at the code level — the 2 partial requirements (HOME-01, HOME-02) from the previous audit were closed by Phase 6. Cross-phase integration is solid with 18/20 connections verified as wired. 4 of 5 end-to-end user flows work completely; email delivery depends on external Resend configuration. The milestone goal is achieved: citizens can browse meetings, subscribe to topics/matters/councillors, manage preferences through onboarding, receive personalized email digests, and ask AI questions — all with dynamic municipality context.

## Phase Results

| Phase | Status | Score | Requirements | Notes |
|-------|--------|-------|-------------|-------|
| 1. Schema Foundation | human_needed | 11/11 | 6/6 satisfied | Runtime vector search needs human testing |
| 2. Multi-Tenancy | passed | 6/6 | 6/6 satisfied | Clean pass |
| 3. Subscriptions & Notifications | human_needed | 22/25 | 9/9 satisfied | Email delivery requires external config |
| 4. Home Page Enhancements | gaps_found → closed by P6 | 12/12 | 5/5 satisfied | HOME-01/02 fixed in Phase 6 |
| 5. Advanced Subscriptions | passed | 21/21 | 3/3 satisfied | Clean pass |
| 6. Gap Closure & Cleanup | passed | 8/8 | 2/2 satisfied | Closed all previous audit gaps |

## Requirements Coverage

### Schema Stabilization (6/6 satisfied)

| Requirement | Phase | Status | Evidence |
|-------------|-------|--------|----------|
| SCHEMA-01 | 1 | Satisfied | embeddings.server.ts + embed.py both use 384-dim |
| SCHEMA-02 | 1 | Satisfied | Replaced with tsvector FTS in rag.server.ts |
| SCHEMA-03 | 1 | Satisfied | No duplicate/conflicting migrations |
| SCHEMA-04 | 1 | Satisfied | PR #35 merge commit af5b57f9 |
| KS-01 | 1 | Satisfied | Max 6 per item, unique timestamps, single-speaker |
| KS-02 | 1 | Satisfied | PR #37 merge commit de72cfc4 |

### Multi-Tenancy (6/6 satisfied)

| Requirement | Phase | Status | Evidence |
|-------------|-------|--------|----------|
| MT-01 | 2 | Satisfied | root.tsx loader calls getMunicipality() |
| MT-02 | 2 | Satisfied | All "View Royal" strings are fallback defaults |
| MT-03 | 2 | Satisfied | site.ts, people.ts accept municipality params |
| MT-04 | 2 | Satisfied | rag.server.ts dynamic prompt functions |
| MT-05 | 2 | Satisfied | vimeo.server.ts accepts websiteUrl param |
| MT-06 | 2 | Satisfied | PR #36 merge commit 8799f7ef |

### Subscriptions & Notifications (12/12 satisfied)

| Requirement | Phase | Status | Notes |
|-------------|-------|--------|-------|
| SUB-01 | 3 | Satisfied | Code complete; email needs Resend config |
| SUB-02 | 3 | Satisfied | Code complete; email needs Resend config |
| SUB-03 | 5 | Satisfied | Topic subscriptions via onboarding + settings |
| SUB-04 | 5 | Satisfied | Neighbourhood subscriptions with geocoding |
| SUB-05 | 5 | Satisfied | Personalized digest with Following badges |
| SUB-06 | 3 | Satisfied | Settings page with frequency, channels, unsubscribe |
| SUB-07 | 3 | Satisfied | Edge Function exists; needs RESEND_API_KEY |
| SUB-08 | 3 | Satisfied | user_profiles table with all fields |
| SUB-09 | 3 | Satisfied | Polymorphic subscriptions (matter, topic, person, neighborhood, digest) |
| SUB-10 | 3 | Satisfied | alert_log table with deduplication |
| SUB-11 | 3 | Satisfied | Signup route exists; needs Auth dashboard toggle |
| SUB-12 | 3 | Satisfied | PR #13 cherry-picked with municipality context |

### Home Page Enhancements (5/5 satisfied)

| Requirement | Phase | Status | Notes |
|-------------|-------|--------|-------|
| HOME-01 | 4 + 6 | Satisfied | .limit(6) after Phase 6 fix |
| HOME-02 | 4 + 6 | Satisfied | .slice(0, 10) after Phase 6 fix |
| HOME-03 | 4 | Satisfied | Upcoming meeting with agenda preview |
| HOME-04 | 4 | Satisfied | Amber border + "Divided" badge + Controversial toggle |
| HOME-05 | 4 | Satisfied | Financial cost badge when > 0 |

**Coverage: 29/29 requirements satisfied (100%)**

## Cross-Phase Integration

### Verified Connections (18/20)

| # | Connection | Status |
|---|-----------|--------|
| 1 | Phase 1 embeddings (384-dim) → Phase 5 keyword embeddings | Connected |
| 2 | Phase 2 municipality context → Phase 3 signup/settings | Connected |
| 3 | Phase 2 municipality context → Phase 4 home page | Connected (documented duplication) |
| 4 | Phase 3 subscriptions service → Phase 5 advanced subscriptions | Connected (same table) |
| 5 | Phase 3 subscribe-button → Phase 4 active-matters-section | Connected |
| 6 | Phase 5 onboarding → Phase 2 root.tsx redirect | Connected |
| 7 | Phase 1 rag.server.ts → Phase 2 municipality name | Connected |
| 8 | Phase 5 topics.ts → Phase 3 subscriptions.ts | Connected |
| 9 | All routes → root loader municipality | Connected |
| 10 | api.subscribe → subscriptions service layer | Connected |
| 11 | api.geocode → Nominatim + update_user_location RPC | Connected |
| 12 | api.ask → rag.server.ts → Gemini | Connected |
| 13 | home.tsx → site.ts getHomeData() | Connected |
| 14 | send-alerts → find_meeting_subscribers RPC (6 branches) | Connected |
| 15 | send-alerts → build_meeting_digest RPC | Connected |
| 16 | onboarding → api.geocode → update_user_location | Connected |
| 17 | signup → /onboarding redirect default | Connected |
| 18 | settings → topics.ts + subscriptions.ts | Connected |

### Issues (2/20)

| Issue | Severity | Impact |
|-------|----------|--------|
| `searchKeyStatements` export in vectorSearch.ts orphaned | Low | Dead code — rag.server.ts calls match_key_statements RPC directly |
| `search_key_statements` tool missing from TOOL_LABELS in ask.tsx | Low | Raw tool name shown in UI instead of "Searching key statements" |

## E2E User Flows

| Flow | Status | Details |
|------|--------|---------|
| New user signup → onboarding → home | Complete | signup → /onboarding default → 3 steps → home with subscribe buttons |
| Ask question → get answer | Complete | GET /api/ask → 384-dim embedding → FTS + vector search → Gemini stream |
| Browse home → navigate deeper | Complete | 5 sections → matter/meeting links → subscribe buttons |
| Settings management | Complete | Profile, digest frequency, topic/keyword subs all wired |
| Subscribe to matter → receive email | **Partial** | Storage + RPC matching works; sendEmail() silently no-ops without RESEND_API_KEY |

## Tech Debt Summary

### Phase 1: Schema Foundation (2 items)
- `vectorSearch.ts:75` — `searchTranscriptSegments` returns `[]` (intentional deprecated stub, but still in `vectorSearchAll` live path)
- `workers/app.ts:29` — Pre-existing ScheduledEvent type error (not introduced by milestone)

### Phase 3: Subscriptions (2 items)
- `settings.tsx:111` — Hardcoded `VIEW_ROYAL_NEIGHBORHOODS` array (TODO for multi-town)
- External config not automated: Resend account, API key, DNS (SPF/DKIM), Supabase Auth public signup toggle, custom SMTP relay

### Phase 5: Advanced Subscriptions (2 items)
- `upsertUserProfile` omits `onboarding_completed` — `onboarding.tsx` uses `as any` cast + separate `.update()` (not atomic; if second call fails, redirect loop)
- RPC embedding format inconsistency: `vectorSearch.ts` passes `JSON.stringify(embedding)`, `rag.server.ts` passes raw array (both work today via PostgREST)

### Cross-Phase (2 items)
- `login.tsx` labels page "Admin Access" — confusing for public users arriving from signup
- `searchKeyStatements` orphaned export in `vectorSearch.ts` (dead code)

### Total: 8 items across 4 areas

## External Configuration Checklist

One-time manual setup required for email delivery (documented in Phase 3 Plan 02):

- [ ] Enable public signups in Supabase Auth dashboard
- [ ] Configure custom SMTP relay (avoid 2 emails/hour Supabase limit)
- [ ] Create Resend account and get API key
- [ ] Configure sender domain DNS (SPF, DKIM records)
- [ ] Set `RESEND_API_KEY` as Supabase Edge Function secret
- [ ] Set Site URL and Redirect URLs in Supabase Auth settings

## Previous Audit Gaps — Resolution

Phase 6 was created specifically to close gaps from the first audit. All resolved:

| Previous Gap | Resolution |
|-------------|------------|
| HOME-01: .limit(4) not 5-6 | Fixed: .limit(6) in site.ts |
| HOME-02: .slice(0,8) not 10-15 | Fixed: .slice(0,10) in decisions-feed-section.tsx |
| Orphaned addKeywordSubscription | Fixed: removed from subscriptions.ts |
| Signup redirectTo defaults to /settings | Fixed: defaults to /onboarding |
| Neighborhood type check broken in api.subscribe GET | Fixed: parses neighborhood param, exempts from targetId |
| digest_frequency not exposed in settings UI | Fixed: dropdown added with each_meeting/weekly options |
| api.geocode bounded=1 vs pipeline bounded=0 | Fixed: changed to bounded=0 |
| Redundant getMunicipality in home.tsx | Documented: intentional (child loaders can't access parent data server-side) |

---

*Audited: 2026-02-17*
*Auditor: Claude (milestone-audit orchestrator)*
