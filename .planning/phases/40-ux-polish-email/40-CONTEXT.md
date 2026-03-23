# Phase 40: UX Polish + Email - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Meeting attendance info for upcoming meetings and full email redesign (digest + pre-meeting). Financial transparency (MTGX-03) is already satisfied by existing AgendaOverview implementation. This phase delivers MTGX-04, MAIL-01, and MAIL-02.

</domain>

<decisions>
## Implementation Decisions

### Financial Visibility (MTGX-03)
- Already satisfied by existing implementation: DollarSign chip in agenda item metadata, expanded "Financial Impact" section with funding source in AgendaOverview
- No additional work needed

### Meeting Attendance Info (MTGX-04)
- Default static attendance info stored in municipality config (municipalities table or source_config), with per-meeting overrides via the existing `meta` JSONB column on meetings
- Displayed on home page upcoming meeting section (brief snippet: address + Zoom link) and meeting detail page (full details) — only for upcoming/future meetings
- Info to show: venue address with Google Maps link, Zoom livestream link (extracted from agenda), public input process, meeting start time
- View Royal's livestream is a Zoom link found in the agenda, not Vimeo
- Public input process text: Claude decides appropriate level of specificity based on what View Royal publishes (may vary by meeting type like Public Hearings)

### Email Digest Redesign (MAIL-01)
- Full redesign of both digest (post-meeting) and pre-meeting email templates
- News digest style: clean, text-forward like Morning Brew/The Hustle — minimal graphics, good typography, scannable sections with clear headers
- Summary-first content hierarchy: lead with 2-3 sentence meeting summary so subscribers get the gist immediately
- Enhanced personalization: "Why this matters to you" notes for items matching subscriber's topics/matters/neighbourhood (beyond current badge highlighting)
- Prominent "Ask AI" CTA linking to search page with meeting context, encouraging follow-up questions
- Key decisions format: Claude's discretion (card-per-decision or compact list, optimized for mobile news-digest style)

### Upcoming Meeting in Digest (MAIL-02)
- Footer "Coming Up" section in post-meeting digest with next meeting date, time, venue, Zoom link
- Separate pre-meeting reminder email (pre-meeting mode already exists in Edge Function) sent before upcoming meetings

### Pre-Meeting Email Redesign
- Full redesign treatment matching the new digest visual language
- Content: full agenda preview (all items, not just subscription matches), attendance details (venue, Zoom, public input process, time), subscription highlights with enhanced "Why this matters" notes
- No Ask AI CTA in pre-meeting email

### Claude's Discretion
- Key decisions format in digest email (cards vs compact list)
- Public input process text specificity (generic vs per-meeting-type)
- Exact email typography, spacing, color palette within news-digest style
- How to extract/store Zoom link from agenda data
- Pre-meeting email send timing (1 day vs 2 days before)
- Mobile breakpoint strategies for email rendering

</decisions>

<specifics>
## Specific Ideas

- News digest inspiration: Morning Brew / The Hustle — scannable, text-forward, clear section headers
- Zoom link is in the agenda (not Vimeo) for View Royal meetings — need to figure out extraction
- "Why this matters to you" personalization notes tied to subscription type (e.g., "You follow Housing", "You follow Bylaw 123")
- Prominent Ask AI CTA in digest: "Have questions about this meeting? Ask our AI" with link to search page

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `supabase/functions/send-alerts/index.ts`: Complete email Edge Function with digest + pre-meeting modes, Resend integration, subscriber matching logic, HTML template builders
- `buildDigestHtml()` (line ~905): Current digest template — replace entirely
- `buildPreMeetingHtml()` (line ~770): Current pre-meeting template — replace entirely
- `handleDigest()` / `handlePreMeeting()`: Orchestration logic for fetching data and matching subscribers — keep and extend
- `DigestPayload` interface: Already includes `financial_cost`, `neighborhood`, `related_address`, `attendance` — extend with upcoming meeting info
- `upcoming-meeting-section.tsx`: Home page upcoming meeting component — add attendance info snippet
- `meeting-detail.tsx`: Meeting detail route — add attendance info section for upcoming meetings
- `municipalities` table with `source_config` JSONB: Can store default attendance info (address, Zoom template, public input text)
- `meetings.meta` JSONB column: Can store per-meeting overrides (specific Zoom link, special instructions)

### Established Patterns
- Inline HTML styles in email templates (required for email client compatibility)
- Resend API for email delivery via Edge Function
- `build_meeting_digest` RPC for fetching structured digest data
- `find_meeting_subscribers` RPC for subscriber matching
- Subscription matching: matter_id, category/topic, geo/neighbourhood, keyword RPC
- Canadian currency formatting: `Intl.NumberFormat("en-CA", ...)`

### Integration Points
- Email Edge Function invoked by scheduled pipeline or manual trigger
- `api.digest.tsx` route for preview/testing digest payload
- Municipality config for default attendance info
- Agenda item data for Zoom link extraction
- Meeting detail page loader for attendance info display

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 40-ux-polish-email*
*Context gathered: 2026-03-23*
