# Stack Research: v1.1 Deep Intelligence

> **Research date**: 2026-02-16
> **Scope**: Document chunking/sectioning, hybrid RAG, conversation memory, council profiling
> **Out of scope**: Existing stack (React Router 7, Tailwind 4, shadcn/ui, Cloudflare Workers, Supabase, Gemini, fastembed, PyMuPDF, OpenAI embeddings)

---

## 1. Document Chunking/Sectioning

### Existing Stack (no additions needed)
- **PyMuPDF (fitz)** — Already used in `apps/pipeline/pipeline/ingestion/ingester.py` for PDF text extraction. Supports page-level extraction, heading detection via font size analysis, and table extraction.
- **Supabase PostgreSQL** — Already has `documents` table with `full_text` field. The `bylaw_chunks` table provides a proven chunking pattern with per-chunk embeddings.
- **fastembed (nomic-embed-text-v1.5)** — Already generates halfvec(384) embeddings for pipeline content. Will embed document sections.

### New Patterns (no new dependencies)
- **Chunking strategy**: Use PyMuPDF's `page.get_text("dict")` to extract text with font metadata → identify headings by font size → split into sections at heading boundaries. Fallback: fixed-size overlapping chunks (512 tokens, 128 overlap) for documents without clear headings.
- **`document_sections` table**: Follow the `bylaw_chunks` pattern — parent FK to `documents`, section text, section_order, embedding halfvec(384), tsvector for FTS.
- **Agenda-specific parsing**: CivicWeb agenda PDFs follow consistent structure (numbered agenda items, headings). Custom parser to extract agenda structure → link sections to `agenda_items` via title matching.

### What NOT to add
- **LangChain/LlamaIndex** — Overkill for straightforward chunking. PyMuPDF + custom logic is sufficient.
- **Unstructured.io** — Heavy dependency for what PyMuPDF already does. Only needed for complex document types (tables, forms) not in scope.
- **Separate vector database** — pgvector in Supabase is sufficient. No Pinecone/Weaviate/Qdrant needed.

---

## 2. Hybrid RAG Search

### Existing Stack
- **pgvector** — Already handles vector similarity search via `match_key_statements` and `match_transcript_segments` RPCs.
- **tsvector** — Already on `transcript_segments` (`search_text` column). Proven FTS infrastructure.
- **Google Gemini** — Already powers RAG synthesis in `rag.server.ts`.
- **OpenAI text-embedding-3-small** — Already generates query embeddings at runtime (384 dimensions via Matryoshka).

### New Pattern: Reciprocal Rank Fusion (RRF)
- **No new dependencies** — Hybrid search combines vector results + FTS results using RRF scoring in a Supabase RPC function.
- **Implementation**: Create an RPC `hybrid_search(query_embedding, query_text, match_count)` that:
  1. Vector search → ranked results with cosine similarity scores
  2. FTS search → ranked results with ts_rank scores
  3. Combine using RRF: `score = sum(1 / (k + rank))` where k=60 (standard constant)
  4. Return top-N merged, deduplicated results
- **Sources expansion**: Search across `key_statements`, `document_sections` (new), `transcript_segments` (FTS only, no embedding), `motions` (FTS).

### What NOT to add
- **Elasticsearch/Typesense** — Supabase tsvector + pgvector covers hybrid search natively. External search engine adds operational complexity.
- **Cohere Reranker** — Adds API dependency and latency. RRF achieves 80% of reranker quality with zero additional cost.

---

## 3. Conversation Memory for RAG

### Existing Stack
- **Supabase PostgreSQL** — Natural place to store conversation history.

### New Pattern: Session-based conversation context
- **No new library dependencies** — Store conversation turns in a `rag_conversations` table (session_id, role, content, created_at). Load recent turns as context for Gemini prompt.
- **Session management**: Use a UUID session ID stored in browser sessionStorage. Each Ask page visit starts a new conversation. Follow-up questions include previous Q&A pairs in the Gemini system prompt.
- **Context window management**: Include last 3-5 turns (configurable). Older turns summarized or dropped to stay within Gemini context limits.
- **Cloudflare Workers compatible**: No server-side session state needed. Session ID in client, conversation history in Supabase.

### What NOT to add
- **Redis/Upstash for session state** — Supabase is sufficient for conversation history. Sub-second query latency on indexed session_id.
- **LangChain memory abstractions** — Simple array of messages is sufficient. No conversation summarization chain needed for 3-5 turns.

---

## 4. Council Member Profiling

### Existing Stack
- **Google Gemini** — Already used for AI synthesis. Will generate stance summaries from transcript/voting data.
- **Supabase PostgreSQL** — Already has `people`, `votes`, `motions`, `transcript_segments`, `key_statements`, `attendance` tables.

### New Patterns
- **Stance summary generation**: Pipeline batch job (or on-demand with caching) that:
  1. Queries all key_statements + votes for a person
  2. Groups by topic/category
  3. Sends to Gemini with prompt: "Summarize this councillor's position on [topic] based on their statements and votes"
  4. Stores result in new `person_profiles` or `person_stance_summaries` table
- **Voting pattern analysis**: Pure SQL aggregations — no new dependencies:
  - Vote alignment matrix (who votes together most often)
  - Dissent rate (how often they vote against majority)
  - Category-level voting breakdown
  - Attendance rate
- **Activity metrics**: SQL aggregations over existing tables:
  - Speaking time (sum of transcript segment durations per person)
  - Motions proposed/seconded
  - Meeting attendance rate
  - Topics spoken about (via key_statements → topics join)

### Caching Strategy
- **Materialized views or cached JSON**: Stance summaries are expensive (Gemini API call per person per topic). Generate during pipeline run or nightly cron, store results. Web app reads cached profiles.
- **Invalidation**: Regenerate when new meeting data is ingested for that person.

### What NOT to add
- **Separate ML models for stance detection** — Gemini handles this adequately via prompt engineering.
- **D3.js or complex visualization library** — Tailwind + simple SVG/CSS charts sufficient for voting patterns. Recharts if needed (already common in React ecosystem).

---

## 5. Dependency Summary

### New Production Dependencies
None required. All features buildable with existing stack.

### Potential Optional Additions

| Package | Purpose | When to add |
|---------|---------|-------------|
| `recharts` | Voting pattern visualizations (charts) | Only if CSS/SVG charts insufficient |

### New Supabase Tables

| Table | Purpose |
|-------|---------|
| `document_sections` | Chunked document content with per-section embeddings |
| `rag_conversations` | Conversation history for RAG memory |
| `person_stance_summaries` | Cached AI-generated stance summaries per person per topic |

### New/Modified RPC Functions

| Function | Purpose |
|----------|---------|
| `hybrid_search` | Combined vector + FTS search with RRF scoring |
| `match_document_sections` | Vector search over document section embeddings |
| `get_voting_alignment` | Voting pattern analysis between council members |

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Gemini API costs for stance summaries | Medium | Medium | Batch generation, aggressive caching, limit to active councillors |
| Document chunking quality varies by PDF | Medium | Medium | Fallback to fixed-size chunks, manual review of first batch |
| Hybrid search returns noisy results | Low | Medium | Tune RRF k-constant, add minimum similarity threshold |
| Conversation memory bloats Gemini context | Low | Low | Hard limit at 5 turns, summarize older turns |

---
*Last updated: 2026-02-16*
