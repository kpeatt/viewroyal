---
status: diagnosed
phase: 17-ocd-interoperability
source: [17-01-SUMMARY.md, 17-02-SUMMARY.md, 17-03-SUMMARY.md, 17-04-SUMMARY.md, 17-05-SUMMARY.md]
started: 2026-02-21T23:00:00Z
updated: 2026-02-21T23:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. OCD Discovery Endpoint
expected: GET /api/ocd/view-royal/ returns JSON listing all six entity URLs (jurisdictions, organizations, people, events, bills, votes)
result: pass

### 2. Jurisdiction List with Correct OCD ID
expected: GET /api/ocd/view-royal/jurisdictions returns a jurisdiction with an OCD ID containing csd:5917047 (not empty csd:)
result: pass

### 3. Organization List with Valid Jurisdiction Reference
expected: GET /api/ocd/view-royal/organizations returns paginated organizations, each with a jurisdiction_id containing csd:5917047
result: issue
reported: "500 error: column organizations.parent_organization_id does not exist. The organizations table only has: id, name, classification, meta, created_at, municipality_id, ocd_id."
severity: blocker

### 4. Person List with Pagination
expected: GET /api/ocd/view-royal/people returns paginated people with OCD IDs. Adding ?page=2 returns a different page of results.
result: pass

### 5. Event List with Date Filtering
expected: GET /api/ocd/view-royal/events returns paginated meeting events. Adding ?after=2024-01-01&before=2024-12-31 filters to 2024 meetings only.
result: pass

### 6. Event Detail with Inline Agenda
expected: Pick any event OCD ID from the list and GET its detail URL. Response includes inline agenda array with agenda items, plus participants, media, and documents fields.
result: pass

### 7. Bill List and Detail with Actions
expected: GET /api/ocd/view-royal/bills returns paginated bills (matters). A bill detail includes an actions array (chronological agenda appearances) and sponsors array.
result: issue
reported: "Bill list works, but bill detail returns 500: column matters.document_url does not exist. The matters table has no document_url column."
severity: major

### 8. Vote Detail with Roll Call
expected: GET /api/ocd/view-royal/votes then pick a vote detail. Response includes votes array (roll call entries with voter name and vote value) and counts array computed from roll call data.
result: issue
reported: "Vote list works. Vote detail works for older votes (2020) with roll_call and vote_counts populated correctly. But returns 404 for recent votes (2026) — the detail endpoint fetches ALL motions without pagination, and PostgREST default row limit (~1000) cuts off newer motions (10,536 total). Recent vote IDs from the list endpoint can't be found in the truncated detail query result."
severity: major

## Summary

total: 8
passed: 5
issues: 3
pending: 0
skipped: 0

## Gaps

- truth: "Organization list and detail endpoints return data"
  status: failed
  reason: "500 error: column organizations.parent_organization_id does not exist"
  severity: blocker
  test: 3
  root_cause: "organizations.ts selects parent_organization_id but the organizations table only has: id, name, classification, meta, created_at, municipality_id, ocd_id. The column was assumed from the OCD spec but doesn't exist in the actual schema."
  artifacts:
    - path: "apps/web/app/api/ocd/endpoints/organizations.ts"
      issue: "Lines 43 and 92 select parent_organization_id which doesn't exist"
  missing:
    - "Remove parent_organization_id from the select strings in listOrganizations (line 43) and getOrganization (line 92)"

- truth: "Bill detail endpoint returns data with actions and sponsors"
  status: failed
  reason: "500 error: column matters.document_url does not exist"
  severity: major
  test: 7
  root_cause: "bills.ts getBill selects document_url from matters, but the matters table has no such column. Columns are: id, title, identifier, description, plain_english_summary, category, status, first_seen, last_seen, embedding, meta, created_at, bylaw_id, geo_location, geo, municipality_id, ocd_id, text_search, slug."
  artifacts:
    - path: "apps/web/app/api/ocd/endpoints/bills.ts"
      issue: "Line 119 selects document_url which doesn't exist on matters table"
  missing:
    - "Remove document_url from the getBill select string on line 119"

- truth: "Vote detail endpoint returns data for all votes including recent ones"
  status: failed
  reason: "404 for recent votes (2026) because PostgREST default row limit truncates the full-table scan used for OCD ID reverse-lookup"
  severity: major
  test: 8
  root_cause: "getVote fetches ALL motions without a .range() or .limit() call. PostgREST defaults to returning ~1000 rows. With 10,536 total motions, recent motions (high IDs) are not in the default result set. The OCD ID reverse-lookup then fails to find them. Same issue potentially affects getBill (1727 matters) and getOrganization (~10 orgs, safe)."
  artifacts:
    - path: "apps/web/app/api/ocd/endpoints/votes.ts"
      issue: "Lines 120-125: getVote fetches all motions without explicit row limit, PostgREST truncates at default limit"
    - path: "apps/web/app/api/ocd/endpoints/bills.ts"
      issue: "Lines 116-121: getBill fetches all matters without explicit row limit (1727 rows, may also be truncated)"
  missing:
    - "Add explicit .limit(100000) or paginate the reverse-lookup queries in getVote and getBill to ensure all rows are fetched"
