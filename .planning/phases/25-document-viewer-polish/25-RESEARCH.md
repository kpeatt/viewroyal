# Phase 25: Document Viewer Polish - Research

**Researched:** 2026-02-26
**Domain:** CSS typography, markdown rendering, responsive table design
**Confidence:** HIGH

## Summary

This phase is a CSS/component polish pass on two files: `document-viewer.tsx` (route) and `markdown-content.tsx` (shared component). No new libraries are needed -- the project already has `@tailwindcss/typography` v0.5.19, `marked` v17.0.3, and Tailwind CSS v4.1.13, which together provide everything required.

The dominant issue is **duplicate headings**: the current `document-viewer.tsx` renders `section_title` as an explicit `<h2>` in JSX, but 76% of sections (50,280 of 65,802) already contain `## section_title` as the first line of their markdown text. The fix is architectural: remove the JSX heading entirely and let markdown be the single source of truth for document structure. The `section_title` and `section_order` fields should only be used for anchor IDs.

For tables, the project uses `marked` which outputs raw `<table>` HTML. These tables need to be wrapped in a scrollable container to prevent mobile page overflow. The `marked.use()` renderer API makes this straightforward -- override the `table` method to wrap output in a `<div class="overflow-x-auto">`.

**Primary recommendation:** Remove JSX headings from document-viewer.tsx, upgrade markdown-content.tsx prose classes from `prose-sm` to `prose-base` size, add a custom `marked` table renderer that wraps tables in a scrollable container with fade hints, and enhance blockquote/heading/zebra-stripe styles via Tailwind prose modifiers.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Sans-serif body text, bumped from prose-sm (14px) to ~16px base with increased line-height
- Comfortable paragraph spacing -- roughly double the current my-1.5 so paragraphs are clearly separated
- List items get more breathing room (currently my-0.5)
- Keep max-w-4xl reading column -- wide enough for tables, good use of screen space
- Wrap tables in a scrollable container with shadow/fade hints on the overflow edge (mobile horizontal scroll without page shifting)
- Zebra-striped rows for easier scanning of data-heavy government tables
- Internal grid lines only -- no outer border/frame around the table
- Keep table text at text-xs (12px) for data density
- **Remove explicit JSX headings** -- no more `<h2>` for section_title in the component JSX
- Let the markdown render its own headings naturally as the single source of truth
- Use section_title/section_order data only for anchor IDs and navigation links
- Document title stays in the header/breadcrumb bar at the top, not duplicated in the body
- Remove `<hr>` dividers between sections -- let markdown headings provide visual separation
- Size + style variation for heading levels: h1 large, h2 with bottom border, h3 bold, h4 uppercase small caps
- Blockquotes get subtle background tint plus a colored left border -- distinct from body text (important for motions, recommendations, legal text in gov docs)
- Keep "Page X" annotations below sections as-is (tiny text, useful for PDF cross-reference)

### Claude's Discretion
- Exact heading sizes and spacing above h1/h2 vs h3/h4 -- should create clear section breaks matching the "comfortable" typography
- Heading font treatment (serif vs sans for headings)
- Exact shadow/fade implementation for table scroll indicators
- Zebra stripe color intensity

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOCV-01 | User sees document sections with polished typography -- proper font sizes, line heights, and spacing between headings, paragraphs, and lists | Upgrade `prose-sm` to `prose-base` in markdown-content.tsx; increase paragraph spacing from `my-1.5` to `my-3`; increase list item spacing from `my-0.5` to `my-1.5`; add h1/h2/h3/h4 hierarchy with distinct visual treatment via prose modifiers |
| DOCV-02 | User can view documents with wide tables on mobile without horizontal page overflow (tables scroll independently) | Use `marked.use()` custom table renderer to wrap `<table>` in a scrollable `<div>` with `overflow-x-auto`; add CSS gradient fade masks on overflow edges; apply zebra striping and internal-only grid lines via prose-tr/prose-td modifiers |
| DOCV-03 | User does not see duplicate document titles when the first section heading matches the document title | Remove explicit `<h2>{section.section_title}</h2>` JSX from document-viewer.tsx; remove `<hr>` dividers between sections; use section_title/section_order only for anchor `id` attributes |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tailwindcss/typography | 0.5.19 | Prose classes for markdown HTML | Already installed; provides `prose-*` element modifiers for all heading, paragraph, table, blockquote styling |
| marked | 17.0.3 | Markdown-to-HTML conversion | Already installed; used by `markdown-content.tsx`; supports custom renderers via `marked.use()` |
| tailwindcss | 4.1.13 | Utility CSS framework | Already installed; v4 uses `@plugin` directive in app.css |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | All requirements met by existing stack |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| marked custom renderer | CSS-only `table` wrapper via prose override | CSS-only can't wrap table in div; renderer approach is the only way to inject a wrapper element |
| Tailwind prose modifiers | Custom CSS classes | Prose modifiers are more maintainable and consistent with the rest of the project |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Relevant File Structure
```
apps/web/app/
├── components/
│   └── markdown-content.tsx    # Shared markdown renderer (MODIFY: typography + table wrapper)
├── routes/
│   └── document-viewer.tsx     # Document page (MODIFY: remove JSX headings, remove <hr>)
└── app.css                     # Global styles (MODIFY: add table scroll indicator CSS)
```

### Pattern 1: Custom Marked Renderer for Table Wrapping
**What:** Override `marked`'s `table()` renderer to wrap every `<table>` in a scrollable div container
**When to use:** Always -- this is the only way to inject a wrapper div around tables rendered from markdown
**Example:**
```typescript
// Source: https://github.com/markedjs/marked/discussions/3571
import { marked, Renderer } from "marked";

const defaultRenderer = new Renderer();

marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    table(...args) {
      const html = defaultRenderer.table.apply(this, args);
      return `<div class="table-scroll-container overflow-x-auto -mx-2 px-2">${html}</div>`;
    },
  },
});
```

### Pattern 2: CSS Gradient Fade Masks for Scroll Indicators
**What:** Use CSS `mask-image` with linear gradients to show a fade at the edge of scrollable content, hinting to the user that more content exists
**When to use:** On the table scroll container to indicate horizontal overflow
**Example:**
```css
/* In app.css */
.table-scroll-container {
  position: relative;
}
.table-scroll-container::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 2rem;
  background: linear-gradient(to right, transparent, white);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}
/* JS-toggled class when container has overflow */
.table-scroll-container.has-overflow::after {
  opacity: 1;
}
```

**Alternative (simpler, pure CSS):** Use CSS `mask-image` on the container itself -- no JS needed. The mask applies a transparent-to-opaque gradient that fades the right edge when content overflows. This avoids JS scroll event listeners entirely:

```css
.table-scroll-container {
  -webkit-mask-image: linear-gradient(to right, black calc(100% - 2rem), transparent);
  mask-image: linear-gradient(to right, black calc(100% - 2rem), transparent);
}
```

However, the mask approach fades table *content* rather than overlaying a visual shadow hint. The pseudo-element approach with a white gradient overlay is more conventional for scroll indicators and matches the "shadow/fade hints" decision better. Given that the document viewer is white-background, a white gradient overlay is the simplest and cleanest solution.

**Recommendation:** Use the pseudo-element approach with a tiny client-side check (ResizeObserver or scrollWidth > clientWidth) to toggle a `has-overflow` class. This provides the clearest UX -- fade only appears when the table actually overflows.

### Pattern 3: Removing JSX Headings (Title Dedup Fix)
**What:** Remove `section.section_title` rendering from document-viewer.tsx JSX; let markdown handle headings
**When to use:** This is the core fix for DOCV-03
**Current code (lines 349-353 of document-viewer.tsx):**
```tsx
{section.section_title && (
  <h2 className="text-base font-semibold text-zinc-900 mb-2 font-serif">
    {section.section_title}
  </h2>
)}
```
**Fix:** Remove this block entirely. Keep the `id={`section-${section.section_order}`}` on the wrapper div for anchor navigation.

**Data validation (from database):**
- 50,280 of 65,802 sections with titles have `## section_title` as the first line of markdown -- confirming 76% duplication
- 277 sections start with `# ` (h1), 52,776 with `## ` (h2), 455 with `### ` (h3), 147 with `#### ` (h4)
- The dominant heading level is `##` (h2), which is what the JSX was also rendering as `<h2>` -- removing the JSX eliminates the double

### Pattern 4: Zebra Striping via Prose Modifiers
**What:** Use `prose-tr` modifier with `even:` variant for zebra rows
**When to use:** For all tables in the document viewer
**Example:**
```tsx
// In the prose className string:
"[&_tr:nth-child(even)]:bg-zinc-50/60"
```
Note: `prose-tr` is available as a modifier, but for zebra striping the `nth-child` selector is cleaner via Tailwind's arbitrary selector syntax `[&_tr:nth-child(even)]`.

### Anti-Patterns to Avoid
- **Don't use separate CSS classes per heading level outside prose:** The `@tailwindcss/typography` plugin already handles heading hierarchy. Use `prose-h1:`, `prose-h2:`, `prose-h3:`, `prose-h4:` modifiers on the prose container.
- **Don't wrap table in a React component:** The markdown is rendered as raw HTML via `dangerouslySetInnerHTML`. The wrapper must happen at the `marked` renderer level, not React.
- **Don't remove section_title from the data query:** Even though we're not rendering it as JSX, `section_title` is needed for anchor IDs and will be needed by Phase 28 (table of contents sidebar).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Typography scaling | Custom font-size classes per element | `@tailwindcss/typography` prose size modifiers (`prose-base`) | Handles 20+ HTML elements with tested proportional scaling |
| Table scrolling | Custom React table component with refs | `marked.use()` custom renderer + `overflow-x-auto` container | Tables come from markdown HTML, can't use React components with dangerouslySetInnerHTML |
| Heading hierarchy | Manual heading styles per h1-h4 | `prose-h1:`, `prose-h2:`, `prose-h3:`, `prose-h4:` modifiers | Consistent with Tailwind ecosystem, easy to tune |

**Key insight:** Everything in this phase is CSS/prose-modifier tuning plus one small `marked` renderer override. No new components, no new data fetching, no new libraries.

## Common Pitfalls

### Pitfall 1: Table overflow breaking page layout on mobile
**What goes wrong:** A `<table>` wider than the viewport causes the entire page to scroll horizontally
**Why it happens:** Tables rendered from markdown have no wrapper div; `overflow-x-auto` on the prose container doesn't help because the table is a child element that overflows
**How to avoid:** Use `marked.use()` with a custom `table()` renderer that wraps the output in `<div class="overflow-x-auto">`. This is the ONLY reliable approach when using `dangerouslySetInnerHTML`.
**Warning signs:** Test on mobile viewport (375px); wide tables should scroll independently within their container

### Pitfall 2: Global marked.use() polluting other components
**What goes wrong:** Calling `marked.use()` at module scope changes the global `marked` instance, affecting all components that import `marked`
**Why it happens:** `marked.use()` mutates the singleton; if other files also import `marked`, they get the customized version
**How to avoid:** This is actually fine for this project -- `markdown-content.tsx` is the only file using `marked.parse()`, and we want the table wrapper everywhere. But be aware: if another component needs different `marked` behavior, use `new Marked()` to create a separate instance.
**Warning signs:** Other markdown renderers producing unexpected HTML

### Pitfall 3: Removing JSX headings when some sections lack markdown headings
**What goes wrong:** If a section has `section_title` but no heading in `section_text`, removing the JSX heading removes the only heading
**Why it happens:** 15,522 sections (65,802 - 50,280) have a `section_title` but DON'T start with `## section_title` in their text
**How to avoid:** After removing JSX headings, check if the markdown starts with a heading. If not, the section simply renders without a heading, which may be acceptable for body-only sections. The user decision says "Let the markdown render its own headings naturally as the single source of truth" -- so no fallback JSX heading should be added.
**Warning signs:** Visually inspect a few documents to confirm the headings look right after the change

### Pitfall 4: Prose size override not taking effect in Tailwind v4
**What goes wrong:** Changing from `prose-sm` to `prose-base` or just `prose` doesn't change font sizes
**Why it happens:** In Tailwind v4 with `@tailwindcss/typography`, `prose` defaults to `prose-base`. But if explicit `prose-p:text-sm` is also present, it overrides the base size.
**How to avoid:** When upgrading from `prose-sm` to `prose-base`, also update ALL the explicit `prose-p:text-sm`, `prose-li:text-sm`, `prose-h2:text-base` etc. to the new sizes. The explicit modifiers take priority over the prose size preset.
**Warning signs:** Font sizes don't change despite updating the prose size class

### Pitfall 5: Zebra stripes not applying inside prose
**What goes wrong:** Tailwind arbitrary selectors like `[&_tr:nth-child(even)]` might not work inside prose context
**Why it happens:** The `@tailwindcss/typography` plugin applies its own styles to `tr` and `td` elements, which may have higher specificity
**How to avoid:** Use `[&_tbody_tr:nth-child(even)]:bg-zinc-50/60` (targeting tbody rows specifically, not thead). Test that the background actually renders.
**Warning signs:** No visible striping despite class being present; check browser DevTools for specificity conflicts

## Code Examples

### Example 1: Updated markdown-content.tsx (typography + table wrapper)
```typescript
// Source: Project-specific implementation combining marked.use() + prose modifiers
import { marked, Renderer } from "marked";
import { cn } from "../lib/utils";

// Custom renderer: wrap tables in scrollable container
const defaultRenderer = new Renderer();
marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    table(...args: Parameters<typeof defaultRenderer.table>) {
      const html = defaultRenderer.table.apply(this, args);
      return `<div class="table-scroll-container overflow-x-auto -mx-2 px-2 my-4">${html}</div>`;
    },
  },
});

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const html = marked.parse(content, { async: false }) as string;

  return (
    <div
      className={cn(
        // Base: upgrade from prose-sm to prose-base (~16px body text)
        "prose prose-zinc max-w-none",
        // Headings: clear hierarchy, sans-serif
        "prose-headings:font-sans prose-headings:font-semibold prose-headings:text-zinc-900",
        "prose-h1:text-2xl prose-h1:mt-8 prose-h1:mb-4",
        "prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-h2:pb-2 prose-h2:border-b prose-h2:border-zinc-200",
        "prose-h3:text-base prose-h3:font-bold prose-h3:mt-6 prose-h3:mb-2",
        "prose-h4:text-sm prose-h4:uppercase prose-h4:tracking-wide prose-h4:font-semibold prose-h4:mt-4 prose-h4:mb-2 prose-h4:text-zinc-600",
        // Paragraphs: comfortable spacing (doubled from my-1.5)
        "prose-p:leading-relaxed prose-p:text-zinc-700 prose-p:my-3",
        // Lists: more breathing room
        "prose-li:text-zinc-700 prose-li:marker:text-zinc-400 prose-li:my-1.5",
        "prose-ul:my-3 prose-ol:my-3",
        // Strong
        "prose-strong:font-semibold prose-strong:text-zinc-800",
        // Blockquotes: tinted background + colored left border
        "prose-blockquote:border-l-4 prose-blockquote:border-indigo-300 prose-blockquote:bg-indigo-50/40 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:text-zinc-700 prose-blockquote:not-italic prose-blockquote:my-4",
        // Tables: small text for data density, internal grid only
        "prose-table:text-xs prose-table:my-0 prose-table:border-none",
        "prose-thead:border-b prose-thead:border-zinc-200",
        "prose-th:bg-zinc-100 prose-th:p-2 prose-th:text-left prose-th:font-semibold prose-th:text-zinc-900 prose-th:border-none",
        "prose-td:p-2 prose-td:border-t prose-td:border-zinc-100 prose-td:border-x-0",
        // Zebra striping
        "[&_tbody_tr:nth-child(even)]:bg-zinc-50/60",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

### Example 2: Updated document-viewer.tsx section rendering (title dedup fix)
```tsx
// Source: Project-specific -- remove JSX heading, remove <hr> dividers
{allSections.map((section, idx) => {
  const sectionImages = imagesBySection.get(section.id) || [];
  const hasImageTags = /\[Image:\s*[^\]]+\]/.test(section.section_text);
  const content = hasImageTags
    ? inlineImages(section.section_text, sectionImages)
    : section.section_text;
  return (
    <div
      key={section.id}
      id={`section-${section.section_order}`}
      className={cn("relative", idx > 0 && "mt-2")}
    >
      {/* No more <h2> for section_title -- markdown handles headings */}
      {/* No more <hr> dividers -- heading styles provide separation */}
      <MarkdownContent content={content} />

      {section.page_start != null && (
        <div className="mt-1 text-[10px] text-zinc-400">
          Page {section.page_start}
          {section.page_end && section.page_end !== section.page_start
            ? `\u2013${section.page_end}`
            : ""}
        </div>
      )}
    </div>
  );
})}
```

### Example 3: Table scroll fade indicator CSS (for app.css)
```css
/* Table scroll shadow indicators */
.table-scroll-container {
  position: relative;
}
.table-scroll-container::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 2rem;
  background: linear-gradient(to right, transparent, white);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}
.table-scroll-container.has-overflow::after {
  opacity: 1;
}
```

### Example 4: Client-side overflow detection (lightweight)
```tsx
// useEffect in document-viewer.tsx to detect table overflow
useEffect(() => {
  const containers = document.querySelectorAll('.table-scroll-container');
  const observer = new ResizeObserver(() => {
    containers.forEach((el) => {
      el.classList.toggle('has-overflow', el.scrollWidth > el.clientWidth);
    });
  });
  containers.forEach((el) => observer.observe(el));
  return () => observer.disconnect();
}, []);
```

Note: Since this is SSR on Cloudflare Workers, the `useEffect` only runs client-side after hydration -- which is exactly when we need it. The initial SSR render has no overflow detection (no `has-overflow` class), which is correct since the fade indicator only matters in the browser.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@tailwindcss/typography` v0.4 (Tailwind v3) | v0.5 with `@plugin` directive (Tailwind v4) | 2024 | Plugin config moved from tailwind.config.js to CSS `@plugin` directive; prose modifiers work the same |
| `marked` custom renderer via Renderer class subclassing | `marked.use()` with renderer overrides | marked v4+ (2022) | Simpler API; return `false` to fall back to default behavior |

**Deprecated/outdated:**
- `react-markdown` is installed in the project (v10.1.0) but NOT used by the document viewer. The minutes `FormattedText` component uses it. For document sections, `marked` is the correct choice per STATE.md decision: "Document viewer uses `marked` (not `react-markdown`) for SSR stability on Workers."

## Open Questions

1. **Sections without markdown headings (~24%)**
   - What we know: 15,522 sections have `section_title` but their `section_text` does NOT start with the same heading in markdown
   - What's unclear: Whether these sections are body-only content (acceptable without a heading) or whether the heading was lost during extraction
   - Recommendation: Proceed with removing JSX headings per user decision. Spot-check a few documents after the change. If needed, a future fix could prepend `## section_title\n\n` to sections that lack a heading -- but this is NOT in scope for this phase.

2. **Fade indicator without JavaScript**
   - What we know: A pure-CSS approach using `mask-image` exists but fades the actual content rather than overlaying a shadow
   - What's unclear: Whether the user prefers a JS-enhanced shadow/fade or a simpler CSS-only approach
   - Recommendation: Start with the pseudo-element + ResizeObserver approach (Example 3+4). It provides the best UX -- fade only appears when overflow exists. If JS complexity is a concern, fall back to CSS-only `mask-image`.

## Sources

### Primary (HIGH confidence)
- Project codebase: `apps/web/app/components/markdown-content.tsx` -- current prose styles
- Project codebase: `apps/web/app/routes/document-viewer.tsx` -- current section rendering with JSX headings
- Project codebase: `apps/web/app/app.css` -- Tailwind v4 `@plugin "@tailwindcss/typography"` config
- Project codebase: `apps/web/package.json` -- confirmed versions: marked 17.0.3, @tailwindcss/typography 0.5.19, tailwindcss 4.1.13
- Database queries: 50,280/65,802 sections have duplicate heading in markdown (76% confirmed)
- [marked v17 TypeScript declarations](https://github.com/markedjs/marked) -- `Tokens.Table` interface, `Renderer.table()` signature
- [marked.js custom table wrapper discussion](https://github.com/markedjs/marked/discussions/3571) -- confirmed `new Renderer()` + `.apply()` pattern
- [marked.js Using Pro documentation](https://marked.js.org/using_pro) -- `marked.use()` renderer override API

### Secondary (MEDIUM confidence)
- [@tailwindcss/typography GitHub](https://github.com/tailwindlabs/tailwindcss-typography) -- prose element modifiers list (prose-h1, prose-h2, prose-table, prose-tr, etc.)
- [Tailwind CSS v4 typography plugin setup](https://tailwindcss.com/blog/tailwindcss-typography) -- `@plugin` directive confirmed working with v4

### Tertiary (LOW confidence)
- None -- all findings verified against installed code and official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed, versions confirmed in package.json
- Architecture: HIGH -- patterns verified against actual codebase code and marked type declarations
- Pitfalls: HIGH -- duplicate heading count verified via database query; table overflow pattern verified via marked renderer API

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (stable domain, no fast-moving dependencies)
