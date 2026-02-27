# Phase 26: Meeting Provenance - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Source availability badges with links and last-updated timestamps on meeting pages. Users see at a glance what sources a meeting was built from (Agenda, Minutes, Video) and can click through to the original CivicWeb PDF or Vimeo video. A "last updated" timestamp shows when data was most recently refreshed. This phase does NOT add new data sources, document linking, or content extraction — it surfaces what already exists.

</domain>

<decisions>
## Implementation Decisions

### Badge design & placement
- Pill badges with icons in the meeting detail page header area, near the title/date
- Each source type gets a distinct icon (e.g., FileText for Agenda, ClipboardList for Minutes, Video for Video)
- Unified neutral color scheme — all badges use the same muted color, not distinct colors per source
- The existing "Watch on Vimeo" button is replaced by the Video provenance badge — single entry point for video
- Badges also appear on the meetings list page (compact/icon form) so users can scan source availability before clicking in

### Source link behavior
- All badges link to original external sources — this is about showing what was used for extraction
- Agenda/Minutes badges link to the original CivicWeb PDF
- Video badge links to the Vimeo page
- All links open in a new tab with an external-link indicator icon on the badge
- Source URLs in the database need investigation — researcher should check what URLs the pipeline stores (video_url, archive paths, CivicWeb URLs)

### Last-updated display
- Relative time format ("3 days ago", "2 weeks ago") with exact date/time on hover tooltip
- Positioned near the provenance badges in the header area — groups all provenance info together
- Represents the last time the pipeline touched this meeting (updated_at from meetings table), not content-change tracking
- No special color coding or freshness indicators — just the plain relative timestamp

### Available vs missing sources
- Only show badges for available sources — hide badges for missing ones
- All meetings have video if they have a transcript (no transcript-only meetings exist)
- If a meeting has zero sources, show "No sources available" message rather than hiding the provenance area entirely
- Three possible badge types: Agenda, Minutes, Video

### Claude's Discretion
- Exact icon choices for each source type
- Badge sizing and spacing in header vs list page contexts
- Typography and layout of the "last updated" text
- How compact the badges render on the meetings list page

</decisions>

<specifics>
## Specific Ideas

- Provenance badges are about transparency — "showing what was used for extraction" (user's words)
- The Video badge fully replaces the current "Watch on Vimeo" button in the header — no duplicate entry points
- Meetings list page should let users scan source availability at a glance before drilling in

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 26-meeting-provenance*
*Context gathered: 2026-02-27*
