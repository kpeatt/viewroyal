---
phase: 37
slug: eval-foundation-quick-wins
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (via Vite) |
| **Config file** | `apps/web/vite.config.ts` |
| **Quick run command** | `cd apps/web && pnpm exec vitest run --reporter=verbose` |
| **Full suite command** | `cd apps/web && pnpm exec vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && pnpm typecheck`
- **After every plan wave:** Run `cd apps/web && pnpm build`
- **Before `/gsd:verify-work`:** Full suite must be green + manual verification of all 4 success criteria
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 1 | SRCH-04 | manual | Manual: ask question, verify trace row in Supabase | N/A | pending |
| 37-01-02 | 01 | 1 | SRCH-03 | manual | Manual: click thumbs up/down, verify in Supabase dashboard | N/A | pending |
| 37-02-01 | 02 | 1 | MTGX-02 | unit | `cd apps/web && pnpm exec vitest run app/lib/__tests__/motion-utils.test.ts` | No -- W0 | pending |
| 37-02-02 | 02 | 1 | MTGX-01 | manual | Manual: browse /meetings, verify topic chips and tally | N/A | pending |
| 37-02-03 | 02 | 1 | MTGX-02 | manual | Manual: verify badges across MotionsOverview, AgendaOverview, search results | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/app/lib/__tests__/motion-utils.test.ts` -- stubs for MTGX-02 normalization logic
- [ ] Supabase migration for `rag_traces` and `rag_feedback` tables (SRCH-03, SRCH-04)
- [ ] Supabase migration to fix CARRRIED typo in existing data (MTGX-02)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Feedback submission persists to DB | SRCH-03 | Requires Supabase integration + SSE stream | 1. Ask a question on /search 2. Click thumbs up 3. Verify row in rag_feedback table |
| RAG traces logged on every AI answer | SRCH-04 | Requires live Supabase + streaming endpoint | 1. Ask a question on /search 2. Verify row in rag_traces table with query, answer, latency |
| Meeting list shows summary data | MTGX-01 | Requires SSR loader + Supabase RPC | 1. Browse /meetings 2. Verify topic chips, motion tally, summary text on cards |
| Motion badges display correctly across app | MTGX-02 | Multiple components, visual verification | 1. View meeting with motions 2. Check badges in MotionsOverview, AgendaOverview, search results |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
