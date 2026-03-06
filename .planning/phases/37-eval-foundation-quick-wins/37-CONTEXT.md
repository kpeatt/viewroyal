# Phase 37: Eval Foundation + Quick Wins - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

RAG observability/feedback infrastructure and zero-backend-work UI improvements. Users can rate AI answers (thumbs up/down), RAG traces are logged to the database for measurement, meeting list pages show summary cards with key decisions and topic indicators, and motion outcomes display as colored badges throughout the app. This phase establishes the measurement baseline that Phase 38 (RAG Intelligence) needs.

</domain>

<decisions>
## Implementation Decisions

### Feedback UX
- Thumbs up/down buttons appear below the AI answer, inline with the existing copy button and confidence badge
- Thumbs up: button highlights, brief "Thanks for your feedback" confirmation
- Thumbs down: button highlights, expands optional text field ("What was wrong?") with submit button
- Feedback is anonymous; if user happens to be logged in, associate with their user_id for richer analysis
- Users can toggle between thumbs up and down (not one-shot)

### Meeting Summary Cards
- Meeting list cards show: topic indicator chips, motion tally (e.g., "8 carried, 1 defeated"), and 2-3 lines of truncated summary text (~150 chars with ellipsis)
- Topic indicators aggregated from meeting's agenda items using existing normalize_category SQL function -- no new data source needed
- Summary text uses existing `summary` column on meetings table (already populated for most meetings)
- Motion tally computed from meeting's motions data (already available)

### Outcome Badges
- 4 color groups for motion results:
  - Green (Passed): CARRIED, CARRIED AS AMENDED, AMENDED, CARRRIED (typo)
  - Red (Failed): DEFEATED, FAILED, FAILED FOR LACK OF A SECONDER, FAILED FOR LACK OF SECONDER, NOT CARRIED
  - Yellow (Tabled): TABLED
  - Gray (Withdrawn): WITHDRAWN
- Badge text uses simplified labels: "Passed", "Failed", "Tabled", "Withdrawn"
- Badges appear everywhere motions are displayed: MotionsOverview, AgendaOverview, decisions feed, motion cards, meeting timeline, search results
- Fix CARRRIED typo in the database via migration, plus handle it in display logic as a safety net

### RAG Trace Storage
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

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AiAnswer` component (`app/components/search/ai-answer.tsx`): Has confidence indicator, copy button, research steps -- feedback buttons add to this component's footer
- `MeetingCard` component (`app/components/meeting-card.tsx`): Current card with date sidebar, status badge, provenance badges -- extend with summary/topics/tally
- `Badge` component (`app/components/ui/badge.tsx`): Existing badge with variant styling -- use for outcome badges
- `MotionsOverview` (`app/components/meeting/MotionsOverview.tsx`): Already has carried/defeated filter logic -- refactor to use shared badge component
- `normalize_category` SQL function: Maps ~300/470 agenda item categories to 8 topics -- use for topic chips
- `topic-utils.ts` (`app/lib/topic-utils.ts`): Likely has topic color/label helpers

### Established Patterns
- PostHog analytics capture in `api.ask.tsx` (lines 64-76): Already tracks trace-like data -- extend to also write to DB
- Streaming SSE pattern in `api.ask.tsx`: Events flow through ReadableStream, trace data accumulated during stream
- `createSupabaseServerClient` for authenticated writes, `getSupabaseAdminClient` for admin operations

### Integration Points
- `api.ask.tsx`: Where RAG traces are captured -- add DB write here
- New API endpoint needed for feedback submission (POST with trace_id, rating, optional comment)
- `meetings.ts` service: Query needs to include summary, topic aggregation, and motion counts for list page
- Motion result badge component: Create once, use across all motion-displaying components

</code_context>

<specifics>
## Specific Ideas

- Feedback pattern inspired by ChatGPT/Perplexity: thumbs below answer, minimal friction
- Summary cards should feel scannable -- topic chips + tally give at-a-glance value, truncated summary adds context without overwhelming
- Existing `summary` column already has good narrative summaries (checked: populated for most meetings with paragraph-length text)
- 11 distinct motion result values in DB including typos -- normalization needed at both DB and display levels

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 37-eval-foundation-quick-wins*
*Context gathered: 2026-03-05*
