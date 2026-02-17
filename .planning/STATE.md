# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** Citizens can understand what their council decided, why, and who said what -- without attending meetings or reading hundreds of pages of PDFs.
**Current focus:** v1.1 Deep Intelligence -- Phase 7.1 Upgrade Document Extraction

## Current Position

Phase: 7.1 (Upgrade document extraction with Docling and Gemini) -- INSERTED
Plan: 0 of ? in current phase (not yet planned)
Status: Inserted, awaiting planning
Last activity: 2026-02-17 -- Inserted Phase 7.1 after completed Phase 7

Progress: [██████████████░░░░░░] 70% (14/~20 plans across all milestones)

## Performance Metrics

**Velocity:**
- Total plans completed: 14
- Average duration: 8.1min
- Total execution time: 1.91 hours

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

### Roadmap Evolution

- Phase 07.1 inserted after Phase 07: Upgrade document extraction with Docling and Gemini (URGENT)

### Pending Todos

None.

### Blockers/Concerns

- bootstrap.sql is out of date with 23+ applied migrations -- technical debt to track
- Email delivery requires external Resend configuration (documented in Phase 3 Plan 02)
## Session Continuity

Last session: 2026-02-17
Stopped at: Phase 7.1 context gathered
Resume file: .planning/phases/07.1-upgrade-document-extraction-with-docling-and-gemini/07.1-CONTEXT.md
Next action: Plan Phase 7.1 (/gsd:plan-phase 7.1)
