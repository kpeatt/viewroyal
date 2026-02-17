---
phase: 05-advanced-subscriptions
verified: 2026-02-16T00:00:00Z
status: passed
score: 21/21 must-haves verified
re_verification: false
---

# Phase 05: Advanced Subscriptions Verification Report

**Phase Goal:** Users can subscribe to topics and neighbourhoods for targeted notifications, and all subscribers receive a post-meeting digest with personalized highlights
**Verified:** 2026-02-16
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Topics table contains the 8 matter categories as seed data | VERIFIED | `supabase/migrations/add_topic_keyword_support.sql` lines 7-16: INSERT INTO topics with 8 rows using ON CONFLICT DO NOTHING |
| 2 | Subscriptions table supports keyword text and keyword_embedding columns for semantic matching | VERIFIED | Migration: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS keyword text` + `halfvec(384)` + HNSW cosine index |
| 3 | user_profiles has onboarding_completed boolean for onboarding flow control | VERIFIED | Migration: `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false` |
| 4 | find_meeting_subscribers RPC includes topic-matching UNION branches | VERIFIED | Migration lines 126-159: Branch 5 (category FK match via topics.name) and Branch 6 (cosine similarity > 0.45 on keyword_embedding) |
| 5 | update_user_location RPC exists (SECURITY DEFINER) for safe geography writes | VERIFIED | Migration lines 28-41: CREATE OR REPLACE FUNCTION with SECURITY DEFINER and SET search_path |
| 6 | Server-side geocoding endpoint converts street addresses to lat/lng | VERIFIED | `apps/web/app/routes/api.geocode.tsx`: fetches Nominatim at line 36, requires auth, returns `{lat, lng}` |
| 7 | Pipeline geocodes agenda item related_address values at ingestion time | VERIFIED | `apps/pipeline/pipeline/ingestion/ingester.py` lines 548, 589, 1805-1807: geocode_address method + _geocode_agenda_items + called in process_meeting |
| 8 | New signups are NOT auto-subscribed to digest (opt-in only) | VERIFIED | `apps/web/app/routes/signup.tsx`: profile creation only (lines 32-44), no digest insert — grep for "Auto-subscribe" returns nothing |
| 9 | New users are redirected to /onboarding after first login | VERIFIED | `apps/web/app/root.tsx` lines 77-92: checks onboarding_completed, redirects to /onboarding, excludes /onboarding /login /logout /signup /api/* paths |
| 10 | Onboarding wizard has 3 steps: pick topics, set address/neighbourhood, opt into digest | VERIFIED | `apps/web/app/routes/onboarding.tsx`: TopicStep (step=0), LocationStep (step=1), DigestStep (step=2), STEPS array with 3 entries |
| 11 | User can subscribe to predefined topic categories via checkboxes | VERIFIED | TopicStep renders topics.map() as toggle buttons; action() iterates topicIds and calls addSubscription with topic_id |
| 12 | User can enter a keyword for semantic topic matching | VERIFIED | TopicStep has keywordInput + addKeyword(); action() calls generateQueryEmbedding per keyword then addSubscription |
| 13 | User can enter a street address that gets geocoded and saved to their profile | VERIFIED | LocationStep: handleGeocode() fetches /api/geocode; action() calls update_user_location RPC when lat/lng present |
| 14 | User can pick a neighbourhood from the dropdown | VERIFIED | LocationStep renders VIEW_ROYAL_NEIGHBORHOODS dropdown; action() creates neighborhood subscription |
| 15 | User can opt into meeting digest during onboarding | VERIFIED | DigestStep with digestEnabled toggle; action() calls addSubscription with type "digest" when digestEnabled=true |
| 16 | Completing onboarding sets onboarding_completed = true (prevents redirect loop) | VERIFIED | `onboarding.tsx` action lines 168-171: direct update `{onboarding_completed: true}` always runs |
| 17 | Settings page lets users manage topic and keyword subscriptions | VERIFIED | `apps/web/app/routes/settings.tsx`: TopicCategoryGrid (lines 212-310) + KeywordManager (lines 314-400) + getTopics loaded in Promise.all |
| 18 | Post-meeting digest highlights items matching user's subscriptions with Following badge | VERIFIED | `supabase/functions/send-alerts/index.ts` line 920: followingBadge span; getHighlightedItems() maps all subscription types to digest items; highlights passed to buildDigestHtml |
| 19 | Digest email uses friendly, accessible tone | VERIFIED | "What happened at Council" (line 986), "What Council Decided" (line 1003), "Where Council Disagreed" (line 948), "Who was there" (line 1014), human-readable intro on line 994 |
| 20 | Pre-meeting alert email includes matching agenda items with attending info | VERIFIED | buildPreMeetingHtml() (line 759): attending info box with Council Chambers address, YouTube link, clerk email; matched items with reason badges |
| 21 | Pre-meeting alerts fire when Edge Function called with pre_meeting trigger | VERIFIED | Deno.serve handler (line 310): `const { meeting_id, mode = "digest" } = body`; routes to handlePreMeeting when mode === "pre_meeting" |

**Score:** 21/21 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/add_topic_keyword_support.sql` | Schema extensions for topic matching, keyword embeddings, onboarding flag | VERIFIED | 161-line migration: 8-row topics INSERT, keyword columns + HNSW index, onboarding_completed, update_user_location RPC, 6-branch find_meeting_subscribers |
| `apps/web/app/services/topics.ts` | Topic query functions for UI consumption | VERIFIED | Exports `getTopics(supabase)`, queries topics table ordered by name, 16 lines |
| `apps/web/app/routes/api.geocode.tsx` | Server-side Nominatim geocoding endpoint | VERIFIED | POST action with auth check, Nominatim URL at line 36, returns {lat, lng, display_name} |
| `apps/web/app/routes/onboarding.tsx` | Multi-step onboarding wizard with topic, address, and digest steps | VERIFIED | 803 lines; loader (auth + topics + profile check), action (subscriptions + geo + onboarding_completed), 3-step component |
| `apps/web/app/routes/settings.tsx` | Enhanced settings with topic/keyword subscription management | VERIFIED | Imports getTopics, renders TopicCategoryGrid and KeywordManager, immediate fetch toggles, geocoding on profile save |
| `supabase/functions/send-alerts/index.ts` | Enhanced digest with subscription highlighting + pre-meeting alert capability | VERIFIED | 1034 lines; getHighlightedItems(), buildDigestHtml() with Following badge, handlePreMeeting(), buildPreMeetingHtml(), dual-mode dispatch |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/web/app/routes/api.subscribe.tsx` | `apps/web/app/lib/embeddings.server.ts` | generateQueryEmbedding for keyword subscriptions | VERIFIED | Line 10: `import { generateQueryEmbedding } from "../lib/embeddings.server"`, used at line 101 when `type === "topic" && keyword && !topic_id` |
| `apps/web/app/routes/api.geocode.tsx` | `nominatim.openstreetmap.org` | fetch to Nominatim API | VERIFIED | Line 36: `https://nominatim.openstreetmap.org/search?q=...&bounded=1` with User-Agent header |
| `apps/web/app/root.tsx` | `apps/web/app/routes/onboarding.tsx` | redirect when onboarding_completed is false | VERIFIED | Lines 87-91: `getUserProfile()` then `if (!profile || !profile.onboarding_completed) throw redirect("/onboarding")` |
| `apps/web/app/routes/onboarding.tsx` | subscription service layer | subscription creation for all 3 steps | VERIFIED | Action calls addSubscription directly (server-side), generateQueryEmbedding for keywords, update_user_location RPC for geo |
| `apps/web/app/routes/onboarding.tsx` | `/api/geocode` | POST to geocode user's street address | VERIFIED | LocationStep handleGeocode() fetches "/api/geocode" at line 397 |
| `supabase/functions/send-alerts/index.ts` | `find_meeting_subscribers` | Supabase RPC call | VERIFIED | Lines 369 (digest mode) and 509 (pre_meeting mode): `supabase.rpc("find_meeting_subscribers", ...)` |
| `supabase/functions/send-alerts/index.ts` | `build_meeting_digest` | Supabase RPC call | VERIFIED | Line 342: `supabase.rpc("build_meeting_digest", { target_meeting_id: meeting_id })` |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SUB-03 | 05-01, 05-02, 05-03 | User can subscribe to a topic/category and receive email on matching items | SATISFIED | Topics seeded (migration), topic subscriptions via onboarding/settings, category and keyword RPC branches, digest highlighting maps topic matches to items with Following badge |
| SUB-04 | 05-01, 05-02, 05-03 | User can subscribe to a neighbourhood and receive email on geographically relevant items | SATISFIED | Neighbourhood subscription created in onboarding (address geocoded -> update_user_location + proximity sub), RPC Branch 4 (ST_DWithin), digest highlights items with geo data as "Near your address" |
| SUB-05 | 05-01, 05-02, 05-03 | User can subscribe to meeting digest email | SATISFIED | Digest opt-in in onboarding step 3 and settings toggle, RPC Branch 1 (digest type), buildDigestHtml with per-subscriber highlighting, friendly tone, no auto-subscribe on signup |

All three requirements declared across all three plans are satisfied. No orphaned requirements found.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/app/routes/settings.tsx` | 111 | `// TODO: Make dynamic when multi-town support is needed` | Info | Forward-looking comment for future multi-municipality support; hardcoded VIEW_ROYAL_NEIGHBORHOODS list. No impact on Phase 05 goal. |

No blocking or warning-level anti-patterns found.

---

### Minor Discrepancy (Informational)

**api.geocode.tsx uses `bounded=1` vs pipeline uses `bounded=0`**

The SUMMARY for Plan 01 documents a decision to use `bounded=0` ("prefer but don't restrict to viewbox") for better geocoding coverage. The pipeline ingester correctly implements `bounded=0` at line 572. However `apps/web/app/routes/api.geocode.tsx` line 36 uses `bounded=1` (matching the original PLAN spec, not the SUMMARY decision). This means the web geocoding endpoint is stricter than the pipeline endpoint — it will reject addresses that fall just outside the View Royal bounding box. This inconsistency does not block the phase goal but may cause sporadic user-facing "Address not found" errors for edge addresses.

---

### Human Verification Required

The following items were verified programmatically to the extent possible. Human testing was performed during Plan 02 (Task 3 checkpoint — approved) but these are noted for completeness:

**1. Onboarding Wizard End-to-End Flow**
- **Test:** Create a new account, verify email, log in — confirm redirect to /onboarding; complete all 3 steps
- **Expected:** Lands on home page after finish; no further redirect to /onboarding on subsequent logins
- **Why human:** Authentication and redirect loop behaviour requires live session

**2. Pre-Meeting Alert Email Rendering**
- **Test:** Trigger send-alerts with `{ meeting_id: <id>, mode: "pre_meeting" }`
- **Expected:** Email arrives with matched items, reason badges, and attending info box
- **Why human:** Email delivery and HTML rendering in mail clients cannot be verified from code

**3. Digest Personalization**
- **Test:** Trigger digest for a meeting with a known subscriber who has topic subscriptions
- **Expected:** Email shows Following badges on matching decisions; summary box lists followed reasons
- **Why human:** Requires live Supabase data with matching subscriptions and meeting content

---

### Gaps Summary

No gaps found. All 21 must-have truths verified. All 3 phase requirements (SUB-03, SUB-04, SUB-05) satisfied. All 7 key links confirmed wired. All 6 required artifacts exist with substantive content.

The phase goal is achieved: users can subscribe to topics and neighbourhoods, and subscribers receive a post-meeting digest with personalized highlights. The bounded=1 vs bounded=0 discrepancy in the geocoding endpoint is informational only and does not block the goal.

---

_Verified: 2026-02-16_
_Verifier: Claude (gsd-verifier)_
