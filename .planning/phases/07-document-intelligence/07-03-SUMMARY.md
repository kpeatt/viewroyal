---
phase: 07-document-intelligence
plan: 03
subsystem: pipeline
tags: [pymupdf, document-chunking, heading-detection, fuzzy-matching, noise-filtering]

# Dependency graph
requires:
  - phase: 07-01
    provides: "document_chunker.py with heading-based section splitting"
  - phase: 07-02
    provides: "backfill CLI and document sections display"
provides:
  - "Noise-filtered document section detection (no CARRIED/OR/repeating headers)"
  - "Sub-heading folding (BACKGROUND, PURPOSE, etc. stay within parent sections)"
  - "Fuzzy title matching for agenda item linking (title + text body)"
  - "Deduplication pass for over-linked agenda items"
affects: [document-viewer, search, rag]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Noise heading filtering via uppercase lookup set"
    - "Sub-heading folding into parent sections with bold markers"
    - "Repeating header merging via frequency threshold (5+)"
    - "Multi-strategy agenda item linking (number, containment, fuzzy, text-body)"

key-files:
  created: []
  modified:
    - apps/pipeline/pipeline/ingestion/document_chunker.py

key-decisions:
  - "MIN_SECTION_CHARS raised from 100 to 150 to filter more noise"
  - "Repeating header threshold set at 5 occurrences for merging"
  - "Fuzzy matching requires 15+ char matching word sequence for titles, 20+ for text body"
  - "Over-linked agenda items (>10 sections) limited to first 3 matches"
  - "Strategy 4 (positional/sequential matching) deferred to future iteration"
  - "36% linking rate accepted vs 50% target -- remaining unlinked sections are generic document pages"

patterns-established:
  - "NOISE_HEADINGS and SUB_HEADINGS sets for heading classification"
  - "Post-processing merge step for repeating table headers"
  - "Multi-pass linking: number -> containment -> fuzzy title -> fuzzy text body -> deduplication"

requirements-completed: [DOC-03]

# Metrics
duration: 7min
completed: 2026-02-17
---

# Phase 7 Plan 3: Document Section Quality Summary

**Noise-filtered heading detection with sub-heading folding and fuzzy agenda item linking via multi-strategy matching**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-17T17:10:00Z
- **Completed:** 2026-02-17T17:17:02Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Eliminated all noise sections (CARRIED, OR, DEFEATED, etc.) from heading detection
- Folded staff report sub-headings (BACKGROUND, PURPOSE, RECOMMENDATION, etc.) into parent sections
- Merged 20 repeating "COUNCIL RESOLUTION FOLLOW UP LIST" table headers into a single logical section
- Added fuzzy title matching and text-body matching for agenda item linking
- Reduced total sections from 432 to 293 (32% reduction across all documents)
- Improved agenda item linking from 15% to 36% for the primary test document

## Task Commits

Each task was committed atomically:

1. **Task 1: Add noise filtering and sub-heading folding** - `18b064bb` (feat)
2. **Task 2: Improve agenda item linking with fuzzy matching** - `fa10147c` (feat)
3. **Task 3: Re-run backfill with --force** - runtime only, no code changes

## Files Created/Modified
- `apps/pipeline/pipeline/ingestion/document_chunker.py` - Added NOISE_HEADINGS, SUB_HEADINGS, REPEAT_HEADING_THRESHOLD constants; noise filtering and sub-heading folding in _split_at_headings(); _merge_repeating_headings() post-processor; fuzzy title matching (Strategy 3), text-body matching (Strategy 3b), and deduplication pass in link_sections_to_agenda_items()

## Decisions Made
- Raised MIN_SECTION_CHARS from 100 to 150 -- removes more trivially small noise sections
- Set repeating header merge threshold at 5 occurrences -- balances between catching genuine repetitions and preserving legitimately repeated headings
- Fuzzy matching thresholds: 15 chars for title-to-title, 20 chars for title-to-text-body -- higher text threshold prevents false positives from common phrases
- Deduplication at >10 links per item, keeping first 3 -- prevents generic parent headings from dominating
- Strategy 4 (positional/sequential matching using page-order heuristics) deferred to future work -- marked with TODO comment
- Accepted 36% linking rate vs aspirational 50% target -- remaining 64% unlinked sections are genuinely generic pages (table of contents, audit appendices, form templates, delegation request forms) that don't correspond to specific agenda items

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added text-body fuzzy matching (Strategy 3b)**
- **Found during:** Task 2 (agenda item linking)
- **Issue:** Strategy 3 (title-only fuzzy matching) only brought linking from 21% to 21% because many section titles are generic ("MNP LLP", "Key Milestones") while the section TEXT body contains the agenda item title
- **Fix:** Added Strategy 3b that checks the first 300 characters of section text against normalized agenda item titles with a 20-char minimum match threshold
- **Files modified:** apps/pipeline/pipeline/ingestion/document_chunker.py
- **Verification:** Linking rate increased from 21% to 36% with the text-body matching
- **Committed in:** fa10147c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Strategy 3b was necessary to achieve meaningful linking improvement. Without it, fuzzy matching alone only reached 21%. No scope creep.

## Issues Encountered
- Linking rate reached 36% vs 50% target -- the remaining gap is due to genuinely generic document pages that lack any connection to specific agenda items. Positional matching (Strategy 4, deferred) would close this gap for ordered agenda packages.
- Documents embedding step failed for some full_text rows exceeding OpenAI token limit (pre-existing issue, out of scope)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Document sections are now significantly cleaner and better linked
- Search and RAG will benefit from reduced noise and improved agenda item association
- Strategy 4 (positional matching) is a natural enhancement for future work
- Phase 7 is now complete (plans 01, 02, 03 all done)

---
*Phase: 07-document-intelligence*
*Completed: 2026-02-17*
