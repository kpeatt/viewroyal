---
phase: 12-update-detection
plan: 02
subsystem: pipeline
tags: [python, etl, cli, update-detection, selective-processing]

# Dependency graph
requires:
  - phase: 12-update-detection
    provides: UpdateDetector module with detect_document_changes() and detect_video_changes()
provides:
  - --check-updates CLI flag for dry-run change detection report
  - --update-mode CLI flag for selective re-processing of changed meetings
  - run_update_check() and run_update_mode() Archiver methods
  - meta field on MeetingChange for carrying video_data through detection pipeline
affects: [13-selective-pipeline, 14-scheduling]

# Tech tracking
tech-stack:
  added: []
  patterns: [lazy-import-for-update-detector, per-meeting-error-isolation]

key-files:
  created: []
  modified:
    - apps/pipeline/main.py
    - apps/pipeline/pipeline/orchestrator.py
    - apps/pipeline/pipeline/update_detector.py
    - apps/pipeline/tests/orchestrator/test_orchestrator.py

key-decisions:
  - "Added meta dict field to MeetingChange dataclass to carry Vimeo video_data through the detection pipeline, avoiding redundant API calls during update-mode processing"
  - "Update mode always downloads audio by default since detecting new video is the primary use case for automated daily runs"

patterns-established:
  - "Update mode pattern: scrape -> detect -> selective re-process only changed meetings"

requirements-completed: [DETECT-03]

# Metrics
duration: 3min
completed: 2026-02-20
---

# Phase 12 Plan 02: CLI Integration Summary

**--check-updates and --update-mode CLI flags wiring UpdateDetector into the pipeline for daily automated change detection and selective re-processing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-20T01:00:29Z
- **Completed:** 2026-02-20T01:04:06Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Wired UpdateDetector into Archiver with run_update_check() (dry-run report) and run_update_mode() (selective re-processing)
- Added --check-updates and --update-mode CLI flags to main.py for operator use
- Added meta field to MeetingChange for carrying video_data to avoid redundant Vimeo API calls
- 4 new integration tests covering update check report, selective processing, no-changes skip, and skip-embed behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Add update check and update mode methods to Archiver** - `d33de1b7` (feat)
2. **Task 2: Add CLI flags and wire integration + tests** - `7c9c53e7` (feat)

## Files Created/Modified
- `apps/pipeline/pipeline/orchestrator.py` - Added run_update_check() and run_update_mode() methods to Archiver class
- `apps/pipeline/pipeline/update_detector.py` - Added meta dict field to MeetingChange, stored video_data in detect_video_changes()
- `apps/pipeline/main.py` - Added --check-updates and --update-mode CLI arguments with routing logic
- `apps/pipeline/tests/orchestrator/test_orchestrator.py` - Added TestRunUpdateCheck and TestRunUpdateMode test classes (4 tests)

## Decisions Made
- Added a `meta` dict field to MeetingChange dataclass to carry Vimeo video_data through the detection pipeline. This avoids a second Vimeo API call during update-mode processing since the video data (title, URI) is already available from detection.
- Update mode always downloads audio by default (`download_audio=True`) since the primary use case is automated daily runs where new video content should be fully processed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Video processing test initially failed because `os.makedirs` on absolute paths (`/archive/...`) hit a read-only filesystem. Fixed by using `tmp_path` fixture for test archive paths.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full update detection pipeline is operational: `uv run python main.py --check-updates` for dry-run, `uv run python main.py --update-mode` for automated processing
- Ready for Phase 13 (selective pipeline) and Phase 14 (scheduling/automation)
- DETECT-01 (document detection), DETECT-02 (video detection), and DETECT-03 (selective re-processing) all complete

## Self-Check: PASSED

- FOUND: apps/pipeline/main.py
- FOUND: apps/pipeline/pipeline/orchestrator.py
- FOUND: apps/pipeline/pipeline/update_detector.py
- FOUND: apps/pipeline/tests/orchestrator/test_orchestrator.py
- FOUND: 12-02-SUMMARY.md
- FOUND: commit d33de1b7
- FOUND: commit 7c9c53e7

---
*Phase: 12-update-detection*
*Completed: 2026-02-20*
