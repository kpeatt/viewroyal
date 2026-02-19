# Phase 9: AI Profiling & Comparison - Research

**Researched:** 2026-02-18
**Domain:** Councillor profiling, stance analysis, data visualization, LLM summarization
**Confidence:** HIGH (codebase-driven, all data verified against live DB)

## Summary

Phase 9 enhances the existing councillor profile page (`/people/:id`) with three new capabilities: (1) speaking time metrics computed from transcript segment durations, (2) AI-generated stance summaries per topic grounded in evidence, and (3) a side-by-side councillor comparison page. The existing codebase already has a rich person profile page with voting records, attendance stats, alignment data, and a "Focus Areas" section -- this phase deepens it significantly.

The data foundation is strong: 228,128 transcript segments (212,980 attributed to speakers), 44,863 votes, 8,454 key statements (7,241 with both person_id and agenda_item_id), and 10,528 motions across 199 meetings with transcripts. However, there are two critical data challenges: (1) the 470 distinct agenda_item categories need normalization to the 8 predefined topics, and (2) transcript segments lack agenda_item_id linkage (only 847 of 228K have it), so topic-per-speaker analysis must use either time-range overlap with agenda item discussion timestamps or key_statements which do have proper linkage.

**Primary recommendation:** Pre-compute stance summaries via Gemini (pipeline or background job), store in a new `councillor_stances` table, and serve pre-computed data from the profile page loader. Do NOT generate stances at request time -- it would be too slow and expensive. Use hand-rolled SVG charts (bar charts, simple line charts) styled with Tailwind rather than adding a charting library dependency.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Stance summaries
- Position spectrum display: visual indicator showing where the councillor falls on a supports-to-opposes scale per topic, plus a brief explanation
- Evidence: 1-3 direct quotes from transcripts plus links to relevant motions/votes under each stance
- Confidence communicated two ways: visual badge (e.g., "Based on 12 statements") for quick scan + qualifier language in the summary text (e.g., "Consistently supports..." vs "Limited data suggests...")
- Low-data topics shown with a clear caveat ("Limited evidence -- based on 1-2 statements") rather than hidden

#### Topic categorization
- Hybrid approach: predefined core categories relevant to View Royal, with AI surfacing emerging topics that don't fit existing buckets
- Profile pages show only topics where the councillor has data; comparison view fills in all topics for both councillors
- Each topic gets a small icon for quick visual scanning (e.g., Housing icon, Environment icon)

#### Comparison layout
- Entry points: "Compare with..." button on councillor profile + standalone /compare page with dropdown selectors
- Lead with stance alignment: highlight topics where councillors agree/disagree, surface common ground and differences
- Overall agreement score as a percentage ("72% aligned") plus per-topic agree/disagree indicators
- Mobile: swipe left/right between councillors with a fixed comparison bar

#### Speaking time
- Headline stat (total hours spoken) + trend chart showing speaking time per meeting over time
- Ranking context: show where councillor falls among peers ("3rd most active speaker") with a bar chart of all councillors
- Default time range: last 12 months, with filters for current term and all time
- Speaking time broken down by topic (ties into topic categorization -- shows which topics the councillor speaks most about)

### Claude's Discretion
- Whether to show speaking time comparison to council average on the profile page
- Exact topic granularity (5-8 broad vs 10-15 specific) based on available data
- Chart/visualization library and styling choices
- How to handle councillors who left office mid-term
- Error states and loading patterns

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROF-02 | Councillor page shows speaking time metrics calculated from transcript segment durations | `transcript_segments` has `start_time`/`end_time` per segment with `person_id`. 9 of 13 councillors have segment data (212,980 attributed). SQL `SUM(end_time - start_time)` verified working. Topic breakdown possible via time-overlap with `agenda_items.discussion_start_time/end_time` (4,204 items have these timestamps). |
| PROF-04 | AI-generated stance summaries per councillor per topic, grounded in meeting evidence | `key_statements` table has 7,241 statements with both `person_id` and `agenda_item_id`. Combined with `votes` (44,863 total), `motions`, and `transcript_segments`, provides rich evidence for Gemini to synthesize. Pre-computed approach via new `councillor_stances` table recommended. |
| PROF-05 | Stance summaries include confidence scoring and links to source evidence | Confidence derivable from evidence count per topic. `key_statements.source_segment_ids` links back to transcript segments. `votes` link to `motions` which link to `agenda_items`. Source linking infrastructure exists (see `rag.server.ts` NormalizedSource pattern). |
| PROF-06 | User can compare two councillors side-by-side (voting record, stances, activity) | Alignment calculation already exists in `alignment-utils.ts`. Voting data, speaking time, and stance data all queryable per-person. New `/compare` route + "Compare with..." button on profile page. Existing `alignment.tsx` page provides a mature pattern for pairwise councillor analysis. |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | ^19.2.3 | UI framework | Already used throughout |
| React Router 7 | 7.12.0 | Routing, SSR loaders | Already used for all routes |
| Tailwind CSS 4 | ^4.1.13 | Styling | Project standard |
| lucide-react | ^0.562.0 | Icons (topic icons, UI elements) | Already used for all icons |
| @google/generative-ai | ^0.24.1 | Gemini API for stance generation | Already used in rag.server.ts |
| @supabase/supabase-js | ^2.90.1 | Database queries | Already used everywhere |
| shadcn/ui components | various | Card, Badge, Tabs, Dialog, etc. | Already installed: card, badge, tabs, dialog, separator, button, input, table, popover |

### New Dependencies: NONE

No new packages needed. Rationale:

| Need | Solution | Why Not a Library |
|------|----------|-------------------|
| Bar charts (speaking time, ranking) | Hand-rolled SVG + Tailwind | Project already uses CSS-width progress bars everywhere (attendance strength, voting record, focus areas). Consistent approach. Recharts adds ~45KB gzipped. |
| Line/trend chart (speaking time over time) | Hand-rolled SVG polyline + Tailwind | Simple time series with 12-50 data points. SVG polyline is trivial, SSR-safe, zero dependency. |
| Position spectrum (stance indicator) | CSS gradient bar with positioned marker | Purely visual, like the existing attendance strength bar but with a marker position. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled SVG charts | Recharts (~45KB gzipped) | Adds dependency, SSR hydration complexity on Cloudflare Workers, but would be faster to implement with tooltips/animations |
| Hand-rolled SVG charts | visx (modular, ~5-15KB per chart type) | More flexible than Recharts but steeper learning curve, still adds dependency |
| Pre-computed stances | Real-time Gemini generation | Would take 3-10s per topic per councillor. Too slow for page loads. 8 topics x 13 councillors = 104 API calls. |

**Recommendation: No new packages.** The existing project aesthetic uses CSS-width bars and simple visual indicators extensively. Hand-rolled SVG for the trend chart (the only chart type that can't be done with CSS bars) keeps consistency and avoids bundle bloat on Cloudflare Workers.

## Architecture Patterns

### Recommended New Files Structure
```
apps/web/app/
├── routes/
│   ├── person-profile.tsx          # MODIFY: add speaking time + stances
│   └── compare.tsx                 # NEW: side-by-side comparison page
├── services/
│   ├── people.ts                   # MODIFY: add speaking time queries
│   └── profiling.ts                # NEW: stance queries, comparison data
├── components/
│   └── profile/
│       ├── speaking-time-card.tsx   # Headline stat + trend chart
│       ├── speaker-ranking.tsx      # Bar chart of all councillors
│       ├── stance-summary.tsx       # Per-topic stance with evidence
│       ├── stance-spectrum.tsx      # Visual supports-to-opposes bar
│       └── topic-icon.tsx           # lucide icon mapping for topics
├── lib/
│   └── topic-utils.ts              # Category normalization, topic icons

sql/ or supabase/migrations/
├── councillor_stances table        # Pre-computed stance summaries
├── speaking_time_stats view/func   # Materialized speaking time RPCs
└── category_to_topic mapping       # Normalization function or table
```

### Pattern 1: Pre-computed Stance Summaries
**What:** Generate stance summaries via Gemini offline (pipeline or Edge Function cron), store in DB, serve from loader.
**When to use:** Always for stance summaries. Real-time generation is too expensive/slow.
**Architecture:**

```
Pipeline/Cron Job:
  For each councillor x topic:
    1. Query key_statements + votes + transcript_segments for this person + topic
    2. Send evidence to Gemini with structured output prompt
    3. Store result in councillor_stances table

Page Load:
  Loader fetches pre-computed stances from DB
  Component renders stance cards with evidence links
```

**Database schema for pre-computed stances:**
```sql
CREATE TABLE councillor_stances (
  id bigint generated by default as identity primary key,
  person_id bigint REFERENCES people(id) ON DELETE CASCADE NOT NULL,
  topic text NOT NULL,           -- 'Housing', 'Environment', etc.
  position text NOT NULL,        -- 'supports', 'opposes', 'mixed', 'neutral'
  position_score float,          -- -1.0 (strongly opposes) to 1.0 (strongly supports)
  summary text NOT NULL,         -- AI-generated 2-3 sentence summary
  evidence_quotes jsonb,         -- [{text, meeting_id, segment_id, date}]
  evidence_motion_ids bigint[],  -- Links to relevant motions
  evidence_vote_ids bigint[],    -- Links to relevant votes
  statement_count int NOT NULL,  -- Number of statements analyzed (confidence basis)
  confidence text NOT NULL,      -- 'high', 'medium', 'low'
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(person_id, topic)
);
```

### Pattern 2: Speaking Time via SQL Aggregation
**What:** Compute speaking time metrics server-side via Supabase RPC functions, not in JS.
**When to use:** For all speaking time calculations. The data volumes (228K segments) make client-side aggregation impractical.

```sql
-- Speaking time per councillor (headline stat + ranking)
CREATE OR REPLACE FUNCTION get_speaking_time_stats(
  p_person_id bigint DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  person_id bigint,
  person_name text,
  total_seconds numeric,
  meeting_count int,
  segment_count int
) ...

-- Speaking time per meeting (trend chart data)
CREATE OR REPLACE FUNCTION get_speaking_time_by_meeting(
  p_person_id bigint,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  meeting_id bigint,
  meeting_date date,
  seconds_spoken numeric,
  segment_count int
) ...
```

### Pattern 3: Category Normalization
**What:** Map the 470 distinct `agenda_items.category` values to the 8 predefined topics.
**When to use:** For speaking time by topic and for gathering evidence per topic for stance generation.

The 8 predefined topics from the `topics` table are:
1. **Administration** -- Administrative matters, council procedures, appointments
2. **Bylaw** -- Bylaw readings, amendments, enforcement
3. **Development** -- Land use, rezoning, development permits, subdivisions
4. **Environment** -- Environmental protection, parks, trails, conservation
5. **Finance** -- Budget, taxation, grants, financial planning
6. **General** -- General business, correspondence, presentations
7. **Public Safety** -- Policing, fire, emergency management, public safety
8. **Transportation** -- Roads, transit, cycling, pedestrian infrastructure

**Approach:** SQL function with CASE statement for keyword matching. Verified that this covers 297 of 470 categories with reasonable accuracy. The remaining 173 categories that fall into "General" are mostly process-oriented categories (Staff Report, Correspondence, Delegation, Reports) that genuinely ARE general-purpose. Additional topic-specific categories can be added to the mapping as a refinement.

**Discretion recommendation for topic granularity:** Use the 8 predefined topics. The data supports it -- even with the "General" catch-all, there are meaningful differences between councillors on Development, Environment, Finance, etc. Adding more granular topics (e.g., splitting Development into Housing/Zoning/Permits) would make some topics too thin on data for meaningful stance analysis. 8 topics is the sweet spot given the ~300-1100 key statements per active councillor.

### Pattern 4: Comparison Page with Dual Loaders
**What:** `/compare?a=35&b=37` loads both councillors' data in parallel.
**When to use:** For the comparison page.

```typescript
// routes/compare.tsx
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const aId = url.searchParams.get("a");
  const bId = url.searchParams.get("b");

  if (!aId || !bId) {
    // Return list of councillors for selection
    return { mode: "select", councillors: await getActiveCouncilMembers(...) };
  }

  // Load both profiles in parallel
  const [profileA, profileB, stancesA, stancesB, alignment] = await Promise.all([
    getSpeakingTimeStats(supabase, aId),
    getSpeakingTimeStats(supabase, bId),
    getCouncillorStances(supabase, aId),
    getCouncillorStances(supabase, bId),
    calculatePairwiseAlignment(supabase, aId, bId),
  ]);

  return { mode: "compare", profileA, profileB, stancesA, stancesB, alignment };
}
```

### Pattern 5: Existing Profile Page Enhancement (not replacement)
**What:** Add new sections to the existing `person-profile.tsx` rather than rewriting it.
**When to use:** For all profile page changes. The existing page has 884 lines of working, well-structured code.

The existing page already has:
- Sidebar: avatar, bio, attendance strength, voting alignment table, focus areas, AskQuestion
- Main content: voting record card, legislative proposals card, tabs (attendance history, roles & organizations), electoral history

New sections to ADD:
- **Speaking Time card** (in the sidebar, between Attendance Strength and Voting Alignment)
- **Stance Summaries** (new tab in the main content tabs, or a new section below the stats cards)
- **"Compare with..." button** (in the page header, next to the Follow button)

### Anti-Patterns to Avoid
- **Real-time stance generation:** Calling Gemini per-page-load would cost ~$0.01-0.05 per load and take 3-10 seconds. Pre-compute.
- **Client-side aggregation of speaking time:** 228K segments would mean huge data transfer. Use SQL RPCs.
- **Adding a heavy charting library:** Recharts or similar adds 45KB+ gzipped. The project's visual language is CSS-width bars and simple stats. Stay consistent.
- **Normalizing categories in JS:** 470 categories x 228K segments = do this in SQL, not application code.
- **Generating stance summaries for ALL councillors at once:** Some councillors (Graham Hill, Britton, Weisgerber, Anderson, Rast) have zero transcript segments and zero key statements but do have votes. Their stances should be generated from voting data only, with appropriate low-confidence caveats.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Voting alignment | Custom alignment algorithm | Existing `alignment-utils.ts` | Already implemented, tested, handles tenure overlap |
| Topic icons | Custom icon mapping | lucide-react icon registry | Project already uses lucide exclusively. Map topic name -> lucide icon name |
| Stance text generation | Template-based summaries | Gemini API (existing integration) | Nuanced language about positions, confidence qualification, evidence synthesis |
| Position spectrum scoring | Manual scoring rules | Gemini structured output with score | AI better at interpreting nuance from mixed evidence |

**Key insight:** The stance generation is the ONE place where AI adds genuine value that can't be achieved with rules. Everything else (speaking time, rankings, comparisons, charts) is deterministic data aggregation that should be SQL + UI code.

## Common Pitfalls

### Pitfall 1: Stale Stance Data
**What goes wrong:** Stance summaries become outdated as new meetings are ingested.
**Why it happens:** Pre-computed data needs refresh triggers.
**How to avoid:** Include `generated_at` timestamp in `councillor_stances`. Regenerate stances when new key_statements are ingested for a councillor+topic. Show "Last updated: X" in UI. Consider a `needs_refresh` boolean flag set by the ingestion pipeline.
**Warning signs:** Users notice stances don't reflect recent meetings.

### Pitfall 2: Category Normalization Miss
**What goes wrong:** Important categories mapped to "General" that should be more specific.
**Why it happens:** 470 distinct categories with inconsistent naming (e.g., "Staff Report", "Staff Reports", "Reports (Staff)" are three different values).
**How to avoid:** Create a `category_topic_map` lookup table rather than a giant CASE statement. Seed it with keyword-based defaults, allow manual overrides. Review the "General" bucket after initial deployment.
**Warning signs:** "General" topic dominates speaking time for all councillors.

### Pitfall 3: Misleading Speaking Time for Older Councillors
**What goes wrong:** Councillors who served before video recording/diarization show zero speaking time.
**Why it happens:** 4 of 13 councillors have zero transcript segments but thousands of votes. Diarization only covers recent meetings.
**How to avoid:** Show "Speaking data available from [date]" caveat. For councillors with zero segments, hide the speaking time section entirely or show "No audio transcripts available for this councillor's tenure" rather than "0 hours spoken."
**Warning signs:** Councillor ranking shows current members with 50+ hours and past members with 0 hours -- misleading comparison.

### Pitfall 4: Cloudflare Workers CPU Limits
**What goes wrong:** Complex aggregation queries or AI calls exceed the 30-second CPU limit.
**Why it happens:** Cloudflare Workers have strict execution time limits.
**How to avoid:** All heavy computation goes into Supabase RPCs (runs on Postgres, not Workers). Stance generation is pre-computed. Page loaders only fetch pre-computed data.
**Warning signs:** 522 errors on profile pages for councillors with lots of data.

### Pitfall 5: N+1 Query Problem in Comparison Page
**What goes wrong:** Loading two full profiles causes dozens of sequential DB queries.
**Why it happens:** Each profile currently makes 15 parallel queries in `getPersonProfile()`.
**How to avoid:** Create a lightweight profile summary function for comparison (speaking time + stances + key stats only). Don't load full attendance history, full vote lists, etc. for comparison view.
**Warning signs:** Comparison page takes 3+ seconds to load.

### Pitfall 6: Insufficient Evidence for Stance Confidence
**What goes wrong:** AI generates confident-sounding stances from 1-2 statements.
**Why it happens:** Some councillors have sparse data per topic.
**How to avoid:** Enforce minimum thresholds: < 3 statements = "low" confidence, 3-7 = "medium", 8+ = "high". Include statement count in the visual badge. Use qualifier language: "Limited data suggests..." vs "Consistently supports..."
**Warning signs:** Stances that feel authoritative but are based on a single comment from one meeting.

## Code Examples

### Speaking Time SQL RPC
```sql
-- Verified working against live data
CREATE OR REPLACE FUNCTION get_speaking_time_stats(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  person_id bigint,
  person_name text,
  image_url text,
  total_seconds numeric,
  meeting_count bigint,
  segment_count bigint
)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ts.person_id,
    p.name,
    p.image_url,
    round(sum(ts.end_time - ts.start_time)::numeric, 1),
    count(DISTINCT ts.meeting_id),
    count(*)
  FROM transcript_segments ts
  JOIN people p ON ts.person_id = p.id
  JOIN meetings m ON ts.meeting_id = m.id
  WHERE ts.person_id IS NOT NULL
    AND (p_start_date IS NULL OR m.meeting_date >= p_start_date)
    AND (p_end_date IS NULL OR m.meeting_date <= p_end_date)
  GROUP BY ts.person_id, p.name, p.image_url
  ORDER BY sum(ts.end_time - ts.start_time) DESC;
END;
$$;
```

### Category Normalization Function
```sql
-- Maps 470 agenda_item categories to 8 predefined topics
-- Verified: covers ~300 of 470 categories accurately
CREATE OR REPLACE FUNCTION normalize_category_to_topic(cat text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF cat IS NULL THEN RETURN 'General'; END IF;

  IF cat ILIKE ANY(ARRAY['%bylaw%', '%zoning%', '%rezoning%', '%regulatory%', '%legislat%'])
    THEN RETURN 'Bylaw';
  ELSIF cat ILIKE ANY(ARRAY['%develop%', '%planning%', '%land use%', '%permit%', '%ocp%', '%housing%', '%heritage%', '%subdivis%'])
    THEN RETURN 'Development';
  ELSIF cat ILIKE ANY(ARRAY['%environ%', '%park%', '%climate%', '%sustain%', '%trail%', '%tree%', '%conservation%', '%recreation%'])
    THEN RETURN 'Environment';
  ELSIF cat ILIKE ANY(ARRAY['%financ%', '%budget%', '%tax%', '%grant%', '%capital%', '%debt%', '%fund%'])
    THEN RETURN 'Finance';
  ELSIF cat ILIKE ANY(ARRAY['%transport%', '%traffic%', '%road%', '%transit%', '%cycl%', '%pedestr%', '%infrastruc%', '%engineer%'])
    THEN RETURN 'Transportation';
  ELSIF cat ILIKE ANY(ARRAY['%safe%', '%polic%', '%fire%', '%protect%', '%emergency%', '%rcmp%', '%enforcement%'])
    THEN RETURN 'Public Safety';
  ELSIF cat ILIKE ANY(ARRAY['%admin%', '%governance%', '%appoint%', '%committee%', '%procedur%', '%minutes%', '%agenda%', '%adjournm%', '%closed%', '%routine%', '%consent%'])
    THEN RETURN 'Administration';
  ELSE
    RETURN 'General';
  END IF;
END;
$$;
```

### Topic Icon Mapping (lucide-react)
```typescript
// app/lib/topic-utils.ts
import {
  Building2, ScrollText, MapPin, Trees, Coins,
  FileText, Shield, Car
} from "lucide-react";

export const TOPIC_ICONS: Record<string, typeof Building2> = {
  "Administration": Building2,
  "Bylaw": ScrollText,
  "Development": MapPin,
  "Environment": Trees,
  "Finance": Coins,
  "General": FileText,
  "Public Safety": Shield,
  "Transportation": Car,
};

export const TOPIC_COLORS: Record<string, string> = {
  "Administration": "text-zinc-500 bg-zinc-50 border-zinc-200",
  "Bylaw": "text-amber-600 bg-amber-50 border-amber-200",
  "Development": "text-blue-600 bg-blue-50 border-blue-200",
  "Environment": "text-green-600 bg-green-50 border-green-200",
  "Finance": "text-yellow-600 bg-yellow-50 border-yellow-200",
  "General": "text-zinc-400 bg-zinc-50 border-zinc-100",
  "Public Safety": "text-red-600 bg-red-50 border-red-200",
  "Transportation": "text-purple-600 bg-purple-50 border-purple-200",
};
```

### Hand-Rolled SVG Trend Chart Pattern
```typescript
// Simple SVG polyline chart - SSR safe, zero dependencies
function SparklineChart({ data, width = 300, height = 60 }: {
  data: { date: string; value: number }[];
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;

  const max = Math.max(...data.map(d => d.value));
  const padding = 4;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * innerW;
    const y = padding + innerH - (d.value / max) * innerH;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-blue-500"
      />
    </svg>
  );
}
```

### Stance Generation Prompt Pattern (Gemini)
```typescript
// For pre-computing stances (pipeline/Edge Function)
const stancePrompt = `You are analyzing a municipal councillor's position on a specific topic based on their statements, votes, and motions.

Councillor: ${councillorName}
Topic: ${topicName}

Evidence:
${evidenceText}

Respond with a JSON object:
{
  "position": "supports" | "opposes" | "mixed" | "neutral",
  "position_score": -1.0 to 1.0 (negative = opposes, positive = supports),
  "summary": "2-3 sentences describing the councillor's position on this topic, citing specific evidence. Use qualifier language matching the confidence level.",
  "key_quotes": [{"text": "...", "meeting_date": "...", "segment_id": ...}],
  "confidence_note": "Brief explanation of data basis"
}

Rules:
- If fewer than 3 pieces of evidence, use hedged language: "Limited data suggests..."
- If evidence is contradictory, position should be "mixed"
- Always ground claims in specific evidence (dates, vote outcomes, quotes)
- Never editorialize or express your own opinion
`;
```

## Discretion Recommendations

### Speaking time comparison to council average
**Recommendation: YES, show it.** Display a small "Council avg: X min/meeting" annotation on the per-meeting trend chart. This provides immediate context without requiring the user to visit the ranking page. Implementation is trivial -- just compute the average from the same RPC.

### Topic granularity: 8 topics
**Recommendation: Use the 8 predefined topics from the `topics` table.** Rationale:
- The most active councillor (John Rogers) has 1,131 key statements. Split across 8 topics, that's ~140 per topic on average -- plenty for meaningful analysis.
- The least active councillor with transcript data (Graham Hill) has 0 key statements but 3,265 votes -- voting data alone can still populate stances at 8-topic granularity.
- Splitting further (e.g., Development -> Housing + Zoning + Permits) would create topics with < 20 statements for many councillors, leading to low-confidence stances everywhere.
- The hybrid approach (AI surfacing emerging topics) can be implemented as an additional "Other notable positions" section per councillor, without fragmenting the core 8.

### Handling councillors who left office mid-term
**Recommendation:** Show their data with a clear "Served [start] - [end]" badge. Include them in rankings but annotate with "(partial term)". In comparison view, show "No overlap" warning if comparing two councillors who never served simultaneously. The existing `memberships` table with `start_date`/`end_date` already supports this -- the `alignment-utils.ts` code already handles tenure overlap correctly.

### Error states and loading patterns
**Recommendation:** Follow existing patterns:
- **No data:** Show the existing empty-state pattern (large muted icon + italic text). See `person-profile.tsx` lines 442-448 for the voting alignment empty state pattern.
- **Loading:** The app uses SSR with React Router loaders -- no client-side loading states needed for initial data. For the comparison page councillor selectors, use instant navigation (Link component).
- **Partial data:** Show available sections, hide unavailable ones (e.g., hide speaking time for pre-diarization councillors).
- **Stale stances:** Show "Last analyzed: [date]" in small text under the stance section header.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No stance analysis | Pre-computed AI stances from evidence | This phase | Core new feature |
| Basic "Focus Areas" (segment count by category) | Speaking time in hours, ranked, with trends | This phase | Replaces/enhances existing sidebar section |
| Individual profile only | Side-by-side comparison page | This phase | New route + entry points |
| 470 inconsistent categories | 8 normalized topics with mapping | This phase | Foundation for topic-based analysis |

**Not changing:**
- Voting record pages (`person-votes.tsx`, `person-proposals.tsx`) -- already complete
- Attendance calculation (`calculateAttendance`) -- already works
- Voting alignment (`alignment-utils.ts`, `alignment.tsx`) -- already works, reused for comparison

## Data Inventory (Live Database, 2026-02-18)

| Data Source | Count | Quality Notes |
|-------------|-------|---------------|
| Transcript segments | 228,128 total (212,980 attributed) | 93% have person_id. Only 847 have agenda_item_id. |
| Meetings with transcripts | 199 | All have diarized segments |
| Councillors (is_councillor=true) | 13 | 9 with transcript data, 4 votes-only |
| Votes | 44,863 | Well-structured, all have person_id and motion_id |
| Motions | 10,528 | All have meeting_id and agenda_item_id |
| Key statements | 8,454 (7,241 with person+agenda) | Best source for topic-per-person analysis |
| Agenda item categories | 470 distinct values | Need normalization to 8 topics |
| Topics (predefined) | 8 | Admin, Bylaw, Development, Environment, Finance, General, Public Safety, Transportation |
| Agenda items with discussion timestamps | 4,204 | Enables time-overlap topic assignment for segments |
| `agenda_item_topics` (join table) | 0 rows | Unused -- topic assignment not yet implemented |

### Per-Councillor Data Quality

| Councillor | Hours Spoken | Key Statements | Votes | Sufficient for Profiling? |
|-----------|-------------|----------------|-------|--------------------------|
| Sid Tobias (Mayor) | 59.3h | 1,080 | 1,652 | YES - rich data |
| John Rogers | 51.5h | 1,131 | 8,867 | YES - rich data |
| David Screech | 29.1h | 463 | 7,158 | YES - rich data |
| Ron Mattson | 22.3h | 577 | 5,882 | YES - rich data |
| Gery Lemon | 15.8h | 301 | 2,886 | YES - good data |
| Damian Kowalewich | 10.7h | 227 | 3,177 | YES - good data |
| Don Brown | 10.1h | 286 | 1,654 | YES - good data |
| Alison MacKenzie | 10.0h | 307 | 1,587 | YES - good data |
| Graham Hill | 0.1h | 0 | 3,265 | PARTIAL - votes only |
| Heidi Rast | 0h | 0 | 4,415 | PARTIAL - votes only |
| Aaron Weisgerber | 0h | 0 | 2,082 | PARTIAL - votes only |
| Andrew Britton | 0h | 0 | 1,754 | PARTIAL - votes only |
| Geri Anderson | 0h | 0 | 484 | MINIMAL - votes only |

## Open Questions

1. **Stance generation: Pipeline script or Edge Function cron?**
   - What we know: Gemini API integration exists in both pipeline (`ai_refiner.py`) and web app (`rag.server.ts`). Either could host the generation logic.
   - What's unclear: Whether stance generation should run as part of the Python pipeline (after ingestion) or as a standalone Edge Function on a schedule.
   - Recommendation: **Pipeline is better.** It already runs after ingestion, has access to all data, and the `google.genai` client is already configured. Add a `--generate-stances` flag to `main.py`. Edge Functions have the 30-second CPU limit.

2. **How to trigger stance refresh?**
   - What we know: The pipeline runs periodically to ingest new meetings. Stances should update after new data arrives.
   - What's unclear: Whether to regenerate all stances or only for affected councillors/topics.
   - Recommendation: Track a `last_statement_date` per councillor+topic. Only regenerate stances where new key_statements exist since `generated_at`.

3. **Mobile comparison view: swipe or stacked?**
   - What we know: User specified "swipe left/right between councillors with a fixed comparison bar."
   - What's unclear: Exact interaction pattern for the swipe -- native scroll-snap or gesture library?
   - Recommendation: CSS `scroll-snap-type: x mandatory` on a horizontal scroll container. No gesture library needed. Each councillor is a full-width snap point with a fixed header showing both names.

## Sources

### Primary (HIGH confidence)
- Live Supabase database queries (all data counts and schema verified 2026-02-18)
- Codebase analysis: `apps/web/app/routes/person-profile.tsx`, `apps/web/app/services/people.ts`, `apps/web/app/lib/alignment-utils.ts`, `apps/web/app/services/rag.server.ts`, `apps/web/app/services/analytics.ts`
- `sql/bootstrap.sql` for schema verification
- `apps/web/app/routes.ts` for existing route structure
- `apps/web/package.json` for dependency inventory

### Secondary (MEDIUM confidence)
- Recharts bundle size (~45KB gzipped) -- based on npm package stats and multiple web sources
- Cloudflare Workers 3MB bundle limit -- verified from Cloudflare documentation via web search
- SVG chart SSR compatibility -- verified by existing SVG usage patterns in the codebase (Leaflet maps, progress bars)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already in project, no new packages needed
- Architecture: HIGH -- all patterns verified against existing codebase and live data
- Data model: HIGH -- all queries verified against live database with actual row counts
- Pitfalls: HIGH -- based on actual data quality issues discovered during research (category normalization, segment-agenda linkage gaps)
- Charting approach: MEDIUM -- hand-rolled SVG recommendation is opinionated; Recharts would also work but adds bundle weight

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (stable -- no fast-moving dependencies)
