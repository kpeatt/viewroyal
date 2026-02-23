# Phase 18: Documentation & Key Management - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

API consumers can discover endpoints through interactive documentation and manage their own API keys without operator intervention. Two deliverables: (1) OpenAPI 3.1 spec + Swagger UI for all public v1 and OCD endpoints, (2) self-service API key create/view/revoke page for authenticated users.

</domain>

<decisions>
## Implementation Decisions

### Docs page experience
- Standalone Swagger UI at `/api/v1/docs` — no site chrome, full-page Swagger
- Default Swagger theme — standard green, no custom branding
- Standard "Authorize" button for API key auth — user pastes their key to use "Try it out"
- Brief intro section at top with API overview and link to get an API key

### Key management UX
- Lives under settings/account section (e.g. `/settings/api-keys`)
- Inline reveal on key creation — new key appears in the list with copy button, highlighted until dismissed, with clear warning "Save this now — you won't see it again"
- No key names/labels — keys identified by prefix + creation date only (per requirement)
- Maximum 3 keys per user

### Spec organization
- Spec generated from code (decorators/annotations on route handlers), not a separate handwritten file

### Key display & security
- Key list shows prefix + creation date only (per requirement)
- Confirmation dialog before revoking: "Are you sure? This key will stop working immediately." with confirm/cancel
- Being logged in is sufficient to revoke — no re-authentication required

### Claude's Discretion
- Single spec vs separate specs for v1 and OCD endpoints
- Description/example detail level per endpoint — calibrate based on complexity
- Error response documentation strategy
- API key prefix format
- Exact key length and entropy

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 18-documentation-key-management*
*Context gathered: 2026-02-21*
