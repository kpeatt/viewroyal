# Phase 29: Backend Foundation - Research

**Researched:** 2026-02-28
**Domain:** Agent reasoning transparency, tool result summarization, bylaw search integration
**Confidence:** HIGH

## Summary

Phase 29 enhances the existing RAG agent in `rag.server.ts` with three capabilities: transparent reasoning display, structured tool result summaries, and a new bylaw search tool. The codebase is well-structured for all three changes -- the agent loop already emits `thought` events (just not consumed by the UI), the `tool_observation` display logic is rudimentary ("Found N results"), and the database already has `bylaws` (43 rows) and `bylaw_chunks` (2,285 rows) tables with full embedding coverage and existing `match_bylaws`/`match_bylaw_chunks` RPCs.

The work is almost entirely in two files (`rag.server.ts` for backend, `ai-answer.tsx` for frontend display) plus one new Supabase migration for a `hybrid_search_bylaw_chunks` RPC. No new libraries are needed. The existing hybrid search RPC pattern (used by motions, key_statements, document_sections) provides a proven template.

**Primary recommendation:** Follow the existing hybrid search RPC pattern for bylaws, enhance the orchestrator system prompt to produce structured reasoning, and update the `tool_observation` event to carry richer summary data that the UI can display.

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGNT-01 | Agent reasoning steps explain WHY it is choosing each search tool, not just which tool it is calling | The orchestrator already emits `thought` events (line 1223 of rag.server.ts) but the search.tsx SSE consumer ignores them (no `case "thought"` in the switch). The system prompt needs enhancement to instruct the agent to explain reasoning, and the UI needs to surface thoughts. |
| AGNT-02 | Tool result summaries show what was found and why it matters (count, relevance) instead of raw observation text | Currently `displaySummary` (line 1259-1264) only says "Found N results" or "Results retrieved". The fix is to build richer summaries server-side that include date ranges and topic context, then send them as structured data in the `tool_observation` event. |
| AGNT-03 | Agent can search bylaws directly when questions ask about regulations, zoning rules, fees, or bylaw provisions | The `bylaws` table has 43 rows (all with embeddings), `bylaw_chunks` has 2,285 rows (all with embeddings). Existing RPCs `match_bylaws` and `match_bylaw_chunks` do vector-only search. A new `hybrid_search_bylaw_chunks` RPC (combining FTS + vector via RRF) plus a `search_bylaws` tool function is needed. |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @google/genai | (existing) | Gemini LLM for agent orchestration + synthesis | Already in use for agent loop |
| @supabase/supabase-js | (existing) | Database client for RPC calls | Already in use for all search tools |
| OpenAI | (existing) | Embedding generation (text-embedding-3-small, 384d) | Already in use via embeddings.server.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-markdown | (existing) | Render AI answer markdown | Already used in ai-answer.tsx |
| lucide-react | (existing) | Icons for UI elements | Already used for tool step display |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hybrid search RPC for bylaws | Pure vector match_bylaw_chunks only | FTS improves recall for exact bylaw numbers/terms; hybrid is proven pattern in this codebase |
| Enhancing system prompt for reasoning | Separate reasoning chain call | Extra latency and cost; single-prompt reasoning is sufficient |

**Installation:** No new dependencies needed.

## Architecture Patterns

### Recommended Changes

```
apps/web/app/services/rag.server.ts    # Add search_bylaws tool, enhance summaries, update prompt
apps/web/app/components/search/ai-answer.tsx  # Display thought events, richer observation summaries
apps/web/app/routes/search.tsx         # Handle "thought" event type in SSE consumer
supabase/migrations/                   # New hybrid_search_bylaw_chunks RPC + text_search column
```

### Pattern 1: Hybrid Search RPC (Existing, Proven)

**What:** RRF-based hybrid search combining full-text search (tsvector) with vector similarity (halfvec cosine distance)
**When to use:** For any table that has both `text_search` tsvector column and `embedding` halfvec column
**Example (from existing `hybrid_search_motions`):**

```sql
CREATE OR REPLACE FUNCTION hybrid_search_bylaw_chunks(
  query_text text,
  query_embedding halfvec(384),
  match_count int,
  full_text_weight float DEFAULT 1.0,
  semantic_weight float DEFAULT 1.0,
  rrf_k float DEFAULT 50
)
RETURNS TABLE (
  id bigint,
  bylaw_id bigint,
  chunk_index int,
  text_content text,
  rank_score float
)
-- Pattern: CTE for full_text (tsquery), CTE for semantic (embedding distance),
-- FULL OUTER JOIN, RRF score calculation, JOIN back to source table
```

### Pattern 2: Agent Tool Registration (Existing)

**What:** Tools are defined as objects with `name`, `description`, and `call` function in the `tools` array
**When to use:** Adding any new search capability to the agent
**Example (from existing tools array, line 793+):**

```typescript
const tools: Tool<any, any>[] = [
  {
    name: "search_bylaws",
    description: "search_bylaws(query: string) — Searches municipal bylaws...",
    call: async ({ query }: { query: string }) => search_bylaws({ query }),
  },
  // ... existing tools
];
```

### Pattern 3: Source Normalization (Existing)

**What:** Each tool's raw results are normalized into `NormalizedSource` objects for the citation system
**When to use:** Any tool whose results should appear in the sources list
**Example (from existing normalizers, line 991+):**

```typescript
function normalizeBylawSources(results: any[]): NormalizedSource[] {
  return results.map((r) => ({
    type: "bylaw" as const,  // New type to add to NormalizedSource
    id: r.id,
    meeting_id: 0,
    meeting_date: "N/A",
    title: `[Bylaw ${r.bylaw_number}] ${r.title}`,
  }));
}
```

### Pattern 4: Tool Observation Display (Existing)

**What:** `tool_observation` events are rendered in `ResearchStep` component in ai-answer.tsx
**When to use:** Displaying post-execution summaries to the user
**Current implementation (line 45-60 of ai-answer.tsx):**

```typescript
function getObservationSummary(result: any): string {
  // Currently very basic -- just "Found N results"
  // Needs enhancement to include date ranges, topic relevance, etc.
}
```

### Anti-Patterns to Avoid
- **Passing raw JSON to UI:** The `tool_observation` event's `result` field currently receives `displaySummary` (a string). Don't change this to raw JSON -- keep it a human-readable string, just make it richer.
- **Adding bylaw_number to NormalizedSource type union without updating consumers:** The citation badge, source cards, and link routing all use the `type` field. A new `"bylaw"` type needs fallback handling in all consumers.
- **Over-engineering the thought display:** Thoughts from the orchestrator LLM are internal reasoning. Show them in a subtle, collapsible format -- not as prominent as tool calls.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hybrid search ranking | Custom scoring logic in TypeScript | PostgreSQL RRF function (existing pattern) | Database-level ranking is faster and avoids transferring unranked data |
| Bylaw full-text search | ilike queries on text_content | tsvector + GIN index + websearch_to_tsquery | Proper tokenization, stemming, ranking |
| Embedding generation | Custom embedding endpoint | Existing generateQueryEmbedding() | Already handles OpenAI API, caching, error handling |
| Agent reasoning extraction | Regex parsing of thought text | Structured JSON from orchestrator prompt | The agent already outputs JSON; just instruct it to include richer reasoning |

**Key insight:** Every component needed for bylaw search already exists in the codebase for other content types. The work is assembly, not invention.

## Common Pitfalls

### Pitfall 1: bylaw_chunks lacks text_search column
**What goes wrong:** The hybrid search RPC pattern requires a `text_search` tsvector column with a GIN index. The `bylaw_chunks` table currently has NO `text_search` column and NO FTS index.
**Why it happens:** Bylaws were originally designed for vector-only search via `match_bylaw_chunks`.
**How to avoid:** The migration must add a `text_search` tsvector column, populate it from `text_content`, create a GIN index, and add a trigger for future updates.
**Warning signs:** RPC returns 0 full-text results; all ranking comes from semantic only.

### Pitfall 2: NormalizedSource type needs "bylaw" addition
**What goes wrong:** The `NormalizedSource` interface has a `type` union that drives link routing in source cards. Adding a `"bylaw"` type without updating the routing logic causes broken links or missing icons.
**Why it happens:** The type field is used in multiple places: `normalizeXxxSources()`, source card rendering, citation badge routing.
**How to avoid:** Add `"bylaw"` to the `NormalizedSource.type` union, add a `normalizeBylawSources()` function, and ensure source card link routing handles the new type (link to `/bylaws/{slug}`).
**Warning signs:** Source cards showing "Unknown" type or linking to non-existent pages.

### Pitfall 3: Thought events swallowed by SSE consumer
**What goes wrong:** The orchestrator yields `{ type: "thought", thought: "..." }` events, but the search.tsx SSE consumer has no `case "thought"` handler -- they're silently dropped.
**Why it happens:** Thoughts were likely planned but never implemented in the UI.
**How to avoid:** Add `case "thought"` to the SSE switch in search.tsx, store them in state, and display them in the research steps panel.
**Warning signs:** Agent steps panel shows tool calls but no reasoning context.

### Pitfall 4: displaySummary is built server-side but only used for UI display
**What goes wrong:** The `displaySummary` string (line 1259 of rag.server.ts) is sent to the UI via `tool_observation` events, but it's also what the orchestrator sees in `history`. Enriching `displaySummary` could change the orchestrator's behavior.
**Why it happens:** The same `observation` string is pushed to both `history` (for the LLM) and the UI (for display).
**How to avoid:** Keep the LLM-facing `observation` string (pushed to `history`) separate from the UI-facing `displaySummary`. The LLM should see full data; the UI should see a human-friendly summary.
**Warning signs:** Agent behavior changes unexpectedly after modifying display summaries.

### Pitfall 5: Bylaw search returning too many/few chunks
**What goes wrong:** With 2,285 chunks across 43 bylaws, a broad query like "fees" could return chunks from many different bylaws, making the context unfocused.
**Why it happens:** bylaw_chunks are granular text segments; they lack the natural per-meeting grouping that other content types have.
**How to avoid:** The search_bylaws tool should: (1) first find relevant bylaws via match_bylaws, (2) then search chunks within those bylaws. Or use a single hybrid search that returns chunks with their parent bylaw title/number for grouping context.
**Warning signs:** Agent answers about bylaws cite 10+ different bylaws when user asked about one specific topic.

## Code Examples

### Example 1: Migration for bylaw_chunks FTS support

```sql
-- Add text_search tsvector column to bylaw_chunks
ALTER TABLE bylaw_chunks ADD COLUMN IF NOT EXISTS text_search tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(text_content, ''))) STORED;

-- Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_bylaw_chunks_fts ON bylaw_chunks USING GIN (text_search);
```

### Example 2: hybrid_search_bylaw_chunks RPC

```sql
CREATE OR REPLACE FUNCTION hybrid_search_bylaw_chunks(
  query_text text,
  query_embedding halfvec(384),
  match_count int,
  full_text_weight float DEFAULT 1.0,
  semantic_weight float DEFAULT 1.0,
  rrf_k float DEFAULT 50
)
RETURNS TABLE (
  id bigint,
  bylaw_id bigint,
  chunk_index int,
  text_content text,
  bylaw_title text,
  bylaw_number text,
  rank_score float
)
LANGUAGE sql
AS $$
WITH full_text AS (
  SELECT
    bc.id,
    ROW_NUMBER() OVER (ORDER BY ts_rank_cd(bc.text_search, websearch_to_tsquery(query_text)) DESC) AS rank_ix
  FROM bylaw_chunks bc
  WHERE bc.text_search @@ websearch_to_tsquery(query_text)
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
),
semantic AS (
  SELECT
    bc.id,
    ROW_NUMBER() OVER (ORDER BY bc.embedding <=> query_embedding) AS rank_ix
  FROM bylaw_chunks bc
  WHERE bc.embedding IS NOT NULL
  ORDER BY rank_ix
  LIMIT LEAST(match_count, 30) * 2
)
SELECT
  bylaw_chunks.id,
  bylaw_chunks.bylaw_id,
  bylaw_chunks.chunk_index,
  bylaw_chunks.text_content,
  bylaws.title AS bylaw_title,
  bylaws.bylaw_number,
  (COALESCE(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
   COALESCE(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight)::float AS rank_score
FROM full_text
FULL OUTER JOIN semantic ON full_text.id = semantic.id
JOIN bylaw_chunks ON COALESCE(full_text.id, semantic.id) = bylaw_chunks.id
JOIN bylaws ON bylaw_chunks.bylaw_id = bylaws.id
ORDER BY rank_score DESC
LIMIT LEAST(match_count, 30);
$$;
```

### Example 3: search_bylaws tool function

```typescript
async function search_bylaws({ query }: { query: string }): Promise<any[]> {
  const embedding = await generateQueryEmbedding(query);
  if (!embedding) return [];

  try {
    const { data } = await getSupabase().rpc("hybrid_search_bylaw_chunks", {
      query_text: query,
      query_embedding: JSON.stringify(embedding),
      match_count: 10,
      full_text_weight: 1.0,
      semantic_weight: 1.0,
      rrf_k: 50,
    });

    if (!data || data.length === 0) return [];

    return data.map((d: any) => ({
      id: d.id,
      bylaw_id: d.bylaw_id,
      bylaw_title: d.bylaw_title,
      bylaw_number: d.bylaw_number,
      chunk_index: d.chunk_index,
      text_content: d.text_content,
    }));
  } catch (error) {
    console.error("Bylaw search failed:", error);
    return [];
  }
}
```

### Example 4: Enhanced displaySummary generation

```typescript
// Current (line 1259-1264):
const displaySummary = typeof toolResult === "string"
  ? toolResult.slice(0, 200)
  : Array.isArray(toolResult)
    ? `Found ${toolResult.length} results`
    : "Results retrieved";

// Enhanced:
function buildToolSummary(toolName: string, toolResult: any): string {
  if (typeof toolResult === "string") return toolResult.slice(0, 200);

  if (Array.isArray(toolResult) && toolResult.length > 0) {
    const count = toolResult.length;
    // Extract date range from results
    const dates = toolResult
      .map((r: any) => r.meetings?.meeting_date || r.meeting_date)
      .filter(Boolean)
      .sort();
    const dateRange = dates.length >= 2
      ? ` from ${dates[0]} to ${dates[dates.length - 1]}`
      : dates.length === 1 ? ` from ${dates[0]}` : "";

    if (toolName === "search_bylaws") {
      const bylawNumbers = [...new Set(toolResult.map((r: any) => r.bylaw_number).filter(Boolean))];
      return `Found ${count} bylaw sections${bylawNumbers.length > 0 ? ` across bylaws ${bylawNumbers.join(", ")}` : ""}`;
    }
    if (toolName === "search_motions") {
      return `Found ${count} motions${dateRange}`;
    }
    // ... similar for other tools
    return `Found ${count} results${dateRange}`;
  }

  if (typeof toolResult === "object" && toolResult?.stats) {
    return `Found voting record: ${toolResult.stats.total} votes (${toolResult.stats.yes} yes, ${toolResult.stats.no} no)`;
  }

  return "Results retrieved";
}
```

### Example 5: Enhanced orchestrator prompt reasoning instruction

```
**Important: In your "thought" field, explain your REASONING:**
- Why are you choosing this specific tool? What aspect of the question does it address?
- What do you expect to find? What gap in your evidence does this fill?
- Bad thought: "I'll search motions"
- Good thought: "The user is asking about parking fees, which would be set by bylaw. I'll search bylaws first to find the specific fee schedule, then check motions for any recent changes."
```

### Example 6: Thought display in UI (ai-answer.tsx)

```tsx
function ResearchStep({ event }: { event: AgentEvent }) {
  if (event.type === "thought") {
    return (
      <div className="py-1.5 text-sm text-zinc-400 italic pl-6">
        {event.thought}
      </div>
    );
  }
  if (event.type === "tool_call") {
    // ... existing
  }
  // ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vector-only bylaw search (match_bylaw_chunks) | Hybrid FTS+vector search (new RPC) | This phase | Better recall for exact bylaw numbers and legal terminology |
| Generic "Found N results" summaries | Context-aware summaries with dates, types, counts | This phase | Users understand what the agent found without expanding raw data |
| Hidden agent reasoning | Visible thought display in research panel | This phase | Users understand WHY the agent chose specific tools |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via apps/web/vitest.config.ts) |
| Config file | apps/web/vitest.config.ts |
| Quick run command | `cd apps/web && pnpm vitest run` |
| Full suite command | `cd apps/web && pnpm vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGNT-01 | Thought events are yielded and contain reasoning text | unit | `cd apps/web && pnpm vitest run tests/services/rag-agent.test.ts -t "thought"` | No -- Wave 0 |
| AGNT-02 | buildToolSummary produces rich summaries for each tool type | unit | `cd apps/web && pnpm vitest run tests/services/tool-summary.test.ts` | No -- Wave 0 |
| AGNT-03 | search_bylaws returns relevant bylaw chunks via hybrid search | integration (requires DB) | Manual -- verify via `/api/ask?q=tree+cutting+rules` | Manual only |

### Sampling Rate
- **Per task commit:** `cd apps/web && pnpm vitest run`
- **Per wave merge:** `cd apps/web && pnpm vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/web/tests/services/tool-summary.test.ts` -- covers AGNT-02 (pure function, easily testable)
- [ ] AGNT-01 and AGNT-03 require LLM calls and database state respectively -- recommend manual verification via the search UI rather than fragile mocked tests

## Open Questions

1. **Bylaw link routing in source cards**
   - What we know: Source cards currently route based on `type` field (`transcript` -> meeting page, `motion` -> meeting page, `document_section` -> document viewer). Bylaws have their own pages at `/bylaws/{slug}`.
   - What's unclear: Does the current source card component support arbitrary link generation, or is it hard-coded to meeting-based links?
   - Recommendation: Check the SourceCards component. If hard-coded, add a `"bylaw"` case that links to `/bylaws/{slug}`. The `bylaws` table has a `slug` column already populated.

2. **Bylaw search scope: chunks only vs. chunks + parent bylaw summaries**
   - What we know: `bylaws` table has `plain_english_summary` and `outline` columns. `bylaw_chunks` has the raw text.
   - What's unclear: Should the agent see the summary first (for context) then drill into chunks? Or just search chunks directly?
   - Recommendation: Search chunks directly via hybrid search RPC (simpler, follows existing pattern). Include parent bylaw title and number in RPC results for context. The agent can see which bylaws the chunks came from.

## Sources

### Primary (HIGH confidence)
- Direct database inspection: `bylaws` table (43 rows, all with embeddings), `bylaw_chunks` table (2,285 rows, all with embeddings)
- Existing codebase: `rag.server.ts` (1,345 lines), `ai-answer.tsx` (287 lines), `hybrid-search.server.ts` (351 lines)
- Existing RPC functions: `match_bylaws`, `match_bylaw_chunks`, `hybrid_search_motions`, `hybrid_search_key_statements`, `hybrid_search_document_sections`
- Database schema: `sql/bootstrap.sql`, 40+ applied migrations

### Secondary (MEDIUM confidence)
- Supabase hybrid search RPC pattern consistency verified across 3 existing implementations (motions, key_statements, document_sections)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries; all changes use existing dependencies
- Architecture: HIGH - Follows proven patterns already in the codebase (hybrid search RPC, tool registration, source normalization)
- Pitfalls: HIGH - Identified from direct code reading, not speculation

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable; no external dependency changes)
