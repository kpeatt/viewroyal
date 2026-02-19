---
phase: 08-unified-search-hybrid-rag
plan: 03
subsystem: ui
tags: [search, react, streaming, sse, citations, perplexity, tabs, intent-detection]

# Dependency graph
requires:
  - phase: 08-01
    provides: hybrid search RPCs, intent classifier, search results cache table
  - phase: 08-02
    provides: unified search API endpoint (keyword JSON + AI streaming SSE)
provides:
  - Unified /search page with Perplexity-style tabbed UI
  - 7 reusable search/* components (input, tabs, ai-answer, results, result-card, citation-badge, source-cards)
  - Streaming AI answer display with markdown citations and confidence indicator
  - Type-filtered unified search results list
affects: [08-04, 08-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [EventSource SSE streaming for AI answers, lazy tab loading, intent-based tab defaulting, citation badge hover cards]

key-files:
  created:
    - apps/web/app/components/search/search-input.tsx
    - apps/web/app/components/search/search-tabs.tsx
    - apps/web/app/components/search/ai-answer.tsx
    - apps/web/app/components/search/search-results.tsx
    - apps/web/app/components/search/result-card.tsx
    - apps/web/app/components/search/citation-badge.tsx
    - apps/web/app/components/search/source-cards.tsx
  modified:
    - apps/web/app/routes/search.tsx

key-decisions:
  - "CitationBadge and citation processing extracted to standalone component for reuse across ask.tsx and search.tsx"
  - "Lazy tab loading: non-default tab only fetched when user first switches to it"
  - "Cache ID updates URL via replace to enable shareable links without polluting history"
  - "Confidence indicator thresholds: 6+ sources = high, 3-5 = medium, 1-2 = low"

patterns-established:
  - "Search component library: reusable components in app/components/search/ for search UI patterns"
  - "Lazy tab content: tabs trigger fetch only on first activation, cached thereafter"

requirements-completed: [SRCH-01, SRCH-02]

# Metrics
duration: 4min
completed: 2026-02-18
---

# Phase 8 Plan 3: Unified Search Page UI Summary

**Perplexity-style search page with tabbed AI answers (streaming SSE + citations) and type-filtered keyword results**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T03:21:16Z
- **Completed:** 2026-02-18T03:25:46Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created 7 modular search components (915 lines) covering input, tabs, AI answer, results, result cards, citations, and sources
- Replaced old keyword-only search.tsx with unified Perplexity-style page (403 lines)
- Intent auto-detection defaults to correct tab (question -> AI, keyword -> results)
- Streaming AI answers with research steps, inline citation badges, confidence indicator, and copy button
- Type-filtered unified results with query highlighting and type-specific card layouts
- Shareable URLs via cached AI answer IDs

## Task Commits

Each task was committed atomically:

1. **Task 1: Create search UI components** - `b790e78c` (feat)
2. **Task 2: Build unified search page route** - `b15011c1` (feat)

## Files Created/Modified
- `apps/web/app/components/search/search-input.tsx` - Full-width search input with auto-focus and streaming indicator
- `apps/web/app/components/search/search-tabs.tsx` - Pill-style tab switcher (AI Answer / Search Results)
- `apps/web/app/components/search/ai-answer.tsx` - Streaming AI answer with research steps, citations, confidence, copy
- `apps/web/app/components/search/search-results.tsx` - Type-filtered result list with loading skeleton
- `apps/web/app/components/search/result-card.tsx` - Adaptive card for motions, statements, documents, transcripts
- `apps/web/app/components/search/citation-badge.tsx` - Inline [N] citation badge with hover preview (extracted from ask.tsx)
- `apps/web/app/components/search/source-cards.tsx` - Collapsible numbered source list
- `apps/web/app/routes/search.tsx` - Unified search page with tabbed AI + keyword results

## Decisions Made
- CitationBadge extracted as standalone component rather than duplicated -- enables both ask.tsx and search.tsx to share the same citation UI
- Lazy tab loading pattern: only fetches the non-default tab when user switches to it, avoiding unnecessary API calls
- Cache ID updates URL via `replace: true` to enable shareable links without polluting browser history
- Confidence indicator uses simple source count thresholds (6+/3-5/1-2) rather than more complex scoring

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type errors on JSON response parsing**
- **Found during:** Task 2 (Build unified search page route)
- **Issue:** `res.json()` returns `unknown` in strict mode, causing 6 type errors
- **Fix:** Added explicit type assertions on `await res.json()` calls
- **Files modified:** `apps/web/app/routes/search.tsx`
- **Verification:** `tsc --noEmit` passes with zero errors
- **Committed in:** b15011c1 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Minor TypeScript strictness fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Search page UI complete, ready for Plan 04 (followup questions / suggested queries)
- All search components are modular and can be enhanced independently
- The old ask.tsx route still exists -- consider deprecation/redirect in a future plan

---
*Phase: 08-unified-search-hybrid-rag*
*Completed: 2026-02-18*
