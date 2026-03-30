---
phase: 41
slug: data-isolation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/web && pnpm vitest run --reporter=verbose` |
| **Full suite command** | `cd apps/web && pnpm vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && pnpm vitest run --reporter=verbose`
- **After every plan wave:** Run `cd apps/web && pnpm vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 41-01-01 | 01 | 1 | SCOPE-01 | unit | `cd apps/web && pnpm vitest run tests/services/municipality-scoping.test.ts -x` | ❌ W0 | ⬜ pending |
| 41-02-01 | 02 | 1 | SCOPE-02 | unit | `cd apps/web && pnpm vitest run tests/services/hybrid-search-scoping.test.ts -x` | ❌ W0 | ⬜ pending |
| 41-02-02 | 02 | 1 | SCOPE-03 | unit | `cd apps/web && pnpm vitest run tests/services/rag-scoping.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/services/municipality-scoping.test.ts` — covers SCOPE-01: verify `.eq("municipality_id", ...)` called on direct tables, verify `meetings!inner` pattern on join tables
- [ ] `tests/services/hybrid-search-scoping.test.ts` — covers SCOPE-02: verify `filter_municipality_id` passed to RPCs
- [ ] `tests/services/rag-scoping.test.ts` — covers SCOPE-03: verify RAG tool functions receive and use municipality_id

*Test strategy: Use existing mock Supabase pattern from `tests/services/meetings.test.ts` — `createMockQueryBuilder` and `createMockSupabase` helpers.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end data isolation on live site | SCOPE-01..03 | Requires real multi-municipality data in DB | After Phase 42, verify esquimalt.viewroyal.ai shows only Esquimalt data |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
