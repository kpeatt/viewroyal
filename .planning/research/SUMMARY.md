# Project Research Summary

**Project:** ViewRoyal.ai v1.5 — Document Experience (Viewer Improvements, Provenance Indicators, Document Linking)
**Domain:** Civic intelligence platform — document viewing, cross-linking, and meeting provenance
**Researched:** 2026-02-26
**Confidence:** HIGH

## Executive Summary

ViewRoyal.ai v1.5 is a UI/UX polish milestone focused on surfacing existing data more effectively, not building new infrastructure. The platform already has substantial infrastructure: an `extracted_documents` table with document types, summaries, and key facts; a `document-viewer.tsx` route rendering individual documents; a `DocumentSections` component inline on agenda items; and `meetings` table columns tracking `has_agenda`, `has_minutes`, `has_transcript`, and source URLs. The research conclusion is clear: zero new npm packages are needed, no schema migrations are required, and all four table-stakes features can be built by enhancing existing components and adding a single new service function.

The recommended approach follows a dependency-ordered sequence: start with the two independent features (document viewer typography polish and meeting provenance indicators), then add document links to agenda items, then add documents to matter pages. This ordering ensures the document viewer is polished before Phase 3 adds prominent links pointing to it. The highest-value new feature is documents on matter pages — citizens tracking a rezoning or bylaw amendment across many months currently have zero document visibility on those pages, and every comparable civic platform (Legistar, CivicPlus, Council Data Project) provides this kind of longitudinal document trail.

The primary technical risks are query-related: the matter-document query must use a batch `.in()` approach rather than per-agenda-item loops (N+1 pitfall), and the meeting-detail loader must remain lightweight by only including document metadata, not full section text. Mobile table overflow is the single highest-impact UX fix — council staff reports contain wide financial and zoning tables that currently push the viewport sideways on mobile. All other risks are well-understood with straightforward mitigations using patterns already established in the codebase.

---

## Key Findings

### Recommended Stack

No new dependencies are needed. Every v1.5 feature is achievable with the existing stack: `@tailwindcss/typography` prose modifiers for typography polish, `marked.use()` custom renderer for responsive table wrapping, `lucide-react` icons for provenance badges, and standard React Router 7 SSR loaders for new data queries. The document viewer correctly uses `marked` (not `react-markdown`) for SSR hydration stability on Cloudflare Workers — this approach should be preserved throughout.

**Core technologies relevant to v1.5:**
- `@tailwindcss/typography` v0.5.19: prose modifier classes control all heading, paragraph, table, and blockquote styling — already loaded via `@plugin` in `app.css`, no configuration needed
- `marked` v17.0.3: `marked.use({ renderer: { table() } })` wraps rendered tables in `overflow-x-auto` containers in ~10 lines; already the correct SSR-safe renderer
- `lucide-react` v0.562.0: `FileText`, `ScrollText`, `Video`, `Mic` icons cover all provenance indicator needs; existing `Badge` component or raw Tailwind classes handle badge UI
- `clsx` + `tailwind-merge` (existing `cn()` utility): already handles all class composition for new components

**What NOT to add:**
- `@tanstack/react-table` — document tables are read-only rendered markdown, not interactive data grids
- `react-markdown` for the document viewer — causes SSR/hydration mismatches on Cloudflare Workers; `marked` is correct
- `framer-motion` — the existing `grid-rows-[1fr]/grid-rows-[0fr]` CSS transition pattern already works
- Any PDF.js or inline PDF viewer — 400KB+ bundle addition; the extracted markdown IS the superior viewing experience

See `.planning/research/STACK.md` for the full "What NOT to Add" table with rationale.

### Expected Features

Based on comparable civic platform analysis (Legistar, CivicPlus, Council Data Project, citymeetings.nyc, CivicPress), users of civic meeting platforms universally expect source material indicators and the ability to follow a document trail from a matter through multiple meetings.

**Must have (table stakes):**
- **TS-1: Document Viewer Typography** — current `prose-sm` produces cramped blog-like formatting; official documents need proper heading hierarchy, line height, paragraph spacing, and responsive table handling
- **TS-2: Document Links on Agenda Items** — users cannot tell which agenda items have supporting documents without expanding each one; document counts/links must be visible in the collapsed state
- **TS-3: Documents on Matter Pages** — citizens tracking an issue across meetings have zero document visibility on matter pages; the highest-value new feature in v1.5
- **TS-4: Meeting Provenance Indicators** — every comparable platform shows Agenda/Minutes/Video availability; the data exists on the `meetings` table but is not surfaced anywhere in the current UI

**Should have (differentiators):**
- **D-1: Document TOC Sidebar** — sticky section navigation for long staff reports; section anchor IDs already rendered in `document-viewer.tsx`; IntersectionObserver is a well-documented pattern
- **D-2: Document Cross-References** — "Related Documents" panel showing other docs from same meeting and same matter; reuses `matter_id` joins established in TS-3
- **D-3: Source PDF Link Enhancement** — prominent "View Original (Pages 45-52)" link building trust and verifiability; all data already in the document viewer loader
- **D-4: Meeting Completeness Indicator** — explicitly calls out what IS missing (not just what is available); builds on TS-4 provenance data

**Defer to v2+:**
- Inline PDF viewer (PDF.js) — 400KB bundle, accessibility issues, duplicates pipeline work
- Document annotation — requires user accounts, moderation, undermines "official record" credibility
- Document diff / version comparison — council documents are not diff-friendly; a research problem, not a feature
- Print-optimized layout — source PDF is the print artifact; native browser Ctrl+F works on rendered HTML

See `.planning/research/FEATURES.md` for the full feature table with complexity ratings, dependency graph, and build order recommendations.

### Architecture Approach

The v1.5 architecture is a surgical set of changes to existing components, not a structural reworking. All foreign keys for document-to-agenda-item and agenda-item-to-matter linking already exist in the database. One new component (`MeetingProvenance`), one new service function (`getDocumentsForMatter`), and targeted modifications to four existing components/routes cover the complete table-stakes feature set. No schema migrations are required.

**Major components and changes:**
1. `MarkdownContent` (modified) — enhanced prose classes for typography polish; `marked` custom renderer wrapping tables in `overflow-x-auto` containers; used by both `document-viewer.tsx` and `DocumentSections.tsx` so improvements benefit both contexts
2. `MeetingProvenance` (new component at `components/meeting/MeetingProvenance.tsx`) — source indicator badges using already-loaded meeting data; pure presentation, no new queries
3. `DocumentSections` (modified) — add `meetingId` prop, render `<Link>` to full document viewer per extracted document; `meetingId` threaded from `meeting-detail.tsx` through `AgendaOverview` and `AgendaItemRow`
4. `getDocumentsForMatter` (new service function in `services/matters.ts`) — 2-step batch query: agenda_item IDs by matter_id then extracted_documents by those IDs via `.in()`; added to `Promise.all` in matter-detail loader

**Patterns to follow:**
- All independent Supabase queries use `Promise.all` in route loaders — never sequential
- Prop-thread `meetingId` down the component tree (not context); tree is max 3 levels deep
- Presentation-layer fixes (title deduplication, table wrapping) live in components, not in the data pipeline
- Document full-text stays in `document-viewer.tsx` loader only; meeting-detail and matter-detail loaders fetch metadata (title, type, summary) only

**Anti-patterns to avoid:**
- Fetching documents inside components with `useEffect` — breaks SSR, creates layout shift, loses network waterfall benefits
- Adding document joins to the already-complex `getMatterById` query (3 levels of nesting already; PostgREST nesting limits a real concern)
- Creating a separate `services/documents.ts` for matter documents — belongs in `matters.ts` alongside other matter-related queries

See `.planning/research/ARCHITECTURE.md` for full data flow diagrams, component boundary table, and build order.

### Critical Pitfalls

1. **SSR payload bloat on meeting-detail** — the loader already makes 6+ parallel queries and paginates transcript segments. Adding full document section text inflates the HTML payload from ~300KB to 1-2MB, degrading FCP on mobile (200-500ms to parse 1MB+ JSON on a mid-range phone) and pushing Cloudflare Workers CPU time toward limits. Prevention: meeting-detail and matter-detail loaders must only include document metadata (id, title, type, summary), never full section text. Full content loads in the dedicated `document-viewer.tsx` route only.

2. **N+1 query when adding documents to matter pages** — looping over agenda items to fetch documents individually generates 20+ Supabase queries for a matter with 20 appearances, triggering 429 rate limiting and 2-4 second load times. Prevention: use a two-step batch fetch — one query for agenda_item IDs by `matter_id`, then one `.in("agenda_item_id", itemIds)` query for all extracted_documents. Never iterate to fetch documents per item.

3. **Mobile table overflow destroys layout** — council documents contain wide financial and zoning tables (6-8 columns) that push the viewport sideways when rendered as bare `<table>` elements via `dangerouslySetInnerHTML`. Prevention: `marked.use()` custom table renderer wrapping every `<table>` in `<div class="overflow-x-auto">`. Never hide table columns on mobile — every cell in a civic document table matters.

4. **Duplicate document titles without context** — many extracted documents share generic titles ("Staff Report", "Appendix A") across multiple meetings. On matter pages, this creates an indistinguishable list of links. Prevention: always display meeting date alongside document title in cross-meeting link contexts. Use composite display: `[type badge] [title] — [meeting date]`.

5. **Deep links into accordion content fail** — hash links to document sections inside the `grid-rows` CSS collapse animation do not scroll to content when the accordion is closed (overflow: hidden, zero height). Prevention: link from matter pages and agenda items to the standalone document viewer route (`/meetings/:id/documents/:docId`), never to anchor hashes inside the meeting-detail accordion.

See `.planning/research/PITFALLS.md` for the full 14-pitfall analysis including 4 moderate pitfalls (stale timestamps, XSS from unsanitized markdown, duplicate data fetching, two-query waterfall) and a phase-specific warnings table.

---

## Implications for Roadmap

Feature dependencies determine the natural phase structure. TS-1 (typography) and TS-4 (provenance) are fully independent. TS-2 (agenda item document links) benefits from TS-1 being complete because the document viewer it links to should look polished. TS-3 (matter documents) benefits from TS-2 establishing the document link URL pattern. Differentiators (D-1 through D-4) build on the table-stakes foundation.

### Phase 1: Document Viewer Polish

**Rationale:** Fully independent — pure CSS/component changes with no data dependencies. Changes to `MarkdownContent` benefit all downstream document rendering: both the standalone viewer and inline agenda item sections. Building this first means the document viewer is already polished when Phase 3 adds links pointing to it. Contains the highest-priority mobile UX fix (table overflow).

**Delivers:** Polished official-document typography (heading hierarchy, line height, paragraph spacing, blockquote styling), responsive table handling, title deduplication in the document viewer.

**Addresses:** TS-1 (document viewer typography), partial D-3 (source PDF link prominence)

**Avoids:** Pitfall 3 (mobile table overflow — `overflow-x-auto` wrapper via `marked.use()`), Pitfall 6 (XSS from unsanitized markdown — add post-processing sanitization), Pitfall 9 (column hiding destroys data — never hide civic document columns), Pitfall 13 (large document sync rendering — monitor section sizes)

**Files touched:** `components/markdown-content.tsx`, `routes/document-viewer.tsx`

### Phase 2: Meeting Provenance Indicators

**Rationale:** Fully independent of Phase 1. All data (`has_agenda`, `has_minutes`, `has_transcript`, `agenda_url`, `minutes_url`, `video_url`) is already loaded in the meeting-detail loader. This is a pure presentation component — the fastest path to a high-visibility, user-facing feature. Can be built in parallel with Phase 1.

**Delivers:** Agenda/Minutes/Video/Transcript availability badges on the meeting detail page header; source links to original PDFs on CivicWeb; "last updated" timestamp using `documents.created_at` as "posted" date (not "verified" — no pipeline changes needed).

**Addresses:** TS-4 (meeting provenance indicators), partial D-4 (meeting completeness)

**Avoids:** Pitfall 5 (stale timestamps — use `documents.created_at` as "posted" date, not a "last verified" claim), Pitfall 12 (broken source links — clear CivicWeb attribution so users know it is an external link), Pitfall 14 (inconsistent date formatting — single `formatDate` call with consistent options throughout)

**Files touched:** `components/meeting/MeetingProvenance.tsx` (new), `routes/meeting-detail.tsx`

### Phase 3: Document Links on Agenda Items

**Rationale:** Surfaces already-loaded data — `extractedDocuments` and `documentSections` are fetched in the meeting-detail loader. The work is UI only: surface document count in collapsed agenda item rows, add "View full document" links in the expanded DocumentSections component. Builds after Phase 1 so the document viewer it links to already has polished typography.

**Delivers:** Document count/type indicators visible on collapsed agenda item rows without expanding; "View full document" link per extracted document in the expanded accordion; improved discoverability with no loader changes and no payload increase.

**Addresses:** TS-2 (document section links on meeting detail agenda items)

**Avoids:** Pitfall 1 (payload bloat — no new data loaded, reuses existing extractedDocuments), Pitfall 7 (duplicate data fetching — reuses existing extractedDocuments from loader), Pitfall 8 (deep links into accordions — links go to standalone document viewer route, not anchor hashes)

**Files touched:** `components/meeting/DocumentSections.tsx`, `components/meeting/AgendaOverview.tsx`, `routes/meeting-detail.tsx`

### Phase 4: Documents on Matter Pages

**Rationale:** The highest-value new feature but requires new data work. Comes last because it builds on the document link URL pattern established in Phase 3 and benefits from the document viewer being polished (Phase 1). The `getDocumentsForMatter` function must use the batch `.in()` pattern to avoid N+1 queries — this must be implemented correctly from the start.

**Delivers:** All related documents visible on the matter timeline, grouped chronologically by meeting date, with document type badges, titles (with meeting date disambiguation), and links to the full document viewer. Citizens can follow the complete document trail for a bylaw or development proposal across all meetings.

**Addresses:** TS-3 (all related documents on matter pages), partial D-2 (document cross-references via matter linkage)

**Avoids:** Pitfall 2 (N+1 query — batch `.in()` fetch, never per-item loop), Pitfall 4 (duplicate titles — composite display with meeting date), Pitfall 1 (payload bloat — metadata only, no section text in loader)

**Files touched:** `services/matters.ts` (new `getDocumentsForMatter`), `routes/matter-detail.tsx`

### Phase 5: Document Navigation and Cross-References (Differentiators)

**Rationale:** D-1 through D-4 all build on the polished foundation from Phases 1-4. These features enhance the document viewer itself, so they cluster naturally. D-2 (cross-references) can reuse the `getDocumentsForMatter` service from Phase 4, and D-4 (completeness indicator) extends the provenance data from Phase 2. IntersectionObserver for D-1 (TOC sidebar) is a well-documented pattern with no new libraries.

**Delivers:** Sticky table-of-contents sidebar for long documents; "Related Documents" panel in the document viewer; prominent page-range source PDF links; meeting completeness summary.

**Addresses:** D-1 (document TOC sidebar), D-2 (document cross-references), D-3 (source PDF link enhancement), D-4 (meeting completeness indicator)

**Files touched:** `routes/document-viewer.tsx`, `routes/meeting-detail.tsx`, `services/matters.ts` (reuses `getDocumentsForMatter` for D-2)

### Phase Ordering Rationale

- Phase 1 first: Typography polish is independent and ensures the document viewer is already good-looking before Phases 2 and 3 add links pointing to it. The mobile table overflow fix is the highest-urgency UX issue.
- Phase 2 can run in parallel with Phase 1: Provenance indicators are entirely independent; no shared files or dependencies.
- Phase 3 after Phase 1: Document links on agenda items point to the document viewer — it should look polished already. The data is already loaded, so this is a fast phase.
- Phase 4 after Phase 3: Establishes the `getDocumentsForMatter` query pattern, needs matter_id join that mirrors Phase 3's document link URL pattern.
- Phase 5 after Phases 1-4: All differentiators build on the complete table-stakes foundation.
- The query performance optimization (Pitfall 10 — two-query waterfall in `getDocumentSectionsForMeeting`) is cross-cutting and low-urgency; address if page load metrics show regression after Phases 3-4.

### Research Flags

Phases with standard patterns (skip `/gsd:research-phase`):
- **Phase 1 (Document viewer polish):** Well-documented Tailwind prose modifier API and `marked.use()` renderer; ~10-line changes verified against official docs.
- **Phase 2 (Provenance indicators):** Pure presentation component using already-loaded data; standard lucide-react + Tailwind badge pattern already used throughout the codebase.
- **Phase 3 (Document links on agenda items):** Prop threading and `<Link>` component additions; established codebase pattern.

Phases that may benefit from a brief pre-coding check:
- **Phase 4 (Matter documents):** ARCHITECTURE.md recommends a parallel fetch via `getDocumentsForMatter`; PITFALLS.md notes a Supabase nested select through `extracted_documents` could also work. Verify which approach avoids the PostgREST 3-level nesting limit before writing code. The parallel fetch is the safer default.
- **Phase 5 (Differentiators):** D-2 (cross-references) queries through `agenda_items.matter_id` that may overlap with Phase 4's service function. Coordinate to avoid duplicate query logic.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All dependencies verified against `apps/web/package.json`; zero new packages confirmed by auditing every feature requirement against existing capabilities |
| Features | HIGH | Validated against 6 comparable civic platforms; table stakes features are clear and well-justified; differentiators have honest complexity ratings |
| Architecture | HIGH | Based on direct codebase analysis of existing routes, services, and `bootstrap.sql` migrations; all FK relationships verified; component change inventory is specific |
| Pitfalls | HIGH | 10 of 14 pitfalls verified from direct code reading (lines cited in source); 4 at MEDIUM (XSS risk from AI pipeline content, URL stability, large section rendering) |

**Overall confidence:** HIGH

### Gaps to Address

- **`getMeetingById` select string for `updated_at`**: ARCHITECTURE.md notes `updated_at` may or may not be in the current select string. Verify before building Phase 2 provenance indicators — if missing, it is a one-field addition to the select string, not a structural change.

- **Nested select vs. parallel fetch for matter documents**: PITFALLS.md and ARCHITECTURE.md give slightly different guidance. PITFALLS.md says PostgREST can follow the `extracted_documents.agenda_item_id` FK as a sibling of `motions` in the nested select. ARCHITECTURE.md recommends a separate parallel fetch to keep `getMatterById` clean. Pick one approach before writing Phase 4 code. The parallel fetch is recommended — the existing query already has 3 levels of nesting, adding a 4th risks PostgREST limits and makes the query harder to debug.

- **Document section size distribution**: Pitfall 13 flags potential synchronous `marked.parse()` blocking for very large sections. Risk depends on actual data distribution across the 711 ingested meetings. Monitor during Phase 1 testing with real council documents; split large sections in the pipeline if slow renders are observed.

- **CivicWeb URL stability**: Pitfall 12 notes source URLs (`agenda_url`, `minutes_url`) may 404 over time as the Town's CMS reorganizes content, but actual URL stability has not been measured. Use clear "Source: Town of View Royal" attribution on all provenance links from Phase 2 onward.

---

## Sources

### Primary (HIGH confidence — direct codebase and official docs)
- Codebase analysis: `apps/web/app/components/markdown-content.tsx`, `app/routes/document-viewer.tsx`, `app/routes/meeting-detail.tsx`, `app/routes/matter-detail.tsx`, `app/components/meeting/DocumentSections.tsx`, `app/components/meeting/AgendaOverview.tsx`, `app/services/meetings.ts`, `app/services/matters.ts`
- Database schema: `sql/bootstrap.sql`, `supabase/migrations/` — all FK relationships verified
- `apps/web/package.json` — all dependency versions confirmed
- [Tailwind CSS Typography Plugin](https://github.com/tailwindlabs/tailwindcss-typography) — prose modifier API, table styling
- [marked.js Custom Renderers](https://marked.js.org/using_pro) — `marked.use()` table renderer, v17 API
- [marked.js npm](https://www.npmjs.com/package/marked) — v17.0.3 confirmed latest
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) — 128MB memory, CPU time constraints
- [Supabase Querying Joins and Nested Tables](https://supabase.com/docs/guides/database/joins-and-nesting) — PostgREST FK-based auto-joins, nesting behavior
- [Supabase Performance Tuning](https://supabase.com/docs/guides/platform/performance) — query optimization, index advisor

### Secondary (MEDIUM confidence — multiple sources agree)
- [Council Data Project](https://councildataproject.org/) — civic platform navigation and transcript UI patterns
- [citymeetings.nyc](https://citymeetings.nyc/) — AI-powered civic meeting navigation, chapter-based viewing
- [CivicPress](https://civicpress.io/) — Git-backed civic document provenance principles
- [Granicus Legistar](https://granicus.com/product/legistar-agenda-management/) — document/video availability indicator patterns
- [CivicPlus Agenda Management](https://www.civicplus.com/civicclerk/agenda-meeting-management/) — meeting management document linking UI
- [Plural Policy](https://pluralpolicy.com/) — legislative cross-linking, related bill discovery
- [marked.js XSS vulnerability (Snyk)](https://snyk.io/blog/marked-xss-vulnerability/) — sanitization not enabled by default in marked
- [CSS-Tricks: Sticky TOC with IntersectionObserver](https://css-tricks.com/sticky-table-of-contents-with-scrolling-active-states/) — TOC pattern reference
- [CitiLink-Minutes Dataset](https://arxiv.org/html/2602.12137) — research on municipal meeting minutes structure

### Tertiary (LOW confidence — single source or inference)
- CivicWeb URL permanence — inferred from general experience with municipal CMS systems; actual View Royal URL stability not empirically measured
- Document section size distribution — inferred from pipeline chunking approach; not measured across all 711 ingested meetings

---
*Research completed: 2026-02-26*
*Ready for roadmap: yes*
