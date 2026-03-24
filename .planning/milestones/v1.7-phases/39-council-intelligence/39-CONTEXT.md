# Phase 39: Council Intelligence - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can understand each councillor's priorities, positions, and notable votes through AI-generated profiles grounded in evidence. This phase covers: topic taxonomy classification of agenda items, AI profile narrative generation, key vote detection, and a redesigned council member profile page. No new data sources or scraping -- all data already exists in the DB.

</domain>

<decisions>
## Implementation Decisions

### AI Profile Content
- Rich narrative profile: 2-3 paragraph AI-generated summary covering overall priorities, notable patterns, and evolution over time
- Replaces the current brief `councillor_highlights.overview` text with a more substantive narrative
- Data sources for synthesis: Claude's discretion on the optimal mix (voting records, transcript segments, stances, motions proposed, attendance, speaking time by topic)
- Regeneration: pipeline-triggered after ingestion finds new data for a councillor (adds a pipeline phase)
- Transparency: show "AI-generated profile - Updated [date]" disclaimer on the profile, similar to existing stance confidence badges
- Timestamp and AI disclaimer both visible to build trust

### Topic Taxonomy
- Keep flat 8-topic system (Administration, Bylaw, Development, Environment, Finance, General, Public Safety, Transportation) -- no sub-topics for now
- Classification method: use existing `normalize_category_to_topic()` SQL function for the ~300 known category mappings, then Gemini AI fallback for the ~170 unmapped categories based on agenda item title + category
- Backfill all 12K agenda items into the `agenda_item_topics` junction table
- Single primary topic per agenda item (no multi-topic assignment)
- Items classified as "General" are hidden from profile-level topic analysis to filter out procedural items and keep profiles focused on meaningful policy areas

### Key Vote Detection
- Three detection patterns: minority position (voted against majority), close votes (e.g., 4-3 split), ally breaks (councillors who usually agree voted differently)
- Pre-computed in pipeline: detect key votes during ingestion, store in a new `key_votes` table for fast page loads
- Display: timeline cards with context showing motion text snippet, vote split, this councillor's vote, why it's notable, and link to meeting
- Show top 10-15 most notable key votes on the profile, ranked by composite score (close margin + minority position + ally break)
- "View all key votes" link for the complete list

### Profile Page Layout
- Enhanced tab structure (keep current tab navigation pattern)
- New tabs: "Profile" (AI narrative + at-a-glance stats), "Policy" (positions by topic), "Key Votes" tab alongside existing Votes, Attendance, Proposals tabs
- At-a-glance stats card: Claude's discretion on content and design, based on available data and existing person card patterns
- Policy tab display: Claude's discretion on whether to enhance existing StanceSummary cards or use them as-is
- Contextual "Ask about [Name]" section on the profile page, pre-filled with councillor context, reusing existing AskQuestion component and RAG infrastructure

### Claude's Discretion
- Optimal data mix for AI profile narrative (which sources to synthesize, weighting)
- At-a-glance stats card content and visual design
- Whether to enhance StanceSummary cards or reuse as-is in the Policy tab
- Composite scoring formula for key vote ranking
- Ally-break detection threshold (how aligned must councillors normally be before a break is notable)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `councillor_stances` table (106 rows): Pre-computed per-topic stance data with position scores, evidence quotes, confidence levels
- `councillor_highlights` table (8 rows): AI-generated overview + notable position highlights per councillor
- `StanceSummary` component (`app/components/profile/stance-summary.tsx`): Renders stance cards with topic icons, spectrum bars, evidence sections
- `StanceSpectrum` component (`app/components/profile/stance-spectrum.tsx`): Visual position indicator
- `SpeakingTimeCard` + `SpeakerRanking` components: Speaking time visualization
- `HighlightCard` in `person-profile.tsx`: Renders notable position cards with for/against/nuanced styling
- `AskQuestion` component: Already imported in person-profile.tsx -- wire up with councillor context
- `topic-utils.ts`: `TOPICS`, `TOPIC_ICONS`, `TOPIC_COLORS` -- complete icon and color system for all 8 topics
- `profiling.ts` service: `getCouncillorStances()`, `getCouncillorHighlights()`, `getSpeakingTimeStats()`, `getSpeakingTimeByTopic()`
- `normalize_category_to_topic()` SQL function: Maps ~300/470 categories to 8 topics
- `agenda_item_topics` table: Exists but empty (0 rows) -- ready for classification backfill
- `topics` table: 8 rows matching the TOPICS constant
- `people.ts` service: `getPersonProfile()` -- massive parallel loader with 15 concurrent queries
- Badge, Card, Tabs components from shadcn/ui

### Established Patterns
- Pipeline-triggered regeneration: existing pattern from stances/highlights generation
- Gemini lazy singleton pattern (`getGenAI()`) for AI calls
- `getSupabaseAdminClient()` for server-side writes
- Fire-and-forget pattern for non-blocking inserts
- Tab-based profile layout with shared hero area above tabs

### Integration Points
- `person-profile.tsx` loader: Add key votes and enhanced profile data to the existing Promise.all
- `profiling.ts` service: Add key vote queries and enhanced profile fetch functions
- Pipeline: Add topic classification step and key vote detection step after ingestion
- `agenda_item_topics` table: Populate via backfill script + ongoing classification in pipeline
- New `key_votes` table needed for pre-computed key vote storage

</code_context>

<specifics>
## Specific Ideas

- Profile narrative should synthesize across all data to paint a picture of "what does this councillor care about and how do they act on it"
- Key vote cards should clearly explain WHY a vote is notable (not just show the data) -- e.g., "Voted against the 5-2 majority" or "Broke from usual ally Councillor Smith"
- "General" topic items filtered from profiles ensures councillors aren't characterized by procedural votes
- Pipeline-triggered regeneration keeps profiles current without manual intervention or wasteful scheduled runs
- Contextual ask feature leverages existing RAG infrastructure -- just pre-fills the search with councillor context

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 39-council-intelligence*
*Context gathered: 2026-03-12*
