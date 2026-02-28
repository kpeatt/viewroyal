# Phase 27: Document Discoverability - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can find and follow document trails from both individual agenda items and the full matter timeline. This phase adds document links to agenda items (linking to the document viewer) and document information to the matter detail page. No new document extraction, search, or viewer features — those belong in other phases.

</domain>

<decisions>
## Implementation Decisions

### Agenda Item Document Links
- Keep the current inline document preview (DocumentSections accordion) but add a "View full document →" link at the bottom of each document group
- The link goes to the document viewer page (`/meetings/:id/documents/:docId`), same tab
- Add a document count chip in the agenda item metadata row (alongside discussion time, motions count) — e.g., "2 docs" — using the existing metadata chip pattern
- The overview tab's existing Documents link (count + chevron to `/meetings/:id/documents`) stays as-is

### Matter Page Documents
- Add documents inline per timeline entry on the matter detail page — under each meeting appearance, show the documents associated with that agenda item
- Display as compact chips: type badge + title + link to the document viewer
- No summaries or expanded sections on the matter page — keep the timeline clean

### Document Trail
- The matter timeline already shows chronological progression; adding per-entry documents is sufficient to complete the trail
- No separate cross-meeting document tracker needed — the timeline IS the trail

### Link Destinations
- All document links go to the document viewer page (`/meetings/:id/documents/:docId`) in the same tab
- This leverages the polished viewer from Phase 25

### Claude's Discretion
- Exact styling of the "View full document" link (color, spacing)
- How to handle agenda items with no documents (likely just omit the docs section)
- Query approach for fetching matter documents (nested select vs parallel fetch — noted as a blocker in STATE.md)
- Loading states and error handling

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DocumentSections` component (`app/components/meeting/DocumentSections.tsx`): Already renders grouped/flat document sections per agenda item — needs a "View full document" link added
- `getDocumentSectionsForMeeting()` / `getExtractedDocumentsForMeeting()` in `app/services/meetings.ts`: Fetch document data for a meeting
- `getDocumentTypeLabel()` / `getDocumentTypeColor()` in `app/lib/document-types.ts`: Type badge rendering utilities
- `MarkdownContent` component: Renders markdown content in sections
- `Badge`, `Separator`, lucide-react icons: Standard UI building blocks

### Established Patterns
- Server loaders fetch data via service functions, components render from `loaderData`
- Metadata chips pattern in `AgendaItemRow`: `<span className="flex items-center text-[11px] font-semibold">` with icon + text
- Existing document type badges: compact `<span>` with `getDocumentTypeColor()` classes
- Timeline entries on matter page: `<div className="relative pl-8 before:absolute...">` with connector lines

### Integration Points
- `AgendaOverview` → `DocumentSections`: Already wired, need to thread extracted_document_id through to build viewer URL
- `getMatterById` query in `app/services/matters.ts`: Currently selects agenda_items + meetings + motions but NOT documents — needs to join documents/extracted_documents
- `meeting-detail.tsx` loader: Already fetches documentSections + extractedDocuments via Promise.all
- Document viewer route: `/meetings/:id/documents/:documentId` (`app/routes/document-viewer.tsx`)
- STATE.md blocker: "Choose nested select vs. parallel fetch for matter documents before writing code"

</code_context>

<specifics>
## Specific Ideas

- Document count chip should match the existing metadata chip aesthetic (11px font, semibold, icon + text)
- "View full document →" link should feel like a natural continuation of the expanded section, not a prominent button
- Matter page document chips should be compact enough not to overwhelm the timeline entries which already have motions, debate summaries, etc.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 27-document-discoverability*
*Context gathered: 2026-02-28*
