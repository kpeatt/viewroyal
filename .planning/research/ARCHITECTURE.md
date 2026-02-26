# Architecture Patterns: v1.5 Document Experience

**Domain:** Document viewer improvements, document-to-motion/matter linking, meeting provenance indicators
**Researched:** 2026-02-26

---

## 1. Current Architecture Summary

### Existing Data Model (Document-Related Tables)

```
meetings
  |-- has_agenda, has_minutes, has_transcript (boolean flags)
  |-- agenda_url, minutes_url, video_url (source links)
  |-- updated_at (timestamp)
  |
  |-- documents (source PDFs)
  |     |-- meeting_id FK
  |     |-- title, category, source_url, file_path, page_count
  |     |
  |     |-- extracted_documents (logical docs within a PDF)
  |     |     |-- document_id FK, agenda_item_id FK
  |     |     |-- title, document_type, page_start, page_end
  |     |     |-- summary, key_facts (jsonb)
  |     |     |
  |     |     |-- document_images
  |     |     |     |-- extracted_document_id FK
  |     |     |     |-- r2_key, page, description, dimensions
  |     |     |
  |     |     |-- document_sections (content chunks)
  |     |           |-- extracted_document_id FK, document_id FK
  |     |           |-- agenda_item_id FK
  |     |           |-- section_title, section_text (markdown)
  |     |           |-- section_order, page_start, page_end
  |     |           |-- embedding halfvec(384), text_search tsvector
  |
  |-- agenda_items
  |     |-- meeting_id FK, matter_id FK
  |     |-- title, category, source_file
  |     |
  |     |-- motions
  |           |-- agenda_item_id FK, meeting_id FK
  |
  |-- matters
        |-- agenda_items (via matter_id FK on agenda_items)
```

### Existing Routes and Components

| Route | File | Purpose |
|-------|------|---------|
| `/meetings/:id` | `meeting-detail.tsx` | Meeting page with tabs: overview, agenda, motions, participants |
| `/meetings/:id/documents` | `meeting-documents.tsx` | Document listing page for a meeting |
| `/meetings/:id/documents/:docId` | `document-viewer.tsx` | Individual extracted document viewer |
| `/matters/:id` | `matter-detail.tsx` | Matter detail with lifecycle timeline |

| Component | File | Purpose |
|-----------|------|---------|
| `AgendaOverview` | `meeting/AgendaOverview.tsx` | Agenda item list with expansion |
| `DocumentSections` | `meeting/DocumentSections.tsx` | Inline doc sections within agenda items |
| `MarkdownContent` | `markdown-content.tsx` | Lightweight markdown-to-HTML renderer |
| `FormattedText` | `formatted-text.tsx` | Official document styling (minutes) |
| `MeetingTabs` | `meeting/MeetingTabs.tsx` | Tab navigation on meeting detail |

### Existing Service Functions

| Function | File | What It Fetches |
|----------|------|----------------|
| `getMeetingById` | `services/meetings.ts` | Meeting + agenda items + motions + votes + transcript + attendance |
| `getDocumentSectionsForMeeting` | `services/meetings.ts` | All document_sections for a meeting's documents |
| `getExtractedDocumentsForMeeting` | `services/meetings.ts` | All extracted_documents for a meeting |
| `getMatterById` | `services/matters.ts` | Matter + agenda_items with meetings + motions + votes |

### Key Linking Paths Already in Place

1. **Document -> Agenda Item**: `extracted_documents.agenda_item_id` and `document_sections.agenda_item_id` (both FKs exist)
2. **Agenda Item -> Matter**: `agenda_items.matter_id` FK
3. **Agenda Item -> Meeting**: `agenda_items.meeting_id` FK
4. **Document -> Meeting**: `documents.meeting_id` FK
5. **Motion -> Agenda Item**: `motions.agenda_item_id` FK

**The linking chain document -> agenda_item -> matter and document -> agenda_item -> motion already exists in the database.** The v1.5 work is about surfacing these links in the UI, not creating new schema.

---

## 2. Architecture for v1.5 Features

### Feature 1: Document Viewer Improvements

**Current state:** `document-viewer.tsx` renders sections with `MarkdownContent`, which uses Tailwind's `prose` utility classes. Tables and headings work but lack polish.

**Architecture approach:** Enhance `MarkdownContent` component -- no new components needed.

```
document-viewer.tsx
  |-- MarkdownContent (enhanced prose classes, responsive table wrapper)
  |-- [existing] breadcrumb, header, summary, key facts, gallery
```

**What changes:**

| Change | Where | Type |
|--------|-------|------|
| Table responsiveness | `MarkdownContent` | Wrap tables in `overflow-x-auto` container |
| Typography polish | `MarkdownContent` | Refine prose heading scales, spacing, font-weight |
| Title deduplication | `document-viewer.tsx` | Compare `extractedDoc.title` with first section title, skip if duplicate |
| Responsive tables | `MarkdownContent` | Add `prose-table:w-full` and horizontal scroll wrapper via CSS or post-processing |

**Why modify `MarkdownContent` not create a new component:** `MarkdownContent` is used in both `document-viewer.tsx` and `DocumentSections.tsx` (inline agenda item docs). Improvements to the shared component benefit both contexts. The current component uses `marked` for SSR-safe synchronous rendering -- this approach should be preserved.

**Title deduplication strategy:** The pipeline sometimes extracts the document title as the first section's `section_title`. The viewer should compare `extractedDoc.title` against `sections[0].section_title` and skip rendering the section title if they match (case-insensitive, trimmed). This is a presentation-layer fix, not a data fix.

### Feature 2: Document Section Links on Meeting Detail (Per Agenda Item)

**Current state:** `AgendaOverview` already filters `documentSections` and `extractedDocuments` by `agenda_item_id` and renders them via `DocumentSections` component inside the expanded agenda item. Documents are shown as expandable accordions with content inline.

**What needs to change:** Add links from the inline document sections to the full document viewer. Currently, `DocumentSections` shows the content inline but does not link to `/meetings/:id/documents/:docId`.

```
AgendaOverview
  |-- AgendaItemRow (expanded)
        |-- DocumentSections (already rendered)
              |-- GroupedDocumentSections
                    |-- [NEW] "View Full Document" link per extracted doc
                    |-- [existing] section title, summary, content accordion
```

**Architecture approach:** Add a `meetingId` prop to `DocumentSections` and render a `Link` to `/meetings/${meetingId}/documents/${ed.id}` in each extracted document header row. This is a small prop-threading change.

| Change | Where | Type |
|--------|-------|------|
| Add `meetingId` prop | `DocumentSections` interface | Prop addition |
| Render Link to viewer | `GroupedDocumentSections` | Add Link element per extracted doc |
| Thread prop from parent | `AgendaOverview` -> `AgendaItemRow` -> `DocumentSections` | Prop threading |
| Pass `meetingId` from loader | `meeting-detail.tsx` | Already available as `meeting.id` |

**Data flow (unchanged):** The meeting-detail loader already fetches `documentSections` and `extractedDocuments` in parallel via `getDocumentSectionsForMeeting` and `getExtractedDocumentsForMeeting`. No new queries needed.

### Feature 3: All Related Documents on Matter Pages

**Current state:** `matter-detail.tsx` shows a lifecycle timeline of agenda items per meeting. It does NOT show documents at all. The `getMatterById` service fetches `agenda_items` with `meetings` and `motions` but not documents.

**Architecture approach:** Fetch documents related to a matter's agenda items and render them in the timeline.

```
matter-detail.tsx (loader)
  |-- getMatterById (existing)
  |-- [NEW] getDocumentsForMatter (new service function)
  |
matter-detail.tsx (component)
  |-- Timeline
        |-- TimelineItem (existing agenda item card)
              |-- [NEW] DocumentLinks section per agenda item
```

**New service function:**

```typescript
// services/matters.ts (or services/documents.ts)
export async function getDocumentsForMatter(
  supabase: SupabaseClient,
  matterId: string
): Promise<Map<number, ExtractedDocument[]>> {
  // Step 1: Get agenda_item_ids for this matter
  const { data: items } = await supabase
    .from("agenda_items")
    .select("id")
    .eq("matter_id", matterId);

  if (!items || items.length === 0) return new Map();

  const itemIds = items.map(i => i.id);

  // Step 2: Get extracted_documents linked to those agenda items
  const { data: docs } = await supabase
    .from("extracted_documents")
    .select("id, document_id, agenda_item_id, title, document_type, page_start, page_end, summary, key_facts, created_at")
    .in("agenda_item_id", itemIds)
    .order("created_at", { ascending: true });

  // Step 3: Group by agenda_item_id
  const grouped = new Map<number, ExtractedDocument[]>();
  for (const doc of docs || []) {
    const existing = grouped.get(doc.agenda_item_id!) || [];
    existing.push(doc as ExtractedDocument);
    grouped.set(doc.agenda_item_id!, existing);
  }
  return grouped;
}
```

**Why a separate function, not modifying `getMatterById`:** The existing query is already complex (nested joins for agenda_items -> meetings -> organizations, motions -> votes -> people). Adding document joins would make it unwieldy. A parallel fetch is cleaner and keeps the loader fast.

**Component change:** In each timeline item in `matter-detail.tsx`, render document links when they exist. This needs the meeting_id to construct the viewer URL. The meeting_id is already available from `item.meeting_id` in the timeline data.

| Change | Where | Type |
|--------|-------|------|
| `getDocumentsForMatter` | `services/matters.ts` | New function |
| Loader parallel fetch | `matter-detail.tsx` loader | Add to Promise.all |
| Document links in timeline | `matter-detail.tsx` component | New section in timeline card |

### Feature 4: Meeting Provenance Indicators

**Current state:** The meeting detail page shows `has_agenda`, `has_minutes`, `has_transcript` booleans, `agenda_url`, `minutes_url`, `video_url` links, and `updated_at` timestamp. However, these are not surfaced as explicit provenance indicators -- they are scattered across the header and tab navigation.

**Architecture approach:** Create a new `MeetingProvenance` component that shows data source badges with links.

```
meeting-detail.tsx
  |-- header section
        |-- [NEW] MeetingProvenance component
              |-- Agenda badge (links to agenda_url if present)
              |-- Minutes badge (links to minutes_url if present)
              |-- Video badge (links to video_url if present)
              |-- "Last updated" timestamp
```

**Data required (already loaded):** The `meeting` object from `getMeetingById` already contains `has_agenda`, `has_minutes`, `has_transcript`, `agenda_url`, `minutes_url`, `video_url`, and `updated_at`.

No new queries needed. This is a pure presentation component.

| Change | Where | Type |
|--------|-------|------|
| `MeetingProvenance` | New: `components/meeting/MeetingProvenance.tsx` | New component |
| Render in header | `meeting-detail.tsx` | Add below existing header |

**Badge design:**

```
[Agenda icon] Agenda    [Minutes icon] Minutes    [Video icon] Video
 green if has_agenda     green if has_minutes      green if has_transcript
 links to agenda_url     links to minutes_url      links to video_url
 gray if not present     gray if not present       gray if not present

Last updated: Feb 24, 2026
```

---

## 3. Component Boundaries

### New Components

| Component | File | Responsibility | Props |
|-----------|------|---------------|-------|
| `MeetingProvenance` | `components/meeting/MeetingProvenance.tsx` | Source indicator badges | `meeting: Meeting` |

### Modified Components

| Component | File | Change |
|-----------|------|--------|
| `MarkdownContent` | `components/markdown-content.tsx` | Enhanced prose classes, table responsiveness |
| `DocumentSections` | `components/meeting/DocumentSections.tsx` | Add `meetingId` prop, render viewer links |
| `AgendaOverview` | `components/meeting/AgendaOverview.tsx` | Thread `meetingId` to DocumentSections |

### Modified Routes

| Route | File | Change |
|-------|------|--------|
| `document-viewer.tsx` | `routes/document-viewer.tsx` | Title deduplication logic |
| `meeting-detail.tsx` | `routes/meeting-detail.tsx` | Add MeetingProvenance component |
| `matter-detail.tsx` | `routes/matter-detail.tsx` | Fetch documents, render in timeline |

### Modified Services

| Function | File | Change |
|----------|------|--------|
| `getDocumentsForMatter` | `services/matters.ts` | New function |

### Unchanged

| Component/File | Why Unchanged |
|----------------|--------------|
| `meeting-documents.tsx` | Document listing page is unaffected |
| `services/meetings.ts` | All needed queries already exist |
| `MeetingTabs` | Tab structure unchanged |
| `FormattedText` | Minutes renderer, separate from document viewer |
| Database schema | All FKs already in place |

---

## 4. Data Flow

### Meeting Detail Page (Existing + Changes)

```
Loader:
  Promise.all([
    getMeetingById(supabase, id),              // unchanged
    getDocumentSectionsForMeeting(supabase, id), // unchanged
    getExtractedDocumentsForMeeting(supabase, id) // unchanged
  ])

Component:
  <header>
    [existing title, date, organization]
    <MeetingProvenance meeting={meeting} />       // NEW
  </header>
  <MeetingTabs />                                  // unchanged
  <AgendaOverview
    items={agendaItems}
    documentSections={documentSections}
    extractedDocuments={extractedDocuments}
    meetingId={meeting.id}                         // NEW prop
    ...
  />
    |-- AgendaItemRow (expanded)
          |-- DocumentSections
                meetingId={meetingId}               // NEW prop
                |-- Link to /meetings/{id}/documents/{docId}  // NEW
```

### Matter Detail Page (Existing + Changes)

```
Loader:
  Promise.all([
    getMatterById(supabase, id),                   // unchanged
    getDocumentsForMatter(supabase, id)            // NEW
  ])

Component:
  <Timeline>
    {timeline.map(item => (
      <TimelineItem>
        [existing: title, summary, debate_summary, motions]
        {documentsForItem && documentsForItem.length > 0 && (
          <DocumentLinks                             // NEW section
            documents={documentsForItem}
            meetingId={item.meeting_id}
          />
        )}
      </TimelineItem>
    ))}
  </Timeline>
```

### Document Viewer (Existing + Changes)

```
Loader: unchanged

Component:
  <header>
    [existing breadcrumb, title, metadata]
  </header>
  <sections>
    {sections.map((section, idx) => {
      // NEW: skip first section title if it matches document title
      const skipTitle = idx === 0 &&
        section.section_title?.trim().toLowerCase() ===
        extractedDoc.title.trim().toLowerCase();

      return (
        <div>
          {section.section_title && !skipTitle && (
            <h2>{section.section_title}</h2>
          )}
          <MarkdownContent content={content} />    // enhanced styling
        </div>
      );
    })}
  </sections>
```

---

## 5. Patterns to Follow

### Pattern 1: Parallel Loader Fetches with Promise.all

**What:** All independent Supabase queries run in parallel in the route loader.
**When:** Always -- this is the existing pattern throughout the codebase.
**Why:** SSR response time is bounded by the slowest query, not the sum.

The matter-detail page should add `getDocumentsForMatter` to its existing `Promise.all` rather than making it sequential.

### Pattern 2: Prop Threading for Meeting Context

**What:** Pass `meetingId` down through component hierarchy rather than using context or fetching again.
**When:** Components need to construct URLs like `/meetings/:id/documents/:docId`.
**Why:** Explicit props are the established pattern. No React context providers exist in the codebase. The component tree is shallow (3 levels max).

```
meeting-detail -> AgendaOverview -> AgendaItemRow -> DocumentSections
                  meetingId={meeting.id}             meetingId={meetingId}
```

### Pattern 3: Service Function Per Query, Not Per Page

**What:** Create reusable service functions (like `getDocumentsForMatter`) that multiple pages can share.
**When:** The same data might be needed on different pages.
**Why:** Follows existing pattern -- `getExtractedDocumentsForMeeting` is used by both `meeting-detail.tsx` and `meeting-documents.tsx`.

### Pattern 4: Presentation-Layer Fixes Over Schema Changes

**What:** Fix display issues (title deduplication, spacing) in components, not by changing database content.
**When:** The data is technically correct but displays awkwardly.
**Why:** Avoids pipeline re-runs and data migrations. The pipeline ingests hundreds of meetings -- changing extraction logic requires expensive reprocessing. A component-level check (`if title matches, skip`) is instant and reversible.

### Pattern 5: Component Composition Over Configuration

**What:** Build provenance indicators as a focused component (`MeetingProvenance`) rather than adding flags to `MeetingTabs`.
**When:** New UI elements that represent a distinct concern.
**Why:** `MeetingTabs` handles tab navigation. Provenance is informational display. Mixing them would violate single responsibility. A new component can be independently tested and repositioned.

---

## 6. Anti-Patterns to Avoid

### Anti-Pattern 1: Fetching Documents Inside Components

**What:** Using `useEffect` or client-side fetches to load documents after page render.
**Why bad:** The entire app uses SSR via React Router 7 loaders. Client-side fetching creates layout shift, loses SSR benefits, and adds network waterfalls.
**Instead:** Fetch everything in the route loader using `Promise.all`.

### Anti-Pattern 2: Creating a documents.ts Service for Matter Documents

**What:** Creating a new `services/documents.ts` file for the matter documents query.
**Why bad:** The function needs matter context (fetching agenda_item_ids by matter_id). Splitting across files obscures the domain relationship.
**Instead:** Add `getDocumentsForMatter` to `services/matters.ts` where matter-related queries belong.

### Anti-Pattern 3: Modifying the MarkdownContent Component Per-Context

**What:** Creating `DocumentMarkdownContent` and `InlineMarkdownContent` variants.
**Why bad:** The styling differences between document-viewer and agenda-item contexts are minor (font size, spacing). Variants create maintenance burden.
**Instead:** Use the `className` prop on `MarkdownContent` for context-specific overrides. The component already accepts a `className` prop.

### Anti-Pattern 4: Joining Documents in getMatterById

**What:** Adding document joins to the already-complex `getMatterById` Supabase query.
**Why bad:** The query already has 3 levels of nesting (matter -> agenda_items -> meetings -> organizations, agenda_items -> motions -> votes -> people). Supabase client has a default 1000-row limit on nested selects. Adding documents would risk hitting limits and would make the query harder to debug.
**Instead:** Separate parallel fetch via `getDocumentsForMatter`.

### Anti-Pattern 5: Adding Updated_at to the Meetings Query

**What:** Modifying `getMeetingById` to add `updated_at` to the select string for provenance.
**Why unnecessary:** The meeting object from `getMeetingById` already includes the full meeting row via `select("id, ... meta, created_at, ...")`. Check if `updated_at` is already included. If not, it is a one-field addition to the select string, not a structural change.

---

## 7. Integration Points Summary

### Database Tables Touched (Read-Only)

| Table | How Used | By |
|-------|----------|-----|
| `meetings` | Existing: provenance flags + URLs | MeetingProvenance component |
| `documents` | Existing: already fetched for meeting docs pages | No change needed |
| `extracted_documents` | Existing + new query by agenda_item_id | getDocumentsForMatter |
| `document_sections` | Existing: already rendered in AgendaOverview | MarkdownContent enhancement |
| `agenda_items` | Existing: IDs used to look up documents for matter | getDocumentsForMatter |

**No schema migrations required.** All FKs and indexes already exist.

### Supabase Queries

| Query | New/Existing | Notes |
|-------|-------------|-------|
| `getMeetingById` | Existing | May need `updated_at` in select if missing |
| `getDocumentSectionsForMeeting` | Existing | No change |
| `getExtractedDocumentsForMeeting` | Existing | No change |
| `getMatterById` | Existing | No change |
| `getDocumentsForMatter` | **NEW** | 2 queries: agenda_item IDs + extracted_documents by those IDs |

### New/Modified Files Inventory

```
NEW:
  components/meeting/MeetingProvenance.tsx

MODIFIED:
  components/markdown-content.tsx         (prose classes, table wrapper)
  components/meeting/DocumentSections.tsx  (meetingId prop, viewer links)
  components/meeting/AgendaOverview.tsx    (thread meetingId prop)
  routes/document-viewer.tsx              (title dedup logic)
  routes/meeting-detail.tsx               (add MeetingProvenance)
  routes/matter-detail.tsx                (fetch + render documents)
  services/matters.ts                     (getDocumentsForMatter)
```

---

## 8. Build Order Considering Dependencies

The features have clear dependency ordering:

### Phase 1: Document Viewer Polish (Independent)

No dependencies on other features. Can be built first because:
- `MarkdownContent` is a shared component used by both the viewer and inline sections
- Title deduplication is viewer-only logic
- Changes here benefit all downstream document rendering

### Phase 2: Document Links on Agenda Items (Depends on Phase 1)

Requires enhanced `MarkdownContent` to be in place, but the link functionality itself is independent. Could technically be built in parallel with Phase 1, but building after means the linked-to viewer already looks polished.

### Phase 3: Meeting Provenance Indicators (Independent)

Entirely independent of Phase 1 and 2. Pure new component, no shared dependencies. Could be built in any position.

### Phase 4: Matter Page Documents (Depends on Phase 2 conceptually)

Requires `getDocumentsForMatter` service function (new). The document links rendered in the matter timeline use the same URL pattern as Phase 2 (`/meetings/:id/documents/:docId`). Building after Phase 2 ensures the viewer target is already enhanced with links.

**Recommended order: 1 -> 2 -> 3 -> 4** (or 1 -> [2, 3 parallel] -> 4)

---

## 9. Scalability Considerations

| Concern | Current Scale (180 meetings) | At 500 Meetings | At 2000+ Meetings |
|---------|-------------------------------|-----------------|-------------------|
| Matter documents query | < 10 agenda items per matter | Up to 30 items; 2 simple indexed queries | Consider RPC or materialized view |
| MarkdownContent rendering | <50 sections per document | Same | No concern -- sections are chunked |
| Provenance component | Trivial -- reads from already-loaded meeting | Same | Same |
| Document viewer | <30 sections, <20 images | Same | Consider lazy-loading images |

At current and projected scale, all proposed architecture is well within performance bounds.

---

## Sources

- Codebase analysis of existing routes, services, components, and schema (HIGH confidence -- direct code reading)
- Database schema from `sql/bootstrap.sql` and `supabase/migrations/` (HIGH confidence)
- Existing data model relationships verified from migration files (HIGH confidence)

### Confidence Levels

| Finding | Confidence | Source |
|---------|------------|--------|
| All FKs already exist for document linking | HIGH | Migration files + bootstrap.sql |
| No schema changes needed | HIGH | Direct column/FK verification |
| MeetingProvenance uses already-loaded data | HIGH | getMeetingById select string analysis |
| getDocumentsForMatter needs 2 queries | HIGH | Supabase client .in() requires IDs first |
| MarkdownContent className prop exists | HIGH | Component source code |
| Title deduplication is presentation-only fix | MEDIUM | Based on observed pipeline behavior |
| Matter documents query performance sufficient | MEDIUM | Assumes < 100 agenda items per matter |
