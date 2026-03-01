# Feature Landscape: v1.6 Search Experience

**Domain:** AI search UX — citation display, search controls, agent transparency, follow-up emphasis
**Researched:** 2026-02-28
**Comparable products:** Perplexity, Kagi, Google AI Overviews, Phind, You.com, SearchGPT

---

## Executive Summary

Modern AI search products have converged on a set of UX patterns that ViewRoyal.ai's current search lacks. Perplexity pioneered inline source citations with hover preview cards. Kagi brought sort/filter controls (especially time filtering) to AI-augmented search. Both emphasize follow-up suggestions as first-class UI elements, not afterthoughts. The current ViewRoyal.ai search has the backend infrastructure (8 RAG tools, hybrid search, streaming SSE) but the frontend presents results in a basic format: numbered citations `[1][2][3]`, a flat source list, and small follow-up chips at the bottom.

The v1.6 milestone transforms the presentation layer to match modern expectations without changing the core search architecture.

---

## Table Stakes Features

### TS-1: Grouped Citation Badges Per Sentence

| Aspect | Detail |
|--------|--------|
| **What** | Replace individual citation numbers `[1][2][3]` with grouped badges per sentence/claim showing source count. E.g., a sentence about a bylaw decision ends with a `[3 sources]` badge. Hovering (desktop) or tapping (mobile) the badge opens a preview card showing each source with paging. |
| **Why expected** | Perplexity, Google AI Overviews, and SearchGPT all use inline citations. Individual numbered references like `(3)(16)` are confusing — users don't know what the numbers mean without scrolling to the source list. Grouped counts are scannable: "this claim has 3 supporting sources." |
| **Complexity** | High — requires changes to: (1) SSE protocol to emit structured citation markers, (2) AI prompt to generate grouped citations, (3) frontend citation parser, (4) new Popover/Drawer components for preview cards with paging. |
| **Dependencies** | TS-3 (source preview content), TS-5 (source panel redesign) |
| **Notes** | The backend currently generates `[1][2]` style numbered refs in the final_answer text. v1.6 needs to change the synthesis prompt to emit `[sources:1,3,7]` markers instead, which the frontend parses into grouped badge components. Each badge binds to a Popover showing the referenced sources with left/right paging. |

### TS-2: Source Preview Cards (Desktop Hover + Mobile Tap)

| Aspect | Detail |
|--------|--------|
| **What** | When a user hovers (desktop) or taps (mobile) a citation badge, a preview card appears showing one source at a time with: title, content snippet (with markdown rendering for documents), source type indicator, meeting date, and a link to the full item. Paging arrows navigate between sources in the group. |
| **Why expected** | Perplexity's source cards are the defining UX pattern of modern AI search. Users expect to verify claims without leaving the answer. Mobile support is critical — hover doesn't work on touch devices, so tap-to-open with a bottom sheet/drawer is the mobile equivalent. |
| **Complexity** | Medium — Radix Popover (desktop) + Dialog/Drawer (mobile) with a pager component. The sources data already exists in the SSE stream. |
| **Dependencies** | TS-1 (badge triggers the card) |
| **Notes** | Perplexity shows: favicon, domain, title, snippet. For ViewRoyal.ai, show: source type icon (motion, transcript, document, key statement, bylaw), title, date, content preview (rendered markdown for documents, plain text for others), and a "View source" link. Current source objects need enrichment with `content_preview` field. |

### TS-3: Source Panel Collapsed by Default

| Aspect | Detail |
|--------|--------|
| **What** | The sources list below the AI answer should be collapsed by default, showing only a count header like "16 sources used". Clicking expands the full list. |
| **Why expected** | Perplexity collapses sources into a compact row of favicons. Google AI Overviews hides sources behind a "Show sources" link. The full source list is reference material, not the primary reading experience. Showing it expanded pushes follow-ups below the fold. |
| **Complexity** | Low — wrap existing source list in Radix Collapsible with a toggle header. |
| **Dependencies** | None |

### TS-4: Search Filter Controls (Time + Type + Sort)

| Aspect | Detail |
|--------|--------|
| **What** | On keyword search results, add filter controls: (1) Time range dropdown (Any time, Past week, Past month, Past year, Custom), (2) Content type toggle chips (Motions, Documents, Statements, Transcripts), (3) Sort dropdown (Relevance, Newest first, Oldest first). Filters persist in URL search params. |
| **Why expected** | Kagi, Google, and every major search engine offer time filtering. For civic search, time filtering is especially important: "What happened about [topic] in the last month?" Currently, the only way to filter by time is to phrase it as an AI question. Keyword results have no filter controls at all. |
| **Complexity** | Medium — requires: (1) UI filter components, (2) passing filter params to hybrid search RPCs, (3) Supabase RPC modifications to accept date range and sort params, (4) URL search param state management. |
| **Dependencies** | None — independent of citation UX changes |
| **Notes** | Kagi's time filters are: Any time, Past day, Past week, Past month, Past year, Custom range. For civic search, "Past year" and "Custom range" are most useful. Content type filters map to the existing `type` query param already supported by the API. Sort requires changes to the RRF scoring in hybrid search RPCs. |

### TS-5: Document Markdown Rendering in Source Previews

| Aspect | Detail |
|--------|--------|
| **What** | Source preview cards for document sections should render the summary/content as formatted markdown (headings, lists, tables) instead of plain text. Use the existing `MarkdownContent` component. |
| **Why expected** | Document sections have rich markdown content (from Gemini extraction). Showing raw markdown text with `##` headers and `*` bullets looks broken. The document viewer already renders this properly — source previews should match. |
| **Complexity** | Low — reuse `MarkdownContent` component with truncated content. |
| **Dependencies** | TS-2 (source preview card is the container) |

---

## Differentiators

### D-1: Agent Reasoning Transparency

| Aspect | Detail |
|--------|--------|
| **What** | Improve the streaming reasoning display: (1) Thoughts explain WHY the agent is choosing a tool, not just what tool it's calling, (2) Tool result summaries show what was found and why it matters, not raw observation text, (3) Each reasoning step has a clear icon and label per tool type. |
| **Why differentiating** | Perplexity shows a "Searching..." animation but hides the reasoning. Phind shows tool calls with syntax highlighting. ViewRoyal.ai can differentiate by being transparent about the civic search process: "Searching motions about [topic]... Found 5 motions, 3 from 2025. Now checking what councillors said..." This builds trust in civic context. |
| **Complexity** | Medium — requires: (1) Better Gemini orchestration prompts for structured reasoning, (2) Structured tool observation events in SSE, (3) Frontend styled reasoning cards. |
| **Dependencies** | None — independent of citation changes |

### D-2: Perplexity-style Follow-up Suggestions

| Aspect | Detail |
|--------|--------|
| **What** | Follow-up suggestions appear as a prominent collapsible "Related" section below the answer with pill-shaped buttons. Clicking a follow-up populates the search input and triggers a new search with conversation context. |
| **Why differentiating** | Perplexity's follow-ups are a key engagement driver — they keep users exploring. The current small chips at the bottom of the answer are easy to miss. Prominent follow-ups guide users to deeper civic understanding: "How did the vote go?" → "What happened after?" → "Is there a follow-up meeting?" |
| **Complexity** | Low — CSS/component redesign of existing follow-up rendering. The backend already generates 2-3 follow-ups. |
| **Dependencies** | None |

### D-3: Bylaw Search in RAG Agent

| Aspect | Detail |
|--------|--------|
| **What** | Add a `search_bylaws` tool to the RAG agent's toolkit. Bylaws have embeddings and tsvector indexes but are not searchable by the agent — only motions, transcripts, agenda items, key statements, documents, and matters are. |
| **Why differentiating** | Citizens frequently ask about specific bylaws ("What does Bylaw 1540 say about setbacks?"). The agent currently has to find bylaws indirectly through motions or documents. A direct bylaw search tool returns better results and enables the agent to cite specific bylaw text. |
| **Complexity** | Low — mirror the existing `search_motions` tool pattern. Needs a `match_bylaws` Supabase RPC (copy from existing `match_motions` pattern). |
| **Dependencies** | None |

---

## Anti-Features (Deliberately NOT Building)

### AF-1: Real-time Search Suggestions / Autocomplete
**Why not:** Requires a fast prefix-search index and client-side debounced queries. The search volume doesn't justify the complexity. Users type their query and press Enter.

### AF-2: Personalized Search Ranking
**Why not:** User search history tracking raises privacy concerns in a civic context. Relevance should be the same for all citizens.

### AF-3: Image/Chart Search
**Why not:** Document images are stored in R2 but not indexed for search. Adding visual search is a separate capability, not part of improving existing text search UX.

### AF-4: Voice Search
**Why not:** Browser speech-to-text APIs are unreliable and add accessibility complexity. The text input is sufficient.

### AF-5: AI Answer Editing/Regeneration
**Why not:** "Regenerate" buttons encourage users to keep trying until they get a desired answer. Civic information should be consistent — the same question should produce the same answer.

---

## Feature Dependencies

```
TS-1 (Citation badges) → TS-2 (Source preview cards) → TS-5 (Markdown in previews)
TS-3 (Source panel collapse) — Independent
TS-4 (Search filters) — Independent
D-1 (Agent reasoning) — Independent
D-2 (Follow-up emphasis) — Independent
D-3 (Bylaw search tool) — Independent

Build order implication:
- Backend changes first (SSE protocol, bylaw tool, filter params)
- Then frontend UX (citation parsing, preview cards, filters, follow-ups)
```

---

## Feature-to-File Mapping

| Feature | Primary Files | Change Type |
|---------|--------------|-------------|
| TS-1 Citation badges | `rag.server.ts`, `api.search.tsx`, `search.tsx` | SSE protocol + frontend parser |
| TS-2 Source preview cards | `search.tsx`, new `SourcePreviewCard` component | New component |
| TS-3 Source panel collapse | `search.tsx` | Wrap in Collapsible |
| TS-4 Search filters | `hybrid-search.server.ts`, `api.search.tsx`, `search.tsx` | RPC params + UI controls |
| TS-5 Markdown previews | `search.tsx`, reuse `MarkdownContent` | Component reuse |
| D-1 Agent reasoning | `rag.server.ts`, `search.tsx` | Prompt + SSE events + UI |
| D-2 Follow-up emphasis | `search.tsx` | CSS/component redesign |
| D-3 Bylaw search | `rag.server.ts`, new Supabase RPC | New tool + RPC |

---

*Last updated: 2026-02-28*
