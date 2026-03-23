---
phase: 40
slug: ux-polish-email
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-23
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (web app), manual testing (Edge Function) |
| **Config file** | `apps/web/vitest.config.ts` (if exists, else Wave 0) |
| **Quick run command** | `cd apps/web && pnpm typecheck` |
| **Full suite command** | `cd apps/web && pnpm typecheck` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && pnpm typecheck`
- **After every plan wave:** Run `cd apps/web && pnpm typecheck` + visual inspection of email HTML
- **Before `/gsd:verify-work`:** Full typecheck must be green + manual email inspection
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 40-01-01 | 01 | 1 | MTGX-03 | manual-only | N/A — already implemented | N/A | ✅ green |
| 40-01-02 | 01 | 1 | MTGX-04 | smoke | `cd apps/web && pnpm typecheck` | ✅ | ⬜ pending |
| 40-02-01 | 02 | 1 | MAIL-01 | manual-only | `curl /api/digest?meeting_id=X` | N/A | ⬜ pending |
| 40-02-02 | 02 | 1 | MAIL-02 | manual-only | Trigger Edge Function, inspect email | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] SQL seed for `municipalities.meta.attendance_info` defaults for View Royal

*Existing infrastructure covers most phase requirements. Email HTML testing requires visual inspection.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Financial data on agenda items | MTGX-03 | Already implemented, visual verification | Visit meeting detail page, check DollarSign chip and Financial Impact section |
| Attendance info on upcoming meetings | MTGX-04 | UI layout verification | Visit home page and meeting detail for an upcoming meeting, verify address/Zoom/public input |
| Redesigned digest email | MAIL-01 | Email rendering is visual | Run `curl /api/digest?meeting_id=X`, inspect HTML in browser + mobile viewport |
| Upcoming meeting in digest + pre-meeting | MAIL-02 | Email rendering is visual | Trigger Edge Function, verify received email shows "Coming Up" footer and pre-meeting has full agenda |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
