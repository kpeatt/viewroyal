---
phase: 39-council-intelligence
plan: 01
subsystem: pipeline
tags: [topic-classification, gemini, supabase-rpc, python]

# Dependency graph
requires: []
provides:
  - "Topic classification module (classify_topics) for agenda items"
  - "SQL RPC functions for bulk classification and unclassified item queries"
  - "--classify-topics CLI flag in pipeline main.py"
affects: [39-02, 39-03]

# Tech tracking
tech-stack:
  added: []
  patterns: ["SQL-first classification with AI fallback", "RPC-based bulk operations"]

key-files:
  created:
    - apps/pipeline/pipeline/profiling/topic_classifier.py
    - apps/pipeline/tests/profiling/test_topic_classifier.py
    - supabase/migrations/39-01-topic-classification-rpcs.sql
  modified:
    - apps/pipeline/main.py

key-decisions:
  - "SQL-first approach via bulk_classify_topics_by_category RPC, Gemini only for unmapped categories"
  - "Single Gemini call with all distinct unmapped categories rather than per-item calls"
  - "Invalid Gemini topic names fall back to General rather than erroring"

patterns-established:
  - "RPC-based bulk classification: SQL function does heavy lifting, Python orchestrates"

requirements-completed: [CNCL-01]

# Metrics
duration: 4min
completed: 2026-03-12
---

# Phase 39 Plan 01: Topic Classification Summary

**SQL-first + Gemini-fallback topic classifier populating agenda_item_topics for ~12K items via bulk RPC and batched AI classification**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-13T05:11:53Z
- **Completed:** 2026-03-13T05:15:32Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Topic classifier module with SQL-first bulk classification via normalize_category_to_topic() RPC
- Gemini fallback that batches all distinct unmapped categories in a single prompt
- 6 unit tests covering SQL path, Gemini fallback, response parsing, deduplication, single-topic constraint
- CLI flag --classify-topics wired into pipeline main.py

## Task Commits

Each task was committed atomically:

1. **Task 1: Topic classifier with tests (TDD)**
   - `baee4ede` test(39-01): add failing tests for topic classifier
   - `b27b29e3` feat(39-01): implement topic classifier with SQL-first + Gemini fallback
   - `9208b82e` chore(39-01): add SQL RPC functions for topic classification
2. **Task 2: Wire CLI flag and verify integration** - `1fc36be1` feat(39-01): wire --classify-topics CLI flag in main.py

## Files Created/Modified
- `apps/pipeline/pipeline/profiling/topic_classifier.py` - Topic classification logic with classify_topics(), Gemini fallback, bulk insert
- `apps/pipeline/tests/profiling/test_topic_classifier.py` - 6 unit tests for classification paths
- `supabase/migrations/39-01-topic-classification-rpcs.sql` - bulk_classify_topics_by_category() and get_unclassified_agenda_items() RPCs
- `apps/pipeline/main.py` - Added --classify-topics CLI flag

## Decisions Made
- SQL-first approach: bulk_classify_topics_by_category RPC handles the majority of items using the existing normalize_category_to_topic() SQL function
- Single Gemini call for all distinct unmapped categories (rather than per-item) for efficiency
- Invalid Gemini topic names silently fall back to "General" rather than erroring
- Created supabase client inline in main.py handler following generate_stances pattern (no self.supabase on Archiver)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created SQL RPC functions for classification**
- **Found during:** Task 1 (implementation)
- **Issue:** topic_classifier.py calls supabase.rpc("bulk_classify_topics_by_category") and supabase.rpc("get_unclassified_agenda_items") which don't exist yet
- **Fix:** Created migration file with both RPC functions
- **Files modified:** supabase/migrations/39-01-topic-classification-rpcs.sql
- **Verification:** Migration SQL is syntactically correct
- **Committed in:** 9208b82e

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** RPC functions are necessary for the classifier to work. No scope creep.

## Issues Encountered
None

## User Setup Required
Migration `39-01-topic-classification-rpcs.sql` must be applied to Supabase before running `--classify-topics`.

## Next Phase Readiness
- Topic classification module ready for backfill execution
- agenda_item_topics table will be populated once migration is applied and --classify-topics is run
- Plans 02 and 03 can proceed with topic data available

---
*Phase: 39-council-intelligence*
*Completed: 2026-03-12*
