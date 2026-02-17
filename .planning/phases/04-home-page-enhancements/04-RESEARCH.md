# Phase 4: Home Page Enhancements - Research

**Researched:** 2026-02-16
**Domain:** React Router 7 SSR page redesign, Supabase data queries, Tailwind CSS 4 component design
**Confidence:** HIGH

## Summary

Phase 4 is a full redesign of the home route (`apps/web/app/routes/home.tsx`) with five sections: Hero (Ask input + decorative map), Upcoming Meeting, Recent Meeting recap, Active Matters, and Recent Decisions. All data already exists in the database and most query patterns are already established in the codebase. The primary engineering work is: (1) building new Supabase queries for the decisions feed and active-matters-with-summaries, (2) designing the vote breakdown visual for divided votes, (3) creating a static SVG map of View Royal for the hero background, and (4) replacing the current home page component with the new sectioned layout.

The existing `getHomeData()` in `services/site.ts` already fetches meetings, council members, and latest meeting data. It needs to be refactored to add the new sections (active matters, decisions feed) while removing sections no longer needed (council members grid, public notices). No new libraries are required -- everything uses the existing stack (React 19, React Router 7, Tailwind CSS 4, Supabase JS, lucide-react, shadcn/ui).

**Primary recommendation:** Refactor `getHomeData()` into parallel query batches, build five new section components, and replace the home route entirely. Use individual vote records (not the `yes_votes`/`no_votes` columns, which are always 0) to compute vote breakdowns for the decisions feed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Full redesign of the current home page route (replace entirely, not augment)
- Balanced density -- enough info to scan quickly without feeling cramped
- Section order top-to-bottom: Hero -> Upcoming Meeting -> Recent Meeting -> Active Matters -> Recent Decisions
- Each section has a "View all" link to existing list pages
- Responsive design is a priority -- must work well across all breakpoints, sections stack on mobile
- Account CTA visible only to logged-out users (near the hero area)
- Search-style hero: big centered Ask input with tagline above it (Google-esque, "start here")
- Subtle vector outline map of View Royal as hero background -- decorative, not interactive, low-contrast
- "Create an account to track what matters to you" CTA for logged-out users only
- Show only the next upcoming meeting (not multiple)
- Display meeting type badge (Regular, Committee of the Whole, etc.)
- Show top 3-4 agenda topic titles as preview
- When no meeting is scheduled: show "No meetings scheduled" (simple, honest)
- Separate featured section for the most recent past meeting
- Rich content: AI-generated summary paragraph + key decisions/motions from that meeting + stats (motion count, divided votes, agenda items)
- Link to full meeting detail page
- Compact cards: title + category badge + last activity date + 1-line summary
- 5-6 matters shown, ordered by recency of discussion (last discussed in recent meetings)
- Flat list, no category grouping or filtering
- Full card is clickable -> links to matter detail page
- Inline subscribe button on each card for logged-in users
- Minimal per row: plain English summary + result (Carried/Defeated)
- Vote breakdown shown as both text ("5-2") and visual indicator (colored dots or bar)
- Divided votes highlighted with accent border or "Divided" badge
- Show financial cost as badge/tag when `financial_cost` is available
- 10-15 most recent non-procedural motions

### Claude's Discretion
- Loading skeleton design for each section
- Exact spacing, typography, and color choices within the design system
- Mobile responsive breakpoint behavior
- Error state handling for sections that fail to load
- Vote visual indicator implementation (dots vs bar vs other)
- Map illustration style details (line weight, opacity, positioning)

### Deferred Ideas (OUT OF SCOPE)
- Interactive map with matters plotted by geographic location -- future phase (needs neighbourhood/location data infrastructure)
- Map-based matter browsing/filtering -- future phase
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HOME-01 | Active matters section shows 5-6 recently-active matters ordered by last_seen with title, category badge, duration, and 1-line summary | Matters have `last_seen`, `category`, `first_seen` fields. Summary must come from joining `agenda_items.plain_english_summary` since `matters.plain_english_summary` is null. Duration = `last_seen - first_seen`. See "Active Matters Query" section. |
| HOME-02 | Recent decisions feed shows last 10-15 non-procedural motions with plain English summary, result, vote breakdown, date, and link to meeting | Motions have `plain_english_summary`, `result`, `disposition`. Individual votes available in `votes` table. `yes_votes`/`no_votes` columns on motions are always 0 -- must aggregate from `votes` table. See "Decisions Feed Query" section. |
| HOME-03 | Upcoming meetings section shows next scheduled meetings with agenda topic preview | Upcoming meetings query exists. Must join `agenda_items` for topic titles. Currently future meetings have no agenda items in DB -- show "No meetings scheduled" or meeting without preview. See "Upcoming Meeting Query" section. |
| HOME-04 | Divided votes highlighted with visual indicator in decisions feed | Individual vote records exist in `votes` table with `Yes`/`No`/`Abstain`/`Recused` values. Must join votes, count by type, detect `no > 0` as divided. See "Vote Visual Indicator" section. |
| HOME-05 | Financial cost displayed on decisions when financial_cost is available | 458 motions have positive `financial_cost` values. Field exists on `motions` table. Direct select, no join needed. See "Financial Cost Display" section. |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.3 | UI framework | Already in project |
| React Router | 7.12.0 | SSR routing, loaders | Already in project, server loaders fetch data |
| Tailwind CSS | 4.1.13 | Styling | Already in project, utility-first |
| @supabase/supabase-js | 2.90.1 | Database queries | Already in project |
| lucide-react | 0.562.0 | Icons | Already in project |
| shadcn/ui (Radix) | Various | UI primitives (Badge, Card, Button) | Already in project |

### No New Libraries Needed
All five home page sections can be built with the existing stack. No new dependencies required.

## Architecture Patterns

### Recommended Component Structure
```
apps/web/app/
├── routes/
│   └── home.tsx                    # Full rewrite: loader + page component
├── services/
│   └── site.ts                     # Refactor getHomeData() to add new queries
├── components/
│   └── home/                       # NEW directory for home section components
│       ├── HeroSection.tsx         # Ask input + map bg + CTA
│       ├── UpcomingMeetingSection.tsx  # Next upcoming meeting card
│       ├── RecentMeetingSection.tsx    # Featured recent meeting recap
│       ├── ActiveMattersSection.tsx    # Matter cards with subscribe
│       └── DecisionsFeedSection.tsx    # Motions list with vote visuals
```

### Pattern 1: Parallel Query Batching in Loader
**What:** Run all independent Supabase queries in parallel using `Promise.all`, then do dependent queries in a second batch.
**When to use:** Always in loaders that need multiple data sources.
**Already used in:** `getHomeData()` in `services/site.ts` (lines 83-136).
```typescript
// Batch 1: Independent queries
const [upcomingRes, recentMeetingRes, mattersRes, decisionsRes] = await Promise.all([
  supabase.from("meetings")...
  supabase.from("meetings")...
  supabase.from("matters")...
  supabase.from("motions")...
]);

// Batch 2: Dependent queries (need IDs from batch 1)
const [agendaPreview, meetingMotions] = await Promise.all([...]);
```

### Pattern 2: Section Components with "View All" Links
**What:** Each section is a standalone component that receives data from the loader. Each includes a "View all" link to the corresponding list page.
**Already used in:** Current home page has this pattern for "Recent Meetings" -> `/meetings`.
```typescript
// In home.tsx
<RecentMeetingSection meeting={recentMeeting} stats={stats} decisions={decisions} />
<ActiveMattersSection matters={activeMatters} user={user} />
<DecisionsFeedSection decisions={recentDecisions} />
```

### Pattern 3: Auth-Conditional Rendering via Root Loader
**What:** Access user auth state from the root loader via `useRouteLoaderData("root")`.
**Already used in:** `subscribe-button.tsx`, `navbar.tsx`.
```typescript
const rootData = useRouteLoaderData("root") as { user: any } | undefined;
const user = rootData?.user;
// Show CTA only for logged-out users
{!user && <AccountCTA />}
// Show subscribe buttons only for logged-in users
{user && <SubscribeButton type="matter" targetId={matter.id} compact />}
```

### Pattern 4: Server Client for Auth-Aware Queries
**What:** Use `createSupabaseServerClient(request)` in the home loader (not `getSupabaseAdminClient`) so the subscribe button can check subscription status via the user's session.
**Already used in:** Current `home.tsx` loader (line 26).

### Anti-Patterns to Avoid
- **Don't query `matters.plain_english_summary`:** It is null for all 1,727 matters. Get summaries from the most recent `agenda_items.plain_english_summary` joined via `matter_id`.
- **Don't use `motions.yes_votes` / `motions.no_votes`:** These columns are always 0 in the database. Must aggregate from the `votes` table to get actual vote counts.
- **Don't query `agenda_items.neighborhood` from Supabase client:** The CLAUDE.md warns this column should not be added to `.select()` strings despite existing in TypeScript types.
- **Don't fetch all data in one giant query:** Split into parallel batches. The home page needs data from 5+ tables -- keep queries focused and run them concurrently.

## Database Findings

### Critical Data Issues

#### 1. Vote Counts on Motions Are Always Zero
**Finding:** `motions.yes_votes` and `motions.no_votes` columns are always 0 for all 10,436 motions with results.
**Actual data:** Individual vote records exist in the `votes` table (9,154 motions have votes). These must be aggregated.
**Impact:** The decisions feed query MUST join `votes` and count by vote type, not rely on the motions table columns.
**Confidence:** HIGH (verified via direct SQL query).

```sql
-- Correct approach: aggregate from votes table
SELECT m.id,
  count(CASE WHEN v.vote = 'Yes' THEN 1 END) as yes_count,
  count(CASE WHEN v.vote = 'No' THEN 1 END) as no_count,
  count(v.id) as total_votes
FROM motions m
LEFT JOIN votes v ON m.id = v.motion_id
GROUP BY m.id;
```

#### 2. Matters Lack Direct Summaries
**Finding:** `matters.plain_english_summary` is null for all 1,727 matters. `matters.description` is also null for all recent active matters.
**Actual data:** Summaries exist on the `agenda_items` linked to each matter via `matter_id`. The most recent agenda item's `plain_english_summary` serves as the matter's summary.
**Impact:** Active matters query must join through `agenda_items` to get a displayable summary.
**Confidence:** HIGH (verified via direct SQL query).

```sql
-- Get most recent agenda_item summary for each matter
SELECT DISTINCT ON (m.id)
  m.id, m.title, m.category, m.status, m.last_seen, m.first_seen,
  ai.plain_english_summary as summary
FROM matters m
JOIN agenda_items ai ON ai.matter_id = m.id
WHERE m.status = 'Active'
  AND ai.plain_english_summary IS NOT NULL
ORDER BY m.id, ai.created_at DESC;
```

#### 3. Duration Data is Sparse for Recent Matters
**Finding:** Most recently active matters have `first_seen = last_seen` (0 days duration). Older matters show meaningful duration spans (7 days to 5,894 days).
**Impact:** Duration display should gracefully handle "New" matters where first_seen equals last_seen. Consider showing "Since {first_seen}" rather than "X days" when duration is 0.
**Confidence:** HIGH (verified via direct SQL query).

#### 4. Financial Cost on Motions
**Finding:** 458 out of 10,436 motions with results have positive `financial_cost` values. This is roughly 4.4% of motions.
**Impact:** Financial cost badge should be conditional -- only shown when `financial_cost > 0`.
**Confidence:** HIGH (verified via direct SQL query).

#### 5. Upcoming Meetings Have No Agenda Items Yet
**Finding:** All future meetings currently have 0 agenda items and `has_agenda = false`.
**Impact:** The upcoming meeting section cannot show agenda topic previews for future meetings until agendas are posted. Must handle "no agenda yet" gracefully -- show meeting date/type/title only.
**Confidence:** HIGH (verified via direct SQL query -- 3 upcoming meetings all have 0 agenda items).

### Relevant Database Schema Summary

| Table | Key Columns for Home Page | Notes |
|-------|---------------------------|-------|
| `meetings` | id, title, type, meeting_date, summary, has_transcript, video_duration_seconds | Summary is the AI-generated recap |
| `matters` | id, title, category, status, first_seen, last_seen | No summary/description populated -- join agenda_items |
| `agenda_items` | id, meeting_id, matter_id, title, plain_english_summary, category | Source of matter summaries and meeting topic previews |
| `motions` | id, meeting_id, agenda_item_id, plain_english_summary, result, disposition, financial_cost | `yes_votes`/`no_votes` always 0 |
| `votes` | id, motion_id, person_id, vote | Real vote data -- aggregate for counts |
| `subscriptions` | id, user_id, type, matter_id, is_active | For SubscribeButton on matter cards |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vote visual indicator | Custom SVG from scratch | Tailwind colored dots (one per voter) | Simple, accessible, matches codebase patterns |
| Map background | Interactive Leaflet map | Static SVG outline from GeoJSON | Decision locks "decorative, not interactive". GeoJSON exists at `data/neighbourhoods.geojson` |
| Auth state checking | Custom auth context | `useRouteLoaderData("root")` | Already established pattern, root loader provides `user` |
| Subscribe button | New subscription component | Existing `SubscribeButton` from `subscribe-button.tsx` | Already handles all states (logged-in/out, loading, toggle) |
| Meeting list rows | New meeting display | Existing `MeetingListRow` from `meeting/meeting-list-row.tsx` | Already handles date display, badges, link behavior |
| Ask input | New search component | Existing `AskQuestion` from `ask-question.tsx` | Already handles form, navigation, example questions |

**Key insight:** Most UI primitives already exist. The work is assembling them into new section layouts and writing the data queries.

## Common Pitfalls

### Pitfall 1: Using motions.yes_votes / no_votes
**What goes wrong:** Vote breakdown shows "0-0" for every motion.
**Why it happens:** The `yes_votes` and `no_votes` columns on the `motions` table are always 0. The pipeline stores individual votes in the `votes` table but does not update the aggregate columns.
**How to avoid:** Always join and aggregate from the `votes` table. For the decisions feed, use a subquery or Supabase RPC.
**Warning signs:** All vote breakdowns showing "0-0" or blank.

### Pitfall 2: Querying matters.plain_english_summary
**What goes wrong:** Active matters section shows no summaries.
**Why it happens:** The `plain_english_summary` column on `matters` is null for all records. Summaries are stored on `agenda_items` linked via `matter_id`.
**How to avoid:** Join `agenda_items` to get the most recent `plain_english_summary` for each matter.
**Warning signs:** All matter cards missing their summary line.

### Pitfall 3: N+1 Queries for Vote Counts
**What goes wrong:** Home page loads slowly because each motion triggers a separate query for vote counts.
**Why it happens:** Naively fetching 15 motions then querying votes for each one individually.
**How to avoid:** Fetch all motions with their votes in a single query using Supabase's `.select("..., votes(vote)")` join, then aggregate client-side. Or use a Supabase RPC that returns aggregated vote counts.
**Warning signs:** Loader taking >2 seconds, visible waterfall in network tab.

### Pitfall 4: Oversized Loader Payload
**What goes wrong:** SSR response is large, slow TTFB.
**Why it happens:** Selecting too many columns (embeddings, full_text, meta) from tables that have large fields.
**How to avoid:** Use narrow `.select()` strings. Never select `embedding`, `meta`, `full_text`, `text_search`, or `debate_summary` unless needed for display.
**Warning signs:** Home page response > 50KB, slow page loads.

### Pitfall 5: Map SVG Not Found or Blocking Render
**What goes wrong:** Hero section breaks or renders slowly.
**Why it happens:** SVG loaded dynamically or from an external file, blocking first paint.
**How to avoid:** Inline the SVG as a React component or place it in the `public/` folder. Keep it lightweight (optimize paths from GeoJSON). Use CSS opacity/positioning to ensure it's decorative only.
**Warning signs:** Layout shift in hero, flash of unstyled content.

### Pitfall 6: Subscribe Button Causing Hydration Mismatch
**What goes wrong:** React hydration error on home page.
**Why it happens:** `SubscribeButton` checks auth state client-side via `useRouteLoaderData`. If server renders one state and client another, mismatch occurs.
**How to avoid:** The existing `SubscribeButton` already handles this correctly -- it renders a Link for logged-out users (consistent SSR/client) and uses `useEffect` for subscription status checking (client-only). Don't change this pattern.
**Warning signs:** Console hydration warnings mentioning subscribe elements.

## Code Examples

### Active Matters Query (with Agenda Item Summary)
```typescript
// In services/site.ts
// Fetches 6 active matters ordered by last_seen, with most recent agenda summary
const { data: activeMatters } = await supabase
  .from("matters")
  .select(`
    id, title, category, status, first_seen, last_seen
  `)
  .eq("status", "Active")
  .order("last_seen", { ascending: false, nullsFirst: false })
  .limit(6);

// For each matter, get the most recent agenda_item summary
// Best done as a single query with joins rather than N+1:
const matterIds = (activeMatters || []).map(m => m.id);
const { data: summaries } = await supabase
  .from("agenda_items")
  .select("matter_id, plain_english_summary, created_at")
  .in("matter_id", matterIds)
  .not("plain_english_summary", "is", null)
  .order("created_at", { ascending: false });

// Attach most recent summary to each matter
const summaryMap = new Map<number, string>();
(summaries || []).forEach(s => {
  if (!summaryMap.has(s.matter_id)) {
    summaryMap.set(s.matter_id, s.plain_english_summary);
  }
});
```

### Decisions Feed Query (with Vote Aggregation)
```typescript
// Fetch recent non-procedural motions with vote data
const { data: recentMotions } = await supabase
  .from("motions")
  .select(`
    id, plain_english_summary, text_content, result, disposition, financial_cost,
    meeting_id,
    meetings!inner(id, meeting_date, title),
    agenda_items!inner(category),
    votes(vote)
  `)
  .not("result", "is", null)
  .neq("disposition", "Procedural")
  .neq("agenda_items.category", "Procedural")
  .order("meeting_id", { ascending: false })
  .limit(15);

// Process vote data client-side
const decisionsWithVotes = (recentMotions || []).map(m => {
  const votes = m.votes || [];
  const yesCount = votes.filter((v: any) => v.vote === "Yes").length;
  const noCount = votes.filter((v: any) => v.vote === "No").length;
  const isDivided = noCount > 0;
  return {
    id: m.id,
    summary: m.plain_english_summary || m.text_content,
    result: m.result,
    financialCost: m.financial_cost,
    meetingId: m.meeting_id,
    meetingDate: (m.meetings as any)?.meeting_date,
    meetingTitle: (m.meetings as any)?.title,
    yesCount,
    noCount,
    isDivided,
  };
});
```

### Upcoming Meeting with Agenda Preview
```typescript
// Fetch next upcoming meeting with non-procedural agenda topics
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });

const { data: nextMeeting } = await supabase
  .from("meetings")
  .select("id, title, meeting_date, type, has_agenda, organizations(name)")
  .gt("meeting_date", today)
  .order("meeting_date", { ascending: true })
  .limit(1)
  .maybeSingle();

let agendaPreview: string[] = [];
if (nextMeeting?.has_agenda) {
  const { data: topics } = await supabase
    .from("agenda_items")
    .select("title, category")
    .eq("meeting_id", nextMeeting.id)
    .neq("category", "Procedural")
    .limit(4);
  agendaPreview = (topics || []).map(t => t.title);
}
```

### Vote Visual Indicator (Colored Dots)
```typescript
// Recommendation: colored dots representing each vote
// Matches the compact, information-dense design language
function VoteIndicator({ yesCount, noCount }: { yesCount: number; noCount: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: yesCount }).map((_, i) => (
        <div key={`y-${i}`} className="w-2 h-2 rounded-full bg-green-500" />
      ))}
      {Array.from({ length: noCount }).map((_, i) => (
        <div key={`n-${i}`} className="w-2 h-2 rounded-full bg-red-500" />
      ))}
    </div>
  );
}
```

### Hero Section with Decorative Map
```typescript
// The map SVG should be a static component, not an interactive map
// Convert data/neighbourhoods.geojson to simplified SVG paths
// Place as absolute-positioned background in the hero
function HeroSection({ shortName, user }: { shortName: string; user: any }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-blue-600 to-blue-700 text-white">
      {/* Decorative map background */}
      <div className="absolute inset-0 opacity-[0.07] pointer-events-none">
        <ViewRoyalMapOutline className="w-full h-full" />
      </div>

      <div className="relative container mx-auto px-4 py-16 max-w-5xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            What's happening in {shortName}?
          </h1>
          <p className="text-blue-100 text-lg max-w-2xl mx-auto">
            Explore council meetings, decisions, and debates...
          </p>
        </div>

        {/* Ask input -- reuse existing AskQuestion component */}
        <div className="max-w-3xl mx-auto">
          <AskQuestion title="" placeholder={`Ask anything about ${shortName}...`}
            className="bg-white text-zinc-900 shadow-2xl border-0" />
        </div>

        {/* Account CTA for logged-out users */}
        {!user && (
          <div className="text-center mt-6">
            <Link to="/signup" className="text-blue-200 hover:text-white text-sm font-medium">
              Create an account to track what matters to you →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
```

## Discretion Area Recommendations

### Loading Skeletons
**Recommendation:** Use Tailwind `animate-pulse` placeholder blocks matching each section's layout. Each section should have its own skeleton component that mirrors the real layout dimensions. Wrap each section in an error boundary so a failed query doesn't break the entire page.

### Vote Visual Indicator
**Recommendation:** Use **colored dots** (small circles, 2-3px each). Each dot = one vote. Green for Yes, Red for No. This is compact enough for a feed row, immediately readable, and maps to the "5-2" text shown alongside. A thin colored bar is an alternative but dots better show individual votes at a glance.

### Mobile Responsive Breakpoints
**Recommendation:** Single column stack on mobile (< 768px). All sections full-width, generous vertical spacing. Matter cards stack vertically. Decisions feed rows remain full-width (they're already compact). Hero input reduces padding. Use `md:` breakpoint for wider layouts.

### Error State Handling
**Recommendation:** Each section should handle its own data being null/empty gracefully:
- Upcoming Meeting: "No meetings scheduled" message
- Recent Meeting: Fall back to a simpler display if summary is missing
- Active Matters: "No active matters" (unlikely -- there are 1,109)
- Decisions Feed: "No recent decisions" (unlikely -- there are 10,436 motions)
Use `try/catch` per query batch so one failure doesn't cascade.

### Map Illustration Style
**Recommendation:** Convert GeoJSON boundaries to simplified SVG paths. Use stroke-only rendering (no fill) at 1-2px line weight. Set opacity to 5-8% (very subtle). Position absolutely behind the hero gradient. The `data/neighbourhoods.geojson` file (38KB) contains the boundary data needed.

## Existing Components to Reuse

| Component | Location | How to Use |
|-----------|----------|------------|
| `AskQuestion` | `components/ask-question.tsx` | Hero section -- pass `title=""` for headerless mode |
| `SubscribeButton` | `components/subscribe-button.tsx` | Matter cards -- pass `type="matter"` and `compact` |
| `MeetingListRow` | `components/meeting/meeting-list-row.tsx` | Could reuse for upcoming meeting display |
| `Badge` | `components/ui/badge.tsx` | Category badges, meeting type badges, financial cost |
| `Card` | `components/ui/card.tsx` | Section containers |
| `Button` | `components/ui/button.tsx` | CTA buttons |
| `formatDate` | `lib/utils.ts` | Date formatting throughout |

## Existing Route Links for "View All"

| Section | "View All" Link | Route |
|---------|----------------|-------|
| Upcoming Meeting | View all meetings | `/meetings` |
| Recent Meeting | View full meeting | `/meetings/{id}` |
| Active Matters | View all matters | `/matters` |
| Recent Decisions | (no dedicated motions page -- link to meetings) | `/meetings` |

## State of the Art

| Old Approach (Current Home) | New Approach (Phase 4) | Impact |
|------------------------------|------------------------|--------|
| Two-column layout (meetings + council sidebar) | Single-column sectioned layout (5 sections) | More focused, scannable |
| Council members grid on home | Removed from home (accessible via `/people`) | De-cluttered, council is secondary |
| Public notices from RSS | Removed from home | Simplifies loader, focuses on council activity |
| Blue gradient hero with just Ask | Blue gradient hero with Ask + decorative map + CTA | Stronger identity, clearer purpose |
| Latest meeting as main feature | Recent meeting as one of five sections | Better balanced information hierarchy |
| No active matters display | Active matters section with subscribe | Core value proposition for returning visitors |
| No decisions feed | Decisions feed with vote breakdown | Surfacing what council actually decided |

## Open Questions

1. **SVG Map Generation Approach**
   - What we know: GeoJSON exists at `data/neighbourhoods.geojson` (38KB). It contains View Royal neighbourhood boundaries.
   - What's unclear: Best tool to convert GeoJSON to optimized SVG paths. Could use SVGO + manual simplification, or a script to extract coordinates.
   - Recommendation: Convert offline using a GeoJSON-to-SVG tool (like `geojson2svg` npm package), simplify paths aggressively (it's decorative), inline as a React component. This is a one-time conversion, not a runtime operation.

2. **Decisions Feed -- Pagination vs Static**
   - What we know: Decision says 10-15 most recent non-procedural motions.
   - What's unclear: Whether to add client-side "load more" or keep it static.
   - Recommendation: Keep it static (15 items max from server) with "View all" linking to `/meetings`. No pagination complexity needed for the home page.

3. **Supabase Query for Motions with Nested Filters**
   - What we know: Need to filter motions where `disposition != 'Procedural'` AND `agenda_items.category != 'Procedural'`.
   - What's unclear: Whether Supabase PostgREST supports nested filter on joined table with `.neq()` in the same query, or if it needs a separate approach.
   - Recommendation: Use `!inner` join syntax for `agenda_items` so the filter applies correctly: `.select("..., agenda_items!inner(category)")`. If that doesn't work with `.neq()`, filter procedural agenda categories client-side after fetching.

## Sources

### Primary (HIGH confidence)
- **Direct SQL queries against production Supabase database** - Verified all data availability claims (vote counts, matter summaries, financial costs, upcoming meetings)
- **Codebase analysis** - Read all relevant service files, components, routes, types, and schema
- `apps/web/app/services/site.ts` - Current `getHomeData()` implementation
- `apps/web/app/routes/home.tsx` - Current home page (380 lines)
- `apps/web/app/lib/types.ts` - All TypeScript interfaces
- `sql/bootstrap.sql` - Full database schema (690+ lines)
- `apps/web/app/services/meetings.ts` - `getDividedDecisions()` existing pattern for vote aggregation
- `apps/web/app/components/subscribe-button.tsx` - Existing subscribe component
- `apps/web/app/components/ask-question.tsx` - Existing Ask component

### Secondary (MEDIUM confidence)
- `data/neighbourhoods.geojson` - 38KB GeoJSON file confirmed to exist for map SVG generation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries, all existing patterns verified in codebase
- Architecture: HIGH - Follows established loader/component/service patterns exactly
- Data availability: HIGH - All queries verified against live database
- Pitfalls: HIGH - Verified critical issues (zero vote counts, null summaries) with SQL evidence
- Map SVG approach: MEDIUM - GeoJSON exists, conversion approach is standard but untested

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable -- no fast-moving dependencies)
