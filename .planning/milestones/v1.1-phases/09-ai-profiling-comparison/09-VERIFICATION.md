---
phase: 09-ai-profiling-comparison
verified: 2026-02-18T22:00:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Navigate to a councillor's profile page (e.g. /people/35), observe Speaking Time card with sparkline trend chart and topic breakdown bars"
    expected: "Card shows total hours, meeting count, SVG sparkline with council average dashed line, and per-topic horizontal bars coloured by topic"
    why_human: "SVG rendering and visual layout cannot be verified programmatically"
  - test: "On a profile page with stance data, open the Positions tab and expand an evidence quote section"
    expected: "Collapsible evidence section expands showing quote text with link to source meeting, and any related motion links"
    why_human: "Interactive collapse/expand state and link navigation require browser"
  - test: "Navigate to /compare?a=35&b=37 on mobile viewport"
    expected: "Fixed comparison bar appears at top with both names and alignment %; activity cards are swipeable via scroll-snap"
    why_human: "scroll-snap swipe UX requires actual device/browser interaction"
  - test: "Click Compare button on a councillor's profile page"
    expected: "Navigates to /compare?a={id} with councillor A pre-selected in dropdown, ready for councillor B selection"
    why_human: "Navigation and pre-selection state require browser interaction"
  - test: "Run --generate-stances against a councillor with real key_statements and verify stances are stored"
    expected: "councillor_stances table gains rows with position, position_score, confidence, summary, and evidence_quotes from Gemini"
    why_human: "Requires live Gemini API call and live Supabase write; cannot mock programmatically"
---

# Phase 09: AI Profiling & Comparison Verification Report

**Phase Goal:** Citizens can understand each councillor's speaking engagement, positions on key topics through AI-generated summaries backed by evidence, and compare any two councillors side by side
**Verified:** 2026-02-18T22:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Speaking time aggregation runs in SQL, not application code | VERIFIED | `get_speaking_time_stats`, `get_speaking_time_by_meeting`, `get_speaking_time_by_topic` RPCs exist in migration; `profiling.ts` calls `supabase.rpc()` |
| 2  | Category normalization maps 470 agenda_item categories to 8 predefined topics | VERIFIED | `normalize_category_to_topic()` IMMUTABLE SQL function in migration; Python mirror `_normalize_category_to_topic()` in `stance_generator.py:154` |
| 3  | `councillor_stances` table exists with position, score, evidence, confidence fields | VERIFIED | Migration creates table with all specified columns plus RLS public-read policy |
| 4  | Topic icons and colors are mapped for all 8 topics | VERIFIED | `topic-utils.ts` exports `TOPICS`, `TOPIC_ICONS`, `TOPIC_COLORS` for all 8 topics with lucide-react icons |
| 5  | Stance generation produces AI summaries grounded in real evidence | VERIFIED | `stance_generator.py` gathers `key_statements` + `votes` per topic via Supabase queries, passes to Gemini |
| 6  | Each stance has position score, confidence level, and evidence quotes | VERIFIED | `_upsert_stance()` stores position, position_score, confidence, evidence_quotes, statement_count; `_determine_confidence()` enforces thresholds |
| 7  | Confidence thresholds enforced: <3=low, 3-7=medium, 8+=high | VERIFIED | `_determine_confidence()` at `stance_generator.py:280-288` implements exact thresholds |
| 8  | Councillor profile page shows speaking time, ranking, stances | VERIFIED | `person-profile.tsx` loader fetches 4 data sources in parallel; sidebar shows `SpeakingTimeCard` + `SpeakerRanking`; "Positions" tab shows `StanceSummary` |
| 9  | Profile page has a Compare button linking to /compare | VERIFIED | Line 332-338 in `person-profile.tsx` renders `<Link to={\`/compare?a=${person.id}\`}>Compare</Link>` for councillors |
| 10 | Pipeline can be run via `--generate-stances` flag | VERIFIED | `main.py:129-189` adds and handles `--generate-stances`; `orchestrator.py:447` provides `generate_stances()` method |
| 11 | User can navigate to /compare and select/compare two councillors | VERIFIED | `compare.tsx` (1001 lines) implements dual-mode: selection dropdowns + full comparison layout; route registered in `routes.ts:25` |
| 12 | Comparison shows overall agreement score, per-topic agree/disagree, mobile swipe | VERIFIED | Alignment score shown as `{alignmentRate.toFixed(0)}%`; all 8 topics iterated via `TOPICS.map()`; `snap-x snap-mandatory` at line 554 |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Min Lines | Actual Lines | Status | Key Patterns |
|----------|-----------|-------------|--------|--------------|
| `supabase/migrations/councillor_stances_and_speaking_time.sql` | — | ~165 | VERIFIED | `CREATE TABLE councillor_stances`, 3 RPCs, `normalize_category_to_topic` |
| `apps/web/app/lib/topic-utils.ts` | — | 56 | VERIFIED | Exports `TOPICS`, `TOPIC_ICONS`, `TOPIC_COLORS` for all 8 topics |
| `apps/web/app/services/profiling.ts` | — | 141 | VERIFIED | Exports `getSpeakingTimeStats`, `getSpeakingTimeByMeeting`, `getSpeakingTimeByTopic`, `getCouncillorStances` + 4 TypeScript interfaces |
| `apps/web/app/components/profile/stance-spectrum.tsx` | 20 | 61 | VERIFIED | `StanceSpectrum` component with gradient bar, positioned marker, position labels |
| `apps/web/app/components/profile/speaking-time-card.tsx` | 50 | 289 | VERIFIED | `SpeakingTimeCard` with SVG sparkline, time-range selector, topic breakdown bars |
| `apps/web/app/components/profile/speaker-ranking.tsx` | 40 | 107 | VERIFIED | `SpeakerRanking` with horizontal bars, current-councillor highlight, profile links |
| `apps/web/app/components/profile/stance-summary.tsx` | 60 | 183 | VERIFIED | `StanceSummary` with per-topic cards, `StanceSpectrum`, confidence badge, collapsible evidence |
| `apps/web/app/routes/person-profile.tsx` | — | 900+ | VERIFIED | Imports profiling service, 4 parallel loader queries, Positions tab, Compare button |
| `apps/web/app/routes/compare.tsx` | 200 | 1001 | VERIFIED | Full dual-mode implementation with selection, comparison, alignment, mobile scroll-snap |
| `apps/web/app/routes.ts` | — | — | VERIFIED | `route("compare", "routes/compare.tsx")` at line 25 |
| `apps/pipeline/pipeline/profiling/__init__.py` | — | — | VERIFIED | Empty package init |
| `apps/pipeline/pipeline/profiling/stance_generator.py` | 100 | 504 | VERIFIED | `generate_all_stances`, `_gather_evidence`, `_build_prompt`, `_determine_confidence`, `_upsert_stance`, Gemini client singleton |
| `apps/pipeline/main.py` | — | — | VERIFIED | `--generate-stances` argument + handler at lines 129-189 |
| `apps/pipeline/pipeline/orchestrator.py` | — | — | VERIFIED | `generate_stances()` method at line 447 with lazy import |

### Key Link Verification

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `apps/web/app/services/profiling.ts` | `get_speaking_time_stats` RPC | `supabase.rpc("get_speaking_time_stats", ...)` | WIRED | Line 60 in `profiling.ts` |
| `apps/web/app/services/profiling.ts` | `get_speaking_time_by_meeting` RPC | `supabase.rpc("get_speaking_time_by_meeting", ...)` | WIRED | Line 83 in `profiling.ts` |
| `apps/web/app/services/profiling.ts` | `get_speaking_time_by_topic` RPC | `supabase.rpc("get_speaking_time_by_topic", ...)` | WIRED | Line 107 in `profiling.ts` |
| `apps/web/app/services/profiling.ts` | `councillor_stances` table | `supabase.from("councillor_stances").select(...)` | WIRED | Lines 129-133 in `profiling.ts` |
| `apps/web/app/routes/person-profile.tsx` | `apps/web/app/services/profiling.ts` | `import { getSpeakingTimeStats, ... }` | WIRED | Lines 11-15 in `person-profile.tsx` |
| `apps/web/app/components/profile/stance-summary.tsx` | `apps/web/app/lib/topic-utils.ts` | `import { TOPIC_ICONS, TOPIC_COLORS, ... }` | WIRED | Line 6 in `stance-summary.tsx` |
| `apps/web/app/components/profile/stance-summary.tsx` | `apps/web/app/components/profile/stance-spectrum.tsx` | `import { StanceSpectrum }` | WIRED | Line 7 in `stance-summary.tsx` |
| `apps/web/app/routes/compare.tsx` | `apps/web/app/services/profiling.ts` | `import { getCouncillorStances, getSpeakingTimeByTopic, ... }` | WIRED | Lines 7-13 in `compare.tsx` |
| `apps/web/app/routes/compare.tsx` | `apps/web/app/lib/alignment-utils.ts` | `import { calculateAlignmentForPerson }` | WIRED | Line 17 in `compare.tsx` |
| `apps/web/app/routes/compare.tsx` | `apps/web/app/services/people.ts` | `import { fetchRelevantVotesForAlignment }` | WIRED | Line 5 in `compare.tsx` |
| `apps/pipeline/pipeline/profiling/stance_generator.py` | Gemini API | `genai.Client(api_key=...)` + `client.models.generate_content(...)` | WIRED | Lines 18, 50-61, 303 in `stance_generator.py` |
| `apps/pipeline/pipeline/profiling/stance_generator.py` | `councillor_stances` table | `supabase.table("councillor_stances").upsert(...)` | WIRED | Line 390 in `stance_generator.py` |
| `apps/pipeline/main.py` | `apps/pipeline/pipeline/orchestrator.py` | `app.generate_stances(person_id=...)` | WIRED | Line 189 in `main.py` |
| `apps/pipeline/pipeline/orchestrator.py` | `stance_generator.generate_all_stances` | lazy import inside `generate_stances()` | WIRED | Line 447 in `orchestrator.py` |
| `apps/web/app/components/navbar.tsx` | `/compare` route | NavDropdown entry `{ name: "Compare", href: "/compare" }` | WIRED | Lines 180, 285-288 in `navbar.tsx` |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PROF-02 | 09-01, 09-03 | Councillor page shows speaking time metrics calculated from transcript segment durations | SATISFIED | `get_speaking_time_stats` RPC aggregates from `transcript_segments`; `SpeakingTimeCard` displays hours, meeting count, trend, topic breakdown |
| PROF-04 | 09-01, 09-02, 09-03 | AI-generated stance summaries per councillor per topic, grounded in meeting evidence | SATISFIED | `stance_generator.py` uses Gemini with `key_statements` + `votes` evidence; stances stored in `councillor_stances`; `StanceSummary` displays per-topic cards |
| PROF-05 | 09-02, 09-03 | Stance summaries include confidence scoring and links to source evidence | SATISFIED | Confidence thresholds enforced (<3/3-7/8+); `confidenceBadge()` displays "Based on N statements"; `EvidenceSection` shows collapsible quotes linking to meeting pages |
| PROF-06 | 09-04 | User can compare two councillors side-by-side (voting record, stances, activity) | SATISFIED | `/compare` route with selection mode, voting alignment %, per-topic `StanceSpectrum` comparison with agree/disagree indicators, activity stats grid |

No orphaned requirements found. All four IDs (PROF-02, PROF-04, PROF-05, PROF-06) are claimed by plans and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `speaking-time-card.tsx` | 188 | `return null` for empty topics | Info | Expected guard — only suppresses the topic breakdown section when no data; headline still renders |
| `compare.tsx` | 861, 887 | `return null` for zero-data conditions | Info | Expected guards — suppresses the speaking time comparison chart only when all values are zero; not a stub |

No blockers. All `return null` instances are defensive guards, not placeholder implementations.

### Human Verification Required

#### 1. Speaking Time Card Visual Rendering

**Test:** Navigate to a councillor profile with transcript data (e.g. /people/35). Scroll to the Speaking Time card in the sidebar.
**Expected:** SVG sparkline shows meeting-by-meeting trend with blue fill area, individual data points, and a dashed council average line. Time-range tabs (Last 12 months / Current term / All time) are visible and clickable.
**Why human:** SVG rendering and tab interactivity cannot be verified by file analysis.

#### 2. Stance Evidence Expand/Collapse

**Test:** On a profile page with stance data loaded (requires --generate-stances to have run), open the Positions tab and click "X evidence quotes" on a stance card.
**Expected:** Evidence section expands showing quoted text in italics, date linked to meeting page. Clicking again collapses it.
**Why human:** React state toggle and DOM visibility require browser.

#### 3. Compare Page Mobile Swipe

**Test:** Navigate to /compare?a=35&b=37 on a mobile viewport (<768px). Observe the sticky comparison bar above the page. Swipe left on the activity cards.
**Expected:** Activity cards snap between councillor A and B views. The fixed bar at top-16 shows both names and alignment badge throughout.
**Why human:** scroll-snap swipe UX requires actual touch interaction.

#### 4. Compare Button Pre-selection

**Test:** Visit a councillor profile page (/people/35) and click the "Compare" button in the card header.
**Expected:** Navigates to /compare?a=35 with the first councillor pre-selected and the page in selection mode prompting for the second.
**Why human:** Navigation state and pre-selection rendering require browser.

#### 5. End-to-End Stance Generation

**Test:** Run `cd apps/pipeline && uv run python main.py --generate-stances --target 35` with GEMINI_API_KEY set.
**Expected:** Console shows "[Stances] Processing {name} - {topic} ({n} evidence items)..." for each topic; `councillor_stances` table gains 1-8 rows for person 35; running again upserts without duplicates.
**Why human:** Requires live Gemini API call and live Supabase write.

### Summary

Phase 09 goal is fully achieved. All 12 observable truths verified, all 14 artifacts exist with substantive implementations well above minimum line counts, and all 15 key links are confirmed wired — not orphaned stubs.

**PROF-02 (Speaking time metrics):** Three SQL RPCs aggregate from `transcript_segments` server-side. The `SpeakingTimeCard` component renders headline hours, SVG sparkline, council average line, and topic breakdown bars. Time-range filtering uses URL search params so the loader re-fetches on change.

**PROF-04 (AI stance summaries):** `stance_generator.py` (504 lines) gathers up to 15 key statements + 10 votes per councillor/topic pair, builds a Gemini prompt with evidence, parses the JSON response, and upserts to `councillor_stances`. The `StanceSummary` component renders per-topic cards with `StanceSpectrum` visualization.

**PROF-05 (Confidence + source links):** Confidence thresholds (<3/3-7/8+) are enforced both in the Python pipeline (`_determine_confidence`) and at the prompt level (hedged language instructions). Evidence quotes are stored as JSONB with `meeting_id` references; the `EvidenceSection` component links to `/meetings/{id}`.

**PROF-06 (Side-by-side comparison):** The `/compare` route implements dual-mode logic (selection vs comparison), computes pairwise voting alignment via the existing `calculateAlignmentForPerson` utility, shows all 8 topics with agree/disagree indicators, and implements mobile scroll-snap swipe between activity cards.

No stubs, no orphaned files, no blocker anti-patterns. Five human-verification items cover visual rendering, interactive state, and live API integration.

---

_Verified: 2026-02-18T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
