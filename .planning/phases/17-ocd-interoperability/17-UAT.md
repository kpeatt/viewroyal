---
status: diagnosed
phase: 17-ocd-interoperability
source: [17-01-SUMMARY.md, 17-02-SUMMARY.md, 17-03-SUMMARY.md, 17-04-SUMMARY.md]
started: 2026-02-21T22:45:00Z
updated: 2026-02-21T22:52:00Z
---

## Current Test

[testing complete]

## Tests

### 1. OCD Discovery Endpoint
expected: GET /api/ocd/view-royal/ returns JSON listing all six entity URLs (jurisdictions, organizations, people, events, bills, votes)
result: issue
reported: "Returns HTML 404 page. Workers app.ts only routes /api/v1/* to Hono — /api/ocd/* falls through to React Router which returns 404."
severity: blocker

### 2. Jurisdiction List with Correct OCD ID
expected: GET /api/ocd/view-royal/jurisdictions returns a jurisdiction with an OCD ID containing csd:5917047 (not empty csd:)
result: issue
reported: "Unreachable — same root cause as Test 1, /api/ocd/* not routed to Hono API"
severity: blocker

### 3. Organization List with Valid Jurisdiction Reference
expected: GET /api/ocd/view-royal/organizations returns paginated organizations, each with a jurisdiction_id containing csd:5917047
result: issue
reported: "Unreachable — same root cause as Test 1"
severity: blocker

### 4. Person List with Pagination
expected: GET /api/ocd/view-royal/people returns paginated people with OCD IDs. Adding ?page=2 returns a different page of results.
result: issue
reported: "Unreachable — same root cause as Test 1"
severity: blocker

### 5. Event List with Date Filtering
expected: GET /api/ocd/view-royal/events returns paginated meeting events. Adding ?after=2024-01-01&before=2024-12-31 filters to 2024 meetings only.
result: issue
reported: "Unreachable — same root cause as Test 1"
severity: blocker

### 6. Event Detail with Inline Agenda
expected: Pick any event OCD ID from the list and GET its detail URL. Response includes inline agenda array with agenda items, plus participants, media, and documents fields.
result: issue
reported: "Unreachable — same root cause as Test 1"
severity: blocker

### 7. Bill List and Detail with Actions
expected: GET /api/ocd/view-royal/bills returns paginated bills (matters). A bill detail includes an actions array (chronological agenda appearances) and sponsors array.
result: issue
reported: "Unreachable — same root cause as Test 1"
severity: blocker

### 8. Vote Detail with Roll Call
expected: GET /api/ocd/view-royal/votes then pick a vote detail. Response includes votes array (roll call entries with voter name and vote value) and counts array computed from roll call data.
result: issue
reported: "Unreachable — same root cause as Test 1"
severity: blocker

## Summary

total: 8
passed: 0
issues: 8
pending: 0
skipped: 0

## Gaps

- truth: "OCD endpoints are reachable at /api/ocd/:municipality/*"
  status: failed
  reason: "workers/app.ts only routes /api/v1/* to Hono API app. /api/ocd/* falls through to React Router which returns 404."
  severity: blocker
  test: 1
  root_cause: "workers/app.ts line 29 checks `url.pathname.startsWith('/api/v1/')` but OCD routes are at /api/ocd/*. The condition needs to also match /api/ocd/ paths."
  artifacts:
    - path: "apps/web/workers/app.ts"
      issue: "Line 29: routing condition only matches /api/v1/*, missing /api/ocd/*"
  missing:
    - "Add /api/ocd/ to the routing condition in workers/app.ts so requests are delegated to the Hono API app"
