# Project Research Summary

**Project:** ViewRoyal.ai v1.7 -- LLM reranking, conversation memory, council member intelligence, email improvements, speaker fingerprinting
**Domain:** Civic intelligence platform feature expansion
**Researched:** 2026-03-05
**Confidence:** HIGH

## Executive Summary

ViewRoyal.ai v1.7 is a feature expansion of an already-mature civic intelligence platform. The existing stack (React Router 7 on Cloudflare Workers, Supabase with pgvector, Python ETL pipeline, Gemini AI) is validated and requires almost no new dependencies. The only new library is Resemblyzer for speaker voice embeddings in the pipeline. Every other v1.7 capability -- LLM reranking, conversation memory, topic taxonomy, AI profiling, email improvements, observability -- builds on existing infrastructure through new schema, new prompts, and architectural refinements. This is a deliberate constraint: minimize dependency sprawl, maximize leverage of what already works.

The recommended approach is a four-phase build that starts with database foundations and evaluation infrastructure, then improves the RAG search experience (the highest-traffic feature), then builds the council member intelligence layer (the deepest differentiator), and finally ships UX polish and pipeline improvements. The key insight from cross-referencing architecture and feature research is that RAG observability must come before RAG improvements (you need a baseline to measure against), and topic taxonomy must come before council profiles (profiles reference topics). These two dependency chains define the phase structure.

The primary risks are: (1) LLM reranking adding unacceptable latency to the already-streaming RAG pipeline -- mitigate with a latency budget, feature flag, and rerank-as-filter pattern; (2) speaker fingerprinting regressing existing diarization quality on the 700+ meeting corpus -- mitigate by applying fingerprinting only to new meetings with a strict cosine threshold and 10-meeting validation set; (3) AI-generated council profiles becoming stale and misleading without a freshness strategy -- mitigate with `evidence_cutoff_date` tracking and incremental regeneration. All three are manageable with the prevention strategies identified in research.

## Key Findings

### Recommended Stack

No new web app dependencies. One new pipeline dependency (Resemblyzer). All other capabilities use existing infrastructure in new ways.

**Core additions:**
- **Cloudflare Workers KV**: Conversation memory -- zero new deps, TTL auto-expiration, co-located with Worker for zero-hop reads
- **Gemini Flash pointwise scoring**: LLM reranking -- no new vendor, no new API key, adequate quality at 20-30 candidate scale
- **Resemblyzer**: Speaker voice embeddings -- lightweight (256-dim d-vectors), PyTorch-compatible, purpose-built for embedding extraction
- **Supabase PostgreSQL (existing)**: Topic taxonomy, key votes, RAG traces, feedback -- relational data belongs in the DB

**What NOT to add:** LangChain/LlamaIndex (over-abstraction), dedicated vector DB (pgvector handles scale), Cohere/Voyage reranker (vendor sprawl), react-email (Deno Edge Function incompatibility), separate observability platform (PostHog already captures AI events).

### Expected Features

**Must have (table stakes):**
- LLM reranking of RAG results -- single highest-ROI retrieval improvement
- Meeting summary cards -- pure frontend, data already exists
- Meeting outcome badges -- colored status indicators for motions
- RAG observability and feedback -- thumbs up/down, the eval foundation for everything else
- Email digest design improvements -- mobile-friendly, scannable, meeting summary at top

**Should have (differentiators):**
- AI-generated council member profiles -- synthesized from voting, speaking, and stance data
- Topic taxonomy with subcategories -- enables "show me everything about affordable housing"
- Persistent conversation memory via KV -- survives page refresh within a session
- RAG tool set redesign -- consolidate 9 overlapping tools to ~5 purposeful ones
- Council member profile page redesign -- hero card, policy grid, voting patterns
- Financial transparency per agenda item -- surface existing `financial_cost` fields

**Defer:**
- Full budget explorer (no pipeline data source)
- Multi-municipality comparison (v1.8 scope)
- Push/SMS notifications (overkill for current user base)
- Real-time "join now" meeting links (batch pipeline cannot detect in-progress meetings)
- Sentiment analysis badges on transcripts (civic tone analysis is misleading)

### Architecture Approach

The system operates across three deployment boundaries (Cloudflare Worker, Supabase Edge Functions, local Python pipeline) with Supabase PostgreSQL as the shared data store. v1.7 changes follow the existing patterns: lazy singletons for service clients, Supabase RPCs for complex queries, SSE streaming for AI responses, and independent pipeline steps with CLI flags. The major architectural change is inserting an LLM reranking step between evidence gathering and synthesis in the RAG pipeline, and adding KV as a second data store for ephemeral conversation state.

**Major components to build/modify:**
1. **RAG tool redesign** (rag.server.ts) -- Consolidate 9 tools to ~5; unified `search_council_records` replaces 5 overlapping search tools
2. **LLM reranking** (rag.server.ts) -- New `rerankSources` function between tool results and synthesis
3. **KV conversation memory** (wrangler.toml + routes + rag.server.ts) -- Server-side session state with 24h TTL
4. **Topic taxonomy** (new Supabase tables + pipeline classification) -- Hierarchical extension of existing 8-topic system
5. **Speaker fingerprint storage** (new table + pipeline diarization integration) -- 256-dim embeddings for cross-meeting identification
6. **Council profile pipeline** (stance_generator + profile_agent enhancements) -- Key vote detection, taxonomy integration, freshness tracking
7. **RAG observability** (new tables + API route + feedback UI) -- rag_traces and rag_feedback tables, thumbs up/down

### Critical Pitfalls

1. **LLM reranking latency** -- Rerank once after all tools complete (not per-tool), use as a filter (top-N selection) not reorderer, set 15-second latency budget, build with feature flag
2. **Speaker fingerprinting regression** -- Never auto-re-diarize old meetings, use strict 0.85 cosine threshold, validate on 10 known meetings before deploying, store rolling average embeddings
3. **Stale AI profiles** -- Add `evidence_cutoff_date` to stances table, show "current as of [date]" in UI, incrementally regenerate only affected councillor-topic pairs
4. **KV conversation context corruption** -- Cap at 3-5 turns, summarize older turns, use 30-min TTL, validate version counter on read, evaluate if `sessionStorage` is sufficient
5. **Topic taxonomy fragmentation** -- Extend existing 8-topic system (not replace), keep `normalize_category_to_topic` compatible, plan for stance regeneration run

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Evaluation Foundation and Quick Wins
**Rationale:** RAG observability must exist before measuring any RAG improvement. Quick wins (summary cards, badges) ship visible value immediately and build momentum.
**Delivers:** Feedback collection infrastructure, visible UI improvements, database schema for downstream features
**Addresses:** RAG observability/feedback (table stakes), meeting summary cards (table stakes), meeting outcome badges (table stakes), email digest improvements (table stakes)
**Avoids:** Pitfall #10 (observability data explosion) -- ship feedback buttons first, detailed tracing later. Pitfall #7 (summary duplication) -- assemble cards from existing data, no new AI generation.
**DB migrations:** `rag_traces`, `rag_feedback`, `topic_taxonomy`, `agenda_item_topic_tags`, `speaker_fingerprints`, `councillor_key_votes` (create all tables upfront even if populated later)

### Phase 2: RAG Intelligence
**Rationale:** Search/ask is the highest-traffic feature. Improvements here have the largest user-visible impact. Feedback baseline from Phase 1 enables measurement.
**Delivers:** Better answer quality through reranking, fewer wasted tool calls through consolidation, persistent conversation context
**Uses:** Gemini Flash (reranking), Cloudflare KV (conversation memory)
**Implements:** RAG tool redesign, LLM reranking, KV conversation memory
**Avoids:** Pitfall #1 (reranking latency) -- feature flag, latency budget. Pitfall #2 (KV stale context) -- 30-min TTL, turn cap. Pitfall #9 (reranking inconsistency) -- rerank as filter, cache results.

### Phase 3: Council Member Intelligence
**Rationale:** Deepest differentiator. Depends on topic taxonomy tables (Phase 1 migration) and benefits from improved speaker attribution.
**Delivers:** AI-generated profiles, topic subcategories, key vote detection, redesigned profile pages
**Uses:** Supabase PostgreSQL (taxonomy, profiles, key votes), Gemini (profile generation, topic classification)
**Implements:** Topic taxonomy backfill, council profile pipeline enhancements, profile page redesign
**Avoids:** Pitfall #5 (stale profiles) -- evidence_cutoff_date, incremental regen. Pitfall #6 (taxonomy mismatch) -- extend existing 8 topics. Pitfall #11 (profile page regression) -- additive design, inventory existing features.

### Phase 4: Pipeline Improvements and Polish
**Rationale:** Pipeline-only changes (fingerprinting, meeting summarization) can happen in parallel with web work but carry higher risk of regression. Ship after core web features are stable.
**Delivers:** Cross-meeting speaker identification, improved meeting summaries, financial transparency, email improvements
**Uses:** Resemblyzer (speaker embeddings), Gemini (meeting summarization)
**Implements:** Speaker fingerprint pipeline, meeting summary generation, financial data surfacing
**Avoids:** Pitfall #4 (fingerprinting regression) -- new meetings only, validation set, strict threshold. Pitfall #8 (email rendering) -- inline styles only, test in real clients. Pitfall #13 (Gemini cost spike) -- per-feature caps, batch classification.

### Phase Ordering Rationale

- **Phase 1 before Phase 2:** You cannot measure RAG improvements without a feedback baseline. The observability table and feedback UI must exist first.
- **Phase 1 migrations before Phase 3:** Topic taxonomy tables must exist before the pipeline can classify agenda items into subcategories or profiles can reference them.
- **Phase 2 before Phase 3:** RAG tool redesign improves the search experience that profile pages link into. Better RAG answers also improve profile-related questions.
- **Phase 4 last:** Speaker fingerprinting carries regression risk and needs the most validation. Meeting summarization improves quality but is not blocking any web features (existing summaries work). Financial transparency requires verifying that `financial_cost` fields are actually populated in the DB.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (RAG tool redesign):** The consolidation of 9 tools to 5 requires careful prompt engineering for the orchestrator. The merged `search_council_records` tool needs internal routing logic that should be prototyped.
- **Phase 3 (topic taxonomy backfill):** LLM-assisted classification of 700+ meetings' agenda items into subcategories is a batch operation that needs prompt tuning and cost estimation.
- **Phase 4 (speaker fingerprinting):** Resemblyzer integration with the MLX diarization pipeline needs a spike to verify embedding compatibility and threshold tuning.

Phases with standard patterns (skip deep research):
- **Phase 1 (quick wins + migrations):** Meeting summary cards, outcome badges, and feedback UI are straightforward frontend work. DB migrations follow established Supabase patterns.
- **Phase 2 (KV conversation memory):** Cloudflare KV is well-documented with clear binding patterns. The main question (KV vs sessionStorage) is an implementation decision, not a research question.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Almost no new dependencies; recommendations validated against existing codebase; only Resemblyzer is new and it is well-documented |
| Features | HIGH | Feature list derived from direct codebase analysis of existing data/schema; dependency graph is clear; anti-features well-reasoned |
| Architecture | HIGH | Based on direct inspection of all touched files; integration points are specific to line numbers and function signatures |
| Pitfalls | HIGH | Pitfalls grounded in actual codebase constraints (Cloudflare Workers limits, KV consistency model, existing diarization thresholds, ghost neighbourhood column) |

**Overall confidence:** HIGH

### Gaps to Address

- **Financial cost field population:** The `financial_cost` fields exist in TypeScript types but may not be populated in the actual database. Must verify with a query before planning financial transparency UI. If unpopulated, this becomes a pipeline extraction task that should move earlier.
- **Resemblyzer + MLX compatibility:** The pipeline uses MLX for diarization (Apple Silicon specific). Resemblyzer uses PyTorch. Both should coexist but a quick spike should verify no dependency conflicts.
- **KV vs sessionStorage decision:** Research identified sessionStorage as a simpler alternative for conversation memory. This is an implementation-time decision that could simplify Phase 2 significantly. Evaluate during phase planning.
- **Gemini cost projection:** Multiple new Gemini consumers (reranking, classification, profile generation, summarization). Need to estimate monthly costs at current query volume before committing to all features.
- **Neighbourhood column strategy:** The ghost column (Pitfall #3) was flagged but neighbourhood filtering is NOT in the v1.7 feature list. If it surfaces during planning, the pipeline geocoding work must precede any frontend work. The `vrneighbourhoods.geojson` file is available.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of `rag.server.ts`, `api.ask.tsx`, `api.search.tsx`, `stance_generator.py`, `profile_agent.py`, `clustering.py`, `send-alerts/index.ts`, `types.ts`, `bootstrap.sql`, `wrangler.toml`
- Cloudflare Workers KV documentation (platform docs)
- Supabase pgvector documentation (platform docs)
- Project documentation: `CLAUDE.md`, `PROJECT.md`

### Secondary (MEDIUM confidence)
- [ZeroEntropy reranking guides](https://www.zeroentropy.dev/articles/ultimate-guide-to-choosing-the-best-reranking-model-in-2025) -- LLM reranking benchmarks and trade-offs
- [InsertRank paper](https://arxiv.org/html/2506.14086v1) -- BM25 score injection for 3-16% reranking gains
- [Voyage AI case against LLM rerankers](https://blog.voyageai.com/2025/10/22/the-case-against-llms-as-rerankers/) -- LLM reranking variance concerns
- [Resemblyzer documentation](https://github.com/resemble-ai/Resemblyzer) -- speaker embedding extraction
- [NLP for Local Governance](https://arxiv.org/html/2602.08162v1) -- academic survey of municipal meeting NLP

### Tertiary (LOW confidence)
- Email template best practices (Postmark, SendPulse) -- general guidance, not civic-specific
- CivicPatterns.org -- civic technology design patterns (general reference)

---
*Research completed: 2026-03-05*
*Ready for roadmap: yes*
