# Phase 5: Advanced Subscriptions - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Three new subscription capabilities on top of the existing matter/person subscriptions from Phase 3: topic-based alerts (category + keyword), neighbourhood/address-based alerts, and opt-in post-meeting digest emails. Also includes a post-signup onboarding wizard and pre-meeting alert emails.

</domain>

<decisions>
## Implementation Decisions

### Topic Matching
- Users can subscribe via **predefined categories** (existing agenda item categories in DB) AND **free-text keywords**
- Keyword matching uses **semantic/embedding matching** — "housing" should catch "affordable homes", "residential development" etc.
- Topic alerts fire as part of the **post-meeting digest**, not as individual real-time emails

### Neighbourhood / Address Subscriptions
- Users can provide their **street address** (precision) OR **pick a neighbourhood** from the existing list (simpler)
- Matching uses **simple radius match** from user's address to matter addresses — no neighbourhood boundary data needed yet
- Pipeline **geocodes matter addresses at ingestion time** (adds lat/lng) for fast matching later
- Neighbourhood boundary geocoding is manual/future work — radius match is the v1 approach

### Notification Timing (Post-Meeting + Pre-Meeting)
- **Post-meeting digest** replaces the weekly digest concept — fires after each meeting, not on a fixed weekly schedule
- Post-meeting digest is a **full meeting summary with subscribed items highlighted** (not just personalized items)
- **Pre-meeting alert** includes matching agenda items with titles/context PLUS practical info about attending (location, online link, time)
- No meetings = no emails (meeting-aligned, not calendar-aligned)

### Digest Email Style
- **Friendly/accessible tone** — plain language, like a neighbour explaining what happened
- **Opt-in subscription type** — users explicitly subscribe to meeting digests (not auto-enrolled on account creation)

### Subscription UX
- **Post-signup onboarding wizard** — after email verification, walk user through: pick topics → set address/neighbourhood → opt into digest
- Digest opt-in offered in **both** onboarding wizard AND settings page
- Topic/neighbourhood management lives in the **existing subscription settings page** after initial setup

### Claude's Discretion
- Whether to show all categories or only active ones in onboarding topic picker
- Loading/empty state design for onboarding wizard
- Exact radius distance for neighbourhood matching
- Email template layout and responsive design
- How to handle matters with no geocodable address

</decisions>

<specifics>
## Specific Ideas

- Pre-meeting alert should feel actionable — "Here's what's coming up that you care about, and here's how to attend"
- Post-meeting digest should be a complete picture of the meeting, not just subscription matches — highlights make subscribed items stand out but the full summary gives context
- Onboarding wizard should feel lightweight, not bureaucratic — this is civic engagement, not enterprise SaaS

</specifics>

<deferred>
## Deferred Ideas

- Neighbourhood boundary geocoding (manual data entry by project owner) — future enhancement to replace radius matching
- Dynamic neighbourhood list loading from DB (currently hardcoded VIEW_ROYAL_NEIGHBORHOODS array, TODO noted in Phase 3)

</deferred>

---

*Phase: 05-advanced-subscriptions*
*Context gathered: 2026-02-16*
