# Phase 31: Search Controls + Polish - Research

**Researched:** 2026-03-01
**Domain:** Search UI filtering/sorting with URL state, collapsible panels
**Confidence:** HIGH

## Summary

This phase adds filter/sort controls to keyword search results and polishes the AI answer layout. The codebase is well-structured for these changes: `search-results.tsx` already has client-side type filter pills (using `useState`), `source-cards.tsx` already accepts `isOpen`/`onToggle` props, and `follow-up.tsx` is a simple component ready for redesign. The main engineering challenge is adding date-range filtering, which requires modifying Supabase RPCs to accept date parameters since the current RPCs have no date filtering and apply internal LIMIT before results reach the application.

**Primary recommendation:** Modify the three hybrid search RPCs and the FTS transcript query to accept optional date boundaries (JOIN to `meetings` table), pass filter/sort params through URL search params, and keep all filtering server-side. Use Radix Popover for the dropdown controls to match existing component patterns.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- All controls live in one unified row alongside the existing type filter pills
- Time range filter is a compact dropdown button showing current selection (e.g., "Any time v")
- Sort control is also a dropdown (e.g., "Relevance v")
- Content type filters support multi-select (user can pick multiple types at once)
- Changing any filter triggers a server-side re-fetch with filter params -- not client-side filtering
- Time range options: Any time, Past week, Past month, Past year
- Sort options: Relevance, Newest first, Oldest first
- Simple flat params: `?q=parking&time=week&type=motion&type=document&sort=newest`
- Multi-select content types use repeated `&type=` params
- Default values omitted from URL -- clean URLs when no filters active
- Only non-default selections appear in the URL
- Source panel collapsed by default, showing a count header (e.g., "16 sources used")
- Uses the same subtle uppercase text toggle style as the existing Research steps toggle -- consistent visual language
- Always starts collapsed for each new AI answer (does not remember expand state across answers)
- Expand/collapse animation matches existing Research steps behavior
- "Related" section replaces the current small horizontal chips
- Starts expanded by default (visible immediately after answer)
- Collapsible -- user can toggle closed
- Full-width pill buttons stacked vertically (one suggestion per line)
- Layout order: Answer -> Sources (collapsed) -> Related (expanded) -> Follow-up input

### Claude's Discretion
- Scroll behavior when filters change (scroll to top vs. stay in place)
- Exact dropdown component implementation (native select vs. custom popover)
- Transition animations for filter changes
- "Related" section header styling and collapse icon

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRCH-01 | User can filter keyword search results by time range (Any time, Past week, Past month, Past year) | Supabase RPCs need date params added; meetings table has `meeting_date` (date type) with DESC index; all content tables have indexed `meeting_id` FK; document_sections links through `documents.meeting_id` |
| SRCH-02 | User can filter keyword search results by content type (Motions, Documents, Statements, Transcripts) | Already partially implemented: `search-results.tsx` has client-side type pills and `api.search.tsx` passes `type` params to `hybridSearchAll`. Migrate from client-side to URL-driven server-side multi-select |
| SRCH-03 | User can sort keyword search results by relevance, newest first, or oldest first | Application-side sort after enrichment with `meeting_date` (already done in `enrichWithMeetingDates`). Sort by `rank_score` (relevance) or `meeting_date` (date sorts) |
| SRCH-04 | Search filter selections persist in URL params so filtered views are shareable | `useSearchParams` from React Router already used in `search.tsx` for `q` and `id`. Extend to `time`, `type`, `sort` params |
| ANSR-01 | Source panel is collapsed by default showing a count header with expand toggle | `SourceCards` already has `isOpen`/`onToggle` props. Change default in `AiAnswer` from `useState(true)` to `useState(false)`. Update header text to "N sources used" format |
| ANSR-02 | Follow-up suggestions appear as prominent collapsible "Related" section with full-width pill buttons | Redesign `FollowUp` component: vertical stack, full-width pills, collapsible with same toggle pattern as Research steps |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React Router 7 | 7.x | `useSearchParams` for URL state | Already used in `search.tsx`; standard RR approach for filter state |
| radix-ui | 1.4.3 | Popover primitive for dropdown menus | Already installed; Popover component exists at `components/ui/popover.tsx` |
| Supabase PostgreSQL RPCs | N/A | Server-side date filtering in hybrid search | Existing RPCs need optional date params added |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | installed | Icons for filter controls (ChevronDown, Calendar, ArrowUpDown) | Already used throughout search components |
| cn() utility | N/A | Conditional classnames | Used in every component in the codebase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Radix Popover | Native `<select>` | Native selects can't be styled consistently; Popover already installed and styled |
| Radix Popover | Radix Select | Select is single-value only; Popover is more flexible for custom dropdown content |
| Server-side date filtering | Client-side filtering | RPCs have internal LIMIT (30 results); client-side filtering would discard valid results |

## Architecture Patterns

### Recommended Project Structure
```
apps/web/app/
├── components/search/
│   ├── search-filters.tsx     # NEW: unified filter row (time, type, sort dropdowns)
│   ├── search-results.tsx     # MODIFY: remove client-side type pills, accept server-filtered results
│   ├── ai-answer.tsx          # MODIFY: change sourcesOpen default to false
│   ├── source-cards.tsx       # MODIFY: update header text to "N sources used"
│   └── follow-up.tsx          # REWRITE: collapsible Related section with full-width pills
├── routes/
│   ├── search.tsx             # MODIFY: read filter/sort from URL, pass to API, pass to components
│   └── api.search.tsx         # MODIFY: accept time/sort params, pass to hybridSearchAll
└── services/
    └── hybrid-search.server.ts # MODIFY: accept date range + sort options, pass to RPCs
supabase/migrations/
    └── 31-add-date-filter-to-hybrid-search-rpcs.sql  # NEW: updated RPCs with date params
```

### Pattern 1: URL-Driven Filter State
**What:** All filter/sort state lives in URL search params, not React state. Components read from URL params and update them on change.
**When to use:** When filters must be shareable/bookmarkable (SRCH-04).
**Example:**
```typescript
// In search.tsx
const [searchParams, setSearchParams] = useSearchParams();

// Read current filter values from URL
const timeRange = searchParams.get("time") || ""; // "" = any time (default)
const sortBy = searchParams.get("sort") || "";     // "" = relevance (default)
const types = searchParams.getAll("type");          // [] = all types (default)

// Update filters (preserving other params)
function updateFilters(updates: Record<string, string | string[] | null>) {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    // Clear type params before re-adding
    if ("type" in updates) next.delete("type");
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") {
        next.delete(key); // Omit defaults from URL
      } else if (Array.isArray(value)) {
        value.forEach((v) => next.append(key, v));
      } else {
        next.set(key, value);
      }
    }
    return next;
  }, { replace: true });
}
```

### Pattern 2: Server-Side Date Filtering in RPCs
**What:** Add optional `date_from` and `date_to` parameters to hybrid search RPCs. JOIN to `meetings` table to filter by date range.
**When to use:** When date filtering must happen before the RPC's internal LIMIT clause.
**Example:**
```sql
-- Modified hybrid_search_motions with optional date filtering
CREATE OR REPLACE FUNCTION hybrid_search_motions(
  query_text text,
  query_embedding halfvec(384),
  match_count int,
  full_text_weight float DEFAULT 1,
  semantic_weight float DEFAULT 1,
  rrf_k int DEFAULT 50,
  date_from date DEFAULT NULL,
  date_to date DEFAULT NULL
)
-- ...
WITH full_text AS (
  SELECT
    m.id,
    ROW_NUMBER() OVER (...) AS rank_ix
  FROM motions m
  JOIN meetings mt ON mt.id = m.meeting_id
  WHERE m.text_search @@ websearch_to_tsquery(query_text)
    AND (date_from IS NULL OR mt.meeting_date >= date_from)
    AND (date_to IS NULL OR mt.meeting_date <= date_to)
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
),
semantic AS (
  SELECT
    m.id,
    ROW_NUMBER() OVER (...) AS rank_ix
  FROM motions m
  JOIN meetings mt ON mt.id = m.meeting_id
  WHERE m.embedding IS NOT NULL
    AND (date_from IS NULL OR mt.meeting_date >= date_from)
    AND (date_to IS NULL OR mt.meeting_date <= date_to)
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
)
-- ...
```

### Pattern 3: Collapsible Section Toggle (Existing Pattern)
**What:** Uppercase text header with ChevronDown icon, grid-rows animation for expand/collapse.
**When to use:** Research steps toggle, source panel, Related section -- all use the same pattern.
**Example (from ai-answer.tsx lines 189-205):**
```tsx
<button
  onClick={() => setOpen(!open)}
  className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-600 transition-colors mb-1"
>
  <Icon className="h-3.5 w-3.5" />
  <span>Section Title (count)</span>
  <ChevronDown className={cn(
    "h-3.5 w-3.5 transition-transform duration-200",
    open && "rotate-180",
  )} />
</button>
<div className={cn(
  "grid transition-all duration-200 ease-in-out",
  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
)}>
  <div className="overflow-hidden">{children}</div>
</div>
```

### Anti-Patterns to Avoid
- **Client-side filtering of server-paginated results:** The RPCs limit to 30 results internally. Filtering 30 results client-side by date could leave 5 results when there are actually 30 matching results in the DB. Always filter server-side before LIMIT.
- **Storing filter state in React useState:** This breaks shareability (SRCH-04). All filter state must live in URL params.
- **Adding meeting_date to content tables (denormalization):** The research flag in STATE.md asked about this. With moderate data volumes (10K motions, 8K statements) and existing indexes on `meeting_id` FKs and `meetings.meeting_date`, the JOIN approach is efficient and avoids schema changes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dropdown menus | Custom div-based dropdown | Radix Popover (already installed) | Handles focus trap, keyboard nav, click-outside, a11y |
| URL param serialization | Manual string concatenation | `URLSearchParams` API | Handles encoding, multi-value params, deletion |
| Expand/collapse animation | Height measuring JS | CSS `grid-rows-[1fr]/grid-rows-[0fr]` | Already used in codebase; pure CSS, no layout thrash |
| Date range calculation | Inline date math | Utility function mapping "week"/"month"/"year" to ISO date strings | Testable, centralized, avoids timezone bugs |

**Key insight:** The codebase already has established patterns for every UI element needed. The only novel work is the RPC modification and the URL state wiring.

## Common Pitfalls

### Pitfall 1: Date Range Calculation Timezone Issues
**What goes wrong:** `new Date()` in Cloudflare Workers uses UTC. A user searching "Past week" at 11pm PST on Monday would get results from the previous Monday UTC, not their local Monday.
**Why it happens:** Server calculates date boundaries without knowing user timezone.
**How to avoid:** Calculate date boundaries on the server using UTC. Since meetings are stored as `date` (not `timestamptz`), UTC comparison is fine -- meeting_date has no timezone component. Use `CURRENT_DATE` in SQL or `new Date().toISOString().split('T')[0]` in JS.
**Warning signs:** Off-by-one day at the boundary of time range filters.

### Pitfall 2: Filter Reset on New Search
**What goes wrong:** User has filters active, submits a new query, but filters persist causing confusing empty results.
**Why it happens:** URL params for filters survive across query changes.
**How to avoid:** When submitting a new search query, preserve filter params. This is actually desired behavior -- if the user filtered to "Past year, Motions only", they likely want the same filters for their next query. But provide a clear "Reset filters" affordance.
**Warning signs:** Users confused by empty results after searching with active narrow filters.

### Pitfall 3: document_sections Date Filter Path
**What goes wrong:** `document_sections` links through `documents.document_id` -> `documents.meeting_id` -> `meetings.meeting_date` (two JOINs), not directly to meetings.
**Why it happens:** Schema design: document_sections belong to documents, which belong to meetings.
**How to avoid:** The `hybrid_search_document_sections` RPC must JOIN through `documents` then `meetings` for date filtering. This is a different JOIN path than the other three content types.
**Warning signs:** Missing date filter on document section results.

### Pitfall 4: Multi-Select Type Pills and Server Fetch
**What goes wrong:** Currently type pills filter client-side (in `search-results.tsx` using `useState`). Migrating to server-side means each pill click triggers a new fetch.
**Why it happens:** UX expectation mismatch -- client-side filtering is instant, server-side has latency.
**How to avoid:** Accept the latency trade-off (server-side is necessary for correctness with date + type combined). Show loading state during refetch. The fetch is fast (~200ms for hybrid search).
**Warning signs:** Perceived sluggishness when clicking type pills.

### Pitfall 5: Source Panel Default State Reset
**What goes wrong:** Source panel stays expanded from previous answer when a new AI answer streams in.
**Why it happens:** `sourcesOpen` state in `AiAnswer` persists across answer updates since the component doesn't unmount.
**How to avoid:** Reset `sourcesOpen` to `false` whenever a new stream starts. Use a `useEffect` keyed to the streaming/answer state, or reset in the parent.
**Warning signs:** Source panel open for new answer with stale sources visible.

## Code Examples

Verified patterns from existing codebase:

### Date Range Calculation Utility
```typescript
// Map time range param values to date boundaries
export function getDateRange(timeRange: string): { from: string | null; to: string | null } {
  if (!timeRange) return { from: null, to: null };

  const now = new Date();
  const to = now.toISOString().split("T")[0]; // Today as YYYY-MM-DD

  switch (timeRange) {
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { from: d.toISOString().split("T")[0], to };
    }
    case "month": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return { from: d.toISOString().split("T")[0], to };
    }
    case "year": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return { from: d.toISOString().split("T")[0], to };
    }
    default:
      return { from: null, to: null };
  }
}
```

### Popover Dropdown Button (Time Range)
```tsx
import { Popover, PopoverTrigger, PopoverContent } from "~/components/ui/popover";
import { ChevronDown, Calendar } from "lucide-react";

const TIME_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
  { value: "year", label: "Past year" },
] as const;

function TimeRangeDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = TIME_OPTIONS.find((o) => o.value === value) || TIME_OPTIONS[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300 transition-all">
          <Calendar className="h-3.5 w-3.5 text-zinc-400" />
          {current.label}
          <ChevronDown className="h-3 w-3 text-zinc-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-40 p-1">
        {TIME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => { onChange(opt.value); setOpen(false); }}
            className={cn(
              "w-full text-left px-3 py-1.5 text-xs rounded-md transition-colors",
              value === opt.value ? "bg-blue-50 text-blue-700 font-bold" : "text-zinc-600 hover:bg-zinc-50",
            )}
          >
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
```

### Modified hybridSearchAll with Date/Sort Options
```typescript
export async function hybridSearchAll(
  query: string,
  options?: {
    types?: ContentType[];
    limit?: number;
    dateFrom?: string | null;  // YYYY-MM-DD
    dateTo?: string | null;    // YYYY-MM-DD
    sort?: "relevance" | "newest" | "oldest";
  },
): Promise<UnifiedSearchResult[]> {
  const limit = options?.limit ?? 30;
  const types = options?.types;
  const dateFrom = options?.dateFrom || null;
  const dateTo = options?.dateTo || null;
  const sort = options?.sort || "relevance";

  const embedding = await generateQueryEmbedding(query);

  // Build parallel search promises, passing date params
  // ... (pass dateFrom/dateTo to each RPC call)

  // After enrichWithMeetingDates:
  if (sort === "newest") {
    allResults.sort((a, b) => {
      if (!a.meeting_date && !b.meeting_date) return 0;
      if (!a.meeting_date) return 1;
      if (!b.meeting_date) return -1;
      return b.meeting_date.localeCompare(a.meeting_date);
    });
  } else if (sort === "oldest") {
    allResults.sort((a, b) => {
      if (!a.meeting_date && !b.meeting_date) return 0;
      if (!a.meeting_date) return 1;
      if (!b.meeting_date) return -1;
      return a.meeting_date.localeCompare(b.meeting_date);
    });
  } else {
    allResults.sort((a, b) => b.rank_score - a.rank_score);
  }

  return allResults.slice(0, limit);
}
```

### Redesigned FollowUp Component (Related Section)
```tsx
function FollowUp({ suggestions, onSelect, disabled }: FollowUpProps) {
  const [isOpen, setIsOpen] = useState(true); // Starts expanded

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-600 transition-colors mb-2"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>Related</span>
        <ChevronDown className={cn(
          "h-3.5 w-3.5 transition-transform duration-200",
          isOpen && "rotate-180",
        )} />
      </button>
      <div className={cn(
        "grid transition-all duration-200 ease-in-out",
        isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}>
        <div className="overflow-hidden">
          <div className="flex flex-col gap-2">
            {suggestions.map((q) => (
              <button
                key={q}
                onClick={() => onSelect(q)}
                disabled={disabled}
                className="w-full text-left px-4 py-2.5 bg-zinc-100 hover:bg-blue-50 hover:text-blue-700 rounded-xl text-sm text-zinc-600 transition-colors font-medium disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client-side type filtering | Server-side type + date filtering | This phase | Correct result counts, shareable URLs |
| `useState` for filter state | `useSearchParams` for URL state | This phase | Bookmarkable, shareable filter views |
| Source panel open by default | Source panel collapsed by default | This phase | Cleaner answer layout, less visual noise |
| Small horizontal follow-up chips | Full-width vertical Related pills | This phase | More prominent follow-up engagement |

## Open Questions

1. **document_sections date filter performance with double JOIN**
   - What we know: `document_sections` -> `documents` -> `meetings` requires two JOINs. Current data: 54K document_sections, 738 meetings. There's an index on `documents.meeting_id` (FK) but we should verify.
   - What's unclear: Whether the double JOIN adds meaningful latency vs. single JOIN for other content types.
   - Recommendation: Implement with double JOIN. Data volumes are small enough that this won't be a problem. Monitor and denormalize later if needed (add `meeting_id` directly to `document_sections`).

2. **Sort by date for document_sections without meeting_date**
   - What we know: `document_sections` has no `meeting_id` (goes through `documents`). The `enrichWithMeetingDates` function currently skips document_sections (`meeting_id: null` in the mapping).
   - What's unclear: Whether document_sections should be included in date sorts at all.
   - Recommendation: Enrich document_sections with `meeting_date` by joining through `documents` -> `meetings`. Update `enrichWithMeetingDates` to handle `document_id` lookups. Or better, return `meeting_date` directly from the RPC.

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
| SRCH-01 | Date range filter produces correct date boundaries | unit | `cd apps/web && pnpm vitest run tests/lib/date-range.test.ts -x` | No -- Wave 0 |
| SRCH-02 | Type filter multi-select serializes to/from URL params | unit | `cd apps/web && pnpm vitest run tests/lib/search-params.test.ts -x` | No -- Wave 0 |
| SRCH-03 | Sort by relevance/newest/oldest produces correct ordering | unit | `cd apps/web && pnpm vitest run tests/services/hybrid-search-sort.test.ts -x` | No -- Wave 0 |
| SRCH-04 | URL params round-trip (serialize -> deserialize -> same state) | unit | `cd apps/web && pnpm vitest run tests/lib/search-params.test.ts -x` | No -- Wave 0 |
| ANSR-01 | Source panel default state is collapsed | manual-only | N/A -- visual UI state, no server logic to test | N/A |
| ANSR-02 | Follow-up section renders as collapsible vertical pills | manual-only | N/A -- visual UI layout, no server logic to test | N/A |

### Sampling Rate
- **Per task commit:** `cd apps/web && pnpm vitest run --run`
- **Per wave merge:** `cd apps/web && pnpm vitest run --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lib/date-range.test.ts` -- covers SRCH-01 (date boundary calculations)
- [ ] `tests/lib/search-params.test.ts` -- covers SRCH-02, SRCH-04 (URL param serialization)
- [ ] `tests/services/hybrid-search-sort.test.ts` -- covers SRCH-03 (sort ordering logic)

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `apps/web/app/routes/search.tsx`, `api.search.tsx`, `components/search/*.tsx`, `services/hybrid-search.server.ts`
- Supabase DB query: table structure confirmed (motions, key_statements, transcript_segments have `meeting_id` FK; document_sections has `document_id` FK; meetings has `meeting_date` date column)
- Supabase DB query: indexes confirmed (`idx_meetings_date` on `meetings.meeting_date DESC`, `idx_motions_meeting_id`, `idx_key_statements_meeting_id`, `idx_transcripts_meeting_id`)
- Supabase DB query: data volumes confirmed (10.5K motions, 8.5K key_statements, 228K transcript_segments, 54.7K document_sections, 738 meetings spanning 2008-2026)
- SQL migration file: `supabase/migrations/08-01-all-hybrid-search-migrations.sql` -- current RPC definitions

### Secondary (MEDIUM confidence)
- Radix UI Popover: already installed (`radix-ui@1.4.3`) and wrapped at `components/ui/popover.tsx` -- confirmed by package.json and codebase grep

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and used in the codebase
- Architecture: HIGH - patterns established in existing code, straightforward extension
- Pitfalls: HIGH - identified from direct codebase analysis (schema relationships, RPC limits, state management)

**Research date:** 2026-03-01
**Valid until:** 2026-03-31 (stable domain, no external API dependencies)
