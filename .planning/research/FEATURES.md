# Features Research: User Engagement, Notifications & Home Page Feeds

Research date: 2026-02-16
Scope: Civic transparency platform features for user subscriptions/alerts, surfacing active matters/decisions, and multi-tenant foundations.

## Executive Summary

Civic transparency platforms differentiate themselves not by the data they hold, but by how proactively they surface it to the right people at the right time. The competitive landscape ranges from enterprise government SaaS (Granicus/Legistar, CivicPlus, OpenGov) to open-source civic tools (Councilmatic, Open States/Plural). ViewRoyal.ai already has richer data than most (diarized transcripts, RAG Q&A, matter tracking with geography) but lacks the engagement layer that turns passive browsers into returning users: subscriptions, notifications, and a home page that tells you "here's what changed since you last looked."

Three pillars emerge from the research:
1. **Subscriptions/notifications** are table stakes -- every serious civic platform has them, and users expect to follow topics, people, or geographic areas and get email when something happens.
2. **A decision-forward home page** is a differentiator -- most municipal sites bury decisions in meeting minutes. Surfacing "what council decided this week" in a scannable feed is rare and high-impact.
3. **Digest frequency control** is the line between engagement and churn -- alert fatigue is the primary reason civic platform subscribers disengage.

---

## Table Stakes Features

These are features that users of civic transparency tools expect. Without them, engagement drops off after the initial visit.

### TS-1: Email Subscription to Matters

**What**: Users subscribe to specific matters (e.g., "1234 Helmcken Road rezoning") and get email when the matter has new activity (new agenda item, motion, document).
**Why table stakes**: Councilmatic, Legistar, Civic1, and Plural all offer this. It is the single most requested engagement feature on civic platforms.
**Complexity**: Medium. Requires: subscription table, background job to detect changes, email sending (Resend/Postmark), unsubscribe flow.
**Dependencies**: Supabase auth (already exists), matter tracking (already exists), email provider integration (new).

### TS-2: Email Subscription to People (Council Members)

**What**: Follow a specific councillor. Get notified when they speak on something, vote on something, or have a motion attributed to them.
**Why table stakes**: People-based following is standard in Councilmatic, Legistar, and all legislative trackers. Residents often care about "what is MY ward councillor doing."
**Complexity**: Medium. Same infrastructure as TS-1, different trigger logic (new motions/votes/transcript segments for a person).
**Dependencies**: TS-1 infrastructure, people profiles (already exist).

### TS-3: Unsubscribe and Preference Management

**What**: One-click unsubscribe in every email. Preference center page where users manage all subscriptions and choose frequency (immediate, daily digest, weekly digest).
**Why table stakes**: CAN-SPAM / CASL compliance is legally required. CivicPlus, Granicus, and every email-sending civic platform has this. Without it, you cannot send email.
**Complexity**: Low-Medium. Preference center page, token-based unsubscribe links, frequency column on subscription table.
**Dependencies**: TS-1.

### TS-4: Home Page Activity Feed (Recent Decisions)

**What**: Replace or augment the current "Latest Meeting" section with a feed of recent council decisions -- motions passed/failed, bylaws adopted, key statements -- from the last 1-2 weeks. Scannable, date-grouped.
**Why table stakes**: Municipal website best practices (Institute for Local Government, GovStack) all emphasize surfacing decisions on the home page. The current home page shows the latest meeting and key decisions from that meeting, but doesn't show cross-meeting decision activity or matter status changes.
**Complexity**: Low-Medium. The data already exists (motions with results, matters with status). Needs a new service query for recent decisions across meetings and a feed component.
**Dependencies**: None new -- motions, matters, meetings data all exist.

### TS-5: Upcoming Meetings with Agenda Preview

**What**: Show upcoming meetings on the home page with a brief preview of agenda topics (not just date/time). Link to full agenda.
**Why table stakes**: The home page already shows upcoming meetings (from `getHomeData`), but agenda preview content would make it actionable. Legistar and Peak Agenda both surface agenda previews.
**Complexity**: Low. Extend the existing upcoming meetings query to include top agenda item titles.
**Dependencies**: None -- data exists.

---

## Differentiators

These features go beyond what most civic platforms offer and would make ViewRoyal.ai stand out.

### D-1: Topic/Keyword Subscriptions with AI Matching

**What**: Subscribe to a topic like "housing" or "traffic" or a keyword like "Helmcken Road." The system uses the existing topic tags, full-text search, and optionally embedding similarity to match new agenda items and motions against subscriptions.
**Why differentiating**: Councilmatic offers basic keyword alerts. But combining structured topic tags (already in `agenda_item_topics`) with full-text search on transcripts and AI-extracted key statements is a significant upgrade. Most platforms only match on legislation title text.
**Complexity**: High. Requires: topic subscription UI, matching logic that runs against new ingested data, tuning to avoid false positives/noise.
**Dependencies**: TS-1 infrastructure, topics table (exists), tsvector search (exists), key_statements (exists).

### D-2: Neighbourhood/Geographic Subscriptions

**What**: Subscribe to a neighbourhood (e.g., "Thetis Cove") or draw an area on the map. Get notified when matters with addresses in that area have activity.
**Why differentiating**: Civita App and some CivicPlus deployments offer geo-fencing for emergency alerts, but geographic subscriptions for council matter tracking is rare. ViewRoyal.ai already has `neighbourhoods.geojson` and a matters map -- this extends that into notifications.
**Complexity**: High. Requires: PostGIS point-in-polygon matching, neighbourhood subscription table, integration with matter geocoding (which must already be working for the matters map).
**Dependencies**: TS-1 infrastructure, matters with lat/lng (exists), neighbourhoods GeoJSON (exists but not yet in DB).

### D-3: Weekly Civic Digest Email

**What**: A beautifully formatted weekly email summarizing: meetings that happened, key decisions made, new matters opened, upcoming meetings. Personalized if the user has subscriptions (your matters, your topics), generic if not.
**Why differentiating**: CivicPlus offers mass notification digests, but an AI-curated weekly summary of council activity -- especially one that can include key statement excerpts and vote tallies -- is rare in the civic space. This is the "newsletter" play.
**Complexity**: High. Requires: digest generation job (likely a scheduled Cloudflare Worker or Supabase Edge Function), HTML email templating, content selection logic, personalization layer.
**Dependencies**: TS-1 infrastructure, TS-3 (frequency preferences). Benefits greatly from D-1 (topic matching for personalization).

### D-4: "What Changed" Indicators for Returning Users

**What**: When a logged-in user returns, visually mark what's new since their last visit: new meetings, updated matters, new motions on matters they follow. A "new" badge or dot system.
**Why differentiating**: This is standard in social platforms but almost nonexistent in civic transparency tools. Councilmatic and Legistar have no concept of "what's new for YOU."
**Complexity**: Medium. Requires: tracking last-visited timestamp per user, computing "new since" queries, badge components.
**Dependencies**: Supabase auth (exists). Works independently from email subscriptions.

### D-5: Active Matters Dashboard on Home Page

**What**: A dedicated section on the home page showing matters that are currently "In Progress" or "Under Review" -- the things council is actively working on right now. Grouped by category or neighbourhood. Shows recent activity on each.
**Why differentiating**: Most municipal websites have a "current applications" page buried in planning department pages. Surfacing this front-and-center with timeline context (last motion, next expected date) is rare.
**Complexity**: Medium. The matters table already has `status`. Needs a filtered query for active matters with latest activity, and a compact card component.
**Dependencies**: Matters data (exists), matter statuses (exist).

### D-6: RSS Feeds for Subscriptions

**What**: Offer RSS feeds for: all decisions, specific matters, specific people, specific topics. Power users and journalists use RSS readers.
**Why differentiating**: Councilmatic originally offered RSS; most modern civic platforms have dropped it. Offering it is low cost and serves power users and media.
**Complexity**: Low. RSS is just XML rendering of existing queries. A few API routes.
**Dependencies**: None -- data exists.

### D-7: Multi-Municipality Home Page (Multi-Tenant Foundation)

**What**: When multi-tenancy lands, the home page adapts to show the current municipality's data. A "hub" page could show activity across all municipalities for users who care about the region.
**Why differentiating**: No open-source civic tool does multi-municipality aggregation well. Plural/Open States does it for state legislatures but not municipal councils.
**Complexity**: Medium (depends heavily on multi-tenancy PR #36 landing first). The home page queries need municipality_id filtering, and a hub view needs cross-municipality aggregation.
**Dependencies**: Multi-tenancy (PR #36, in progress).

---

## Anti-Features (Deliberately NOT Building)

### AF-1: Push Notifications / Native App

**Why not**: Push notifications require a native app or PWA service worker infrastructure. The user base for a single small municipality doesn't justify the complexity. Email and RSS cover the use cases. Browser push notifications have terrible opt-in rates and annoy users.
**Revisit when**: User base exceeds 1,000 active subscribers per municipality.

### AF-2: Social Features (Comments, Reactions, Forums)

**Why not**: Research from Harvard's Ash Center shows that civic platforms that add social/discussion features become moderation nightmares without dedicated staff. Comments sections on government content attract toxic engagement. The platform's value is in data and AI analysis, not community discussion. Council meetings already have public comment periods.
**Revisit when**: Never, probably. This is a transparency tool, not a social platform.

### AF-3: Real-Time / Live Meeting Notifications

**What would it be**: Push alerts when a meeting starts, live updates during meetings.
**Why not**: ViewRoyal.ai ingests data after meetings, not during them. The pipeline is batch, not streaming. Building real-time meeting tracking is an entirely different architecture. Alert fatigue from live updates would be severe.
**Revisit when**: If live-streaming integration is added and user demand materializes.

### AF-4: SMS Notifications

**Why not**: SMS has per-message costs, compliance complexity (TCPA), and is overkill for council meeting updates. Email digests serve the same purpose at zero marginal cost. CivicPlus and Granicus offer SMS for emergency alerts -- council transparency doesn't need that urgency level.
**Revisit when**: Emergency/public safety alerting is in scope (unlikely for this platform).

### AF-5: Gamification / Engagement Scores

**What would it be**: Badges for attending meetings, points for asking questions, "civic engagement score."
**Why not**: Gamification of civic engagement is patronizing and has been shown to drive superficial engagement without improving democratic participation. The Ash Center research explicitly warns against it.
**Revisit when**: Never.

### AF-6: User-Generated Content / Wiki-Style Editing

**What would it be**: Letting users annotate, correct, or add context to meeting records.
**Why not**: The platform's credibility comes from being a faithful representation of official records. User-generated content muddies the source of truth. Corrections should go through the pipeline (speaker alias system already handles speaker name corrections).
**Revisit when**: If a "community notes" style fact-checking layer becomes feasible with strong verification.

---

## Feature Dependency Map

```
TS-1 (Matter Subscriptions)
 ├── TS-2 (People Subscriptions) -- same infra, different triggers
 ├── TS-3 (Preference Management) -- required for compliance
 ├── D-1 (Topic Subscriptions) -- extends matching logic
 ├── D-2 (Neighbourhood Subscriptions) -- extends matching with geo
 ├── D-3 (Weekly Digest) -- requires TS-3 frequency prefs
 └── D-6 (RSS Feeds) -- independent, parallel track

TS-4 (Activity Feed on Home Page)
 ├── TS-5 (Agenda Preview) -- independent, same page
 └── D-5 (Active Matters Dashboard) -- independent, same page

D-4 ("What Changed" Indicators) -- independent, only needs auth

D-7 (Multi-Municipality Home) -- depends on PR #36 multi-tenancy
```

## Implementation Priority (Suggested)

**Phase A -- Home Page Improvements (no auth required, immediate user value)**
1. TS-4: Activity feed (recent decisions)
2. TS-5: Agenda preview on upcoming meetings
3. D-5: Active matters dashboard

**Phase B -- Subscription Infrastructure**
4. TS-1: Matter subscriptions (core infra: DB tables, email provider, unsubscribe)
5. TS-3: Preference management
6. TS-2: People subscriptions

**Phase C -- Advanced Subscriptions**
7. D-1: Topic/keyword subscriptions
8. D-2: Neighbourhood subscriptions
9. D-6: RSS feeds

**Phase D -- Digest & Returning User Experience**
10. D-3: Weekly digest email
11. D-4: "What changed" indicators

---

## Complexity Summary

| Feature | Complexity | New Infrastructure Required |
|---------|-----------|---------------------------|
| TS-1: Matter subscriptions | Medium | Subscription tables, email provider, background job |
| TS-2: People subscriptions | Medium | Trigger logic (reuses TS-1 infra) |
| TS-3: Preference management | Low-Medium | Preference center page, unsubscribe tokens |
| TS-4: Activity feed | Low-Medium | New service query, feed component |
| TS-5: Agenda preview | Low | Extend existing query |
| D-1: Topic subscriptions | High | AI/FTS matching pipeline |
| D-2: Neighbourhood subscriptions | High | PostGIS spatial queries, GeoJSON import |
| D-3: Weekly digest | High | Scheduled job, HTML email templates, personalization |
| D-4: What changed indicators | Medium | Last-visited tracking, badge system |
| D-5: Active matters dashboard | Medium | Filtered query, card component |
| D-6: RSS feeds | Low | XML route handlers |
| D-7: Multi-municipality home | Medium | Depends on PR #36 |

## Sources

- [Granicus Legistar Agenda Management](https://granicus.com/product/legistar-agenda-management/)
- [Chicago Councilmatic](https://chicago.councilmatic.org/about/)
- [Open States / Plural Policy](https://open.pluralpolicy.com/about/)
- [CivicPlus Civic Impact Platform](https://www.civicplus.com/)
- [Civic1 Council Tracker](https://www.civic1.app/platform/civic-tracker)
- [OpenGov Transparency Software](https://opengov.com/products/transparency-and-open-data/)
- [Harvard Ash Center: Framework for Digital Civic Infrastructure](https://ash.harvard.edu/resources/a-framework-for-digital-civic-infrastructure/)
- [Harvard Ash Center: Transparency is Insufficient](https://ash.harvard.edu/articles/transparency-is-insufficient-lessons-from-civic-technology-for-anticorruption/)
- [GovStack: Municipal Homepage Best Practices](https://www.govstack.com/resources/posts/best-practices-for-designing-a-user-friendly-municipal-homepage/)
- [Institute for Local Government: Website Best Practices](https://www.ca-ilg.org/website-best-practices)
- [CivicPlus: Email Marketing Best Practices for Residents](https://www.civicplus.com/blog/ce/best-practices-for-email-marketing-to-your-citizens)
- [Email Preference Center Guide (Mailfloss)](https://mailfloss.com/email-preference-center-guide/)
- [Councilmatic: Bring to Your City](https://participatorypolitics.org/bring-councilmatic-to-your-city/)
- [Sunlight Foundation: Demystifying Chicago Politics with Councilmatic](https://sunlightfoundation.com/2016/01/25/opengov-voices-demystifying-chicago-politics-with-councilmatic/)
