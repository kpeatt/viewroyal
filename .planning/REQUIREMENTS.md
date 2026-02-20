# Requirements: ViewRoyal.ai

**Defined:** 2026-02-19
**Core Value:** Citizens can understand what their council decided, why, and who said what — without attending meetings or reading hundreds of pages of PDFs.

## v1.2 Requirements

Requirements for Pipeline Automation milestone. Each maps to roadmap phases.

### Update Detection

- [x] **DETECT-01**: Pipeline detects new documents (minutes, additional PDFs) on CivicWeb for meetings already in the local archive
- [x] **DETECT-02**: Pipeline detects new video availability on Vimeo for meetings already in the local archive
- [x] **DETECT-03**: Pipeline selectively re-ingests only meetings with new content, skipping meetings with no changes

### Scheduling

- [ ] **SCHED-01**: Pipeline runs daily on Mac Mini via launchd plist
- [ ] **SCHED-02**: Pipeline output logs to a rotating log file for debugging
- [ ] **SCHED-03**: Lock file prevents overlapping pipeline runs

### Notifications

- [x] **NOTIF-01**: Pipeline sends Moshi push notification when new content is found and processed
- [x] **NOTIF-02**: Notification includes summary with meeting names and content types (e.g., "Jan 15 Council (minutes), Feb 3 Council (video)")

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Pipeline Enhancements

- **PIPE-01**: Detect updated/replaced documents on CivicWeb (not just new ones)
- **PIPE-02**: Gemini Batch API extraction backfill for all meetings (paused Phase 7.1)
- **PIPE-03**: Health check endpoint for monitoring pipeline status remotely

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloud-hosted pipeline (Fly.io, Railway, etc.) | Mac Mini is sufficient; MLX diarization requires Apple Silicon |
| Web dashboard for pipeline status | Over-engineering for a single-user automation setup |
| Slack/Discord notifications | Moshi push covers the notification need |
| Automatic retry on failure | Keep it simple — log failures, investigate manually |
| Multi-municipality scheduled runs | Focus on View Royal first; expand when second town onboards |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DETECT-01 | Phase 12 | Complete |
| DETECT-02 | Phase 12 | Complete |
| DETECT-03 | Phase 12 | Complete |
| SCHED-01 | Phase 14 | Pending |
| SCHED-02 | Phase 14 | Pending |
| SCHED-03 | Phase 14 | Pending |
| NOTIF-01 | Phase 13 | Complete |
| NOTIF-02 | Phase 13 | Complete |

**Coverage:**
- v1.2 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 after roadmap creation*
