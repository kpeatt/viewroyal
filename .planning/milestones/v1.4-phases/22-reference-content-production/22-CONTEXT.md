# Phase 22: Reference Content & Production - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Author the remaining reference documentation pages (Data Model, OCD Standard Reference, Changelog, Contribution guide), deploy the complete docs site to docs.viewroyal.ai via Cloudflare Pages with Orama search indexing all pages, and auto-generated sidebar navigation. API Reference pages and Developer Guides already exist from Phases 20-21.

</domain>

<decisions>
## Implementation Decisions

### Data Model Page
- Frame entities in civic domain context: "A Meeting represents a council session. Agenda Items are the topics discussed..." — not pure technical documentation
- Mermaid ER diagram showing entity relationships (meetings, agenda items, motions, matters, bylaws, people, organizations)

### OCD Standard Reference
- Comparison table format for v1 vs OCD API decision guide (not flowchart or narrative)
- ViewRoyal-focused OCD coverage — explain OCD concepts only as they apply to ViewRoyal's API, link to OCD spec for deeper reading
- Use real ViewRoyal OCD IDs as examples (e.g., ocd-division/country:ca/province:bc/municipality:view_royal)
- Standalone entity mapping table showing v1 entities → OCD entities

### Changelog
- Follow Keep a Changelog format (keepachangelog.com): Added/Changed/Deprecated/Removed/Fixed sections per version
- Initial v1.0 entry at high-level summary (group by capability: meetings API, people API, search, OCD interop — not individual endpoints)
- Prominent version badge at top showing current API version (e.g., "Current: v1.0")

### Deployment & Search
- Deploy via Cloudflare Pages (not Workers) — purpose-built for static sites
- Auto-deploy on push via Cloudflare Pages GitHub integration
- Domain docs.viewroyal.ai needs setup (DNS + Cloudflare Pages custom domain configuration)
- Orama search indexes all documentation pages

### Sidebar Organization
- Top-level order: Getting Started → Guides → API Reference → Reference
- Getting Started broken out as its own top-level item for maximum onboarding visibility
- API Reference endpoints grouped by resource (Meetings, People, Motions, etc.) with collapsible groups
- OCD endpoints in separate section from v1 endpoints (not intermixed under same resource groups)
- All sidebar sections expanded by default

### Claude's Discretion
- ER diagram approach: single comprehensive vs grouped sub-diagrams
- Column detail level in ER diagram (relationships only vs key columns)
- Prose depth alongside diagram (brief descriptions vs diagram-only)
- Entity mapping placement (standalone table vs inline per endpoint)
- Search result presentation (grouped by type vs flat ranked list)
- Contribution guide scope (links-only vs lightweight workflow)

</decisions>

<specifics>
## Specific Ideas

- Data model should feel like domain documentation, not a database schema dump — a developer new to civic data should understand what each entity represents
- OCD examples should be real and copy-pasteable, not abstract patterns
- Changelog follows the widely-adopted keepachangelog.com standard

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 22-reference-content-production*
*Context gathered: 2026-02-24*
