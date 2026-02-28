# Phase 27: Document Discoverability - Research

**Researched:** 2026-02-28
**Domain:** Frontend UI integration (React components + Supabase queries)
**Confidence:** HIGH

## Summary

This phase adds document links and document metadata to two existing pages: the meeting detail page (agenda items) and the matter detail page (timeline). No new libraries, routes, or database schema changes are needed. All required data relationships already exist in the database (extracted_documents has both `agenda_item_id` and `document_id` which links to `documents.meeting_id`). The implementation is primarily component modifications and one new service function.

The meeting detail page already loads `documentSections` and `extractedDocuments` and passes them into `AgendaOverview` which filters them per agenda item. The `DocumentSections` component renders grouped document previews but lacks a "View full document" link. Adding one is straightforward -- the `extracted_document_id` (i.e., `ed.id`) is already available inside `GroupedDocumentSections`, and the document viewer route is `/meetings/:id/documents/:docId`.

The matter detail page currently has no document data at all. The `getMatterById` query joins `agenda_items` with `meetings` and `motions` but does not join `extracted_documents`. Adding document metadata per agenda item requires either a nested select through the Supabase PostgREST API or a parallel batch fetch. This is the main technical decision for this phase.

**Primary recommendation:** Use a batch `.in()` query on `extracted_documents` for matter page documents (matching the project decision in STATE.md) rather than nesting inside the existing `getMatterById` select.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Keep the current inline document preview (DocumentSections accordion) but add a "View full document" link at the bottom of each document group
- The link goes to the document viewer page (`/meetings/:id/documents/:docId`), same tab
- Add a document count chip in the agenda item metadata row (alongside discussion time, motions count) -- e.g., "2 docs" -- using the existing metadata chip pattern
- The overview tab's existing Documents link (count + chevron to `/meetings/:id/documents`) stays as-is
- Add documents inline per timeline entry on the matter detail page -- under each meeting appearance, show the documents associated with that agenda item
- Display as compact chips: type badge + title + link to the document viewer
- No summaries or expanded sections on the matter page -- keep the timeline clean
- The matter timeline already shows chronological progression; adding per-entry documents is sufficient to complete the trail
- No separate cross-meeting document tracker needed -- the timeline IS the trail
- All document links go to the document viewer page (`/meetings/:id/documents/:docId`) in the same tab

### Claude's Discretion
- Exact styling of the "View full document" link (color, spacing)
- How to handle agenda items with no documents (likely just omit the docs section)
- Query approach for fetching matter documents (nested select vs parallel fetch -- noted as a blocker in STATE.md)
- Loading states and error handling

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOCL-01 | User sees linked document sections on each agenda item in the meeting detail page with links to the full document viewer | `DocumentSections` component already renders per-item documents; needs "View full document" link added at bottom of each group + doc count chip in metadata row. `ed.id` is available for building viewer URL. |
| DOCL-02 | User sees all related documents across every meeting on the matter detail page | `getMatterById` needs document data. Batch `.in()` query on `extracted_documents` using agenda item IDs from matter. New document chips rendered per timeline entry. |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19 | UI components | Already in use |
| react-router | 7 | Link component for document viewer navigation | Already in use |
| lucide-react | latest | FileText icon for doc count chip | Already in use |
| @supabase/supabase-js | latest | Supabase queries for document data | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `app/lib/document-types.ts` | local | `getDocumentTypeLabel()`, `getDocumentTypeColor()` | When rendering type badges on matter page chips |
| `app/lib/utils.ts` | local | `cn()` for className merging | All component styling |

### Alternatives Considered
None -- no new libraries needed for this phase.

**Installation:**
No installation required. All dependencies are already present.

## Architecture Patterns

### Recommended Project Structure
```
apps/web/app/
├── services/
│   └── matters.ts           # Add getDocumentsForMatterItems() or modify getMatterById()
├── components/meeting/
│   ├── DocumentSections.tsx  # Add "View full document" link
│   └── AgendaOverview.tsx    # Add doc count chip in metadata row
└── routes/
    └── matter-detail.tsx     # Add documents to timeline entries
```

### Pattern 1: Document Count Chip in Metadata Row
**What:** Add document count as a metadata chip alongside existing chips (discussion time, motions count, financial cost)
**When to use:** Agenda item metadata row in `AgendaItemRow` component
**Example:**
```tsx
// Source: existing pattern in AgendaOverview.tsx lines 386-404
// Matches existing chip pattern: <span className="flex items-center text-[11px] font-semibold">
{linkedExtractedDocs.length > 0 && (
  <span className="flex items-center text-[11px] font-semibold text-indigo-700">
    <FileText className="w-3 h-3 mr-0.5" />
    {linkedExtractedDocs.length} {linkedExtractedDocs.length === 1 ? "doc" : "docs"}
  </span>
)}
```

### Pattern 2: "View Full Document" Link at Bottom of GroupedDocumentSections
**What:** After expanding a document's sections, show a subtle link to navigate to the full document viewer
**When to use:** Inside `GroupedDocumentSections`, after child sections render for each extracted doc
**Example:**
```tsx
// Source: pattern from DocumentSections.tsx GroupedDocumentSections
// After the childSections.map() inside the expanded content div
// Need meeting_id threaded through props for URL construction
<Link
  to={`/meetings/${meetingId}/documents/${ed.id}`}
  className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 mt-3 pt-2 border-t border-zinc-100 transition-colors"
>
  View full document
  <ChevronRight className="w-3 h-3" />
</Link>
```

### Pattern 3: Batch Query for Matter Documents (STATE.md Blocker Resolution)
**What:** After fetching the matter with its agenda items, use a single batch `.in()` query to fetch all extracted_documents for those agenda items
**When to use:** In the matter-detail loader, after `getMatterById()`
**Why batch, not nested select:**
- STATE.md explicitly notes "Choose nested select vs. parallel fetch for matter documents before writing code" as a blocker
- STATE.md decision already says "Matter documents use batch `.in()` query, not per-item loops (N+1 prevention)"
- The `getMatterById` select string is already very long (single line with deeply nested joins). Adding another nested join would make it harder to maintain and potentially hit PostgREST complexity limits
- A separate `.in()` query is more predictable, easier to test, and follows the existing pattern used by `getDocumentSectionsForMeeting` and `getExtractedDocumentsForMeeting`

**Example:**
```tsx
// New service function in matters.ts
export async function getDocumentsForAgendaItems(
  supabase: SupabaseClient,
  agendaItemIds: number[],
): Promise<ExtractedDocument[]> {
  if (agendaItemIds.length === 0) return [];
  const { data, error } = await supabase
    .from("extracted_documents")
    .select("id, document_id, agenda_item_id, title, document_type, page_start, page_end")
    .in("agenda_item_id", agendaItemIds)
    .order("agenda_item_id")
    .order("page_start", { ascending: true, nullsFirst: false });
  if (error) {
    console.error("Error fetching documents for agenda items:", error);
    return [];
  }
  return (data ?? []) as ExtractedDocument[];
}
```

### Pattern 4: Matter Page Document Chips
**What:** Compact document chips under each timeline entry showing type + title + link
**When to use:** In `matter-detail.tsx` timeline rendering, after debate_summary and before motions
**Example:**
```tsx
// Source: pattern from CONTEXT.md decisions
// Compact chips: type badge + title + link to document viewer
{itemDocs.length > 0 && (
  <div className="flex flex-wrap gap-2 mt-3">
    {itemDocs.map((doc) => (
      <Link
        key={doc.id}
        to={`/meetings/${item.meeting_id}/documents/${doc.id}`}
        className="inline-flex items-center gap-1.5 text-xs bg-white border border-zinc-200 rounded-md px-2 py-1 hover:border-blue-200 hover:shadow-sm transition-all"
      >
        <span className={cn(
          "inline-block px-1 py-0.5 text-[8px] font-bold uppercase rounded border shrink-0",
          getDocumentTypeColor(doc.document_type),
        )}>
          {getDocumentTypeLabel(doc.document_type).slice(0, 6)}
        </span>
        <span className="text-zinc-700 truncate max-w-[200px]">{doc.title}</span>
      </Link>
    ))}
  </div>
)}
```

### Anti-Patterns to Avoid
- **N+1 queries for matter documents:** Do NOT loop over agenda items and fetch documents one at a time. Use batch `.in()` query.
- **Including full section text in matter page queries:** Only fetch document metadata (id, title, type, page range) for matter page. Summaries and section text are NOT shown per CONTEXT.md decisions.
- **Modifying the existing `getMatterById` select string:** It is already extremely long and deeply nested. Add a separate service function instead.
- **Adding `neighborhood` to agenda_items queries:** Per CLAUDE.md, this column does NOT exist in the database despite being in TypeScript types.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Document type badges | Custom color/label logic | `getDocumentTypeLabel()`, `getDocumentTypeColor()` from `app/lib/document-types.ts` | Already normalizes ~53 raw types to 10 canonical types with proper colors |
| Navigation links | Raw `<a>` tags | `<Link>` from react-router | SPA navigation, preserves client state |
| Conditional class merging | Template strings | `cn()` from utils | Handles undefined/false values cleanly |

**Key insight:** This phase is primarily about wiring existing data into existing UI patterns. Almost everything needed already exists as a pattern somewhere in the codebase.

## Common Pitfalls

### Pitfall 1: Missing meeting_id for Document Viewer URL
**What goes wrong:** The `DocumentSections` component currently does not receive the `meeting_id`, which is needed to construct the document viewer URL (`/meetings/:id/documents/:docId`).
**Why it happens:** `DocumentSections` was built as a presentation component that only renders section content. It had no need for navigation context.
**How to avoid:** Thread `meetingId` as a new prop through `AgendaOverview` -> `AgendaItemRow` -> `DocumentSections`. The meeting ID is already available in the meeting-detail loader data.
**Warning signs:** Document links that go to `/meetings/undefined/documents/123`.

### Pitfall 2: Documents Without agenda_item_id
**What goes wrong:** Some `extracted_documents` may have `agenda_item_id = NULL` (e.g., cover pages, table of contents). These won't appear in the matter page document chips since the query filters by agenda_item_id.
**Why it happens:** The pipeline assigns agenda_item_id based on Gemini extraction, and some documents genuinely belong to the whole meeting rather than a specific item.
**How to avoid:** This is actually correct behavior for both features. For agenda items, `linkedExtractedDocs` already filters by `ed.agenda_item_id === item.id`. For the matter page, documents without an agenda_item_id are meeting-level documents, not matter-specific. No action needed, but verify this assumption during implementation.

### Pitfall 3: Matter Page Loader Waterfall
**What goes wrong:** Fetching documents after the matter data creates a sequential waterfall: first fetch matter, then extract agenda item IDs, then fetch documents.
**Why it happens:** Document query depends on knowing the agenda item IDs, which come from the matter response.
**How to avoid:** This is unavoidable given the data model (documents link to agenda items, not matters). But the second query is a single batch `.in()` which is fast. Alternatively, you could add a `getMatterWithDocuments` function that runs both queries and handles the dependency internally.

### Pitfall 4: Over-Fetching Document Data for Matter Page
**What goes wrong:** Fetching `summary`, `key_facts`, `section_text` for matter page document chips when only `id`, `title`, `document_type`, and `page_start` are needed.
**Why it happens:** Reusing the same query/types from meeting-detail which fetches full document data.
**How to avoid:** Use a slim select for the matter page query: `id, document_id, agenda_item_id, title, document_type, page_start, page_end`. The `document_id` is needed to resolve `meeting_id` for the viewer URL (through `documents.meeting_id`), OR you can get `meeting_id` from the agenda item's `meeting_id` field which is already loaded.

### Pitfall 5: Constructing Document Viewer URL on Matter Page
**What goes wrong:** The document viewer URL requires `meeting_id`, but `extracted_documents` doesn't have a direct `meeting_id` column.
**Why it happens:** The relationship is `extracted_documents.document_id -> documents.meeting_id`, which is one join away.
**How to avoid:** On the matter page, each timeline entry already has `item.meeting_id` from the agenda item. Since documents are grouped by agenda item, use `item.meeting_id` directly instead of joining through `documents`. This is simpler and already available in the data.

## Code Examples

Verified patterns from the existing codebase:

### Getting Agenda Item's Documents (Already Works)
```tsx
// Source: AgendaOverview.tsx lines 249-254
const linkedSections = (documentSections || []).filter(
  (s) => s.agenda_item_id === item.id,
);
const linkedExtractedDocs = (extractedDocuments || []).filter(
  (ed) => ed.agenda_item_id === item.id,
);
```

### Existing Metadata Chip Pattern
```tsx
// Source: AgendaOverview.tsx lines 395-404
// This is the exact pattern to replicate for the doc count chip
{motionCount > 0 && (
  <span className="flex items-center text-[11px] font-semibold text-amber-700">
    <Gavel className="w-3 h-3 mr-0.5" />
    {motionCount} {motionCount === 1 ? "motion" : "motions"}
  </span>
)}
```

### Existing Document Type Badge Pattern
```tsx
// Source: DocumentSections.tsx lines 96-101
<span
  className={cn(
    "inline-block px-1.5 py-0.5 text-[8px] font-bold uppercase rounded border shrink-0 mt-0.5",
    getDocumentTypeColor(ed.document_type),
  )}
>
  {getDocumentTypeLabel(ed.document_type).slice(0, 6)}
</span>
```

### Batch Query Pattern (From meetings.ts)
```tsx
// Source: meetings.ts lines 327-355
// getExtractedDocumentsForMeeting uses .in() on document IDs
const { data, error } = await supabase
  .from("extracted_documents")
  .select("id, document_id, agenda_item_id, title, document_type, page_start, page_end, ...")
  .in("document_id", docIds)
  .order("document_id", { ascending: true })
  .order("page_start", { ascending: true, nullsFirst: false });
```

### Matter Timeline Entry Pattern
```tsx
// Source: matter-detail.tsx lines 318-369
// Each timeline entry has item.meeting_id, item.id, item.title, etc.
// Documents should be inserted after debate_summary and before motions
{item.debate_summary && (
  <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 mb-4 ...">
    "{item.debate_summary}"
  </div>
)}
// INSERT DOCUMENT CHIPS HERE
{item.motions && item.motions.length > 0 && (
  <div className="space-y-4 mt-6 border-t border-zinc-100 pt-6">
    ...
  </div>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat document sections only | Grouped by extracted_document with accordion | Phase 7.1 | Each document group now has a clear identity (title, type badge) making "View full document" link natural |

**Deprecated/outdated:** None relevant to this phase.

## Open Questions

1. **Supabase `.in()` clause length limit for matter documents**
   - What we know: PostgREST/Supabase `.in()` passes values as a URL query parameter. Extremely large lists could hit URL length limits.
   - What's unclear: The maximum practical number of agenda item IDs for a single matter.
   - Recommendation: Most matters have < 50 agenda items across all meetings. The `.in()` approach is safe. If a matter somehow has hundreds of items, paginate. Not a blocker.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/web && pnpm test -- --run` |
| Full suite command | `cd apps/web && pnpm test -- --run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCL-01 | Document count chip appears in metadata when docs exist | unit (service mock) | `cd apps/web && pnpm test -- --run tests/services/meetings.test.ts` | Wave 0 (extend existing) |
| DOCL-01 | "View full document" link constructs correct URL | unit (component logic) | `cd apps/web && pnpm test -- --run tests/components/DocumentSections.test.ts` | Wave 0 |
| DOCL-02 | `getDocumentsForAgendaItems` returns correct docs for batch of IDs | unit (service mock) | `cd apps/web && pnpm test -- --run tests/services/matters.test.ts` | Wave 0 |
| DOCL-02 | Matter page renders document chips per timeline entry | manual-only | Visual inspection | N/A (React component rendering with complex state -- Vitest alone cannot render without additional setup) |

### Sampling Rate
- **Per task commit:** `cd apps/web && pnpm test -- --run`
- **Per wave merge:** `cd apps/web && pnpm test -- --run`
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps
- [ ] `tests/services/matters.test.ts` -- test `getDocumentsForAgendaItems` service function (covers DOCL-02)
- [ ] `tests/components/DocumentSections.test.ts` -- test URL construction logic if extracted as utility (covers DOCL-01)

Note: The existing `tests/services/meetings.test.ts` pattern provides the exact mock approach needed for new service tests. The `createMockQueryBuilder` and `createMockSupabase` helpers can be extracted to a shared test utility or duplicated.

## Sources

### Primary (HIGH confidence)
- Codebase analysis of `apps/web/app/components/meeting/DocumentSections.tsx` -- current document rendering pattern
- Codebase analysis of `apps/web/app/components/meeting/AgendaOverview.tsx` -- metadata chip pattern, document section integration
- Codebase analysis of `apps/web/app/services/meetings.ts` -- batch query patterns for documents
- Codebase analysis of `apps/web/app/services/matters.ts` -- `getMatterById` current select string
- Codebase analysis of `apps/web/app/routes/matter-detail.tsx` -- timeline rendering pattern
- Codebase analysis of `apps/web/app/routes/document-viewer.tsx` -- URL params confirm route pattern
- Codebase analysis of `apps/web/app/routes/routes.ts` -- confirms `meetings/:id/documents/:docId` route
- Database schema from `supabase/migrations/add_extracted_documents_and_images.sql` -- confirms `extracted_documents.agenda_item_id` FK

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` -- project decision: "Matter documents use batch `.in()` query, not per-item loops"

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing patterns
- Architecture: HIGH -- direct codebase analysis of all affected files, clear integration points
- Pitfalls: HIGH -- identified from actual code structure and data model relationships

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (stable -- no external library dependencies)
