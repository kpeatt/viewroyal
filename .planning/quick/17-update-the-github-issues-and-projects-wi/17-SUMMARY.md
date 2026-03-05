---
phase: quick-17
plan: 01
subsystem: infra
tags: [github, project-management, issues]

requires:
  - phase: none
    provides: n/a
provides:
  - "GitHub issues synchronized with actual project state"
  - "v1.7 RDOS Ingestion phases tracked as issues #38-#42"
  - "Shipped milestones properly closed (#22, #23, #24)"
affects: [v1.7-rdos-ingestion]

tech-stack:
  added: []
  patterns: ["GitHub issue naming: Phase X.Y for milestone phases"]

key-files:
  created: []
  modified: []

key-decisions:
  - "Used Phase 7.x numbering for GitHub issues to match existing convention (internal roadmap Phase 32-36)"
  - "Project board item-add deferred due to missing project write scope on gh token"

patterns-established:
  - "GitHub issues reference roadmap phase numbers in body for traceability"

requirements-completed: [SYNC-01]

duration: 2min
completed: 2026-03-05
---

# Quick Task 17: GitHub Issues and Project Board Sync Summary

**Closed 3 shipped-milestone issues (#22-#24) and created 5 v1.7 RDOS Ingestion tracking issues (#38-#42) with project board cross-references**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T15:49:40Z
- **Completed:** 2026-03-05T15:51:46Z
- **Tasks:** 2
- **Files modified:** 0 (GitHub-only changes)

## Accomplishments
- Closed issues #22 (Document Viewer), #23 (Public API), #24 (OCD API) with milestone-referencing comments
- Created 5 new issues for v1.7 RDOS Ingestion: #38 Municipality Foundation, #39 Agenda Parsing, #40 YouTube Video Client, #41 Board Members, #42 End-to-End Integration
- Updated issue #28 (Second Town Onboarding) with cross-reference to v1.7 RDOS issues
- Verified project board already reflected correct "Done" status for closed issues

## Task Commits

Each task was committed atomically:

1. **Task 1: Close completed issues and update existing open issues** - `3d6b3ed2` (chore)
2. **Task 2: Create v1.7 RDOS Ingestion issues and add to project board** - `d17b012d` (chore)

## Files Created/Modified
- No files modified (all changes are GitHub Issues/Project Board operations)

## Decisions Made
- Used "Phase 7.x" numbering convention for new GitHub issues to match existing issue naming pattern (GitHub issues used "Phase 0-6" for original milestones), while roadmap uses internal Phase 32-36 numbering
- Deferred project board item-add operations due to missing `project` write scope on GitHub CLI token (only `read:project` available)

## Deviations from Plan

### Deferred Items

**1. Project board item-add for new issues #38-#42**
- **Found during:** Task 2
- **Issue:** `gh auth` token only has `read:project` scope, not `project` (write) scope
- **Impact:** New issues exist but are not added to the project board. User can add manually or run `gh auth refresh -s project` then `gh project item-add 5 --owner "@me" --url <issue-url>` for each
- **Workaround:** Issues are created and labeled; board addition is cosmetic

---

**Total deviations:** 1 deferred (auth scope limitation)
**Impact on plan:** Minor -- issues exist and are properly labeled, only board membership is missing

## Issues Encountered
- GitHub CLI token missing `project` write scope prevented adding new issues to project board. This requires `gh auth refresh -s project` to resolve.

## User Setup Required

To add the new v1.7 issues to the project board, run:
```bash
gh auth refresh -s project
for url in https://github.com/kpeatt/viewroyal/issues/{38,39,40,41,42}; do
  gh project item-add 5 --owner "@me" --url "$url"
done
```

## Next Phase Readiness
- GitHub tracking is now synchronized with project state
- v1.7 RDOS Ingestion phases have proper issue tracking for development

---
*Quick Task: 17*
*Completed: 2026-03-05*
