# Phase 28: Document Navigation - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can navigate long documents efficiently via a table of contents sidebar and discover related documents through cross-references. The TOC highlights the current section while scrolling and allows jumping to any section. Cross-references between related documents (e.g., a staff report referencing a bylaw) are detected and linked.

</domain>

<decisions>
## Implementation Decisions

### TOC sidebar layout
- Sticky left sidebar, fixed ~220px width
- Only show TOC for documents with 3+ sections; below threshold, keep the current single-column layout
- Long section titles truncated with ellipsis in the narrow sidebar

### Active section tracking
- Active section indicated by bold text + left border accent (indigo, like Tailwind docs style)
- Smooth scroll animation when clicking a TOC item
- URL hash updates only on TOC click (not during passive scrolling) — supports deep-linking without noisy URL changes
- Scroll-spy uses top-of-viewport detection (section whose top edge is closest to the top of the screen)

### Cross-reference detection
- Pattern matching in section_text for references like "Bylaw No. 1234", document titles, report names
- Match against known documents in the database — no pipeline changes needed
- Inline cross-references rendered as chip/badge beside the referenced text (small badge with document icon + link)
- Cross-reference links navigate to the document viewer page (`/meetings/{id}/documents/{docId}`) or bylaw detail page, in the same tab
- A "Related Documents" section at the bottom of the document collects all cross-referenced documents in one place

### Responsive behavior
- Desktop (lg/1024px+): Sticky left sidebar with TOC
- Mobile (<1024px): Collapsible sticky top bar showing the current section name (updates via scroll-spy); tap to expand dropdown list of all sections
- "Related Documents" section at the bottom uses the same layout on all screen sizes

### Claude's Discretion
- TOC heading depth (flat list vs indented by heading level) — pick based on actual data structure
- Exact scroll-spy implementation (IntersectionObserver vs scroll event)
- Cross-reference regex patterns and matching heuristics
- Chip/badge design details (colors, icon, sizing)
- Transition animations and timing

</decisions>

<specifics>
## Specific Ideas

- TOC sidebar style inspired by docs sites (MDN, Tailwind) — clean left nav with active indicator
- Mobile top bar should feel lightweight — just shows current section, expands to full TOC on tap
- Cross-reference badges should be visually distinct from regular text links but not overwhelming

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ScrollArea` component (`app/components/ui/scroll-area.tsx`): Can be used for TOC sidebar scrolling
- `VideoWithSidebar` component: Reference for sidebar layout pattern (sticky sidebar + scrollable content)
- `MarkdownContent` component: Already renders section content — cross-reference badges would be injected here or via preprocessing
- `getDocumentTypeLabel` / `getDocumentTypeColor`: Reusable for cross-reference chips
- Section anchors already exist: `id="section-{section_order}"` on each section div

### Established Patterns
- Tailwind CSS with `cn()` utility for conditional classes
- Zinc/indigo color palette throughout the app
- `lucide-react` icons for UI elements
- Server loaders fetch data, components render with SSR

### Integration Points
- `document-viewer.tsx` route: Primary integration point — needs layout restructured for sidebar
- Loader already fetches sections with `section_title` and `section_order` — TOC data is available
- Cross-reference matching needs access to `extracted_documents` and `bylaws` tables for lookup
- `app/services/meetings.ts` or new service function for cross-reference queries

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 28-document-navigation*
*Context gathered: 2026-02-28*
