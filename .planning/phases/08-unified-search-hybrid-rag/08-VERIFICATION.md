---
phase: 08-unified-search-hybrid-rag
verified: 2026-02-18T00:00:00Z
status: human_needed
score: 9/10 must-haves verified
re_verification: false
human_verification:
  - test: "Verify Supabase hybrid search RPCs exist in database"
    expected: "SELECT proname FROM pg_proc WHERE proname LIKE 'hybrid_search_%' returns 3 rows: hybrid_search_motions, hybrid_search_key_statements, hybrid_search_document_sections"
    why_human: "Migration was applied via MCP (not Supabase CLI), cannot query DB programmatically. REQUIREMENTS.md still marks SRCH-03 as [ ] Pending — this must be confirmed and updated."
  - test: "Verify key_statements.text_search column exists in DB"
    expected: "SELECT column_name FROM information_schema.columns WHERE table_name = 'key_statements' AND column_name = 'text_search' returns 1 row"
    why_human: "Cannot query live DB programmatically. Required for hybrid search to work on key_statements."
  - test: "Verify search_results_cache table exists in DB"
    expected: "SELECT tablename FROM pg_tables WHERE tablename = 'search_results_cache' returns 1 row"
    why_human: "Cannot query live DB programmatically. Required for shareable AI answer URLs."
  - test: "Smoke test: keyword search returns results"
    expected: "GET /api/search?q=bylaw&mode=keyword returns JSON with results array (non-empty)"
    why_human: "Depends on DB RPCs being applied. End-to-end integration only verifiable at runtime."
  - test: "Smoke test: AI question mode streams SSE"
    expected: "GET /api/search?q=What+did+council+decide+about+housing?&mode=ai streams SSE events including final_answer_chunk and done"
    why_human: "Requires live Gemini API key and DB connectivity. User confirmed this works (08-05 SUMMARY)."
  - test: "Update REQUIREMENTS.md SRCH-03 checkbox to [x] after DB confirmation"
    expected: "SRCH-03 checkbox marked [x] and traceability table updated to Complete"
    why_human: "Human must manually update REQUIREMENTS.md after confirming RPCs are in the DB."
---

# Phase 8: Unified Search & Hybrid RAG Verification Report

**Phase Goal:** Users search and ask questions from a single page that intelligently handles both keyword lookups and natural language questions, with conversation continuity
**Verified:** 2026-02-18
**Status:** human_needed (automated checks passed; DB-side SRCH-03 requires human confirmation)
**Re-verification:** No — initial verification

## Goal Achievement

### Success Criteria from ROADMAP.md

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | A single /search page exists and the old separate Search and Ask pages are removed or redirect to it | VERIFIED | `routes/search.tsx` exists (634 lines). `routes/ask.tsx` is a 301 redirect to `/search`. No `/ask` links remain in navbar. |
| 2 | Keyword query shows results list; question query triggers AI answer with citations | VERIFIED | `classifyIntent` in `intent.ts` routes query type. `api.search.tsx` returns JSON for keyword, SSE for AI. `search.tsx` uses EventSource with `mode=ai` and fetch with `mode=keyword`. |
| 3 | Search results include matches from document sections, key statements, transcript segments, and motions | VERIFIED | `hybridSearchAll` calls all four content type functions in parallel. `SearchResults` component has filter pills for all four types. |
| 4 | User can ask follow-up that references context from previous exchange | VERIFIED | `conversationRef` in `search.tsx` stores up to 5 Q&A turns. `buildConversationContext()` serializes history. Context passed as `&context=` param to EventSource URL. |
| 5 | Conversation history persists within session, resets on new session, capped at 5 turns | VERIFIED | `conversationRef.current = conversationRef.current.slice(-5)` after each turn. `handleNewSearch()` clears `conversationRef.current`. No localStorage persistence (session-only via useRef). |

**Score:** 5/5 success criteria verified

### Observable Truths (from Plan must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Hybrid search RPC functions exist in Supabase for motions, key_statements, and document_sections combining vector + FTS with RRF | ? UNCERTAIN | Migration SQL exists at `supabase/migrations/08-01-all-hybrid-search-migrations.sql` with all 3 RPCs correctly defined using RRF pattern. Summary says "MCP applied" but REQUIREMENTS.md still marks SRCH-03 as `[ ]` Pending — DB state unconfirmable without live query. |
| 2 | key_statements table has a text_search tsvector column with GIN index | ? UNCERTAIN | Migration SQL defines the column. Cannot confirm DB state without live query. |
| 3 | search_results_cache table exists for shareable AI answer URLs | ? UNCERTAIN | Migration SQL defines the table with RLS policies. Cannot confirm DB state without live query. |
| 4 | Intent classifier distinguishes keyword queries from natural language questions | VERIFIED | `intent.ts` (68 lines) implements full heuristic with question starters, word count rules, and question mark detection. Exported `classifyIntent` and `QueryIntent`. |
| 5 | hybrid-search.server.ts returns unified ranked results across all content types | VERIFIED | `hybridSearchAll` (350 lines): calls motions, key_statements, document_sections RPCs in parallel plus FTS transcript search; merges, enriches with meeting dates, deduplicates by type+id, sorts by rank_score, returns top N. |
| 6 | GET /api/search?q=...&mode=keyword returns JSON search results | VERIFIED | `api.search.tsx` loader: mode=keyword path calls `hybridSearchAll` and returns `Response.json({results, query, intent: 'keyword'})`. |
| 7 | GET /api/search?q=... streaming SSE for AI questions | VERIFIED | `api.search.tsx` loader: question mode uses `new ReadableStream({ async start(controller) {...} })` with SSE encoding. Collects answer+sources, generates follow-ups via Gemini, emits `suggested_followups`, `cache_id`, then `done`. |
| 8 | RAG agent can search document_sections | VERIFIED | `rag.server.ts`: `search_document_sections` function and tool registered. `NormalizedSource` type includes `document_section`. Source normalization handler in agent loop. System prompt updated with tool description. |
| 9 | Completed AI answers cached to search_results_cache with short ID | VERIFIED | `saveSearchResultCache` in `hybrid-search.server.ts` inserts to `search_results_cache`. Cache ID emitted as `cache_id` SSE event. `search.tsx` updates URL with `?id=` param on receipt. |
| 10 | User can ask follow-up questions with conversation continuity, limited to 5 turns | VERIFIED | `conversationRef` + `buildConversationContext()` + `isTopicChange()` in `search.tsx`. Caps at 5 with `slice(-5)`. |

**Score:** 7/10 truths fully verified (3 uncertain pending DB confirmation)

### Required Artifacts

| Artifact | Min Lines | Actual | Status | Notes |
|----------|-----------|--------|--------|-------|
| `apps/web/app/services/hybrid-search.server.ts` | 100 | 350 | VERIFIED | Substantive. Calls 3 RPCs + FTS. Exported: `hybridSearchAll`, `getSearchResultCache`, `saveSearchResultCache`, `UnifiedSearchResult`. |
| `apps/web/app/lib/intent.ts` | 20 | 68 | VERIFIED | Full heuristic classifier. Exported `classifyIntent`, `QueryIntent`. |
| `apps/web/app/routes/api.search.tsx` | 80 | 235 | VERIFIED | Handles cached lookup, keyword JSON, AI SSE with rate limiting, follow-up generation, caching. |
| `apps/web/app/services/rag.server.ts` | — | large | VERIFIED | Contains `search_document_sections`. `NormalizedSource` includes `document_section`. |
| `apps/web/app/routes/search.tsx` | 100 | 634 | VERIFIED | Full Perplexity-style page with tabs, streaming, keyword results, conversation, follow-ups. |
| `apps/web/app/components/search/ai-answer.tsx` | 50 | 287 | VERIFIED | Streaming answer with research steps, ReactMarkdown + citations, confidence indicator, copy button. |
| `apps/web/app/components/search/search-results.tsx` | 50 | 140 | VERIFIED | Filter pills, result list, loading skeleton, empty states. |
| `apps/web/app/components/search/result-card.tsx` | 40 | 161 | VERIFIED | Type-aware cards for all 4 content types with icons, badges, query highlighting. |
| `apps/web/app/components/search/citation-badge.tsx` | 30 | 144 | VERIFIED | CitationBadge with HoverCard preview. Exports `processCitationsInChildren`, `processCitationNode`. |
| `apps/web/app/components/search/follow-up.tsx` | 20 | 25 | VERIFIED | Suggested follow-up chips component. |
| `apps/web/app/routes/ask.tsx` | 5 | 17 | VERIFIED | Clean 301 redirect to /search preserving q and person params. |
| `supabase/migrations/08-01-all-hybrid-search-migrations.sql` | — | 236 | VERIFIED (file) | Complete SQL with all 3 RPCs using RRF pattern, GIN indexes, search_results_cache table with RLS. Applied to DB: UNCERTAIN. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `hybrid-search.server.ts` | Supabase `hybrid_search_*` RPCs | `supabase.rpc("hybrid_search_motions"...)` etc. | WIRED (code) / UNCERTAIN (DB) | All 3 RPC calls present at lines 58, 92, 125. DB must have RPCs for calls to succeed. |
| `hybrid-search.server.ts` | `embeddings.server.ts` | `generateQueryEmbedding` import | WIRED | Line 12: `import { generateQueryEmbedding } from "../lib/embeddings.server"`. Line 258: called in `hybridSearchAll`. |
| `api.search.tsx` | `hybrid-search.server.ts` | `hybridSearchAll` import | WIRED | Line 3-5: imported. Line 120: called for keyword mode. |
| `api.search.tsx` | `rag.server.ts` | `runQuestionAgent` import | WIRED | Line 8: imported. Line 150: called in ReadableStream with `for await`. |
| `api.search.tsx` | `intent.ts` | `classifyIntent` import | WIRED | Line 2: imported. Line 111: called for auto-detection. |
| `search.tsx` | `/api/search` | EventSource for AI answers, fetch for keyword | WIRED | Line 238: `new EventSource('/api/search?q=...&mode=ai...')`. Line 316: `fetch('/api/search?q=...&mode=keyword')`. |
| `ai-answer.tsx` | `citation-badge.tsx` | `processCitationsInChildren` | WIRED | Line 17: imported. Lines 165, 168: called in ReactMarkdown components for `p` and `li` tags. |
| `search.tsx` | `intent.ts` | `classifyIntent` | WIRED | Line 5: imported. Lines 32, 129, 405: called. |
| `ask-question.tsx` | `/search` | `buildAskUrl` returns /search URL | WIRED | Line 37: `return '/search?${params.toString()}'`. |
| `ask.tsx` | `/search` | 301 redirect | WIRED | Line 11-12: `redirect(searchUrl, 301)`. |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SRCH-01 | 08-03, 08-04, 08-05 | Unified search page replaces separate Search and Ask pages | SATISFIED | `search.tsx` exists; `ask.tsx` is 301 redirect; navbar has single "Search" nav item; no `/ask` links remain in navbar. |
| SRCH-02 | 08-02, 08-03, 08-05 | Keyword queries show results list, questions trigger AI answer with citations | SATISFIED | `classifyIntent` routes intent; `api.search.tsx` bifurcates on mode; `ai-answer.tsx` renders with `processCitationsInChildren` for inline [N] badges. |
| SRCH-03 | 08-01, 08-05 | Hybrid search RPC combines vector similarity and full-text search using RRF | UNCERTAIN | Migration SQL correctly implements RRF for all 3 tables. Application code calls RPCs. REQUIREMENTS.md shows `[ ]` Pending — DB application must be confirmed. |
| SRCH-04 | 08-01, 08-02, 08-05 | Search covers document sections, key statements, transcript segments, and motions | SATISFIED | `hybridSearchAll` covers all 4 types; RAG agent has `search_document_sections` tool; `SearchResults` has filter pills for all 4; `ResultCard` renders all 4 type-specific layouts. |
| SRCH-05 | 08-04, 08-05 | User can ask follow-up questions that reference previous answers | SATISFIED | `conversationRef` stores history; `buildConversationContext()` serializes Q&A pairs; context sent as `&context=` param; `FollowUp` chips component rendered after AI answer. |
| SRCH-06 | 08-04, 08-05 | Conversation history stored per session, limited to last 5 turns | SATISFIED | `conversationRef.current = conversationRef.current.slice(-5)` after each turn; `handleNewSearch()` clears all state; `isTopicChange()` auto-clears on topic switch; stored in `useRef` (no cross-session persistence). |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `hybrid-search.server.ts:69,103,140,183,186` | `return []` in error/empty handlers | Info | Graceful degradation — not stubs. Each is in try/catch or early-return paths with meaningful conditions. |
| None | No TODO/FIXME/placeholder found | — | All implementations are substantive. |
| `api.search.tsx:168` | `gemini-flash-latest` model name | Warning | Non-standard model identifier. If Gemini API doesn't recognize this model name, follow-up generation silently falls back to empty array (non-critical, guarded by try/catch). |

### Human Verification Required

#### 1. Confirm Supabase Hybrid Search RPCs

**Test:** Run in Supabase SQL Editor: `SELECT proname FROM pg_proc WHERE proname LIKE 'hybrid_search_%';`
**Expected:** Returns 3 rows: `hybrid_search_motions`, `hybrid_search_key_statements`, `hybrid_search_document_sections`
**Why human:** Migration was applied via MCP. REQUIREMENTS.md still shows SRCH-03 as `[ ]` (Pending). Cannot verify DB state programmatically.

#### 2. Confirm key_statements.text_search Column

**Test:** Run: `SELECT column_name FROM information_schema.columns WHERE table_name = 'key_statements' AND column_name = 'text_search';`
**Expected:** Returns 1 row with `column_name = 'text_search'`
**Why human:** Cannot query live DB programmatically.

#### 3. Confirm search_results_cache Table

**Test:** Run: `SELECT tablename FROM pg_tables WHERE tablename = 'search_results_cache';`
**Expected:** Returns 1 row
**Why human:** Cannot query live DB programmatically.

#### 4. Update REQUIREMENTS.md SRCH-03 Status

**Test:** After confirming RPCs exist in DB, update `REQUIREMENTS.md`:
- Change `- [ ] **SRCH-03**` to `- [x] **SRCH-03**`
- Change `| SRCH-03 | Phase 8 | Pending |` to `| SRCH-03 | Phase 8 | Complete |`

**Why human:** REQUIREMENTS.md is a human-maintained status document.

#### 5. Smoke Test: Keyword Search Returns Results

**Test:** With dev server running, visit `http://localhost:5173/search?q=bylaw&mode=keyword` (via tab switch to Search Results)
**Expected:** Results list shows motions/statements/transcripts mentioning "bylaw"
**Why human:** Requires DB connectivity and applied RPCs.

#### 6. Verify Gemini Model Name for Follow-up Generation

**Test:** After an AI answer completes, verify suggested follow-up chips appear below the answer
**Expected:** 2-3 follow-up question chips render after AI answer finishes streaming
**Why human:** Uses `gemini-flash-latest` model identifier — if unrecognized, follow-ups silently fail (caught by try/catch). Runtime check needed.

---

## Gaps Summary

No blocking gaps found. The implementation is substantive and complete:

- All 11 source files exist with meaningful implementation (zero stubs detected)
- All key links are wired in application code
- All 5 ROADMAP success criteria have supporting implementation
- SRCH-01, SRCH-02, SRCH-04, SRCH-05, SRCH-06 are fully verified

**One open item requiring human confirmation:** SRCH-03 depends on 3 Supabase RPC functions being present in the live database. The migration SQL file is complete and correct. The 08-01 SUMMARY says "MCP applied" but REQUIREMENTS.md has not been updated to reflect this. A 5-minute DB verification and REQUIREMENTS.md update closes this item.

---

_Verified: 2026-02-18_
_Verifier: Claude (gsd-verifier)_
