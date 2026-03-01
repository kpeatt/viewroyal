# Phase 30: Citation UX - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Users trace every claim in an AI answer back to specific sources through inline badges with rich preview cards. Grouped citation badges replace individual numbered references, hover/tap previews show source details, and document previews render markdown. The SSE protocol and source data structures from Phase 29 are the foundation.

</domain>

<decisions>
## Implementation Decisions

### Badge Grouping Style
- Rounded pill showing count text (e.g., "3 sources"), not individual numbered circles
- Count only in the pill — no source numbers visible until hover/tap
- Frontend groups consecutive `[1][4][7]` citations into a single pill (no LLM prompt changes needed)
- Blue pill matching existing CitationBadge palette: `bg-blue-100 text-blue-700 rounded-full`
- Single-source citations can keep the existing numbered circle style

### Preview Card Content
- Snippet preview: source type icon, date, 2-3 line content excerpt, link to source page
- Multiple sources shown as stacked list (all visible, scrollable) — no paging/carousel
- Type-specific layouts per source type:
  - Transcript: speaker name + quoted excerpt
  - Motion: motion text + vote result (Carried/Defeated)
  - Bylaw: bylaw number + section title + excerpt
  - Document section: section heading + content excerpt
  - Key statement: speaker + statement text
- Max height (~300px) with internal scroll when 5+ sources

### Mobile Bottom Sheet
- Half-screen slide-up sheet (~50% viewport height)
- Use Radix Drawer (vaul) — consistent with existing shadcn/Radix UI library
- Detect mobile vs desktop via Tailwind `md:` breakpoint (768px): below = bottom sheet on tap, above = HoverCard on hover
- Swipe down or tap backdrop to dismiss
- Direct navigation when tapping source links (no confirmation dialog)

### Source Card Markdown Rendering
- Full markdown rendering: headings, bold, italic, lists, tables, code blocks
- Truncate with expand/collapse: show first ~4 lines, "Show more" link to expand inline
- Apply markdown rendering to ALL source types (not just documents/bylaws)
- Render markdown in both preview cards (hover/bottom sheet) AND source cards section below the answer

### Claude's Discretion
- Exact animation timing for bottom sheet and hover card transitions
- How to handle edge cases (single source pill vs multi-source pill thresholds)
- Table rendering sizing within small preview cards
- Loading states for preview card content

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CitationBadge` component (`components/search/citation-badge.tsx`): Current individual numbered badge with HoverCard — will be refactored to support grouped pills
- `processCitationsInChildren` / `processCitationNode`: React-markdown citation parser that splits on `[N]` patterns — needs extension to group consecutive citations
- `SourceCards` component (`components/search/source-cards.tsx`): Current flat chip list below answer — gets markdown rendering
- `SourceIcon` helper: Maps source types to Lucide icons (Mic, Gavel, FileText, Book, MessageSquare)
- `SOURCE_TYPE_LABEL` mapping: Already covers transcript, motion, bylaw, document_section, key_statement
- `HoverCard` from Radix UI (`components/ui/hover-card.tsx`): Already imported and used in CitationBadge
- `ReactMarkdown` already used in `ai-answer.tsx` for the main answer rendering
- `cn()` utility for Tailwind class merging

### Established Patterns
- Shadcn/Radix UI for all interactive primitives (HoverCard, Dialog, etc.)
- Tailwind CSS 4 with `cn()` for conditional class composition
- Named function components with TypeScript props interfaces
- Source type routing: `source.type === "bylaw"` → `/bylaws/${source.bylaw_id}`, else → `/meetings/${source.meeting_id}`

### Integration Points
- `AiAnswer` component receives `sources: any[]` and `agentSteps: AgentEvent[]` — citation grouping happens between markdown parsing and rendering
- SSE consumer in `search.tsx` builds the sources array — no changes needed for grouping (frontend-only)
- `rag.server.ts` source objects already contain: type, meeting_id, meeting_date, speaker_name, title, content fields

</code_context>

<specifics>
## Specific Ideas

- Citation pills should feel lightweight — reference markers, not visual highlights that compete with the answer text
- The stacked source list in previews should feel like a quick reference panel, not a full page
- Bottom sheet should feel native on mobile — smooth swipe gestures, no janky CSS-only animations

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 30-citation-ux*
*Context gathered: 2026-03-01*
