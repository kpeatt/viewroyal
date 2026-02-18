# Phase 9: AI Profiling & Comparison - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a useful profile page for each council member that helps users understand the councillor's positions, how those positions compare to their votes, and whether the councillor aligns with the user's own beliefs. Includes speaking time metrics, AI-generated stance summaries with evidence, and side-by-side councillor comparison. The core purpose is alignment discovery.

</domain>

<decisions>
## Implementation Decisions

### Stance summaries
- Position spectrum display: visual indicator showing where the councillor falls on a supports-to-opposes scale per topic, plus a brief explanation
- Evidence: 1-3 direct quotes from transcripts plus links to relevant motions/votes under each stance
- Confidence communicated two ways: visual badge (e.g., "Based on 12 statements") for quick scan + qualifier language in the summary text (e.g., "Consistently supports..." vs "Limited data suggests...")
- Low-data topics shown with a clear caveat ("Limited evidence -- based on 1-2 statements") rather than hidden

### Topic categorization
- Hybrid approach: predefined core categories relevant to View Royal, with AI surfacing emerging topics that don't fit existing buckets
- Granularity: Claude's discretion based on the data available for View Royal council
- Profile pages show only topics where the councillor has data; comparison view fills in all topics for both councillors
- Each topic gets a small icon for quick visual scanning (e.g., Housing icon, Environment icon)

### Comparison layout
- Entry points: "Compare with..." button on councillor profile + standalone /compare page with dropdown selectors
- Lead with stance alignment: highlight topics where councillors agree/disagree, surface common ground and differences
- Overall agreement score as a percentage ("72% aligned") plus per-topic agree/disagree indicators
- Mobile: swipe left/right between councillors with a fixed comparison bar

### Speaking time
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

</decisions>

<specifics>
## Specific Ideas

- "The major goal is to create a useful profile page that helps a user understand a councillor's positions and how it compares to how they vote. It should help a user know if this councillor aligns with their own beliefs."
- Alignment discovery is the north star -- every design decision should serve "does this councillor share my values?"
- Position spectrum should make agree/disagree immediately scannable without reading text
- Topic icons should feel consistent with the existing lucide-react icon set used across the app

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 09-ai-profiling-comparison*
*Context gathered: 2026-02-18*
