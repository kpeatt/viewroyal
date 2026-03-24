---
phase: 38
slug: rag-intelligence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing) |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/web && pnpm test -- --run` |
| **Full suite command** | `cd apps/web && pnpm test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && pnpm test -- --run`
- **After every plan wave:** Run `cd apps/web && pnpm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | SRCH-02 | unit | `cd apps/web && pnpm test -- --run tests/services/tool-consolidation.test.ts` | Wave 0 | pending |
| 38-01-02 | 01 | 1 | SRCH-02 | unit | `cd apps/web && pnpm test -- --run tests/services/tool-consolidation.test.ts` | Wave 0 | pending |
| 38-01-03 | 01 | 1 | SRCH-02 | unit | `cd apps/web && pnpm test -- --run tests/services/tool-consolidation.test.ts` | Wave 0 | pending |
| 38-02-01 | 02 | 2 | SRCH-01 | unit | `cd apps/web && pnpm test -- --run tests/services/reranking.test.ts` | Wave 0 | pending |
| 38-02-02 | 02 | 2 | SRCH-01 | unit | `cd apps/web && pnpm test -- --run tests/services/reranking.test.ts` | Wave 0 | pending |
| 38-02-03 | 02 | 2 | SRCH-01 | manual | Visual inspection of research steps UI | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/tests/services/tool-consolidation.test.ts` — stubs for SRCH-02 (consolidated tool shape, tool count, prompt date injection)
- [ ] `apps/web/tests/services/reranking.test.ts` — stubs for SRCH-01 (reranking function, threshold filtering, trace metadata)

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reranking step visible in research steps UI | SRCH-01 | Visual animation behavior | Ask a question in the AI chat, verify "Ranked N sources -> M most relevant" step appears |
| Answer quality maintained vs baseline | SRCH-01, SRCH-02 | Subjective quality assessment | Run eval set, compare scores to Phase 37 baseline in rag_feedback |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
