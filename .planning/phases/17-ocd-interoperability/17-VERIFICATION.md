---
phase: 17-ocd-interoperability
verified: 2026-02-21T22:00:00Z
status: gaps_found
score: 3/4 must-haves verified
re_verification: false
gaps:
  - truth: "An API consumer can list and retrieve OCD Jurisdiction, Organization, Person, Event, Bill, and Vote entities at /api/ocd/* with fields conforming to the OCD spec"
    status: partial
    reason: "Jurisdiction and Organization endpoints query ocd_divisions with .eq('municipality_id', muni.id) but the ocd_divisions table has no municipality_id column — the division lookup silently returns empty, causing divisionId to default to '' and rendering the jurisdiction OCD ID malformed (ocd-jurisdiction/country:ca/csd:/government)"
    artifacts:
      - path: "apps/web/app/api/ocd/endpoints/jurisdictions.ts"
        issue: "Lines 44 and 85 filter ocd_divisions by municipality_id which does not exist on that table"
      - path: "apps/web/app/api/ocd/endpoints/organizations.ts"
        issue: "Lines 37 and 93 filter ocd_divisions by municipality_id which does not exist on that table"
      - path: "supabase/migrations/fix_municipality_ocd_id_and_add_divisions.sql"
        issue: "Creates ocd_divisions with columns (id, division_id, name, country, csd_code, created_at) — no municipality_id column"
    missing:
      - "Add municipality_id column to ocd_divisions table via migration (ALTER TABLE ocd_divisions ADD COLUMN municipality_id bigint REFERENCES municipalities(id)) and update the INSERT to include municipality_id"
      - "OR change the endpoint queries to look up division by csd_code derived from the municipality's ocd_id column instead of filtering by municipality_id"
  - truth: "REQUIREMENTS.md reflects phase 17 completion for OCD-04, OCD-05, OCD-06"
    status: failed
    reason: "REQUIREMENTS.md still marks OCD-04, OCD-05, OCD-06 as [ ] (unchecked) and the requirements table shows them as 'Pending' despite the code being fully implemented in plan 03"
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "Lines 46-48 show OCD-04, OCD-05, OCD-06 as unchecked; lines 113-115 show them as Pending"
    missing:
      - "Update .planning/REQUIREMENTS.md to mark OCD-04, OCD-05, OCD-06 as [x] complete and change status from Pending to Complete in the requirements table"
---

# Phase 17: OCD Interoperability Verification Report

**Phase Goal:** Civic tech tools and researchers can consume View Royal council data through standardized Open Civic Data endpoints
**Verified:** 2026-02-21T22:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | API consumer can list/retrieve OCD Jurisdiction, Organization, Person, Event, Bill, Vote at /api/ocd/* with spec-conforming fields | PARTIAL | All 12 endpoints exist and are registered; Event/Bill/Vote fully functional. Jurisdiction/Organization division lookup broken by missing municipality_id column on ocd_divisions table |
| 2  | All OCD entities include valid OCD IDs (deterministic division-based for jurisdictions, UUID-based for people/orgs/events/bills/votes) | PARTIAL | UUID v5 generation is correct and deterministic. However, jurisdiction IDs depend on the divisionId lookup which returns empty due to the missing column — resulting in malformed jurisdiction IDs at runtime |
| 3  | OCD list endpoints use page-based pagination matching OpenStates convention (page + per_page) | VERIFIED | pagination.ts correctly implements page/per_page with defaults (1/20), max 100, Math.max(1, ceil(total/perPage)) for max_page; all list endpoints call parsePaginationParams + computePagination + ocdListResponse |
| 4  | OCD entity fields map correctly from existing DB models (meetings->Events with agenda/media, matters->Bills with actions/sponsors) | VERIFIED | Event serializer maps agenda items inline, participants from attendance, media from video_url. Bill serializer maps action timeline from agenda item appearances, sponsors from motion movers (deduplicated). Vote serializer computes vote_counts from actual roll_call records with fallback to summary columns |

**Score:** 2/4 truths fully verified (3 partially pass automated checks but truth 1 and 2 have a blocking runtime defect for jurisdiction-type entities)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/app/api/ocd/lib/ocd-ids.ts` | UUID v5 generation and OCD ID formatting for all entity types | VERIFIED | 157 lines; exports uuidV5, ocdPersonId, ocdOrganizationId, ocdEventId, ocdBillId, ocdVoteId, ocdDivisionId, ocdJurisdictionId, ocdIds batch helper; uses crypto.subtle.digest |
| `apps/web/app/api/ocd/lib/pagination.ts` | Page-based pagination utilities for OCD list endpoints | VERIFIED | 69 lines; exports parsePaginationParams, computePagination, OcdPagination interface; correct clamping and max_page |
| `apps/web/app/api/ocd/lib/ocd-envelope.ts` | OpenStates-style response envelope builder | VERIFIED | 36 lines; exports ocdListResponse (results+pagination) and ocdDetailResponse (direct entity) |
| `apps/web/app/api/ocd/router.ts` | OCD sub-router with municipality middleware and all route registrations | VERIFIED | 65 lines; imports all 6 endpoint pairs; registers 12 routes + discovery endpoint; municipality middleware applied; no auth/rate-limit |
| `apps/web/app/api/ocd/serializers/jurisdiction.ts` | Municipality to OCD Jurisdiction mapping | VERIFIED | Exports serializeJurisdiction; all spec fields present; uses ocdJurisdictionId (sync) |
| `apps/web/app/api/ocd/serializers/organization.ts` | Organization to OCD Organization mapping | VERIFIED | Exports serializeOrganizationSummary, serializeOrganizationDetail, mapClassification; posts from memberships; correct Council/Committee/Board mapping |
| `apps/web/app/api/ocd/serializers/person.ts` | Person to OCD Person mapping | VERIFIED | Exports serializePersonSummary, serializePersonDetail; email -> contact_details; memberships with org OCD IDs |
| `apps/web/app/api/ocd/endpoints/jurisdictions.ts` | Jurisdiction list and detail handlers | STUB-WIRED | Code is real (133 lines), correctly imports and uses serializeJurisdiction. But runtime broken: queries ocd_divisions with non-existent municipality_id column |
| `apps/web/app/api/ocd/endpoints/organizations.ts` | Organization list and detail handlers | STUB-WIRED | Code is real (155 lines), paginated list, reverse-lookup detail. Same ocd_divisions/municipality_id defect affects jurisdiction ID computation |
| `apps/web/app/api/ocd/endpoints/people.ts` | People list and detail handlers | VERIFIED | 180 lines; deduplication via Set; memberships join for municipality scoping; full reverse-lookup detail |
| `apps/web/app/api/ocd/serializers/event.ts` | Meeting to OCD Event mapping with agenda, participants, media | VERIFIED | 196 lines; exports serializeEventSummary, serializeEventDetail; inline agenda, participants from attendance, media from video_url, documents from PDF URLs |
| `apps/web/app/api/ocd/serializers/bill.ts` | Matter to OCD Bill mapping with actions and sponsors | VERIFIED | 143 lines; exports serializeBillSummary, serializeBillDetail; action timeline from agenda item appearances sorted chronologically; sponsors deduplicated by name |
| `apps/web/app/api/ocd/serializers/vote.ts` | Motion to OCD Vote mapping with vote_counts and roll_call | VERIFIED | 205 lines; exports serializeVoteSummary, serializeVoteDetail, mapResultToPassed, mapVoteValue; vote_counts computed from roll call data with summary column fallback |
| `apps/web/app/api/ocd/endpoints/events.ts` | Event list and detail handlers | VERIFIED | 155 lines; before/after date filters; inline agenda+participants in detail |
| `apps/web/app/api/ocd/endpoints/bills.ts` | Bill list and detail handlers | VERIFIED | 194 lines; status and updated_since filters; full action history + sponsors in detail |
| `apps/web/app/api/ocd/endpoints/votes.ts` | Vote list and detail handlers | VERIFIED | 220 lines; before/after date filters; roll call + vote_counts in detail; bill linkage via agenda_item.matter_id |
| `supabase/migrations/fix_municipality_ocd_id_and_add_divisions.sql` | Migration: divisions table + municipality fix | PARTIAL | Creates ocd_divisions table with correct structure. Correctly fixes municipality ocd_id from 5917034 to 5917047. MISSING: municipality_id column on ocd_divisions |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `apps/web/app/api/index.ts` | `apps/web/app/api/ocd/router.ts` | `app.route('/api/ocd', ocdApp)` | WIRED | Line 146: `app.route("/api/ocd", ocdApp)` — confirmed |
| `apps/web/app/api/ocd/endpoints/jurisdictions.ts` | `apps/web/app/api/ocd/serializers/jurisdiction.ts` | import serializeJurisdiction | WIRED | Line 17 imports serializeJurisdiction; used on lines 60 and 126 |
| `apps/web/app/api/ocd/serializers/person.ts` | `apps/web/app/api/ocd/lib/ocd-ids.ts` | import ocdPersonId for ID generation | NOT_WIRED | person.ts does NOT import ocdPersonId — person IDs are pre-computed by the endpoint and passed in as ocdId parameter. This is correct by design (batch pattern) but the key_link pattern as written is not present |
| `apps/web/app/api/ocd/lib/ocd-ids.ts` | `crypto.subtle.digest` | Web Crypto SHA-1 for UUID v5 | WIRED | Line 60: `crypto.subtle.digest("SHA-1", data)` |
| `apps/web/app/api/ocd/lib/pagination.ts` | Supabase select with count | offset/limit pagination | WIRED | All list endpoints use `.range(offset, offset + perPage - 1)` with `{ count: "exact" }` |
| `apps/web/app/api/ocd/endpoints/events.ts` | `apps/web/app/api/ocd/serializers/event.ts` | import serializeEventDetail | WIRED | Lines 19-21 import serializeEventSummary and serializeEventDetail; both used |
| `apps/web/app/api/ocd/serializers/vote.ts` | votes table | Roll call from individual votes | WIRED | getVote endpoint queries `votes` table with `motion_id` filter; passed to serializeVoteDetail.related.individualVotes |
| `apps/web/app/api/ocd/serializers/bill.ts` | agenda_items + motions | Actions from agenda items, sponsors from motion movers | WIRED | getBill fetches agenda_items by matter_id and motions by agenda_item_id; both passed to serializeBillDetail |
| `apps/web/app/api/ocd/router.ts` | `apps/web/app/api/ocd/endpoints/events.ts` | Route registration for events, bills, votes | WIRED | Lines 54-63 register all 6 routes: listEvents, getEvent, listBills, getBill, listVotes, getVote |
| `apps/web/app/api/ocd/endpoints/jurisdictions.ts` | `ocd_divisions` table | Division ID lookup by municipality_id | NOT_WIRED | Queries `.eq("municipality_id", muni.id)` but ocd_divisions has no municipality_id column — lookup returns empty at runtime |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| OCD-01 | 17-02 | API consumer can list/get OCD Jurisdiction objects mapped from municipalities | PARTIAL | Endpoint and serializer exist. Division lookup defect means jurisdiction OCD ID will be malformed at runtime |
| OCD-02 | 17-02 | API consumer can list/get OCD Organization objects mapped from organizations | PARTIAL | Endpoint and serializer exist, functional. Same division lookup defect affects jurisdictionId passed to serializer |
| OCD-03 | 17-02 | API consumer can list/get OCD Person objects mapped from people | SATISFIED | People endpoint doesn't use ocd_divisions; fully functional |
| OCD-04 | 17-03 | API consumer can list/get OCD Event objects mapped from meetings (with agenda, participants, media) | SATISFIED | Events endpoint + serializer fully functional; agenda items inline, participants from attendance, media from video_url |
| OCD-05 | 17-03 | API consumer can list/get OCD Bill objects mapped from matters (with actions, sponsors) | SATISFIED | Bills endpoint + serializer fully functional; action timeline + sponsors from motion movers |
| OCD-06 | 17-03 | API consumer can list/get OCD Vote objects mapped from motions (with roll call) | SATISFIED | Votes endpoint + serializer fully functional; roll call from individual votes table, vote_counts computed |
| OCD-07 | 17-01 | OCD endpoints use page-based pagination matching the OpenStates convention | SATISFIED | parsePaginationParams + computePagination implement page/per_page/max_page/total_items correctly |
| OCD-08 | 17-01 | All OCD entities include valid OCD IDs (deterministic for jurisdictions/divisions, UUID-based for others) | PARTIAL | UUID v5 generation is correct. Jurisdiction IDs are deterministic from CSD code but the CSD code lookup fails at runtime due to missing municipality_id column |

**Orphaned requirements:** OCD-04, OCD-05, OCD-06 are marked as `[ ]` incomplete and "Pending" in `.planning/REQUIREMENTS.md` despite being fully implemented. This is a documentation staleness issue, not a code gap.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `apps/web/app/api/ocd/endpoints/jurisdictions.ts` | `.eq("municipality_id", muni.id)` on ocd_divisions (column does not exist) | BLOCKER | Runtime failure: division lookup returns empty, divisionId defaults to "", jurisdiction OCD ID becomes "ocd-jurisdiction/country:ca/csd:/government" |
| `apps/web/app/api/ocd/endpoints/organizations.ts` | `.eq("municipality_id", muni.id)` on ocd_divisions (column does not exist) | BLOCKER | Same as above — jurisdictionId passed to organization serializer will be malformed |
| `.planning/REQUIREMENTS.md` | OCD-04, OCD-05, OCD-06 marked Pending when code is complete | WARNING | Documentation inconsistency; does not block code functionality |

### Human Verification Required

None — all checks are automated/code-based. The division lookup defect is definitively verifiable by comparing the migration schema (no municipality_id) to the endpoint queries (filter by municipality_id).

### Gaps Summary

**Root cause:** One shared defect affects two entity types (Jurisdiction, Organization). The `ocd_divisions` reference table was created without a `municipality_id` foreign key column, but the endpoint code that looks up the division ID filters by `municipality_id`. At runtime, Supabase/PostgREST will return empty results for the division query (or an error), causing `divisionId` to fall through to the default of `""`. This produces malformed jurisdiction IDs like `ocd-jurisdiction/country:ca/csd:/government` instead of the correct `ocd-jurisdiction/country:ca/csd:5917047/government`.

The fix is either:
1. Add a `municipality_id` column to `ocd_divisions` (migration + data update), or
2. Change the endpoint queries to derive the division by matching against the municipality's `ocd_id` column directly (e.g., `.eq("csd_code", municipality.ocd_id.match(/csd:(\d+)/)[1])`)

The four other entity types (Person, Event, Bill, Vote) do not use `ocd_divisions` and are fully functional.

The REQUIREMENTS.md staleness (OCD-04/05/06 marked Pending) is a documentation gap introduced when Plan 03's work was not reflected back into REQUIREMENTS.md.

---

_Verified: 2026-02-21T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
