# Phase 8: Unified Search & Hybrid RAG - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Single unified search page that replaces the old separate Search and Ask pages. Detects intent (keyword lookup vs natural language question) and serves either a ranked results list or a streaming AI-generated answer with inline citations. Supports follow-up questions with conversation memory. Existing /search and /ask routes redirect here.

</domain>

<decisions>
## Implementation Decisions

### Search page layout
- Perplexity-style UI: single search input bar, tabbed results (AI Answer tab, Search Results tab)
- Separate /search route (not embedded in home page); home page search bar navigates to /search with query
- Keyword results displayed as a unified ranked list (not grouped by type) with filter controls for content type
- Result card design: Claude's discretion — choose appropriate density and information display for civic data

### Intent detection UX
- Intent detection approach: Claude's discretion on automatic keyword-vs-question classification
- Ambiguous queries default to AI answer tab (with search results available in the other tab)
- AI answer streams in word-by-word (streaming response, like Perplexity/ChatGPT)
- URL includes query parameter plus unique identifier for cached AI results — shareable links don't re-generate answers

### AI answer presentation
- Rich markdown formatting: headers, bullet points, bold text in AI answers
- Inline numbered citations [1], [2] with hover preview tooltips showing source content
- Source cards are typed by content type: document sections, motions, transcript segments, key statements — each with appropriate icons and metadata
- Confidence indicator shown (e.g., "High confidence — based on 8 sources")

### Conversation flow
- Suggested follow-up questions: 2-3 contextual chips shown below AI answers
- No hard turn cap — Claude's discretion on conversation length management
- Auto-clear conversation context when new query topic is unrelated; manual "New search" clear button also available
- Follow-up UI pattern: Claude's discretion on chat thread vs in-place replacement

### Claude's Discretion
- Result card design (density, metadata shown, preview depth)
- Intent detection algorithm and classification approach
- Follow-up conversation UI pattern (chat thread vs in-place with breadcrumbs)
- Conversation length management strategy (no hard turn cap)
- Filter control design and available filter options
- How the tab switching between AI Answer and Search Results works visually

</decisions>

<specifics>
## Specific Ideas

- "I like the Perplexity model" — use Perplexity as the primary UI reference for the search experience
- Streaming AI responses — real-time word-by-word generation, not skeleton-then-reveal
- Citation hover previews — user hovers over [1] and sees a tooltip with the source content
- Shareable search URLs with cached AI results — `/search?q=park+development&id=abc123` so shared links show the answer without re-generating

</specifics>

<deferred>
## Deferred Ideas

- **Save and share conversations** — logged-in users can save AI conversations and share them with others. Requires persistence, user account features, shareable URLs for full conversations (not just individual queries). Own phase.
- **Search history for logged-in users** — UI showing previous searches for authenticated users. Tied to save/share capability above.

</deferred>

---

*Phase: 08-unified-search-hybrid-rag*
*Context gathered: 2026-02-17*
