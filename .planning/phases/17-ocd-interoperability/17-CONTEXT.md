# Phase 17: OCD Interoperability - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Expose View Royal council data through standardized Open Civic Data (OCD) API endpoints at `/api/ocd/*`. Covers Jurisdiction, Organization, Person, Event, Bill, and Vote entities. Consumers are civic tech tools and researchers. This phase builds the OCD layer on top of existing data — no new data ingestion or UI changes.

</domain>

<decisions>
## Implementation Decisions

### Entity mapping strategy
- Full list endpoints for all entities, including Jurisdiction and Organization (even though View Royal only has one of each) — spec-compliant and future-proof if committees are added
- Events, Bills, Votes, Persons all map from existing DB models (meetings, matters, motions, people)

### OCD ID generation
- Use a reference/divisions table to store OCD division strings (not hardcoded config) — maps jurisdictions to their OCD division paths
- Use the official StatsCan Census Subdivision code for View Royal (not a human-readable slug) — proper interop with other OCD datasets
- Derive entity OCD IDs deterministically from existing database UUIDs (e.g., `ocd-person/{existing-uuid}`) — no separate mapping table, no new UUIDs
- Format: `ocd-{entity_type}/{uuid}` using existing primary keys

### Response fidelity
- Include all OCD spec fields in responses, even when empty (as null) — consumers can rely on a consistent shape
- Strict spec compliance only — no `extras` field for View Royal-specific data (no Vimeo links, transcripts, or AI summaries in OCD responses)
- Match OpenStates response structure for list endpoints — practical interop with the main OCD consumer ecosystem

### Endpoint scope & discoverability
- Fully public endpoints — no authentication required, maximizing accessibility for civic tech consumers
- Wide open CORS headers — allow all origins so browser-based tools can call directly
- Rate limiting and root discovery endpoint at Claude's discretion

### Claude's Discretion
- Agenda items nesting strategy in Event responses (inline vs linked)
- Bill action history scope (full history vs key actions only)
- Vote roll call handling when data is missing (omit vs placeholder)
- OCD ID storage approach (computed at query time vs stored column)
- Filtering support on list endpoints (none vs basic date/status filters)
- Rate limiting strategy (shared with Phase 16, separate, or none)
- Root discovery endpoint at `/api/ocd/` (include or skip)

</decisions>

<specifics>
## Specific Ideas

- Response format should match OpenStates conventions since they're the primary OCD consumer ecosystem
- Division codes should use real StatsCan CSD codes for proper interoperability with Canadian civic data datasets
- All OCD spec fields present in responses (null when empty) so consumers get a predictable shape

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-ocd-interoperability*
*Context gathered: 2026-02-21*
