# Roadmap: ViewRoyal.ai — Land & Launch Milestone

## Overview

This milestone lands four open PRs in strict dependency order, then builds out the user-facing features they enable. The work starts with schema stabilization (fixing live bugs and merging embedding/key-statement changes), layers multi-tenancy on top, then delivers subscriptions, home page enhancements, and advanced notification features. The PR merge sequence (#35 -> #37 -> #36 -> #13) is non-negotiable — merging out of order causes runtime failures from missing columns and type mismatches.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Schema Foundation** - Fix live bugs, merge embedding migration (#35) and key statement prompts (#37) (completed 2026-02-16)
- [ ] **Phase 2: Multi-Tenancy** - Merge PR #36, replace all hardcoded "View Royal" with dynamic municipality context
- [ ] **Phase 3: Subscriptions & Notifications** - Merge PR #13, land public signup, email delivery, and core subscription features
- [ ] **Phase 4: Home Page Enhancements** - Surface active matters, recent decisions, and upcoming meetings on home page
- [ ] **Phase 5: Advanced Subscriptions** - Topic subscriptions, neighbourhood subscriptions, and weekly digest email

## Phase Details

### Phase 1: Schema Foundation
**Goal**: The database schema is stable, embeddings are consistent, and vector search works correctly across the entire application
**Depends on**: Nothing (first phase)
**Requirements**: SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04, KS-01, KS-02
**Success Criteria** (what must be TRUE):
  1. Ask page returns relevant transcript results when a user submits a question (match_transcript_segments RPC works or calling code uses working alternative)
  2. Embedding dimensions are consistent — web app generates 384-dim vectors matching the database halfvec(384) columns
  3. PR #35 and PR #37 are merged to main with no duplicate or conflicting migrations against the 23 already applied
  4. Key statement extraction produces higher-quality results with improved prompts (verifiable by running pipeline on a test meeting)
**Plans:** 2/2 plans complete

Plans:
- [ ] 01-01-PLAN.md — Merge PR #35 (embedding migration), fix dimension mismatch, remove corrected_text_content, add key statement search
- [ ] 01-02-PLAN.md — Merge PR #37 (key statement prompt improvements), resolve conflicts, validate full phase

### Phase 2: Multi-Tenancy
**Goal**: The web app dynamically adapts to any municipality in the database — no hardcoded "View Royal" references remain in user-facing code
**Depends on**: Phase 1
**Requirements**: MT-01, MT-02, MT-03, MT-04, MT-05, MT-06
**Success Criteria** (what must be TRUE):
  1. Root loader fetches municipality data from the municipalities table and makes it available to all routes
  2. Page titles, meta tags, and visible text display the correct municipality name (not hardcoded "View Royal")
  3. Service queries filter by municipality_id so data from different towns never leaks across contexts
  4. RAG answers reference the correct municipality name in system prompts and citations
  5. PR #36 is merged to main after PRs #35 and #37 with no regressions
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Subscriptions & Notifications
**Goal**: Citizens can create accounts, subscribe to matters and councillors they care about, manage their preferences, and receive email notifications when subscribed items have new activity
**Depends on**: Phase 2
**Requirements**: SUB-01, SUB-02, SUB-06, SUB-07, SUB-08, SUB-09, SUB-10, SUB-11, SUB-12
**Success Criteria** (what must be TRUE):
  1. A new user can sign up with email, verify their account, and log in (public signup works, not admin-only)
  2. A logged-in user can subscribe to a specific matter and receive an email when that matter has new activity
  3. A logged-in user can subscribe to a specific councillor and receive an email when that councillor has new motions or votes
  4. A user can view and manage all their subscriptions from a settings page (change frequency, unsubscribe)
  5. Email delivery works end-to-end through Resend via Supabase Edge Function (emails arrive in inbox, not spam)
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD
- [ ] 03-03: TBD

### Phase 4: Home Page Enhancements
**Goal**: The home page surfaces what is happening in council right now — active matters, recent decisions, and upcoming meetings — so returning visitors get immediate value without navigating deeper
**Depends on**: Phase 2
**Requirements**: HOME-01, HOME-02, HOME-03, HOME-04, HOME-05
**Success Criteria** (what must be TRUE):
  1. Home page shows 5-6 recently-active matters with title, category badge, duration, and summary — ordered by last activity
  2. Home page shows the last 10-15 non-procedural motions with plain English summary, result, vote breakdown, and link to the meeting
  3. Home page shows upcoming meetings with agenda topic preview (not just date/title)
  4. Divided votes are visually highlighted in the decisions feed so contentious items stand out
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: Advanced Subscriptions
**Goal**: Users can subscribe to topics and neighbourhoods for targeted notifications, and all subscribers receive a weekly digest summarizing council activity
**Depends on**: Phase 3
**Requirements**: SUB-03, SUB-04, SUB-05
**Success Criteria** (what must be TRUE):
  1. A user can subscribe to a topic or category and receive email when matching agenda items or motions appear
  2. A user can subscribe to a neighbourhood and receive email when geographically relevant matters are discussed
  3. All subscribers receive a weekly digest email summarizing the past week of council activity (personalized if they have subscriptions, generic otherwise)
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5
Note: Phase 4 can execute in parallel with Phase 3 (both depend on Phase 2, not each other).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema Foundation | 0/2 | Complete    | 2026-02-16 |
| 2. Multi-Tenancy | 0/? | Not started | - |
| 3. Subscriptions & Notifications | 0/? | Not started | - |
| 4. Home Page Enhancements | 0/? | Not started | - |
| 5. Advanced Subscriptions | 0/? | Not started | - |
