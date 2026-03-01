# Phase 31: Search Controls + Polish - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can filter and sort keyword search results by time range and content type, sort by relevance/date, and share filtered views via URL params. The AI answer layout gets two polish improvements: source panel collapses by default, and follow-up suggestions become a prominent "Related" section with full-width pills.

</domain>

<decisions>
## Implementation Decisions

### Filter & sort controls
- All controls live in one unified row alongside the existing type filter pills
- Time range filter is a compact dropdown button showing current selection (e.g., "Any time ▾")
- Sort control is also a dropdown (e.g., "Relevance ▾")
- Content type filters support multi-select (user can pick multiple types at once)
- Changing any filter triggers a server-side re-fetch with filter params — not client-side filtering
- Time range options: Any time, Past week, Past month, Past year
- Sort options: Relevance, Newest first, Oldest first

### URL state
- Simple flat params: `?q=parking&time=week&type=motion&type=document&sort=newest`
- Multi-select content types use repeated `&type=` params
- Default values omitted from URL — clean URLs when no filters active
- Only non-default selections appear in the URL

### Source panel collapse
- Source panel collapsed by default, showing a count header (e.g., "16 sources used")
- Uses the same subtle uppercase text toggle style as the existing Research steps toggle — consistent visual language
- Always starts collapsed for each new AI answer (does not remember expand state across answers)
- Expand/collapse animation matches existing Research steps behavior

### Follow-up redesign
- "Related" section replaces the current small horizontal chips
- Starts expanded by default (visible immediately after answer)
- Collapsible — user can toggle closed
- Full-width pill buttons stacked vertically (one suggestion per line)
- Layout order: Answer → Sources (collapsed) → Related (expanded) → Follow-up input

### Claude's Discretion
- Scroll behavior when filters change (scroll to top vs. stay in place)
- Exact dropdown component implementation (native select vs. custom popover)
- Transition animations for filter changes
- "Related" section header styling and collapse icon

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The key constraint is visual consistency: dropdowns and toggles should feel like they belong alongside the existing type pills and Research steps toggle.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `search-results.tsx`: Already has type filter pills with counts — extend this row with time/sort dropdowns
- `source-cards.tsx`: SourceCards component with `isOpen`/`onToggle` props — just change default to collapsed
- `follow-up.tsx`: FollowUp component — redesign in place
- `ai-answer.tsx`: Orchestrates source panel and follow-up — adjust layout order and default states
- `cn()` utility from `~/lib/utils`: Used throughout for conditional classnames

### Established Patterns
- `useSearchParams` from React Router already used for `q` and `id` — extend for filter/sort params
- Client-side filter pills in `search-results.tsx` use `useState` — migrate to URL-driven state
- Collapsible sections use `grid-rows-[1fr]`/`grid-rows-[0fr]` animation pattern (seen in ai-answer.tsx)
- Dropdown-style UI can use shadcn/Radix Popover or Select components

### Integration Points
- `api.search.tsx` loader needs new query params: `time`, `type`, `sort`
- `hybridSearchAll` in `hybrid-search.server.ts` needs to accept filter/sort arguments
- Server-side Supabase queries need date filtering and sort clauses
- `search.tsx` route needs to read filter/sort from URL params and pass to API calls

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 31-search-controls-polish*
*Context gathered: 2026-03-01*
