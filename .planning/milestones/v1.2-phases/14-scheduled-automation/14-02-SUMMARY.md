---
phase: 14-scheduled-automation
plan: 02
subsystem: pipeline
tags: [launchd, cron, shell, plist, scheduling, macos]

# Dependency graph
requires:
  - phase: 14-scheduled-automation
    provides: "PipelineLock and setup_logging for safe unattended execution"
  - phase: 12-update-detection
    provides: "Pipeline update-mode entrypoint that detects changes and processes incrementally"
provides:
  - "launchd plist for daily 6 AM scheduled pipeline execution"
  - "Shell wrapper script that sources .env, activates uv, and runs update-mode"
  - "Installation instructions for Mac Mini LaunchAgents"
affects: []

# Tech tracking
tech-stack:
  added: [launchd, StartCalendarInterval]
  patterns: [launchd plist for macOS scheduled tasks, shell wrapper for environment setup]

key-files:
  created:
    - apps/pipeline/scripts/run-pipeline.sh
    - apps/pipeline/com.viewroyal.pipeline.plist
  modified:
    - .gitignore
    - apps/pipeline/.gitignore

key-decisions:
  - "6 AM daily schedule via StartCalendarInterval -- catches overnight CivicWeb changes before workday"
  - "Absolute path to uv ($HOME/.local/bin/uv) because launchd minimal PATH excludes ~/.local/bin"
  - "Shell wrapper sources .env for Supabase/Gemini/Moshi tokens rather than hardcoding in plist"

patterns-established:
  - "launchd pattern: plist in repo, symlinked to ~/Library/LaunchAgents, loaded via launchctl"
  - "Shell wrapper pattern: source .env, cd to project, invoke uv with absolute path"

requirements-completed: [SCHED-01]

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 14 Plan 02: Launchd Scheduling Summary

**launchd plist scheduling daily 6 AM pipeline runs via shell wrapper that sources .env and invokes uv update-mode**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-20T01:56:26Z
- **Completed:** 2026-02-20T01:58:12Z
- **Tasks:** 1 (of 2; Task 2 is human-action checkpoint)
- **Files modified:** 4

## Accomplishments
- Shell wrapper script (run-pipeline.sh) that sources .env, cd's to pipeline dir, and invokes uv with absolute path in update-mode
- launchd plist (com.viewroyal.pipeline.plist) with daily 6 AM StartCalendarInterval schedule
- Explicit HOME and PATH environment variables in plist for launchd's minimal environment
- launchd stdout/stderr fallback logs in logs/ directory separate from application-level rotating log

## Task Commits

Each task was committed atomically:

1. **Task 1: Create wrapper script and launchd plist** - `4d5b3f06` (feat)

## Files Created/Modified
- `apps/pipeline/scripts/run-pipeline.sh` - Shell wrapper: sources .env, runs `uv run python main.py --update-mode` with absolute uv path
- `apps/pipeline/com.viewroyal.pipeline.plist` - launchd job: daily 6 AM, sets HOME/PATH, captures stdout/stderr to logs/
- `.gitignore` - Changed `apps/pipeline/scripts/` to glob pattern with negation for run-pipeline.sh
- `apps/pipeline/.gitignore` - Changed `scripts/` to glob pattern with negation for run-pipeline.sh

## Decisions Made
- 6 AM daily schedule via StartCalendarInterval -- council meetings are published during business hours, so 6 AM catches overnight CivicWeb changes before the workday
- Absolute path to uv ($HOME/.local/bin/uv) required because launchd runs with a minimal PATH that doesn't include ~/.local/bin
- Shell wrapper sources .env file for Supabase, Gemini, and Moshi tokens rather than embedding secrets in the plist
- launchd stdout/stderr logs are separate from the rotating pipeline.log -- they capture pre-Python failures

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated .gitignore patterns to allow run-pipeline.sh**
- **Found during:** Task 1 (Create wrapper script and launchd plist)
- **Issue:** Both root .gitignore (`apps/pipeline/scripts/`) and apps/pipeline/.gitignore (`scripts/`) used directory patterns that prevent git from tracking any file inside, including run-pipeline.sh
- **Fix:** Changed directory patterns (`scripts/`) to glob patterns (`scripts/*`) and added negation rules (`!scripts/run-pipeline.sh`) in both .gitignore files
- **Files modified:** .gitignore, apps/pipeline/.gitignore
- **Verification:** `git check-ignore` confirmed file is no longer ignored; `git status` shows it as untracked
- **Committed in:** 4d5b3f06 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to allow the wrapper script to be version-controlled. No scope creep.

## Issues Encountered

None beyond the gitignore fix documented above.

## User Setup Required

**Manual installation required.** The launchd plist must be symlinked and loaded on the Mac Mini:

1. Create logs directory: `mkdir -p ~/development/viewroyal/logs`
2. Symlink plist: `ln -sf ~/development/viewroyal/apps/pipeline/com.viewroyal.pipeline.plist ~/Library/LaunchAgents/com.viewroyal.pipeline.plist`
3. Load job: `launchctl load ~/Library/LaunchAgents/com.viewroyal.pipeline.plist`
4. Verify: `launchctl list | grep viewroyal`
5. Optional manual test: `launchctl start com.viewroyal.pipeline`

## Next Phase Readiness
- Phase 14 (Scheduled Automation) is complete once the plist is installed and verified
- Pipeline runs daily at 6 AM with lockfile protection, rotating logs, and push notifications
- Full v1.2 automation milestone is ready for production use

## Self-Check: PASSED

All files verified present. Commit 4d5b3f06 verified in git log.

---
*Phase: 14-scheduled-automation*
*Completed: 2026-02-20*
