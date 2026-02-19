---
phase: 10-add-better-test-suite
plan: 04
subsystem: testing
tags: [pytest, responses, syrupy, mocking, scrapers, vimeo, stance-generator, orchestrator]

# Dependency graph
requires:
  - phase: 10-01
    provides: "Test infrastructure (conftest.py, fixtures, mock_supabase, mock_gemini)"
provides:
  - "CivicWebClient and CivicWebScraper tests with HTTP mocking"
  - "BaseScraper, MunicipalityConfig, and scraper registry tests"
  - "VimeoClient API interaction tests"
  - "Stance generator unit tests with category normalization and snapshot testing"
  - "Archiver orchestrator tests with phase coordination and CLI flag coverage"
affects: [10-add-better-test-suite]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "responses library @responses.activate for HTTP mocking in scraper/video tests"
    - "Per-table mock_supabase side_effect pattern for testing functions that query multiple tables"
    - "Syrupy snapshot testing for AI output structure validation"
    - "Fixture-based Archiver dependency patching (mock_orchestrator_deps)"

key-files:
  created:
    - apps/pipeline/tests/scrapers/test_base.py
    - apps/pipeline/tests/scrapers/test_civicweb.py
    - apps/pipeline/tests/video/test_vimeo.py
    - apps/pipeline/tests/profiling/test_stance_generator.py
    - apps/pipeline/tests/orchestrator/test_orchestrator.py
  modified: []

key-decisions:
  - "CivicWeb scraper registered in orchestrator.py (not scrapers/__init__.py) -- tests verify legistar and static_html only from registry"
  - "VimeoClient tests use __new__ + manual attribute setup to avoid __init__ side effects (config module access)"
  - "Syrupy snapshots gitignored per project convention -- regenerated on first test run"
  - "Per-table Supabase mock with .not_ attribute chaining for _gather_evidence which queries both key_statements and votes tables"

patterns-established:
  - "mock_orchestrator_deps fixture: patches create_client, LocalDiarizer, VimeoClient, CivicWebScraper for Archiver tests"
  - "_make_chainable_table helper: creates per-table Supabase mocks with fluent API + .not_.is_() support"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-02-19
---

# Phase 10 Plan 04: Outer Pipeline Tests Summary

**108 tests covering scrapers (CivicWeb, base, registry), Vimeo client, stance generator (category normalization, Gemini mocking, snapshots), and Archiver orchestrator (phase coordination, CLI flags, progress tracking)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-19T02:15:31Z
- **Completed:** 2026-02-19T02:22:12Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- 45 tests for scrapers and video: CivicWebClient HTTP mocking, pagination, error handling; CivicWebScraper file download logic; BaseScraper abstract enforcement; scraper registry; VimeoClient video map, search, download skip logic
- 42 tests for stance generator: all 8 topic normalizations, confidence thresholds, JSON parsing (markdown fencing, required fields), prompt building (confidence qualifiers), quote enrichment, mocked Gemini calls with retry, evidence gathering with per-table Supabase mocks
- 21 tests for Archiver: initialization (with/without municipality, diarizer failure), phase coordination (run with skip_docs/skip_ingest/skip_embed/rediarize), audio file collection, target resolution, backfill progress persistence, stance/highlights generation delegation

## Task Commits

Each task was committed atomically:

1. **Task 1: Scraper and video client tests** - `b23f1091` (test)
2. **Task 2: Profiling and orchestrator tests** - `d3d8fd96` (test)

## Files Created/Modified
- `apps/pipeline/tests/scrapers/__init__.py` - Package init for scraper tests
- `apps/pipeline/tests/scrapers/test_base.py` - MunicipalityConfig, ScrapedMeeting, BaseScraper, registry tests (13 tests)
- `apps/pipeline/tests/scrapers/test_civicweb.py` - CivicWebClient HTTP mocking and CivicWebScraper file download tests (19 tests)
- `apps/pipeline/tests/video/__init__.py` - Package init for video tests
- `apps/pipeline/tests/video/test_vimeo.py` - VimeoClient API interaction tests (13 tests)
- `apps/pipeline/tests/profiling/__init__.py` - Package init for profiling tests
- `apps/pipeline/tests/profiling/test_stance_generator.py` - Stance generation unit tests with snapshot testing (42 tests)
- `apps/pipeline/tests/orchestrator/__init__.py` - Package init for orchestrator tests
- `apps/pipeline/tests/orchestrator/test_orchestrator.py` - Archiver phase coordination and CLI flag tests (21 tests)

## Decisions Made
- CivicWeb scraper registration happens in `orchestrator.py` via `register_scraper("civicweb", CivicWebScraper)` as a module-level side effect, not in `scrapers/__init__.py`. Tests only verify legistar and static_html from the registry since those are registered at `scrapers/__init__.py` import time.
- VimeoClient tests use `__new__` + manual attribute setup rather than calling `__init__` to avoid config module side effects and environment variable dependencies.
- Syrupy snapshot files are gitignored per project convention (`.gitignore` has `__snapshots__/`). Snapshots regenerate on first `--snapshot-update` run.
- `_gather_evidence` queries both `key_statements` and `votes` tables sequentially. The standard `mock_supabase` fixture returns the same data for all tables, so a per-table side_effect mock was created for the evidence filtering test.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test_builtin_scrapers_registered assertion**
- **Found during:** Task 1 (Scraper tests)
- **Issue:** Test asserted `"civicweb" in SCRAPER_REGISTRY` but civicweb is registered in orchestrator.py (not imported during test), only legistar and static_html are registered in scrapers/__init__.py
- **Fix:** Updated assertion to only check legistar and static_html, added docstring explaining the registration location
- **Files modified:** apps/pipeline/tests/scrapers/test_base.py
- **Committed in:** b23f1091

**2. [Rule 1 - Bug] Fixed _gather_evidence mock for multi-table queries**
- **Found during:** Task 2 (Profiling tests)
- **Issue:** `mock_supabase` conftest fixture returns same mock for all `.table()` calls, but `_gather_evidence` calls `.table("key_statements")` then `.table("votes")` and needs different data per table. Also `.not_.is_()` chaining pattern wasn't supported.
- **Fix:** Created `_make_chainable_table` helper with per-table side_effect and `.not_` attribute support
- **Files modified:** apps/pipeline/tests/profiling/test_stance_generator.py
- **Committed in:** d3d8fd96

---

**Total deviations:** 2 auto-fixed (2 bugs in test assertions/mocks)
**Impact on plan:** Both fixes necessary for test correctness. No scope creep.

## Issues Encountered
None - all tests written and passing as planned.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 pipeline module groups now have tests: core, ingestion, scrapers, video, profiling, orchestrator
- Ready for Plan 05 (if it exists) or phase completion
- Pre-existing test failures in test_marker_ocr (missing PDF file), test_document_extractor (API changed), test_embed (API changed) are unrelated to this plan's changes

## Self-Check: PASSED

All 9 created files verified on disk. Both task commits (b23f1091, d3d8fd96) found in git history.

---
*Phase: 10-add-better-test-suite*
*Completed: 2026-02-19*
