# Phase 37: Eval Foundation + Quick Wins - Research

**Researched:** 2026-03-05
**Domain:** RAG observability, user feedback, meeting UI enhancements
**Confidence:** HIGH

## Summary

This phase adds four capabilities to the existing React Router 7 + Supabase + Cloudflare Workers stack: (1) a feedback mechanism on AI answers, (2) RAG trace logging to the database, (3) meeting summary cards with topic chips and motion tallies, and (4) normalized motion outcome badges across the app. All four build on existing code and patterns -- no new libraries or frameworks are required.

The RAG trace and feedback work centers on `api.ask.tsx` which already captures PostHog events with trace-like data (query, model, latency, source count, tool call count). The new work adds parallel Supabase writes. Meeting card enhancements extend the existing `MeetingCard` component and require a richer query in `getMeetings()`. Motion outcome badges replace 15+ scattered inline badge implementations with a single shared component.

**Primary recommendation:** Create a shared `MotionOutcomeBadge` component and `normalizeMotionResult()` utility first, then sweep all 15+ usage sites. For RAG traces, extend the existing PostHog capture point in `api.ask.tsx` with a parallel Supabase insert, generating a trace ID that the feedback endpoint can reference.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Thumbs up/down buttons appear below the AI answer, inline with the existing copy button and confidence badge
- Thumbs up: button highlights, brief "Thanks for your feedback" confirmation
- Thumbs down: button highlights, expands optional text field ("What was wrong?") with submit button
- Feedback is anonymous; if user happens to be logged in, associate with their user_id for richer analysis
- Users can toggle between thumbs up and down (not one-shot)
- Meeting list cards show: topic indicator chips, motion tally (e.g., "8 carried, 1 defeated"), and 2-3 lines of truncated summary text (~150 chars with ellipsis)
- Topic indicators aggregated from meeting's agenda items using existing normalize_category SQL function -- no new data source needed
- Summary text uses existing `summary` column on meetings table (already populated for most meetings)
- Motion tally computed from meeting's motions data (already available)
- 4 color groups for motion results: Green (Passed), Red (Failed), Yellow (Tabled), Gray (Withdrawn)
- Badge text uses simplified labels: "Passed", "Failed", "Tabled", "Withdrawn"
- Badges appear everywhere motions are displayed
- Fix CARRRIED typo in the database via migration, plus handle it in display logic as a safety net
- New `rag_traces` table in Supabase for persisting trace data
- New `rag_feedback` table with foreign key to trace
- Continue sending events to PostHog as well (dual-write)
- No admin UI for now -- SQL access via Supabase dashboard is sufficient
- Keep existing PostHog analytics capture alongside new DB storage

### Claude's Discretion
- RAG trace table schema and which fields to include (query, answer, model, latency, tools, sources -- Claude decides the exact set)
- Loading skeleton design for summary cards
- Exact badge color values and styling
- Error state handling for feedback submission
- Whether to batch-backfill meeting summaries for meetings that lack them

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRCH-03 | User can give thumbs up/down feedback on AI answers | Feedback UI in AiAnswer footer + new `api.feedback.tsx` endpoint + `rag_feedback` table |
| SRCH-04 | RAG traces (query, tools used, latency, sources) are logged for analysis | Extend PostHog capture point in `api.ask.tsx` with Supabase insert to `rag_traces` table |
| MTGX-01 | Meeting list shows summary cards with key decisions and topic indicators | Extend `getMeetings()` query to include motion counts + topic aggregation, enhance `MeetingCard` component |
| MTGX-02 | Motion outcomes display as colored badges (passed/defeated/tabled/deferred) | Create shared `MotionOutcomeBadge` component + `normalizeMotionResult()` utility, sweep 15+ usage sites |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React Router 7 | current | SSR routing, loaders, actions | Project framework |
| Supabase JS | current | Database client, auth | Project database layer |
| Tailwind CSS 4 | current | Styling | Project CSS framework |
| shadcn/ui Badge | current | Badge primitive | Already used for motion badges |
| lucide-react | current | Icons (ThumbsUp, ThumbsDown) | Already imported in AgendaOverview |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| class-variance-authority | current | Badge variants | Already used by Badge component |
| PostHog | current (server HTTP) | Analytics dual-write | Keep existing `captureServerEvent` alongside DB writes |

### Alternatives Considered
None -- this phase uses entirely existing stack components.

**Installation:**
No new packages needed.

## Architecture Patterns

### Pattern 1: RAG Trace + Feedback Schema

**What:** Two new Supabase tables for observability data.

**Schema:**
```sql
-- RAG trace table: one row per AI answer generation
CREATE TABLE rag_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  answer text,
  model text DEFAULT 'gemini-3-flash-preview',
  latency_ms integer,
  tool_calls jsonb DEFAULT '[]',  -- [{name, args_summary}]
  source_count integer DEFAULT 0,
  sources jsonb DEFAULT '[]',     -- [{type, id, title}]
  client_ip text,
  user_id uuid REFERENCES auth.users(id),
  posthog_trace_id text,          -- cross-reference to PostHog event
  created_at timestamptz DEFAULT now()
);

-- Feedback table: one row per user feedback action
CREATE TABLE rag_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL REFERENCES rag_traces(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating IN (-1, 1)),  -- -1 = thumbs down, 1 = thumbs up
  comment text,
  user_id uuid REFERENCES auth.users(id),
  client_ip text,
  created_at timestamptz DEFAULT now()
);

-- Indexes for analysis queries
CREATE INDEX idx_rag_traces_created_at ON rag_traces(created_at DESC);
CREATE INDEX idx_rag_feedback_trace_id ON rag_feedback(trace_id);

-- RLS: allow anonymous inserts, restrict reads to service role
ALTER TABLE rag_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_feedback ENABLE ROW LEVEL SECURITY;

-- Anyone can insert traces (server-side only via admin client)
-- Anyone can insert feedback (public endpoint)
CREATE POLICY "anon_insert_feedback" ON rag_feedback
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "service_read_feedback" ON rag_feedback
  FOR SELECT TO service_role USING (true);
CREATE POLICY "service_all_traces" ON rag_traces
  FOR ALL TO service_role USING (true);
```

**Key decisions:**
- `tool_calls` as JSONB array rather than a separate table -- trace analysis is read-heavy, not join-heavy
- `rating` as smallint (-1/1) not boolean -- extensible to star ratings later, clear semantics
- Feedback uses `anon` insert policy since feedback is anonymous from public endpoint
- Traces use service_role only since they're written server-side from `api.ask.tsx`

### Pattern 2: Trace ID Propagation via SSE Stream

**What:** The trace ID must flow from server (where the trace is created) to client (where feedback buttons need it).

**How:** Add a new `AgentEvent` type to propagate the trace ID:
```typescript
// Add to AgentEvent union type
| { type: "trace_id"; traceId: string }
```

In `api.ask.tsx`, after stream completes:
1. Insert trace row into Supabase (fire-and-forget, like PostHog)
2. Emit `trace_id` event before `done` event so client captures it

The `AiAnswer` component receives the trace ID and passes it to feedback buttons.

### Pattern 3: Motion Result Normalization

**What:** A shared utility that maps 11 raw DB result values to 4 display categories.

```typescript
// app/lib/motion-utils.ts
export type MotionOutcome = 'passed' | 'failed' | 'tabled' | 'withdrawn';

const RESULT_MAP: Record<string, MotionOutcome> = {
  'CARRIED': 'passed',
  'CARRIED AS AMENDED': 'passed',
  'AMENDED': 'passed',
  'CARRRIED': 'passed',  // typo safety net
  'DEFEATED': 'failed',
  'FAILED': 'failed',
  'FAILED FOR LACK OF A SECONDER': 'failed',
  'FAILED FOR LACK OF SECONDER': 'failed',
  'NOT CARRIED': 'failed',
  'TABLED': 'tabled',
  'WITHDRAWN': 'withdrawn',
};

export function normalizeMotionResult(result: string | null | undefined): MotionOutcome | null {
  if (!result) return null;
  return RESULT_MAP[result.toUpperCase().trim()] ?? null;
}
```

**Why a utility, not inline:** This exact mapping already exists in `apps/web/app/api/ocd/serializers/vote.ts` (`mapResultToPassed`). The new utility provides richer output (4 categories vs boolean) and a single source of truth for the display layer.

### Pattern 4: Meeting Summary Card Data

**What:** Extend the `getMeetings()` query to include data for richer cards.

**Approach:** Two strategies available:
1. **Server-side aggregation (recommended):** Create an RPC or view that joins meetings with motion counts and topic arrays, returning everything in one query
2. **Client-side computation:** Fetch motions per meeting -- too many queries for a list page

**Recommended RPC:**
```sql
CREATE OR REPLACE FUNCTION get_meetings_with_stats(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  meeting_id integer,
  motion_carried_count integer,
  motion_defeated_count integer,
  motion_other_count integer,
  topics text[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id AS meeting_id,
    coalesce(sum(CASE WHEN mo.result IN ('CARRIED','CARRIED AS AMENDED','AMENDED','CARRRIED') THEN 1 ELSE 0 END), 0)::integer AS motion_carried_count,
    coalesce(sum(CASE WHEN mo.result IN ('DEFEATED','FAILED','FAILED FOR LACK OF A SECONDER','FAILED FOR LACK OF SECONDER','NOT CARRIED') THEN 1 ELSE 0 END), 0)::integer AS motion_defeated_count,
    coalesce(sum(CASE WHEN mo.result NOT IN ('CARRIED','CARRIED AS AMENDED','AMENDED','CARRRIED','DEFEATED','FAILED','FAILED FOR LACK OF A SECONDER','FAILED FOR LACK OF SECONDER','NOT CARRIED') THEN 1 ELSE 0 END), 0)::integer AS motion_other_count,
    coalesce(
      array_agg(DISTINCT normalize_category_to_topic(ai.category)) FILTER (WHERE ai.category IS NOT NULL),
      '{}'::text[]
    ) AS topics
  FROM meetings m
  LEFT JOIN motions mo ON mo.meeting_id = m.id
  LEFT JOIN agenda_items ai ON ai.meeting_id = m.id
  WHERE (p_start_date IS NULL OR m.meeting_date >= p_start_date)
    AND (p_end_date IS NULL OR m.meeting_date <= p_end_date)
  GROUP BY m.id;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = 'public';
```

This avoids N+1 queries and returns aggregated stats alongside meeting data.

### Pattern 5: Feedback API Endpoint

**What:** New `api.feedback.tsx` route for POST requests.

```typescript
// app/routes/api.feedback.tsx
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { traceId, rating, comment } = await request.json();

  // Validate
  if (!traceId || ![-1, 1].includes(rating)) {
    return Response.json({ error: "Invalid feedback" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("rag_feedback").insert({
    trace_id: traceId,
    rating,
    comment: comment || null,
    client_ip: getClientIP(request),
  });

  if (error) {
    console.error("Feedback insert error:", error);
    return Response.json({ error: "Failed to save feedback" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
```

### Anti-Patterns to Avoid
- **Inline motion color logic everywhere:** Currently 15+ files have `motion.result === "CARRIED" ? "bg-green-..." : "bg-red-..."`. Centralizing prevents bugs when new result types appear.
- **Blocking the stream on trace insert:** The Supabase insert should be fire-and-forget (like the PostHog capture). Don't `await` it in the stream path.
- **Fetching motions per meeting on list page:** This would be N+1. Use an RPC/view for aggregation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Motion result normalization | Switch statements in 15 components | Single `normalizeMotionResult()` utility + `MotionOutcomeBadge` component | Already have 15 inconsistent implementations; some only check CARRIED/DEFEATED, missing 9 other values |
| Topic aggregation per meeting | Client-side loops over agenda items | SQL RPC with `normalize_category_to_topic()` | Function already exists in DB, avoids shipping category mapping logic to client |
| Trace ID generation | Custom ID scheme | `crypto.randomUUID()` (already used for PostHog trace ID in api.ask.tsx line 66) | UUID v4 is standard, no collisions, already in use |
| Feedback rate limiting | Custom per-feedback limiter | Reuse existing `isRateLimited()` from api.ask.tsx | Same IP-based approach, same window |

## Common Pitfalls

### Pitfall 1: Stream Timing for Trace Insert
**What goes wrong:** Inserting the trace before the stream completes means `answer` and `source_count` are empty/zero.
**Why it happens:** The stream accumulates data progressively; trace data is only complete at `done` event.
**How to avoid:** Insert the trace after the stream loop completes (in the `finally` block or after `done` event), before `controller.close()`. Send `trace_id` event just before `done`.
**Warning signs:** All traces have empty `answer` fields or zero source counts.

### Pitfall 2: CARRRIED Typo Migration vs Display Safety Net
**What goes wrong:** Migration fixes existing data but pipeline may re-insert typo from source documents.
**Why it happens:** The typo originates in CivicWeb source data, not in our code.
**How to avoid:** Fix in migration AND handle in `normalizeMotionResult()`. Both layers needed.
**Warning signs:** After migration, grep for CARRRIED in future data loads.

### Pitfall 3: RLS Blocking Feedback Inserts
**What goes wrong:** Anonymous users can't submit feedback because RLS blocks the insert.
**Why it happens:** Default RLS denies all operations. Feedback endpoint uses admin client but if switched to browser client it would fail.
**How to avoid:** Use `getSupabaseAdminClient()` for the feedback insert endpoint (bypasses RLS). Alternatively, create an `anon` insert policy on `rag_feedback`.
**Warning signs:** 403 errors on feedback submission.

### Pitfall 4: Meeting Card Query Performance
**What goes wrong:** Loading the meetings list becomes slow because of joins to motions and agenda items.
**Why it happens:** Without proper indexing, the RPC joining meetings + motions + agenda_items scans large tables.
**How to avoid:** Ensure `motions.meeting_id` and `agenda_items.meeting_id` have indexes (they likely already do as foreign keys). Use `STABLE` function attribute for query caching.
**Warning signs:** Meetings list page load time exceeds 500ms.

### Pitfall 5: Feedback Toggle State
**What goes wrong:** User clicks thumbs up, then thumbs down, creating two feedback rows instead of updating.
**Why it happens:** Each click sends a new POST request.
**How to avoid:** Use UPSERT semantics -- `INSERT ... ON CONFLICT (trace_id, client_ip) DO UPDATE`. Add a unique constraint on `(trace_id, client_ip)` or `(trace_id, user_id)` to enable this.
**Warning signs:** Multiple feedback rows per trace from same user.

## Code Examples

### Feedback Buttons in AiAnswer Component
```typescript
// Additions to AiAnswer footer (after confidence indicator + copy button)
// Source: existing AiAnswer component pattern

function FeedbackButtons({ traceId }: { traceId: string | null }) {
  const [rating, setRating] = useState<-1 | 1 | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (!traceId) return null;

  const submitFeedback = async (newRating: -1 | 1) => {
    setRating(newRating);
    if (newRating === -1) {
      setShowComment(true);
      return; // Wait for optional comment
    }
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traceId, rating: newRating }),
    });
    setSubmitted(true);
  };

  // ... render thumbs up/down buttons
}
```

### MotionOutcomeBadge Component
```typescript
// app/components/motion-outcome-badge.tsx
// Source: existing Badge component + motion result patterns across codebase

import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
import { normalizeMotionResult, type MotionOutcome } from "../lib/motion-utils";

const OUTCOME_STYLES: Record<MotionOutcome, string> = {
  passed: "bg-green-100 text-green-700 border-green-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  tabled: "bg-yellow-100 text-yellow-700 border-yellow-200",
  withdrawn: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const OUTCOME_LABELS: Record<MotionOutcome, string> = {
  passed: "Passed",
  failed: "Failed",
  tabled: "Tabled",
  withdrawn: "Withdrawn",
};

interface MotionOutcomeBadgeProps {
  result: string | null | undefined;
  showVoteCounts?: boolean;
  yesVotes?: number;
  noVotes?: number;
  className?: string;
}

export function MotionOutcomeBadge({
  result,
  showVoteCounts,
  yesVotes,
  noVotes,
  className,
}: MotionOutcomeBadgeProps) {
  const outcome = normalizeMotionResult(result);
  if (!outcome) return null;

  return (
    <Badge
      variant="outline"
      className={cn(OUTCOME_STYLES[outcome], "text-xs font-bold", className)}
    >
      {OUTCOME_LABELS[outcome]}
      {showVoteCounts && yesVotes !== undefined && yesVotes > 0 && (
        <span className="ml-1 opacity-75">
          ({yesVotes}-{noVotes})
        </span>
      )}
    </Badge>
  );
}
```

### Topic Chips on Meeting Card
```typescript
// Added to MeetingCard component
// Source: existing TOPIC_COLORS from app/lib/topic-utils.ts

import { TOPIC_COLORS, TOPIC_ICONS, type TopicName } from "../lib/topic-utils";

function TopicChips({ topics }: { topics: string[] }) {
  // Filter to valid topics, limit to 4 for card space
  const validTopics = topics
    .filter((t): t is TopicName => t in TOPIC_COLORS && t !== "General")
    .slice(0, 4);

  if (validTopics.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {validTopics.map((topic) => {
        const Icon = TOPIC_ICONS[topic];
        return (
          <span
            key={topic}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border",
              TOPIC_COLORS[topic],
            )}
          >
            <Icon className="h-3 w-3" />
            {topic}
          </span>
        );
      })}
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Binary motion display (CARRIED/other) | 4-category normalization (passed/failed/tabled/withdrawn) | This phase | Handles all 11 DB values correctly |
| PostHog-only RAG analytics | Dual-write PostHog + Supabase traces | This phase | Enables SQL analysis, feedback correlation |
| No user feedback on AI answers | Thumbs up/down with optional comment | This phase | Measurement baseline for Phase 38 RAG improvements |
| Plain meeting cards (title + date) | Summary cards with topics + motion tally | This phase | At-a-glance meeting value |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via Vite) |
| Config file | `apps/web/vite.config.ts` |
| Quick run command | `cd apps/web && pnpm exec vitest run --reporter=verbose` |
| Full suite command | `cd apps/web && pnpm exec vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRCH-03 | Feedback submission persists to DB | manual-only | Manual: click thumbs up/down, verify in Supabase dashboard | N/A |
| SRCH-04 | RAG traces logged on every AI answer | manual-only | Manual: ask question, verify trace row in Supabase | N/A |
| MTGX-01 | Meeting list shows summary data | manual-only | Manual: browse /meetings, verify topic chips and tally | N/A |
| MTGX-02 | Motion badges display correctly | unit | Test `normalizeMotionResult()` utility | No -- Wave 0 |

**Justification for manual-only:** SRCH-03, SRCH-04, and MTGX-01 involve SSR loaders, Supabase integration, and SSE streaming which require E2E testing infrastructure not currently in the project. The `normalizeMotionResult()` utility is a pure function suitable for unit testing.

### Sampling Rate
- **Per task commit:** `cd apps/web && pnpm typecheck`
- **Per wave merge:** `cd apps/web && pnpm build` (catches type errors + build issues)
- **Phase gate:** Successful `pnpm build` + manual verification of all 4 success criteria

### Wave 0 Gaps
- [ ] `apps/web/app/lib/__tests__/motion-utils.test.ts` -- covers MTGX-02 normalization logic
- [ ] Supabase migration for `rag_traces` and `rag_feedback` tables
- [ ] Supabase migration to fix CARRRIED typo in existing data

## Open Questions

1. **Feedback UPSERT conflict key**
   - What we know: Users should be able to toggle between thumbs up/down. Need some conflict resolution.
   - What's unclear: Use `(trace_id, client_ip)` as unique key? What about users behind NAT sharing IPs?
   - Recommendation: Use `(trace_id, client_ip)` for anonymous users. If `user_id` is present, use `(trace_id, user_id)` instead. Implement as two separate unique partial indexes.

2. **Meeting stats query strategy**
   - What we know: Need motion counts and topics per meeting for the list page.
   - What's unclear: Whether to use an RPC function or a Supabase view or inline the join in the existing `getMeetings()` query.
   - Recommendation: Use an RPC function. It keeps the complex aggregation in SQL where `normalize_category_to_topic()` already lives, and `getMeetings()` can call it and merge results client-side by meeting_id.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `api.ask.tsx`, `ai-answer.tsx`, `meeting-card.tsx`, `MotionsOverview.tsx`, `meetings.ts`, `topic-utils.ts`, `vote.ts` serializer
- Existing `normalize_category_to_topic()` SQL function in `councillor_stances_and_speaking_time.sql` migration
- Existing `mapResultToPassed()` in `api/ocd/serializers/vote.ts` -- documents all 11 motion result values

### Secondary (MEDIUM confidence)
- PostHog server-side capture pattern in `analytics.server.ts` -- verified fire-and-forget HTTP approach works on Cloudflare Workers

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - entirely existing stack, no new dependencies
- Architecture: HIGH - patterns derived from existing codebase conventions
- Pitfalls: HIGH - identified from actual code analysis (15+ inconsistent motion badge implementations, stream timing, RLS)

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable domain, no external API changes expected)
