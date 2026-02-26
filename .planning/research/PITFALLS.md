# Domain Pitfalls: v1.5 Document Experience

**Domain:** Adding document viewer polish, cross-linking, and meeting provenance to existing civic intelligence SSR platform
**Researched:** 2026-02-26

---

## Critical Pitfalls

Mistakes that cause rewrites, performance regressions, or major user-facing breakage.

---

### Pitfall 1: Cloudflare Workers SSR Payload Bloat from Document Content in Loader Data

**What goes wrong:** The meeting-detail loader already fetches agenda items, transcript segments, speaker aliases, attendance, people, document sections, and extracted documents -- all serialized into the HTML response as `__reactRouterData`. Adding per-agenda-item document content (section text, summaries, key facts) to the meeting-detail page inflates this serialized payload. A meeting with 15 agenda items, each with 2-3 linked documents and 5-10 sections, can push the initial HTML response from 200-400KB to 1-2MB. Cloudflare Workers have 128MB memory per isolate, but the real constraint is CPU time (10-20ms typical for SSR) and the client-side JSON parse cost.

**Why it happens:** The natural instinct is to add document content to the existing `getMeetingById` data shape -- just add more fields to each agenda item. This is how the current document sections are surfaced: fetched in parallel in the loader, passed down as props. But the meeting-detail page is already the largest loader in the app (it paginates transcript segments in 1000-row batches). Each additional data dimension compounds the payload.

**Consequences:**
- First contentful paint degrades noticeably on mobile (parsing 1MB+ JSON on a mid-range phone takes 200-500ms)
- Cloudflare Workers CPU time approaches the 30-second default limit for complex meetings (many agenda items, many documents)
- The `getMeetingById` function already makes 6+ sequential/parallel Supabase queries. Adding document queries without coordination creates resource contention
- React hydration slows because the entire document tree must be reconciled even though most documents are hidden behind accordion UI

**Prevention:**
1. Do NOT add full document section text to the meeting-detail loader. The current approach of fetching `documentSections` and `extractedDocuments` with minimal fields (id, title, summary, key_facts) is correct -- keep it lightweight.
2. For the document viewer route (`/meetings/:id/documents/:docId`), the full content is already loaded only when the user navigates there. This is the right pattern.
3. If showing document previews inline on the agenda tab, limit to summary + key facts (already available in `extractedDocuments`). Never inline full section text on the meeting-detail page.
4. For the matter-detail page, use the same pattern: fetch document metadata (titles, types, summaries) in the loader, let the user click through to the full document viewer.

**Detection:** Measure HTML response size for meeting-detail pages with `curl -s -o /dev/null -w "%{size_download}" https://viewroyal.ai/meetings/123`. If it exceeds 500KB, the loader is too heavy.

**Phase:** Address in the phase that adds document links to meeting detail and matter pages. This is an architectural constraint that must be respected throughout.

**Confidence:** HIGH -- verified from the existing codebase: `meeting-detail.tsx` loader already fetches 6+ parallel queries and paginates transcript segments. The `document-viewer.tsx` loader already demonstrates the correct pattern of loading content only for a single document.

---

### Pitfall 2: N+1 Query Pattern When Linking Documents to Matters Across Meetings

**What goes wrong:** The matter-detail page shows a timeline of every meeting where the matter appeared. Adding "related documents" to each timeline entry requires querying documents for each meeting. The current `getMatterById` query uses Supabase's nested select to fetch agenda items with their meetings and motions in a single query. But documents live in a separate table chain: `matters -> agenda_items -> extracted_documents -> document_sections`. Supabase's PostgREST cannot join through `agenda_items` to `extracted_documents` in the same nested select because `extracted_documents` links to `agenda_items` via `agenda_item_id` (a reverse FK from the perspective of the agenda_items query).

**Why it happens:** Supabase's PostgREST auto-detects relationships via foreign keys. `agenda_items` has a FK to `matters`, and `extracted_documents` has a FK to `agenda_items`. But the existing `getMatterById` query already selects `agenda_items(...)` with nested `motions(...)` and `votes(...)`. Adding `extracted_documents(...)` to this nested select DOES work because PostgREST can follow the FK from extracted_documents.agenda_item_id. However, developers often miss this and instead write a separate loop query: "for each agenda item, fetch its extracted documents." That loop query is the N+1 trap.

**Consequences:**
- A matter that appeared in 20 meetings generates 20 additional Supabase queries (one per agenda item) instead of 1
- Supabase client rate limiting kicks in, causing 429 errors in production
- Loader response time goes from 200ms to 2-4 seconds
- The matter-detail page becomes the slowest page in the app

**Prevention:**
1. Add `extracted_documents(id, title, document_type, summary, key_facts, page_start, page_end)` to the existing nested select in `getMatterById`. PostgREST handles the join through the `agenda_item_id` FK automatically.
2. Test with a matter that appears in 15+ meetings to verify the query returns documents correctly without N+1.
3. If the nested select approach hits PostgREST's depth limit (3 levels of nesting), use a single RPC or a SQL view that pre-joins the data.
4. NEVER loop over agenda items to fetch documents individually.

**Detection:** Check Supabase dashboard query logs for the matter-detail route. If you see clusters of identical `extracted_documents` queries differing only by `agenda_item_id`, you have an N+1 problem.

**Phase:** Address in the phase that adds documents to matter pages. Must be solved at the query level before building UI.

**Confidence:** HIGH -- verified from `getMatterById` in `apps/web/app/services/matters.ts`: the existing query already nests 3 levels deep (`agenda_items -> motions -> votes`). Adding extracted_documents as a sibling of motions is the correct approach.

---

### Pitfall 3: Markdown Tables Overflow on Mobile, Breaking Document Viewer Layout

**What goes wrong:** The `MarkdownContent` component uses `marked` to convert markdown to HTML, then renders via `dangerouslySetInnerHTML` with Tailwind `prose` classes. Council documents frequently contain wide tables (financial summaries, zoning comparisons, permit conditions) with 6-8 columns. These tables overflow their container on mobile screens, pushing the entire page layout sideways. The prose plugin's default table styling has no `overflow-x: auto` wrapper, so the table bleeds past the viewport edge.

**Why it happens:** Markdown tables render as bare `<table>` elements. The Tailwind `prose` plugin applies basic table styling (borders, padding) but does NOT add overflow handling. The `MarkdownContent` component applies `prose-table:text-xs prose-table:my-3` but no overflow wrapper. Since the HTML is injected via `dangerouslySetInnerHTML`, there's no opportunity to wrap individual `<table>` elements in a scrollable container without post-processing the HTML.

**Consequences:**
- On mobile, horizontal scroll appears on the entire page (not just the table), making the page unusable
- Users cannot scroll back to the left edge easily, especially on iOS Safari
- Content after the table is pushed off-screen
- This affects the document viewer (`document-viewer.tsx`) and the inline document sections in `AgendaOverview`

**Prevention:**
1. Add a `marked` extension or post-processing step that wraps every `<table>` element in `<div class="overflow-x-auto">`. This is a 5-line change to the `MarkdownContent` component:
   ```typescript
   const html = (marked.parse(content, { async: false }) as string)
     .replace(/<table/g, '<div class="overflow-x-auto"><table')
     .replace(/<\/table>/g, '</table></div>');
   ```
2. Add CSS to ensure the wrapper scrolls independently: `overflow-x-auto` with `-webkit-overflow-scrolling: touch` for iOS.
3. Test with actual council documents that contain wide financial tables (these are common in staff reports).
4. Consider adding a subtle scroll indicator (gradient shadow on the right edge) so users know the table is scrollable.

**Detection:** Open any document viewer page containing a table on a mobile device or narrow viewport (< 640px). If the page scrolls horizontally, the fix is missing.

**Phase:** Address in the document viewer polish phase. This is the single most impactful mobile UX fix.

**Confidence:** HIGH -- verified from `apps/web/app/components/markdown-content.tsx`: the component applies `prose-table:text-xs` but has no overflow handling. Council documents routinely contain wide tables.

---

### Pitfall 4: Duplicate Document Titles Creating Confusing Cross-Links

**What goes wrong:** The pipeline's document extraction produces `extracted_documents` with titles derived from PDF headings. Many council PDFs use generic titles like "Staff Report", "Appendix A", "Correspondence", or "Schedule A" across different agenda items and meetings. When displaying "Related Documents" on a matter page, these generic titles appear multiple times without enough context to distinguish them. Users see "Staff Report, Staff Report, Staff Report" with no way to tell which meeting or topic each belongs to.

**Why it happens:** The `extracted_documents.title` field comes from AI extraction of PDF content. The AI extracts the heading it finds, which for standardized municipal documents is often generic. The `document_type` field helps (`staff_report`, `correspondence`, `appendix`) but is not enough disambiguation when multiple documents of the same type relate to the same matter.

**Consequences:**
- Users cannot identify which document they want without clicking each one
- The cross-linking feature becomes useless -- it looks like duplicate entries
- On matter pages, the timeline shows multiple meetings with identically-titled documents

**Prevention:**
1. When displaying document links outside their original meeting context, always include the meeting date and/or meeting title as disambiguation: "Staff Report (Jan 13, 2025 Regular Council)" instead of just "Staff Report".
2. If the document has a `summary` field, show the first line as a subtitle beneath the title.
3. Consider a composite display: `[document_type badge] [title] - [meeting_date]`.
4. The database already has the data needed (join through `document_id -> documents -> meeting_id -> meetings.meeting_date`). This is a UI formatting problem, not a data problem.
5. For the document viewer breadcrumb, the current implementation already includes meeting title context. Extend this pattern to all document link displays.

**Detection:** Navigate to a matter that has appeared in 5+ meetings and check if the document links are distinguishable. Common test: any zoning or development matter will have multiple "Staff Report" entries.

**Phase:** Address in the phase that adds documents to matter pages. The UI template for document links must include meeting context from the start.

**Confidence:** HIGH -- verified from the schema: `extracted_documents.title` is a free-text field populated by AI extraction. Generic titles are extremely common in municipal PDFs based on the document_type distribution (staff_report, appendix, correspondence dominate).

---

## Moderate Pitfalls

---

### Pitfall 5: Provenance Indicators Showing Stale or Missing "Last Updated" Timestamps

**What goes wrong:** Meeting provenance indicators (Agenda available, Minutes available, Video available) need "last updated" timestamps to show when source material was last refreshed. But the `meetings` table has `created_at` and the boolean flags (`has_agenda`, `has_minutes`, `has_transcript`) but no per-source timestamp tracking when each source was last checked or updated. The `documents` table has `created_at` but this reflects when the pipeline first ingested the document, not when the source was last verified to still exist.

**Why it happens:** The pipeline's update detection (v1.2) tracks whether new documents or video exist for a meeting via `audit.py`, but it does not record per-source provenance timestamps in the database. It either re-ingests or skips. The `meetings.meta` JSONB column could theoretically hold this data, but it is not currently populated with source timestamps.

**Consequences:**
- Provenance indicators show "Agenda: Available" but not when it was last checked
- Users cannot tell if the data is from yesterday's pipeline run or from 6 months ago
- If a source URL becomes a 404 after ingestion, the provenance indicator still shows "Available"
- The "last updated" feature becomes misleading or impossible to implement without schema changes

**Prevention:**
1. For v1.5, use the existing `documents.created_at` as a proxy for "when was this source first available." This is honest and avoids schema changes.
2. Display provenance as "Agenda posted [date]" using the earliest document's `created_at` for that meeting, NOT "Agenda last verified."
3. For the video source, `meetings.video_url` being non-null indicates availability. The `meetings.created_at` or the pipeline's last successful run date can serve as the timestamp.
4. Do NOT add a "last verified" feature in v1.5 -- it requires pipeline changes (recording check timestamps) that are out of scope.
5. If a more precise "freshness" indicator is needed later, add `source_checked_at` columns to the `meetings` table in a future milestone.

**Detection:** Review provenance indicators on meetings from 6+ months ago. If the "last updated" date is misleading or missing, the approach needs adjustment.

**Phase:** Address in the provenance indicators phase. Define the timestamp source before building the UI.

**Confidence:** HIGH -- verified from the schema: `meetings` has `created_at` but no per-source timestamps. The `documents` table has `created_at` per document. The `meta` JSONB column exists but is not used for provenance.

---

### Pitfall 6: dangerouslySetInnerHTML XSS Risk from Unsanitized Markdown

**What goes wrong:** The `MarkdownContent` component uses `marked.parse()` and injects the result via `dangerouslySetInnerHTML`. The `marked` library does NOT sanitize HTML by default -- it passes through raw HTML found in markdown source. Since document section text comes from AI extraction of PDFs, the content could contain HTML-like strings that `marked` treats as raw HTML. Additionally, the `inlineImages` function in `document-viewer.tsx` constructs raw HTML strings (`<figure>`, `<img>`, `<a>`) and concatenates them with markdown content before rendering.

**Why it happens:** The document pipeline extracts text from PDFs using AI (Gemini). The AI output is treated as markdown. If the AI includes HTML tags in its output (which Gemini sometimes does for formatting), or if the original PDF contained HTML-like content (e.g., technical documents discussing HTML), `marked` passes it through to the DOM. The `marked.use({ gfm: true, breaks: false })` configuration does not enable sanitization.

**Consequences:**
- In the worst case, injected `<script>` tags or event handlers could execute in the browser (XSS)
- More realistically, malformed HTML from AI output breaks the document viewer layout (unclosed tags, unexpected elements)
- The `inlineImages` function builds HTML strings with user-facing data (image descriptions from AI) that are inserted without escaping

**Prevention:**
1. Add DOMPurify sanitization to the `MarkdownContent` component. Since this runs in SSR on Cloudflare Workers (no DOM), use `isomorphic-dompurify` or sanitize the HTML string with a regex-based approach for the server.
2. Alternatively, use `marked`'s built-in hook system to strip dangerous HTML. Add a custom renderer that escapes HTML tags in text tokens.
3. For the `inlineImages` function, escape the `desc` variable before inserting it into HTML attributes and content. The current code does `.replace(/"/g, "&quot;")` for the alt attribute but does not escape the figcaption content.
4. At minimum, configure marked with `{ sanitize: true }` (note: this option was removed in marked v5+, so use the `marked-sanitizer-html` extension or add a post-processing sanitization step).
5. Since the content comes from a controlled pipeline (not user input), the risk is LOW but the fix is cheap. Do it anyway.

**Detection:** Search for documents where the AI extraction included HTML-like content. Check if any `<script>`, `<iframe>`, or `<style>` tags pass through to the rendered HTML.

**Phase:** Address in the document viewer polish phase alongside table overflow fixes. Both are post-processing changes to MarkdownContent.

**Confidence:** MEDIUM -- the risk is reduced because content comes from a controlled AI pipeline, not arbitrary user input. But the fix is cheap and should be implemented as defense-in-depth. Verified from `markdown-content.tsx` that no sanitization is applied.

---

### Pitfall 7: Meeting-Detail Page Re-Fetching All Documents on Tab Switch

**What goes wrong:** The meeting-detail page fetches `extractedDocuments` in the loader for the overview tab's document count badge. When the user switches to the Agenda tab, the `AgendaOverview` component receives `extractedDocuments` and `documentSections` as props and filters them per agenda item client-side. This works. But if a developer adds a dedicated "Documents" tab to the meeting-detail page (showing the same content as the `/meetings/:id/documents` route), they might add a new loader fetch for the full document list -- duplicating data already loaded.

**Why it happens:** The meeting-documents route (`/meetings/:id/documents`) has its own loader that fetches documents independently. A developer copying that pattern into a tab on the meeting-detail page creates duplicate fetches. The meeting-detail loader already has `getExtractedDocumentsForMeeting` -- adding another fetch is redundant.

**Consequences:**
- Two identical Supabase queries for every meeting-detail page load
- Increased loader latency (each query adds 50-100ms)
- Confusing code where the same data exists in two different shapes

**Prevention:**
1. The meeting-detail loader already fetches `extractedDocuments`. Any tab or section on the meeting-detail page should use this data, not add new fetches.
2. If more document detail is needed (e.g., parent document info, source URLs), extend the existing `getExtractedDocumentsForMeeting` query rather than adding a parallel query.
3. For the "view all documents" link, navigate to `/meetings/:id/documents` (the existing dedicated route) rather than building a tab.

**Detection:** Count Supabase queries per meeting-detail page load. If `extracted_documents` appears more than once, there is duplication.

**Phase:** Relevant to any phase that modifies the meeting-detail page's data fetching.

**Confidence:** HIGH -- verified from the existing code: `meeting-detail.tsx` loader calls `getExtractedDocumentsForMeeting`, and `meeting-documents.tsx` loader calls it again independently. The pattern to avoid is replicating the second call inside the first route.

---

### Pitfall 8: Document Section Links Not Resolving After Agenda Item Expansion Animation

**What goes wrong:** The `AgendaOverview` component uses a CSS `grid-rows-[1fr]/grid-rows-[0fr]` animation to expand/collapse agenda items. The `DocumentSections` component inside the expanded area also uses the same animation pattern for individual document accordions. When a user clicks an agenda item that has document sections, the outer accordion animates open while inner content may have anchor links or scroll targets. Hash-based links (e.g., `#section-3`) to document sections inside collapsed accordions do not work because the content has `overflow: hidden` and zero height.

**Why it happens:** The CSS grid animation pattern sets `overflow: hidden` on the collapsed state. When a link targets an element inside a collapsed accordion, the browser cannot scroll to it because the element has no layout height. This is a known limitation of the progressive disclosure (accordion) pattern.

**Consequences:**
- Deep links to specific document sections within agenda items do not work
- "Jump to section" links from search results or cross-references fail silently
- The user lands on the meeting page but cannot find the referenced content

**Prevention:**
1. If implementing deep links to document sections, auto-expand the parent agenda item and document accordion when the hash matches.
2. Use a `useEffect` that reads `window.location.hash` on mount and triggers the appropriate expansion.
3. For cross-linking from matter pages, link to the document viewer route (`/meetings/:id/documents/:docId`) rather than trying to deep-link into the meeting-detail agenda accordion.
4. This is a progressive disclosure vs. direct linking tension. Accept that accordion content is not directly linkable and route users to the standalone document viewer instead.

**Detection:** Try linking directly to `#agenda-42` on a meeting-detail page where the agenda item has document sections. Verify whether the content is visible or collapsed.

**Phase:** Address in the phase that adds cross-linking between documents and agenda items.

**Confidence:** HIGH -- verified from `AgendaOverview.tsx`: the grid animation pattern uses `overflow: hidden` on collapsed state. The `DocumentSections` component nests another accordion inside.

---

### Pitfall 9: Responsive Table Column Hiding Destroys Data Integrity for Civic Documents

**What goes wrong:** A common responsive table pattern is hiding "secondary" columns on mobile. For civic documents, every table column is potentially important -- financial amounts, vote counts, property addresses, bylaw references. A developer applies `hidden sm:table-cell` to "secondary" columns, and mobile users lose access to critical data they specifically came to read.

**Why it happens:** Standard responsive web design patterns work for marketing sites where some columns are decorative. Civic documents are reference material where every cell matters. The developer applies a web design pattern that is wrong for this content type.

**Consequences:**
- Citizens on mobile cannot see financial amounts, vote results, or other critical data
- The platform's core value proposition (transparency) is undermined on the device most people use
- Users complain that "the data is incomplete" when it is actually hidden by CSS

**Prevention:**
1. NEVER hide table columns on mobile for civic document content. Instead, use the horizontal scroll wrapper from Pitfall 3 (`overflow-x: auto`).
2. For very wide tables (8+ columns), consider a card layout transformation where each row becomes a stacked card on mobile. But only do this if the table structure is predictable (e.g., vote tallies always have the same columns).
3. For the document viewer, the horizontal scroll approach is safest because table structures vary widely across different document types.
4. Add a visual scroll indicator (subtle gradient or "scroll right" hint) so users know the table extends beyond the viewport.

**Detection:** Check document viewer pages with tables on a 375px-wide viewport. All data should be accessible via horizontal scroll, not hidden.

**Phase:** Address alongside Pitfall 3 in the document viewer polish phase.

**Confidence:** HIGH -- this is a UX principle, not a technical finding. Civic document tables must preserve all data on all viewports.

---

### Pitfall 10: getDocumentSectionsForMeeting Two-Query Waterfall

**What goes wrong:** The existing `getDocumentSectionsForMeeting` function in `meetings.ts` makes two sequential Supabase queries: first fetching document IDs for the meeting, then fetching sections for those document IDs. This creates a waterfall where the second query cannot start until the first completes. For meetings with many documents, this adds 100-200ms of unnecessary latency.

**Why it happens:** The `document_sections` table has a `document_id` FK but no direct `meeting_id` FK. To find sections for a meeting, you must first find which documents belong to that meeting. The developer wrote the obvious two-step query.

**Consequences:**
- Every meeting-detail page load has an extra 50-100ms waterfall for document sections
- This compounds with the existing transcript pagination waterfall in `getMeetingById`
- As more meetings accumulate documents, the first query returns more IDs, making the second query's `IN` clause larger

**Prevention:**
1. Create a Supabase RPC (SQL function) that joins `documents` and `document_sections` in a single query:
   ```sql
   SELECT ds.* FROM document_sections ds
   JOIN documents d ON ds.document_id = d.id
   WHERE d.meeting_id = $1
   ORDER BY ds.document_id, ds.section_order
   ```
2. Alternatively, add a `meeting_id` denormalized column to `document_sections` (populated by trigger or migration). This eliminates the join entirely.
3. Short-term fix: the current two-query approach works. Prioritize this optimization only if meeting-detail page load times exceed acceptable thresholds (> 1 second total).
4. The same pattern exists in `getExtractedDocumentsForMeeting`. Both should be optimized together.

**Detection:** Check Supabase query logs for pairs of queries: `SELECT id FROM documents WHERE meeting_id = X` followed by `SELECT * FROM document_sections WHERE document_id IN (...)`. The gap between them is the wasted time.

**Phase:** Address as a performance optimization, either in the document linking phase or as a follow-up polish pass.

**Confidence:** HIGH -- verified from `apps/web/app/services/meetings.ts` lines 278-305 and 327-355: both `getDocumentSectionsForMeeting` and `getExtractedDocumentsForMeeting` use the same two-step waterfall pattern.

---

## Minor Pitfalls

---

### Pitfall 11: Image R2 URLs Hardcoded to images.viewroyal.ai

**What goes wrong:** The `document-viewer.tsx` component constructs image URLs as `https://images.viewroyal.ai/${img.r2_key}`. When the platform adds multi-municipality support, this domain is incorrect for other towns. Additionally, if the R2 bucket custom domain changes, every reference breaks because the domain is hardcoded inline rather than configured.

**Why it happens:** The image domain was set up for View Royal and hardcoded as a string literal in the component. There is no environment variable or configuration for it.

**Prevention:**
1. Extract the image base URL to an environment variable or utility function.
2. For v1.5, this is a minor concern since only View Royal is active. But note it for multi-tenancy readiness.
3. A simple utility like `getImageUrl(r2Key: string)` that reads from wrangler.toml vars would future-proof this.

**Phase:** Low priority. Can be addressed during document viewer polish or deferred to multi-tenancy milestone.

**Confidence:** HIGH -- verified from `document-viewer.tsx` line 183: URL is constructed inline with hardcoded domain.

---

### Pitfall 12: Provenance Source Links Becoming Broken (404 Upstream)

**What goes wrong:** Meeting provenance indicators link to source URLs (`agenda_url`, `minutes_url`, `source_url` on documents). These URLs point to the Town of View Royal's CivicWeb system, which periodically reorganizes or archives content. A provenance link that worked when the pipeline scraped the document may return 404 six months later.

**Why it happens:** Municipal CMS systems do not guarantee URL permanence. CivicWeb URLs include session-like path segments that can expire. The pipeline stores the URL at scrape time but never rechecks it.

**Consequences:**
- Users click "View Original PDF" and get a 404 from the town website
- Provenance indicators suggest source availability that no longer exists
- Trust in the platform is undermined when external links break

**Prevention:**
1. Display source links with clear attribution: "Source: Town of View Royal CivicWeb" so users understand it is an external link that may change.
2. Do NOT verify source URLs in real-time (adds latency, external dependency in the SSR path).
3. Consider adding a fallback message: "If this link is broken, the original document was published on [date]."
4. Long-term: store original PDFs in R2 and link to those. But that is a storage/legal consideration beyond v1.5 scope.

**Phase:** Address during provenance indicators UI design.

**Confidence:** MEDIUM -- based on general experience with municipal CMS systems. The actual URL stability of View Royal's CivicWeb has not been measured.

---

### Pitfall 13: marked.parse() Synchronous Blocking on Very Large Documents

**What goes wrong:** The `MarkdownContent` component calls `marked.parse(content, { async: false })` synchronously. For very large document sections (10,000+ words of markdown with many tables and lists), this blocks the React rendering thread. In SSR on Cloudflare Workers, this blocks the event loop and can push CPU time toward the limit.

**Why it happens:** Most document sections are small (500-2000 tokens). But some staff reports and bylaw full texts can have very long sections. The sync parse is fine for typical sections but becomes a bottleneck for outliers.

**Consequences:**
- Occasional slow page loads for documents with very large sections
- In extreme cases, CPU time limit exceeded on Workers

**Prevention:**
1. For v1.5, the sync parse is acceptable. Monitor for documents that trigger slow renders.
2. If a problem is detected, split very large sections in the pipeline (chunking at 5000 tokens) rather than trying to async-parse in the component.
3. The `marked` library supports async parsing, but using it requires `await` in the component rendering path, which complicates the current synchronous component structure.

**Phase:** Monitor during testing. Optimize only if slow document renders are observed.

**Confidence:** MEDIUM -- the risk depends on the actual distribution of section sizes in the data. Most sections are small based on the pipeline's heading-based chunking approach.

---

### Pitfall 14: Inconsistent Date Formatting Across Provenance Indicators

**What goes wrong:** The app uses `formatDate` from `utils.ts` in some places and raw date strings in others. Provenance indicators need consistent date formatting ("Agenda posted Jan 13, 2025" vs "2025-01-13" vs "January 13, 2025"). If the developer uses different format functions or options across the three provenance indicators (Agenda, Minutes, Video), the UI looks inconsistent.

**Why it happens:** The existing `formatDate` utility accepts an options object for `Intl.DateTimeFormat`. Different components pass different options or no options, producing different formats.

**Prevention:**
1. Define a single date format for provenance timestamps and use it consistently.
2. The existing `formatDate` default (no options) produces a reasonable format. Use it everywhere for provenance dates.
3. If a relative format is wanted ("3 days ago"), add a separate utility rather than overloading `formatDate`.

**Phase:** Address during provenance UI implementation.

**Confidence:** HIGH -- this is a UI consistency concern, not a technical risk.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Document viewer typography & spacing | Table overflow on mobile (#3) | Wrap all tables in `overflow-x-auto` div |
| Document viewer typography & spacing | XSS from unsanitized markdown (#6) | Add sanitization post-processing to MarkdownContent |
| Document viewer typography & spacing | Column hiding destroys data (#9) | Never hide civic document table columns; use horizontal scroll |
| Document viewer typography & spacing | Large document blocking render (#13) | Monitor, split large sections if needed |
| Document links on meeting detail | Loader payload bloat (#1) | Use existing lightweight metadata; no full text in meeting loader |
| Document links on meeting detail | Duplicate data fetching (#7) | Reuse existing extractedDocuments from loader |
| Document links on meeting detail | Deep link into accordion fails (#8) | Link to standalone document viewer, not accordion hash |
| Documents on matter pages | N+1 queries (#2) | Add extracted_documents to nested select in getMatterById |
| Documents on matter pages | Duplicate titles without context (#4) | Include meeting date in document link display |
| Meeting provenance indicators | Stale timestamps (#5) | Use document created_at as "posted" date, not "verified" |
| Meeting provenance indicators | Broken source links (#12) | Clear attribution, fallback messaging |
| Meeting provenance indicators | Inconsistent date formatting (#14) | Single formatDate call with consistent options |
| Cross-cutting | Two-query waterfall (#10) | Supabase RPC or denormalized meeting_id on document_sections |
| Cross-cutting | Hardcoded image domain (#11) | Extract to environment variable |

---

## Sources

- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) -- 128MB memory, 30s default CPU, SSR typically 10-20ms
- [Supabase Querying Joins and Nested Tables](https://supabase.com/docs/guides/database/joins-and-nesting) -- PostgREST FK-based auto-joins
- [Supabase Performance Tuning](https://supabase.com/docs/guides/platform/performance) -- query optimization, index advisor
- [CSS Responsive Tables Guide](https://dev.to/satyam_gupta_0d1ff2152dcc/css-responsive-tables-complete-guide-with-code-examples-for-2025-225p) -- overflow-x-auto pattern
- [Responsive Tables in Markdown](https://johnfraney.ca/blog/how-to-write-responsive-html-tables/) -- wrapper div approach
- [marked.js XSS Vulnerability](https://snyk.io/blog/marked-xss-vulnerability/) -- sanitization not enabled by default
- [Preventing XSS with dangerouslySetInnerHTML](https://dev.to/jam3/how-to-prevent-xss-attacks-when-using-dangerouslysetinnerhtml-in-react-1464) -- DOMPurify recommendation
- Codebase analysis: `apps/web/app/components/markdown-content.tsx`, `apps/web/app/routes/document-viewer.tsx`, `apps/web/app/services/meetings.ts`, `apps/web/app/services/matters.ts`, `apps/web/app/routes/meeting-detail.tsx`, `apps/web/app/routes/matter-detail.tsx`

*Last updated: 2026-02-26*
