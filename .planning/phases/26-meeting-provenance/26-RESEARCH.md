# Phase 26: Meeting Provenance - Research

**Researched:** 2026-02-27
**Domain:** Frontend UI (badges, links, timestamps) + minor DB schema change
**Confidence:** HIGH

## Summary

This phase adds provenance badges (Agenda, Minutes, Video) and a "last updated" timestamp to the meeting detail and meetings list pages. The implementation is straightforward frontend work with one database prerequisite: adding an `updated_at` column to the `meetings` table.

The critical finding is that source URLs (`agenda_url`, `minutes_url`) are almost entirely unpopulated in the database. Only 3 of 712 meetings with agendas have an `agenda_url`, and 0 of 688 meetings with minutes have a `minutes_url`. Video URLs are well-populated (202 of 200 transcribed meetings). This means Agenda and Minutes badges will need to be non-clickable for the vast majority of historical meetings -- they indicate the source exists but cannot link to the original CivicWeb PDF. The badges should still render to show what sources were used for extraction.

The `updated_at` column does NOT exist on the `meetings` table despite appearing in `bootstrap.sql`. A migration is required to add it with a trigger.

**Primary recommendation:** Add `updated_at` column via migration, build a `ProvenanceBadges` component that conditionally links badges when URLs exist, and write a simple `formatRelativeTime` utility for the timestamp display.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Pill badges with icons in the meeting detail page header area, near the title/date
- Each source type gets a distinct icon (e.g., FileText for Agenda, ClipboardList for Minutes, Video for Video)
- Unified neutral color scheme -- all badges use the same muted color, not distinct colors per source
- The existing "Watch on Vimeo" button is replaced by the Video provenance badge -- single entry point for video
- Badges also appear on the meetings list page (compact/icon form) so users can scan source availability before clicking in
- All badges link to original external sources -- this is about showing what was used for extraction
- Agenda/Minutes badges link to the original CivicWeb PDF
- Video badge links to the Vimeo page
- All links open in a new tab with an external-link indicator icon on the badge
- Source URLs in the database need investigation (DONE -- see findings below)
- Relative time format ("3 days ago", "2 weeks ago") with exact date/time on hover tooltip
- Positioned near the provenance badges in the header area
- Represents the last time the pipeline touched this meeting (updated_at from meetings table)
- No special color coding or freshness indicators
- Only show badges for available sources -- hide badges for missing ones
- All meetings have video if they have a transcript
- If a meeting has zero sources, show "No sources available" message
- Three possible badge types: Agenda, Minutes, Video

### Claude's Discretion
- Exact icon choices for each source type
- Badge sizing and spacing in header vs list page contexts
- Typography and layout of the "last updated" text
- How compact the badges render on the meetings list page

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROV-01 | User sees source badges (Agenda, Minutes, Video) on the meeting overview indicating which original sources were used | Badge component uses `has_agenda`, `has_minutes`, `has_transcript` booleans from meetings table. Icons from lucide-react. Unified neutral styling. |
| PROV-02 | User can click provenance badges to navigate to the original source (CivicWeb PDF, Vimeo video) | `agenda_url` (3 populated), `minutes_url` (0 populated), `video_url` (202 populated). Badges link when URL exists, are non-clickable when URL is null. |
| PROV-03 | User sees when the meeting data was last updated | Requires adding `updated_at` column to meetings table via migration. Simple `formatRelativeTime` utility with title tooltip for exact date. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lucide-react | 0.562.0 | Icons for badge types | Already installed, project standard |
| tailwindcss | 4.x | Badge styling | Project standard |
| React Router 7 | 7.12.0 | Link components | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-separator | 1.1.8 | Visual separators | Already used in meeting header |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `formatRelativeTime` | `date-fns` or `timeago.js` | Adding a dependency for one function is overkill. A 20-line utility handles all needed cases. |
| Separate component file | Inline in meeting-detail.tsx | Component is reused on meetings list page too, so separate file is better. |

**Installation:**
No new packages needed. Everything required is already installed.

## Architecture Patterns

### Recommended Project Structure
```
apps/web/app/
├── components/
│   └── meeting/
│       └── ProvenanceBadges.tsx   # New component (reusable)
├── lib/
│   └── utils.ts                   # Add formatRelativeTime here
├── routes/
│   ├── meeting-detail.tsx         # Modify header section
│   └── meetings.tsx               # Passes data to MeetingCard
├── components/
│   └── meeting-card.tsx           # Add compact badges
└── services/
    └── meetings.ts                # Add updated_at to select strings
```

### Pattern 1: Provenance Badge Component
**What:** A reusable `ProvenanceBadges` component that renders source badges based on meeting data.
**When to use:** On meeting detail header and meetings list cards.
**Example:**
```typescript
// apps/web/app/components/meeting/ProvenanceBadges.tsx
import { FileText, ClipboardList, Video, ExternalLink } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Meeting } from "../../lib/types";

interface ProvenanceBadgesProps {
  meeting: Meeting;
  compact?: boolean; // For meetings list page
}

export function ProvenanceBadges({ meeting, compact = false }: ProvenanceBadgesProps) {
  const sources = [
    {
      key: "agenda",
      label: "Agenda",
      icon: FileText,
      available: meeting.has_agenda,
      url: meeting.agenda_url,
    },
    {
      key: "minutes",
      label: "Minutes",
      icon: ClipboardList,
      available: meeting.has_minutes,
      url: meeting.minutes_url,
    },
    {
      key: "video",
      label: "Video",
      icon: Video,
      available: meeting.has_transcript,
      url: meeting.video_url,
    },
  ];

  const availableSources = sources.filter((s) => s.available);

  if (availableSources.length === 0) {
    return <span className="text-sm text-zinc-400">No sources available</span>;
  }

  return (
    <div className="flex items-center gap-2">
      {availableSources.map((source) => {
        const Icon = source.icon;
        const badge = (
          <span
            key={source.key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 text-zinc-600",
              compact ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
              source.url && "hover:bg-zinc-100 hover:border-zinc-300 transition-colors"
            )}
          >
            <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            {!compact && source.label}
            {source.url && <ExternalLink className="h-3 w-3 text-zinc-400" />}
          </span>
        );

        if (source.url) {
          return (
            <a
              key={source.key}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {badge}
            </a>
          );
        }
        return badge;
      })}
    </div>
  );
}
```

### Pattern 2: Relative Time with Tooltip
**What:** Render "3 days ago" with hover showing exact timestamp.
**When to use:** For the `updated_at` display.
**Example:**
```typescript
// Add to apps/web/app/lib/utils.ts
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks !== 1 ? "s" : ""} ago`;
  return `${diffMonths} month${diffMonths !== 1 ? "s" : ""} ago`;
}
```

### Pattern 3: Meeting Detail Header Integration
**What:** Place provenance badges and "last updated" in the header area next to date/org info.
**When to use:** In meeting-detail.tsx header section.
**Example:**
```tsx
{/* In the header, below the existing date/org line */}
<div className="flex flex-wrap items-center gap-3 mt-3">
  <ProvenanceBadges meeting={meeting} />
  {meeting.updated_at && (
    <>
      <Separator orientation="vertical" className="h-4" />
      <span
        className="text-xs text-zinc-400"
        title={new Date(meeting.updated_at).toLocaleString()}
      >
        Updated {formatRelativeTime(meeting.updated_at)}
      </span>
    </>
  )}
</div>
```

### Anti-Patterns to Avoid
- **Fetching source URLs separately:** All needed data (`has_agenda`, `has_minutes`, `has_transcript`, `agenda_url`, `minutes_url`, `video_url`) is already in the meetings query. No additional queries needed.
- **Color-coding badges per source type:** User explicitly decided on unified neutral color scheme. Do not use distinct colors.
- **Showing ghost/disabled badges for missing sources:** User decided to only show badges for available sources. Hide missing ones entirely.
- **Using `created_at` as proxy for "last updated":** User wants actual pipeline refresh time. Must use `updated_at` (which needs to be added).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Relative time formatting | Complex i18n-aware library | Simple 20-line utility in utils.ts | Only English needed, only a few time buckets, no edge cases worth a dependency |
| Badge component system | Generic badge framework | Purpose-built `ProvenanceBadges` component | Only 3 badge types, very specific behavior |

**Key insight:** This phase is simple enough that no external libraries are needed. The complexity is in the data availability, not the UI implementation.

## Common Pitfalls

### Pitfall 1: Missing `updated_at` Column
**What goes wrong:** The `meetings` table does not have an `updated_at` column. Querying it will fail.
**Why it happens:** `bootstrap.sql` includes it, but the production database was built incrementally via migrations. The column was never added via migration.
**How to avoid:** Add a migration that: (1) adds the `updated_at` column with default `now()`, (2) creates the `update_timestamp` trigger on the meetings table, (3) backfills existing rows with `created_at` values.
**Warning signs:** Query errors mentioning "column updated_at does not exist."

### Pitfall 2: Source URLs Are Almost Never Populated
**What goes wrong:** Badges are clickable but lead nowhere, or implementation assumes all meetings have URLs.
**Why it happens:** CivicWeb scraper saves `.url` companion files only for recently scraped documents. Out of 712 meetings with agendas, only 3 have `agenda_url` populated. Zero have `minutes_url`.
**How to avoid:** Badges must gracefully handle null URLs. When URL is null, badge renders as static indicator (no link, no external-link icon). Only `video_url` is reliably populated (202 meetings).
**Warning signs:** Testing only with recent meetings that happen to have URLs.

### Pitfall 3: "Watch on Vimeo" Button Removal
**What goes wrong:** Removing the "Watch on Vimeo" button breaks the only way to access video when embedded player isn't available.
**Why it happens:** The Video provenance badge replaces it, but the current button only shows when `directVideoUrl` is falsy (embedded player unavailable).
**How to avoid:** The Video badge must always link to `meeting.video_url` (Vimeo page), regardless of whether the embedded player loaded. The old conditional logic (`!directVideoUrl`) should NOT apply to the badge.
**Warning signs:** No external video link visible when video is embedded inline.

### Pitfall 4: TypeScript Type Mismatch
**What goes wrong:** `updated_at` not in the `Meeting` interface causes type errors.
**Why it happens:** The `Meeting` type in `types.ts` doesn't include `updated_at`.
**How to avoid:** Add `updated_at?: string` to the `Meeting` interface. Also add it to the select strings in `getMeetingById` and `getMeetings`.
**Warning signs:** TypeScript errors referencing `updated_at` property.

### Pitfall 5: SSR vs Client Relative Time Mismatch
**What goes wrong:** "Updated 3 days ago" shows different text on server vs client because `new Date()` differs.
**Why it happens:** SSR runs on Cloudflare Workers (UTC), client runs in user's timezone. Both use `Date.now()` which yields different results.
**How to avoid:** This is acceptable for relative time -- small differences between SSR and client hydration are fine since "3 days ago" vs "3 days ago" won't differ for most time scales. For the tooltip (exact date), use `toLocaleString()` which is client-only naturally. If hydration mismatch warnings appear, wrap in a `useEffect` to only show relative time on client.
**Warning signs:** React hydration mismatch warnings in console.

## Code Examples

### Migration: Add updated_at to meetings
```sql
-- Add updated_at column to meetings table
ALTER TABLE meetings
ADD COLUMN updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Backfill existing rows with created_at
UPDATE meetings SET updated_at = created_at;

-- Add trigger (update_timestamp function already exists)
CREATE TRIGGER set_timestamp_meetings
BEFORE UPDATE ON meetings
FOR EACH ROW EXECUTE PROCEDURE update_timestamp();
```

Note: The `update_timestamp()` function already exists in the database (defined in bootstrap.sql section 0.1). The trigger may or may not exist -- the migration should use `CREATE OR REPLACE` or `DROP TRIGGER IF EXISTS` first.

### Select String Updates
```typescript
// getMeetingById select - add updated_at
"id, organization_id, title, meeting_date, type, status, has_agenda, has_minutes, has_transcript, video_url, minutes_url, agenda_url, video_duration_seconds, chair_person_id, archive_path, summary, meta, created_at, updated_at, organization:organizations(*), chair:people(*)"

// getMeetings select - add updated_at
"id, organization_id, title, meeting_date, type, status, video_url, minutes_url, agenda_url, video_duration_seconds, summary, has_agenda, has_minutes, has_transcript, created_at, updated_at, organization:organizations(*)"
```

### Compact Badges for Meeting Card
```tsx
// In MeetingCard, replace the existing icon indicators
<ProvenanceBadges meeting={meeting} compact />
```

### Replacing "Watch on Vimeo" Button
The current code in meeting-detail.tsx (lines 461-471):
```tsx
{meeting.video_url && !directVideoUrl && (
  <a href={meeting.video_url} ...>Watch on Vimeo<ExternalLink /></a>
)}
```
This is removed entirely. The Video provenance badge in `ProvenanceBadges` handles this now, always linking to the Vimeo page regardless of embedded player state.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate icons in MeetingCard sidebar | Provenance badges in header | This phase | Unified provenance display |
| "Watch on Vimeo" button | Video provenance badge | This phase | Consistent with other source types |
| No "last updated" indicator | Relative time display | This phase | Users know data freshness |

**Deprecated/outdated:**
- The separate icon cluster in MeetingCard's Assets section (lines 111-127) will be replaced by `ProvenanceBadges compact`.

## Open Questions

1. **Hydration mismatch for relative time**
   - What we know: SSR and client will compute slightly different relative times due to clock differences
   - What's unclear: Whether React Router 7 on Cloudflare Workers treats this as a warning or error
   - Recommendation: Implement server-side, test for hydration issues. If they occur, render relative time only on client with `useEffect`. The exact tooltip timestamp avoids this issue entirely.

2. **Should the trigger check if `updated_at` already exists?**
   - What we know: `bootstrap.sql` defines the trigger but it may not have been applied to the live DB
   - What's unclear: Whether the trigger already exists from an earlier migration
   - Recommendation: Use `DROP TRIGGER IF EXISTS set_timestamp_meetings ON meetings;` before creating it.

3. **Future minutes_url population**
   - What we know: The pipeline CivicWeb scraper saves `.url` companion files for agendas but not minutes. Only 3 agenda URLs are populated.
   - What's unclear: Whether this should be improved in a future pipeline phase
   - Recommendation: Out of scope for this phase. The badge gracefully handles null URLs. A future pipeline improvement could backfill URLs from companion files.

## Data Findings

### Source URL Availability (from production database)
| Field | Total Records | Populated | Coverage |
|-------|--------------|-----------|----------|
| `has_agenda` (boolean) | 738 | 712 | 96.5% |
| `has_minutes` (boolean) | 738 | 688 | 93.2% |
| `has_transcript` (boolean) | 738 | 200 | 27.1% |
| `agenda_url` (text) | 738 | 3 | 0.4% |
| `minutes_url` (text) | 738 | 0 | 0.0% |
| `video_url` (text) | 738 | 202 | 27.4% |

**Implication:** Agenda and Minutes badges will almost always be static indicators (no link). Only Video badges will typically be clickable. This is acceptable -- the primary value is showing what sources exist, with links as a bonus when available.

### Documents Table
- Categories: "Agenda" (723 records), "Minutes" (3 records)
- `source_url` populated: 3 (all Agenda category, all recent)
- The documents table has a `source_url` field that could theoretically provide links, but it's also barely populated

## Sources

### Primary (HIGH confidence)
- Direct database queries against production Supabase -- column existence, data counts, schema verification
- Codebase inspection -- `meetings.ts`, `meeting-detail.tsx`, `meeting-card.tsx`, `types.ts`, `bootstrap.sql`, `ingester.py`, `civicweb.py`

### Secondary (MEDIUM confidence)
- lucide-react icon availability -- verified `FileText`, `ClipboardList`, `Video`, `ExternalLink` all imported/used elsewhere in the codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing tools
- Architecture: HIGH -- straightforward component + utility + migration, well-understood patterns
- Pitfalls: HIGH -- verified via direct DB queries, identified all data gaps
- Data availability: HIGH -- exact counts from production database

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable domain, no external dependencies changing)
