---
phase: 38-rag-intelligence
plan: 01
subsystem: api
tags: [gemini, rag, agent, tools, search]

requires:
  - phase: 37-eval-quick-wins
    provides: RAG observability traces for measuring tool usage
provides:
  - 4 consolidated RAG tools replacing 10 overlapping tools
  - Parallel sub-query execution via Promise.all in consolidated tools
  - Date injection in system prompt (eliminated get_current_date tool)
  - Updated UI labels for consolidated tool names
affects: [38-02-reranking]

tech-stack:
  added: []
  patterns: [consolidated-tool-pattern, parallel-sub-query, date-in-system-prompt]

key-files:
  created: []
  modified:
    - apps/web/app/services/rag.server.ts
    - apps/web/app/components/search/ai-answer.tsx

key-decisions:
  - "4 consolidated tools: search_council_records, search_documents, search_matters, get_person_info"
  - "Eliminated get_current_date tool -- date injected into system prompt instead"
  - "Consolidated tools use Promise.all for parallel sub-queries"

patterns-established:
  - "Consolidated tool pattern: single tool runs multiple data source queries in parallel, returns composite object"
  - "Date-in-prompt pattern: inject current date in system prompt rather than using a dedicated tool"

requirements-completed: [SRCH-02]

duration: 6min
completed: 2026-03-06
---

# Phase 38 Plan 01: RAG Tool Consolidation Summary

**Consolidated 10 RAG tools down to 4 with parallel sub-queries, eliminating get_current_date and reducing agent confusion**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-06T15:41:33Z
- **Completed:** 2026-03-06T15:47:33Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced 10 overlapping RAG tools with 4 consolidated tools that run sub-queries in parallel via Promise.all
- Eliminated get_current_date tool by injecting today's date directly into the system prompt
- Updated system prompt strategy table, data understanding section, and fallback rules for new tool names
- Updated source normalization to handle composite result objects from consolidated tools
- Updated buildToolSummary to provide rich summaries for composite results (e.g., "Found 5 motions, 3 transcripts, 2 statements")
- Updated UI TOOL_LABELS with 4 consolidated entries and personalized get_person_info label

## Task Commits

Each task was committed atomically:

1. **Task 1: Consolidate tools and update system prompt** - `c64cfbaa` (feat)
2. **Task 2: Update UI labels and trace collection** - `ae9c0668` (feat)

## Files Created/Modified
- `apps/web/app/services/rag.server.ts` - Consolidated 10 tools to 4, updated system prompt with date injection, updated source normalization and buildToolSummary for composite results
- `apps/web/app/components/search/ai-answer.tsx` - Updated TOOL_LABELS to 4 consolidated entries, simplified getToolLabel

## Decisions Made
- Used Promise.all for parallel sub-queries in consolidated tools (search_council_records runs 4 queries in parallel, search_documents runs 2, get_person_info runs 2)
- Eliminated get_current_date entirely rather than keeping it as a fallback -- date in system prompt is simpler and saves a tool call
- Kept all existing query functions (search_motions, search_transcript_segments, etc.) as internal helpers -- only the tool definitions array changed
- Handled type-safe merging in get_person_info "both" mode with Object.assign to avoid spread type errors on union types

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript spread error on union types in get_person_info**
- **Found during:** Task 1 (tool consolidation)
- **Issue:** `{ ...statements, ...votes }` failed TypeScript compilation because both functions return `string | object` union types, and spread only works on object types
- **Fix:** Used Object.assign with type guards to merge results safely, falling back to error properties for string results
- **Files modified:** apps/web/app/services/rag.server.ts
- **Verification:** pnpm typecheck passes
- **Committed in:** c64cfbaa (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential for TypeScript compilation. No scope creep.

## Issues Encountered
None beyond the auto-fixed type error.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 4 consolidated tools ready for Plan 02's reranking layer, which operates on consolidated tool results
- Source normalization handles all composite result shapes correctly
- UI labels match new tool names

---
*Phase: 38-rag-intelligence*
*Completed: 2026-03-06*
