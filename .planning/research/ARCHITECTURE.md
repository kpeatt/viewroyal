# Architecture Patterns: v1.6 Search Experience

**Domain:** Citation UX overhaul, search filter controls, RAG agent transparency improvements
**Researched:** 2026-02-28

---

## 1. Current Architecture Summary

### RAG Agent (rag.server.ts — 1,344 lines)

```
User Query → Intent Classifier (keyword/question)
  ↓ keyword → Hybrid Search (hybrid-search.server.ts)
  ↓ question → RAG Agent Loop (rag.server.ts)
    ↓
    Orchestration Phase (Gemini):
      thought → tool_call → tool_observation → repeat (max 6 steps)
    ↓
    Synthesis Phase (Gemini streaming):
      Build evidence [1]..[N] → Stream final answer with [1][2] citations
      → Generate follow-ups → Cache answer (30-day TTL)
    ↓
    SSE Events → Frontend (search.tsx)
```

### 8 Current Search Tools

| Tool | Search Type | Table |
|------|------------|-------|
| search_motions | Vector semantic | motions |
| search_transcript_segments | Full-text (tsvector) | transcript_segments |
| search_matters | Vector semantic | matters |
| search_agenda_items | Full-text (tsvector) | agenda_items |
| search_key_statements | Vector semantic | key_statements |
| search_document_sections | Hybrid (vec+FTS) | document_sections |
| get_voting_history | SQL aggregates | votes |
| get_statements_by_person | SQL + aliases | key_statements |

**Missing:** Bylaws (have embeddings + tsvector but no agent tool)

### Streaming SSE Protocol (Current)

```
data: { type: "thought", thought: "..." }
data: { type: "tool_call", name: "search_motions", args: {...} }
data: { type: "tool_observation", name: "search_motions", result: "Found 5 results" }
data: { type: "final_answer_chunk", chunk: "Council decided..." }
data: { type: "sources", sources: [...] }
data: { type: "suggested_followups", followups: ["Q1", "Q2", "Q3"] }
data: { type: "cache_id", id: "abc12345" }
data: { type: "done" }
```

### Keyword Search (hybrid-search.server.ts — 351 lines)

```
Query → generateQueryEmbedding() → OpenAI 384-dim vector
  ↓
  Parallel RPC calls:
    hybrid_search_motions(query_text, query_embedding, ...)
    hybrid_search_key_statements(...)
    hybrid_search_document_sections(...)
    fts_search_transcript_segments(...)  (FTS only, no embeddings)
  ↓
  Reciprocal Rank Fusion (k=50) → UnifiedSearchResult[]
```

### Search UI (search.tsx — 675 lines)

```
URL params: ?q=...&mode=keyword|ai&type=motion|key_statement|...
  ↓
  Keyword mode: JSON response → result cards with rank_score
  AI mode: SSE stream → streaming answer with [1][2] citations
    → Source list (expanded)
    → Follow-up chips (small, bottom)
```

---

## 2. Architecture for v1.6 Features

### Feature 1: Grouped Citation Badges + Source Preview Cards

**Current state:** Gemini synthesis generates text with `[1]`, `[2]`, etc. Frontend regex-parses these and renders them as superscript numbers. Sources render as a numbered list below the answer.

**v1.6 approach:** Change the citation pipeline end-to-end.

**Backend changes (rag.server.ts):**

1. **Synthesis prompt change:** Instead of `[1]`, instruct Gemini to emit `[sources:1,3,7]` markers — a comma-separated list of source indices per claim/sentence.

2. **Source enrichment:** Current `NormalizedSource` objects include `title`, `type`, `url`, `snippet`. Add `content_preview` (first 200 chars of rendered content) and `meeting_date` for temporal context.

3. **SSE protocol:** The `sources` event already sends the full source array. No change needed for the source data itself. The `final_answer_chunk` events now contain `[sources:X,Y,Z]` markers instead of `[1][2]`.

**Frontend changes (search.tsx + new components):**

1. **Citation parser:** Replace the current `[N]` regex with a `[sources:X,Y,Z]` parser that:
   - Extracts source index arrays per marker
   - Renders a `<CitationBadge count={3} sourceIds={[1,3,7]} />` component inline
   - The badge shows `[3 sources]` text

2. **CitationBadge component:**
   - Desktop: `onMouseEnter` opens Radix Popover with `SourcePreviewCard`
   - Mobile: `onClick` opens Radix Dialog (bottom sheet) with `SourcePreviewCard`
   - Detect mobile via `matchMedia('(hover: none)')` or pointer-type check

3. **SourcePreviewCard component:**
   - Shows one source at a time with paging (left/right arrows or swipe)
   - Content: type icon, title, date, content preview (markdown-rendered for documents), "View source" link
   - Pager: `1 of 3` indicator with arrow buttons

**Data flow:**

```
Gemini synthesis → "Council approved [sources:1,3] the rezoning [sources:2,4,5]."
  ↓ SSE stream
Frontend parser → [
  { text: "Council approved ", citations: null },
  { text: "", citations: { count: 2, ids: [1,3] } },
  { text: " the rezoning ", citations: null },
  { text: "", citations: { count: 3, ids: [2,4,5] } },
  { text: ".", citations: null }
]
  ↓ render
"Council approved [2 sources] the rezoning [3 sources]."
```

### Feature 2: Search Filter Controls

**Current state:** Keyword search has a `type` query param for content type filtering (already supported by the API). No time filtering, no sort control.

**Backend changes:**

1. **hybrid-search.server.ts:** Add `afterDate` and `beforeDate` params to all hybrid search functions. Pass through to Supabase RPCs.

2. **Supabase RPCs:** Modify `hybrid_search_motions`, `hybrid_search_key_statements`, `hybrid_search_document_sections` to accept `after_date` and `before_date` params. Add `WHERE meeting_date >= after_date` clauses (joining through meeting_id where needed).

3. **Sort:** Add `sort` param to hybrid search. Options: `relevance` (default — RRF score), `newest` (meeting_date DESC), `oldest` (meeting_date ASC). When sorting by date, skip RRF and sort directly.

4. **api.search.tsx:** Accept new query params: `after`, `before`, `sort`.

**Frontend changes (search.tsx):**

1. **FilterBar component:** Renders above keyword search results:
   - Time range `Select`: Any time, Past week, Past month, Past year, Custom
   - Content type chips: Motions, Documents, Statements, Transcripts (toggle on/off)
   - Sort `Select`: Relevance, Newest, Oldest

2. **URL state:** All filter values stored in URL search params via `useSearchParams()`. Changing a filter triggers a new search via form resubmission or `navigate()`.

3. **Custom date range:** When "Custom" is selected, show two date inputs (from/to).

### Feature 3: Agent Reasoning Improvements

**Backend changes (rag.server.ts):**

1. **Orchestration prompt:** Add instructions for Gemini to explain reasoning:
   - Instead of: `"I'll search for motions about this topic"`
   - Generate: `"Looking for official council decisions on this topic — motions will show what was voted on and the outcome."`

2. **Structured tool observations:** After each tool call, generate a summary:
   ```
   { type: "tool_observation",
     name: "search_motions",
     summary: "Found 5 motions about rezoning, 3 from 2025",
     count: 5,
     relevance: "high" }
   ```
   Instead of raw result text dumps.

**Frontend changes (search.tsx):**

1. **Reasoning cards:** Each thought/tool_call/observation renders as a styled card with:
   - Tool-type icon (Search, Vote, User, FileText, Scale)
   - Concise reasoning text
   - Result summary with count badge

### Feature 4: Bylaw Search Tool

**Backend changes:**

1. **Supabase RPC:** Create `match_bylaws(query_embedding, match_threshold, match_count)` mirroring `match_motions` pattern.

2. **rag.server.ts:** Add `search_bylaws` tool:
   - Parameters: `query` (search text), `after_date` (optional)
   - Generates embedding, calls `match_bylaws` RPC
   - Returns bylaw number, title, plain_english_summary, matching text

3. **Tool description for Gemini:** "Search bylaws for specific regulations, zoning rules, fees, or legal requirements. Use when the question asks about rules, regulations, permitted uses, or bylaw provisions."

### Feature 5: Source Panel Collapse + Follow-up Emphasis

**Frontend changes (search.tsx):**

1. **Source panel:** Wrap in Radix `Collapsible`:
   ```
   <Collapsible defaultOpen={false}>
     <CollapsibleTrigger>
       16 sources used ▸
     </CollapsibleTrigger>
     <CollapsibleContent>
       [existing source list]
     </CollapsibleContent>
   </Collapsible>
   ```

2. **Follow-up section:** Redesign as a prominent "Related questions" section:
   - Collapsible, expanded by default
   - Pill-shaped buttons, full-width on mobile
   - Each pill shows the follow-up question text
   - Clicking fills the search input and submits with conversation context

---

## 3. Component Boundaries

### New Components

| Component | File | Responsibility |
|-----------|------|---------------|
| `CitationBadge` | `components/search/CitationBadge.tsx` | Renders `[N sources]` badge, triggers popover/drawer |
| `SourcePreviewCard` | `components/search/SourcePreviewCard.tsx` | Single source preview with metadata + content |
| `SourcePager` | `components/search/SourcePager.tsx` | Pager wrapping SourcePreviewCard for multi-source badges |
| `SearchFilters` | `components/search/SearchFilters.tsx` | Time, type, sort filter controls |
| `ReasoningStep` | `components/search/ReasoningStep.tsx` | Styled thought/tool_call/observation card |
| `FollowUpSection` | `components/search/FollowUpSection.tsx` | Perplexity-style follow-up pills |

### Modified Components/Files

| File | Change |
|------|--------|
| `search.tsx` | Citation parsing, source panel collapse, follow-up redesign, filter integration |
| `rag.server.ts` | Synthesis prompt, tool observation formatting, bylaw tool, reasoning prompts |
| `hybrid-search.server.ts` | Date filtering, sort params |
| `api.search.tsx` | New query params (after, before, sort), updated SSE events |
| `embeddings.server.ts` | No change (embedding generation unchanged) |

---

## 4. SSE Protocol Changes (v1 → v1.6)

| Event | v1 | v1.6 |
|-------|-----|------|
| `thought` | `{ thought: string }` | `{ thought: string, intent?: string }` |
| `tool_call` | `{ name: string, args: object }` | `{ name: string, args: object, reason?: string }` |
| `tool_observation` | `{ name: string, result: string }` | `{ name: string, summary: string, count?: number }` |
| `final_answer_chunk` | Text with `[1][2]` refs | Text with `[sources:1,3,7]` grouped markers |
| `sources` | `Source[]` | `Source[]` with added `content_preview`, `meeting_date` |
| `suggested_followups` | `string[]` | `string[]` (unchanged) |

**Backwards compatibility:** The cached answers (30-day TTL) use the old format. Either: (a) bust the cache on deploy, or (b) support both formats in the frontend parser (detect `[sources:` vs `[N]`).

---

## 5. Build Order

### Phase 1: Backend Foundation
- Bylaw search tool + RPC
- Enriched source objects (content_preview, meeting_date)
- Search filter params (date range, sort) in RPCs + API
- Agent reasoning prompt improvements

### Phase 2: Citation UX
- SSE protocol update (grouped citation markers)
- Frontend citation parser
- CitationBadge + SourcePreviewCard + SourcePager components
- Mobile drawer variant
- Document markdown rendering in previews

### Phase 3: Search Controls + Polish
- SearchFilters component (time, type, sort)
- URL param state management
- Source panel collapse
- Follow-up section redesign
- Reasoning step cards

**Why this order:**
- Phase 1 is pure backend — no UI changes, can be tested independently
- Phase 2 depends on Phase 1's enriched sources and updated SSE protocol
- Phase 3 is independent UI work that can build on the styled component patterns from Phase 2

---

## 6. Patterns to Follow

### Pattern 1: Responsive Interaction (Hover vs Tap)
Use `@media (hover: hover)` to detect devices with hover capability. Desktop gets Popover with hover trigger. Touch devices get Dialog/Drawer with tap trigger. One component, two interaction modes.

### Pattern 2: URL-Driven Filter State
All search filters live in URL search params. Changing a filter triggers navigation (not client state). This preserves SSR, enables shareable filtered URLs, and follows the React Router 7 pattern used throughout the app.

### Pattern 3: Streaming Citation Parsing
Parse citation markers incrementally as `final_answer_chunk` events arrive. Don't wait for the full answer — render citation badges as soon as a `[sources:...]` marker is complete. This maintains the streaming feel.

### Pattern 4: Source-Indexed Architecture
Sources are indexed by position in the sources array (0-based internally, 1-based in display). Citation markers reference these indices. The sources array is built during the orchestration phase and finalized before synthesis begins.

---

## 7. Anti-Patterns to Avoid

### Anti-Pattern 1: Client-Side Re-Ranking
Don't re-rank or re-sort search results on the client. All ranking (RRF, date sort) must happen in Supabase RPCs. Client-side sorting creates inconsistency with pagination and breaks SSR.

### Anti-Pattern 2: Hover-Only Source Cards
Don't rely on CSS `:hover` for source preview cards. Mobile users can't hover. Always provide a click/tap interaction path. Use Radix Popover's `onOpenChange` which handles both hover and click.

### Anti-Pattern 3: Inline Content Fetching for Source Previews
Don't fetch source content when a citation badge is hovered. The content must be included in the SSE `sources` event. Network requests on hover create latency and flicker. Pre-load all source previews with the answer.

### Anti-Pattern 4: Changing Intent Detection
Don't modify the intent classifier for v1.6. It works well. The improvements are all in how results are displayed, not how queries are classified.

---

*Last updated: 2026-02-28*
