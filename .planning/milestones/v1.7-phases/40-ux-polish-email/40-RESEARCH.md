# Phase 40: UX Polish + Email - Research

**Researched:** 2026-03-23
**Domain:** Email HTML templates (Deno Edge Function), React components (attendance info), Supabase JSONB config
**Confidence:** HIGH

## Summary

Phase 40 delivers meeting attendance info for upcoming meetings and a full redesign of both email templates (digest + pre-meeting). MTGX-03 (financial visibility) is already satisfied by the existing AgendaOverview component which shows DollarSign chips and expanded Financial Impact sections with funding source.

The existing email Edge Function (`supabase/functions/send-alerts/index.ts`, ~1045 lines) contains two HTML builder functions that will be completely rewritten: `buildDigestHtml()` (line 905) and `buildPreMeetingHtml()` (line 770). The orchestration logic (`handleDigest()`, `handlePreMeeting()`) and subscriber matching logic are solid and should be kept and extended. The pre-meeting template already has a hardcoded "Want to attend or watch?" section (line 868) that needs to be made data-driven.

For attendance info on the web, two components need changes: `upcoming-meeting-section.tsx` (home page) needs a brief snippet, and `meeting-detail.tsx` needs a full attendance info section for future meetings. Municipality-level defaults will be stored in the `municipalities.meta` JSONB column (already exists), with per-meeting overrides in `meetings.meta` JSONB (already exists).

**Primary recommendation:** Structure this as three plans: (1) attendance info data model + web display, (2) digest email redesign with summary-first layout + Ask AI CTA + upcoming meeting footer, (3) pre-meeting email redesign with full agenda + attendance details.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Financial Visibility (MTGX-03):** Already satisfied by existing implementation. No additional work needed.
- **Meeting Attendance Info (MTGX-04):** Default static attendance info stored in municipality config (`municipalities.meta`), with per-meeting overrides via `meetings.meta` JSONB. Displayed on home page upcoming meeting section (brief snippet) and meeting detail page (full details) -- only for upcoming/future meetings. Info: venue address with Google Maps link, Zoom livestream link (extracted from agenda), public input process, meeting start time.
- **Email Digest Redesign (MAIL-01):** Full redesign of both digest and pre-meeting templates. News digest style (Morning Brew/The Hustle). Summary-first content hierarchy. Enhanced "Why this matters to you" personalization. Prominent "Ask AI" CTA in digest only. Key decisions format at Claude's discretion.
- **Upcoming Meeting in Digest (MAIL-02):** Footer "Coming Up" section in digest. Separate pre-meeting reminder email redesign matching new visual language.
- **Pre-Meeting Email Redesign:** Full redesign, full agenda preview (all items), attendance details, subscription highlights with "Why this matters" notes, no Ask AI CTA.

### Claude's Discretion
- Key decisions format in digest email (cards vs compact list)
- Public input process text specificity (generic vs per-meeting-type)
- Exact email typography, spacing, color palette within news-digest style
- How to extract/store Zoom link from agenda data
- Pre-meeting email send timing (1 day vs 2 days before)
- Mobile breakpoint strategies for email rendering

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MTGX-03 | Agenda items with financial cost/funding data show it visually | Already implemented in AgendaOverview.tsx (DollarSign chip + Financial Impact expanded section). No work needed. |
| MTGX-04 | Upcoming meetings show attendance info (how to attend, location, public input process) | Municipality defaults in `municipalities.meta`, per-meeting overrides in `meetings.meta`. Two web components to update. |
| MAIL-01 | Email digest has improved mobile-friendly design with meeting summary at top | Full rewrite of `buildDigestHtml()` in Edge Function. Summary-first layout, news-digest style, personalization, Ask AI CTA. |
| MAIL-02 | Email includes upcoming meeting dates with attendance information | "Coming Up" footer section in digest + full pre-meeting email redesign via `buildPreMeetingHtml()`. |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Deno + Supabase Edge Functions | Latest | Email template building + sending | Already deployed, handles both digest and pre-meeting modes |
| Resend API | REST | Email delivery | Already integrated, supports HTML emails |
| React Router 7 + React 19 | Current | Web UI for attendance info | Existing stack |
| Tailwind CSS 4 | Current | Styling for attendance info components | Existing stack |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | Current | Icons (MapPin, Video, Clock, MessageSquare) | Attendance info display |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline HTML styles in email | MJML/email framework | Inline styles are the standard for email -- MJML adds build complexity with no benefit for a Deno Edge Function |
| Municipality meta JSONB | New `municipality_config` table | JSONB on existing table is simpler, no migration needed for new columns |

## Architecture Patterns

### Attendance Info Data Flow
```
municipalities.meta (defaults) + meetings.meta (overrides)
       |                              |
       v                              v
    merge at query time (meeting loader / email function)
       |
       v
  AttendanceInfo object { venue, address, mapsUrl, zoomLink, publicInputProcess, startTime }
```

### Pattern 1: Municipality Meta Defaults
**What:** Store default attendance info in `municipalities.meta` JSONB
**When to use:** All municipality-level defaults that rarely change
**Example:**
```typescript
// municipalities.meta structure
{
  "attendance_info": {
    "venue": "Council Chambers, View Royal Town Hall",
    "address": "45 View Royal Ave, Victoria, BC",
    "maps_url": "https://maps.google.com/?q=45+View+Royal+Ave+Victoria+BC",
    "public_input_process": "To speak during public comment, contact the municipal clerk at admin@viewroyal.ca",
    "public_hearing_process": "Written submissions accepted until 4pm on the hearing date. Speakers may register at the meeting.",
    "default_start_time": "19:00"
  }
}
```

### Pattern 2: Per-Meeting Meta Overrides
**What:** Override specific fields in `meetings.meta` JSONB for special meetings
**When to use:** When a meeting has a different venue, special Zoom link, or unique instructions
**Example:**
```typescript
// meetings.meta override (sparse -- only override what differs)
{
  "attendance_info": {
    "zoom_link": "https://us02web.zoom.us/j/12345678",
    "special_instructions": "Joint meeting with Esquimalt -- held at Esquimalt Municipal Hall"
  }
}
```

### Pattern 3: Merged Attendance Info Helper
**What:** Utility function that merges municipality defaults with meeting overrides
**When to use:** In both web loaders and email Edge Function
**Example:**
```typescript
interface AttendanceInfo {
  venue: string;
  address: string;
  mapsUrl: string;
  zoomLink?: string;
  publicInputProcess: string;
  startTime?: string;
  specialInstructions?: string;
}

function getAttendanceInfo(
  municipalityMeta: any,
  meetingMeta: any,
  meetingType?: string
): AttendanceInfo {
  const defaults = municipalityMeta?.attendance_info || {};
  const overrides = meetingMeta?.attendance_info || {};

  // Select process text based on meeting type
  const processKey = meetingType === 'Public Hearing'
    ? 'public_hearing_process'
    : 'public_input_process';

  return {
    venue: overrides.venue || defaults.venue,
    address: overrides.address || defaults.address,
    mapsUrl: overrides.maps_url || defaults.maps_url,
    zoomLink: overrides.zoom_link || defaults.zoom_link,
    publicInputProcess: overrides[processKey] || overrides.public_input_process || defaults[processKey] || defaults.public_input_process,
    startTime: overrides.start_time || defaults.default_start_time,
    specialInstructions: overrides.special_instructions,
  };
}
```

### Pattern 4: News-Digest Email Layout
**What:** Summary-first, text-forward HTML email layout
**When to use:** Both digest and pre-meeting templates
**Structure:**
```
[Header: ViewRoyal.ai branding — minimal]
[Meeting Title + Date + Type]
[2-3 sentence summary — THE LEAD]
[Personalization: "Why this matters to you" for matched items]
[Key Decisions section — compact or card format]
[Where Council Disagreed section]
[Who Was There]
[Ask AI CTA — digest only]
[Coming Up: Next Meeting — digest only]
[Footer: Unsubscribe + Manage]
```

### Anti-Patterns to Avoid
- **Heavy images in email:** Email clients strip/block images. Stay text-forward with colored borders/backgrounds for visual interest.
- **CSS classes in email:** Must use inline styles only. No `<style>` blocks (stripped by Gmail, Outlook).
- **Complex layouts with divs:** Use `<table>` for any side-by-side layout in email. Single-column works best for mobile.
- **Querying municipality data in the Edge Function separately:** Pass it through the digest payload or query once and cache.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email responsive layout | Custom media queries | Single-column max-width:600px with inline styles | Email client support for media queries is unreliable; single-column at 600px works everywhere |
| Currency formatting | String concatenation | `Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" })` | Already used in codebase, handles edge cases |
| Date formatting | Manual date strings | `toLocaleDateString("en-CA", options)` | Already used in both Edge Function and web app |
| Zoom link extraction | Complex regex | Simple substring match on agenda item text containing "zoom.us" | Zoom links have consistent URL patterns |

**Key insight:** Email HTML is fundamentally a solved problem -- use inline styles, tables for layout, keep it single-column, and test with Litmus/Email on Acid if needed. The redesign is about content hierarchy and copywriting, not technical complexity.

## Common Pitfalls

### Pitfall 1: Dark Mode Email Rendering
**What goes wrong:** Background colors invert in dark mode email clients (Apple Mail, Outlook.com), making text unreadable.
**Why it happens:** Email clients auto-invert colors when they detect light backgrounds.
**How to avoid:** Use transparent backgrounds where possible. For colored sections, ensure sufficient contrast in both light and dark modes. Avoid pure white (#ffffff) backgrounds on inner containers -- use very light grays (#f9fafb).
**Warning signs:** Colored badges become unreadable, text disappears against inverted backgrounds.

### Pitfall 2: Outlook Table Rendering
**What goes wrong:** Outlook desktop uses Word's rendering engine, which handles CSS differently.
**Why it happens:** Microsoft Word HTML renderer, not a browser engine.
**How to avoid:** Use `border-collapse: collapse` on tables, explicit widths, `cellpadding`/`cellspacing` attributes. Keep layouts simple.
**Warning signs:** Gaps between table cells, padding not applied.

### Pitfall 3: Missing Meeting Meta Data
**What goes wrong:** Attendance info displays "undefined" or blank when meeting meta is null.
**Why it happens:** New meetings won't have meta populated until someone adds it.
**How to avoid:** Always fall back to municipality defaults. Show nothing rather than incomplete data. Use optional chaining throughout.
**Warning signs:** Empty attendance sections on recently scraped meetings.

### Pitfall 4: Zoom Link Staleness
**What goes wrong:** Stored Zoom links become invalid for recurring meetings that rotate links.
**Why it happens:** Zoom meeting links change, but stored data doesn't auto-update.
**How to avoid:** Don't extract and store per-meeting Zoom links from agenda text unless they're clearly meeting-specific. Use the municipality default (YouTube livestream) as the primary link, with Zoom as an optional override only when explicitly set.
**Warning signs:** 404 Zoom pages, user complaints about dead links.

### Pitfall 5: Edge Function Deployment vs Local Testing
**What goes wrong:** Changes to the Edge Function don't take effect until deployed.
**Why it happens:** Edge Functions run in Supabase's Deno runtime, not locally.
**How to avoid:** Use `api.digest.tsx` route for payload testing. For HTML preview, build the HTML string locally and view in browser. Deploy with `supabase functions deploy send-alerts`.
**Warning signs:** Changes seem to have no effect -- forgot to deploy.

## Code Examples

### Existing Digest HTML Builder (to be replaced)
The current `buildDigestHtml()` at line 905 of `send-alerts/index.ts` is a single function returning a template literal. The new version should follow the same pattern but with restructured content hierarchy.

### Adding Attendance Info to Home Page Component
```typescript
// In upcoming-meeting-section.tsx -- add below the date line
// Only show if meeting has attendance info
{meeting.attendanceInfo && (
  <div className="flex items-center gap-4 text-xs text-zinc-500 mt-1">
    <span className="flex items-center gap-1">
      <MapPin className="h-3 w-3" />
      {meeting.attendanceInfo.venue}
    </span>
    {meeting.attendanceInfo.zoomLink && (
      <a href={meeting.attendanceInfo.zoomLink} className="flex items-center gap-1 text-blue-600 hover:underline">
        <Video className="h-3 w-3" />
        Watch online
      </a>
    )}
  </div>
)}
```

### Fetching Upcoming Meeting with Municipality Defaults
```typescript
// In getHomeData or meeting-detail loader
// Query municipality meta alongside meeting
const { data: municipality } = await supabase
  .from("municipalities")
  .select("meta")
  .eq("slug", "view-royal")
  .single();

// Merge for upcoming meeting
const attendanceInfo = getAttendanceInfo(
  municipality?.meta,
  upcomingMeeting?.meta,
  upcomingMeeting?.type
);
```

### News-Digest Email Summary Section
```html
<!-- Summary-first layout -- THE LEAD -->
<div style="margin-bottom:24px;">
  <p style="font-size:16px;line-height:1.6;color:#18181b;margin:0 0 16px;">
    ${digest.meeting.summary || `Council met on ${meetingDate} and made ${digest.key_decisions.length} decisions.`}
  </p>
</div>

<!-- Personalization callout -->
${highlights.size > 0 ? `
<div style="background:#eff6ff;border-left:4px solid #2563eb;padding:12px 16px;margin-bottom:24px;border-radius:0 8px 8px 0;">
  <p style="font-size:13px;color:#1e40af;margin:0;font-weight:600;">Why this matters to you</p>
  <p style="font-size:13px;color:#1e40af;margin:4px 0 0;">
    ${[...new Set([...highlights.values()].map(h => h.reason))].join(' &bull; ')}
  </p>
</div>` : ''}
```

### Coming Up Footer Section (Digest)
```html
<!-- Coming Up: Next Meeting -->
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-top:32px;">
  <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#166534;margin:0 0 8px;font-weight:700;">Coming Up</h3>
  <p style="font-size:14px;color:#18181b;margin:0 0 4px;font-weight:600;">${nextMeeting.title}</p>
  <p style="font-size:13px;color:#52525b;margin:0 0 8px;">${nextMeetingDate} &bull; ${nextMeetingTime}</p>
  <p style="font-size:13px;color:#52525b;margin:0;">
    ${attendanceInfo.venue} &bull;
    <a href="${attendanceInfo.mapsUrl}" style="color:#2563eb;">Get directions</a>
    ${attendanceInfo.zoomLink ? ` &bull; <a href="${attendanceInfo.zoomLink}" style="color:#2563eb;">Watch online</a>` : ''}
  </p>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded venue info in email template | Data-driven from municipality/meeting meta | This phase | Supports future multi-municipality |
| Generic "Items you follow" badge | "Why this matters to you" with specific subscription context | This phase | Better personalization, higher engagement |
| No meeting summary in digest | Summary-first layout | This phase | Subscribers get the gist without clicking through |
| No Ask AI CTA | Prominent Ask AI link in digest | This phase | Drives engagement with RAG feature |

## Open Questions

1. **Zoom link source**
   - What we know: View Royal's livestream is via Zoom (per CONTEXT.md discussion). The pre-meeting template currently hardcodes a YouTube link.
   - What's unclear: Whether Zoom links are consistent (same recurring link) or change per meeting. Whether they appear in agenda text.
   - Recommendation: Store a default Zoom/YouTube link in municipality meta. Allow per-meeting override in meetings.meta. Don't auto-extract from agenda text initially -- too fragile.

2. **Next meeting query for digest footer**
   - What we know: The digest is sent after a meeting. We need to query the next upcoming meeting for the "Coming Up" footer.
   - What's unclear: Whether there's always a next meeting in the database.
   - Recommendation: Query `meetings` table for the next meeting with `meeting_date > today` ordered by date. If none found, omit the footer section gracefully.

3. **Municipality meta seeding**
   - What we know: The `municipalities.meta` JSONB column exists. The current View Royal row likely has no `attendance_info` key.
   - What's unclear: Whether to seed via migration or manual SQL.
   - Recommendation: Include a SQL statement in the plan to seed View Royal's attendance info defaults. Can be run manually or as a migration.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (web app), manual testing (Edge Function) |
| Config file | `apps/web/vitest.config.ts` (if exists, else Wave 0) |
| Quick run command | `cd apps/web && pnpm typecheck` |
| Full suite command | `cd apps/web && pnpm typecheck && cd ../../supabase && supabase functions deploy send-alerts` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MTGX-03 | Financial data displayed on agenda items | manual-only | Visual check on meeting detail page | N/A -- already implemented |
| MTGX-04 | Attendance info on upcoming meetings | smoke | Visit home page + meeting detail for upcoming meeting | No automated test |
| MAIL-01 | Redesigned digest email | manual-only | `curl /api/digest?meeting_id=X` then inspect HTML | No automated test |
| MAIL-02 | Upcoming meeting in digest + pre-meeting redesign | manual-only | Trigger Edge Function, inspect received email | No automated test |

### Sampling Rate
- **Per task commit:** `cd apps/web && pnpm typecheck`
- **Per wave merge:** Full typecheck + visual inspection of email HTML output
- **Phase gate:** Deploy Edge Function, trigger test email, verify on mobile

### Wave 0 Gaps
- [ ] SQL seed for `municipalities.meta.attendance_info` defaults for View Royal
- [ ] No automated email rendering tests (acceptable -- email HTML testing requires visual inspection)

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of `supabase/functions/send-alerts/index.ts` (full 1045-line file)
- Direct codebase inspection of `apps/web/app/components/home/upcoming-meeting-section.tsx`
- Direct codebase inspection of `apps/web/app/components/meeting/AgendaOverview.tsx` (financial display confirmed)
- Direct codebase inspection of `apps/web/app/routes/meeting-detail.tsx`, `home.tsx`, `api.digest.tsx`
- Direct codebase inspection of `sql/bootstrap.sql` (meetings.meta, municipalities via types.ts)
- Direct codebase inspection of `apps/web/app/services/municipality.ts` (meta column already queried)

### Secondary (MEDIUM confidence)
- Email HTML best practices (inline styles, single-column, table layout) -- well-established industry standards
- Morning Brew / The Hustle email design patterns -- referenced in CONTEXT.md as design inspiration

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all existing infrastructure, no new libraries needed
- Architecture: HIGH - JSONB meta pattern already exists in codebase, just needs data + consumers
- Pitfalls: HIGH - email HTML pitfalls are well-documented, codebase patterns are clear
- Email redesign: MEDIUM - design quality depends on implementation, patterns are clear but aesthetics need iteration

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable domain, no external dependency changes expected)
