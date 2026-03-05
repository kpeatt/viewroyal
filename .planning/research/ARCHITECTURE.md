# Architecture Patterns

**Domain:** Civic intelligence platform — v1.7 feature integration
**Researched:** 2026-03-05
**Confidence:** HIGH (based on direct codebase analysis of all touched files)

## Current Architecture Snapshot

The system has three deployment boundaries and two data stores:

```
                   +-------------------+       +-------------------+
                   | Cloudflare Worker |       | Supabase Edge Fn  |
                   | (React Router 7 + |       | (send-alerts)     |
                   |  Hono API)        |       +--------+----------+
                   +--------+----------+                |
                            |                           |
                   +--------v----------+                |
                   |   Supabase PG     <----------------+
                   |   (40+ tables,    |
                   |    pgvector,      |
                   |    RPCs, RLS)     |
                   +--------+----------+
                            ^
                   +--------+----------+
                   | Python Pipeline   |
                   | (local Mac Mini)  |
                   +-------------------+
```

Key architectural patterns already in place:
- **Lazy singletons** for Supabase/Gemini clients (avoids `setInterval` in Workers)
- **Orchestrator+Synthesizer two-model RAG** (Gemini orchestrator gathers evidence, separate Gemini call synthesizes answer)
- **Hybrid search with RRF** across 4 content types via Supabase RPCs
- **SSE streaming** for real-time RAG answers
- **In-memory rate limiting** (Map-based, per-isolate, adequate for current scale)
- **Conversation context** passed as a single string concatenation of previous Q&A

## Recommended Architecture Changes

### Component Map: New vs Modified

| Component | Status | Location | Changes |
|-----------|--------|----------|---------|
| RAG tool definitions | **MODIFY** | `rag.server.ts` tools array | Consolidate 9 tools to ~5, add LLM reranking |
| Conversation memory (KV) | **NEW** | `rag.server.ts` + wrangler.toml | KV namespace for multi-turn state |
| Topic taxonomy tables | **NEW** | Supabase migration | `topic_taxonomy`, `agenda_item_topic_tags` |
| Speaker fingerprint storage | **MODIFY** | `people` table + pipeline | `voice_embedding` column, pipeline writes |
| Council profile pipeline | **MODIFY** | `profile_agent.py`, `stance_generator.py` | Richer output, topic taxonomy integration |
| Meeting summary generation | **NEW** | Pipeline + `meetings` table | Gemini summarization in pipeline Phase 4 |
| Meeting summary cards | **NEW** | `meeting-detail.tsx` | UI component consuming `meetings.summary` |
| Email template improvements | **MODIFY** | `send-alerts/index.ts` | Better HTML, meeting link, attendance |
| RAG observability | **NEW** | `rag.server.ts` + new table | `rag_traces` table or structured logging |
| RAG feedback | **NEW** | New API route + table | `rag_feedback` table, thumbs up/down |

### Data Flow Changes

```
BEFORE (v1.6):
  Question -> Orchestrator (Gemini, tools) -> Evidence -> Synthesizer (Gemini) -> Stream

AFTER (v1.7):
  Question -> KV load context -> Orchestrator (Gemini, redesigned tools)
           -> Evidence -> LLM Rerank -> Synthesizer (Gemini)
           -> Stream + KV save context + log trace
```

```
BEFORE (v1.6 pipeline):
  Scrape -> Download -> Diarize -> Ingest -> Embed

AFTER (v1.7 pipeline):
  Scrape -> Download -> Diarize -> Ingest -> Embed
                           |          |
                           v          v
                    Fingerprint   Generate
                    Storage       Meeting Summary
                                  + Topic Tags
                                  + Profile Regen
```

## Component Integration Details

### 1. RAG Tool Redesign

**Current state:** 9 tools with overlapping search domains. The orchestrator frequently makes suboptimal tool choices (e.g., retrying `search_agenda_items` with synonyms instead of switching to `search_document_sections`).

**Integration approach:** Modify the `tools` array and tool function signatures in `rag.server.ts`. No new files needed.

**Recommended consolidated tool set:**

| New Tool | Replaces | Rationale |
|----------|----------|-----------|
| `search_council_records(query, types?, after_date?)` | `search_motions`, `search_agenda_items`, `search_key_statements`, `search_document_sections`, `search_transcript_segments` | Single entry point with type filter. Runs searches in parallel internally, merges with RRF. Eliminates tool selection mistakes. |
| `search_bylaws(query)` | `search_bylaws` | Keep separate -- fundamentally different domain (reference docs vs meeting records) |
| `search_matters(query, status?)` | `search_matters` | Keep separate -- cross-meeting topic tracker, different schema |
| `get_person_record(person_name, include?)` | `get_statements_by_person`, `get_voting_history` | Merged person tool. `include` param: `["statements", "votes", "stances"]` |
| `get_current_date()` | `get_current_date` | Keep as-is |

**Key change:** The merged `search_council_records` tool calls existing search functions in parallel and returns a unified result set with type labels. The orchestrator sees one tool instead of five, reducing hallucinated tool names and redundant calls.

```typescript
// Pseudo-signature
async function search_council_records({
  query,
  types?: ("motion" | "statement" | "document" | "transcript" | "agenda")[],
  after_date?: string,
}): Promise<{ results: TaggedResult[]; summary: string }>
```

**Files touched:**
- `apps/web/app/services/rag.server.ts` -- Tool definitions, orchestrator prompt, source normalization

**Dependencies:** None. Can be built first.

### 2. LLM Reranking

**Current state:** RAG tools return results ranked by vector similarity or FTS score. The orchestrator sees raw results and must mentally filter noise.

**Integration approach:** Add a reranking step between evidence gathering and synthesis. Uses the same Gemini client (lazy singleton already exists).

**Architecture:**

```
Tool results (15-50 items) -> LLM Rerank prompt -> Top 10-15 -> Synthesizer
```

**Implementation:** New function in `rag.server.ts` called between the orchestrator loop and the synthesis step. Takes `allSources` + the original question, asks Gemini to score/filter.

```typescript
async function rerankSources(
  question: string,
  sources: NormalizedSource[],
  maxResults: number = 15,
): Promise<NormalizedSource[]> {
  // Call Gemini with a reranking prompt
  // Return reordered + filtered sources
}
```

**Placement in flow:** After `sourceMap` deduplication (line ~1485 of current rag.server.ts), before `numberedEvidence` construction.

**Gemini cost:** One additional non-streaming call with ~2KB prompt. Fast with gemini-3-flash-preview (~200ms).

**Files touched:**
- `apps/web/app/services/rag.server.ts` -- New `rerankSources` function, called in `runQuestionAgent`

**Dependencies:** Logically builds on tool redesign but technically independent.

### 3. KV-Based Conversation Memory

**Current state:** Conversation context is a single `context` string parameter containing the previous question text. No actual conversation history is stored. The client appends previous Q&A manually.

**Integration approach:** Use Cloudflare Workers KV (already available via wrangler.toml) to store multi-turn conversation state keyed by a conversation ID.

**KV Schema:**

```typescript
// Key: `conv:{conversationId}` (UUID)
// Value: JSON
interface ConversationState {
  turns: Array<{
    question: string;
    answer: string;       // Summary, not full text
    sources: number[];    // Source IDs referenced
    timestamp: number;
  }>;
  created_at: number;
  municipality_id?: number;
}
// TTL: 24 hours (conversations expire)
```

**Wrangler binding:**

```toml
# Add to wrangler.toml
[[kv_namespaces]]
binding = "CONVERSATIONS"
id = "xxx"  # Created via wrangler kv:namespace create
```

**Integration points:**

1. **`api.search.tsx` / `api.ask.tsx`:** Accept `conversation_id` parameter. Load context from KV before calling `runQuestionAgent`. Save updated context after streaming completes.

2. **`rag.server.ts`:** `runQuestionAgent` receives structured conversation history (not a raw string). The orchestrator system prompt includes prior turns as structured context.

3. **Client-side (`search.tsx`):** Generate UUID on first question, pass `conversation_id` with follow-ups instead of raw context string. Store conversation ID in component state.

**Why KV over Supabase:** Conversation state is ephemeral (24h TTL), high-frequency read/write, no relational queries needed. KV is co-located with the Worker (zero network hop), while Supabase adds ~50ms latency per call. The current `search_results_cache` table in Supabase is fine for shareable URLs (long-lived, query-by-ID), but conversation state is a different access pattern.

**Files touched:**
- `apps/web/wrangler.toml` -- KV namespace binding
- `apps/web/app/routes/api.search.tsx` -- Conversation ID handling
- `apps/web/app/routes/api.ask.tsx` -- Conversation ID handling
- `apps/web/app/services/rag.server.ts` -- Accept structured history, save to KV
- `apps/web/app/routes/search.tsx` -- Client-side conversation ID management
- `apps/web/workers/app.ts` -- Pass KV binding through env (if not already wired)

**Dependencies:** Requires understanding current context flow. Independent of tool redesign.

### 4. Topic Taxonomy Tables

**Current state:** Topics are stored in a `topics` table (id, name, description) with a many-to-many `agenda_item_topics` join table. The `normalize_category_to_topic` SQL function maps ~470 agenda_item categories to 8 predefined topics. The pipeline's `stance_generator.py` mirrors this in Python.

**Integration approach:** Extend the existing topic system with hierarchical taxonomy and richer metadata.

**New tables:**

```sql
-- Hierarchical topic taxonomy
CREATE TABLE topic_taxonomy (
    id bigint generated by default as identity primary key,
    name text NOT NULL UNIQUE,
    parent_id bigint REFERENCES topic_taxonomy(id),
    description text,
    slug text UNIQUE,
    icon text,  -- lucide icon name for UI
    display_order int DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Many-to-many: agenda items tagged with taxonomy topics
-- Replaces/supplements existing agenda_item_topics
CREATE TABLE agenda_item_topic_tags (
    agenda_item_id bigint REFERENCES agenda_items(id) ON DELETE CASCADE,
    topic_taxonomy_id bigint REFERENCES topic_taxonomy(id) ON DELETE CASCADE,
    confidence float DEFAULT 1.0,  -- AI classification confidence
    source text DEFAULT 'ai',      -- 'ai', 'manual', 'category_map'
    PRIMARY KEY (agenda_item_id, topic_taxonomy_id)
);
```

**Migration strategy:** Seed `topic_taxonomy` with the 8 existing topics as top-level entries, then add subcategories. Backfill `agenda_item_topic_tags` from existing `agenda_item_topics` and the category normalization function. Keep existing `topics` + `agenda_item_topics` for backward compatibility.

**Pipeline integration:** Extend the AI refiner (`ai_refiner.py`) to classify agenda items into taxonomy topics during ingestion. The Gemini prompt already generates categories -- add taxonomy tag assignment as a post-processing step.

**Web integration:** Topic pages, topic-based filtering on search, subscription to taxonomy topics.

**Files touched:**
- New Supabase migration SQL
- `apps/pipeline/pipeline/ingestion/ai_refiner.py` -- Topic classification
- `apps/web/app/services/` -- New topic service for fetching taxonomy
- `apps/web/app/routes/` -- Topic listing/detail pages

**Dependencies:** None. Can be built in parallel with other DB work.

### 5. Speaker Fingerprint Storage

**Current state:** The `people` table has a `voice_fingerprint_id` text column (exists in bootstrap.sql). The diarization pipeline (`pipeline/diarization/`) generates speaker embeddings via ResNet and clusters them, but the embeddings are not persisted after diarization. Speaker assignment uses `meeting_speaker_aliases` to map `SPEAKER_00` labels to `people.id`.

**Integration approach:** Store speaker voice embeddings in the database for cross-meeting speaker identification.

**Schema change:**

```sql
-- Voice embeddings for speaker identification
CREATE TABLE speaker_fingerprints (
    id bigint generated by default as identity primary key,
    person_id bigint REFERENCES people(id) ON DELETE CASCADE NOT NULL,
    embedding vector(256),  -- ResNet embedding dimension
    source_meeting_id bigint REFERENCES meetings(id),
    quality_score float,    -- Segment quality (length, SNR)
    created_at timestamptz DEFAULT now(),
    UNIQUE(person_id, source_meeting_id)
);

CREATE INDEX idx_speaker_fingerprints_person
    ON speaker_fingerprints(person_id);
CREATE INDEX idx_speaker_fingerprints_embedding
    ON speaker_fingerprints USING hnsw (embedding vector_cosine_ops);
```

**Pipeline integration point:** In `pipeline/diarization/pipeline.py`, after clustering, extract the centroid embedding per speaker cluster and write to `speaker_fingerprints`. In subsequent diarization runs, load known fingerprints and use them as cluster seeds.

**Flow:**

```
1. New meeting audio arrives
2. Diarize (segment + embed + cluster)
3. For each cluster, compare centroid to speaker_fingerprints via cosine similarity
4. If similarity > threshold: assign known person_id
5. If no match: flag for manual assignment
6. After assignment: store centroid as new fingerprint for that person
```

**Key constraint:** Diarization runs locally on Apple Silicon (MLX). The fingerprint storage and retrieval happen via Supabase, which the pipeline already accesses.

**Files touched:**
- New Supabase migration SQL
- `apps/pipeline/pipeline/diarization/pipeline.py` -- Fingerprint save/load
- `apps/pipeline/pipeline/diarization/clustering.py` -- Seed clusters from known fingerprints
- `apps/pipeline/pipeline/ingestion/ingester.py` -- Trigger fingerprint storage post-assignment

**Dependencies:** Requires diarization pipeline changes. Independent of web app features.

### 6. Council Profile Generation Pipeline

**Current state:** Two-stage profiling already exists:
1. `stance_generator.py` -- Per-councillor per-topic stance summaries (8 topics x N councillors). Writes to `councillor_stances`.
2. `profile_agent.py` -- Embedding-powered profile with theme discovery, temporal diversity, Gemini synthesis. Writes to `councillor_highlights` (overview + highlights array).

Both are mature and working. The profile agent uses a 4-step process: context gathering, theme discovery via vector search, deep dive with temporal diversity, and Gemini synthesis.

**Integration approach:** Extend existing pipeline rather than replacing it.

**Enhancements:**
1. **Topic taxonomy integration:** Replace the 8 hardcoded topics in `stance_generator.py` with topics from `topic_taxonomy` table. This makes stance generation dynamic.

2. **Key vote detection:** Add a step to `profile_agent.py` that identifies "key votes" -- divided votes, votes where the councillor was in the minority, votes on high-impact motions. Currently `get_voting_history` in `rag.server.ts` fetches opposed votes, but the pipeline doesn't persist "key vote" flags.

3. **Meeting summary consumption:** Profile generation should incorporate meeting summaries (once generated) as additional context for the Gemini synthesis prompt.

**New table for key votes:**

```sql
CREATE TABLE councillor_key_votes (
    id bigint generated by default as identity primary key,
    person_id bigint REFERENCES people(id) ON DELETE CASCADE NOT NULL,
    motion_id bigint REFERENCES motions(id) ON DELETE CASCADE NOT NULL,
    vote text NOT NULL,
    significance text,  -- 'minority_vote', 'divided', 'tie_breaking', 'high_impact'
    topic_taxonomy_id bigint REFERENCES topic_taxonomy(id),
    created_at timestamptz DEFAULT now(),
    UNIQUE(person_id, motion_id)
);
```

**Files touched:**
- `apps/pipeline/pipeline/profiling/stance_generator.py` -- Dynamic topic loading
- `apps/pipeline/pipeline/profiling/profile_agent.py` -- Key vote detection, summary integration
- New Supabase migration SQL
- `apps/pipeline/pipeline/orchestrator.py` -- Trigger profile regen after new meeting

**Dependencies:** Topic taxonomy tables should exist first. Meeting summaries (below) should be built concurrently.

### 7. Meeting Summary Generation

**Current state:** The `meetings` table has a `summary` text column that is populated by the AI refiner during ingestion. Looking at the current data, some meetings have summaries and some don't. The email digest (`send-alerts`) already uses `digest.meeting.summary`.

**Integration approach:** Improve summary generation quality and consistency.

**Current flow in `ai_refiner.py`:** The Gemini prompt generates meeting-level summaries as part of the agenda item refinement. This works but produces inconsistent quality because the prompt is optimized for agenda item extraction, not meeting summarization.

**Recommended change:** Add a dedicated meeting summarization step in the pipeline after ingestion completes (post-Phase 4). This step:

1. Gathers all agenda items with summaries + motions with results + key statements
2. Calls Gemini with a summarization-focused prompt
3. Generates a 3-5 sentence plain-English summary
4. Updates `meetings.summary`

**Why a separate step:** The current summary is generated before all agenda items are processed (it is per-batch). A post-ingestion summary sees the complete picture.

**Pipeline placement:** New function called in `orchestrator.py` after embed phase, before email alerts.

**Files touched:**
- New file: `apps/pipeline/pipeline/ingestion/summarizer.py`
- `apps/pipeline/pipeline/orchestrator.py` -- Call summarizer after embed phase
- `apps/pipeline/main.py` -- Optional `--summarize-only` flag

**Dependencies:** None. Independent feature.

### 8. Email Template Improvements

**Current state:** `supabase/functions/send-alerts/index.ts` contains two HTML builders:
- `buildDigestHtml` -- Post-meeting digest with decisions, controversial items, attendance
- `buildPreMeetingHtml` -- Pre-meeting alert with matched agenda items

Both use inline CSS (required for email), hardcoded "View Royal" references, and a basic layout.

**Integration approach:** Enhance within the existing Edge Function file. No architectural change needed.

**Specific improvements:**

1. **Meeting summary in digest:** Already partially done -- `digest.meeting.summary` is rendered if present. Improve placement and formatting.

2. **Attendance info in pre-meeting:** Add expected attendees based on `attendance` records for previous meetings or confirmed attendance.

3. **Link to live stream:** Already present in pre-meeting template (YouTube channel link). Could add Vimeo link from `meetings.video_url` if available.

4. **Better mobile rendering:** Improve responsive inline CSS. Current emails use `max-width:600px` which is good, but some elements could be better on small screens.

5. **Unsubscribe improvements:** Current link goes to `/settings`. Could add one-click unsubscribe for specific subscriptions via a signed URL.

**Files touched:**
- `supabase/functions/send-alerts/index.ts` -- Template improvements
- Potentially a new Supabase migration for unsubscribe tokens

**Dependencies:** Meeting summary generation (above) improves digest quality but is not required.

### 9. RAG Observability and Feedback

**Current state:** PostHog `$ai_generation` events are captured with trace ID, model, latency, source count, and tool call count. This happens in both `api.ask.tsx` and `api.search.tsx`. However, there is no persistent server-side trace log and no user feedback mechanism.

**Integration approach:**

**Option A: Supabase table (recommended)**

```sql
CREATE TABLE rag_traces (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    question text NOT NULL,
    conversation_id text,
    tool_calls jsonb,       -- [{name, args, result_count, latency_ms}]
    source_ids jsonb,       -- [source IDs used]
    answer_length int,
    total_latency_ms int,
    model text DEFAULT 'gemini-3-flash-preview',
    created_at timestamptz DEFAULT now()
);

CREATE TABLE rag_feedback (
    id bigint generated by default as identity primary key,
    trace_id uuid REFERENCES rag_traces(id),
    cache_id text,          -- Links to search_results_cache
    rating smallint,        -- 1 = thumbs up, -1 = thumbs down
    comment text,
    created_at timestamptz DEFAULT now()
);
```

**Option B: Cloudflare Workers Analytics Engine** -- Lower latency, but less queryable for analysis. Not recommended given the existing Supabase infrastructure.

**Web integration:**
- New API route `api.feedback.tsx` for submitting thumbs up/down
- Modify `AiAnswer` component to show feedback buttons after answer completes
- `rag.server.ts` emits trace data that gets saved

**Files touched:**
- New Supabase migration SQL
- `apps/web/app/services/rag.server.ts` -- Emit trace events
- `apps/web/app/routes/api.search.tsx` -- Save traces after streaming
- New file: `apps/web/app/routes/api.feedback.tsx`
- `apps/web/app/components/search/ai-answer.tsx` -- Feedback UI

**Dependencies:** None. Can be built independently.

## Patterns to Follow

### Pattern 1: Lazy Singleton for External Services
**What:** Initialize clients on first use, not at module load time.
**When:** Any new service that calls external APIs (Gemini, OpenAI, Supabase).
**Why:** Cloudflare Workers prohibit `setInterval` and heavy initialization in global scope.
**Example:**
```typescript
let _kv: KVNamespace | null = null;
function getKV(env: Env): KVNamespace {
  if (!_kv) _kv = env.CONVERSATIONS;
  return _kv;
}
```

### Pattern 2: Supabase RPC for Complex Queries
**What:** Write PostgreSQL functions for queries involving joins, aggregations, or vector operations.
**When:** Hybrid search, filtered vector similarity, cross-table aggregates.
**Why:** Supabase client does not support complex SQL. RPCs run server-side with full SQL power.
**Example:** All `hybrid_search_*` and `match_*` functions follow this pattern.

### Pattern 3: SSE Streaming for Long-Running Operations
**What:** Use Server-Sent Events via `ReadableStream` for operations that take >1s.
**When:** RAG answers, any AI-generated content.
**Why:** Workers have a 30s CPU time limit. Streaming lets the response start immediately while processing continues.

### Pattern 4: Serializer Allowlist
**What:** Never spread `...row` into response objects. Explicitly construct output.
**When:** Any API response, any data passed from loader to component.
**Why:** Prevents field leakage (e.g., exposing internal IDs, embeddings, or auth tokens).

### Pattern 5: Environment Variable Inlining
**What:** All env vars are inlined at build time via `vite.config.ts define` block.
**When:** Accessing any configuration value in the Worker.
**Why:** `process.env` does not exist in Cloudflare Workers. Vite replaces references at build time.
**Implication for KV:** The KV binding comes via the `env` parameter in the Worker fetch handler, not via `process.env`. Need to thread it through to `rag.server.ts`.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Global State for Conversation Memory
**What:** Storing conversation state in module-level `Map` objects.
**Why bad:** Workers isolates are ephemeral -- memory is not shared across invocations or edge locations. The current in-memory rate limiter works because rate limiting is best-effort. Conversation state requires durability.
**Instead:** Use KV with TTL.

### Anti-Pattern 2: Blocking AI Calls in Middleware
**What:** Making AI calls (reranking, summarization) in the critical request path without streaming.
**Why bad:** Workers CPU time limit (30s default, 50ms per event in free tier). A blocking Gemini call + synthesis can exceed limits.
**Instead:** Use streaming for user-facing AI, or offload to queue/pipeline for non-interactive operations.

### Anti-Pattern 3: Embedding Data in Email HTML
**What:** Including large data payloads (base64 images, embedded styles) directly in email HTML.
**Why bad:** Email clients have size limits (~100KB for Gmail) and aggressive content filtering.
**Instead:** Keep emails lightweight, link to web app for details.

### Anti-Pattern 4: Monolithic Pipeline Steps
**What:** Adding meeting summarization, topic tagging, profile regeneration, and fingerprint storage into a single pipeline phase.
**Why bad:** Failure in one step blocks all others. Hard to re-run individual operations.
**Instead:** Each new operation should be independently runnable via CLI flag (e.g., `--summarize-only`, `--tag-topics`, `--regenerate-profiles`).

## Suggested Build Order

Based on dependency analysis and risk:

```
Phase 1: Foundation (DB + Pipeline)
  1a. Topic taxonomy tables (migration)
  1b. Meeting summary generation (pipeline)
  1c. Speaker fingerprint table (migration)
  1d. RAG traces + feedback tables (migration)

Phase 2: RAG Improvements (Web)
  2a. RAG tool redesign (rag.server.ts)
  2b. LLM reranking (rag.server.ts)
  2c. KV conversation memory (wrangler + routes + rag.server)
  2d. RAG observability + feedback (routes + components)

Phase 3: Council Intelligence (Pipeline + Web)
  3a. Profile pipeline enhancements (stance_generator, profile_agent)
  3b. Topic taxonomy backfill + classification (pipeline)
  3c. Speaker fingerprint pipeline integration
  3d. Council profile page redesign (web)

Phase 4: UX + Email
  4a. Meeting summary cards (web)
  4b. Email template improvements (edge function)
  4c. Topic/issue clustering UI (web)
```

**Rationale for ordering:**
- Phase 1 creates the data structures everything else depends on
- Phase 2 improves the highest-traffic feature (search/ask) with no DB dependencies beyond traces table
- Phase 3 leverages Phase 1 tables and Phase 2 improvements
- Phase 4 is purely presentational, can happen anytime after Phase 1b

## Scalability Considerations

| Concern | Current (~100 users) | At 1K users | At 10K users |
|---------|---------------------|-------------|--------------|
| KV conversation store | Fine (KV handles millions of keys) | Fine | Fine, KV scales horizontally |
| Gemini API calls (reranking) | ~10 req/day | ~100 req/day ($0.50) | Need caching or batch |
| Speaker fingerprint search | <50 embeddings, trivial | Same | Same (council is small) |
| RAG traces table | ~10 rows/day | ~100/day | Add partition by month |
| Email sending (Resend) | Free tier | Free tier | Need paid plan at ~300 emails/day |

## Sources

- Direct codebase analysis of all files listed in "Files touched" sections
- `sql/bootstrap.sql` for existing schema
- `wrangler.toml` for Worker configuration
- Cloudflare Workers KV documentation (training data, HIGH confidence)
- Supabase pgvector documentation (training data, HIGH confidence)
