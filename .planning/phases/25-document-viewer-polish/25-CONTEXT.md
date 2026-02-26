# Phase 25: Document Viewer Polish - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Polish the document viewer's typography, table responsiveness, and heading rendering so documents read like properly typeset official reports rather than cramped blog-style markdown. No new features — this is visual quality improvements to the existing viewer at `document-viewer.tsx` and `markdown-content.tsx`.

</domain>

<decisions>
## Implementation Decisions

### Typography
- Sans-serif body text, bumped from prose-sm (14px) to ~16px base with increased line-height
- Comfortable paragraph spacing — roughly double the current my-1.5 so paragraphs are clearly separated
- List items get more breathing room (currently my-0.5)
- Keep max-w-4xl reading column — wide enough for tables, good use of screen space

### Table Presentation
- Wrap tables in a scrollable container with shadow/fade hints on the overflow edge (mobile horizontal scroll without page shifting)
- Zebra-striped rows for easier scanning of data-heavy government tables
- Internal grid lines only — no outer border/frame around the table
- Keep table text at text-xs (12px) for data density

### Heading Rendering (Title Dedup)
- **Remove explicit JSX headings** — no more `<h2>` for section_title in the component JSX
- Let the markdown render its own headings naturally as the single source of truth
- Use section_title/section_order data only for anchor IDs and navigation links
- Document title stays in the header/breadcrumb bar at the top, not duplicated in the body
- Remove `<hr>` dividers between sections — let markdown headings provide visual separation

### Section Visual Hierarchy
- Size + style variation for heading levels: h1 large, h2 with bottom border, h3 bold, h4 uppercase small caps
- Blockquotes get subtle background tint plus a colored left border — distinct from body text (important for motions, recommendations, legal text in gov docs)
- Keep "Page X" annotations below sections as-is (tiny text, useful for PDF cross-reference)

### Claude's Discretion
- Exact heading sizes and spacing above h1/h2 vs h3/h4 — should create clear section breaks matching the "comfortable" typography
- Heading font treatment (serif vs sans for headings)
- Exact shadow/fade implementation for table scroll indicators
- Zebra stripe color intensity

</decisions>

<specifics>
## Specific Ideas

- The core problem is double-rendered headings: JSX renders section_title as `<h2>`, then the markdown content also contains the same heading — producing duplicates
- The fix is architectural: stop rendering explicit headings in JSX, let markdown be the single source of truth for document structure
- Government documents frequently have wide tables (budgets, schedules, votes) that must scroll independently on mobile

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 25-document-viewer-polish*
*Context gathered: 2026-02-26*
