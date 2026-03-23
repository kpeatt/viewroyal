---
phase: 19-fix-mar17-shared-video
plan: 01
subsystem: pipeline
tags: [bugfix, vimeo, video-matching]
dependency_graph:
  requires: []
  provides: [meeting-type-aware-video-matching]
  affects: [pipeline-ingestion, vimeo-integration]
tech_stack:
  added: []
  patterns: [negative-keyword-matching, safe-fallback]
key_files:
  modified:
    - apps/pipeline/pipeline/video/vimeo.py
    - apps/pipeline/pipeline/ingestion/ingester.py
decisions:
  - Return None instead of wrong video when type hint exists but no keyword match found
  - Mirror orchestrator negative-matching pattern in search_video
metrics:
  duration: 3min
  completed: "2026-03-23T18:08:42Z"
---

# Quick Task 19: Fix Mar 17 Public Hearing and Council Meeting Video Matching

Improved Vimeo search_video to use negative keyword matching when multiple videos exist for the same date, preventing cross-assignment of Public Hearing and Council meeting videos.

## What Was Done

### Task 1: Investigation and Root Cause Diagnosis

Queried the Supabase meetings table and Vimeo API for 2026-03-17 data:

- **Two separate Vimeo videos exist:** "2026 03 17 Public Hearing" and "2026 03 17 Council Meeting"
- **DB already had correct video URLs** (different for each meeting), but the code had a latent bug
- **Root cause:** `search_video` fallback (line 149-151) returned the first date-matching video regardless of meeting type when keyword matching failed. With multiple videos on the same date, this could silently assign the wrong video.
- **Secondary issue:** The "council" keyword check would match any video containing "council" even if the hint was for a specific non-council meeting type, because there was no negative matching.
- **Additional finding:** Meeting ID 3669 had type "Regular Council" but title "Public Hearing" -- corrected in DB.

### Task 2: Fix Video Matching

**Part A - search_video improvements (vimeo.py):**
- Collect all date-matching videos first, then apply intelligent matching
- Single video for a date: return it directly (no ambiguity)
- Multiple videos: use keyword matching with negative checks (mirrors orchestrator logic)
  - "public hearing" hint: match videos with "public hearing" in title
  - "council" hint: prefer videos with "council" but NOT "public hearing" in title
  - "committee" hint: match "committee" or "cow" in title
- When a type hint is provided but no match found: return None (safe) instead of wrong fallback
- Date-based fallback only used when no specific meeting type hint exists

**Part B - Ingester fix (ingester.py):**
- Changed `search_video` call to pass `m_type_guess` (structured type like "Public Hearing", "Regular Council") instead of raw `meta["title"]` (folder name), ensuring cleaner keyword matching

**Part C - Data fix:**
- Fixed meeting 3669 type from "Regular Council" to "Public Hearing" in DB

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed meeting type for Public Hearing (ID 3669)**
- **Found during:** Task 2 Part C
- **Issue:** Meeting with title "Public Hearing" had type "Regular Council"
- **Fix:** Updated type to "Public Hearing" via DB update
- **Files modified:** Database only (no code change)

## Verification

- `search_video('2026-03-17', 'Regular Council')` returns Council Meeting video (vimeo.com/1174919820)
- `search_video('2026-03-17', 'Public Hearing')` returns Public Hearing video (vimeo.com/1174916770)
- Different URLs confirmed (not same video)
- 423 existing tests pass (1 pre-existing failure in test_marker_ocr.py unrelated)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 2 | 07e9cb57 | fix(19-01): improve Vimeo video matching for same-date multi-meeting scenarios |

## Self-Check: PASSED

- [x] apps/pipeline/pipeline/video/vimeo.py modified with negative matching
- [x] apps/pipeline/pipeline/ingestion/ingester.py modified to pass m_type_guess
- [x] Commit 07e9cb57 exists
- [x] All tests pass (excluding pre-existing failure)
