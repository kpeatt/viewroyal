---
phase: 39
slug: council-intelligence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (Python pipeline) |
| **Config file** | `apps/pipeline/pytest.ini` |
| **Quick run command** | `cd apps/pipeline && uv run pytest tests/profiling/ -x` |
| **Full suite command** | `cd apps/pipeline && uv run pytest` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/pipeline && uv run pytest tests/profiling/ -x`
- **After every plan wave:** Run `cd apps/pipeline && uv run pytest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | CNCL-01 | unit | `cd apps/pipeline && uv run pytest tests/profiling/test_topic_classifier.py -x` | ❌ W0 | ⬜ pending |
| 39-01-02 | 01 | 1 | CNCL-01 | unit (mocked) | `cd apps/pipeline && uv run pytest tests/profiling/test_topic_classifier.py::test_gemini_fallback -x` | ❌ W0 | ⬜ pending |
| 39-02-01 | 02 | 2 | CNCL-02 | unit (mocked) | `cd apps/pipeline && uv run pytest tests/profiling/test_stance_generator.py -x` | ✅ (existing) | ⬜ pending |
| 39-02-02 | 02 | 2 | CNCL-03 | unit | `cd apps/pipeline && uv run pytest tests/profiling/test_key_vote_detector.py -x` | ❌ W0 | ⬜ pending |
| 39-02-03 | 02 | 2 | CNCL-03 | unit | `cd apps/pipeline && uv run pytest tests/profiling/test_key_vote_detector.py::test_composite_score -x` | ❌ W0 | ⬜ pending |
| 39-03-01 | 03 | 2 | CNCL-04 | manual-only | Manual browser check | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/profiling/test_topic_classifier.py` — stubs for CNCL-01 (classification logic + Gemini fallback)
- [ ] `tests/profiling/test_key_vote_detector.py` — stubs for CNCL-03 (minority, close vote, ally break detection, composite scoring)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Profile page renders new tabs (Profile, Policy, Key Votes) | CNCL-04 | UI layout verification requires visual inspection | 1. Navigate to `/council/[person-slug]` 2. Verify tabs appear: Profile, Policy, Key Votes, Votes, Speaking, Attendance 3. Check Profile tab shows AI narrative + stats 4. Check Policy tab shows StanceSummary cards by topic 5. Check Key Votes tab shows ranked key vote cards |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
