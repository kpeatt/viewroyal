# Features Research: v1.1 Deep Intelligence

**Research date:** 2026-02-16
**Scope:** Document sectioning, hybrid RAG, conversation memory, council member profiling

---

## Executive Summary

v1.1 deepens the intelligence layer across three areas: making document content searchable and RAG-accessible (currently stored as opaque blobs), upgrading the Q&A experience with hybrid search and conversation memory, and building rich council member profiles with AI-generated insights. These features are tightly coupled — better document understanding feeds better RAG, and better RAG feeds better council profiles.

---

## Table Stakes Features

### TS-1: Document Section Search
**What**: PDFs (agendas, addendums, supplementary schedules) chunked into sections with individual embeddings, searchable via vector similarity and full-text.
**Why table stakes**: The platform already stores full document text but can't search within it effectively. A single embedding per whole document is too coarse for meaningful retrieval. Every serious document search system (Legistar, Peak Agenda, government document management) provides section-level search.
**Complexity**: Medium. Requires: chunking logic in pipeline, `document_sections` table, embedding generation, RPC for search.
**Dependencies**: Existing `documents` table, existing embedding pipeline (fastembed).

### TS-2: Document Sections in RAG Context
**What**: When users ask questions on the Ask page, RAG searches document sections alongside transcripts and motions. Answers cite specific document sections.
**Why table stakes**: Current RAG only searches transcripts and motions — it misses everything in agenda documents, staff reports, addendums. Users asking "what did the staff report say about X?" get no answer. For a document-heavy civic platform, this is a critical gap.
**Complexity**: Medium. Requires: adding document section vector search to RAG pipeline, updating citation format.
**Dependencies**: TS-1 (document sections must exist first).

### TS-3: Hybrid Search (Vector + Full-Text)
**What**: Combine vector similarity search with PostgreSQL full-text search using Reciprocal Rank Fusion. Return better results by leveraging both semantic meaning and keyword matching.
**Why table stakes**: Pure vector search misses exact keyword matches (bylaw numbers, proper names, addresses). Pure FTS misses semantic similarity ("housing" should match "residential development"). Hybrid search is the standard approach in modern RAG systems.
**Complexity**: Medium. Requires: RPC function combining vector + tsvector results, tsvector columns on document_sections, tuning.
**Dependencies**: TS-1 (for document section search), existing tsvector on transcript_segments.

### TS-4: Voting History Visualization
**What**: Enhanced councillor page showing voting record — how they voted on each motion, with visual indicators for yea/nay/abstain. Filterable by category or time period.
**Why table stakes**: The existing people pages show basic stats but no detailed voting record. Councilmatic, Legistar, and every legislative tracker show per-vote records. Citizens expect to see "how did my councillor vote on X?"
**Complexity**: Low-Medium. Requires: query for votes + motions per person, vote list component with visual indicators.
**Dependencies**: Existing `votes`, `motions`, `people` tables.

---

## Differentiators

### D-1: AI Stance Summaries
**What**: AI-generated summaries of each councillor's positions on key topics (housing, environment, budget, infrastructure, etc.). Based on their statements in meetings and voting patterns. Updated after each meeting.
**Why differentiating**: No civic platform offers AI-synthesized position summaries. Councilmatic shows raw voting data. OpenGov shows spending data. ViewRoyal.ai would be the first to answer "where does Councillor X stand on housing?" with an AI-generated summary grounded in actual meeting data.
**Complexity**: High. Requires: topic grouping of statements/votes, Gemini synthesis per person per topic, caching strategy, freshness management.
**Dependencies**: TS-1 (richer source data), existing `key_statements`, `votes`, `transcript_segments` tables.

### D-2: Voting Alignment Matrix
**What**: Show which councillors vote together most often. Visualize voting blocs and dissent patterns. "Councillor A and Councillor B agree 87% of the time."
**Why differentiating**: Legislative alignment analysis is common in federal/state tools (GovTrack, ProPublica Congress API) but rare at the municipal level. Helps citizens understand council dynamics beyond individual votes.
**Complexity**: Medium. Pure SQL aggregation over votes table. Visualization with simple grid/heatmap.
**Dependencies**: Existing `votes` table with person_id and vote values.

### D-3: Conversation Memory for RAG
**What**: Ask page remembers previous questions in a session. "What did council decide about the park?" → "Who voted against it?" works without restating context. Session-scoped, not persistent.
**Why differentiating**: Current RAG is stateless — each question starts fresh. Conversation memory makes the Q&A feel like talking to a knowledgeable assistant rather than running isolated searches. No civic platform offers conversational Q&A.
**Complexity**: Medium. Requires: conversation state storage, context injection into Gemini prompt, session management on client.
**Dependencies**: Existing RAG pipeline in `rag.server.ts`.

### D-4: Activity Metrics Dashboard
**What**: Per-councillor dashboard showing: speaking time across meetings, attendance rate, motions proposed/seconded, topics spoken about. Trends over time.
**Why differentiating**: GovTrack does this for Congress. At municipal level, this data exists but no platform aggregates it into an engagement profile. "Councillor X spoke for 45 minutes this month, mostly about housing and infrastructure" is powerful civic transparency.
**Complexity**: Medium. SQL aggregations over existing tables. Component for metrics display.
**Dependencies**: Existing `transcript_segments`, `attendance`, `motions`, `key_statements` tables.

### D-5: Councillor Comparison
**What**: Compare two councillors side-by-side: voting record, speaking topics, attendance, stance differences.
**Why differentiating**: Political comparison tools exist at federal level but not municipal. Useful during election season.
**Complexity**: Low (builds on D-1, D-2, D-4 data). Comparison layout component.
**Dependencies**: D-1, D-2, D-4 (needs profile data to compare).

---

## Anti-Features (Deliberately NOT Building)

### AF-1: Real-Time Document Processing
**Why not**: Documents arrive in batches (meeting agendas published days before meetings). Real-time processing adds complexity with no user benefit. Batch pipeline is appropriate.

### AF-2: Document OCR/Image Analysis
**Why not**: PyMuPDF text extraction with OCR fallback already handles this. Adding dedicated OCR (Tesseract, Google Vision) is unnecessary unless significant content is in scanned images — View Royal PDFs are digital-native.

### AF-3: Multi-Model Embedding Comparison
**Why not**: The project standardized on halfvec(384) with nomic-embed-text-v1.5 (pipeline) and OpenAI text-embedding-3-small (web app). Switching or comparing embedding models adds complexity without clear benefit at current scale.

### AF-4: Automated Fact-Checking
**Why not**: AI stance summaries are grounded in actual meeting data (quotes, votes). Adding a fact-checking layer implies the source data might be wrong — it's official council records. Adds complexity and potential for misleading "accuracy scores."

---

## Feature Dependency Map

```
TS-1 (Document Sectioning)
 ├── TS-2 (Document Sections in RAG) — needs sections to exist
 ├── TS-3 (Hybrid Search) — needs tsvector on sections
 └── D-1 (AI Stance Summaries) — benefits from richer source data

TS-3 (Hybrid Search)
 └── D-3 (Conversation Memory) — better search feeds better conversation

TS-4 (Voting History)
 ├── D-2 (Voting Alignment Matrix) — same data, different view
 └── D-4 (Activity Metrics) — voting is one metric

D-1 (Stance Summaries) + D-2 (Alignment) + D-4 (Activity)
 └── D-5 (Councillor Comparison) — needs all profile data
```

## Complexity Summary

| Feature | Complexity | New Infrastructure |
|---------|-----------|-------------------|
| TS-1: Document sectioning | Medium | `document_sections` table, chunking logic, embeddings |
| TS-2: Documents in RAG | Medium | RPC function, RAG pipeline update |
| TS-3: Hybrid search | Medium | RRF RPC function, tsvector columns |
| TS-4: Voting history viz | Low-Medium | Query + components |
| D-1: AI stance summaries | High | Gemini synthesis, caching table, freshness logic |
| D-2: Voting alignment | Medium | SQL aggregation, visualization |
| D-3: Conversation memory | Medium | `rag_conversations` table, session management |
| D-4: Activity metrics | Medium | SQL aggregations, metrics components |
| D-5: Councillor comparison | Low | Comparison layout (builds on D-1/D-2/D-4) |

---
*Last updated: 2026-02-16*
