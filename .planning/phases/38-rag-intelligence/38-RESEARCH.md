# Phase 38: RAG Intelligence - Research

**Researched:** 2026-03-06
**Domain:** LLM reranking, RAG tool consolidation, eval infrastructure
**Confidence:** HIGH

## Summary

Phase 38 optimizes the existing RAG pipeline in `rag.server.ts` (~1520 lines) through two primary changes: consolidating 10 tools down to ~5, and adding LLM-based reranking of tool results before they reach the agent context. The codebase is well-structured for both changes -- tools are defined in a simple array (line 794-888), the agent loop is a clean for-loop (line 1367-1479), and the `@google/genai` SDK already provides the `generateContent` method needed for reranking calls.

The Gemini Flash Lite model (`gemini-2.5-flash-lite` stable, or `gemini-3.1-flash-lite-preview` for latest) is confirmed available via the same `@google/genai` SDK at $0.25/1M input tokens. This is ideal for reranking -- a simpler classification task that doesn't need the full `gemini-3-flash-preview` model. The existing lazy singleton pattern (`getGenAI()`) can be extended with a second singleton for the reranking model.

Quality measurement requires an automated eval set. The project already has vitest configured with relevant test patterns, and the `rag_traces` table provides real user queries to seed eval questions. The eval runner should be a vitest test file or standalone script that runs question/answer pairs and scores them.

**Primary recommendation:** Consolidate tools first (pure refactor, testable), then add reranking as a post-tool-call step in the agent loop, then build the eval set to validate quality.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Tool consolidation: 9 tools to ~5, consolidated tools query multiple data sources in parallel then merge results
- `get_current_date` eliminated as a tool -- inject current date into system prompt instead
- Reranking happens per tool call -- after each tool returns results, rerank before passing to agent context
- Reranking model: Gemini Flash Lite
- Selection method: score threshold (not fixed top-K) -- only keep results above a relevance cutoff
- Automated eval set with question/answer pairs
- Full reranking details logged to rag_traces (candidates, scores, selected count)
- User-facing: research step line showing "Ranked N sources -> M most relevant"
- Research step appears alongside existing animated research steps in the UI

### Claude's Discretion
- Exact tool consolidation groupings (which tools merge, which stay separate)
- Match threshold and count tuning for consolidated tools
- Which tools get reranked vs skip reranking
- Eval set size, question generation, scoring criteria, and runner format
- Trace storage granularity (per-result scores vs aggregate stats)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRCH-01 | Search results are reranked by LLM relevance scoring before display | Gemini Flash Lite reranking after each tool call, score threshold selection, trace logging, UI step display |
| SRCH-02 | RAG agent uses 5 consolidated tools instead of 9 overlapping ones | Tool consolidation analysis below with recommended groupings, parallel sub-query pattern |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@google/genai` | ^1.42.0 | Gemini API (reranking + agent) | Already in use, supports all Gemini models |
| vitest | existing | Test runner for eval suite | Already configured in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None new | - | - | All work uses existing dependencies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Gemini Flash Lite reranking | Cohere Rerank API | External dependency, extra API key, higher cost |
| Custom eval runner | Braintrust/Promptfoo | Overkill for ~20-30 eval questions, adds dependency |

**Installation:** No new packages needed. All work uses `@google/genai` already installed.

## Architecture Patterns

### Current Tool Inventory (10 tools, line 794-888)

| # | Tool Name | Data Source | Search Type |
|---|-----------|-------------|-------------|
| 1 | `get_statements_by_person` | key_statements + transcript_segments | Person lookup |
| 2 | `get_voting_history` | votes + motions | Person lookup |
| 3 | `search_motions` | motions | Vector search |
| 4 | `search_transcript_segments` | transcript_segments | Vector search |
| 5 | `search_matters` | matters | Vector search |
| 6 | `search_agenda_items` | agenda_items | Keyword (FTS) |
| 7 | `search_key_statements` | key_statements | Vector search |
| 8 | `search_document_sections` | document_sections | Hybrid (vector+FTS) |
| 9 | `search_bylaws` | bylaw_chunks | Hybrid (vector+FTS) |
| 10 | `get_current_date` | system clock | Direct return |

### Recommended Tool Consolidation (~5 tools)

| New Tool | Merges | Rationale |
|----------|--------|-----------|
| `search_council_records` | `search_motions` + `search_transcript_segments` + `search_key_statements` + `search_agenda_items` | All four search meeting content by topic query. Run sub-queries in parallel via `Promise.all`, merge results into a unified response with type labels. Reranker then selects the best evidence. |
| `search_documents` | `search_document_sections` + `search_bylaws` | Both search full-text documents. Consolidated tool takes a `type` parameter ("staff_reports" | "bylaws" | "all") to optionally narrow scope. |
| `search_matters` | stays solo | Unique cross-meeting topic tracking, different result shape (no meeting_date in same way). |
| `get_person_info` | `get_statements_by_person` + `get_voting_history` | Both are person-centric lookups. Consolidated tool takes `person_name` + optional `include` parameter ("statements" | "votes" | "both"). Skip reranking -- structured person data, not search results. |
| ~~`get_current_date`~~ | eliminated | Inject `Today's date is YYYY-MM-DD.` into the orchestrator system prompt. |

**Result: 4 tools** (within the "approximately 5" target).

### Reranking Architecture

```
Agent loop iteration:
  1. Agent chooses tool + args
  2. Tool executes, returns raw results (array)
  3. IF tool is rerank-eligible AND results.length > threshold:
     a. Build reranking prompt with user query + result summaries
     b. Call Gemini Flash Lite with structured output (scores per result)
     c. Filter results by score threshold
     d. Emit "reranking" AgentEvent for UI
     e. Log reranking metadata for trace
  4. Pass filtered results to agent context
```

**Which tools get reranked:**
- `search_council_records` -- YES (mixed sources, many candidates, high value from filtering)
- `search_documents` -- YES (document sections can be noisy, benefit from relevance scoring)
- `search_matters` -- MAYBE (typically returns fewer results, reranking may not add value)
- `get_person_info` -- NO (structured data lookup, not relevance-ranked search)

**Reranking prompt pattern:**
```typescript
const rerankPrompt = `Given the user question: "${query}"

Rate each result's relevance on a scale of 0-10.
Return JSON: { "scores": [{ "index": 0, "score": 8 }, ...] }

Results:
${results.map((r, i) => `[${i}] ${summarizeResult(r)}`).join('\n')}`;
```

### Reranking Model Initialization

```typescript
// Second lazy singleton for reranking (cheaper model)
let rerankAI: GoogleGenAI | null = null;
function getRerankAI(): GoogleGenAI | null {
  if (!GEMINI_API_KEY) return null;
  if (!rerankAI) {
    rerankAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return rerankAI;
}

// Usage in reranking function:
const result = await getRerankAI()!.models.generateContent({
  model: "gemini-2.5-flash-lite",  // or gemini-3.1-flash-lite-preview
  contents: [rerankPrompt],
  config: {
    responseMimeType: "application/json",
  },
});
```

Note: The `@google/genai` SDK uses the same `GoogleGenAI` instance for all models -- model selection happens at call time via the `model` parameter in `generateContent`. A separate singleton is NOT needed. The existing `getGenAI()` singleton can be reused; just pass a different model name.

### AgentEvent Extension

```typescript
export type AgentEvent =
  | { type: "thought"; thought: string }
  | { type: "tool_call"; name: string; args: any }
  | { type: "tool_observation"; name: string; result: any }
  | { type: "reranking"; candidates: number; selected: number; tool: string }  // NEW
  | { type: "final_answer_chunk"; chunk: string }
  | { type: "sources"; sources: any[] }
  | { type: "suggested_followups"; followups: string[] }
  | { type: "trace_id"; traceId: string }
  | { type: "done" };
```

### Trace Extension

Add to `tool_calls` JSONB array per tool call:
```json
{
  "name": "search_council_records",
  "args": { "query": "housing" },
  "reranking": {
    "candidates": 30,
    "selected": 8,
    "model": "gemini-2.5-flash-lite",
    "latency_ms": 150,
    "threshold": 5
  }
}
```

No schema migration needed -- `tool_calls` is already JSONB, just add the `reranking` key to tool call objects.

### UI Research Step

In `ai-answer.tsx`, add handling for the new `reranking` event type:

```typescript
const TOOL_LABELS: Record<string, string> = {
  // ... existing labels ...
  // Add reranking display in ResearchStep component
};

// In ResearchStep:
if (event.type === "reranking") {
  return (
    <div className="flex items-center gap-2.5 py-1.5 text-sm text-zinc-400">
      <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
      <span>Ranked {event.candidates} sources &rarr; {event.selected} most relevant</span>
    </div>
  );
}
```

### Eval Set Architecture

```
apps/web/
  tests/
    eval/
      eval-questions.json      # Question/expected-answer pairs
      rag-eval.test.ts         # Vitest test that runs eval (skipped in CI)
  scripts/
    generate-eval-questions.ts # One-off: pulls real queries from rag_traces
```

**Eval question format:**
```json
{
  "id": "eval-01",
  "question": "What did council decide about housing at the January 2025 meeting?",
  "expected_topics": ["housing", "zoning", "OCP"],
  "expected_sources": ["motion", "transcript"],
  "min_source_count": 3
}
```

**Scoring approach:** Rather than exact answer matching (brittle), score on:
1. Source relevance: Do returned sources match expected topics?
2. Source diversity: Are multiple source types represented?
3. Answer completeness: Does the answer mention expected topics?
4. No hallucination: Answer doesn't reference non-existent meetings/people

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON parsing from LLM | Custom regex parsing | `responseMimeType: "application/json"` in Gemini config | Gemini supports structured JSON output natively, handles edge cases |
| Parallel queries | Sequential await chain | `Promise.all([query1(), query2(), ...])` | Already used in codebase patterns, maximizes parallelism |
| Result deduplication | Custom dedup logic per tool | Existing `sourceMap` dedup pattern (line 1482-1486) | Already handles type+id dedup across all source types |

## Common Pitfalls

### Pitfall 1: Reranking Latency Blowing Up Response Time
**What goes wrong:** Adding a Gemini API call per tool invocation adds 200-500ms per step. With 3-4 tool calls, total latency increases by 600-2000ms.
**Why it happens:** Reranking is an additional LLM call in the critical path.
**How to avoid:** Use `gemini-2.5-flash-lite` (fastest, cheapest). Set a minimum result count threshold (e.g., skip reranking if <5 results). Consider reranking concurrently with the next agent thinking step if possible. Track reranking latency separately in traces.
**Warning signs:** P95 latency jumps >50% compared to Phase 37 baseline.

### Pitfall 2: Reranking Prompt Token Budget
**What goes wrong:** Passing full result content to the reranker consumes excessive tokens, increasing cost and latency.
**Why it happens:** Document sections can be 500+ chars each. 30 results * 500 chars = 15K chars just for results.
**How to avoid:** Summarize each result to ~100-150 chars for the reranking prompt. The reranker only needs enough context to judge relevance, not the full text. Keep the full text for the agent context after filtering.

### Pitfall 3: Over-Aggressive Filtering Removes Good Results
**What goes wrong:** Score threshold is too high, dropping relevant results. Agent gets insufficient evidence.
**Why it happens:** LLM scoring is noisy. A relevant result might score 4/10 due to indirect relevance.
**How to avoid:** Start with a generous threshold (e.g., 3/10). Log "dropped" results in traces so you can audit. Ensure at least `min_keep` results survive (e.g., always keep top 3 regardless of score).

### Pitfall 4: Tool Consolidation Breaks System Prompt Strategy Table
**What goes wrong:** The orchestrator system prompt (line 890-965) has a detailed strategy table mapping question types to tool names. Consolidating tools without updating this causes the agent to try calling old tool names.
**Why it happens:** The system prompt is tightly coupled to tool names.
**How to avoid:** Update the system prompt strategy table simultaneously with tool consolidation. Test that the agent can still route correctly with new tool names.

### Pitfall 5: Consolidated Tool Returns Oversized Context
**What goes wrong:** `search_council_records` running 4 parallel queries returns 60+ results. Even after reranking, the merged response is large.
**Why it happens:** Each sub-query returns 10-20 results; combined is 40-80.
**How to avoid:** Reduce per-sub-query limits (e.g., 8 each instead of 20). Let the reranker handle quality selection. The `truncateForContext` function (line 1326) already caps at 15 items, but adjust for consolidated tools.

### Pitfall 6: Eval Set Requires Live Supabase Connection
**What goes wrong:** Eval tests can't run in CI or without database access.
**Why it happens:** RAG tools call Supabase RPCs directly.
**How to avoid:** Design eval as a local-only test (skipped in CI via `describe.skip` or env flag). Alternatively, mock at the Supabase level, but that defeats the purpose of end-to-end eval. The eval is primarily a quality measurement tool, not a CI gate.

## Code Examples

### Consolidated Tool with Parallel Sub-Queries

```typescript
// Source: pattern derived from existing tool implementations in rag.server.ts
async function search_council_records({
  query,
  after_date,
}: {
  query: string;
  after_date?: string;
}): Promise<{ motions: any[]; transcripts: any[]; statements: any[]; agenda_items: any[] }> {
  const [motions, transcripts, statements, agendaItems] = await Promise.all([
    search_motions({ query, after_date }),
    search_transcript_segments({ query, after_date }),
    search_key_statements({ query, after_date }),
    search_agenda_items({ query, after_date }),
  ]);

  return {
    motions,
    transcripts: transcripts,
    statements,
    agenda_items: agendaItems,
  };
}
```

### Reranking Function

```typescript
// Source: @google/genai SDK generateContent with JSON mode
interface RerankResult {
  scores: Array<{ index: number; score: number }>;
}

async function rerankResults(
  query: string,
  results: Array<{ summary: string; index: number }>,
  threshold: number = 3,
  minKeep: number = 3,
): Promise<{ kept: number[]; dropped: number[]; scores: RerankResult["scores"] }> {
  const ai = getGenAI();
  if (!ai || results.length <= minKeep) {
    return {
      kept: results.map((_, i) => i),
      dropped: [],
      scores: results.map((_, i) => ({ index: i, score: 10 })),
    };
  }

  const prompt = `Rate each search result's relevance to the question on a scale of 0-10.
Question: "${query}"

Results:
${results.map((r) => `[${r.index}] ${r.summary}`).join("\n")}

Return JSON: {"scores": [{"index": 0, "score": 8}, ...]}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: [prompt],
    config: { responseMimeType: "application/json" },
  });

  const parsed: RerankResult = JSON.parse(response.text ?? "{}");
  const sorted = [...parsed.scores].sort((a, b) => b.score - a.score);

  // Keep results above threshold, but always keep at least minKeep
  const kept: number[] = [];
  const dropped: number[] = [];
  for (const s of sorted) {
    if (s.score >= threshold || kept.length < minKeep) {
      kept.push(s.index);
    } else {
      dropped.push(s.index);
    }
  }

  return { kept, dropped, scores: parsed.scores };
}
```

### System Prompt Date Injection

```typescript
// Source: existing getOrchestratorSystemPrompt in rag.server.ts (line 890)
function getOrchestratorSystemPrompt(municipalityName = "Town of View Royal") {
  const today = new Date().toISOString().split("T")[0];
  return `You are a research agent for the ${municipalityName}...

Today's date is ${today}. Use this for any temporal references like "recent", "this year", etc.

## Available Tools
// ... updated tool list (no get_current_date) ...
`;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 10 separate tools | ~4-5 consolidated tools | This phase | Reduces agent confusion, fewer wasted tool calls |
| Raw vector/FTS results passed directly | LLM reranking post-retrieval | This phase | Higher relevance evidence, smaller context window usage |
| No eval framework | Automated question/answer eval set | This phase | Enables quality measurement across changes |
| `get_current_date` tool call | Date injected in system prompt | This phase | Saves one tool call on temporal queries |

## Open Questions

1. **Gemini model version for reranking**
   - What we know: `gemini-2.5-flash-lite` (stable) and `gemini-3.1-flash-lite-preview` (preview, released March 3, 2026) both available
   - What's unclear: Whether the preview model is stable enough for production reranking
   - Recommendation: Start with `gemini-2.5-flash-lite` (stable), upgrade to 3.1 when it exits preview

2. **Optimal reranking threshold**
   - What we know: Score range 0-10, need to balance precision vs recall
   - What's unclear: Exact cutoff that works best for civic records
   - Recommendation: Start at 3/10 with min-keep of 3, tune based on eval results and trace data

3. **Whether `search_matters` should be merged or kept separate**
   - What we know: Matters are cross-meeting topics with different data shape (no meeting_date in standard form, has first_seen/last_seen)
   - What's unclear: Whether merging into `search_council_records` helps or hurts agent routing
   - Recommendation: Keep separate -- unique enough data model and use case

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/web && pnpm test -- --run` |
| Full suite command | `cd apps/web && pnpm test -- --run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRCH-01 | Reranking function filters results by relevance score | unit | `cd apps/web && pnpm test -- --run tests/services/reranking.test.ts` | Wave 0 |
| SRCH-01 | Reranking metadata appears in trace tool_calls | unit | `cd apps/web && pnpm test -- --run tests/services/reranking.test.ts` | Wave 0 |
| SRCH-01 | Reranking AgentEvent emitted and rendered in UI | manual-only | Visual inspection of research steps | N/A |
| SRCH-02 | Consolidated tools produce same result types as originals | unit | `cd apps/web && pnpm test -- --run tests/services/tool-consolidation.test.ts` | Wave 0 |
| SRCH-02 | Tool count reduced from 10 to ~4-5 | unit | `cd apps/web && pnpm test -- --run tests/services/tool-consolidation.test.ts` | Wave 0 |
| SRCH-02 | System prompt updated with new tool names | unit | `cd apps/web && pnpm test -- --run tests/services/tool-consolidation.test.ts` | Wave 0 |
| SRCH-02 | `get_current_date` eliminated, date injected in prompt | unit | `cd apps/web && pnpm test -- --run tests/services/tool-consolidation.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/web && pnpm test -- --run`
- **Per wave merge:** `cd apps/web && pnpm test -- --run`
- **Phase gate:** Full suite green + eval set scores >= baseline

### Wave 0 Gaps
- [ ] `tests/services/reranking.test.ts` -- covers SRCH-01 (reranking function unit tests with mocked Gemini)
- [ ] `tests/services/tool-consolidation.test.ts` -- covers SRCH-02 (consolidated tool shape, tool count, prompt injection)
- [ ] `tests/eval/eval-questions.json` -- eval question/answer pairs (manually curated)
- [ ] `tests/eval/rag-eval.test.ts` -- eval runner (local-only, skipped in CI)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `apps/web/app/services/rag.server.ts` (1520 lines, all 10 tools, agent loop, system prompt)
- Codebase analysis: `apps/web/app/routes/api.ask.tsx` (trace insertion, SSE streaming)
- Codebase analysis: `apps/web/app/components/search/ai-answer.tsx` (research step UI, AgentEvent handling)
- Codebase analysis: `supabase/migrations/37-01-rag-traces-and-feedback.sql` (rag_traces schema)
- [Google AI Models page](https://ai.google.dev/gemini-api/docs/models) -- confirmed model IDs: `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite-preview`

### Secondary (MEDIUM confidence)
- [Gemini 3.1 Flash-Lite blog post](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-flash-lite/) -- pricing at $0.25/1M input tokens

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all existing dependencies, no new packages
- Architecture: HIGH - direct codebase analysis of every integration point
- Pitfalls: HIGH - based on concrete code patterns observed in rag.server.ts
- Tool consolidation: MEDIUM - grouping recommendation is judgment-based, may need adjustment during implementation

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable codebase, model IDs may update)
