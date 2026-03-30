# Phase 41: Data Isolation - Research

**Researched:** 2026-03-30
**Domain:** Supabase query scoping, PostgreSQL RPC modification, RAG tool isolation
**Confidence:** HIGH

## Summary

Phase 41 adds municipality_id filtering to all 18 service layer files, 6+ Supabase RPC functions, and the RAG agent's tool layer. The goal is to prevent cross-municipality data leakage before Esquimalt data enters the database.

The API endpoint layer (`apps/web/app/api/endpoints/`) already implements municipality scoping for every entity, providing exact Supabase query patterns for each table. The service layer mirrors these same queries but without the municipality filter. This phase copies the proven API patterns into the service layer and extends the Supabase RPCs to accept a `municipality_id` parameter.

**Primary recommendation:** Thread the municipality object (already available from root loader) through every service function. For tables with direct `municipality_id`, add `.eq("municipality_id", muni.id)`. For tables without (motions, agenda_items, transcript_segments, votes, etc.), use `!inner` join on meetings: `.eq("meetings.municipality_id", muni.id)`. Modify all 9 hybrid/vector search RPCs to accept and filter by `municipality_id`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Follow the API endpoint layer's join pattern for tables without direct municipality_id (motions via meetings.municipality_id inner join, people via org memberships)
- No schema changes -- no adding municipality_id columns to motions/people tables
- Service functions receive the full municipality object (not just ID) -- services can access slug, name, meta without extra lookups
- Leave getMunicipality() default slug ("view-royal") in place -- Phase 43 removes it when hostname routing is wired
- Add municipality_id parameter to the Postgres search RPCs themselves (keyword + vector) -- filtering at query level, not post-query
- RAG agent tools receive municipality_id and scope their vector search + keyword search to the current municipality's data only
- No prompt-level scoping needed -- tool-level scoping is sufficient
- All 18 service files updated atomically in a single change -- no partial state where some queries leak
- Add tests that verify municipality scoping (queries with municipality A don't return municipality B data)

### Claude's Discretion
- Exact test structure and test data setup
- Whether to create a helper/wrapper for the municipality_id filter pattern
- Order of file modifications within the atomic change

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCOPE-01 | All service layer queries filter by municipality_id so data never leaks between municipalities | Table-by-table scoping strategy documented below with exact patterns from API endpoints |
| SCOPE-02 | Hybrid search RPCs (keyword + vector) return results scoped to the current municipality only | 9 RPCs identified that need municipality_id parameter; SQL modification pattern documented |
| SCOPE-03 | RAG agent answers questions using only the current municipality's data | 7 RAG tool functions identified; threading pattern documented |
</phase_requirements>

## Architecture Patterns

### Municipality Data Flow (Current)

```
root.tsx loader
  -> getMunicipality(supabase, "view-royal")  // hardcoded slug
  -> returns Municipality object { id, slug, name, ... }
  -> passed to components via useLoaderData()
  -> available in child routes via getMunicipalityFromMatches()
```

The municipality object is already loaded in the root loader and available to every route. Child route loaders can access it, but currently none of the service functions accept or use it.

### Scoping Strategy by Table Type

**Tables WITH direct `municipality_id` column:**

| Table | Column | Pattern |
|-------|--------|---------|
| meetings | municipality_id | `.eq("municipality_id", muni.id)` |
| matters | municipality_id | `.eq("municipality_id", muni.id)` |
| bylaws | municipality_id | `.eq("municipality_id", muni.id)` |
| organizations | municipality_id | `.eq("municipality_id", muni.id)` |
| documents | municipality_id | `.eq("municipality_id", muni.id)` |
| key_statements | municipality_id | `.eq("municipality_id", muni.id)` |
| document_sections | municipality_id | `.eq("municipality_id", muni.id)` |
| extracted_documents | municipality_id | `.eq("municipality_id", muni.id)` |
| document_images | municipality_id | `.eq("municipality_id", muni.id)` |

**Tables WITHOUT `municipality_id` (scope via join):**

| Table | Join Path | Pattern |
|-------|-----------|---------|
| motions | motions -> meetings | `.select("..., meetings!inner(municipality_id)").eq("meetings.municipality_id", muni.id)` |
| agenda_items | agenda_items -> meetings | `.select("..., meetings!inner(municipality_id)").eq("meetings.municipality_id", muni.id)` |
| transcript_segments | transcript_segments -> meetings | `.select("..., meetings!inner(municipality_id)").eq("meetings.municipality_id", muni.id)` |
| votes | votes -> motions -> meetings | Scope via pre-filtered motion IDs or `meetings!inner` chain |
| attendance | attendance -> meetings | `.eq("meetings.municipality_id", muni.id)` via already-scoped meeting_id |
| people | people -> memberships -> organizations | Scope via council org lookup (already scoped by org) |
| meeting_speaker_aliases | via meeting_id | Already scoped by meeting_id lookup |

### Pattern 1: Direct municipality_id filter
**What:** Add `.eq("municipality_id", muni.id)` to queries on tables with the column
**When to use:** meetings, matters, bylaws, organizations, documents, key_statements, document_sections
**Example (from API endpoint):**
```typescript
// Source: apps/web/app/api/endpoints/meetings/list.ts
let query = supabase
  .from("meetings")
  .select("id, slug, title, ...")
  .eq("municipality_id", muni.id);
```

### Pattern 2: Inner join scoping via meetings
**What:** Use `!inner` join syntax to scope tables that link to meetings
**When to use:** motions, agenda_items, transcript_segments, key_statements
**Example (from API endpoint):**
```typescript
// Source: apps/web/app/api/endpoints/motions/list.ts
let query = supabase
  .from("motions")
  .select("..., meetings!inner(slug, meeting_date, municipality_id)")
  .eq("meetings.municipality_id", muni.id);
```

### Pattern 3: Organization-scoped people queries
**What:** Scope people via organization membership lookup
**When to use:** People listing, council members
**Example:**
```typescript
// Current: finds "Council" org without municipality scope
const { data: councilOrg } = await supabase
  .from("organizations")
  .select("id")
  .eq("classification", "Council")
  .single();

// Scoped: find Council org for THIS municipality
const { data: councilOrg } = await supabase
  .from("organizations")
  .select("id")
  .eq("classification", "Council")
  .eq("municipality_id", muni.id)
  .single();
```

### Pattern 4: RPC municipality filtering
**What:** Add `filter_municipality_id` parameter to Supabase RPC functions
**When to use:** All hybrid search RPCs, match_* RPCs
**Example (SQL):**
```sql
-- Add parameter
CREATE OR REPLACE FUNCTION hybrid_search_motions(
  query_text text,
  query_embedding halfvec(384),
  match_count int,
  ...,
  filter_municipality_id bigint DEFAULT NULL  -- NEW
)
...
-- Add WHERE clause via JOIN
FROM motions m
JOIN meetings mt ON mt.id = m.meeting_id
WHERE ...
  AND (filter_municipality_id IS NULL OR mt.municipality_id = filter_municipality_id)
```

### Anti-Patterns to Avoid
- **Post-query filtering:** Never fetch all data then filter in JS. Always filter at the database level. The RPCs must filter inside SQL, not return unscoped results.
- **Forgetting `!inner`:** Using regular join instead of `!inner` will return rows where the join produces no match (null municipality), defeating the filter.
- **Breaking existing callers during migration:** The `DEFAULT NULL` on RPC parameters ensures backward compatibility -- existing callers still work without the parameter.

## Inventory: All 18 Service Files

### Files requiring municipality scoping

| # | File | Functions | Scoping Approach |
|---|------|-----------|------------------|
| 1 | meetings.ts | getMeetings, getMeetingById, getDividedDecisions, getDocumentSections*, getExtractedDocuments* | Direct `.eq("municipality_id")` on meetings; inner join for motions/votes |
| 2 | matters.ts | getMatters, getMatterById, getDocumentsForAgendaItems, getHotTopics, getFiscalData | Direct `.eq("municipality_id")` on matters; inner join for agenda_items |
| 3 | people.ts | getPeopleWithStats, getRawPeopleData, getPersonProfile, getPersonProposals, getActiveCouncilMembers, getPeopleNames, get_person_by_role | Scope via organization municipality_id |
| 4 | organizations.ts | getOrganizations, getOrganizationById | Direct `.eq("municipality_id")` |
| 5 | bylaws.ts | getBylaws, getBylawById | Direct `.eq("municipality_id")` |
| 6 | search.ts | keywordSearch, vectorSearch, globalSearch, politicalAnalysis | Thread municipality through all sub-queries |
| 7 | hybrid-search.server.ts | hybridSearchMotions, hybridSearchKeyStatements, hybridSearchDocumentSections, ftsSearchTranscriptSegments, hybridSearchAll | Pass municipality_id to RPCs; add to FTS query |
| 8 | vectorSearch.ts | searchMotions, searchMatters, searchAgendaItems, searchKeyStatements, vectorSearchAll | Pass municipality_id to match_* RPCs |
| 9 | rag.server.ts | search_motions, search_matters, search_agenda_items, search_key_statements, search_transcript_segments, search_document_sections, search_bylaws, get_voting_history, get_statements_by_person, getPerson | Thread municipality_id through all tools and internal functions |
| 10 | site.ts | getAboutStats, getHomeData, getPublicNotices | Direct `.eq("municipality_id")` on meetings/matters/motions |
| 11 | analytics.ts | getVotingAlignment, fetchAllVotesForAlignment | Scope via organization municipality_id |
| 12 | profiling.ts | getSpeakingTimeStats, getSpeakingTimeByMeeting, getSpeakingTimeByTopic, getCouncillorStances, getCouncillorHighlights, getKeyVotes | RPC params need municipality_id; direct queries need inner join |
| 13 | elections.ts | getElections, getElectionById | Direct `.eq("municipality_id")` (elections has municipality_id) |
| 14 | topics.ts | getTopics | Topics are global/shared across municipalities -- may not need scoping |
| 15 | subscriptions.ts | getSubscriptions, addSubscription, checkSubscription, getMeetingDigest, findMattersNear | User-scoped (by user_id), but matter/person lookups may need scoping |
| 16 | municipality.ts | getMunicipality | Already scoped by slug -- no change needed |
| 17 | admin.ts | getAllPeople, getPerson, updatePerson, createPerson, getAllOrganizations, addMembership | Admin panel -- scope by municipality_id on organizations |
| 18 | vimeo.server.ts | getVimeoVideoData, getVimeoThumbnail | Operates on specific meeting IDs -- inherently scoped |

### Files NOT requiring changes
- **municipality.ts** -- already returns by slug
- **vimeo.server.ts** -- operates on specific meeting_id, inherently scoped
- **topics.ts** -- topics are global categories (not municipality-specific)

### Supabase RPCs requiring municipality_id parameter

| RPC Function | Current Location | Join Path for Scoping |
|-------------|------------------|----------------------|
| hybrid_search_motions | create_hybrid_search_rpcs.sql + 31-01 | motions -> meetings.municipality_id |
| hybrid_search_key_statements | create_hybrid_search_rpcs.sql + 31-01 | key_statements.municipality_id (direct) |
| hybrid_search_document_sections | create_hybrid_search_rpcs.sql + 31-01 | document_sections.municipality_id (direct) |
| hybrid_search_bylaw_chunks | hybrid_search_bylaw_chunks.sql | bylaw_chunks -> bylaws.municipality_id |
| match_motions | bootstrap.sql | motions -> meetings.municipality_id |
| match_matters | bootstrap.sql | matters.municipality_id (direct) |
| match_agenda_items | bootstrap.sql | agenda_items -> meetings.municipality_id |
| match_key_statements | bootstrap.sql | key_statements.municipality_id (direct) |
| match_bylaws | bootstrap.sql | bylaws.municipality_id (direct) |
| get_meetings_with_stats | 37-02 | meetings.municipality_id (direct) |
| get_speaking_time_stats | councillor_stances_and_speaking_time.sql | Needs meeting join |
| get_speaking_time_by_meeting | councillor_stances_and_speaking_time.sql | Needs meeting join |
| get_speaking_time_by_topic | councillor_stances_and_speaking_time.sql | Needs meeting join |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Query scoping | Custom middleware or wrapper | Supabase `.eq()` and `!inner` join | Already proven in API layer; consistent pattern |
| RPC scoping | Post-query JS filtering | SQL `WHERE` clause with `DEFAULT NULL` | Performance; correctness at DB level |
| Municipality resolution | New lookup per service call | Root loader `getMunicipality()` + pass through | Already loaded once per request |

## Common Pitfalls

### Pitfall 1: Forgetting `!inner` on join-scoped tables
**What goes wrong:** Using `.select("..., meetings(municipality_id)")` without `!inner` returns all rows including those where the join produces NULL.
**Why it happens:** PostgREST/Supabase uses LEFT JOIN by default; `!inner` converts to INNER JOIN.
**How to avoid:** Always use `meetings!inner(...)` when filtering on joined table columns.
**Warning signs:** Queries return rows from other municipalities despite the filter.

### Pitfall 2: Breaking the RPC backward compatibility
**What goes wrong:** Changing RPC signatures without DEFAULT NULL breaks callers that don't pass the new parameter.
**Why it happens:** PostgreSQL requires all non-default parameters to be provided.
**How to avoid:** Always use `DEFAULT NULL` for the new municipality_id parameter. NULL means "no filter" (all municipalities).
**Warning signs:** Existing API endpoints or hybrid search calls fail with argument count mismatch.

### Pitfall 3: Missing a query path in the RAG agent
**What goes wrong:** The RAG agent's internal tool functions (search_motions, search_transcript_segments, etc.) are standalone functions that create their own Supabase client, bypassing the service layer.
**Why it happens:** RAG tools were written as self-contained closures, not reusing service functions.
**How to avoid:** Thread municipality_id into every RAG tool function. The tools array is defined in module scope -- either pass municipality_id when constructing tools, or create a factory function.
**Warning signs:** AI answers cite Esquimalt sources when queried on viewroyal.ai.

### Pitfall 4: Organizations table needs municipality scoping
**What goes wrong:** `organizations` table may not have `municipality_id` in the original schema. Both View Royal and Esquimalt will have a "Council" org. Queries like `.eq("classification", "Council").single()` will fail with multiple results.
**Why it happens:** The bootstrap.sql organizations table doesn't have municipality_id; it was added later.
**How to avoid:** Verify the organizations table schema. If it lacks municipality_id, scope via memberships or a known org_id passed from the municipality object.
**Warning signs:** `.single()` calls on organizations throw "multiple rows returned" errors.

### Pitfall 5: The RAG agent uses a module-level Supabase client
**What goes wrong:** `rag.server.ts` creates its own lazy Supabase client via `getSupabase()`, separate from the one used in route loaders. Tools are defined at module scope with closures over this client.
**Why it happens:** The RAG agent was designed for single-municipality use.
**How to avoid:** Refactor `runQuestionAgent` to accept municipality_id and pass it through to tool closures. The tools array should be constructed per-request (or pass municipality_id as a closure variable).

## Code Examples

### Service function signature change pattern
```typescript
// BEFORE
export async function getMeetings(
  supabase: SupabaseClient,
  options: GetMeetingsOptions = {},
) {
  let query = supabase
    .from("meetings")
    .select("...");
  // ... filters
}

// AFTER
export async function getMeetings(
  supabase: SupabaseClient,
  municipalityId: string,
  options: GetMeetingsOptions = {},
) {
  let query = supabase
    .from("meetings")
    .select("...")
    .eq("municipality_id", municipalityId);
  // ... filters
}
```

### RPC call with municipality_id
```typescript
// BEFORE
const { data } = await supabase.rpc("hybrid_search_motions", {
  query_text: queryText,
  query_embedding: JSON.stringify(embedding),
  match_count: limit,
  ...
});

// AFTER
const { data } = await supabase.rpc("hybrid_search_motions", {
  query_text: queryText,
  query_embedding: JSON.stringify(embedding),
  match_count: limit,
  filter_municipality_id: municipalityId,
  ...
});
```

### SQL RPC modification pattern
```sql
-- Add parameter (with DEFAULT NULL for backward compat)
CREATE OR REPLACE FUNCTION hybrid_search_motions(
  query_text text,
  query_embedding halfvec(384),
  match_count int,
  full_text_weight float DEFAULT 1,
  semantic_weight float DEFAULT 1,
  rrf_k int DEFAULT 50,
  date_from date DEFAULT NULL,
  date_to date DEFAULT NULL,
  filter_municipality_id bigint DEFAULT NULL  -- NEW
)
...
-- In both CTEs, add the filter:
FROM motions m
JOIN meetings mt ON mt.id = m.meeting_id
WHERE m.text_search @@ websearch_to_tsquery(query_text)
  AND (date_from IS NULL OR mt.meeting_date >= date_from)
  AND (date_to IS NULL OR mt.meeting_date <= date_to)
  AND (filter_municipality_id IS NULL OR mt.municipality_id = filter_municipality_id)  -- NEW
```

### RAG tool scoping pattern
```typescript
// The tools need municipality_id threaded through.
// Option: create tools as a factory function
function createTools(municipalityId: string): Tool<any, any>[] {
  // All internal search functions now accept municipalityId
  async function search_motions({ query, after_date }: { query: string; after_date?: string }) {
    const { data } = await getSupabase().rpc("match_motions", {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 15,
      filter_municipality_id: municipalityId,  // SCOPED
    });
    // ... enrichment queries also need municipality scoping
  }

  return [
    { name: "search_council_records", ... call: ... },
    // ...
  ];
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.x |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/web && pnpm vitest run --reporter=verbose` |
| Full suite command | `cd apps/web && pnpm vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCOPE-01 | Service functions filter by municipality_id | unit | `cd apps/web && pnpm vitest run tests/services/municipality-scoping.test.ts -x` | Wave 0 |
| SCOPE-02 | hybridSearchAll passes municipality_id to RPCs | unit | `cd apps/web && pnpm vitest run tests/services/hybrid-search-scoping.test.ts -x` | Wave 0 |
| SCOPE-03 | RAG tools scope queries by municipality_id | unit | `cd apps/web && pnpm vitest run tests/services/rag-scoping.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/web && pnpm vitest run --reporter=verbose`
- **Per wave merge:** `cd apps/web && pnpm vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/services/municipality-scoping.test.ts` -- covers SCOPE-01: verify `.eq("municipality_id", ...)` called on direct tables, verify `meetings!inner` pattern on join tables
- [ ] `tests/services/hybrid-search-scoping.test.ts` -- covers SCOPE-02: verify `filter_municipality_id` passed to RPCs
- [ ] `tests/services/rag-scoping.test.ts` -- covers SCOPE-03: verify RAG tool functions receive and use municipality_id

### Test Strategy Recommendation
Use the existing mock Supabase pattern from `tests/services/meetings.test.ts`:
- Create `createMockQueryBuilder` and `createMockSupabase` helpers
- Verify `.eq("municipality_id", ...)` is called with correct value
- Verify `!inner` join syntax is present in select strings for join-scoped tables
- For RPC tests, verify `.rpc()` is called with `filter_municipality_id` parameter

## Open Questions

1. **Does `organizations` table have `municipality_id`?**
   - What we know: bootstrap.sql does NOT have it. The slug migration references `meetings.municipality_id` but not `organizations.municipality_id`.
   - What's unclear: Whether a later migration added it
   - Recommendation: Check the actual DB schema. If missing, scope organizations via the meetings they're associated with, or add the column as a prerequisite migration. This is critical because `.eq("classification", "Council").single()` will break with two municipalities.

2. **Should `topics` be municipality-scoped?**
   - What we know: Topics are generic categories (e.g., "Housing", "Transportation"). They're used for subscription matching.
   - What's unclear: Whether different municipalities should have different topic sets
   - Recommendation: Leave topics global for now. They're conceptual categories, not municipality-specific data.

3. **Should `elections` be municipality-scoped?**
   - What we know: Elections table exists but bootstrap.sql doesn't show municipality_id on it.
   - What's unclear: Whether a migration added it
   - Recommendation: Check actual DB schema. Elections are inherently per-municipality and need scoping.

## Sources

### Primary (HIGH confidence)
- `apps/web/app/api/endpoints/` -- Existing municipality-scoped API endpoints (exact patterns)
- `apps/web/app/services/*.ts` -- All 18 service files read in full
- `sql/bootstrap.sql` -- Table schema with column definitions
- `supabase/migrations/` -- RPC function definitions and schema changes

### Secondary (MEDIUM confidence)
- `supabase/migrations/add_slug_columns.sql` -- Confirms meetings, matters, bylaws have municipality_id
- `supabase/migrations/create_document_sections.sql` -- Confirms document_sections has municipality_id
- `supabase/migrations/add_extracted_documents_and_images.sql` -- Confirms extracted_documents and document_images have municipality_id

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- this is internal refactoring using existing patterns
- Architecture: HIGH -- API endpoint layer provides exact reference implementation
- Pitfalls: HIGH -- identified from direct code analysis of all 18 service files and 13 RPCs

**Research date:** 2026-03-30
**Valid until:** Indefinite (internal codebase patterns, not external dependencies)
