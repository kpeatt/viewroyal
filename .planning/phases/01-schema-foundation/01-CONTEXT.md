# Phase 1: Schema Foundation - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix live bugs, align web app code with the already-migrated database schema, merge PRs #35 and #37. The DB schema is stable — the work is landing the web app code that matches it.

</domain>

<decisions>
## Implementation Decisions

### Embedding strategy
- Go with halfvec(384) — DB is already migrated, all tables use halfvec
- Standardize on OpenAI text-embedding-3-small for both pipeline and web app
- Existing DB content was already embedded with OpenAI — no re-embedding needed
- Pipeline code (currently fastembed/nomic-embed-text-v1.5) must be updated to use OpenAI text-embedding-3-small at 384 dimensions

### Migration reconciliation
- DB already has 23 Supabase migrations applied covering: halfvec migration, RPC updates, tsvector columns, transcript cleanup, municipalities, key_statements, and more
- Cherry-pick only new changes from PR #35 — the migration SQL is already applied, so we mainly need the web app code fixes
- Use Supabase MCP tools to apply any additional migrations needed
- Do NOT re-apply migrations that are already in Supabase — compare PR #35's migration files against the 23 applied ones

### Transcript segment search
- `match_transcript_segments` RPC is MISSING from the DB — it was removed during cleanup
- `transcript_segments` table has NO embedding column (cleaned up by `cleanup_transcript_columns` migration)
- Web app on main still calls `match_transcript_segments` with `filter_meeting_id` param — both the RPC and param don't exist
- Decision needed during planning: either recreate the RPC with halfvec or remove transcript-level vector search and rely on other match_* RPCs (agenda_items, key_statements, motions)

### PR merge approach
- PR #35 (embedding migration): Schema changes are already applied to DB. Extract web app code changes only. Migration files are redundant.
- PR #37 (key statement prompts): Clean addition — new KeyStatement model, extraction prompt, ingestion logic. key_statements table already exists in DB.
- Both PRs should be assessed for code changes only, not migration files

### Claude's Discretion
- How to handle the missing transcript segment search — recreate RPC or remove from web app
- Exact approach to extracting PR #35 code changes (merge then clean up vs cherry-pick specific commits)
- Whether bootstrap.sql needs updating to reflect current schema state

</decisions>

<specifics>
## Specific Ideas

- User confirmed DB was embedded with OpenAI originally, so no model mismatch in stored data
- The 6 existing match_* RPCs (agenda_items, bylaws, bylaw_chunks, key_statements, matters, motions) all work with halfvec — only transcript_segments is missing
- Web app code is the main deliverable, not schema changes

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-schema-foundation*
*Context gathered: 2026-02-16*
