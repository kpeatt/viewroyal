# Technology Stack: v1.6 Search Experience

**Project:** ViewRoyal.ai v1.6 — Perplexity-style citations, Kagi-style search controls, RAG agent transparency
**Researched:** 2026-02-28
**Scope:** Stack changes/additions for citation hover cards, search filter controls, mobile popovers, improved agent reasoning display, bylaw search tool
**Out of scope:** Existing validated stack (React Router 7 SSR, Tailwind CSS 4, shadcn/ui + Radix UI, Supabase PostgreSQL with pgvector, Gemini, OpenAI embeddings, streaming SSE) — all unchanged.

---

## Executive Finding: Minimal New Dependencies

This milestone requires **one potential new component** from shadcn/ui (`Popover` if not already installed) and zero new npm packages. The work is component-level UX redesign, not library-level.

**Confidence:** HIGH — verified by auditing existing `package.json`, the search route, RAG service, and feature requirements against current capabilities.

---

## Existing Stack Relevant to This Milestone

### Already Installed and Sufficient

| Technology | Version | Role in v1.6 | Status |
|------------|---------|--------------|--------|
| `@radix-ui/react-popover` | Already in shadcn deps | Citation hover cards, source preview popovers | Already available via shadcn/ui |
| `@radix-ui/react-dialog` | Already in shadcn deps | Mobile source preview (sheet/drawer pattern) | Already available |
| `@radix-ui/react-select` | Already in shadcn deps | Sort/filter dropdowns for search controls | Already available |
| `@radix-ui/react-tabs` | ^1.1.13 | Already used; potential for source pager tabs | Already installed |
| `@radix-ui/react-collapsible` | Already in shadcn deps | Collapsible sources panel, follow-up section | Already available |
| `lucide-react` | ^0.562.0 | Icons for search filters, source types, navigation | Already installed |
| `tailwindcss` | ^4.1.13 | All styling for new components | Already the CSS engine |
| `class-variance-authority` | ^0.7.1 | Variant styling for citation badges, filter chips | Already installed |
| `marked` | ^17.0.3 | Render document section markdown in source previews | Already installed |

### Key Integration Points

**`apps/web/app/routes/search.tsx` (675 lines):**
- Handles both keyword and AI search modes
- Streams SSE events from `/api/search`
- Renders thoughts, tool calls, final answer, sources, follow-ups
- **Primary file for citation UX, source panel, and follow-up redesign**

**`apps/web/app/services/rag.server.ts` (1,344 lines):**
- Agent orchestration with 8 search tools
- Generates numbered citations [1]..[N]
- Streams thought/tool_call/tool_observation/final_answer events
- **Primary file for agent reasoning improvements, bylaw tool**

**`apps/web/app/services/hybrid-search.server.ts` (351 lines):**
- Unified keyword search with RRF across 4 content types
- Returns `UnifiedSearchResult[]` with rank_score
- **Primary file for search filter/sort controls**

**`apps/web/app/routes/api.search.tsx` (236 lines):**
- API endpoint handling mode dispatch (keyword/ai/cached)
- Query params: q, mode, type, context
- **Needs time filter params and updated SSE event types**

**`apps/web/app/lib/intent.ts` (69 lines):**
- Heuristic intent classifier (keyword vs question)
- **No changes needed — intent detection is working**

---

## Feature-Specific Stack Guidance

### 1. Citation Hover Cards (Perplexity-style)

**Approach:** Radix `Popover` for desktop hover, Radix `Dialog` (sheet mode) for mobile tap.

The citation system needs to:
- Parse grouped source references from AI output (e.g., `[3 sources]` per sentence)
- Show a popover card on hover (desktop) or tap (mobile)
- Support paging through multiple sources in the popover

**Components needed (all available via shadcn/ui):**
- `Popover` — desktop hover card positioned near the citation badge
- `Dialog` / `Drawer` — mobile full-width bottom sheet for source preview
- Custom `SourcePager` — left/right navigation within a popover showing one source at a time

**Why Radix Popover over CSS :hover:**
- Popover stays open while user interacts with it (reading, clicking links)
- Proper focus management for keyboard navigation
- Handles viewport edge positioning automatically
- Can be triggered by hover (desktop) and click/tap (mobile) with the same component

**Citation badge rendering:**
The AI currently generates `[1][2][3]` style citations. For v1.6, the SSE protocol needs to change so the backend sends source metadata per-sentence, and the frontend renders grouped badges like `[3 sources]` instead of individual numbers.

### 2. Search Filter Controls (Kagi-style)

**Approach:** Native Radix `Select` + custom filter chip components. No new libraries.

Kagi's search UI features:
- Time filter dropdown (Past day, Past week, Past month, Past year, Custom range)
- Content type filter chips (Documents, Motions, Statements, Transcripts)
- Sort options (Relevance, Date newest, Date oldest)

All achievable with existing shadcn/ui components:
- `Select` for time range and sort dropdowns
- `ToggleGroup` or custom chips for content type filters
- URL search params for filter state persistence (already the RR7 pattern)

### 3. Agent Reasoning Display

**Approach:** Enhanced SSE event content. No new frontend libraries.

The streaming thought/tool_call events already render in the UI. The improvements are:
- Better prompt instructions to Gemini for more explanatory thoughts
- Structured tool observation summaries (not raw result dumps)
- Frontend: styled reasoning cards with icons per tool type

This is prompt engineering + CSS, not library work.

### 4. Bylaw Search Tool

**Approach:** New tool in `rag.server.ts` querying the `bylaws` table.

The bylaws table already has:
- `embedding halfvec(384)` — vector search ready
- `text_search tsvector` — FTS ready
- `title`, `plain_english_summary`, `bylaw_number`

Add a `search_bylaws` tool mirroring the existing `search_motions` pattern. Needs a `match_bylaws` RPC in Supabase (similar to existing `match_motions`).

### 5. Follow-up Suggestions (Perplexity-style)

**Approach:** CSS/component redesign of existing follow-up chips. No new libraries.

Perplexity shows follow-ups as a collapsible "Related" section with pill buttons below the answer. The current implementation already generates and renders follow-ups — this is a visual redesign using existing Tailwind + Radix Collapsible.

### 6. Source Panel (Collapsed by Default)

**Approach:** Radix `Collapsible` wrapping the existing sources list. No new libraries.

Currently sources render as an open list below the answer. Wrap in `Collapsible` with a toggle header showing source count.

### 7. Document Markdown in Source Previews

**Approach:** Reuse existing `MarkdownContent` component. No new libraries.

Source preview cards currently show plain text snippets. For document sections, render through `MarkdownContent` (already uses `marked`) to show formatted previews.

---

## What NOT to Add

| Technology | Why Tempting | Why Wrong |
|------------|-------------|-----------|
| `@floating-ui/react` | "Better" popover positioning | Radix Popover already uses Floating UI internally; adding it separately duplicates logic and adds bundle size |
| `react-virtualized` / `@tanstack/virtual` | Virtualize long source lists | Source lists are max ~20 items; virtualization adds complexity for no benefit at this scale |
| `date-fns` / `dayjs` | Time filter date manipulation | Existing `Intl.DateTimeFormat` + native Date arithmetic covers all time filter needs; URL params store ISO strings |
| `@tanstack/react-query` | Client-side caching for search | SSR loaders + URL param state is the established pattern; adding a client cache layer creates two sources of truth |
| `framer-motion` | Animate popover/panel transitions | Radix components have built-in CSS animation support via `data-[state=open/closed]` attributes; CSS transitions are sufficient |
| `react-markdown` | Render source previews | Already using `marked` for SSR safety; mixing both renderers in one app creates inconsistency |
| `fuse.js` / `minisearch` | Client-side search filtering | Filtering happens server-side in Supabase RPCs; client-side search adds bundle size with no benefit |

---

## SSE Protocol Changes

The streaming protocol needs updates for grouped citations:

**New/modified SSE event types:**

| Event Type | Current | v1.6 |
|------------|---------|------|
| `sources` | `{ sources: Source[] }` | `{ sources: Source[] }` (unchanged, but source objects enriched with content preview) |
| `final_answer_chunk` | Text with `[1][2]` inline citations | Text with `[sources:1,3,7]` grouped citation markers |
| `thought` | Raw reasoning text | Structured: `{ thought: string, intent: string }` |
| `tool_observation` | Raw result text | Structured: `{ summary: string, count: number, relevance: string }` |

The frontend parses `[sources:1,3,7]` markers and renders them as `[3 sources]` badge components with popover bindings.

---

## Summary

| v1.6 Feature | Libraries Needed | Approach |
|--------------|------------------|----------|
| Citation hover cards | None (Radix Popover already available) | Popover on desktop, Dialog/Drawer on mobile |
| Source pager | None | Custom component with left/right nav inside popover |
| Search filters | None (Radix Select already available) | Time dropdown, type chips, sort select |
| Agent reasoning | None | Better Gemini prompts + styled thought cards |
| Bylaw search tool | None | New tool in rag.server.ts + Supabase RPC |
| Follow-up emphasis | None | CSS redesign of existing chips |
| Source panel collapse | None (Radix Collapsible already available) | Collapsible wrapper with count header |
| Document preview rendering | None | Reuse MarkdownContent component |

**Total new npm packages: 0**

---

*Last updated: 2026-02-28*
