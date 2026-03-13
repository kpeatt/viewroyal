---
phase: 39-council-intelligence
plan: 02
subsystem: pipeline
tags: [key-votes, ai-profiles, gemini, supabase, profiling, detection-algorithm]

requires:
  - phase: 09-ai-profiling
    provides: councillor_highlights table, stance_generator.py patterns, profile_agent.py
provides:
  - Key vote detection algorithm (minority, close, ally break) with composite scoring
  - AI narrative profile generation (2-3 paragraph Gemini summaries)
  - key_votes table with RLS and indexes
  - councillor_highlights.narrative column for enhanced profiles
  - CLI flags --detect-key-votes and --generate-profiles
affects: [39-03 profile page redesign, 40 UX polish]

tech-stack:
  added: []
  patterns:
    - "Pairwise alignment computation for ally break detection"
    - "Composite scoring formula for key vote ranking"
    - "Multi-source evidence synthesis for narrative generation"

key-files:
  created:
    - apps/pipeline/pipeline/profiling/key_vote_detector.py
    - apps/pipeline/tests/profiling/test_key_vote_detector.py
    - supabase/migrations/39-key-votes-table.sql
  modified:
    - apps/pipeline/pipeline/profiling/stance_generator.py
    - apps/pipeline/main.py

key-decisions:
  - "Vote counts computed from votes table, not motions.yes_votes/no_votes (per Pitfall 5)"
  - "Ally alignment threshold set at 80% with minimum 5 shared votes"
  - "Composite score: minority*3 + closeness*2 + ally_breaks*1"
  - "Narrative stored in new councillor_highlights.narrative column (existing overview untouched)"
  - "Context summaries generated via Gemini with template fallback"

patterns-established:
  - "Key vote detector: fetch all votes -> compute counts -> run 3 detection patterns -> score -> upsert"
  - "Narrative generator: gather multi-source evidence -> build synthesis prompt -> Gemini -> upsert"

requirements-completed: [CNCL-02, CNCL-03]

duration: 5min
completed: 2026-03-13
---

# Phase 39 Plan 02: Key Vote Detection + AI Narrative Profiles Summary

**Algorithmic key vote detection (minority/close/ally-break patterns with composite scoring) and Gemini-powered 2-3 paragraph councillor narrative profiles stored in councillor_highlights**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-13T05:11:48Z
- **Completed:** 2026-03-13T05:17:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Key vote detection algorithm covering all 3 required patterns with composite scoring for ranking
- 30 unit tests for detection, scoring, alignment, and edge cases (all passing)
- AI narrative profile generation synthesizing stances, key votes, speaking patterns, and highlights
- CLI flags --detect-key-votes and --generate-profiles wired into pipeline main.py

## Task Commits

Each task was committed atomically:

1. **Task 1: Key votes migration + detector with tests** - `9acd6aa9` (feat)
2. **Task 2: Enhanced AI profile narrative + CLI flags** - `6ab941cf` (feat)

## Files Created/Modified
- `supabase/migrations/39-key-votes-table.sql` - key_votes table, RLS, indexes, narrative column on councillor_highlights
- `apps/pipeline/pipeline/profiling/key_vote_detector.py` - 3-pattern detection algorithm with composite scoring
- `apps/pipeline/tests/profiling/test_key_vote_detector.py` - 30 unit tests for all detection patterns
- `apps/pipeline/pipeline/profiling/stance_generator.py` - Added generate_councillor_narratives() for rich AI profiles
- `apps/pipeline/main.py` - Added --detect-key-votes and --generate-profiles CLI flags

## Decisions Made
- Vote counts always computed from votes table (not motions.yes_votes/no_votes) to handle data quality issues per Pitfall 5
- Ally alignment threshold 80% with minimum 5 shared votes - balances sensitivity vs false positives
- Composite score formula weights minority position highest (3x), closeness second (2x), ally breaks third (1x)
- Narrative column added alongside existing overview (backward compatible - existing code unaffected)
- Context summaries use Gemini with template fallback for when Gemini is unavailable

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Migration needs to be applied to production database.

## Next Phase Readiness
- Key votes and narrative profiles are pipeline-computed and stored in DB
- 39-03 (profile page redesign) can query key_votes table and councillor_highlights.narrative
- Both features accessible via CLI for manual or automated pipeline runs

---
*Phase: 39-council-intelligence*
*Completed: 2026-03-13*
