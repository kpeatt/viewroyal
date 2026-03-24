# Phase 39: Council Intelligence - Research

**Researched:** 2026-03-12
**Domain:** Topic classification, AI profile generation, key vote detection, profile page UI
**Confidence:** HIGH

## Summary

Phase 39 builds council intelligence features on top of a mature existing stack. All data sources already exist in the database (votes, motions, transcript segments, key statements, agenda items with categories). The existing profiling infrastructure (stance_generator.py, profile_agent.py, councillor_stances table, councillor_highlights table) provides proven patterns for Gemini-based AI generation, evidence gathering, and database upsert. The web frontend has established components (StanceSummary, StanceSpectrum, HighlightCard) and a tab-based profile layout that can be extended.

The three main technical domains are: (1) topic classification backfill using the existing `normalize_category_to_topic()` SQL function plus Gemini fallback for ~170 unmapped categories, populating the existing `agenda_item_topics` junction table; (2) key vote detection via algorithmic analysis of the `votes` and `motions` tables to find minority positions, close votes, and ally breaks; (3) profile page redesign adding new tabs and an enhanced AI narrative. No new external libraries are needed -- this phase uses existing Gemini, Supabase, React Router, and shadcn/ui patterns.

**Primary recommendation:** Follow the existing stance_generator.py pattern for all pipeline work (Gemini singleton, evidence gathering, JSON parsing, upsert). Extend the existing tab layout for the profile page. Pre-compute key votes in the pipeline for fast page loads.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Rich narrative profile: 2-3 paragraph AI-generated summary covering overall priorities, notable patterns, and evolution over time
- Replaces the current brief `councillor_highlights.overview` text with a more substantive narrative
- Regeneration: pipeline-triggered after ingestion finds new data for a councillor (adds a pipeline phase)
- Transparency: show "AI-generated profile - Updated [date]" disclaimer
- Keep flat 8-topic system (no sub-topics)
- Classification: existing `normalize_category_to_topic()` SQL function first, Gemini AI fallback for ~170 unmapped categories
- Backfill all 12K agenda items into `agenda_item_topics` junction table
- Single primary topic per agenda item
- "General" topic items hidden from profile-level topic analysis
- Three key vote detection patterns: minority position, close votes, ally breaks
- Pre-computed in pipeline, stored in new `key_votes` table
- Display top 10-15 most notable key votes ranked by composite score
- "View all key votes" link for complete list
- Enhanced tab structure: "Profile" (AI narrative + stats), "Policy" (positions by topic), "Key Votes" tab alongside existing tabs
- Contextual "Ask about [Name]" section on profile page using existing AskQuestion component

### Claude's Discretion
- Optimal data mix for AI profile narrative (which sources to synthesize, weighting)
- At-a-glance stats card content and visual design
- Whether to enhance StanceSummary cards or reuse as-is in the Policy tab
- Composite scoring formula for key vote ranking
- Ally-break detection threshold

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CNCL-01 | Agenda items classified into topic taxonomy | `agenda_item_topics` table exists (empty), `normalize_category_to_topic()` SQL function exists, `topics` table has 8 rows. Backfill script + Gemini fallback for unmapped categories. |
| CNCL-02 | AI-generated profile summaries per councillor | Existing `councillor_highlights` table with `overview` field. Existing `profile_agent.py` generates highlights via Gemini. Enhance to produce richer 2-3 paragraph narratives. |
| CNCL-03 | Key votes algorithmically detected | `votes` table has per-person per-motion votes. `motions` table has `yes_votes`, `no_votes` counts and `result`. New `key_votes` table needed for pre-computed results. |
| CNCL-04 | Profile page shows stats, AI summary, policy positions, key votes | Existing `person-profile.tsx` has sidebar + main content layout. Existing `StanceSummary`, `HighlightCard`, `AskQuestion` components. Add tabs for Profile/Policy/Key Votes. |
</phase_requirements>

## Standard Stack

### Core (all existing -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| google-genai (Python) | current | Gemini API for classification + profile generation | Already used in stance_generator.py, profile_agent.py |
| supabase-py | current | Database reads/writes in pipeline | Already used throughout pipeline |
| @supabase/supabase-js | current | Database reads in web app | Already used in all services |
| React Router 7 | current | SSR routing + loaders | Already the app framework |
| shadcn/ui (Tabs, Card, Badge) | current | UI components | Already used on profile page |
| lucide-react | current | Icons | Already used, TOPIC_ICONS defined |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Tailwind CSS 4 | current | Styling | Already used everywhere |
| TOPIC_COLORS / TOPIC_ICONS from topic-utils.ts | N/A | Topic visual system | For all topic-related UI elements |

### Alternatives Considered
None -- all tools are already in use. No new dependencies needed.

## Architecture Patterns

### Recommended Project Structure
```
apps/pipeline/
  pipeline/profiling/
    stance_generator.py          # EXISTING: stance + highlights generation
    profile_agent.py             # EXISTING: embedding-powered profile agent
    topic_classifier.py          # NEW: topic classification + backfill
    key_vote_detector.py         # NEW: key vote detection algorithm
  main.py                       # Add --classify-topics, --detect-key-votes flags

apps/web/
  app/routes/person-profile.tsx  # MODIFY: add tabs, restructure layout
  app/services/profiling.ts      # MODIFY: add key votes + enhanced profile queries
  app/components/profile/
    stance-summary.tsx           # EXISTING: reuse as-is in Policy tab
    stance-spectrum.tsx          # EXISTING: reuse as-is
    key-vote-card.tsx            # NEW: key vote timeline card component
    profile-summary.tsx          # NEW: AI narrative + stats card component

supabase/migrations/
  39-01-topic-classification.sql # NEW: backfill agenda_item_topics
  39-02-key-votes-table.sql      # NEW: key_votes table + RLS
  39-03-enhanced-profiles.sql    # NEW: updated councillor_highlights schema if needed
```

### Pattern 1: Pipeline Gemini Classification (topic_classifier.py)
**What:** Classify unmapped agenda items using Gemini, following the stance_generator.py pattern
**When to use:** For the ~170 categories that `normalize_category_to_topic()` maps to "General"
**Example:**
```python
# Follow existing singleton pattern from stance_generator.py
def classify_unmapped_categories(supabase):
    """Batch-classify categories that normalize_category_to_topic returns 'General' for."""
    # 1. Query distinct categories where normalize returns 'General'
    # 2. Batch them into a single Gemini call (all ~170 fit in one prompt)
    # 3. Store mapping results
    # 4. Populate agenda_item_topics for all 12K items
```

### Pattern 2: Key Vote Detection Algorithm
**What:** Algorithmic (not AI) detection of notable votes from the votes + motions tables
**When to use:** Pre-compute during pipeline runs, store in `key_votes` table
**Algorithm design:**
```python
def detect_key_votes(supabase, person_id: int):
    """Detect notable votes for a councillor.

    Three detection patterns:
    1. Minority position: person voted against the majority result
       - Motion CARRIED but person voted No, or DEFEATED but voted Yes
    2. Close votes: total margin <= 2 (e.g., 4-3, 5-4)
       - Uses motions.yes_votes and motions.no_votes
    3. Ally breaks: person and a usually-aligned councillor voted differently
       - Requires pairwise alignment baseline from existing alignment data

    Composite score = weighted sum of:
       - is_minority * 3
       - closeness_factor (inverse of margin) * 2
       - ally_break_count * 1 per ally broken
    """
```

### Pattern 3: Profile Page Tab Restructure
**What:** Move from current flat layout to tabbed layout with Profile/Policy/Key Votes
**When to use:** Reorganize the existing person-profile.tsx component
**Current layout:**
```
Sidebar: Bio Card, Quick Stats, AskQuestion
Main: Overview+Highlights, Topic Stances, Voting section, Tabs(Speaking/Attendance/Roles)
```
**New layout:**
```
Sidebar: Bio Card, Enhanced Stats Card, AskQuestion
Main: Tabs
  - Profile: AI Narrative (replaces current overview), At-a-Glance Stats
  - Policy: StanceSummary cards (moved from current position)
  - Key Votes: Timeline cards with context
  - Votes: Existing voting record + alignment (moved from current position)
  - Speaking: Existing speaking time data
  - Attendance: Existing attendance table
```

### Pattern 4: Database Schema for Key Votes
**What:** New `key_votes` table for pre-computed notable votes
```sql
CREATE TABLE key_votes (
  id bigint generated by default as identity primary key,
  person_id bigint REFERENCES people(id) ON DELETE CASCADE NOT NULL,
  motion_id bigint REFERENCES motions(id) ON DELETE CASCADE NOT NULL,
  vote text NOT NULL,                    -- 'Yes', 'No', 'Abstain'
  detection_type text[] NOT NULL,        -- ['minority', 'close_vote', 'ally_break']
  composite_score float NOT NULL,        -- for ranking
  context_summary text,                  -- AI-generated: "Voted against the 5-2 majority on..."
  ally_breaks jsonb,                     -- [{person_id, person_name, usual_alignment}]
  vote_split text,                       -- "5-2" or "4-3"
  generated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(person_id, motion_id)
);
```

### Anti-Patterns to Avoid
- **Real-time key vote computation:** Never compute key votes at request time. The alignment baseline calculation requires cross-referencing all shared votes between councillor pairs. Pre-compute in pipeline.
- **Multi-topic assignment:** CONTEXT.md locks single primary topic per item. Don't add multi-topic support.
- **Replacing StanceSummary:** The existing component works well. Reuse it in the Policy tab rather than rebuilding.
- **AI classification for all categories:** Only use Gemini for the ~170 unmapped categories. The ~300 already mapped by `normalize_category_to_topic()` should use the SQL function directly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Category-to-topic mapping | Custom Python mapping | `normalize_category_to_topic()` SQL function | Already handles ~300/470 categories, battle-tested |
| Topic icons/colors | Hardcoded per-component | `TOPIC_ICONS` and `TOPIC_COLORS` from topic-utils.ts | Centralized, consistent across all topic displays |
| AI text generation | Custom API wrapper | Existing `_call_gemini()` + `_parse_json_response()` from stance_generator.py | Handles retries, JSON fencing cleanup, rate limiting |
| Evidence enrichment | Manual meeting_id lookup | `_enrich_quotes_with_meeting_id()` from stance_generator.py | Handles date matching, prefix matching, fallbacks |
| Profile data fetching | Separate API calls | Extend existing `Promise.all` in person-profile.tsx loader | Parallel loading pattern already established |

## Common Pitfalls

### Pitfall 1: agenda_item_topics Backfill Performance
**What goes wrong:** Inserting 12K rows one-by-one is slow, hitting Supabase rate limits
**Why it happens:** Naive loop over all agenda items with individual inserts
**How to avoid:** Batch the backfill. First, query all agenda items with their categories. Use `normalize_category_to_topic()` in a single SQL UPDATE/INSERT. For unmapped categories, batch-classify with Gemini (all ~170 categories fit in a single prompt), then bulk-insert.
**Warning signs:** Script takes more than 2-3 minutes, 429 errors from Supabase

### Pitfall 2: Ally Break Threshold
**What goes wrong:** Setting threshold too low flags normal variation as "ally breaks"; too high misses real breaks
**Why it happens:** Councillors have baseline alignment rates varying from ~70% to ~98%
**How to avoid:** Use relative threshold: flag when alignment on a specific vote deviates from the pair's overall alignment rate. Recommend: pair must normally agree >= 80% of the time, and this vote must be a disagreement.
**Warning signs:** Every councillor has dozens of "ally breaks" (threshold too low) or none (too high)

### Pitfall 3: councillor_highlights Table Schema
**What goes wrong:** The `councillor_highlights` table exists in the codebase (used in profiling.ts, stance_generator.py) but was NOT found in any migration file. It may have been created manually or via a migration not tracked in git.
**Why it happens:** Table was likely created during Phase 9 but the migration wasn't named conventionally
**How to avoid:** Before modifying the schema, verify the table exists in production with `\d councillor_highlights`. The current code expects: `id, person_id, highlights (jsonb), overview (text), generated_at (timestamptz)`. The enhanced narrative should either extend the `overview` field or add a new `narrative` column.
**Warning signs:** Migration fails due to column already existing, or profile data disappears

### Pitfall 4: Profile Page Component Size
**What goes wrong:** person-profile.tsx is already 892 lines. Adding tabs + key votes + enhanced profile makes it unmanageable
**Why it happens:** All profile sections defined in a single file
**How to avoid:** Extract each tab's content into its own component file (ProfileTab, PolicyTab, KeyVotesTab, etc.). Keep person-profile.tsx as orchestrator with loader + tab shell only.
**Warning signs:** File exceeds 1000 lines, multiple developers can't work on different tabs simultaneously

### Pitfall 5: Motion Vote Count Data Quality
**What goes wrong:** `motions.yes_votes` and `motions.no_votes` may be 0 even when individual votes exist in the `votes` table
**Why it happens:** Vote counts on motions are scraped from minutes text, while individual `votes` rows come from roll call parsing. They may not always agree.
**How to avoid:** For key vote detection, compute vote counts from the `votes` table directly (COUNT per motion grouped by vote value), don't rely solely on `motions.yes_votes/no_votes`.
**Warning signs:** Key vote detector finds no close votes despite known controversial motions

## Code Examples

### Topic Classification Backfill (SQL approach)
```sql
-- Step 1: Populate agenda_item_topics for items where normalize_category_to_topic works
INSERT INTO agenda_item_topics (agenda_item_id, topic_id)
SELECT ai.id, t.id
FROM agenda_items ai
JOIN topics t ON t.name = normalize_category_to_topic(ai.category)
ON CONFLICT DO NOTHING;
```

### Key Vote Detection Query
```sql
-- Find minority position votes for a person
SELECT v.id as vote_id, v.vote, v.motion_id, v.person_id,
       m.text_content, m.result, m.yes_votes, m.no_votes,
       m.meeting_id, mtg.meeting_date,
       ai.title as agenda_item_title
FROM votes v
JOIN motions m ON v.motion_id = m.id
JOIN meetings mtg ON m.meeting_id = mtg.id
LEFT JOIN agenda_items ai ON m.agenda_item_id = ai.id
WHERE v.person_id = $1
  AND (
    (upper(m.result) IN ('CARRIED', 'CARRIED AS AMENDED') AND upper(v.vote) = 'NO')
    OR
    (upper(m.result) IN ('DEFEATED', 'NOT CARRIED') AND upper(v.vote) = 'YES')
  )
ORDER BY mtg.meeting_date DESC;
```

### Extending the Profile Loader
```typescript
// In person-profile.tsx loader, add to existing Promise.all:
const [data, speakingTimeRanking, ..., keyVotes, enhancedProfile] =
  await Promise.all([
    getPersonProfile(supabase, id, page, municipality.id),
    // ... existing calls ...
    getKeyVotes(supabase, personId).catch((e) => { console.error(e); return []; }),
    getEnhancedProfile(supabase, personId).catch((e) => { console.error(e); return null; }),
  ]);
```

### Key Vote Card Component Pattern
```typescript
// Follow HighlightCard pattern from person-profile.tsx
function KeyVoteCard({ keyVote }: { keyVote: KeyVote }) {
  return (
    <div className="rounded-xl border p-4 space-y-2 bg-white border-zinc-200">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-bold text-zinc-800">{keyVote.motionTitle}</h4>
        <Badge variant="outline" className={cn(
          "text-[9px] font-bold px-2 py-0.5 shrink-0",
          keyVote.vote === 'Yes' ? "text-green-600 border-green-200" : "text-red-600 border-red-200"
        )}>
          Voted {keyVote.vote}
        </Badge>
      </div>
      <p className="text-sm text-zinc-600">{keyVote.contextSummary}</p>
      <div className="flex items-center gap-2 text-[10px] text-zinc-400">
        <span className="font-bold">{keyVote.voteSplit}</span>
        <Link to={`/meetings/${keyVote.meetingId}`} className="text-blue-600 hover:underline">
          {formatDate(keyVote.meetingDate)}
        </Link>
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual topic assignment | `normalize_category_to_topic()` SQL function | Phase 9 (v1.1) | Maps ~300/470 categories automatically |
| Brief overview text | Embedding-powered profile agent | Phase 9 (v1.1) | 4-step agent: theme discovery, deep dive, synthesis |
| No key vote detection | Algorithmic detection (this phase) | Phase 39 | Pre-computed minority/close/ally-break detection |

**Existing infrastructure ready for extension:**
- `agenda_item_topics` table: Created in bootstrap.sql, has RLS policies, but 0 rows -- ready for backfill
- `topics` table: 8 rows matching the TOPICS constant
- `councillor_highlights` table: Has overview + highlights JSONB, can be extended for richer narrative
- `councillor_stances` table: 106 rows with per-topic stance data, confidence levels, evidence quotes

## Open Questions

1. **councillor_highlights table migration location**
   - What we know: Table is used in code (profiling.ts, stance_generator.py) with columns: id, person_id, highlights, overview, generated_at
   - What's unclear: No migration file found in supabase/migrations/ with this table creation
   - Recommendation: Verify table exists in production before creating migration. If modifying schema, use ALTER TABLE ADD COLUMN rather than CREATE TABLE.

2. **Vote count data source for key vote detection**
   - What we know: `motions` table has `yes_votes`, `no_votes` columns. `votes` table has individual per-person records.
   - What's unclear: Whether yes_votes/no_votes on motions are always populated and accurate
   - Recommendation: Compute counts from `votes` table as ground truth, fall back to `motions` columns. Verify with a spot-check query during implementation.

3. **Profile narrative regeneration trigger**
   - What we know: CONTEXT.md says "pipeline-triggered after ingestion finds new data"
   - What's unclear: Exact trigger mechanism (new CLI flag? automatic after ingestion?)
   - Recommendation: Add `--generate-profiles` CLI flag similar to existing `--generate-stances` and `--generate-highlights`. For automatic triggering, detect new votes/statements for a person during ingestion and queue profile regeneration.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (Python pipeline), no frontend tests |
| Config file | `apps/pipeline/pytest.ini` |
| Quick run command | `cd apps/pipeline && uv run pytest tests/profiling/ -x` |
| Full suite command | `cd apps/pipeline && uv run pytest` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CNCL-01 | Topic classification maps categories correctly | unit | `cd apps/pipeline && uv run pytest tests/profiling/test_topic_classifier.py -x` | No - Wave 0 |
| CNCL-01 | Gemini fallback classifies unmapped categories | unit (mocked) | `cd apps/pipeline && uv run pytest tests/profiling/test_topic_classifier.py::test_gemini_fallback -x` | No - Wave 0 |
| CNCL-02 | Enhanced profile narrative generation | unit (mocked) | `cd apps/pipeline && uv run pytest tests/profiling/test_stance_generator.py -x` | Partially (existing tests) |
| CNCL-03 | Key vote detection finds minority/close/ally-break votes | unit | `cd apps/pipeline && uv run pytest tests/profiling/test_key_vote_detector.py -x` | No - Wave 0 |
| CNCL-03 | Composite score ranking is correct | unit | `cd apps/pipeline && uv run pytest tests/profiling/test_key_vote_detector.py::test_composite_score -x` | No - Wave 0 |
| CNCL-04 | Profile page renders new tabs | manual-only | Manual browser check | N/A |

### Sampling Rate
- **Per task commit:** `cd apps/pipeline && uv run pytest tests/profiling/ -x`
- **Per wave merge:** `cd apps/pipeline && uv run pytest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/profiling/test_topic_classifier.py` -- covers CNCL-01 (classification logic + Gemini fallback)
- [ ] `tests/profiling/test_key_vote_detector.py` -- covers CNCL-03 (minority, close vote, ally break detection, composite scoring)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `sql/bootstrap.sql` -- schema for agenda_items, topics, agenda_item_topics, motions, votes tables
- Codebase analysis: `supabase/migrations/councillor_stances_and_speaking_time.sql` -- normalize_category_to_topic() function, councillor_stances schema
- Codebase analysis: `apps/pipeline/pipeline/profiling/stance_generator.py` -- Gemini integration patterns, evidence gathering, JSON parsing
- Codebase analysis: `apps/pipeline/pipeline/profiling/profile_agent.py` -- 4-step embedding-powered profile generation
- Codebase analysis: `apps/web/app/routes/person-profile.tsx` -- current profile page layout (892 lines), loader pattern
- Codebase analysis: `apps/web/app/services/profiling.ts` -- existing query functions and TypeScript interfaces
- Codebase analysis: `apps/web/app/lib/topic-utils.ts` -- TOPICS, TOPIC_ICONS, TOPIC_COLORS constants
- Codebase analysis: `apps/web/app/components/profile/stance-summary.tsx` -- existing stance card component

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions from user discussion session

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- extending proven patterns (stance_generator.py, profile_agent.py, person-profile.tsx)
- Pitfalls: HIGH -- identified from direct codebase analysis (data quality, performance, component size)
- Key vote algorithm: MEDIUM -- composite scoring formula is new territory, needs tuning during implementation

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable -- internal codebase, no external dependency changes)
