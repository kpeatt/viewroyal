# Phase 28: Document Navigation - Research

**Researched:** 2026-02-28
**Domain:** Frontend scroll-spy navigation, cross-reference detection, responsive sidebar layout
**Confidence:** HIGH

## Summary

This phase adds two distinct features to the document viewer: (1) a table of contents sidebar with scroll-spy active section tracking, and (2) cross-reference detection that links mentions of bylaws and other documents to their pages. Both features are frontend-only -- no pipeline changes needed.

The TOC sidebar is a well-understood pattern that requires restructuring the existing `document-viewer.tsx` layout from a single-column `max-w-4xl` to a two-column layout with a sticky sidebar on desktop and a collapsible top bar on mobile. The `IntersectionObserver` API provides a clean, performant scroll-spy implementation with zero dependencies. Cross-reference detection is a server-side text-matching operation in the loader that queries the `bylaws` table and `extracted_documents` table to resolve references like "Bylaw No. 1059" into links.

**Primary recommendation:** Build the TOC as a new `DocumentTOC` component using native `IntersectionObserver` for scroll-spy. Build cross-reference detection as a utility function that runs in the loader, returning structured reference data to the client for rendering as inline badges.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **TOC sidebar layout:** Sticky left sidebar, fixed ~220px width. Only show TOC for documents with 3+ sections; below threshold, keep the current single-column layout. Long section titles truncated with ellipsis in the narrow sidebar.
- **Active section tracking:** Active section indicated by bold text + left border accent (indigo, like Tailwind docs style). Smooth scroll animation when clicking a TOC item. URL hash updates only on TOC click (not during passive scrolling) -- supports deep-linking without noisy URL changes. Scroll-spy uses top-of-viewport detection (section whose top edge is closest to the top of the screen).
- **Cross-reference detection:** Pattern matching in section_text for references like "Bylaw No. 1234", document titles, report names. Match against known documents in the database -- no pipeline changes needed. Inline cross-references rendered as chip/badge beside the referenced text (small badge with document icon + link). Cross-reference links navigate to the document viewer page (`/meetings/{id}/documents/{docId}`) or bylaw detail page, in the same tab. A "Related Documents" section at the bottom of the document collects all cross-referenced documents in one place.
- **Responsive behavior:** Desktop (lg/1024px+): Sticky left sidebar with TOC. Mobile (<1024px): Collapsible sticky top bar showing the current section name (updates via scroll-spy); tap to expand dropdown list of all sections. "Related Documents" section at the bottom uses the same layout on all screen sizes.

### Claude's Discretion
- TOC heading depth (flat list vs indented by heading level) -- pick based on actual data structure
- Exact scroll-spy implementation (IntersectionObserver vs scroll event)
- Cross-reference regex patterns and matching heuristics
- Chip/badge design details (colors, icon, sizing)
- Transition animations and timing

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOCV-04 | User sees a table of contents sidebar for long documents that highlights the current section while scrolling | TOC sidebar component with IntersectionObserver scroll-spy; section anchors already exist as `id="section-{section_order}"` |
| DOCL-03 | User sees cross-references between related documents (e.g., a staff report references a bylaw) | Server-side regex matching against bylaws table (43 bylaws, all with bylaw_number); ~4,400 sections contain "Bylaw No." patterns |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | ^19.2.3 | Component framework | Already installed |
| IntersectionObserver API | Browser native | Scroll-spy section tracking | Zero dependencies, performant, SSR-safe (client-only) |
| marked | ^17.0.3 | Markdown rendering | Already used in MarkdownContent component |
| Tailwind CSS 4 | ^4.1.13 | Styling (sticky, responsive breakpoints) | Already installed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | ^0.562.0 | Icons for cross-reference badges | Already installed, use `FileText`, `BookOpen`, `Link2` icons |
| @radix-ui/react-scroll-area | ^1.2.10 | Custom scrollbar for TOC sidebar | Already installed, use for TOC overflow scrolling |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| IntersectionObserver | scroll event + getBoundingClientRect | Scroll events fire constantly, need manual throttling; IO is designed for this |
| Custom scroll-spy | react-scrollspy-nav or similar | Extra dependency for a simple use case; IO is ~30 lines of code |
| Server-side cross-ref detection | Client-side detection | Client would need to fetch bylaws list; server already has DB access in loader |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
apps/web/app/
├── components/
│   └── document/
│       ├── DocumentTOC.tsx          # TOC sidebar + mobile top bar
│       ├── DocumentCrossRef.tsx     # Cross-reference badge component
│       └── RelatedDocuments.tsx     # Bottom "Related Documents" section
├── lib/
│   └── cross-references.ts         # Cross-reference detection logic (shared server/client)
├── routes/
│   └── document-viewer.tsx          # Restructured layout (sidebar + content)
└── services/
    └── meetings.ts                  # New query: getCrossReferenceTargets()
```

### Pattern 1: IntersectionObserver Scroll-Spy
**What:** Use IntersectionObserver to detect which section is currently visible at the top of the viewport. Each section div already has `id="section-{section_order}"`. The observer watches all sections and updates active state when sections enter/exit the viewport.
**When to use:** When tracking which element is visible during scrolling.
**Example:**
```typescript
// useScrollSpy hook
function useScrollSpy(sectionIds: string[]) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    // rootMargin: negative bottom margin means "only the top portion of the viewport counts"
    // This implements "top-of-viewport detection" per user decision
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry closest to the top of the viewport
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        // Observe intersections with the top 20% of the viewport
        rootMargin: "0px 0px -80% 0px",
        threshold: 0,
      },
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sectionIds]);

  return activeId;
}
```

### Pattern 2: Server-Side Cross-Reference Detection
**What:** In the document-viewer loader, after fetching sections, scan section_text for known patterns (bylaw numbers, document titles). Query the database to resolve matches to actual records, then return structured cross-reference data alongside the document.
**When to use:** When cross-references need to resolve to real database entities.
**Example:**
```typescript
// In loader: detect cross-references
interface CrossReference {
  pattern: string;       // "Bylaw No. 1059"
  targetType: "bylaw" | "document";
  targetId: number;
  targetTitle: string;
  targetUrl: string;     // "/bylaws/42" or "/meetings/123/documents/456"
  sectionIds: number[];  // Which sections contain this reference
}

// Extract bylaw numbers from all section text
const allText = sections.map(s => s.section_text).join("\n");
const bylawMatches = [...allText.matchAll(/Bylaw\s+No\.\s*(\d+)/gi)];
const uniqueBylawNumbers = [...new Set(bylawMatches.map(m => m[1]))];

// Query bylaws table for matches
if (uniqueBylawNumbers.length > 0) {
  const { data: matchedBylaws } = await supabase
    .from("bylaws")
    .select("id, title, bylaw_number")
    .in("bylaw_number", uniqueBylawNumbers);
  // Build CrossReference objects from matches
}
```

### Pattern 3: Responsive Layout with Sidebar
**What:** Restructure the document viewer from single-column to two-column with a sticky sidebar on desktop and a collapsible top bar on mobile. Use Tailwind's `lg:` breakpoint prefix for the split.
**When to use:** When adding a sidebar that should collapse on mobile.
**Example:**
```tsx
// Desktop: sidebar + content | Mobile: top bar + content
{showTOC && (
  <>
    {/* Mobile: sticky top bar */}
    <div className="lg:hidden sticky top-16 z-30 bg-white border-b border-zinc-200">
      <MobileTOCBar
        sections={sections}
        activeSection={activeSection}
        onSelect={scrollToSection}
      />
    </div>
    {/* Desktop: sidebar */}
    <div className="hidden lg:flex max-w-6xl mx-auto px-6">
      <aside className="w-[220px] shrink-0 sticky top-24 self-start max-h-[calc(100vh-6rem)] overflow-y-auto">
        <DesktopTOC sections={sections} activeSection={activeSection} />
      </aside>
      <main className="flex-1 min-w-0 pl-8">{/* document content */}</main>
    </div>
  </>
)}
```

### Anti-Patterns to Avoid
- **Scroll event listener without throttle:** Scroll events fire 60+ times per second. Use IntersectionObserver instead, which is built for this exact purpose.
- **Client-side database queries for cross-references:** Don't fetch bylaws from the client. The loader already has server-side DB access -- do the matching there.
- **Modifying section_text in the database:** Cross-references should be detected at render time, not stored. This keeps the data pipeline clean and references up-to-date.
- **Re-rendering full document on scroll:** The TOC highlight state should NOT trigger re-renders of the document content. Keep scroll-spy state isolated to the TOC component.
- **Hash updates on scroll:** Per user decision, URL hash should only update on TOC click, not during passive scrolling. This avoids polluting browser history.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scroll position tracking | Manual scroll event + getBoundingClientRect | IntersectionObserver | IO is purpose-built, handles edge cases (fast scrolling, resize, zoom), no throttle needed |
| Custom scrollbar in sidebar | CSS overflow styling | @radix-ui/react-scroll-area | Already installed, accessible, cross-browser consistent |
| Smooth scrolling | requestAnimationFrame loop | `element.scrollIntoView({ behavior: "smooth" })` | Native browser API, accessible, respects prefers-reduced-motion |
| Responsive breakpoint detection | window.matchMedia listener | Tailwind `lg:` prefix + CSS-only approach | Avoids hydration mismatches, no JS needed for layout switching |

**Key insight:** The TOC sidebar and scroll-spy are well-solved problems using native browser APIs. IntersectionObserver + `scrollIntoView` + Tailwind responsive classes eliminate all need for third-party libraries.

## Common Pitfalls

### Pitfall 1: Hydration Mismatch with SSR
**What goes wrong:** IntersectionObserver and scroll position don't exist on the server. If the TOC renders differently based on scroll state during SSR, React will throw hydration errors.
**Why it happens:** SSR renders with no scroll context. Client picks up with scroll position, causing state mismatch.
**How to avoid:** Initialize activeSection as `null` or the first section ID. Only start observing in a `useEffect` (client-only). Never condition server-rendered HTML on scroll state.
**Warning signs:** Console warnings about hydration mismatch on the document viewer page.

### Pitfall 2: Layout Shift When Sidebar Appears
**What goes wrong:** The current layout is `max-w-4xl` centered. Adding a sidebar shifts the content area, causing the page to "jump" on initial load.
**Why it happens:** The sidebar width wasn't accounted for in the initial layout.
**How to avoid:** When `showTOC` is true (3+ sections), always render the two-column layout -- both desktop and mobile. The mobile version hides the sidebar via `hidden lg:block` but still uses the wider container. For documents with <3 sections, keep the existing single-column `max-w-4xl` layout.
**Warning signs:** Content area width changes as you navigate between documents with different section counts.

### Pitfall 3: Cross-Reference Regex Matches False Positives
**What goes wrong:** Regex like `Bylaw No. 1` matches "Bylaw No. 1" but also captures partial matches of "Bylaw No. 1059". Additionally, numbers in section text may look like bylaw references but aren't (e.g., "Section 1234 of the Act").
**Why it happens:** Greedy or naive regex patterns without word boundary checks.
**How to avoid:** Use word boundaries in regex: `/\bBylaw\s+No\.\s*(\d+)\b/gi`. Only match against bylaw numbers that actually exist in the database. The database has only 43 bylaws -- all have `bylaw_number` set -- so false positives are easy to filter by checking the match against the actual set.
**Warning signs:** Cross-reference badges appearing for non-existent bylaws or for numbers that aren't bylaw references.

### Pitfall 4: TOC Sidebar Obscures Scroll Target
**What goes wrong:** Clicking a TOC item scrolls to the section, but the section heading ends up behind the sticky navbar or the mobile TOC bar.
**Why it happens:** `scrollIntoView` scrolls the element to the exact top of the viewport, not accounting for sticky elements.
**How to avoid:** Use `scroll-margin-top` CSS on section divs (e.g., `scroll-mt-24`) or use `scrollIntoView({ block: "start" })` with appropriate CSS offset. The navbar is sticky at `top-0` with `z-50`, so sections need a scroll margin of at least the navbar height (~64px) plus some padding.
**Warning signs:** Section headings partially hidden behind the navbar after clicking a TOC link.

### Pitfall 5: Performance with Many Sections
**What goes wrong:** Documents with 30-50+ sections create many IntersectionObserver targets, and if the TOC re-renders on every intersection event, it can feel sluggish.
**Why it happens:** IntersectionObserver fires callbacks for every observed element that enters/exits the root bounds.
**How to avoid:** The observer callback should batch updates (it receives an array of entries). Use a single `useState` for the active section ID and let React's batching handle it. For the TOC list itself, it's just 50 simple `<a>` elements -- no virtualization needed.
**Warning signs:** Janky TOC highlight updates during fast scrolling.

## Code Examples

### TOC Data Extraction from Loader
```typescript
// The loader already fetches sections with section_title and section_order.
// TOC items are derived from this data -- no additional query needed.
interface TOCItem {
  id: string;           // "section-1", "section-2", etc.
  title: string;        // section.section_title
  order: number;        // section.section_order
}

// In the component:
const tocItems: TOCItem[] = allSections.map((s) => ({
  id: `section-${s.section_order}`,
  title: s.section_title ?? `Section ${s.section_order}`,
  order: s.section_order,
}));
const showTOC = tocItems.length >= 3;
```

### Active Section Indicator (Tailwind Docs Style)
```tsx
// Indigo left border accent + bold text for active item
<a
  href={`#${item.id}`}
  onClick={(e) => {
    e.preventDefault();
    scrollToSection(item.id);
  }}
  className={cn(
    "block py-1.5 pl-3 text-sm border-l-2 transition-colors truncate",
    isActive
      ? "border-indigo-500 text-indigo-700 font-semibold"
      : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300",
  )}
>
  {item.title}
</a>
```

### Smooth Scroll with Hash Update (TOC Click Only)
```typescript
function scrollToSection(sectionId: string) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  // Update hash only on explicit click (not scroll-spy)
  history.replaceState(null, "", `#${sectionId}`);
}
```

### Cross-Reference Badge Component
```tsx
function CrossRefBadge({ ref }: { ref: CrossReference }) {
  const Icon = ref.targetType === "bylaw" ? BookOpen : FileText;
  return (
    <Link
      to={ref.targetUrl}
      className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5 hover:bg-indigo-100 transition-colors"
    >
      <Icon className="w-3 h-3" />
      <span className="truncate max-w-[150px]">{ref.pattern}</span>
    </Link>
  );
}
```

### Cross-Reference Regex Patterns
```typescript
// Pattern 1: "Bylaw No. 1059" or "Bylaw No. 1059, 2020"
const BYLAW_NO_RE = /\bBylaw\s+No\.\s*(\d+)(?:\s*,\s*\d{4})?\b/gi;

// Pattern 2: "Bylaw No. 35" (the Land Use Bylaw, commonly referenced)
// Same regex handles all bylaw number formats found in the data

// Resolution: Match extracted number against bylaws.bylaw_number
// 43 bylaws in database, all have bylaw_number set
// Only create cross-references for numbers that match actual bylaws
```

### Deep-Link Support (Initial Hash on Page Load)
```typescript
useEffect(() => {
  // On page load, if URL has a hash, scroll to that section
  const hash = window.location.hash;
  if (hash) {
    const el = document.getElementById(hash.slice(1));
    if (el) {
      // Small delay to let layout settle
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }
}, []);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| scroll event + manual position tracking | IntersectionObserver API | 2018 (broad browser support) | No throttling needed, GPU-accelerated, declarative |
| jQuery scrollspy plugins | Native browser APIs | 2020+ | Zero dependencies, better performance |
| CSS scroll-snap for TOC | scroll-margin-top + scrollIntoView | 2021+ (Safari support) | More precise control over scroll offset |

**Deprecated/outdated:**
- `scrollTop` + `offsetTop` manual calculation: Still works but IntersectionObserver is the modern replacement
- Third-party scroll-spy libraries (react-scrollspy, etc.): Unnecessary overhead for a simple use case

## Data Analysis

### Section Count Distribution
From database analysis of 16,528 extracted documents with sections:
- **1 section:** 8,089 documents (49%) -- no TOC needed
- **2 sections:** 3,680 documents (22%) -- no TOC needed
- **3+ sections:** 4,759 documents (29%) -- **TOC eligible**
- **10+ sections:** 998 documents (6%) -- strong TOC value
- **Max sections:** 53 sections in one document

The 3-section threshold is well-placed: it excludes the vast majority of short documents while capturing all documents where navigation adds value.

### Cross-Reference Patterns Found
- **4,401 sections** contain "Bylaw No." patterns (9% of all sections)
- **43 bylaws** in the database, all with `bylaw_number` set -- perfect for exact matching
- Common bylaw numbers: 35 (Land Use), 811 (OCP), 900 (Zoning), 958 (Fees), 1069 (Tree Protection)
- Pattern: `Bylaw No. {number}` is highly consistent across all documents
- Additional patterns: "report dated {date} from {role}" -- harder to match, lower priority

### Section Titles
- **All 48,418 sections** have non-null `section_title` -- flat list TOC is feasible
- Titles are already human-readable (e.g., "PURPOSE OF REPORT:", "BACKGROUND:", "RECOMMENDATION:")
- No heading hierarchy metadata exists in section data -- **use flat list** for TOC

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.x |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/web && pnpm test -- --run` |
| Full suite command | `cd apps/web && pnpm test -- --run --coverage` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | Created In |
|--------|----------|-----------|-------------------|------------|
| DOCV-04 | TOC items generated from sections with 3+ threshold | unit | `cd apps/web && pnpm vitest run tests/lib/document-toc.test.ts -t "TOC" --reporter=verbose` | 28-01 Task 1 |
| DOCV-04 | useScrollSpy hook return type contract | unit | `cd apps/web && pnpm vitest run tests/lib/document-toc.test.ts -t "scrollspy" --reporter=verbose` | 28-01 Task 1 |
| DOCL-03 | Cross-reference detection finds bylaw numbers | unit | `cd apps/web && pnpm vitest run tests/lib/cross-references.test.ts -t "bylaw" --reporter=verbose` | 28-02 Task 1 |
| DOCL-03 | Cross-reference detection ignores non-existent bylaws | unit | `cd apps/web && pnpm vitest run tests/lib/cross-references.test.ts -t "filter" --reporter=verbose` | 28-02 Task 1 |
| DOCL-03 | Cross-reference badges link to correct URL | unit | `cd apps/web && pnpm vitest run tests/lib/cross-references.test.ts -t "url" --reporter=verbose` | 28-02 Task 1 |

### Sampling Rate
- **Per task commit:** `cd apps/web && pnpm vitest run --reporter=verbose`
- **Per wave merge:** `cd apps/web && pnpm vitest run --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Test Creation
Tests are created inline within implementation tasks (no separate Wave 0):
- `tests/lib/document-toc.test.ts` -- created in 28-01 Task 1 (covers DOCV-04: TOC generation + threshold logic)
- `tests/lib/cross-references.test.ts` -- created in 28-02 Task 1 (covers DOCL-03: regex extraction + URL resolution)

## Open Questions

1. **TOC heading depth: flat vs indented?**
   - What we know: All 48,418 sections have `section_title` set. Titles are flat -- no hierarchy metadata (no heading level stored). Section titles like "BACKGROUND:", "PURPOSE OF REPORT:" are all equivalent depth.
   - What's unclear: Nothing -- the data is clear.
   - **Recommendation: Use flat list.** The data has no heading hierarchy. A flat list with `section_order` ordering is the correct representation.

2. **Cross-reference scope beyond bylaws?**
   - What we know: Bylaw references are the strongest, most consistent pattern (4,401 sections, exact number matching against 43 bylaws). "Report dated..." patterns exist (2,180 sections) but are harder to resolve to specific documents.
   - What's unclear: Whether document-title matching (e.g., matching "Official Community Plan" to a specific extracted_document) would yield useful results without too many false positives.
   - **Recommendation: Start with bylaw cross-references only.** They're high-confidence, exact-match. Document-title matching can be added later if needed. The architecture should support multiple reference types, but implementation can start with bylaws.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** -- `document-viewer.tsx`, `markdown-content.tsx`, `document-types.ts`, `meetings.ts` service layer, route configuration
- **Database queries** -- Section count distribution (48,418 sections across 16,528 documents), bylaw table (43 rows, all with bylaw_number), cross-reference pattern analysis (4,401 bylaw references)
- **IntersectionObserver API** -- MDN Web Docs (browser-native, widely supported since 2018)
- **React 19 documentation** -- useEffect for client-only side effects, avoiding hydration mismatches

### Secondary (MEDIUM confidence)
- **Tailwind CSS docs** -- `sticky`, `top-*`, `scroll-mt-*`, `lg:` responsive prefix usage patterns
- **scrollIntoView API** -- MDN Web Docs (smooth scrolling, block alignment options)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed, no new dependencies
- Architecture: HIGH -- patterns verified against existing codebase (VideoWithSidebar sticky sidebar, MarkdownContent rendering, existing section anchors)
- Pitfalls: HIGH -- verified through codebase analysis (SSR on Workers, existing layout structure, data patterns)

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable domain, no fast-moving dependencies)
