# Phase 4: Home Page Enhancements - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Surface council activity on the home page — active matters, recent decisions, upcoming meetings, and a featured recent meeting recap — so returning visitors get immediate value without navigating deeper. Full redesign of the current home route. Includes Ask hero section and account CTA placement. Does NOT include interactive map features or new data capabilities.

</domain>

<decisions>
## Implementation Decisions

### Page layout & hierarchy
- Full redesign of the current home page route (replace entirely, not augment)
- Balanced density — enough info to scan quickly without feeling cramped
- Section order top-to-bottom: Hero → Upcoming Meeting → Recent Meeting → Active Matters → Recent Decisions
- Each section has a "View all" link to existing list pages
- Responsive design is a priority — must work well across all breakpoints, sections stack on mobile
- Account CTA visible only to logged-out users (near the hero area)

### Hero section
- Search-style hero: big centered Ask input with tagline above it (Google-esque, "start here")
- Subtle vector outline map of View Royal as hero background — decorative, not interactive, low-contrast
- "Create an account to track what matters to you" CTA for logged-out users only

### Upcoming meeting section
- Show only the next upcoming meeting (not multiple)
- Display meeting type badge (Regular, Committee of the Whole, etc.)
- Show top 3-4 agenda topic titles as preview
- When no meeting is scheduled: show "No meetings scheduled" (simple, honest)

### Recent meeting feature
- Separate featured section for the most recent past meeting
- Rich content: AI-generated summary paragraph + key decisions/motions from that meeting + stats (motion count, divided votes, agenda items)
- Link to full meeting detail page

### Active matters section
- Compact cards: title + category badge + last activity date + 1-line summary
- 5-6 matters shown, ordered by recency of discussion (last discussed in recent meetings)
- Flat list, no category grouping or filtering
- Full card is clickable → links to matter detail page
- Inline subscribe button on each card for logged-in users

### Decisions feed
- Minimal per row: plain English summary + result (Carried/Defeated)
- Vote breakdown shown as both text ("5-2") and visual indicator (colored dots or bar)
- Divided votes highlighted with accent border or "Divided" badge
- Show financial cost as badge/tag when `financial_cost` is available
- 10-15 most recent non-procedural motions

### Claude's Discretion
- Loading skeleton design for each section
- Exact spacing, typography, and color choices within the design system
- Mobile responsive breakpoint behavior
- Error state handling for sections that fail to load
- Vote visual indicator implementation (dots vs bar vs other)
- Map illustration style details (line weight, opacity, positioning)

</decisions>

<specifics>
## Specific Ideas

- Hero should feel like a search engine landing — the Ask input is the main interaction point
- Map background gives unmistakable "this is about View Royal" identity
- Recent meeting section should feel like a newspaper recap — key decisions, stats, summary
- Matter cards should be compact enough to show 5-6 without scrolling on desktop

</specifics>

<deferred>
## Deferred Ideas

- Interactive map with matters plotted by geographic location — future phase (needs neighbourhood/location data infrastructure)
- Map-based matter browsing/filtering — future phase

</deferred>

---

*Phase: 04-home-page-enhancements*
*Context gathered: 2026-02-16*
