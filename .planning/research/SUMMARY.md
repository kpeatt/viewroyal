# Project Research Summary

**Project:** ViewRoyal.ai v1.6 — Search Experience (Citation UX, Search Controls, Agent Transparency)
**Domain:** AI search UX — Perplexity-style citations, Kagi-style filters, RAG agent improvements
**Researched:** 2026-02-28
**Confidence:** HIGH

## Executive Summary

ViewRoyal.ai v1.6 transforms the search and RAG experience from functional to polished. The backend infrastructure is strong (8 search tools, hybrid RRF, streaming SSE, 5-turn memory) but the frontend presents results in a basic format that falls short of modern AI search expectations set by Perplexity, Kagi, and Google AI Overviews. The work is primarily frontend UX + prompt engineering, with targeted backend additions (bylaw search tool, filter params, enriched source objects).

Zero new npm packages are needed. All components use existing Radix/shadcn primitives (Popover, Dialog, Select, Collapsible) already available in the project.

---

## Key Findings

### Recommended Stack

No new dependencies. The existing stack covers all v1.6 needs:
- **Radix Popover** (desktop citation cards) + **Dialog** (mobile bottom sheet) — both already available via shadcn
- **Radix Select** — time range and sort dropdowns for search filters
- **Radix Collapsible** — source panel collapse, follow-up section
- **MarkdownContent component** — reused for document section previews in source cards
- **Existing SSE infrastructure** — protocol extensions, not replacements

**What NOT to add:** `@floating-ui/react` (Radix uses it internally), `react-virtualized` (max ~20 sources), `date-fns` (native Date + Intl sufficient), `framer-motion` (CSS transitions + Radix data attributes sufficient).

### Expected Features

**Table stakes (must have):**
- **TS-1: Grouped citation badges** — `[3 sources]` per sentence replacing individual `[1][2][3]` numbers
- **TS-2: Source preview cards** — Popover on desktop hover, Dialog/Drawer on mobile tap, with source paging
- **TS-3: Source panel collapsed** — Count header ("16 sources used"), expandable list
- **TS-4: Search filter controls** — Time range, content type, sort (keyword results only)
- **TS-5: Document markdown in previews** — Render document section content with `MarkdownContent`

**Differentiators (should have):**
- **D-1: Agent reasoning transparency** — Better thought explanations, structured tool result summaries
- **D-2: Perplexity-style follow-ups** — Prominent collapsible "Related" section with pill buttons
- **D-3: Bylaw search tool** — Direct bylaw search in RAG agent (bylaws have embeddings but no agent tool)

### Architecture Approach

End-to-end citation pipeline change:
1. **Backend:** Gemini synthesis prompt emits `[sources:1,3,7]` grouped markers → enriched source objects with `content_preview` and `meeting_date` → structured tool observation summaries
2. **Frontend:** Buffer-based citation parser → `CitationBadge` components inline → `SourcePreviewCard` in Popover (desktop) / Dialog (mobile) → pager for multi-source badges
3. **Search filters:** Date range + sort params passed to hybrid search RPCs → `SearchFilters` component with URL param state
4. **Bylaw tool:** `match_bylaws` Supabase RPC + `search_bylaws` tool in rag.server.ts

New components: `CitationBadge`, `SourcePreviewCard`, `SourcePager`, `SearchFilters`, `ReasoningStep`, `FollowUpSection`

### Critical Pitfalls

1. **Gemini citation format unreliability** — LLMs don't reliably follow formatting instructions. Parser must handle `[sources:1,3,7]`, `[1][2][3]`, `[1,3,7]`, and variations. Backend post-processing to normalize format before streaming recommended.

2. **Streaming citation parsing mid-chunk** — SSE chunks split at arbitrary boundaries. `[sources:1,3,7]` could split across two chunks. Must use buffer-based parser with state machine, not per-chunk regex.

3. **Mobile popover positioning** — Citation badges near viewport edges cause popover overflow/clipping. Use Dialog/Drawer (bottom sheet) on touch devices instead of Popover.

4. **Time filter performance** — Adding `WHERE meeting_date >= $date` to hybrid search RPCs requires joining through intermediate tables. Start with post-filter (filter results after RPC returns), denormalize `meeting_date` onto search tables only if needed.

5. **Source preview payload inflation** — 20 sources x 200-char previews = 4KB+ additional SSE data. Cap previews at 150 chars, plain text only.

---

## Implications for Roadmap

### Phase 1: Backend Foundation
Add bylaw search tool + RPC, enrich source objects with content_preview and meeting_date, add date/sort params to hybrid search RPCs + API endpoint, improve agent reasoning prompts. Pure backend — no UI changes, testable independently.

### Phase 2: Citation UX Overhaul
SSE protocol update (grouped citation markers), frontend buffer-based citation parser, CitationBadge + SourcePreviewCard + SourcePager components, mobile Dialog variant, document markdown rendering in previews.

### Phase 3: Search Controls + Polish
SearchFilters component (time, type, sort), URL param state management, source panel collapse, follow-up section redesign with Perplexity-style pills, reasoning step cards for agent transparency.

**Build order rationale:** Backend changes must land first (Phase 1) so citation UX (Phase 2) has enriched sources and the new SSE protocol to consume. Search filters (Phase 3) are independent of citations but benefit from building on the styled component patterns established in Phase 2.

### Research Flags
- **Phase 1:** Verify `bylaws` table has `embedding` column populated (expected from v1.0 pipeline). Test `match_bylaws` RPC with real queries.
- **Phase 2:** Test Gemini citation format reliability with 20+ queries across different civic topics. Build resilient parser.
- **Phase 3:** Profile hybrid search RPC performance with date filters before deciding on denormalization.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new packages; all Radix/shadcn components verified available |
| Features | HIGH | Based on Perplexity/Kagi UX analysis + user-stated requirements |
| Architecture | HIGH | Based on direct codebase analysis of rag.server.ts, search.tsx, hybrid-search.server.ts |
| Pitfalls | HIGH | 5 critical, 4 moderate, 3 minor — all actionable with specific prevention strategies |

---

*Research completed: 2026-02-28*
*Ready for roadmap: yes*
