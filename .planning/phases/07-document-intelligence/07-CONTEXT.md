# Phase 7: Document Intelligence - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Pipeline chunks PDF documents into searchable, embeddable sections with full-text search indexes, links them to agenda items, and backfills existing documents. Sections are displayed on meeting detail pages via expandable accordions. Unified search and RAG are Phase 8.

</domain>

<decisions>
## Implementation Decisions

### Section granularity
- Section titles for headingless content: document name + position (e.g. "Staff Report - Section 2 of 4")

### Backfill strategy
- Both automatic sectioning on new ingest AND a --backfill-sections flag for existing documents
- Parse errors: log and skip, continue with remaining documents
- Idempotency: skip documents that already have sections by default; add --force/--replace flag to delete-and-recreate
- Two-pass approach: create all sections first, then generate embeddings in a separate pass (resumable if embedding fails)

### Meeting page display
- Sections displayed as expandable accordions under agenda items — section titles visible, click to expand content
- Original PDF link preserved alongside parsed sections (sections are an addition, not a replacement)

### Claude's Discretion
- Chunking approach: heading-driven vs heading + size cap, overlap strategy — pick what works best for RAG quality
- Fallback behavior for headingless PDFs (whole doc as one section vs fixed-size chunks)
- Section accordion placement relative to existing document list
- Exact accordion styling and interaction details

</decisions>

<specifics>
## Specific Ideas

- Sections will power the document display UI on meeting pages — users see parsed content directly rather than just PDF links
- Two-pass backfill allows resuming if the embedding step fails partway through

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-document-intelligence*
*Context gathered: 2026-02-17*
