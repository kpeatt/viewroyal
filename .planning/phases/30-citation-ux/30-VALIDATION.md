---
phase: 30
slug: citation-ux
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-01
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/web && pnpm test -- --run` |
| **Full suite command** | `cd apps/web && pnpm test -- --run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && pnpm test -- --run`
- **After every plan wave:** Run `cd apps/web && pnpm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | CITE-01 | unit | `cd apps/web && pnpm test -- --run tests/components/citation-grouping.test.ts` | Wave 0 | pending |
| 30-02-01 | 02 | 2 | CITE-02 | unit | `cd apps/web && pnpm test -- --run tests/components/source-preview.test.ts` | Wave 0 | pending |
| 30-02-02 | 02 | 2 | CITE-03 | manual-only | Visual verification | N/A | pending |
| 30-03-01 | 03 | 2 | CITE-04 | unit | `cd apps/web && pnpm test -- --run tests/components/source-markdown-preview.test.ts` | Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `tests/components/citation-grouping.test.ts` -- stubs for CITE-01 (grouping algorithm unit tests)
- [ ] `tests/components/source-preview.test.ts` -- stubs for CITE-02 (type-specific layout tests)
- [ ] `tests/components/source-markdown-preview.test.ts` -- stubs for CITE-04 (markdown rendering + truncation)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Multiple sources render as scrollable stacked list within max-height container | CITE-03 | Layout depends on rendered content height and visual scroll behavior | 1. Trigger AI answer with 5+ sources on a single citation. 2. Hover the grouped pill. 3. Verify internal scroll appears within ~300px container. |
| Mobile bottom sheet swipe dismiss | CITE-02 | Touch gesture testing requires mobile device/emulator | 1. Open search on mobile viewport (<768px). 2. Tap citation pill. 3. Verify half-screen drawer opens. 4. Swipe down to dismiss. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
