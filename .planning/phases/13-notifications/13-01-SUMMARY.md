---
phase: 13-notifications
plan: 01
subsystem: pipeline
tags: [moshi, push-notifications, update-mode, requests]

# Dependency graph
requires:
  - phase: 12-update-detection
    provides: ChangeReport dataclass and run_update_mode() orchestrator method
provides:
  - Moshi push notification module (notifier.py) with send_update_notification()
  - MOSHI_TOKEN env var in pipeline config
affects: [14-scheduling]

# Tech tracking
tech-stack:
  added: [Moshi push API]
  patterns: [lazy-import notification at end of pipeline mode, env-var-as-feature-toggle]

key-files:
  created:
    - apps/pipeline/pipeline/notifier.py
    - apps/pipeline/tests/pipeline/test_notifier.py
  modified:
    - apps/pipeline/pipeline/config.py
    - apps/pipeline/pipeline/orchestrator.py

key-decisions:
  - "MOSHI_TOKEN env var is the sole on/off switch for notifications -- no CLI flag needed"
  - "Notifications only fire in update-mode (run_update_mode), not check-mode (run_update_check)"

patterns-established:
  - "Env var as feature toggle: missing token silently disables feature, no crash"
  - "Notification at end of pipeline mode: lazy import + call after processing complete"

requirements-completed: [NOTIF-01, NOTIF-02]

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 13 Plan 01: Notifications Summary

**Moshi push notification module sending operator phone alerts when update-mode detects and processes new meeting content**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-20T01:25:37Z
- **Completed:** 2026-02-20T01:28:08Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created notifier.py module with send_update_notification() that formats ChangeReport into concise meeting summaries
- Wired notifier into orchestrator's run_update_mode() with lazy import pattern
- MOSHI_TOKEN env var serves as feature toggle -- missing token silently disables notifications
- Message truncation at 5 meetings with "+N more" for large change sets
- Graceful error handling -- HTTP failures never crash the pipeline

## Task Commits

Each task was committed atomically:

1. **Task 1: Create notifier module with Moshi push notification and tests** - `d88bf840` (feat)
2. **Task 2: Wire notifier into orchestrator run_update_mode** - `14c8f261` (feat)

## Files Created/Modified
- `apps/pipeline/pipeline/notifier.py` - Moshi push notification module with send_update_notification() and _format_change_line()
- `apps/pipeline/tests/pipeline/test_notifier.py` - 6 tests covering send, skip, error handling, truncation, and format
- `apps/pipeline/pipeline/config.py` - Added MOSHI_TOKEN env var
- `apps/pipeline/pipeline/orchestrator.py` - Added notifier call at end of run_update_mode()

## Decisions Made
- MOSHI_TOKEN env var is the sole on/off switch -- no --notify CLI flag needed, keeping the interface simple
- Notifications only fire in update-mode (run_update_mode), not check-mode (run_update_check) since check is a dry-run
- Lazy import pattern used in orchestrator to match existing convention (same as UpdateDetector import)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - MOSHI_TOKEN is already set in the operator's environment (used by other tools). No new external service configuration needed.

## Next Phase Readiness
- Notification module ready for Phase 14 (scheduling) -- when cron runs update-mode, operator gets phone alerts automatically
- No blockers or concerns

---
*Phase: 13-notifications*
*Completed: 2026-02-20*
