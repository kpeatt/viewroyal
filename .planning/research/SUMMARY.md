# Research Summary: v1.1 Deep Intelligence

**Project:** ViewRoyal.ai
**Milestone:** v1.1 Deep Intelligence
**Researched:** 2026-02-16
**Confidence:** HIGH

## Executive Summary

v1.1 deepens the platform's intelligence layer across three tightly-coupled areas: document understanding, RAG quality, and council member profiling. The key insight is that these features form a dependency chain — better document sectioning feeds better search, better search feeds better RAG answers, and richer data feeds better council profiles. No new production dependencies are required; the existing stack (PyMuPDF, pgvector, Gemini, fastembed, OpenAI) handles everything.

## Key Findings

### Stack Additions
**None required.** All features build on the existing stack:
- PyMuPDF for document parsing/chunking (already used)
- pgvector for section-level embeddings (existing halfvec 384)
- PostgreSQL tsvector for full-text search (existing, extend to new tables)
- Gemini for stance summary generation (existing RAG infrastructure)
- Reciprocal Rank Fusion implemented as a Supabase RPC function (pure SQL)
- Conversation memory stored in Supabase (simple table, no external session store)

**Optional**: `recharts` for voting pattern visualizations, only if CSS/SVG charts prove insufficient.

### Feature Table Stakes
- **Document section search** — PDFs chunked with per-section embeddings, searchable via vector + FTS. Current whole-document approach is too coarse.
- **Documents in RAG** — Ask page must search document content alongside transcripts. Current RAG misses all agenda/report content.
- **Hybrid search** — Vector + full-text via RRF. Pure vector misses keywords (bylaw numbers, addresses). Pure FTS misses semantic meaning.
- **Voting history visualization** — Detailed per-vote record on councillor pages. Every legislative tracker has this.

### Feature Differentiators
- **AI stance summaries** — Gemini-generated position summaries per councillor per topic. No civic platform does this.
- **Voting alignment matrix** — Who votes together, dissent patterns. Common at federal level, rare at municipal.
- **Conversation memory** — Session-scoped RAG memory. Follow-up questions without restating context.
- **Activity metrics** — Speaking time, attendance, motions proposed. Municipal-level GovTrack.

### Architecture Approach
- **Document sectioning** fits between existing pipeline Phase 4 (Ingest) and Phase 5 (Embed). New `document_sections` table follows proven `bylaw_chunks` pattern.
- **Hybrid search** replaces individual vector search RPCs with a single `hybrid_search` RPC combining vector + FTS + RRF.
- **Conversation memory** uses a `rag_conversations` table with session-based lookup. Client generates UUID, server loads recent turns.
- **Council profiling** is mostly SQL aggregation (voting patterns, activity metrics) plus Gemini synthesis (stance summaries) with caching.

### Watch Out For
1. **Document chunking quality** — CivicWeb PDFs vary in structure. Need heading-based + fixed-size fallback strategies. Test with real PDFs before finalizing.
2. **Stance summary hallucination** — AI summaries on civic data are high-stakes. Require source evidence, confidence scoring, and conservative prompting.
3. **Breaking existing RAG** — Keep old search working while building new hybrid search. Use golden queries to validate before/after.
4. **Hybrid search tuning** — RRF k-constant and result weighting need empirical tuning with three query types (keyword, semantic, hybrid).
5. **Profile page performance** — Ship voting history first, add AI summaries second. Don't overload the initial page.

### New Schema (3 tables)
| Table | Purpose |
|-------|---------|
| `document_sections` | Chunked document content with embeddings + tsvector |
| `rag_conversations` | Session-scoped conversation history for RAG memory |
| `person_stance_summaries` | Cached AI-generated stance summaries per councillor per topic |

### Build Order
1. **Document Sectioning** (Phase 7) — Schema + pipeline + backfill. Foundation for everything else.
2. **Hybrid RAG + Conversation Memory** (Phase 8) — Search upgrade + memory. Depends on sections existing.
3. **Council Profiling** (Phase 9) — SQL metrics + AI stances. Voting/metrics can start parallel with Phase 8.
4. **Integration & Polish** (Phase 10) — Cross-feature testing, performance tuning.

## Confidence Assessment

| Area | Confidence | Notes |
|------|-----------|-------|
| Stack | HIGH | No new dependencies. All existing tools sufficient. |
| Features | HIGH | Clear table stakes vs differentiators from civic platform analysis. |
| Architecture | HIGH | Integration points well-defined against existing codebase patterns. |
| Pitfalls | HIGH | Grounded in actual PDF analysis and existing code review. |

---
*Research completed: 2026-02-16*
*Ready for roadmap: yes*
