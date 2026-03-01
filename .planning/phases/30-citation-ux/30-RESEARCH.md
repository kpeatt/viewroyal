# Phase 30: Citation UX - Research

**Researched:** 2026-03-01
**Domain:** React component architecture, Radix UI primitives, markdown rendering
**Confidence:** HIGH

## Summary

Phase 30 transforms the existing individual numbered citation badges into grouped pills with rich preview cards. The current codebase already has all the foundational primitives: `CitationBadge` with `HoverCard`, `vaul` Drawer for mobile bottom sheets, `react-markdown` with `remark-gfm` and `rehype-raw` for markdown rendering, and a well-structured `NormalizedSource` interface flowing through the SSE pipeline.

The main work is: (1) refactoring `processCitationsInChildren` to group consecutive `[N]` references into a single pill, (2) building a `SourcePreviewCard` that renders type-specific layouts with markdown content, (3) wiring the Drawer component for mobile and HoverCard for desktop using a media query hook, and (4) adding markdown rendering to source content across both inline previews and the bottom source cards section.

**Primary recommendation:** Build from the existing `citation-badge.tsx` — refactor the citation parser to group consecutive references, then create a new `GroupedCitationBadge` component that conditionally renders HoverCard (desktop) or Drawer (mobile) with shared `SourcePreviewContent`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Rounded pill showing count text (e.g., "3 sources"), not individual numbered circles
- Count only in the pill — no source numbers visible until hover/tap
- Frontend groups consecutive `[1][4][7]` citations into a single pill (no LLM prompt changes needed)
- Blue pill matching existing CitationBadge palette: `bg-blue-100 text-blue-700 rounded-full`
- Single-source citations can keep the existing numbered circle style
- Snippet preview: source type icon, date, 2-3 line content excerpt, link to source page
- Multiple sources shown as stacked list (all visible, scrollable) — no paging/carousel
- Type-specific layouts per source type (transcript, motion, bylaw, document section, key statement)
- Max height (~300px) with internal scroll when 5+ sources
- Half-screen slide-up sheet (~50% viewport height) for mobile
- Use Radix Drawer (vaul) — consistent with existing shadcn/Radix UI library
- Detect mobile vs desktop via Tailwind `md:` breakpoint (768px): below = bottom sheet on tap, above = HoverCard on hover
- Swipe down or tap backdrop to dismiss mobile sheet
- Direct navigation when tapping source links (no confirmation dialog)
- Full markdown rendering: headings, bold, italic, lists, tables, code blocks
- Truncate with expand/collapse: show first ~4 lines, "Show more" link to expand inline
- Apply markdown rendering to ALL source types (not just documents/bylaws)
- Render markdown in both preview cards (hover/bottom sheet) AND source cards section below the answer

### Claude's Discretion
- Exact animation timing for bottom sheet and hover card transitions
- How to handle edge cases (single source pill vs multi-source pill thresholds)
- Table rendering sizing within small preview cards
- Loading states for preview card content

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CITE-01 | Grouped source badges per sentence (e.g., `[3 sources]`) instead of individual numbered references | Citation parser refactoring in `processCitationsInChildren` to detect and group consecutive `[N]` patterns |
| CITE-02 | Hover (desktop) / tap (mobile) citation badge shows source preview card with title, date, content snippet, and source link | HoverCard (desktop) + Drawer/vaul (mobile) with `SourcePreviewContent` shared component; `useMediaQuery` hook for responsive switching |
| CITE-03 | Page through multiple sources within a single citation badge's preview card | Stacked scrollable list layout (user locked: no paging/carousel) — max-height with overflow-y-auto |
| CITE-04 | Document section source previews render markdown content | `react-markdown` + `remark-gfm` already installed; needs `SourceMarkdownPreview` wrapper with truncation |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-markdown | ^10.1.0 | Markdown rendering for source content | Already used in `ai-answer.tsx` for the main answer |
| remark-gfm | ^4.0.1 | GFM tables, strikethrough, task lists | Already installed, needed for table rendering in previews |
| rehype-raw | ^7.0.0 | Raw HTML in markdown | Already installed |
| radix-ui | ^1.4.3 | HoverCard primitive for desktop previews | Already used in existing `CitationBadge` |
| vaul | ^1.1.2 | Drawer primitive for mobile bottom sheet | Already installed, `drawer.tsx` component exists |
| lucide-react | (installed) | Source type icons (Mic, Gavel, FileText, Book, MessageSquare) | Already used in `citation-badge.tsx` |

### No New Dependencies Required
All needed libraries are already installed. No `pnpm add` needed.

## Architecture Patterns

### Recommended Component Structure
```
components/search/
├── citation-badge.tsx          # Refactored: GroupedCitationBadge + legacy CitationBadge
├── source-preview-content.tsx  # NEW: Shared preview card content (used by both HoverCard and Drawer)
├── source-cards.tsx            # Updated: Add markdown rendering to source card content
├── source-markdown-preview.tsx # NEW: Truncatable markdown renderer for source content
├── ai-answer.tsx               # Updated: Use new grouped citation processing
└── use-media-query.ts          # NEW: Hook for responsive HoverCard vs Drawer switching
```

### Pattern 1: Citation Grouping in Parser
**What:** Modify `processCitationsInChildren` to detect runs of consecutive `[N]` patterns and group them into a single `GroupedCitationBadge` component.
**When to use:** Every time react-markdown renders a paragraph or list item.
**Example:**
```typescript
// Input text: "Council approved the motion [1][4][7] after debate [2]."
// Current: [Badge 1][Badge 4][Badge 7] ... [Badge 2]
// New: [3 sources pill] ... [Badge 2]

// Detection: split on /(\[\d+\])/g, then walk parts:
// - If a [N] is immediately followed by another [N] (no text between), group them
// - Single [N] stays as individual badge
// - Group of 2+ becomes a GroupedCitationBadge with sourceIndices array
```

### Pattern 2: Responsive Preview (Desktop HoverCard / Mobile Drawer)
**What:** Use a `useMediaQuery` hook to determine the rendering strategy. On desktop (>= 768px), render `HoverCard` with `SourcePreviewContent`. On mobile (< 768px), render a button that opens a `Drawer` bottom sheet with the same `SourcePreviewContent`.
**When to use:** Inside `GroupedCitationBadge` component.
**Example:**
```typescript
function GroupedCitationBadge({ sourceIndices, sources }: Props) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = useState(false);
  const badgeSources = sourceIndices.map(i => sources[i - 1]).filter(Boolean);

  if (isDesktop) {
    return (
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>
          <button className="...pill classes...">{badgeSources.length} sources</button>
        </HoverCardTrigger>
        <HoverCardContent className="w-80 max-h-[300px] overflow-y-auto p-0">
          <SourcePreviewContent sources={badgeSources} />
        </HoverCardContent>
      </HoverCard>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button className="...pill classes...">{badgeSources.length} sources</button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[50vh]">
        <DrawerHeader>
          <DrawerTitle>{badgeSources.length} Sources</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-4">
          <SourcePreviewContent sources={badgeSources} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

### Pattern 3: Type-Specific Source Layouts
**What:** Each source type gets a distinct layout in the preview card.
**Layouts:**
```typescript
// Transcript: speaker name + quoted excerpt (italic)
// Motion: motion text + vote result badge (Carried/Defeated pill)
// Bylaw: bylaw number + section title + excerpt
// Document section: section heading + content excerpt
// Key statement: speaker + statement text
```

### Pattern 4: Truncatable Markdown Preview
**What:** A shared `SourceMarkdownPreview` component that renders markdown content truncated to ~4 lines with a "Show more" toggle.
**How:**
```typescript
function SourceMarkdownPreview({ content, maxLines = 4 }: Props) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cn("prose prose-xs", !expanded && "line-clamp-4")}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      {/* Show toggle only if content is long enough to be truncated */}
      <button onClick={() => setExpanded(!expanded)}>
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Don't modify the LLM prompt:** The user locked "no LLM prompt changes." Grouping is purely frontend — the LLM still outputs `[1][2][3]`.
- **Don't use CSS-only mobile detection:** Use a JS media query hook (`matchMedia`) to reliably switch between HoverCard and Drawer. CSS `hidden`/`block` doesn't work because both components would mount.
- **Don't create separate mobile/desktop component trees:** Use a single `GroupedCitationBadge` with conditional rendering inside, sharing `SourcePreviewContent`.
- **Don't put markdown in every source field:** Markdown rendering applies to the `title` field (which contains content excerpts). The `NormalizedSource.title` field already holds content snippets.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bottom sheet for mobile | Custom CSS slide-up animation | vaul `Drawer` component | Already installed, handles swipe gestures, backdrop dismiss, keyboard accessibility |
| Hover preview cards | Custom tooltip with `onMouseEnter/Leave` | Radix `HoverCard` | Already in use, handles open/close delays, focus management, portal rendering |
| Markdown rendering | Custom parser with regex | `react-markdown` + `remark-gfm` | Already installed, handles GFM tables, code blocks, nested lists |
| Media query detection | `window.innerWidth` checks with resize listener | `useMediaQuery` hook (3 lines with `matchMedia`) | Handles SSR (returns false), cleanup, responsive updates |
| Text truncation | Custom line counting with refs | CSS `line-clamp-N` utility | Tailwind built-in, works with prose content |

## Common Pitfalls

### Pitfall 1: HoverCard Inside Prose Conflicts
**What goes wrong:** HoverCard trigger inside `prose` class inherits unwanted link styles (underlines, blue color on the trigger element)
**Why it happens:** The existing `CitationBadge` already handles this with `!no-underline` overrides, but grouped pills may not be `<a>` tags
**How to avoid:** Use `<button>` for the pill trigger (not `<Link>`), apply `!no-underline` and reset prose styles
**Warning signs:** Unexpected underlines or color changes on pill badges

### Pitfall 2: SSR Hydration Mismatch with useMediaQuery
**What goes wrong:** Server renders one version (no window), client renders another, React hydration error
**Why it happens:** `matchMedia` not available during SSR on Cloudflare Workers
**How to avoid:** Default `useMediaQuery` to `false` on server (renders mobile layout), then switch on client after hydration. Use `useEffect` for the media query subscription.
**Warning signs:** "Hydration mismatch" console warnings, brief flash of wrong layout

### Pitfall 3: Citation Grouping Misses Non-Consecutive References
**What goes wrong:** `[1] and [4]` treated as a group when they shouldn't be (text "and" between them)
**Why it happens:** Naive grouping that checks array adjacency instead of text adjacency
**How to avoid:** Group only when `[N]` tokens are literally adjacent in the split array (no text part between them). The regex split `/(\[\d+\])/g` produces alternating text/citation parts — group citations only when the text between them is empty string.
**Warning signs:** Incorrect grouping of citations separated by words

### Pitfall 4: Drawer State Conflicts with Multiple Badges
**What goes wrong:** Opening one drawer doesn't close another, or state bleeds between badges
**Why it happens:** Each `GroupedCitationBadge` has its own Drawer state, but vaul uses portal rendering
**How to avoid:** Each badge manages its own `open` state independently. vaul's overlay handles dismiss correctly.
**Warning signs:** Multiple overlays stacking, badges not closing properly

### Pitfall 5: Large Source Lists Cause Layout Shift
**What goes wrong:** HoverCard with 10+ sources pushes content off-screen or causes viewport jumps
**Why it happens:** HoverCard content grows too tall
**How to avoid:** Apply `max-h-[300px] overflow-y-auto` to HoverCard content (user decision: max ~300px with scroll)
**Warning signs:** HoverCard extending beyond viewport edges

## Code Examples

### useMediaQuery Hook
```typescript
// Source: Standard React pattern for matchMedia
import { useState, useEffect } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
```

### Citation Grouping Algorithm
```typescript
// Source: Custom — adapted from existing processCitationNode
function groupCitations(textParts: string[]): (string | { type: "single"; num: number } | { type: "group"; nums: number[] })[] {
  const result: (string | { type: "single"; num: number } | { type: "group"; nums: number[] })[] = [];
  let currentGroup: number[] = [];

  for (const part of textParts) {
    const m = part.match(/^\[(\d+)\]$/);
    if (m) {
      currentGroup.push(parseInt(m[1], 10));
    } else {
      // Flush current group
      if (currentGroup.length === 1) {
        result.push({ type: "single", nums: currentGroup[0] }); // Keep existing style
      } else if (currentGroup.length > 1) {
        result.push({ type: "group", nums: [...currentGroup] });
      }
      currentGroup = [];
      if (part !== "") result.push(part);
    }
  }
  // Flush remaining
  if (currentGroup.length === 1) {
    result.push({ type: "single", num: currentGroup[0] });
  } else if (currentGroup.length > 1) {
    result.push({ type: "group", nums: [...currentGroup] });
  }

  return result;
}
```

### NormalizedSource Interface (Current)
```typescript
// Source: rag.server.ts line 1000
interface NormalizedSource {
  type: "transcript" | "motion" | "vote" | "key_statement" | "matter" | "agenda_item" | "document_section" | "bylaw";
  id: number;
  meeting_id: number;
  meeting_date: string;
  title: string;           // Contains content excerpt (120 chars max)
  speaker_name?: string;
  bylaw_id?: number;
}
```

**Note for CITE-04:** The current `NormalizedSource.title` field truncates content to 120 chars. For full markdown rendering in preview cards, the normalize functions should include the full `content` or `text_content` field. This requires adding a `content` field to `NormalizedSource` and populating it in each normalize function.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/web && pnpm test -- --run` |
| Full suite command | `cd apps/web && pnpm test -- --run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CITE-01 | Citation grouping parser groups consecutive `[N]` into single pill | unit | `cd apps/web && pnpm test -- --run tests/components/citation-grouping.test.ts` | Wave 0 |
| CITE-02 | SourcePreviewContent renders type-specific layouts for each source type | unit | `cd apps/web && pnpm test -- --run tests/components/source-preview.test.ts` | Wave 0 |
| CITE-03 | Multiple sources render as scrollable stacked list | manual-only | Visual verification — layout depends on rendered height | N/A |
| CITE-04 | SourceMarkdownPreview renders markdown with truncation | unit | `cd apps/web && pnpm test -- --run tests/components/source-markdown-preview.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/web && pnpm test -- --run`
- **Per wave merge:** `cd apps/web && pnpm test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/components/citation-grouping.test.ts` -- covers CITE-01 (grouping algorithm)
- [ ] `tests/components/source-preview.test.ts` -- covers CITE-02 (type-specific layouts)
- [ ] `tests/components/source-markdown-preview.test.ts` -- covers CITE-04 (markdown + truncation)

## Open Questions

1. **NormalizedSource `content` field for markdown rendering**
   - What we know: Current `title` field truncates to 120 chars. CITE-04 requires full markdown rendering.
   - What's unclear: How much content to include (full text could be very long for document sections).
   - Recommendation: Add a `content` field to `NormalizedSource` with up to 500 chars of the full text. This gives enough for a meaningful preview without bloating the SSE payload. The `title` field stays as the short label.

2. **Motion result badge formatting**
   - What we know: Motions have a `result` field ("Carried", "Defeated", etc.) stored on the raw data.
   - What's unclear: Whether `result` is available in `NormalizedSource` (it's not — only `title` contains the summary).
   - Recommendation: Add `result` as an optional field on `NormalizedSource` for motions. The normalize function already has access to `m.result`.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `apps/web/app/components/search/citation-badge.tsx` — existing citation processing
- Codebase analysis: `apps/web/app/components/search/ai-answer.tsx` — markdown rendering pipeline
- Codebase analysis: `apps/web/app/services/rag.server.ts` — SSE protocol and source normalization
- Codebase analysis: `apps/web/app/components/ui/drawer.tsx` — vaul Drawer primitives
- Codebase analysis: `apps/web/app/components/ui/hover-card.tsx` — Radix HoverCard primitives
- Codebase analysis: `apps/web/app/routes/search.tsx` — SSE consumer and source state management

### Secondary (MEDIUM confidence)
- vaul library v1.1.2 API patterns — based on existing `TranscriptDrawer.tsx` usage in codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and used in the codebase
- Architecture: HIGH — extending well-understood existing patterns
- Pitfalls: HIGH — identified from real codebase constraints (SSR, prose styles, source data shape)

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable — internal component refactoring)
