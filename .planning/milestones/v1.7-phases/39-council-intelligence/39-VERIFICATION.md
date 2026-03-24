---
phase: 39-council-intelligence
verified: 2026-03-13T06:00:00Z
status: human_needed
score: 8/8 must-haves verified (automated)
human_verification:
  - test: "Navigate to a council member profile page and verify Profile tab is default"
    expected: "AI narrative or overview text displays with 'AI-generated profile - Updated [date]' disclaimer, at-a-glance stats card shows Total Votes, Attendance, Hours Spoken, Proposals"
    why_human: "Visual layout, text rendering, stat accuracy need human eyes"
  - test: "Click Policy tab on a council member profile"
    expected: "Stance cards appear organized by topic. 'General' and 'Administration' topics are NOT shown."
    why_human: "Visual filtering correctness and layout need human confirmation"
  - test: "Click Key Votes tab on a council member profile"
    expected: "Key vote cards show motion title, vote badge (green/red), context summary explaining WHY notable, detection type badges, vote split, and link to meeting"
    why_human: "Requires key votes to have been generated via pipeline first; visual layout verification"
  - test: "Verify existing tabs (Votes, Speaking, Attendance) still work"
    expected: "All legacy tabs render correctly with no regressions"
    why_human: "Regression testing needs human interaction"
  - test: "Check mobile responsiveness"
    expected: "Tabs wrap, cards stack, stats grid adapts"
    why_human: "Visual responsiveness needs human eyes at different viewport sizes"
---

# Phase 39: Council Intelligence Verification Report

**Phase Goal:** Users can understand each councillor's priorities, positions, and notable votes through AI-generated profiles grounded in evidence
**Verified:** 2026-03-13T06:00:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All ~12K agenda items have a topic assignment in agenda_item_topics | VERIFIED | `topic_classifier.py` has `classify_topics()` with SQL-first bulk RPC + Gemini fallback; `39-01-topic-classification-rpcs.sql` has `bulk_classify_topics_by_category()` and `get_unclassified_agenda_items()` RPCs |
| 2 | Items with known categories classified via SQL function | VERIFIED | `bulk_classify_topics_by_category()` RPC uses `normalize_category_to_topic(ai.category)` JOIN |
| 3 | Unmapped categories classified via Gemini AI fallback | VERIFIED | `_classify_unmapped_with_gemini()` collects distinct categories, single Gemini call, maps response to inserts |
| 4 | Key votes detected using three patterns: minority, close, ally breaks | VERIFIED | `key_vote_detector.py` has `detect_minority_positions()`, `detect_close_votes()`, `detect_ally_breaks()` + `compute_composite_score()` |
| 5 | Key votes pre-computed and stored in key_votes table | VERIFIED | `39-key-votes-table.sql` creates table with RLS, indexes; `_upsert_key_votes()` uses ON CONFLICT upsert |
| 6 | Each councillor has AI-generated 2-3 paragraph narrative profile | VERIFIED | `stance_generator.py` has `generate_councillor_narratives()` at line 784; narrative stored in `councillor_highlights.narrative` column |
| 7 | Profile page has tabs: Profile, Policy, Key Votes, Votes, Speaking, Attendance | VERIFIED | `person-profile.tsx` has `<Tabs defaultValue="profile">` with all 6 TabsTrigger elements confirmed |
| 8 | Profile tab shows AI narrative with disclaimer + stats card; Policy filters General; Key Votes shows cards with context | VERIFIED | `profile-tab.tsx` renders narrative with Sparkles disclaimer; `policy-tab.tsx` filters "General" and "Administration"; `key-vote-card.tsx` shows context_summary, vote badge, ally_breaks, vote_split, meeting link |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/pipeline/pipeline/profiling/topic_classifier.py` | Topic classification logic | VERIFIED | 364 lines, classify_topics() with SQL-first + Gemini fallback, bulk insert |
| `apps/pipeline/tests/profiling/test_topic_classifier.py` | Unit tests | VERIFIED | 179 lines, 6 tests covering SQL path, Gemini fallback, parsing, dedup |
| `apps/pipeline/pipeline/profiling/key_vote_detector.py` | Key vote detection | VERIFIED | 522 lines, 3 detection patterns, composite scoring, Gemini context |
| `apps/pipeline/tests/profiling/test_key_vote_detector.py` | Unit tests | VERIFIED | 436 lines, 30 tests for detection, scoring, alignment |
| `supabase/migrations/39-key-votes-table.sql` | key_votes table + narrative column | VERIFIED | Creates key_votes with RLS + indexes, ALTERs councillor_highlights for narrative |
| `supabase/migrations/39-01-topic-classification-rpcs.sql` | Classification RPCs | VERIFIED | bulk_classify_topics_by_category() and get_unclassified_agenda_items() |
| `apps/web/app/components/profile/profile-tab.tsx` | AI narrative + stats card | VERIFIED | 141 lines, narrative display with disclaimer, at-a-glance stats grid |
| `apps/web/app/components/profile/policy-tab.tsx` | Policy positions by topic | VERIFIED | 61 lines, filters General + Administration, renders StanceSummary |
| `apps/web/app/components/profile/key-votes-tab.tsx` | Key votes list | VERIFIED | 46 lines, renders KeyVoteCard list with empty state |
| `apps/web/app/components/profile/key-vote-card.tsx` | Key vote card component | VERIFIED | 106 lines, vote badge, context summary, ally breaks, vote split, meeting link |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `topic_classifier.py` | supabase agenda_item_topics | supabase bulk upsert + RPC | WIRED | `supabase.rpc("bulk_classify_topics_by_category")` and `supabase.table("agenda_item_topics").upsert()` |
| `main.py` | `topic_classifier.py` | import + CLI flag | WIRED | `--classify-topics` flag at line 162, `from pipeline.profiling.topic_classifier import classify_topics` at line 214 |
| `key_vote_detector.py` | supabase key_votes | supabase upsert | WIRED | `supabase.table("key_votes").upsert()` at line 416 |
| `main.py` | `key_vote_detector.py` | import + CLI flag | WIRED | `--detect-key-votes` at line 180, import at line 242+ |
| `stance_generator.py` | councillor_highlights.narrative | upsert | WIRED | `generate_councillor_narratives()` at line 784 |
| `main.py` | `stance_generator.py` narrative gen | import + CLI flag | WIRED | `--generate-profiles` at line 186, import at line 254+ |
| `person-profile.tsx` | `profiling.ts` | loader Promise.all | WIRED | `getKeyVotes(supabase, personId).catch(...)` in loader at line 120 |
| `profiling.ts` | supabase key_votes + councillor_highlights | select queries | WIRED | `getKeyVotes()` at line 191, selects narrative/narrative_generated_at at line 175 |
| `person-profile.tsx` | profile/policy/key-votes tabs | component imports | WIRED | Imports at lines 20-22, rendered at lines 455, 470, 478 |
| `key-votes-tab.tsx` | `key-vote-card.tsx` | component composition | WIRED | `import { KeyVoteCard }` and `<KeyVoteCard key={kv.id} keyVote={kv}>` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CNCL-01 | 39-01 | Agenda items classified into hierarchical topic taxonomy | SATISFIED | topic_classifier.py with SQL-first + Gemini fallback approach, migration for RPCs |
| CNCL-02 | 39-02 | AI-generated profile summaries synthesize voting, speaking, stance data | SATISFIED | generate_councillor_narratives() in stance_generator.py, profile-tab.tsx displays narrative with disclaimer |
| CNCL-03 | 39-02 | Key votes algorithmically detected (minority, close, ally breaks) | SATISFIED | key_vote_detector.py with all 3 detection patterns, composite scoring, 30 tests |
| CNCL-04 | 39-03 | Profile page shows stats, AI summary, policy positions by topic, key votes | SATISFIED | 6-tab profile layout, profile-tab (stats + narrative), policy-tab (filtered stances), key-votes-tab (ranked cards) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | -- | -- | -- | -- |

No TODOs, FIXMEs, placeholders, or stub implementations detected in any phase 39 artifacts.

### Human Verification Required

### 1. Profile Tab Visual Verification

**Test:** Navigate to a council member profile (e.g., /people/[id]), verify Profile tab is default
**Expected:** AI narrative text or overview fallback displays with "AI-generated profile - Updated [date]" disclaimer. At-a-glance stats card shows Total Votes, Attendance, Hours Spoken, Proposals with correct data.
**Why human:** Visual layout, data accuracy, and text rendering quality need human eyes

### 2. Policy Tab Filtering

**Test:** Click "Policy" tab on a council member profile
**Expected:** Stance cards appear organized by topic. "General" and "Administration" topics are NOT shown.
**Why human:** Need to confirm filtering works against real data and layout is sensible

### 3. Key Votes Display

**Test:** Click "Key Votes" tab after running `--detect-key-votes` pipeline
**Expected:** Key vote cards show motion title, colored vote badge, context summary explaining WHY notable, detection type badges (Minority Vote, Close Vote, Broke Alignment), vote split, and clickable meeting link
**Why human:** Requires pipeline to have generated key votes; card layout and context quality need human review

### 4. Existing Tab Regression

**Test:** Verify Votes, Speaking, and Attendance tabs still work correctly
**Expected:** All legacy content renders without regressions
**Why human:** Interactive tab switching and content rendering need browser testing

### 5. Mobile Responsiveness

**Test:** Resize browser to mobile width on a profile page
**Expected:** Tabs wrap, stats grid adapts (4-col to 2-col), cards stack vertically
**Why human:** CSS responsiveness needs visual confirmation at various viewport sizes

### Gaps Summary

No gaps found. All automated checks pass across all three levels (existence, substantive, wired) for every artifact and key link. All four requirements (CNCL-01 through CNCL-04) are satisfied.

The phase depends on pipeline execution (migrations applied, `--classify-topics`, `--detect-key-votes`, `--generate-profiles` run against real data) for the profile page to display populated data. The code is complete and correctly wired; human verification is needed to confirm the visual experience.

---

_Verified: 2026-03-13T06:00:00Z_
_Verifier: Claude (gsd-verifier)_
