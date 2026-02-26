# Technology Stack: v1.5 Document Experience

**Project:** ViewRoyal.ai v1.5 -- Document Viewer Improvements, Provenance Indicators, Document Linking
**Researched:** 2026-02-26
**Scope:** Stack changes/additions for polished document typography, responsive table rendering, meeting provenance indicators, and document-to-motion/matter linking UI.
**Out of scope:** Existing validated stack (React Router 7 SSR, Tailwind CSS 4, shadcn/ui + Radix UI, Supabase PostgreSQL with pgvector, `marked` v17, `@tailwindcss/typography` v0.5.19, `lucide-react`, Cloudflare Workers) -- all unchanged.

---

## Executive Finding: No New Dependencies Needed

This milestone requires **zero new npm packages**. Every feature can be built with existing dependencies. The work is CSS/component-level, not library-level.

**Confidence:** HIGH -- verified by auditing existing `package.json`, the document viewer route, the `MarkdownContent` component, and every feature requirement against current capabilities.

---

## Existing Stack Relevant to This Milestone

### Already Installed and Sufficient

| Technology | Version | Role in v1.5 | Status |
|------------|---------|--------------|--------|
| `@tailwindcss/typography` | ^0.5.19 | Prose styling for document sections | Already loaded via `@plugin` in `app.css`. Provides all `prose-*` modifiers needed for typography polish. |
| `marked` | ^17.0.3 | Markdown-to-HTML for document sections | Already used in `MarkdownContent` component. Supports GFM tables, custom renderers via `marked.use()`. |
| `tailwindcss` | ^4.1.13 | Utility classes for responsive layouts, overflow handling | Already the CSS engine. Tailwind 4 CSS variables and responsive utilities cover all layout needs. |
| `lucide-react` | ^0.562.0 | Icons for provenance indicators (FileText, Video, BookOpen, Clock, Link2, etc.) | Already installed. Has every icon needed for Agenda/Minutes/Video provenance badges. |
| `@radix-ui/react-tabs` | ^1.1.13 | Tab interfaces (already used in meeting detail) | Already installed. |
| `class-variance-authority` | ^0.7.1 | Variant-based styling for provenance badges | Already installed via shadcn/ui. |
| `clsx` + `tailwind-merge` | ^2.1.1 / ^3.4.0 | Class composition (existing `cn()` utility) | Already installed. |

### Key Integration Points

**`MarkdownContent` component** (`app/components/markdown-content.tsx`):
- Currently uses `marked.parse()` with GFM enabled and Tailwind's `prose` classes
- Already has table styling: `prose-table:text-xs`, `prose-th:bg-zinc-50`, `prose-td:p-2`
- Improvement needed: responsive table overflow wrapper and tighter spacing

**`document-viewer.tsx` route**:
- Full document rendering with sections, inline images, breadcrumbs
- Currently uses `MarkdownContent` for each section
- Improvement needed: typography spacing refinement, title deduplication, responsive tables

**`AgendaOverview.tsx` / `DocumentSections.tsx`**:
- Already renders document sections per agenda item with accordion expansion
- Already groups by `extracted_document_id`
- Improvement needed: link to full document viewer, provenance indicators

**`meeting-detail.tsx` route**:
- Already loads `extractedDocuments` and `documentSections` in the loader
- Already shows document count in overview tab
- Improvement needed: provenance indicator row (Agenda/Minutes/Video badges with source links)

**`matter-detail.tsx` route**:
- Timeline of agenda items across meetings
- Improvement needed: show linked documents per timeline entry, cross-meeting document aggregation

---

## Feature-Specific Stack Guidance

### 1. Polished Document Typography and Spacing

**Approach:** Tailwind `prose-*` modifier classes + CSS custom properties. No new libraries.

The existing `MarkdownContent` component already applies `prose prose-zinc prose-sm` with detailed modifier overrides. The refinement is purely CSS-level:

```typescript
// Enhanced prose classes for MarkdownContent (example of the approach)
"prose prose-zinc prose-sm max-w-none",
// Tighter vertical rhythm for official documents
"prose-p:my-2 prose-p:leading-[1.7]",
// Better heading hierarchy
"prose-h2:text-lg prose-h2:mt-8 prose-h2:mb-3 prose-h2:border-b prose-h2:border-zinc-100 prose-h2:pb-2",
"prose-h3:text-base prose-h3:mt-6 prose-h3:mb-2",
// Lists that feel like official documents
"prose-li:my-1 prose-ol:list-decimal",
// Better blockquote for quoted text/resolutions
"prose-blockquote:border-l-3 prose-blockquote:border-indigo-200 prose-blockquote:bg-indigo-50/30 prose-blockquote:py-1 prose-blockquote:px-4",
```

**Why no CSS-in-JS or typography library:** The `@tailwindcss/typography` plugin combined with Tailwind 4's prose modifiers gives complete control over every HTML element's spacing, fonts, and colors. Council documents are markdown-rendered HTML -- the prose plugin was built for exactly this use case.

**Title deduplication:** The document viewer currently renders `ed.title` in the header AND potentially as the first `section.section_title`. This is a logic fix, not a library need -- skip the first section title if it matches or is contained in `ed.title`.

**Confidence:** HIGH -- all prose modifiers verified in existing codebase and Tailwind docs.

### 2. Responsive Table Rendering

**Approach:** Custom `marked` renderer wrapping `<table>` in a scrollable `<div>`. No new libraries.

The `marked` library (already v17.0.3) supports custom renderers via `marked.use({ renderer: { table(token) {} } })`. The fix is to wrap the default table HTML in a horizontal-scroll container:

```typescript
// In MarkdownContent or a shared marked configuration
marked.use({
  renderer: {
    table(token) {
      // Call the default renderer, then wrap in overflow container
      const html = this.parser.parse(token.tokens);
      return `<div class="overflow-x-auto -mx-2 px-2"><table>${html}</table></div>`;
    }
  }
});
```

Combined with these prose classes already partially in place:

```
"prose-table:text-xs prose-table:my-3 prose-table:w-full"
"prose-th:bg-zinc-50 prose-th:p-2 prose-th:text-left prose-th:font-semibold prose-th:whitespace-nowrap"
"prose-td:p-2 prose-td:border-t prose-td:border-zinc-100 prose-td:align-top"
```

**Why not a dedicated table component library:** The tables are markdown-rendered GFM tables from PDF extractions. They vary wildly in column count and content. A responsive wrapper with horizontal scroll is the only approach that works universally. Libraries like `@tanstack/react-table` are for interactive data tables with sorting/filtering -- overkill and wrong abstraction for read-only document tables.

**Alternative considered:** `remark-gfm` is already a dependency (used in `react-markdown` on other pages), but the document viewer uses `marked` (not `react-markdown`) for SSR hydration stability. Staying with `marked` custom renderer is correct.

**Confidence:** HIGH -- `marked.use()` renderer API verified in marked.js docs. This is a ~10-line change.

### 3. Meeting Provenance Indicators

**Approach:** Pure React component using existing lucide-react icons and Tailwind classes. No new libraries.

Provenance indicators show what source materials exist for a meeting: Agenda document, Minutes document, Video recording, and Transcript. The data already exists in the `meetings` table:

| Column | Provenance Signal |
|--------|-------------------|
| `has_agenda` | Agenda available |
| `has_minutes` | Minutes available |
| `has_transcript` | Transcript available |
| `video_url` | Video available |
| `agenda_url` | Direct link to agenda PDF |
| `minutes_url` | Direct link to minutes PDF |

This is a presentational component -- a row of icon+label badges with links:

```tsx
// Conceptual -- badges using existing cn(), lucide icons, Tailwind
<div className="flex flex-wrap gap-2">
  {meeting.has_agenda && (
    <a href={meeting.agenda_url} className="inline-flex items-center gap-1.5 ...">
      <FileText className="w-3.5 h-3.5" /> Agenda
    </a>
  )}
  {meeting.has_minutes && (
    <a href={meeting.minutes_url} className="inline-flex items-center gap-1.5 ...">
      <BookOpen className="w-3.5 h-3.5" /> Minutes
    </a>
  )}
  {meeting.video_url && (
    <span className="inline-flex items-center gap-1.5 ...">
      <Video className="w-3.5 h-3.5" /> Video
    </span>
  )}
</div>
```

**Why not a badge/tag component library:** shadcn/ui `Badge` is already installed and used extensively throughout the app (see `AgendaOverview`, `matter-detail`). The `Badge` component with `variant` and `className` overrides provides all the styling flexibility needed. Or raw Tailwind classes for tighter control -- both approaches are already established patterns in the codebase.

**Last-updated timestamp:** The `meetings.created_at` or a future `updated_at` column provides this. If `updated_at` doesn't exist, it's a DB migration, not a library need.

**Confidence:** HIGH -- all data fields verified in existing loader queries and `meetings` table select strings.

### 4. Document Section Links from Meetings and Matters

**Approach:** Extend existing `DocumentSections` component and add links in `matter-detail.tsx`. No new libraries.

**Meeting detail page (agenda items):**
The `DocumentSections` component already renders linked document sections per agenda item. The improvement is adding a "View full document" link to the document viewer:

```tsx
// Inside GroupedDocumentSections, add link to each extracted document
<Link to={`/meetings/${meetingId}/documents/${ed.id}`} className="...">
  View full document
</Link>
```

This requires passing `meetingId` as a prop -- a minor interface change, not a library addition.

**Matter detail page (cross-meeting documents):**
The matter detail loader (`getMatterById`) currently fetches agenda items with meetings. To show documents across meetings, the loader needs to also fetch extracted documents linked to those agenda items. This is a Supabase query addition:

```typescript
// Fetch extracted documents for all agenda items in this matter
const agendaItemIds = matter.agenda_items.map(ai => ai.id);
const { data: docs } = await supabase
  .from("extracted_documents")
  .select("id, document_id, agenda_item_id, title, document_type, summary")
  .in("agenda_item_id", agendaItemIds);
```

This is a data-fetching change. The UI rendering uses the same `getDocumentTypeLabel()`, `getDocumentTypeColor()` utilities and `Link` components already in use throughout the codebase.

**Confidence:** HIGH -- existing `extracted_documents` table has `agenda_item_id` FK. Existing `document-types.ts` utilities cover all display needs.

---

## What NOT to Add

| Technology | Why Tempting | Why Wrong |
|------------|-------------|-----------|
| `@tailwindcss/container-queries` | Responsive tables based on container width | Overkill. `overflow-x-auto` on a wrapper div handles table overflow. Container queries are for complex layout shifts, not scrollable tables. |
| `@tanstack/react-table` | "Proper" table component | Wrong abstraction. Document tables are read-only rendered markdown, not interactive data grids. Adding a React table library for static content adds bundle size with zero benefit. |
| `react-markdown` (for document viewer) | "Better" markdown rendering | Already evaluated and rejected. The document viewer uses `marked` because `react-markdown` causes SSR/hydration mismatches on Cloudflare Workers. `marked` produces static HTML synchronously, which is correct for SSR. `react-markdown` is already used elsewhere in the app for client-rendered content. |
| `rehype-sanitize` | Sanitize HTML in markdown | The document content comes from the app's own pipeline (Gemini extraction), not user input. Sanitization adds latency with no security benefit for trusted content. |
| `@radix-ui/react-tooltip` | Tooltips on provenance badges | Unnecessary complexity. Text labels next to icons are clearer than icon-only + tooltip. If tooltips are needed later, shadcn/ui has a Tooltip component that can be added then. |
| `framer-motion` | Animated transitions for accordion expand | The existing `grid-rows-[1fr]`/`grid-rows-[0fr]` CSS transition pattern (already used in `AgendaOverview`) works well. Adding a 50KB animation library for a single transition is wasteful. |
| `date-fns` or `dayjs` | Format "last updated" timestamps | The existing `formatDate()` utility in `lib/utils.ts` already handles date formatting using `Intl.DateTimeFormat`. No library needed. |
| Any font package | "Official document" serif font | The app uses Inter (sans-serif) throughout. The document viewer already uses `font-serif` for section headings via Tailwind's built-in serif stack. Adding a custom font like Charter or Georgia as a separate package would increase load time and break visual consistency with the rest of the app. |

---

## Database Considerations (Not Stack, But Related)

These are NOT npm dependencies but may require Supabase migrations:

| Change | Purpose | Type |
|--------|---------|------|
| `meetings.updated_at` column | "Last updated" timestamp for provenance indicators | Migration (if not already present) |
| Index on `extracted_documents.agenda_item_id` | Fast lookup for matter-detail document aggregation | Migration (performance, not correctness) |

Verify whether `updated_at` exists before planning the migration. The `created_at` column is confirmed present.

---

## Summary: Existing Stack Is Complete

| v1.5 Feature | Libraries Needed | Approach |
|--------------|------------------|----------|
| Document typography | None | Tailwind `prose-*` modifiers in `MarkdownContent` |
| Responsive tables | None | `marked.use({ renderer: { table() } })` + `overflow-x-auto` wrapper |
| Title deduplication | None | Conditional logic in `document-viewer.tsx` |
| Provenance indicators | None | React component with lucide icons + existing `Badge` or Tailwind classes |
| Document links from agenda items | None | Add `<Link>` to existing `DocumentSections` component |
| Documents on matter pages | None | Additional Supabase query in matter-detail loader |

**Total new npm packages: 0**
**Total new dev dependencies: 0**

This is a UI/UX polish milestone. The stack is mature and complete for the work required.

---

## Sources

### HIGH Confidence
- [Tailwind CSS Typography Plugin](https://github.com/tailwindlabs/tailwindcss-typography) -- prose modifiers, table styling, v0.5.x API
- [marked.js Custom Renderers](https://marked.js.org/using_pro) -- `marked.use()` with renderer overrides, table method signature
- [marked.js npm](https://www.npmjs.com/package/marked) -- v17.0.3 confirmed latest (published Feb 2026)
- Existing codebase: `apps/web/package.json`, `app/components/markdown-content.tsx`, `app/routes/document-viewer.tsx`, `app/routes/meeting-detail.tsx`, `app/routes/matter-detail.tsx`, `app/components/meeting/DocumentSections.tsx`, `app/components/meeting/AgendaOverview.tsx`

### MEDIUM Confidence
- [Tailwind responsive tables pattern](https://tailkits.com/blog/tailwind-responsive-tables/) -- `overflow-x-auto` approach confirmed as standard pattern
- [marked.js table renderer discussion](https://github.com/markedjs/marked/discussions/3409) -- community confirmation of table wrapper pattern

---
*Last updated: 2026-02-26*
