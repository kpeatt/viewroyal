---
phase: 11-gap-closure-gemini-fix
plan: 01
subsystem: api
tags: [gemini, google-genai, rag, sdk-migration, model-upgrade]

# Dependency graph
requires:
  - phase: 08-unified-search-hybrid-rag
    provides: RAG agent and search API using Gemini
  - phase: 07.1-upgrade-document-extraction
    provides: Gemini-based document extraction pipeline
provides:
  - "@google/genai SDK migration for web app (3 files)"
  - "gemini-3-flash-preview model across all Gemini calls"
  - "SRCH-04 fix: document section citations show section headings"
affects: [web-deployment, pipeline-execution, rag-quality]

# Tech tracking
tech-stack:
  added: ["@google/genai 1.42.0"]
  patterns: ["GoogleGenAI lazy singleton with per-call model param", "client.models.generateContent pattern"]

key-files:
  created: []
  modified:
    - apps/web/app/services/rag.server.ts
    - apps/web/app/routes/api.search.tsx
    - apps/web/app/routes/api.intel.tsx
    - apps/pipeline/pipeline/ingestion/ai_refiner.py
    - apps/pipeline/pipeline/ingestion/process_bylaws.py
    - apps/pipeline/pipeline/ingestion/process_agenda.py
    - apps/pipeline/pipeline/ingestion/gemini_extractor.py
    - apps/pipeline/pipeline/profiling/stance_generator.py
    - README.md

key-decisions:
  - "Removed getGenerativeModel() intermediate step; model specified per-call in new SDK"
  - "Streaming uses async iterable directly (no .stream property) with .text property (not method)"

patterns-established:
  - "GoogleGenAI per-call model pattern: client.models.generateContent({ model, contents, config })"
  - "Streaming pattern: for await (const chunk of stream) { chunk.text }"

requirements-completed: [SRCH-04]

# Metrics
duration: 3min
completed: 2026-02-19
---

# Phase 11 Plan 01: Gemini SDK Migration + Model Upgrade Summary

**Migrated web app from deprecated @google/generative-ai to @google/genai SDK, updated all Gemini calls to gemini-3-flash-preview, and fixed RAG document section heading mismatch (SRCH-04)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-19T03:46:10Z
- **Completed:** 2026-02-19T03:49:23Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Replaced deprecated @google/generative-ai with @google/genai across all 3 web app files
- Fixed SRCH-04: RAG document section citations now display section headings (d.section_title) instead of "Unknown"
- Updated all 7 pipeline Gemini model references from deprecated names to gemini-3-flash-preview
- Zero deprecated model names remain anywhere in the codebase (gemini-flash-latest, gemini-2.0-flash, gemini-2.5-flash all removed)
- Web app builds successfully for Cloudflare Workers
- 357 pipeline tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate web app to @google/genai SDK + fix RAG heading** - `363b702e` (feat)
2. **Task 2: Update pipeline model names + README** - `cd915294` (feat)

**Plan metadata:** (pending)

## Files Created/Modified
- `apps/web/package.json` - Swapped @google/generative-ai for @google/genai
- `apps/web/app/services/rag.server.ts` - New SDK import, lazy singleton, heading fix, non-streaming + streaming calls
- `apps/web/app/routes/api.search.tsx` - New SDK import, follow-up generation call
- `apps/web/app/routes/api.intel.tsx` - New SDK import, intelligence generation call
- `apps/pipeline/pipeline/ingestion/ai_refiner.py` - 3 model name updates
- `apps/pipeline/pipeline/ingestion/process_bylaws.py` - MODEL_NAME updated
- `apps/pipeline/pipeline/ingestion/process_agenda.py` - MODEL_NAME updated
- `apps/pipeline/pipeline/ingestion/gemini_extractor.py` - GEMINI_MODEL default updated
- `apps/pipeline/pipeline/profiling/stance_generator.py` - GEMINI_MODEL default updated
- `README.md` - Tech stack references updated to Gemini 3 Flash

## Decisions Made
- Removed `getGenerativeModel()` intermediate step from web app; model is now specified per-call in the new SDK pattern
- Streaming uses the async iterable directly (no `.stream` property access) with `.text` as a property (not a method call)
- `config` parameter replaces `generationConfig` for per-call options like `responseMimeType`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ai_refiner.py had two indentation levels for model= parameter**
- **Found during:** Task 2 (Pipeline model name updates)
- **Issue:** The replace_all for 16-space indented `model="gemini-flash-latest"` did not match the 12-space indented occurrences at lines 924 and 985
- **Fix:** Ran a second replace_all targeting the 12-space indentation pattern
- **Files modified:** apps/pipeline/pipeline/ingestion/ai_refiner.py
- **Verification:** grep confirmed zero remaining deprecated model names
- **Committed in:** cd915294 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor string replacement mechanics. No scope creep.

## Issues Encountered
- Pre-existing test failures in `test_marker_ocr.py` (3 failures) unrelated to model name changes -- infrastructure test for scanned PDF OCR, not affected by this plan

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Gemini API calls use supported SDK and model
- Web app ready for deployment with `pnpm deploy`
- Pipeline ready for execution with updated model names

---
*Phase: 11-gap-closure-gemini-fix*
*Completed: 2026-02-19*

## Self-Check: PASSED
- All 10 key files verified present on disk
- Both task commits verified in git log (363b702e, cd915294)
