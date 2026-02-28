---
phase: 28
slug: document-navigation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-02-28
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | apps/web/vitest.config.ts |
| **Quick run command** | `cd apps/web && pnpm test` |
| **Full suite command** | `cd apps/web && pnpm test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && pnpm test`
- **After every plan wave:** Run `cd apps/web && pnpm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 1 | DOCV-04 | integration | `cd apps/web && pnpm test` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | DOCL-03 | integration | `cd apps/web && pnpm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements.

*Frontend validation is primarily visual/interactive — manual verification supplemented by component-level tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TOC highlights active section on scroll | DOCV-04 | Scroll-spy requires real DOM + viewport | Load doc with 3+ sections, scroll through, verify TOC highlight follows |
| Smooth scroll to section on TOC click | DOCV-04 | Smooth scroll animation is visual | Click each TOC item, verify smooth scroll and section visibility |
| Mobile TOC collapses to top bar | DOCV-04 | Responsive layout requires viewport testing | Resize to <1024px, verify collapsible top bar behavior |
| Cross-reference links navigate correctly | DOCL-03 | Requires actual database cross-references | Load doc with bylaw references, click badge, verify navigation |
| Related Documents section shows all refs | DOCL-03 | End-to-end data flow | View doc with known references, verify all appear in bottom section |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
