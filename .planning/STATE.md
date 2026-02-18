# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** Citizens can understand what their council decided, why, and who said what -- without attending meetings or reading hundreds of pages of PDFs.
**Current focus:** v1.1 Deep Intelligence -- Phase 8 Unified Search & Hybrid RAG

## Current Position

Phase: 8 (Unified Search & Hybrid RAG)
Plan: 5 of 5
Status: In Progress
Last activity: 2026-02-18 -- Completed 08-04 Follow-up Conversations & Navigation

Progress: [██████████████████░░] 90% (20/~21 plans across all milestones)

## Performance Metrics

**Velocity:**
- Total plans completed: 20
- Average duration: 6.7min
- Total execution time: 2.24 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-schema-foundation | 2 | 6min | 3min |
| 02-multi-tenancy | 1 | 8min | 8min |
| 03-subscriptions-notifications | 2 | 19min | 10min |
| 04-home-page-enhancements | 2 | 30min | 15min |
| 05-advanced-subscriptions | 3 | 25min | 8min |
| 06-gap-closure-cleanup | 1 | 3min | 3min |
| 07-document-intelligence | 3 | 15min | 5min |
| 07.1-upgrade-document-extraction | 2 | 8min | 4min |
| 08-unified-search-hybrid-rag | 4 | 12min | 3min |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
All v1.0 decisions resolved -- see archive for full history.

v1.1 decisions:
- PROF-01 (voting history) and PROF-03 (voting alignment) already validated in v1.0 -- removed from v1.1 scope
- PROF-02 narrowed to speaking time only (attendance + motions already exist)
- DOC heading detection uses PyMuPDF dict-mode font analysis (body_size * 1.2 threshold) rather than marker-pdf ML models
- DOC section size cap at 8000 chars matching embed.py MAX_EMBED_CHARS, split at paragraph boundaries
- DOC sections fetched via two-step query (documents -> document_sections) since sections lack direct meeting_id
- DOC backfill uses two-pass approach: create sections first (resilience), generate embeddings second
- DOC noise headings (CARRIED, OR, etc.) filtered; sub-headings (BACKGROUND, PURPOSE) folded into parents
- DOC linking uses 4-strategy approach: number match, title containment, fuzzy title, fuzzy text-body
- DOC Strategy 4 (positional/sequential matching) deferred to future iteration
- DOC-7.1 Gemini 2.5 Flash replaces PyMuPDF font-analysis for document extraction (two-pass: boundaries + content)
- DOC-7.1 extracted_documents intermediate table between documents and document_sections for natural hierarchy
- DOC-7.1 Three-tier PDF size handling: inline (<20MB), File API (20-50MB), PyMuPDF split (>50MB)
- DOC-7.1 R2 image uploads gracefully degrade: skip silently if boto3 or credentials missing
- DOC-7.1 Docling dependency removed; Gemini 2.5 Flash is the sole extraction engine with PyMuPDF chunker as fallback
- DOC-7.1 Batch API for full backfill (3-phase: boundary batch → content batch → DB insertion)
- DOC-7.1 Boundary prompt requires non-overlapping page ranges; dedup removes parent boundaries containing children
- DOC-7.1 insert_meeting_results() cleans up existing data before inserting to prevent duplicates
- SRCH Unified search API: single endpoint for keyword (JSON) and AI (streaming SSE) via mode param
- SRCH Cache ID emitted as SSE event before done for client URL updating
- SRCH Document sections enriched via two-step query (documents -> meetings) for date filtering
- SRCH CitationBadge extracted to standalone component for reuse across ask.tsx and search.tsx
- SRCH Lazy tab loading: non-default tab fetched only on first user switch
- SRCH Confidence indicator thresholds: 6+ sources = high, 3-5 = medium, 1-2 = low
- SRCH Follow-up conversation memory via useRef capped at 5 turns, context serialized as Q/A pairs
- SRCH Follow-up suggestions generated server-side via Gemini Flash, emitted as suggested_followups SSE event
- SRCH Topic change detection uses word overlap heuristic (no shared 3+ char words = topic change)
- SRCH /ask route replaced with 301 redirect to /search for backward compatibility

### Roadmap Evolution

- Phase 07.1 inserted after Phase 07: Upgrade document extraction with Docling and Gemini (URGENT)
- Phase 07.1 paused at Plan 03 (2/3 done) — backfill needs Gemini Batch API, advancing to Phase 8

### Pending Todos

None.

### Blockers/Concerns

- bootstrap.sql is out of date with 23+ applied migrations -- technical debt to track
- Email delivery requires external Resend configuration (documented in Phase 3 Plan 02)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Change hero background to faded map view of View Royal with Ken Burns effect | 2026-02-18 | fb1d7909 | [1-change-the-hero-background-to-be-a-faded](./quick/1-change-the-hero-background-to-be-a-faded/) |
## Session Continuity

Last session: 2026-02-18
Completed 08-04-PLAN.md: Follow-up Conversations & Navigation Unification.
Next action: Execute 08-05-PLAN.md

### Paused Work: Phase 7.1
Resume file: .planning/phases/07.1-upgrade-document-extraction-with-docling-and-gemini/.continue-here.md
Status: All code complete, quality bugs fixed. User running full 711-meeting backfill outside Claude.
To resume after backfill: approve Plan 03 checkpoint, phase verification
