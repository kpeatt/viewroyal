---
phase: 01-schema-foundation
plan: 02
subsystem: pipeline
tags: [key-statements, ai-refiner, extraction-prompt, speaker-attribution, ingestion]

# Dependency graph
requires:
  - "01-01: Schema alignment with halfvec(384), tsvector FTS, key_statements table"
provides:
  - "Improved key statement extraction with nullable speaker, max 6 per item, unique timestamps"
  - "Stricter speaker attribution rules (no combined names)"
  - "Key statement ingestion with person_id resolution and deduplication on re-ingest"
affects: [02-council-member-profiles, 03-subscriptions, 04-home-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "KeyStatement.speaker is nullable (str | None) for correspondence or unclear attribution"
    - "Extraction prompt limits key statements to 6 per agenda item"
    - "Each key statement must have a unique timestamp"
    - "Speaker attribution must be exactly one person per statement"

key-files:
  created: []
  modified:
    - "apps/pipeline/pipeline/ingestion/ai_refiner.py"
    - "apps/pipeline/pipeline/ingestion/ingester.py"

key-decisions:
  - "Took PR #37 versions for all overlapping conflict sections (nullable speaker, simpler field syntax, stricter prompt)"
  - "Removed duplicate key_statements deletion block introduced by merge of both PRs"
  - "Pre-existing corrected_text_content references in scripts/ are out-of-scope (maintenance scripts, not core pipeline)"

patterns-established:
  - "Key statement speaker field is nullable for non-attributed statements (correspondence, unclear)"
  - "AI prompt enforces max 6 key statements per item with unique timestamps"
  - "Speaker attribution is exactly one person -- never combined names"

requirements-completed: [KS-01, KS-02]

# Metrics
duration: 4min
completed: 2026-02-16
---

# Phase 1 Plan 2: Key Statement Prompts Summary

**Merged PR #37 with conflict resolution: nullable speaker, max 6 statements per item, unique timestamps, and single-speaker attribution rules for key statement extraction**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-16T21:54:06Z
- **Completed:** 2026-02-16T21:57:56Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Merged PR #37 (fix/key-statement-prompts) into main, resolving 5 merge conflicts in ai_refiner.py and 2 in ingester.py
- KeyStatement.speaker is now `str | None` (nullable) for correspondence or unclear attribution
- Extraction prompt enforces max 6 key statements per item with unique timestamps
- Speaker attribution rules forbid combining names (e.g. "Tobias/Lemon" is wrong)
- Key statement ingestion uses PR #37's cleaner version with person_id resolution
- Validated full Phase 1 with typecheck (only pre-existing workers/app.ts error remains)
- Confirmed both PRs #35 and #37 are merged ancestors of main

## Task Commits

Each task was committed atomically:

1. **Task 1: Merge PR #37 with conflict resolution** - `de72cfc4` (merge)
2. **Task 2: Validate complete phase and run typecheck** - No commit (validation only, no file changes)

## Files Created/Modified
- `apps/pipeline/pipeline/ingestion/ai_refiner.py` - KeyStatement model with nullable speaker, improved extraction prompt with 6-statement limit, unique timestamps, and single-speaker attribution
- `apps/pipeline/pipeline/ingestion/ingester.py` - Key statement ingestion with person_id resolution, deduplication on re-ingest

## Decisions Made
- **Took PR #37 for all conflicts:** PR #37 had improved versions of all overlapping sections (nullable speaker, simpler list syntax, stricter prompt rules)
- **Removed duplicate deletion block:** Both PRs added key_statements deletion on re-ingest; the merge resulted in a duplicate block that was removed (Rule 1 auto-fix)
- **Pre-existing script references out of scope:** corrected_text_content references in apps/pipeline/scripts/ are maintenance scripts, not core pipeline code

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed duplicate key_statements deletion block in ingester.py**
- **Found during:** Task 1 (Merge conflict resolution)
- **Issue:** Both PR #35 and PR #37 independently added key_statements deletion on re-ingest. After merge, two identical deletion loops existed (lines 1498-1502 and 1527-1531)
- **Fix:** Removed the second duplicate block, keeping the first one that runs before motions cleanup
- **Files modified:** apps/pipeline/pipeline/ingestion/ingester.py
- **Verification:** grep confirmed single key_statements delete call remains
- **Committed in:** de72cfc4 (merge commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary fix for correctness -- duplicate deletion would waste API calls. No scope creep.

## Issues Encountered
- Pre-existing type error in `workers/app.ts` (ScheduledEvent type mismatch) causes `pnpm typecheck` to exit non-zero. This is NOT introduced by PR #37 and was already documented in Plan 01-01. Does not block execution.
- Pre-existing `corrected_text_content` references in `apps/pipeline/scripts/` maintenance scripts are out of scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 1 (Schema Foundation) is fully complete: PRs #35 and #37 merged
- Ready for Phase 2 (Council Member Profiles) which depends on the key_statements and schema alignment
- Next PR in merge chain is #36 (council member profiles) then #13 (subscriptions)
- The pre-existing workers/app.ts type error should be tracked but does not block further work

## Self-Check: PASSED

- All key files verified present (2/2)
- All commits verified in git log (1/1)

---
*Phase: 01-schema-foundation*
*Completed: 2026-02-16*
