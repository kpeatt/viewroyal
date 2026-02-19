---
phase: 09-ai-profiling-comparison
plan: 02
subsystem: pipeline
tags: [gemini, ai, stance-generation, profiling, python]

# Dependency graph
requires:
  - phase: 01-schema-foundation
    provides: councillor_stances table schema, people table, key_statements, votes tables
provides:
  - Gemini-powered stance generation pipeline module
  - --generate-stances CLI flag for pipeline
  - Python category-to-topic normalization mirroring SQL function
affects: [09-03, 09-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [lazy-import Gemini SDK in orchestrator, evidence gathering with category normalization, confidence thresholds for AI summaries]

key-files:
  created:
    - apps/pipeline/pipeline/profiling/__init__.py
    - apps/pipeline/pipeline/profiling/stance_generator.py
  modified:
    - apps/pipeline/main.py
    - apps/pipeline/pipeline/orchestrator.py

key-decisions:
  - "Python mirror of normalize_category_to_topic SQL function for evidence gathering (avoids RPC dependency)"
  - "Lazy singleton Gemini client pattern matching gemini_extractor.py"
  - "1-second rate limit between Gemini calls for API safety"
  - "Retry once on malformed JSON responses before skipping"

patterns-established:
  - "Pipeline profiling module pattern: apps/pipeline/pipeline/profiling/"
  - "Evidence gathering with Python-side category normalization"
  - "Confidence thresholds: <3=low, 3-7=medium, 8+=high"

requirements-completed: [PROF-04, PROF-05]

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 9 Plan 02: Stance Generator Pipeline Summary

**Gemini-powered stance generation module with evidence gathering from key_statements and votes, confidence scoring, and --generate-stances CLI flag**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-18T20:55:21Z
- **Completed:** 2026-02-18T20:58:20Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created stance_generator.py (504 lines) with full Gemini integration for generating AI stance summaries per councillor per topic
- Evidence gathering queries key_statements and votes tables, filtering by normalized topic using Python mirror of SQL function
- Confidence thresholds enforced: <3 statements = low (hedged language), 3-7 = medium, 8+ = high
- Pipeline CLI accepts --generate-stances flag with optional --target for single-person generation
- Upsert into councillor_stances with ON CONFLICT handling for idempotency

## Task Commits

Each task was committed atomically:

1. **Task 1: Create stance_generator.py module** - `ef9ab9c6` (feat)
2. **Task 2: Wire stance generation into pipeline CLI and orchestrator** - `1f74c66c` (feat)

## Files Created/Modified
- `apps/pipeline/pipeline/profiling/__init__.py` - Empty package init for profiling module
- `apps/pipeline/pipeline/profiling/stance_generator.py` - Core stance generation: evidence gathering, Gemini prompting, JSON parsing, DB upsert
- `apps/pipeline/main.py` - Added --generate-stances CLI argument and handler
- `apps/pipeline/pipeline/orchestrator.py` - Added Archiver.generate_stances() method with lazy import

## Decisions Made
- Used Python mirror of normalize_category_to_topic SQL function instead of RPC call -- avoids dependency on SQL function being deployed, keeps evidence gathering self-contained
- Lazy singleton pattern for Gemini client matching existing gemini_extractor.py pattern
- 1-second rate limit between API calls as a safety measure
- Max 15 key statements + 10 votes per evidence gather to stay within context window
- JSON retry on malformed response (one retry before skipping)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Uses existing GEMINI_API_KEY environment variable already configured for the pipeline.

## Next Phase Readiness
- Stance generator ready to populate councillor_stances table
- Requires councillor_stances table to exist in database (created by Plan 01 migration)
- Frontend can query pre-computed stances from councillor_stances table for profile pages

## Self-Check: PASSED

All artifacts verified:
- 2/2 created files exist
- 2/2 task commits found (ef9ab9c6, 1f74c66c)
- All key patterns present in files (genai, councillor_stances, generate-stances)
- stance_generator.py: 504 lines (>= 100 min)

---
*Phase: 09-ai-profiling-comparison*
*Completed: 2026-02-18*
