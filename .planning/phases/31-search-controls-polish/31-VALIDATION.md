---
phase: 31
slug: search-controls-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-01
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/web && pnpm vitest run --run` |
| **Full suite command** | `cd apps/web && pnpm vitest run --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && pnpm vitest run --run`
- **After every plan wave:** Run `cd apps/web && pnpm vitest run --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 31-01-01 | 01 | 1 | SRCH-01 | unit | `cd apps/web && pnpm vitest run tests/lib/date-range.test.ts -x` | ❌ W0 | ⬜ pending |
| 31-01-02 | 01 | 1 | SRCH-02 | unit | `cd apps/web && pnpm vitest run tests/lib/search-params.test.ts -x` | ❌ W0 | ⬜ pending |
| 31-01-03 | 01 | 1 | SRCH-03 | unit | `cd apps/web && pnpm vitest run tests/services/hybrid-search-sort.test.ts -x` | ❌ W0 | ⬜ pending |
| 31-01-04 | 01 | 1 | SRCH-04 | unit | `cd apps/web && pnpm vitest run tests/lib/search-params.test.ts -x` | ❌ W0 | ⬜ pending |
| 31-02-01 | 02 | 1 | ANSR-01 | manual | N/A | N/A | ⬜ pending |
| 31-02-02 | 02 | 1 | ANSR-02 | manual | N/A | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/date-range.test.ts` — stubs for SRCH-01 (date boundary calculations)
- [ ] `tests/lib/search-params.test.ts` — stubs for SRCH-02, SRCH-04 (URL param serialization round-trip)
- [ ] `tests/services/hybrid-search-sort.test.ts` — stubs for SRCH-03 (sort ordering logic)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Source panel collapsed by default | ANSR-01 | Visual UI state, no server logic | Load AI answer, verify source panel shows count header collapsed |
| Follow-up as collapsible vertical pills | ANSR-02 | Visual UI layout | Load AI answer with follow-ups, verify Related section with pill buttons |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
