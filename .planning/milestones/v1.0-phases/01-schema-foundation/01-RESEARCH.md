# Phase 1: Schema Foundation - Research

**Researched:** 2026-02-16
**Domain:** Database schema alignment, embedding consistency, PR integration
**Confidence:** HIGH

## Summary

Phase 1 is a code-alignment phase, not a schema-creation phase. The database has already been migrated through 23 Supabase migrations covering halfvec(384) columns, tsvector full-text search, key_statements table, and transcript column cleanup. The work is landing the **web app code** that matches this already-stable schema, primarily by extracting code changes from PRs #35 and #37.

The critical findings are: (1) the web app on main generates 768-dim embeddings but the DB now stores halfvec(384) -- a live bug, (2) `match_transcript_segments` RPC does not exist and transcript_segments has no embedding column -- the web app calls it and crashes, (3) `corrected_text_content` column was removed from `transcript_segments` but the web app still references it in 15+ locations, and (4) the pipeline's `embed.py` still uses 768 dimensions and references the removed `corrected_text_content` column.

**Primary recommendation:** Merge PR #35's web app code changes (not migration files) to fix the dimension mismatch, remove `corrected_text_content` references, and replace transcript vector search with full-text search. Then merge PR #37's pipeline changes for improved key statement extraction. Both PRs have already had their schema changes applied to the DB.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Embedding strategy
- Go with halfvec(384) -- DB is already migrated, all tables use halfvec
- Standardize on OpenAI text-embedding-3-small for both pipeline and web app
- Existing DB content was already embedded with OpenAI -- no re-embedding needed
- Pipeline code (currently fastembed/nomic-embed-text-v1.5) must be updated to use OpenAI text-embedding-3-small at 384 dimensions

#### Migration reconciliation
- DB already has 23 Supabase migrations applied covering: halfvec migration, RPC updates, tsvector columns, transcript cleanup, municipalities, key_statements, and more
- Cherry-pick only new changes from PR #35 -- the migration SQL is already applied, so we mainly need the web app code fixes
- Use Supabase MCP tools to apply any additional migrations needed
- Do NOT re-apply migrations that are already in Supabase -- compare PR #35's migration files against the 23 applied ones

#### Transcript segment search
- `match_transcript_segments` RPC is MISSING from the DB -- it was removed during cleanup
- `transcript_segments` table has NO embedding column (cleaned up by `cleanup_transcript_columns` migration)
- Web app on main still calls `match_transcript_segments` with `filter_meeting_id` param -- both the RPC and param don't exist
- Decision needed during planning: either recreate the RPC with halfvec or remove transcript-level vector search and rely on other match_* RPCs (agenda_items, key_statements, motions)

#### PR merge approach
- PR #35 (embedding migration): Schema changes are already applied to DB. Extract web app code changes only. Migration files are redundant.
- PR #37 (key statement prompts): Clean addition -- new KeyStatement model, extraction prompt, ingestion logic. key_statements table already exists in DB.
- Both PRs should be assessed for code changes only, not migration files

### Claude's Discretion
- How to handle the missing transcript segment search -- recreate RPC or remove from web app
- Exact approach to extracting PR #35 code changes (merge then clean up vs cherry-pick specific commits)
- Whether bootstrap.sql needs updating to reflect current schema state

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHEMA-01 | Embedding dimension mismatch fixed -- query embeddings generate halfvec(384) matching stored embeddings | Web app `embeddings.server.ts` currently sets `EMBEDDING_DIMENSIONS = 768`. PR #35 changes this to `384`. Pipeline `embed.py` also uses 768 and must change to 384. |
| SCHEMA-02 | Missing match_transcript_segments RPC function restored -- Ask page transcript search works | RPC does not exist in DB. `transcript_segments` has no embedding column (removed by migration). PR #35 replaces the RPC call with tsvector full-text search. Recommend this approach. |
| SCHEMA-03 | All 23 applied migrations validated against PR migration SQL -- no duplicate/conflicting migrations on merge | PR #35 has no local migration files (changes are in bootstrap.sql and app code). The 23 migrations are already applied. No conflict risk. |
| SCHEMA-04 | PR #35 (embedding migration) merged to main without schema conflicts | PR #35 has 2 commits, 16 changed files. No migration file conflicts since DB schema is already aligned. Only web app code + pipeline code + bootstrap.sql updates needed. |
| KS-01 | Key statement extraction prompts improved per PR #37 fixes | PR #37 adds improved prompts with max 6 statements per item, mandatory unique timestamps, better speaker attribution rules, and explicit statement type guidance. |
| KS-02 | PR #37 merged to main after PR #35 | PR #37 modifies `ai_refiner.py` and `ingester.py`. Both PRs modify `ai_refiner.py` (same sections -- KeyStatement model + prompt). PR #37's version is more refined (nullable speaker, limit 6 per item). Must merge in order: #35 then #37. |
</phase_requirements>

## Standard Stack

### Core (Already in Use)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| OpenAI JS SDK | (in package.json) | Query embedding generation (web app) | `text-embedding-3-small` at 384 dims |
| OpenAI Python SDK | >=2.15.0 | Bulk embedding generation (pipeline) | Same model, 384 dims |
| Supabase JS | (in package.json) | Database queries, RPC calls | `.rpc()` for vector search |
| pgvector (halfvec) | DB extension | Vector similarity search | All 6 match_* RPCs use `halfvec` type |
| Google Gemini | genai SDK | AI refinement + RAG Q&A | Used in pipeline (`ai_refiner.py`) and web app (`rag.server.ts`) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| psycopg2-binary | >=2.9.11 | Direct DB connection for bulk embedding writes | Pipeline `embed.py` only |
| fastembed | >=0.7.3 | **DEPRECATED** -- listed in pyproject.toml but not imported anywhere | Should be removed from dependencies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Remove transcript vector search | Recreate `match_transcript_segments` RPC | Would require adding `embedding halfvec(384)` back to `transcript_segments` (228K rows), re-embedding all segments. PR #35 intentionally removed this in favor of discussion-level search via key_statements + agenda_items. |

**Installation:** No new dependencies needed. The stack is already in place.

## Architecture Patterns

### Current Database RPC Pattern
All vector search RPCs follow an identical pattern. Six RPCs exist:
```
match_agenda_items(query_embedding halfvec, match_threshold float8, match_count int)
match_bylaw_chunks(query_embedding halfvec, match_threshold float8, match_count int, filter_bylaw_id bigint)
match_bylaws(query_embedding halfvec, match_threshold float8, match_count int)
match_key_statements(query_embedding halfvec, match_threshold float8, match_count int)
match_matters(query_embedding halfvec, match_threshold float8, match_count int)
match_motions(query_embedding halfvec, match_threshold float8, match_count int)
```

All accept `halfvec` type for `query_embedding`. The web app passes embeddings via `JSON.stringify(embedding)` in `vectorSearch.ts`, and as raw arrays in `rag.server.ts`.

### Pattern: Transcript Search Replacement (PR #35)
PR #35 replaces the removed `match_transcript_segments` RPC with tsvector full-text search:
```typescript
// Old (broken -- RPC doesn't exist):
const { data } = await getSupabase().rpc("match_transcript_segments", {
  query_embedding: embedding,
  match_threshold: threshold,
  match_count: matchCount,
  filter_meeting_id: null,
});

// New (PR #35 approach):
const tsQuery = query.split(/\s+/).filter((w) => w.length > 2).join(" & ");
enrichQuery = enrichQuery.textSearch("text_search", tsQuery).limit(25);
```

### Pattern: Key Statement Search (New in PR #35)
A new `search_key_statements` tool is added to the RAG agent, using the `match_key_statements` RPC:
```typescript
const { data } = await getSupabase().rpc("match_key_statements", {
  query_embedding: embedding,
  match_threshold: 0.5,
  match_count: after_date ? 50 : 20,
});
```

### Anti-Patterns to Avoid
- **Referencing `corrected_text_content`**: This column was removed from `transcript_segments` by the `cleanup_transcript_columns` migration. The content was merged into `text_content`. Code must use `text_content` only.
- **Calling `match_transcript_segments` RPC**: This RPC no longer exists. The transcript_segments table has no embedding column.
- **Using 768-dim embeddings**: The DB uses `halfvec(384)`. Passing 768-dim vectors to any match_* RPC will cause a dimension mismatch error.
- **Referencing `embedding_hv` column**: PR #35's `embed.py` has remnant references to an `embedding_hv` column on `transcript_segments` that was a transitional column during migration. This column does not exist in the current DB schema. The pipeline embed code should skip `transcript_segments` entirely (no embedding column exists on that table anymore).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Transcript semantic search | Custom embedding + RPC for 228K segments | tsvector full-text search on `text_search` column | Column already exists as generated tsvector. Key_statements + agenda_items provide semantic search coverage for discussion content. |
| Embedding generation | Custom model loading | OpenAI `text-embedding-3-small` API with `dimensions: 384` | Already configured, deterministic dimensions, matches DB schema |
| Vector search RPCs | Custom SQL queries | Existing `match_*` RPCs via `.rpc()` calls | All 6 RPCs already built and tested with halfvec |

**Key insight:** The hard schema work is done. This phase is about making the application code match what the database already provides.

## Common Pitfalls

### Pitfall 1: Dimension Mismatch Silently Fails
**What goes wrong:** Passing a 768-dim embedding to a halfvec(384) RPC causes a Postgres type error. The RPC returns an error, which is caught and returns an empty array -- the user sees no results with no error message.
**Why it happens:** The web app's `embeddings.server.ts` still generates 768-dim vectors.
**How to avoid:** Change `EMBEDDING_DIMENSIONS` from 768 to 384 in `embeddings.server.ts`. Similarly change in pipeline `embed.py`.
**Warning signs:** Vector search returns zero results for all queries.

### Pitfall 2: `corrected_text_content` References Cause Query Failures
**What goes wrong:** Selecting `corrected_text_content` from `transcript_segments` returns a Supabase/PostgREST error because the column doesn't exist.
**Why it happens:** The column was removed by migration `cleanup_transcript_columns` (applied 2026-02-16), but the web app code still references it in 15+ locations.
**How to avoid:** Remove all `corrected_text_content` references from: `types.ts`, `meetings.ts`, `rag.server.ts`, `speaker-alias.tsx`, `meeting-feed.tsx`, `TranscriptDrawer.tsx`, `VideoWithSidebar.tsx`, `EnhancedVideoScrubber.tsx`, `meeting-explorer.tsx`.
**Warning signs:** Meeting detail pages fail to load, transcript display is broken.

### Pitfall 3: PR Merge Order Matters
**What goes wrong:** Merging PR #37 before #35 creates conflicts in `ai_refiner.py` because both add the `KeyStatement` model in the same location with slightly different field definitions.
**Why it happens:** PR #35's `KeyStatement.speaker` is `str` (required), while PR #37's is `str | None` (nullable). PR #37 also adds max-6-per-item guidance and unique timestamp requirements.
**How to avoid:** Merge #35 first, then #37. PR #37's version of `KeyStatement` is strictly better (nullable speaker, more detailed prompt).
**Warning signs:** Git merge conflicts in `ai_refiner.py` and `ingester.py`.

### Pitfall 4: Pipeline `embed.py` References Removed Columns/Config
**What goes wrong:** Pipeline's `embed.py` on main still references `corrected_text_content` in the `transcript_segments` table config and uses 768 dimensions.
**Why it happens:** PR #35 updates embed.py but the changes haven't been merged to main yet.
**How to avoid:** PR #35's embed.py changes handle this: removes transcript_segments from TABLE_CONFIG, changes dimensions to 384, adds key_statements table, uses halfvec(384) for temp table creation.
**Warning signs:** Embedding pipeline fails on `transcript_segments` table, or generates wrong-dimension embeddings for other tables.

### Pitfall 5: `vectorSearch.ts` Still Calls Missing RPC
**What goes wrong:** `searchTranscriptSegments()` in `vectorSearch.ts` calls `match_transcript_segments` RPC which doesn't exist. `vectorSearchAll()` calls it in its parallel search.
**Why it happens:** The RPC was removed but the calling code wasn't updated.
**How to avoid:** PR #35 stubs out `searchTranscriptSegments()` to return `[]` and adds `searchKeyStatements()`. Apply these changes.
**Warning signs:** Search page errors when vector search mode is selected.

## Code Examples

### Fix 1: Embedding Dimension Change (embeddings.server.ts)
```typescript
// Current (BROKEN):
const EMBEDDING_DIMENSIONS = 768;

// Fixed (PR #35):
const EMBEDDING_DIMENSIONS = 384;
```

### Fix 2: Transcript Search Replacement (rag.server.ts)
```typescript
// Current (BROKEN -- RPC doesn't exist):
const { data } = await getSupabase().rpc("match_transcript_segments", {
  query_embedding: embedding,
  match_threshold: threshold,
  match_count: matchCount,
  filter_meeting_id: null,
});

// Fixed (PR #35 -- use tsvector full-text search):
const tsQuery = query
  .split(/\s+/)
  .filter((w) => w.length > 2)
  .join(" & ");
if (!tsQuery) return [];

let enrichQuery = getSupabase()
  .from("transcript_segments")
  .select(`
    id, text_content, speaker_name, person_id,
    start_time, meeting_id,
    meetings!inner(meeting_date, type),
    agenda_items(title)
  `)
  .textSearch("text_search", tsQuery)
  .limit(25);
```

### Fix 3: Remove corrected_text_content References
```typescript
// Current (BROKEN -- column doesn't exist):
{seg.corrected_text_content || seg.text_content}

// Fixed:
{seg.text_content}
```

### Fix 4: Pipeline Embedding Dimensions (embed.py)
```python
# Current (BROKEN):
EMBEDDING_DIMENSIONS = 768
# ...
"transcript_segments": {
    "select": "id, text_content, corrected_text_content",
    "text_fn": lambda r: (r[2] or r[1] or "").strip(),
},

# Fixed (PR #35):
EMBEDDING_DIMENSIONS = 384
# transcript_segments removed from TABLE_CONFIG
# key_statements added:
"key_statements": {
    "select": "id, statement_text, context",
    "text_fn": lambda r: f"{r[1] or ''}\n{r[2] or ''}".strip(),
},
```

### Fix 5: Key Statement Extraction Prompt (PR #37 improvement)
```python
# PR #37 adds improved KeyStatement model with nullable speaker:
class KeyStatement(BaseModel):
    statement_text: str = Field(description="The substantive statement, paraphrased for clarity")
    speaker: str | None = Field(None, description="The person who made the statement. Must be exactly ONE person")
    statement_type: str = Field(description="One of: claim, proposal, objection, recommendation, financial, public_input")
    context: str | None = Field(None, description="Brief context for the statement")
    timestamp: float | None = Field(None, description="Approximate start time in seconds")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `vector(768)` columns | `halfvec(384)` columns | 2026-02-16 (migration `migrate_to_halfvec_384`) | 50% storage reduction, faster similarity search |
| `corrected_text_content` column | Merged into `text_content` | 2026-02-16 (migration `cleanup_transcript_columns`) | Simpler schema, one source of truth |
| Transcript segment embeddings | No embeddings on transcript_segments; use key_statements + agenda_items | 2026-02-16 (migration `cleanup_transcript_columns`) | 228K fewer embeddings, discussion-level semantic search |
| `fastembed` / `nomic-embed-text-v1.5` | OpenAI `text-embedding-3-small` at 384 dims | Decision in this phase | Consistent embedding model across pipeline and web app |
| ilike text matching for agenda items | tsvector full-text search | 2026-02-16 (migration `add_tsvector_columns`) | Better search quality, index-backed |

**Deprecated/outdated:**
- `corrected_text_content`: Removed from DB. All corrected text was merged into `text_content` before column drop.
- `match_transcript_segments` RPC: Removed. No embedding column on transcript_segments.
- `fastembed` dependency: Listed in `pyproject.toml` but not imported anywhere in the codebase. Should be removed.
- `embedding_hv` column reference: Transitional column that existed briefly during halfvec migration. Does not exist in current schema. PR #35's `embed.py` still references it -- must be corrected to skip transcript_segments entirely.

## Detailed PR Analysis

### PR #35: phase3c/embedding-migration (2 commits, 16 files)

**Files with needed code changes (not migration-related):**

| File | Change Summary | Priority |
|------|---------------|----------|
| `apps/web/app/lib/embeddings.server.ts` | `768` -> `384` dimensions | CRITICAL |
| `apps/web/app/services/rag.server.ts` | Remove `corrected_text_content`, replace `match_transcript_segments` with tsvector, add `search_key_statements` tool, update source normalization | CRITICAL |
| `apps/web/app/services/vectorSearch.ts` | Stub `searchTranscriptSegments`, add `searchKeyStatements`, add `KeyStatementMatch` type | CRITICAL |
| `apps/web/app/services/meetings.ts` | Remove `corrected_text_content` from select | HIGH |
| `apps/web/app/lib/types.ts` | Remove `corrected_text_content` from `TranscriptSegment` interface | HIGH |
| `apps/web/app/components/meeting-feed.tsx` | Remove `corrected_text_content` fallback | HIGH |
| `apps/web/app/components/meeting/EnhancedVideoScrubber.tsx` | Remove `corrected_text_content` fallback | HIGH |
| `apps/web/app/components/meeting/TranscriptDrawer.tsx` | Remove `corrected_text_content` fallback | HIGH |
| `apps/web/app/components/meeting/VideoWithSidebar.tsx` | Remove `corrected_text_content` fallback (2 locations) | HIGH |
| `apps/web/app/routes/meeting-explorer.tsx` | Remove `corrected_text_content` fallback | HIGH |
| `apps/web/app/routes/speaker-alias.tsx` | Remove `corrected_text_content` from type, select, state, UI | HIGH |
| `apps/pipeline/pipeline/ingestion/embed.py` | 384 dims, remove transcript_segments, add key_statements, use halfvec(384), custom agenda_items fetch | HIGH |
| `apps/pipeline/pipeline/ingestion/ai_refiner.py` | Add KeyStatement model, add prompt section 7 | HIGH |
| `apps/pipeline/pipeline/ingestion/ingester.py` | Add key_statements ingestion, delete on re-ingest | HIGH |
| `sql/bootstrap.sql` | Update to reflect current schema (halfvec, tsvector, key_statements) | MEDIUM |
| `README.md` | Update to reflect phases 0-3c | LOW |

**Files that are migration-only (SKIP -- already applied to DB):**
None in PR #35 -- it has no Supabase migration files. All schema changes are reflected in bootstrap.sql updates and were applied separately.

### PR #37: fix/key-statement-prompts (3 commits, 9 files)

| File | Change Summary | Priority |
|------|---------------|----------|
| `apps/pipeline/pipeline/ingestion/ai_refiner.py` | Improved KeyStatement model (nullable speaker, detailed prompt with max 6 statements, unique timestamps) | HIGH |
| `apps/pipeline/pipeline/ingestion/ingester.py` | Key statements ingestion + deduplication on re-ingest | HIGH |
| `.planning/codebase/*.md` | Documentation files (7 files) | LOW |

**Conflict analysis:** Both PRs modify `ai_refiner.py` and `ingester.py`. The changes are in the same code sections (KeyStatement model, prompt section 7, ingester cleanup). PR #37's versions are strictly superior to PR #35's -- they have nullable speaker field, max 6 statements limit, unique timestamp requirement, and better attribution rules. Strategy: merge #35 first, then #37 will cleanly overwrite the relevant sections.

## Discretion Recommendations

### 1. Transcript Segment Search: Remove Vector Search, Use FTS
**Recommendation:** Follow PR #35's approach -- replace `match_transcript_segments` with tsvector full-text search.

**Rationale:**
- `transcript_segments` has 228K rows. Adding halfvec(384) embeddings to all of them would cost ~$15-20 in OpenAI API calls and add significant storage.
- The `key_statements` table (8,454 rows) and `agenda_items` table (12,200 rows) already have embeddings and provide semantic search at the discussion level.
- Full-text search via `text_search` tsvector column on `transcript_segments` is already indexed and provides good keyword matching for verbatim quote retrieval.
- PR #35 has already implemented and tested this approach.

### 2. PR Merge Approach: Merge Branch, Then Clean Up
**Recommendation:** Merge `phase3c/embedding-migration` branch into main directly. The PR has only 2 commits and no migration files. All changes are app-code and bootstrap.sql.

**Rationale:**
- Cherry-picking from 2 commits is more complex than a clean merge.
- No migration files to skip -- the PR only has code and bootstrap.sql changes.
- After merging, verify no broken references remain.
- Then merge `fix/key-statement-prompts` which will overwrite the KeyStatement model and prompt with improved versions.

### 3. bootstrap.sql: Update to Reflect Current Schema
**Recommendation:** Yes, update bootstrap.sql as part of this phase. PR #35 already includes the necessary updates (halfvec columns, tsvector columns, key_statements table, removed corrected_text_content).

**Rationale:**
- bootstrap.sql is the reference schema for fresh deployments.
- It's currently out of sync with the production DB (still shows vector(768), corrected_text_content, no key_statements table).
- PR #35's version of bootstrap.sql correctly reflects the current DB state.

## Open Questions

1. **`embedding_hv` Reference in PR #35's embed.py**
   - What we know: PR #35's `embed.py` contains references to `embedding_hv` column (a transitional column for transcript_segments during migration). This column does not exist in the current DB.
   - What's unclear: Whether the embed.py code should simply skip transcript_segments entirely (since it has no embedding column) or if there's cleanup needed.
   - Recommendation: The TABLE_CONFIG in PR #35 already comments out transcript_segments. The `embedding_hv` references are in the `fetch_rows_needing_embeddings` and `update_embeddings_batch` functions as conditional logic (`if table == "transcript_segments"` use `embedding_hv`). Since transcript_segments is not in TABLE_CONFIG, this dead code is harmless but should be cleaned up. Remove the `embedding_hv` conditionals.

2. **fastembed Dependency Removal**
   - What we know: `fastembed>=0.7.3` is in `pyproject.toml` but not imported anywhere. The pipeline uses OpenAI for embeddings.
   - What's unclear: Whether removing it will break any transitive dependencies or scripts not tracked in git.
   - Recommendation: Remove from pyproject.toml as part of this phase. It's a large dependency (~500MB with ONNX runtime) that's no longer used.

3. **Search Page vectorSearchAll Integration**
   - What we know: `apps/web/app/services/search.ts` calls `vectorSearchAll()` which in turn calls `searchTranscriptSegments()`. PR #35 stubs this to return `[]`.
   - What's unclear: Whether the search page UI handles empty transcript segment results gracefully.
   - Recommendation: The search page already handles empty arrays. The stub approach is safe. Consider adding `searchKeyStatements` to `vectorSearchAll` in a future phase.

## Sources

### Primary (HIGH confidence)
- Supabase MCP: `list_migrations` -- confirmed 23 migrations applied
- Supabase MCP: `list_tables` -- confirmed all table schemas
- Supabase MCP: `execute_sql` -- confirmed 6 match_* RPCs with halfvec params, confirmed `corrected_text_content` column does not exist, confirmed transcript_segments has no embedding column
- Git diff analysis: `git diff main...phase3c/embedding-migration` and `git diff main...fix/key-statement-prompts` -- full diff of all changed files
- Codebase grep: confirmed 15+ `corrected_text_content` references in web app, confirmed no fastembed imports

### Secondary (MEDIUM confidence)
- PR metadata via `gh pr view` -- confirmed file lists, states, branch names

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- verified against live DB schema and existing code
- Architecture: HIGH -- all patterns verified by reading actual source code and DB RPCs
- Pitfalls: HIGH -- each pitfall verified by cross-referencing DB schema with app code
- PR merge analysis: HIGH -- full diff analysis of both PRs with conflict check

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable -- schema is locked, PRs are static)
