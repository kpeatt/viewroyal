# Roadmap: ViewRoyal.ai

## Milestones

- ✅ **v1.0 Land & Launch** -- Phases 1-6 (shipped 2026-02-17) -- [Archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Deep Intelligence** -- Phases 7-11 (shipped 2026-02-19) -- [Archive](milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 Pipeline Automation** -- Phases 12-14 (in progress)

## Phases

<details>
<summary>✅ v1.0 Land & Launch (Phases 1-6) -- SHIPPED 2026-02-17</summary>

- [x] Phase 1: Schema Foundation (2/2 plans) -- completed 2026-02-16
- [x] Phase 2: Multi-Tenancy (1/1 plans) -- completed 2026-02-16
- [x] Phase 3: Subscriptions & Notifications (2/2 plans) -- completed 2026-02-17
- [x] Phase 4: Home Page Enhancements (2/2 plans) -- completed 2026-02-16
- [x] Phase 5: Advanced Subscriptions (3/3 plans) -- completed 2026-02-16
- [x] Phase 6: Gap Closure & Cleanup (1/1 plans) -- completed 2026-02-17

</details>

<details>
<summary>✅ v1.1 Deep Intelligence (Phases 7-11) -- SHIPPED 2026-02-19</summary>

- [x] Phase 7: Document Intelligence (3/3 plans) -- completed 2026-02-17
- [ ] ~~Phase 7.1: Upgrade Document Extraction (2/3 plans) -- paused (Batch API)~~
- [x] Phase 8: Unified Search & Hybrid RAG (5/5 plans) -- completed 2026-02-18
- [x] Phase 9: AI Profiling & Comparison (4/4 plans) -- completed 2026-02-18
- [x] Phase 10: Add Better Test Suite (5/5 plans) -- completed 2026-02-19
- [x] Phase 11: Gap Closure & Gemini Fix (1/1 plans) -- completed 2026-02-19

</details>

### 🚧 v1.2 Pipeline Automation (In Progress)

**Milestone Goal:** Make the pipeline run unattended on a daily schedule, automatically detecting and processing new minutes/video for existing meetings, with push notifications on new content.

- [x] **Phase 12: Update Detection** - Pipeline detects new documents and video for existing meetings and selectively re-ingests only what changed (completed 2026-02-20)
- [x] **Phase 13: Notifications** - Pipeline sends push notifications summarizing new content found and processed (completed 2026-02-20)
- [ ] **Phase 14: Scheduled Automation** - Pipeline runs daily via launchd with logging and concurrency protection

## Phase Details

### Phase 12: Update Detection
**Goal**: Pipeline can compare CivicWeb listings and Vimeo availability against the local archive, identify meetings with new content, and selectively re-process only those meetings
**Depends on**: Nothing (first phase in milestone)
**Requirements**: DETECT-01, DETECT-02, DETECT-03
**Success Criteria** (what must be TRUE):
  1. Running the pipeline in update mode identifies meetings that have new documents (minutes, additional PDFs) not yet in the local archive
  2. Running the pipeline in update mode identifies meetings that have new video available on Vimeo when no video was previously ingested
  3. Only meetings with detected changes are re-ingested; meetings with no new content are skipped entirely
  4. After re-ingestion, the new content (documents, video/transcript) is visible in the web app on the corresponding meeting page
**Plans**: 2 plans

Plans:
- [ ] 12-01-PLAN.md -- Create UpdateDetector module with document and video change detection
- [ ] 12-02-PLAN.md -- Wire update detection into CLI and orchestrator with selective re-processing

### Phase 13: Notifications
**Goal**: Pipeline notifies the operator via Moshi push notification when new content is found and processed, with a human-readable summary
**Depends on**: Phase 12 (needs detection results to report)
**Requirements**: NOTIF-01, NOTIF-02
**Success Criteria** (what must be TRUE):
  1. When the pipeline detects and processes new content, a Moshi push notification arrives on the operator's phone
  2. The notification includes meeting names and content types found (e.g., "Jan 15 Council (minutes), Feb 3 Council (video)")
  3. When no new content is found, no notification is sent (no noise on quiet days)
**Plans**: 1 plan

Plans:
- [ ] 13-01-PLAN.md -- Create notifier module with Moshi push notifications and wire into update-mode

### Phase 14: Scheduled Automation
**Goal**: Pipeline runs daily without manual intervention, with proper logging and protection against overlapping runs
**Depends on**: Phase 13 (full pipeline flow: detect, ingest, notify)
**Requirements**: SCHED-01, SCHED-02, SCHED-03
**Success Criteria** (what must be TRUE):
  1. A launchd plist is installed on the Mac Mini that triggers the pipeline daily at a configured time
  2. Pipeline output is captured to a rotating log file that can be inspected for debugging
  3. If a pipeline run is already in progress, a second invocation exits cleanly without corrupting data or running duplicate work
  4. After 24+ hours of no manual intervention, the pipeline has run automatically and any new content is reflected in the web app
**Plans**: TBD

Plans:
- [ ] 14-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 12 -> 13 -> 14

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Schema Foundation | v1.0 | 2/2 | Complete | 2026-02-16 |
| 2. Multi-Tenancy | v1.0 | 1/1 | Complete | 2026-02-16 |
| 3. Subscriptions & Notifications | v1.0 | 2/2 | Complete | 2026-02-17 |
| 4. Home Page Enhancements | v1.0 | 2/2 | Complete | 2026-02-16 |
| 5. Advanced Subscriptions | v1.0 | 3/3 | Complete | 2026-02-16 |
| 6. Gap Closure & Cleanup | v1.0 | 1/1 | Complete | 2026-02-17 |
| 7. Document Intelligence | v1.1 | 3/3 | Complete | 2026-02-17 |
| 7.1 Upgrade Document Extraction | v1.1 | 2/3 | Paused | - |
| 8. Unified Search & Hybrid RAG | v1.1 | 5/5 | Complete | 2026-02-18 |
| 9. AI Profiling & Comparison | v1.1 | 4/4 | Complete | 2026-02-18 |
| 10. Add Better Test Suite | v1.1 | 5/5 | Complete | 2026-02-19 |
| 11. Gap Closure & Gemini Fix | v1.1 | 1/1 | Complete | 2026-02-19 |
| 12. Update Detection | 2/2 | Complete    | 2026-02-20 | - |
| 13. Notifications | 1/1 | Complete   | 2026-02-20 | - |
| 14. Scheduled Automation | v1.2 | 0/? | Not started | - |
