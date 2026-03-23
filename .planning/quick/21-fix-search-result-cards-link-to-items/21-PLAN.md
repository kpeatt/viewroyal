---
phase: 21-fix-search-result-cards-link-to-items
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/21-01-add-agenda-item-id-to-motions-search.sql
  - apps/web/app/services/hybrid-search.server.ts
  - apps/web/app/components/search/result-card.tsx
autonomous: true
requirements: [SEARCH-LINK-01]
must_haves:
  truths:
    - "Motion search results link to the meeting page with agenda item anchor"
    - "Key statement results link to the meeting page with agenda item anchor"
    - "Document section results link to the document viewer page"
    - "Transcript segment results link to the meeting page at the correct timestamp"
  artifacts:
    - path: "supabase/migrations/21-01-add-agenda-item-id-to-motions-search.sql"
      provides: "Updated RPC returning agenda_item_id for motions"
    - path: "apps/web/app/services/hybrid-search.server.ts"
      provides: "agenda_item_id and document_id plumbed through UnifiedSearchResult"
    - path: "apps/web/app/components/search/result-card.tsx"
      provides: "Type-specific link URLs for each result type"
  key_links:
    - from: "result-card.tsx"
      to: "/meetings/{id}#agenda-{agenda_item_id}"
      via: "linkTo computed from result.type + result.agenda_item_id"
      pattern: "agenda_item_id"
---

<objective>
Fix search result cards so each result type links to the most specific relevant page/anchor instead of the generic /meetings/{id} page.

Purpose: Currently all search results link to /meetings/{id} which drops users on the meeting overview with no context about what they searched for. Each result type has a more specific destination available.
Output: Search result cards with type-specific deep links.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/app/components/search/result-card.tsx
@apps/web/app/services/hybrid-search.server.ts
@supabase/migrations/31-01-add-date-filter-to-hybrid-search-rpcs.sql

<interfaces>
<!-- Current UnifiedSearchResult type (from hybrid-search.server.ts) -->
```typescript
export interface UnifiedSearchResult {
  id: number;
  type: "motion" | "key_statement" | "document_section" | "transcript_segment";
  title: string;
  content: string;
  meeting_id: number | null;
  meeting_date: string | null;
  speaker_name?: string;
  rank_score: number;
  motion_result?: string;
  motion_mover?: string;
  motion_seconder?: string;
  statement_type?: string;
  start_time?: number;
}
```

<!-- Current link logic in result-card.tsx (line 80-84) -->
```typescript
const linkTo = result.meeting_id
  ? result.type === "transcript_segment" && result.start_time
    ? `/meetings/${result.meeting_id}#t=${result.start_time}`
    : `/meetings/${result.meeting_id}`
  : "#";
```

<!-- URL patterns available in the app -->
- Meeting detail: `/meetings/{meeting_id}`
- Meeting detail with agenda anchor: `/meetings/{meeting_id}#agenda-{agenda_item_id}` (used by document-viewer.tsx line 453)
- Document viewer: `/meetings/{meeting_id}/documents/{extracted_document_id}`
- Meeting documents list: `/meetings/{meeting_id}/documents`
- Transcript timestamp: `/meetings/{meeting_id}#t={start_time}`

<!-- RPC return signatures (from migration 31-01) -->
- `hybrid_search_motions` returns: id, meeting_id, text_content, plain_english_summary, result, mover, seconder, rank_score
  - MISSING: agenda_item_id (exists in motions table but not returned by RPC)
- `hybrid_search_key_statements` returns: id, meeting_id, agenda_item_id, speaker_name, statement_type, statement_text, context, rank_score
  - agenda_item_id ALREADY RETURNED but ignored by TypeScript mapping
- `hybrid_search_document_sections` returns: id, document_id, meeting_id, section_title, content, rank_score
  - document_id ALREADY RETURNED but ignored by TypeScript mapping
- `ftsSearchTranscriptSegments` (direct query, not RPC): returns id, meeting_id, speaker_name, text_content, start_time
  - Already has start_time, already used for #t= links
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add agenda_item_id to motions search RPC</name>
  <files>supabase/migrations/21-01-add-agenda-item-id-to-motions-search.sql</files>
  <action>
Create a SQL migration that replaces `hybrid_search_motions` to add `agenda_item_id` to both the RETURNS TABLE clause and the final SELECT.

Copy the existing function definition from `supabase/migrations/31-01-add-date-filter-to-hybrid-search-rpcs.sql` (lines 5-66) and modify:
1. Add `agenda_item_id bigint` to the RETURNS TABLE (after meeting_id)
2. Add `motions.agenda_item_id` to the final SELECT (after motions.meeting_id)

Keep everything else identical. Use CREATE OR REPLACE FUNCTION.

Then apply the migration locally:
```bash
cd /Users/kyle/development/viewroyal && npx supabase db push --local 2>/dev/null || psql "$DATABASE_URL" -f supabase/migrations/21-01-add-agenda-item-id-to-motions-search.sql
```

If neither works, note in summary that the migration needs to be applied via the Supabase dashboard SQL editor.
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal && cat supabase/migrations/21-01-add-agenda-item-id-to-motions-search.sql | grep -c "agenda_item_id"</automated>
  </verify>
  <done>Migration file exists with agenda_item_id in both RETURNS TABLE and SELECT clauses</done>
</task>

<task type="auto">
  <name>Task 2: Plumb new fields through service layer and update result card links</name>
  <files>apps/web/app/services/hybrid-search.server.ts, apps/web/app/components/search/result-card.tsx</files>
  <action>
**In `hybrid-search.server.ts`:**

1. Add optional fields to `UnifiedSearchResult` interface:
   - `agenda_item_id?: number` (for motions and key_statements)
   - `document_id?: number` (for document_sections)

2. In `hybridSearchMotions` mapping (line 76-87), add:
   ```typescript
   agenda_item_id: row.agenda_item_id || null,
   ```

3. In `hybridSearchKeyStatements` mapping (line 114-124), add:
   ```typescript
   agenda_item_id: row.agenda_item_id || null,
   ```

4. In `hybridSearchDocumentSections` mapping (line 155-163), add:
   ```typescript
   document_id: row.document_id || null,
   ```

**In `result-card.tsx`:**

Replace the `linkTo` computation (lines 80-84) with type-specific URL logic:

```typescript
function getResultUrl(result: UnifiedSearchResult): string {
  if (!result.meeting_id) return "#";

  switch (result.type) {
    case "motion":
    case "key_statement":
      // Link to meeting page anchored at the parent agenda item
      return result.agenda_item_id
        ? `/meetings/${result.meeting_id}#agenda-${result.agenda_item_id}`
        : `/meetings/${result.meeting_id}`;

    case "document_section":
      // Link to document viewer if we have the document ID, otherwise meeting documents page
      return result.document_id
        ? `/meetings/${result.meeting_id}/documents/${result.document_id}`
        : `/meetings/${result.meeting_id}/documents`;

    case "transcript_segment":
      // Link to meeting page at the specific timestamp
      return result.start_time
        ? `/meetings/${result.meeting_id}#t=${result.start_time}`
        : `/meetings/${result.meeting_id}`;

    default:
      return `/meetings/${result.meeting_id}`;
  }
}
```

Then use it: `const linkTo = getResultUrl(result);`

Also update the trackEvent call to include the destination URL for analytics:
```typescript
trackEvent("search result clicked", {
  result_type: result.type,
  result_position: position,
  meeting_id: result.meeting_id,
  destination: linkTo,
})
```
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/web && pnpm typecheck</automated>
  </verify>
  <done>
  - Motion/key_statement results link to /meetings/{id}#agenda-{agenda_item_id} when agenda_item_id is available
  - Document section results link to /meetings/{id}/documents/{document_id} when document_id is available
  - Transcript results continue linking to /meetings/{id}#t={start_time}
  - All results gracefully fall back to /meetings/{id} when specific IDs are missing
  - TypeScript compiles cleanly
  </done>
</task>

</tasks>

<verification>
- `pnpm typecheck` passes in apps/web
- Search results for motions link to meeting page with agenda anchor
- Search results for documents link to document viewer
- Search results for transcripts link to timestamp
- Results without specific IDs gracefully fall back to meeting page
</verification>

<success_criteria>
Each search result type links to the most specific available destination rather than the generic meeting page. No regressions in search functionality or TypeScript compilation.
</success_criteria>

<output>
After completion, create `.planning/quick/21-fix-search-result-cards-link-to-items/21-SUMMARY.md`
</output>
