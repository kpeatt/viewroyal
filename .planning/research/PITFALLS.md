# Pitfalls Research: v1.1 Deep Intelligence

**Research date:** 2026-02-16
**Scope:** Common mistakes when adding document sectioning, hybrid RAG, conversation memory, and council profiling to existing system

---

## P1. Document Chunking Quality Varies Wildly by PDF

**Severity:** High
**Phase:** Document Sectioning

CivicWeb PDFs aren't uniform. Regular meeting agendas have numbered headings, but addendums may be free-form. Supplementary schedules might be tables. Staff reports have their own structure.

**Warning signs:**
- Chunks that split mid-sentence or mid-paragraph
- Sections with only 1-2 words (heading extracted without content)
- Sections that are 10+ pages (entire document as one chunk)
- Duplicate content in overlapping chunks

**Prevention strategy:**
1. Analyze a sample of 10-15 actual PDFs from the archive before designing the chunker
2. Implement multiple chunking strategies: heading-based (primary), page-based (fallback), fixed-size with overlap (last resort)
3. Add a `chunk_method` column to `document_sections` to track which strategy was used
4. Log chunking stats (section count, avg size, min/max) per document for monitoring
5. Don't aim for perfection — "good enough" chunks with embeddings still vastly improve search over whole-document embeddings

---

## P2. Hybrid Search Tuning — Vector vs FTS Weight Balance

**Severity:** Medium
**Phase:** Hybrid RAG

Reciprocal Rank Fusion combines vector and FTS results, but the balance matters. If vector results dominate, keyword searches for specific bylaw numbers or addresses fail. If FTS dominates, semantic queries like "what's the council's position on housing" miss relevant but differently-worded content.

**Warning signs:**
- Exact keyword searches (bylaw numbers, addresses) return no results despite existing in documents
- Semantic questions return irrelevant results because FTS keywords happen to match
- Same results regardless of query type (one search method always wins)

**Prevention strategy:**
1. Start with standard RRF k=60 constant
2. Test with three query types: exact keyword (bylaw "2024-01"), semantic ("housing development concerns"), hybrid ("Helmcken Road rezoning application")
3. Consider separate vector-only and FTS-only result sets in the RPC, letting the application layer merge — easier to debug than a single black-box function
4. Add a `search_mode` parameter (auto/vector/keyword) for power users

---

## P3. Conversation Memory Bloating Gemini Context

**Severity:** Medium
**Phase:** Conversation Memory

Each conversation turn adds ~500-2000 tokens to the Gemini prompt (question + answer + citations). After 5 turns, that's 5,000-10,000 tokens of conversation history competing with search result context for the model's attention.

**Warning signs:**
- Later questions in a conversation get worse answers than the first question
- Gemini starts ignoring search results in favor of previous answers (echo chamber)
- Response latency increases noticeably after 3-4 turns
- Token usage costs spike for conversational users

**Prevention strategy:**
1. Hard limit at 5 conversation turns in context (most recent)
2. Include only the question and a summary of the answer (not full answer text) for older turns
3. Always prioritize fresh search results over conversation history in the prompt structure
4. Track token usage per conversation to set alerts
5. Clear conversation on topic change detection (optional, complex)

---

## P4. Stance Summary Hallucination and Attribution

**Severity:** High
**Phase:** Council Profiling

AI-generated stance summaries are the highest-risk feature. If Gemini says "Councillor X supports affordable housing" but the evidence is ambiguous or misinterpreted, that's a credibility-destroying error for a civic transparency platform.

**Warning signs:**
- Stance summary makes a claim not supported by the provided evidence
- Summary uses absolute language ("always votes for...") when reality is nuanced
- Summary is generic ("Councillor X cares about the community") — not grounded in specifics
- Evidence quotes are truncated or out of context

**Prevention strategy:**
1. Always include source evidence alongside summaries (quotes, vote records)
2. Use conservative prompting: "Based ONLY on the following statements and votes, summarize..."
3. Add confidence scoring: high (5+ supporting data points), medium (2-4), low (1)
4. For low-confidence topics, show raw data instead of AI summary
5. Include a disclaimer: "AI-generated summary based on meeting records"
6. Let users click through to source meetings for verification
7. Human review of first batch of summaries before going live

---

## P5. `document_sections` Embedding Index Performance

**Severity:** Medium
**Phase:** Document Sectioning

The existing `key_statements` table has embeddings and an ivfflat index. Adding `document_sections` with potentially thousands more rows (each document → 5-20 sections, across all meetings) may degrade vector search performance if the index isn't sized correctly.

**Warning signs:**
- Vector search latency increases from <100ms to >500ms
- Search results become less relevant (poor index quality with wrong `lists` parameter)
- Pipeline embedding phase takes significantly longer

**Prevention strategy:**
1. Size the ivfflat `lists` parameter based on expected row count: `lists = sqrt(total_rows)`. Start with 100, increase if rows exceed 10,000.
2. Run `ANALYZE document_sections;` after bulk loads to update statistics
3. Consider HNSW index instead of ivfflat if row count exceeds 50,000 — better recall at scale
4. Monitor query plans with `EXPLAIN ANALYZE` on the vector search RPC
5. Separate the document section search from key_statement search in the RPC — don't try to union across different tables in a single vector query

---

## P6. Over-Engineering the Profile Page

**Severity:** Medium
**Phase:** Council Profiling

The temptation is to build a comprehensive dashboard with charts, graphs, matrices, and AI summaries all at once. This risks:
- Page load time (multiple complex queries)
- Information overload for citizens
- High development time for features that may not be used

**Warning signs:**
- Profile page takes >3 seconds to load
- Users bounce from profile page without engaging
- Complex visualization components that are hard to maintain

**Prevention strategy:**
1. Ship voting history and basic metrics first (pure SQL, fast, high-value)
2. Add stance summaries as a second iteration
3. Add voting alignment matrix last (least intuitive for general public)
4. Use lazy loading or tabs for heavy sections
5. Measure engagement per section before investing in polish

---

## P7. Breaking Existing RAG While Upgrading

**Severity:** High
**Phase:** Hybrid RAG

The current RAG works (minus the broken `match_transcript_segments` which needs fixing regardless). Upgrading to hybrid search risks introducing regressions:
- New search returns different (worse) results for previously good queries
- Citation format changes break the streaming UI
- Conversation memory confuses stateless clients that don't send session IDs

**Warning signs:**
- Known-good questions that worked before now give irrelevant answers
- Citation links break or point to wrong sources
- Ask page errors for users without JavaScript (no sessionStorage)

**Prevention strategy:**
1. Keep the existing RAG working throughout development — don't break the old before the new is ready
2. Add hybrid search as a new RPC alongside existing RPCs, switch over when tested
3. Make conversation memory optional — absence of conversationId falls back to stateless behavior
4. Test with a set of 10 "golden queries" that have known-good answers, verify before and after
5. Support a `?debug=true` query param that shows which search results fed the answer

---

## P8. Pipeline Re-Embedding Cost and Time

**Severity:** Medium
**Phase:** Document Sectioning

After creating `document_sections`, all existing documents need to be backfilled — parsed into sections and embedded. If there are hundreds of documents, this could take significant time and fastembed resources.

**Warning signs:**
- Backfill takes hours and blocks regular pipeline runs
- Some documents fail to parse, leaving gaps in sections
- Existing document embeddings in the `documents` table become redundant

**Prevention strategy:**
1. Run backfill as a separate one-time script, not part of the regular pipeline
2. Process documents in batches with progress tracking
3. Keep existing whole-document embeddings — they're cheap to store and may still be useful for document-level relevance ranking
4. Add idempotency — check if sections already exist for a document before re-processing
5. Log failures and handle them manually rather than blocking the entire backfill

---

*Last updated: 2026-02-16*
