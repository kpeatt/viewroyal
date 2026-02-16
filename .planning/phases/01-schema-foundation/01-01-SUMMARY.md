---
phase: 01-schema-foundation
plan: 01
subsystem: database
tags: [embeddings, halfvec, pgvector, fts, tsvector, openai, key-statements]

# Dependency graph
requires: []
provides:
  - "384-dim halfvec embeddings aligned across web app and pipeline"
  - "tsvector FTS for transcript search (replaces removed match_transcript_segments RPC)"
  - "searchKeyStatements vector search function"
  - "search_key_statements RAG tool for Ask page"
  - "Key statement extraction in AI refiner pipeline"
  - "key_statements table ingestion and embedding"
affects: [01-02, 02-council-member-profiles, 03-subscriptions, 04-home-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Embedding dimension standardized at 384 (halfvec) across all code"
    - "tsvector full-text search for transcript segments instead of vector search"
    - "Key statements as first-class searchable entities"

key-files:
  created: []
  modified:
    - "apps/web/app/lib/embeddings.server.ts"
    - "apps/web/app/services/rag.server.ts"
    - "apps/web/app/services/vectorSearch.ts"
    - "apps/web/app/lib/types.ts"
    - "apps/web/app/services/meetings.ts"
    - "apps/pipeline/pipeline/ingestion/embed.py"
    - "apps/pipeline/pipeline/ingestion/ai_refiner.py"
    - "apps/pipeline/pipeline/ingestion/ingester.py"
    - "apps/pipeline/pyproject.toml"
    - "sql/bootstrap.sql"

key-decisions:
  - "Merged PR #35 as-is (conflict-free merge, pre-verified)"
  - "Removed fastembed dependency (~500MB) since pipeline uses OpenAI text-embedding-3-small exclusively"
  - "Cleaned dead embedding_hv conditional code rather than leaving commented-out"
  - "Pre-existing type error in workers/app.ts is out of scope (not introduced by merge)"

patterns-established:
  - "All embedding columns use halfvec(384) type"
  - "Transcript search uses tsvector FTS (text_search column) not vector search"
  - "Key statements provide attributed, typed searchable quotes from meetings"

requirements-completed: [SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04]

# Metrics
duration: 2min
completed: 2026-02-16
---

# Phase 1 Plan 1: Schema Alignment Summary

**Merged PR #35 to align web app and pipeline with halfvec(384) embeddings, tsvector FTS for transcripts, and key statement search**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-16T21:48:56Z
- **Completed:** 2026-02-16T21:51:05Z
- **Tasks:** 2
- **Files modified:** 18 (16 from merge + 2 cleanup)

## Accomplishments
- Merged PR #35 (phase3c/embedding-migration) to main, fixing live embedding dimension mismatch bug (768 -> 384)
- Replaced broken match_transcript_segments RPC with tsvector full-text search in rag.server.ts
- Removed all 15+ references to deleted corrected_text_content column from web app
- Added searchKeyStatements function and search_key_statements RAG tool for Ask page
- Cleaned up dead embedding_hv code and removed unused fastembed dependency (~500MB)
- Validated no conflicting migrations were introduced

## Task Commits

Each task was committed atomically:

1. **Task 1: Merge PR #35 branch into main** - `af5b57f9` (merge)
2. **Task 2: Validate migrations and clean up embed.py dead code** - `94c03ecf` (fix)

## Files Created/Modified
- `apps/web/app/lib/embeddings.server.ts` - EMBEDDING_DIMENSIONS 768 -> 384
- `apps/web/app/services/rag.server.ts` - Replaced match_transcript_segments RPC with tsvector FTS, added search_key_statements tool
- `apps/web/app/services/vectorSearch.ts` - Stubbed searchTranscriptSegments, added searchKeyStatements
- `apps/web/app/lib/types.ts` - Removed corrected_text_content from TranscriptSegment
- `apps/web/app/services/meetings.ts` - Removed corrected_text_content from select
- `apps/web/app/components/meeting-feed.tsx` - Removed corrected_text_content fallback
- `apps/web/app/components/meeting/EnhancedVideoScrubber.tsx` - Removed corrected_text_content fallback
- `apps/web/app/components/meeting/TranscriptDrawer.tsx` - Removed corrected_text_content fallback
- `apps/web/app/components/meeting/VideoWithSidebar.tsx` - Removed corrected_text_content fallback
- `apps/web/app/routes/meeting-explorer.tsx` - Removed corrected_text_content fallback
- `apps/web/app/routes/speaker-alias.tsx` - Removed corrected_text_content fallback
- `apps/pipeline/pipeline/ingestion/embed.py` - 768->384, removed embedding_hv dead code, removed transcript_segments from TABLE_CONFIG, added key_statements
- `apps/pipeline/pipeline/ingestion/ai_refiner.py` - Added KeyStatement model and extraction
- `apps/pipeline/pipeline/ingestion/ingester.py` - Added key_statements ingestion
- `apps/pipeline/pyproject.toml` - Removed fastembed dependency
- `sql/bootstrap.sql` - Updated to reflect current schema with halfvec(384)
- `README.md` - Updated to reflect Phases 0-3c changes

## Decisions Made
- **Merged PR #35 as-is:** Conflict-free merge verified via git merge-tree, no manual resolution needed
- **Removed fastembed:** No pipeline code imports it; OpenAI text-embedding-3-small is the sole embedding provider
- **Cleaned dead code:** Removed embedding_hv conditionals instead of leaving them as dead branches -- since transcript_segments is removed from TABLE_CONFIG, these could never execute
- **Pre-existing type error out of scope:** workers/app.ts has a ScheduledEvent type error unrelated to our changes; logged to deferred items

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing type error in `workers/app.ts` (ScheduledEvent type incompatibility) causes `pnpm typecheck` to fail. This is NOT introduced by PR #35 -- the file was not modified in the merge. Logged as out-of-scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Web app code now matches the live database schema (halfvec(384), tsvector FTS, key_statements)
- Ready for Plan 01-02 (next PR merge in dependency chain: #37 -> #36 -> #13)
- The pre-existing workers/app.ts type error should be tracked but does not block further work

## Self-Check: PASSED

- All key files verified present (6/6)
- All commits verified in git log (2/2)

---
*Phase: 01-schema-foundation*
*Completed: 2026-02-16*
