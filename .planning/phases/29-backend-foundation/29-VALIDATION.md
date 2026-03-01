---
phase: 29
slug: backend-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-02-28
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web app) |
| **Config file** | `apps/web/vitest.config.ts` or "none — Wave 0 installs" |
| **Quick run command** | `cd apps/web && pnpm test` |
| **Full suite command** | `cd apps/web && pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && pnpm test`
- **After every plan wave:** Run `cd apps/web && pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 1 | AGNT-03 | unit | `cd apps/web && pnpm test` | ❌ W0 | ⬜ pending |
| 29-02-01 | 02 | 1 | AGNT-01 | unit | `cd apps/web && pnpm test` | ❌ W0 | ⬜ pending |
| 29-02-02 | 02 | 1 | AGNT-02 | unit | `cd apps/web && pnpm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test infrastructure setup if not already present
- [ ] Stub test files for bylaw search RPC
- [ ] Stub test files for agent reasoning/tool summary functions

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Thinking display shows WHY agent chose each tool | AGNT-01 | UI rendering in SSE stream | Ask a multi-source query, verify thought bubbles explain tool selection rationale |
| Tool summaries show count + relevance context | AGNT-02 | Requires live Supabase data | Ask about parking fees, verify summary says "Found N motions about parking..." |
| Bylaw search returns relevant content | AGNT-03 | Requires live bylaw data | Ask about zoning rules, verify bylaw content in answer |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
