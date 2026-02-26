# Feature Landscape: v1.5 Document Experience

**Domain:** Document viewing, cross-linking, and meeting provenance for a civic intelligence platform
**Researched:** 2026-02-26
**Mode:** Ecosystem research -- what do citizens expect when browsing council documents and tracing information provenance?

---

## Executive Summary

Civic document experience breaks into three distinct areas: (1) **document viewing** -- rendering extracted markdown content with polished typography, responsive tables, and proper heading hierarchy, (2) **document cross-linking** -- surfacing related documents on meeting detail and matter pages so users can follow the paper trail, and (3) **meeting provenance indicators** -- showing users at a glance what source materials exist for a meeting (agenda, minutes, video) with links to the originals and when data was last updated.

The existing codebase already has substantial infrastructure: `documents` and `document_sections` tables with embeddings, an `extracted_documents` table with document types/summaries/key facts, a `DocumentSections` component rendering markdown in accordion panels within agenda items, and a `document-viewer.tsx` route that renders individual extracted documents with inline images. The `meeting-documents.tsx` route lists all documents for a meeting. The `meetings` table already tracks `has_agenda`, `has_minutes`, `has_transcript`, `agenda_url`, `minutes_url`, and `video_url`.

What is missing: (a) the document viewer has basic typography -- it needs polished official-document-style rendering with deduplicated titles, better spacing, and responsive table handling; (b) document sections on meeting detail pages are buried inside expanded agenda items rather than being prominently discoverable; (c) matter pages have zero document visibility -- they show agenda items with motions but no linked documents across meetings; (d) there are no provenance indicators anywhere showing what source materials exist and where they came from.

Comparable platforms (Legistar/Granicus, CivicPlus, Council Data Project, citymeetings.nyc) universally show source material availability as icons/badges on meeting list and detail views. The document cross-linking pattern where "this staff report was discussed at meetings X, Y, and Z" is a differentiator few civic platforms do well. The table stakes are clear: users need to trust the information, and trust requires provenance.

---

## Table Stakes Features

Features citizens expect from a civic platform showing council documents. Missing any of these creates confusion about what information is available and where it came from.

### TS-1: Polished Document Viewer Typography

| Aspect | Detail |
|--------|--------|
| **What** | Improve the existing `document-viewer.tsx` route with: better prose styling for official documents (appropriate line height, paragraph spacing, heading hierarchy), responsive table handling that scrolls horizontally on mobile rather than breaking layout, and deduplicated titles (extracted doc title often repeats the first section heading). |
| **Why expected** | The existing viewer renders markdown with `prose-sm` Tailwind classes that produce cramped, blog-like formatting. Council staff reports, bylaws, and delegations are official documents -- they deserve readable typography with appropriate whitespace. Tables in staff reports (financial summaries, comparison matrices) currently overflow on mobile. When the document title is "Staff Report - Proposed Zoning Amendment" and the first section heading is also "Staff Report - Proposed Zoning Amendment," showing both feels like a rendering bug. |
| **Complexity** | Low -- CSS/Tailwind adjustments to `MarkdownContent` component and `document-viewer.tsx`. Title deduplication is simple string comparison. Table overflow is a `overflow-x-auto` wrapper. |
| **Dependencies** | Existing `document-viewer.tsx`, `MarkdownContent` component, `DocumentSections.tsx`. |
| **Notes** | The `MarkdownContent` component already uses `marked` with GFM. Improvements are purely presentational: adjust `prose` classes for official-document feel (slightly larger body text, more heading spacing, blockquote styling for quoted correspondence). Add `overflow-x-auto` to table containers. Detect and suppress duplicate title when `section_title` matches `extractedDoc.title`. Consider a subtle page-number gutter indicator for multi-page documents. |

### TS-2: Document Section Links on Meeting Detail Agenda Items

| Aspect | Detail |
|--------|--------|
| **What** | When viewing a meeting detail page, each agenda item that has linked document sections should show a compact, visible indicator (not hidden inside accordion expansion) with document count and types. Clicking opens the existing `DocumentSections` accordion or navigates to the full document viewer. |
| **Why expected** | Currently, document sections only appear after expanding an agenda item, nested below the debate summary and motions. Users browsing the agenda cannot tell which items have supporting documents without clicking every single item. Legistar shows attachment counts inline on agenda item rows. CivicPlus shows document icons on agenda items. This is basic discoverability. |
| **Complexity** | Low -- the data is already loaded (`documentSections` and `extractedDocuments` are fetched in the meeting-detail loader). This is a UI change to `AgendaItemRow` to surface document availability in the collapsed state. |
| **Dependencies** | Existing `documentSections` and `extractedDocuments` data passed to `AgendaOverview`. Existing `DocumentSections` component. |
| **Notes** | Show a small `FileText` icon with count (e.g., "3 docs") next to existing metadata chips (duration, motion count) on each agenda item row. The `linkedSections` filtering already happens inside `AgendaItemRow` -- just surface the count in the collapsed view. Consider grouping by canonical document type (e.g., "Staff Report, 2 Appendices") for richer indication. Link to the full document viewer route (`/meetings/:id/documents/:docId`) for individual documents. |

### TS-3: Documents on Matter Pages

| Aspect | Detail |
|--------|--------|
| **What** | On the matter detail page, show all related documents across every meeting where this matter appeared. Group documents by meeting date, showing document type, title, and link to the document viewer. |
| **Why expected** | Matters are the longitudinal view -- "Bylaw 1540" discussed across 5 meetings over 8 months. Currently, the matter timeline shows agenda items with motions and debate summaries, but zero document visibility. A citizen tracking a rezoning proposal needs to see the original staff report, the revised staff report after public hearing, the bylaw amendment text, and the final approved bylaw -- all linked from the matter page. Without this, the matter page is a timeline of discussions with no access to the actual documents discussed. |
| **Complexity** | Medium -- requires a new query joining `agenda_items` (via `matter_id`) to `document_sections` (via `agenda_item_id`) to `documents` (via `document_id`), then to `extracted_documents`. The `getMatterById` service function needs to include document data, or a separate fetch is needed. |
| **Dependencies** | Existing `matter-detail.tsx` route. Existing `matters.ts` service. `document_sections.agenda_item_id` FK linking sections to agenda items. `extracted_documents` table for titles/types/summaries. |
| **Notes** | The query path is: `matters` -> `agenda_items` (via matter_id) -> `document_sections` (via agenda_item_id) -> `documents` (via document_id) -> `extracted_documents` (via document_id). Group results by meeting date to show the document trail chronologically. Show document type badge, title, and one-line summary. Link each document to `/meetings/:meetingId/documents/:extractedDocId`. This is the single highest-value feature for citizens tracking a specific issue through council. |

### TS-4: Meeting Provenance Indicators

| Aspect | Detail |
|--------|--------|
| **What** | On both the meeting list page and meeting detail page, show visual indicators for what source materials are available: Agenda (PDF available), Minutes (PDF available), Video (recording available), Transcript (AI-diarized transcript available). Each indicator links to the source -- agenda/minutes to the PDF URL, video to the video player, transcript to the transcript tab. Include a "last updated" timestamp showing when the meeting data was last processed by the pipeline. |
| **Why expected** | Every civic meeting platform shows source availability. Legistar shows Agenda/Minutes/Video links on meeting rows. CivicPlus shows icons for available materials. Council Data Project shows transcript availability. Citizens need to know: "Does this meeting have minutes yet?" "Was the video recorded?" "Has the transcript been processed?" Currently, `has_agenda`, `has_minutes`, and `has_transcript` booleans exist on the `meetings` table, along with `agenda_url`, `minutes_url`, and `video_url`, but none of these are surfaced in the UI. The meeting list shows only title and date. The meeting detail shows video and transcript content but has no explicit provenance indicators. |
| **Complexity** | Low -- the data already exists on the `meetings` table. This is purely a UI feature adding badges/icons to `meeting-list-row.tsx` and the meeting detail header. |
| **Dependencies** | Existing `meetings` table columns: `has_agenda`, `has_minutes`, `has_transcript`, `agenda_url`, `minutes_url`, `video_url`, `updated_at`. Existing `meeting-list-row.tsx` component. Meeting detail page header in `meeting-detail.tsx`. |
| **Notes** | Use a consistent badge pattern: filled icon when available (with link to source), muted/outline icon when not available. For the meeting list, show compact icons (e.g., small `FileText`, `ScrollText`, `Video`, `Mic` icons). For the meeting detail header, show larger badges with labels (e.g., "Agenda (PDF)" linking to `agenda_url`, "Minutes (PDF)" linking to `minutes_url`, "Video" linking to `video_url`). The `updated_at` timestamp tells users when data was last refreshed by the pipeline. Display as "Data updated: Feb 15, 2026" in the meeting detail header. |

---

## Differentiators

Features that elevate the document experience from "adequate" to "impressive." Not strictly expected, but create meaningful value for regular users.

### D-1: Document Table of Contents Sidebar

| Aspect | Detail |
|--------|--------|
| **What** | On the document viewer page, add a sticky sidebar (desktop) or collapsible TOC (mobile) showing all section headings from the document. Highlight the current section on scroll using IntersectionObserver. Click a heading to scroll to that section. |
| **Why differentiating** | Staff reports can be 20+ sections long. The current viewer is a single scrolling column with no way to jump between sections. CivicPlus Codification uses a TOC sidebar for ordinance browsing. Documentation sites universally use this pattern (Stripe, Supabase, fumadocs). It transforms the viewer from "long scroll" to "navigable document." |
| **Complexity** | Medium -- requires IntersectionObserver setup, position-sticky sidebar, responsive collapsing on mobile. The section headings already exist in the `allSections` data. |
| **Dependencies** | Existing `document-viewer.tsx` with `allSections` array that has `section_title` and `section_order`. Existing `id="section-${section.section_order}"` anchor IDs already rendered on sections. |
| **Notes** | Use a pattern similar to fumadocs' "On This Page" component: sticky right sidebar on `lg:` breakpoint, collapses to a dropdown/accordion on mobile. The section anchor IDs already exist (`section-1`, `section-2`, etc.) in the current viewer. IntersectionObserver watches these anchors and highlights the corresponding TOC item. This is a well-established pattern with many reference implementations. |

### D-2: Document-to-Document Cross-References

| Aspect | Detail |
|--------|--------|
| **What** | On the document viewer page, show a "Related Documents" section listing other documents from the same meeting, documents from the same matter across meetings, and other agenda items that reference the same parent document. |
| **Why differentiating** | Legislative platforms like Plural and Quorum auto-link related bills across jurisdictions. At the local level, this means: when viewing a staff report about a rezoning, the viewer should show "Also see: Public Hearing Notice (same meeting), Previous Staff Report (Committee of the Whole, Jan 2026), Bylaw 1540 Third Reading (Regular Council, Feb 2026)." This creates the connective tissue that lets users follow an issue through the council process. |
| **Complexity** | Medium -- requires querying other documents for the same meeting and documents for the same matter. The query through `agenda_items.matter_id` is the key join. |
| **Dependencies** | Existing `extracted_documents` with `agenda_item_id`. Existing `agenda_items.matter_id` FK. The document viewer already loads `linkedAgendaItem` which has the `agenda_item_id` and could be extended to include `matter_id`. |
| **Notes** | Two categories of related docs: (1) Same meeting -- other extracted docs from the same `meeting_id`, easy query via `documents.meeting_id`. (2) Same matter -- extracted docs from agenda items sharing the same `matter_id`, requires a join through `agenda_items`. Display as a compact list with document type badge, title, meeting date, and link. Prioritize "same matter" connections as they represent the longitudinal trail. |

### D-3: Source PDF Link on Document Viewer

| Aspect | Detail |
|--------|--------|
| **What** | On the document viewer, prominently display a link to the original source PDF with page range indication. E.g., "View original PDF (Pages 45-52 of Agenda Package)." |
| **Why differentiating** | The current viewer has a small "Original PDF" link in the header and a source footer, but the page range context is subtle. Citizens and journalists need to verify AI-extracted content against the official record. Making the source link prominent with page context says "we extracted this from pages 45-52 of the official agenda package -- verify it yourself." This builds trust. CivicPress emphasizes "every change is tracked, auditable, and fully reversible" as a core principle. |
| **Complexity** | Low -- the data already exists (`parentDocument.source_url`, `extractedDoc.page_start`, `extractedDoc.page_end`, `parentDocument.page_count`). |
| **Dependencies** | Existing data in the document viewer loader. |
| **Notes** | Add a persistent bar or card at the top of the document content: "Extracted from [Agenda Package] (PDF, 85 pages) -- This document spans pages 45-52. [View Original PDF]". The `source_url` links to the CivicWeb-hosted PDF. Consider adding `#page=45` to the PDF URL for browsers that support PDF page anchoring. |

### D-4: Meeting Completeness Progress Indicator

| Aspect | Detail |
|--------|--------|
| **What** | On the meeting detail page, show a subtle progress indicator of data completeness: "This meeting has: Agenda, Video, Transcript, 12 Documents, 8 Motions. Missing: Minutes." This tells users what to expect and what is not yet available. |
| **Why differentiating** | Most civic platforms show what IS available but do not explicitly call out what is MISSING. For a recent meeting, minutes might not be published yet. For an older meeting, video might not have been recorded. Explicitly showing completeness helps users understand whether information gaps are expected (minutes not yet approved) or permanent (no video was recorded for this 2019 meeting). |
| **Complexity** | Low -- all data points already exist on the `meetings` table and in the meeting detail loader response. |
| **Dependencies** | Existing meeting data: `has_agenda`, `has_minutes`, `has_transcript`, `video_url`, counts of agenda items, motions, documents. |
| **Notes** | Could be integrated into the existing `MeetingQuickStats` component or displayed as a separate compact bar. Show checkmarks for available sources, question marks or dashes for missing ones. For recent meetings (within 30 days), add context like "Minutes typically available 2-4 weeks after the meeting" to set expectations. |

---

## Anti-Features (Deliberately NOT Building)

### AF-1: Inline PDF Viewer (Embedded PDF.js)
**Why not:** Embedding a full PDF viewer (PDF.js) adds 400KB+ to the bundle, creates accessibility issues (PDF rendering in an iframe is not screen-reader friendly), and duplicates the work the pipeline already did extracting content into markdown. The extracted markdown with proper typography IS the superior viewing experience. The "View Original PDF" link covers the "I want to see the exact official document" use case. Trying to show both creates UI confusion about which is the "real" document.

### AF-2: Document Annotation / Highlighting
**Why not:** Annotation features (like Hypothesis.is overlay) require user accounts, persistent storage for annotations, and moderation. They are social features that undermine the "official record" credibility the platform is trying to establish. The platform presents the council's documents, not citizen commentary on them. If annotations are ever desired, they belong in a separate layer with clear visual separation from official content.

### AF-3: Document Diff / Version Comparison
**Why not:** Showing diffs between versions of a bylaw or staff report across meetings is conceptually appealing but extremely complex. Council documents are not versioned in a diff-friendly way -- a "revised staff report" is often a complete rewrite, not an incremental edit. Building a meaningful diff engine for loosely structured municipal documents is a research problem, not a feature. Defer to v2.0+ if ever.

### AF-4: Document Download / Export
**Why not:** The source PDFs are already downloadable via the `source_url` link. Adding "Download as DOCX" or "Export as Markdown" creates maintenance burden for questionable value. The extracted markdown content is viewable on-screen and the official PDF is one click away. Nobody needs a third format.

### AF-5: Full-Text Search Scoped to a Single Document
**Why not:** The global search already searches across document sections. Adding per-document search (Ctrl+F within the viewer) adds UI complexity for a use case already served by the browser's built-in Ctrl+F on the rendered page. The markdown sections are rendered as HTML text, so browser search works natively.

### AF-6: AI Summary / "Explain This Document" Button
**Why not:** The extracted documents already have AI-generated summaries and key facts from the pipeline's Gemini extraction. Adding a live "Explain this" button would require another Gemini API call per click, adding latency and cost. The existing summaries are good enough. The RAG Q&A on the main search page can answer specific questions about document content.

### AF-7: Print-Optimized Document Layout
**Why not:** Citizens who want to print a council document should print the official PDF (linked via source URL). Creating a separate print-optimized layout for the extracted markdown is effort with near-zero usage. The source PDF is the print artifact.

---

## Feature Dependencies

```
TS-1 (Document Viewer Typography)
 -- Independent. Purely CSS/component changes.
 -- No data model changes needed.
 -- Blocks: D-1 (TOC sidebar should use the improved typography)

TS-2 (Document Section Links on Agenda Items)
 -- Depends on: existing documentSections/extractedDocuments data (ALREADY LOADED)
 -- UI change to: AgendaOverview.tsx, AgendaItemRow
 -- Independent of TS-1

TS-3 (Documents on Matter Pages)
 -- Depends on: new query joining matters -> agenda_items -> document_sections -> extracted_documents
 -- Requires: service function change in matters.ts or new query in matter-detail loader
 -- Independent of TS-1, TS-2

TS-4 (Meeting Provenance Indicators)
 -- Depends on: existing meetings table data (ALREADY AVAILABLE)
 -- UI changes to: meeting-list-row.tsx, meeting-detail.tsx header
 -- Independent of all other features

D-1 (Document TOC Sidebar)
 -- Depends on: TS-1 (build on improved typography)
 -- Adds to: document-viewer.tsx
 -- Independent of TS-2, TS-3, TS-4

D-2 (Document Cross-References)
 -- Depends on: TS-3 query patterns (similar joins through matter_id)
 -- Adds to: document-viewer.tsx
 -- Could share query logic with TS-3

D-3 (Source PDF Link Enhancement)
 -- Depends on: existing data in document viewer loader
 -- Purely UI enhancement to document-viewer.tsx
 -- Independent

D-4 (Meeting Completeness Indicator)
 -- Depends on: TS-4 (uses same data, extends the pattern)
 -- Adds to: meeting-detail.tsx
 -- Should build after TS-4

Existing infrastructure (ALREADY BUILT):
 - documents table with meeting_id, source_url, page_count
 - document_sections table with agenda_item_id, embedding, tsvector
 - extracted_documents table with document_type, summary, key_facts
 - document-viewer.tsx route with sections, images, breadcrumbs
 - meeting-documents.tsx route listing all docs for a meeting
 - DocumentSections.tsx component rendering in agenda items
 - MarkdownContent.tsx component with marked + prose classes
 - meetings table has_agenda/has_minutes/has_transcript/urls
 - document-types.ts with 10 canonical types, labels, and colors
```

**Build order implication:** TS-1 and TS-4 are independent and can be built first in parallel. TS-2 is a quick UI win that surfaces existing data. TS-3 requires new queries and is the most complex table-stakes feature. D-1 through D-4 build on the table-stakes foundation.

---

## Feature-to-Database Mapping

| Feature | Tables Read | New Queries Needed |
|---------|-------------|-------------------|
| TS-1 (Typography) | None -- purely presentational | None |
| TS-2 (Doc links on agenda) | document_sections, extracted_documents | None -- data already loaded |
| TS-3 (Docs on matters) | matters, agenda_items, document_sections, documents, extracted_documents | Yes -- join through matter_id -> agenda_item_id -> document_sections |
| TS-4 (Provenance indicators) | meetings | None -- columns already selected |
| D-1 (TOC sidebar) | document_sections | None -- data already loaded |
| D-2 (Cross-references) | extracted_documents, agenda_items, documents | Yes -- same-meeting docs + same-matter docs |
| D-3 (Source PDF link) | documents, extracted_documents | None -- data already loaded |
| D-4 (Completeness) | meetings, agenda_items, motions, documents | None -- counts derivable from existing data |

---

## MVP Recommendation

**Priority 1 -- Quick wins (build first, highest impact-to-effort ratio):**
1. TS-4: Meeting provenance indicators -- surfaces existing data, immediately useful on every meeting page
2. TS-2: Document section links on agenda items -- surfaces existing data, one UI change
3. TS-1: Document viewer typography polish -- CSS-only improvements, no data changes

**Priority 2 -- Core document experience (build second):**
4. TS-3: Documents on matter pages -- highest value new feature, requires new queries
5. D-3: Source PDF link enhancement -- builds trust, simple UI change

**Priority 3 -- Navigation and cross-linking (build third):**
6. D-1: Document TOC sidebar -- improves long-document navigation
7. D-2: Document-to-document cross-references -- creates the connective tissue

**Defer to later:**
8. D-4: Meeting completeness indicator -- nice-to-have, lower priority

**Do not build:**
- AF-1 through AF-7: All anti-features explicitly out of scope

---

## Comparable Platform Analysis

| Platform | Document Viewing | Cross-Linking | Provenance |
|----------|-----------------|---------------|------------|
| **Legistar (Granicus)** | Links to PDF downloads, no rendered view | Agenda items link to legislation files | Agenda/Minutes/Video icons on meeting rows |
| **CivicPlus** | Agenda/minutes rendered in CMS, attachments as downloads | Agenda items link to supporting files | Icons for available materials on meeting list |
| **Council Data Project** | Transcript display with section navigation | Minutes items link to transcript segments | Tabs for transcript/voting/details |
| **citymeetings.nyc** | AI chapters from video transcript | Links between chapters and full transcript | Video source with timestamp links |
| **CivicPress** | Markdown-rendered records with Git history | YAML front matter links between records | Git-backed version history as provenance |
| **ViewRoyal.ai (current)** | Markdown viewer with inline images | Sections shown inside agenda item accordions only | None -- has_agenda/has_minutes exist but not surfaced |
| **ViewRoyal.ai (v1.5 target)** | Polished typography, TOC sidebar, responsive tables | Documents on matter pages, cross-references, prominent agenda item links | Badges on meeting list/detail, source PDF links, last-updated timestamps |

---

## Sources

- [Council Data Project](https://councildataproject.org/) -- open-source civic meeting data platform, navigation/transcript features
- [citymeetings.nyc](https://citymeetings.nyc/) -- AI-powered NYC council meeting navigation, chapter-based viewing
- [CivicPress](https://civicpress.io/) -- open-source civic infrastructure, Markdown records with Git-backed provenance
- [Granicus Legistar](https://granicus.com/product/legistar-agenda-management/) -- agenda management, document/video availability indicators
- [CivicPlus Agenda & Meeting Management](https://www.civicplus.com/civicclerk/agenda-meeting-management/) -- end-to-end meeting management with document linking
- [CivicPlus Mobile Responsive Best Practices](https://www.civicplus.help/municipal-websites-central/docs/mobile-responsive-content-best-practices) -- responsive table handling for civic content
- [Plural Policy](https://pluralpolicy.com/) -- legislative cross-linking, related bill discovery
- [CSS-Tricks: Sticky TOC with Scrolling Active States](https://css-tricks.com/sticky-table-of-contents-with-scrolling-active-states/) -- IntersectionObserver TOC implementation pattern
- [CSS-Tricks: TOC with IntersectionObserver](https://css-tricks.com/table-of-contents-with-intersectionobserver/) -- scroll-spy TOC reference
- [Municipal Website Design 2026](https://snapsite.us/municipal-website-design-essential-features-guide/) -- civic web design best practices
- [Civic Design Systems Guide](https://www.maxiomtech.com/accessible-ux-civic-design-systems/) -- accessibility and trust in civic UX
- [CitiLink-Minutes Dataset](https://arxiv.org/html/2602.12137) -- research on municipal meeting minutes structure and annotation

---
*Last updated: 2026-02-26*
