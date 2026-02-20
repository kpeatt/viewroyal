---
phase: 12-update-detection
plan: 01
subsystem: pipeline
tags: [python, etl, civicweb, vimeo, change-detection, audit]

# Dependency graph
requires:
  - phase: 10-add-better-test-suite
    provides: Test infrastructure and patterns (conftest.py, mock_supabase fixture)
provides:
  - UpdateDetector class with detect_document_changes() and detect_video_changes()
  - MeetingChange and ChangeReport dataclasses for structured change reporting
  - Lightweight detection module with no heavy dependencies
affects: [12-02, 13-selective-pipeline, 14-scheduling]

# Tech tracking
tech-stack:
  added: []
  patterns: [reuse-existing-audit-logic, lightweight-detection-module]

key-files:
  created:
    - apps/pipeline/pipeline/update_detector.py
    - apps/pipeline/tests/pipeline/test_update_detector.py
  modified: []

key-decisions:
  - "Reused existing find_meetings_needing_reingest() from audit.py for document detection rather than building new scraper-based detection"
  - "Video detection walks archive directory and compares against Vimeo video map by date key"
  - "Module kept lightweight -- no imports of diarizer, Gemini, or other heavy dependencies"

patterns-established:
  - "Detection module pattern: compare remote/DB state against local archive to identify changes"

requirements-completed: [DETECT-01, DETECT-02]

# Metrics
duration: 3min
completed: 2026-02-20
---

# Phase 12 Plan 01: Update Detector Summary

**UpdateDetector module with document and video change detection using existing audit logic and Vimeo API comparison**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-20T00:55:34Z
- **Completed:** 2026-02-20T00:58:09Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created UpdateDetector class that identifies meetings with new documents (disk vs DB comparison) and new video (Vimeo vs local archive)
- Structured change reporting via MeetingChange and ChangeReport dataclasses with human-readable summary output
- 11 comprehensive tests covering document detection, video detection, and combined report generation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create UpdateDetector module** - `6a108075` (feat)
2. **Task 2: Add tests for UpdateDetector** - `8d2bd7ca` (test)

## Files Created/Modified
- `apps/pipeline/pipeline/update_detector.py` - UpdateDetector class with detect_document_changes(), detect_video_changes(), detect_all_changes() methods plus MeetingChange/ChangeReport dataclasses
- `apps/pipeline/tests/pipeline/test_update_detector.py` - 11 tests covering document changes (positive/negative/filtering), video changes (new/skip-audio/skip-transcript/no-videos/no-client), and combined report

## Decisions Made
- Reused `find_meetings_needing_reingest()` from `pipeline.ingestion.audit` for document change detection instead of building new scraper-based detection. This leverages existing tested logic that compares DB flags (has_agenda, has_minutes, has_transcript) against actual disk state.
- For video detection, walk the archive and compare against Vimeo's `get_video_map()` by date key, checking for absence of audio files and transcript JSON -- same pattern used by the orchestrator's `_download_vimeo_content()`.
- Filtered document audit results to only include document-related reasons (agenda/minutes/transcript), excluding status upgrades and missing refinement which are not "new content" detection.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- UpdateDetector module ready for integration into CLI (Plan 12-02)
- detect_document_changes() requires a Supabase client for DB comparison
- detect_video_changes() requires a VimeoClient instance for Vimeo API access
- The module is lightweight and can be imported without triggering heavy dependency chains

## Self-Check: PASSED

- FOUND: apps/pipeline/pipeline/update_detector.py
- FOUND: apps/pipeline/tests/pipeline/test_update_detector.py
- FOUND: 12-01-SUMMARY.md
- FOUND: commit 6a108075
- FOUND: commit 8d2bd7ca

---
*Phase: 12-update-detection*
*Completed: 2026-02-20*
