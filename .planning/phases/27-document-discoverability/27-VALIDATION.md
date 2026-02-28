---
phase: 27
slug: document-discoverability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-02-28
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/web && pnpm test -- --run` |
| **Full suite command** | `cd apps/web && pnpm test -- --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && pnpm test -- --run`
- **After every plan wave:** Run `cd apps/web && pnpm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | DOCL-01 | unit (service mock) | `cd apps/web && pnpm test -- --run tests/services/meetings.test.ts` | Wave 0 (extend existing) | ⬜ pending |
| 27-01-02 | 01 | 1 | DOCL-01 | unit (component logic) | `cd apps/web && pnpm test -- --run tests/components/DocumentSections.test.ts` | Wave 0 | ⬜ pending |
| 27-02-01 | 02 | 1 | DOCL-02 | unit (service mock) | `cd apps/web && pnpm test -- --run tests/services/matters.test.ts` | Wave 0 | ⬜ pending |
| 27-02-02 | 02 | 1 | DOCL-02 | manual-only | Visual inspection | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/services/matters.test.ts` — test `getDocumentsForAgendaItems` service function (covers DOCL-02)
- [ ] `tests/components/DocumentSections.test.ts` — test URL construction logic (covers DOCL-01)

*Note: Existing `tests/services/meetings.test.ts` pattern provides the exact mock approach needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Matter page renders document chips per timeline entry | DOCL-02 | React component rendering with complex state — Vitest alone cannot render without additional setup | Navigate to a matter with linked documents, verify each timeline entry shows document chips grouped by meeting date |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
