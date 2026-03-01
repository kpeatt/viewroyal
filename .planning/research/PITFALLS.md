# Domain Pitfalls: v1.6 Search Experience

**Domain:** Adding Perplexity-style citations, Kagi-style search controls, and agent transparency to existing SSR streaming RAG on Cloudflare Workers
**Researched:** 2026-02-28

---

## Critical Pitfalls

### Pitfall 1: Gemini Citation Format Unreliability

**What goes wrong:** The AI synthesis prompt instructs Gemini to emit `[sources:1,3,7]` markers. But LLMs don't reliably follow formatting instructions — Gemini may emit `[1,3,7]`, `[sources: 1, 3, 7]`, `[1][3][7]`, or natural language like "according to sources 1, 3, and 7." The frontend parser breaks on any format variation.

**Prevention:**
1. Use a robust regex that handles variations: `/\[sources?:?\s*([\d,\s]+)\]/gi`
2. Also keep the old `[N]` parser as fallback
3. Post-process: if the AI emits old-style `[1][2][3]` in sequence, collapse them into a grouped badge
4. Test with 20+ real queries and verify citation parsing before shipping
5. Consider post-processing on the backend (in rag.server.ts after synthesis) to normalize citation format before streaming

**Phase:** Address in the citation UX phase. The parser must be resilient from day one.

### Pitfall 2: Popover Positioning on Mobile / Small Viewports

**What goes wrong:** Radix Popover positions itself relative to the trigger element. On mobile, citation badges near the edge of the viewport cause popovers to overflow, get clipped, or appear in unexpected positions. Long source preview content makes the popover taller than the viewport.

**Prevention:**
1. On touch devices (`@media (hover: none)`), use a Dialog/Drawer (bottom sheet) instead of Popover
2. Set `Popover` max-height and make content scrollable
3. Use `collisionPadding` prop on Radix Popover to prevent edge overflow
4. Test on 375px width (iPhone SE) — the smallest common viewport

**Phase:** Address during source preview card implementation.

### Pitfall 3: Streaming Citation Parsing Mid-Chunk

**What goes wrong:** SSE `final_answer_chunk` events arrive in arbitrary boundaries. A citation marker `[sources:1,3,7]` could be split across two chunks: `"...decided [source"` and `"s:1,3,7] to approve..."`. A naive parser that processes each chunk independently will miss split markers.

**Prevention:**
1. Buffer the answer text and parse citations on the accumulated buffer, not individual chunks
2. Use a state machine parser that tracks whether we're inside a `[sources:` marker
3. Only render the latest complete text up to the last successfully parsed position
4. Don't emit partial citation markers to the DOM

**Phase:** Address in the citation UX phase. This is the trickiest implementation detail.

### Pitfall 4: Time Filter Breaking Hybrid Search Performance

**What goes wrong:** Adding `WHERE meeting_date >= $date` to hybrid search RPCs seems simple, but the RPCs join through multiple tables to reach `meetings.meeting_date`. For `hybrid_search_document_sections`, the join path is: `document_sections → documents → meetings`. Adding a date filter to a function that already does vector distance + FTS ranking can cause the query planner to choose a bad plan (sequential scan instead of index).

**Prevention:**
1. Add `meeting_date` as a denormalized column on the search-facing tables (motions, key_statements, document_sections) — OR —
2. Filter by date AFTER the initial hybrid search, not inside the RPC. Fetch top N results from RPC, then filter by date in application code.
3. Option 2 is simpler but may return fewer results than requested. Option 1 is correct but requires a migration + backfill.
4. Start with option 2 (post-filter) and only denormalize if users report too few results.

**Phase:** Address in the search filters phase.

### Pitfall 5: Source Content Preview Inflating SSE Payload

**What goes wrong:** Enriching source objects with `content_preview` (200 chars of rendered content) increases the `sources` SSE event size. With 20 sources, each having a 200-char preview, that's 4KB of additional data. Combined with title, URL, type, and date, the sources event could reach 10-15KB. This delays the `sources` event delivery and increases client-side JSON parse cost.

**Prevention:**
1. Cap `content_preview` at 150 characters
2. Send plain text previews, not markdown (strip markdown syntax server-side)
3. Only include `content_preview` for the first 10 sources (the rest are unlikely to be viewed)
4. Lazy-load full content if user clicks "View more" in the preview card

**Phase:** Address when enriching source objects.

---

## Moderate Pitfalls

### Pitfall 6: Cached Answers Using Old Citation Format

**What goes wrong:** The search_results_cache table stores full AI answers with 30-day TTL. Existing cached answers use `[1][2]` citation format. After deploying v1.6 with `[sources:1,3,7]` format, cached answers render with the old format. The frontend needs to handle both.

**Prevention:**
1. Support both formats in the citation parser (detect `[sources:` prefix)
2. Don't bust the cache — old answers are still valid, just with simpler citations
3. New answers will naturally replace old ones as the cache expires

### Pitfall 7: Filter State Lost on Mode Switch

**What goes wrong:** User applies time filter on keyword results, then types a question (AI mode triggered by intent detection). The mode switches from keyword to AI, and the time filter disappears because AI mode doesn't use URL filter params. User is confused about where their filters went.

**Prevention:**
1. Keep filter UI visible in both modes but visually indicate which filters apply
2. For AI mode, show a note: "AI searches all time periods by default. Use keywords for filtered results."
3. Or: pass time context to the AI agent as a system constraint (not user-facing, but influences search tool date params)
4. Simplest: only show filters in keyword mode, hide in AI mode. Clear and honest.

### Pitfall 8: Follow-up Click Losing Conversation Context

**What goes wrong:** User gets an AI answer, clicks a follow-up question. The follow-up should carry conversation context (for the 5-turn memory feature). But if the follow-up triggers a page navigation (new URL), the conversation context in React state is lost.

**Prevention:**
1. Follow-up clicks should NOT navigate — they should update the search input and submit inline, preserving the conversation state in React component state
2. Pass the conversation context via the `context` query param or form data to the API
3. The current implementation already handles this — verify it still works after the UI redesign

### Pitfall 9: Sort by Date Losing Relevance Ranking

**What goes wrong:** When user sorts by "Newest first", the RRF relevance ranking is discarded in favor of date ordering. Results may be recent but irrelevant. Users expect time-sorted results to still be relevant to their query.

**Prevention:**
1. When sorting by date, still apply the search query as a filter (only return matches, but order by date)
2. Don't show RRF rank_score when sorting by date (it's meaningless in that context)
3. Consider a hybrid: sort by date but only among results above a relevance threshold

---

## Minor Pitfalls

### Pitfall 10: Badge Click Area Too Small on Mobile
Citation badges like `[3 sources]` need minimum 44x44px touch targets per WCAG guidelines. A small inline badge with 12px font is too small to tap reliably.

**Prevention:** Add sufficient padding to the badge component. Use `min-h-[44px] min-w-[44px]` or similar touch target sizing.

### Pitfall 11: Popover Z-Index Conflicts
Radix Popover uses a Portal by default, which renders at the document root. If other portaled elements (dialogs, toasts) are open simultaneously, z-index conflicts cause popovers to appear behind other elements.

**Prevention:** Use Radix's `z-50` or higher for citation popovers. Test with multiple UI layers open.

### Pitfall 12: Search Filter URL Params Conflicting with Existing Params
The search route already uses `q`, `mode`, `type`, `id`, `context` as query params. Adding `after`, `before`, `sort` must not conflict. The `type` param is already used for content type filtering.

**Prevention:** Audit existing params before adding new ones. Use `dateAfter`/`dateBefore` to avoid any ambiguity.

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|---------------|------------|
| Backend foundation | #4 (time filter perf) | Post-filter by date initially, denormalize later if needed |
| Backend foundation | #5 (source preview payload) | Cap preview length, plain text only |
| Citation UX | #1 (Gemini format unreliability) | Robust regex + fallback parser + backend normalization |
| Citation UX | #3 (streaming mid-chunk splits) | Buffer-based parser, not per-chunk |
| Citation UX | #6 (cached old format) | Support both formats in parser |
| Source preview cards | #2 (mobile popover positioning) | Dialog/Drawer on touch devices |
| Source preview cards | #10 (badge touch targets) | 44px minimum touch area |
| Search filters | #7 (filter state on mode switch) | Only show filters in keyword mode |
| Search filters | #9 (date sort vs relevance) | Filter by query, sort by date |
| Follow-ups | #8 (context loss on navigation) | Inline submission, no page nav |

---

*Last updated: 2026-02-28*
