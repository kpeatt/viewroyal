# Phase 38: RAG Intelligence - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Improve AI answer quality through LLM reranking and tool consolidation, measured against Phase 37's observability baseline. The current 9 overlapping RAG tools are consolidated to ~5, search results are reranked by a lightweight LLM before being passed to the agent, and an automated eval set validates quality improvements. No new search capabilities — this phase optimizes what exists.

</domain>

<decisions>
## Implementation Decisions

### Tool Consolidation Strategy
- Claude's discretion on exact grouping — consolidate from 9 tools to ~5 based on actual query patterns and overlap analysis
- Consolidated tools query multiple data sources in parallel then merge results (not sequential)
- `get_current_date` eliminated as a tool — inject current date into the system prompt instead
- Match thresholds and counts: Claude's discretion on tuning (may widen thresholds to give reranker more candidates)

### LLM Reranking Approach
- Reranking happens per tool call — after each tool returns results, rerank before passing to agent context
- Reranking model: Gemini Flash Lite (cheaper/faster than main model, reranking is a simpler task)
- Selection method: score threshold (not fixed top-K) — only keep results above a relevance cutoff
- Which tools get reranked: Claude's discretion (structured lookups like person info likely skip reranking)

### Quality Measurement
- Automated eval set with question/answer pairs
- Claude decides set size and generates candidate questions for review
- Eval criteria: Claude's discretion on what to score (relevance, accuracy, or both)
- Eval runner format: Claude's discretion (CLI script or test suite)

### Trace Visibility
- Full reranking details logged to rag_traces (candidates, scores, selected count)
- Trace detail level (per-result scores vs aggregate): Claude's discretion
- User-facing: research step line in the animated research steps UI showing "Ranked N sources -> M most relevant"
- Research step appears alongside existing "Searching motions..." style steps

### Claude's Discretion
- Exact tool consolidation groupings (which tools merge, which stay separate)
- Match threshold and count tuning for consolidated tools
- Which tools get reranked vs skip reranking
- Eval set size, question generation, scoring criteria, and runner format
- Trace storage granularity (per-result scores vs aggregate stats)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `rag.server.ts`: Monolithic RAG service (~1400 lines) with all 9 tool implementations, agent loop, and Gemini integration
- `api.ask.tsx`: SSE streaming endpoint with trace logging (Phase 37), PostHog dual-write
- `rag_traces` table: Already stores tool_calls array, source_count, latency_ms — extend for reranking metadata
- `rag_feedback` table: Thumbs up/down linked to traces — baseline measurement in place
- Research steps UI in `ai-answer.tsx`: Animated step display — add reranking step here

### Established Patterns
- Gemini lazy singleton pattern (`getGenAI()`) — reuse for reranking model initialization
- `match_*` RPCs for vector search, `hybrid_search_*` RPCs for keyword+vector
- Fire-and-forget trace insert to avoid blocking SSE stream
- Tool definitions use `Tool<any, any>` interface with name, description, parameters, execute

### Integration Points
- Tool definitions array in `rag.server.ts` (line ~794) — consolidate here
- Agent loop in `runQuestionAgent` — add reranking step after each tool execution
- System prompt construction — inject current date here
- `AgentEvent` types — add reranking event type for UI visibility
- Trace insert in `api.ask.tsx` — extend with reranking metadata

</code_context>

<specifics>
## Specific Ideas

- Research step line format: "Ranked 30 sources -> 8 most relevant" (fits existing animated step pattern)
- Per-tool-call reranking keeps agent context lean — agent only sees high-quality evidence per step
- Parallel sub-queries within consolidated tools maximizes evidence for reranker
- Gemini Flash Lite for reranking minimizes latency and cost impact

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 38-rag-intelligence*
*Context gathered: 2026-03-06*
