---
phase: 07-document-intelligence
plan: 01
subsystem: database, pipeline
tags: [pymupdf, pdf-chunking, halfvec, tsvector, supabase, pgvector, hnsw]

# Dependency graph
requires:
  - phase: 01-schema-foundation
    provides: documents table, agenda_items table, municipalities table
provides:
  - document_sections table with halfvec(384) embeddings and tsvector full-text search
  - match_document_sections RPC function for vector similarity search
  - document_chunker.py module for heading-based PDF sectioning
  - Pipeline integration: automatic document sectioning during ingestion
  - embed.py TABLE_CONFIG entry for document_sections embedding generation
affects: [07-02, 08-unified-search, rag-qa]

# Tech tracking
tech-stack:
  added: []
  patterns: [font-based heading detection via PyMuPDF dict mode, paragraph-boundary chunking fallback]

key-files:
  created:
    - supabase/migrations/create_document_sections.sql
    - apps/pipeline/pipeline/ingestion/document_chunker.py
  modified:
    - apps/pipeline/pipeline/ingestion/ingester.py
    - apps/pipeline/pipeline/ingestion/embed.py

key-decisions:
  - "Heading detection uses PyMuPDF dict-mode font analysis (body_size * 1.2 threshold + bold detection) rather than marker-pdf ML models for speed"
  - "Consecutive heading spans within 5pt y-position are merged to prevent fragmented titles"
  - "Oversized sections (>8000 chars) split at paragraph boundaries with 'Part N of M' naming"
  - "Agenda item linking uses number-pattern matching first, title containment second, scoped to same meeting"

patterns-established:
  - "Font-based heading detection: detect body font by frequency, heading if size > body * 1.2 or bold + all-caps"
  - "Two-strategy agenda item linking: number-pattern then title containment, scoped to meeting"

requirements-completed: [DOC-01, DOC-02, DOC-03, DOC-04]

# Metrics
duration: 4min
completed: 2026-02-17
---

# Phase 7 Plan 1: Document Sections Schema and Pipeline Chunker Summary

**document_sections table with HNSW/GIN indexes, PyMuPDF heading-based PDF chunker with fallback splitting, integrated into pipeline ingestion and embedding flow**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-17T16:22:36Z
- **Completed:** 2026-02-17T16:27:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created document_sections table with all indexes (HNSW for vector similarity, GIN for full-text search) and match_document_sections RPC function
- Built document_chunker.py with heading-based chunking using PyMuPDF font analysis, fixed-size fallback for headingless PDFs, and paragraph-boundary splitting for oversized sections
- Integrated document sectioning into pipeline: automatic chunking runs after document ingestion in process_meeting(), embedding generation via embed.py TABLE_CONFIG

## Task Commits

Each task was committed atomically:

1. **Task 1: Create document_sections table with migration** - `0abf0671` (feat)
2. **Task 2: Create document chunker module and integrate into pipeline** - `d72de52b` (feat)

## Files Created/Modified
- `supabase/migrations/create_document_sections.sql` - Table schema, indexes, RLS, and match_document_sections RPC function
- `apps/pipeline/pipeline/ingestion/document_chunker.py` - Heading-based PDF chunking with font analysis, fixed-size fallback, agenda item linking
- `apps/pipeline/pipeline/ingestion/ingester.py` - Added _ingest_document_sections() method and call in process_meeting()
- `apps/pipeline/pipeline/ingestion/embed.py` - Added document_sections to TABLE_CONFIG and DEFAULT_MIN_WORDS

## Decisions Made
- Used PyMuPDF dict-mode font analysis for heading detection (lighter than marker-pdf ML models, sufficient for digital-native PDFs)
- Heading threshold: font size > body_size * 1.2, or bold + (all-caps with len>3 or size >= body_size)
- Consecutive heading spans merged when y-positions within 5 points of each other (prevents "STAFF" + "REPORT" fragmentation)
- Section size cap at 8000 chars (matching MAX_EMBED_CHARS in embed.py), split at paragraph boundaries
- Token count estimated as word_count * 1.3 (sufficient for monitoring, avoids tiktoken dependency)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Direct database connection failed due to IPv6 routing; used session pooler URL (IPv4) via psycopg2 following the pattern in embed.py -- resolved automatically

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- document_sections table ready for data; pipeline will automatically create sections on next meeting ingestion
- embed.py TABLE_CONFIG includes document_sections for embedding generation via `--table document_sections` or `--table all`
- Plan 02 (backfill + web display) can proceed: backfill existing documents, add TypeScript interfaces, build accordion UI

## Self-Check: PASSED

- FOUND: supabase/migrations/create_document_sections.sql
- FOUND: apps/pipeline/pipeline/ingestion/document_chunker.py
- FOUND: .planning/phases/07-document-intelligence/07-01-SUMMARY.md
- FOUND: commit 0abf0671 (Task 1)
- FOUND: commit d72de52b (Task 2)

---
*Phase: 07-document-intelligence*
*Completed: 2026-02-17*
