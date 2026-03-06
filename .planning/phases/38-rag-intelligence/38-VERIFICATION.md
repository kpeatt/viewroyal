---
phase: 38-rag-intelligence
verified: 2026-03-06T16:10:00Z
status: passed
score: 13/13 must-haves verified
---

# Phase 38: RAG Intelligence Verification Report

**Phase Goal:** AI answers are measurably more relevant through LLM reranking and a streamlined tool set
**Verified:** 2026-03-06T16:10:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | RAG agent uses 4 consolidated tools instead of 10 overlapping ones | VERIFIED | `tools` array at lines 787-880 has exactly 4 entries: search_council_records, search_documents, search_matters, get_person_info |
| 2 | get_current_date is eliminated as a tool -- date injected into system prompt | VERIFIED | No match for `get_current_date` in file. Line 883: `todayDate = new Date().toISOString().split("T")[0]`, line 887: `Today's date is ${todayDate}` |
| 3 | Consolidated tools query multiple data sources in parallel then merge results | VERIFIED | search_council_records uses `Promise.all` at line 800 (4 sub-queries), search_documents at line 829 (2 sub-queries), get_person_info at line 861 (2 sub-queries) |
| 4 | System prompt strategy table maps question types to new tool names | VERIFIED | Lines 903-921: strategy table maps question types to search_council_records, search_documents, search_matters, get_person_info |
| 5 | UI research step labels reflect new consolidated tool names | VERIFIED | TOOL_LABELS at lines 26-31 in ai-answer.tsx has exactly 4 entries matching consolidated tools. No old tool names present. |
| 6 | Source normalization handles consolidated tool response shapes | VERIFIED | Lines 1596-1611: handles composite objects for search_council_records (motions, transcripts, statements, agenda_items), search_documents (document_sections, bylaws), get_person_info (transcript_segments, key_statements, votes) |
| 7 | Trace tool_calls array records consolidated tool names | VERIFIED | api.ask.tsx line 63 pushes tool_call events to toolCalls array; no hardcoded old names |
| 8 | Search results are reranked by LLM relevance scoring after each tool call | VERIFIED | `rerankResults` function at lines 1358-1421, wired at lines 1576-1583 in agent loop |
| 9 | Reranking uses Gemini Flash Lite model for speed and cost efficiency | VERIFIED | Line 1387: `model: "gemini-2.5-flash-lite-preview-06-17"` |
| 10 | Results below score threshold are filtered out, with minimum keep guarantee | VERIFIED | Lines 1400-1408: threshold=3, minKeep=3, keeps results above threshold OR until minKeep reached |
| 11 | Reranking step is visible in RAG traces with candidates, selected count | VERIFIED | api.ask.tsx lines 64-70: attaches `reranking` metadata (candidates, selected, tool) to toolCalls entries |
| 12 | Research steps UI shows "Ranked N sources -> M most relevant" for reranked tools | VERIFIED | ai-answer.tsx lines 89-98: renders reranking event with Check icon. search.tsx line 307-308: adds reranking events to agentSteps |
| 13 | Structured data lookups (get_person_info) skip reranking | VERIFIED | Line 1324: `RERANK_ELIGIBLE = new Set(["search_council_records", "search_documents"])` -- get_person_info and search_matters excluded |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/app/services/rag.server.ts` | 4 consolidated tools, rerankResults, reranking AgentEvent | VERIFIED | 1652 lines. Contains all 4 tools, rerankResults, summarizeResult, flattenToolResults, unflattenRerankResults, RERANK_ELIGIBLE, reranking event type, updated system prompt with date injection, updated source normalization, updated buildToolSummary |
| `apps/web/app/components/search/ai-answer.tsx` | Updated TOOL_LABELS, reranking step display | VERIFIED | 4 TOOL_LABELS entries, getToolLabel personalizes get_person_info, ResearchStep renders reranking events |
| `apps/web/app/routes/api.ask.tsx` | Reranking metadata in traces | VERIFIED | Lines 64-70 attach reranking metadata to tool_calls for trace storage |
| `apps/web/app/routes/search.tsx` | Reranking event handling in SSE | VERIFIED | Line 307-308: case "reranking" adds event to agentSteps |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| rag.server.ts (tools array) | rag.server.ts (system prompt) | tool names match strategy table | WIRED | Both reference search_council_records, search_documents, search_matters, get_person_info |
| rag.server.ts (source normalization) | rag.server.ts (consolidated tool response) | tool name matching | WIRED | Lines 1596-1611 match all composite response shapes |
| ai-answer.tsx (TOOL_LABELS) | rag.server.ts (tool names) | label lookup | WIRED | 4 labels match 4 tool names exactly |
| rag.server.ts (rerankResults) | rag.server.ts (agent loop) | called after tool exec | WIRED | Lines 1576-1583 call rerankResults for RERANK_ELIGIBLE tools |
| rag.server.ts (reranking AgentEvent) | ai-answer.tsx (ResearchStep) | SSE event rendering | WIRED | Line 118 defines type, line 1581 yields it, ai-answer.tsx line 89 renders it |
| rag.server.ts (reranking metadata) | api.ask.tsx (trace insertion) | tool_calls with reranking key | WIRED | Lines 64-70 attach reranking to toolCalls, line 108 inserts into trace |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SRCH-01 | 38-02 | Search results are reranked by LLM relevance scoring before display | SATISFIED | rerankResults function scores with Gemini Flash Lite, filters by threshold, integrated in agent loop |
| SRCH-02 | 38-01 | RAG agent uses consolidated tools instead of overlapping ones | SATISFIED | 10 tools consolidated to 4 with parallel sub-queries via Promise.all |

No orphaned requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No TODOs, FIXMEs, placeholders, or stub implementations found |

### Human Verification Required

### 1. End-to-end RAG query

**Test:** Ask a question on the search page (e.g., "What has council decided about housing?")
**Expected:** Research steps show "Searching council records", then "Ranked N sources -> M most relevant". Answer includes relevant citations. Sources panel displays correctly.
**Why human:** Requires running application with live Gemini API and Supabase data.

### 2. Reranking trace verification

**Test:** After asking a question, check the `rag_traces` table in Supabase for the latest trace entry.
**Expected:** `tool_calls` JSONB array contains entries with `reranking` key showing `candidates`, `selected`, and `tool` fields.
**Why human:** Requires database access to verify trace storage.

### 3. Non-reranked tool behavior

**Test:** Ask a person-specific question (e.g., "What has Mayor Screene voted on?")
**Expected:** Research steps show "Looking up Mayor Screene's info" but NO reranking step appears.
**Why human:** Requires live query to verify get_person_info skips reranking.

### Gaps Summary

No gaps found. All 13 observable truths verified across both plans. All artifacts exist, are substantive (no stubs), and are properly wired. Both requirements (SRCH-01, SRCH-02) are satisfied. No anti-patterns detected.

---

_Verified: 2026-03-06T16:10:00Z_
_Verifier: Claude (gsd-verifier)_
