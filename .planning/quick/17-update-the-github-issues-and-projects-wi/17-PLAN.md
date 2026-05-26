---
phase: quick-17
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: [SYNC-01]

must_haves:
  truths:
    - "GitHub issues that correspond to shipped milestones are closed with appropriate comments"
    - "GitHub project board reflects current status (Done for shipped phases, In Progress for v1.7)"
    - "New issues exist for v1.7 RDOS Ingestion phases not yet tracked"
    - "Open issues that were completed as part of shipped milestones are closed"
  artifacts: []
  key_links: []
---

<objective>
Synchronize GitHub Issues and Project Board with actual project state.

Purpose: The .planning/ roadmap shows v1.0-v1.6 shipped (31 phases, 76 plans) plus 15 quick tasks completed, but GitHub only tracks Phases 0-4 as closed issues and the project board is stale. Several open issues (#22 Document Viewer, #23 Public API, #24 OCD API) correspond to shipped work. v1.7 RDOS Ingestion has no GitHub tracking at all.

Output: GitHub issues and project board accurately reflect what has been built, what is in progress, and what remains.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Close completed issues and update existing open issues</name>
  <files></files>
  <action>
Using the `gh` CLI, close GitHub issues that correspond to shipped work with explanatory comments:

**Close these open issues (shipped in milestones):**

1. **#22 Phase 4b: Document Viewer** -- Shipped in v1.5 Document Experience (Phases 25-28, completed 2026-02-28). Close with comment: "Shipped as part of v1.5 Document Experience milestone (Phases 25-28). Document viewer with section rendering, table of contents, agenda package view, and bidirectional linking all implemented. Completed 2026-02-28."

2. **#23 Phase 5: Public API** -- Shipped in v1.3 Platform APIs (Phases 15-18, completed 2026-02-22). Close with comment: "Shipped as part of v1.3 Platform APIs milestone (Phases 15-18). Full REST API with key auth, rate limiting, paginated endpoints, and OpenAPI docs. Completed 2026-02-22."

3. **#24 Phase 5b: Open Civic Data (OCD) API** -- Shipped in v1.3 Platform APIs (Phase 17 specifically). Close with comment: "Shipped as part of v1.3 Platform APIs milestone (Phase 17: OCD Interoperability, 6 plans). Full OCD-compliant endpoints for jurisdictions, organizations, people, events, bills, and votes. Completed 2026-02-21."

**Update project board statuses:**
For each issue on the project board (project #5) that is currently "Todo" but corresponds to shipped work, update status to "Done":
- #22, #23, #24 (closing above will help, but also update project status)

**Leave these open issues as-is (genuinely not yet built):**
- #4 Meeting Summary Cards -- not yet implemented
- #5 Enhanced Ask Page Discovery -- partially addressed in v1.6 search but suggested questions not built
- #6 Topic/Issue Clustering Page -- not built
- #8 Financial Transparency -- not built
- #9 Neighbourhood Relevance Filtering -- not built (and neighborhood column still missing from DB)
- #10 Meeting Outcome Badges -- not built
- #12 Surface Underused Schema Data -- tracking issue, partially addressed
- #25 Phase 5c: AI Search & RAG Enhancements -- partially done in v1.1/v1.6 but major items remain
- #26 Phase 5d: Council Member Profiling -- basic profiles exist (v1.1 Phase 9) but advanced profiling not built
- #27 Phase 5e: Speaker Identification -- not built beyond basic diarization
- #28 Phase 6: Second Town Onboarding -- this is essentially what v1.7 RDOS Ingestion is doing, but scoped differently

Commands pattern:
```
gh issue close NUMBER --comment "COMMENT"
```

For project board updates, use:
```
gh project item-edit --project-id PVT_kwHOAAbUw84BPTAB --id ITEM_ID --field-id STATUS_FIELD_ID --single-select-option-id DONE_OPTION_ID
```
  </action>
  <verify>
    <automated>gh issue list --state open --json number,title | python3 -c "import json,sys; issues=json.load(sys.stdin); nums=[i['number'] for i in issues]; assert 22 not in nums and 23 not in nums and 24 not in nums, f'Issues still open: {[n for n in [22,23,24] if n in nums]}'; print('OK: #22, #23, #24 all closed')"</automated>
  </verify>
  <done>Issues #22, #23, #24 closed with milestone-referencing comments. Project board items updated to Done.</done>
</task>

<task type="auto">
  <name>Task 2: Create v1.7 RDOS Ingestion issues and add to project board</name>
  <files></files>
  <action>
Create new GitHub issues for the v1.7 RDOS Ingestion milestone phases that are not yet tracked. Use the `gh` CLI. Each issue should have the "enhancement" label and reference the roadmap phase details.

**Create these issues:**

1. **"Phase 7: Municipality Foundation + Escribemeetings Scraper"** (Phase 32)
   - Body: Summary from ROADMAP Phase 32 -- RDOS municipality record in DB, Escribemeetings API scraper for meeting discovery and document download. Requirements: MUNI-01, SCRP-01, SCRP-02, SCRP-03. Part of v1.7 RDOS Ingestion milestone.
   - Label: enhancement

2. **"Phase 7.1: Agenda Parsing"** (Phase 33)
   - Body: Summary from ROADMAP Phase 33 -- HTML agenda parser for Escribemeetings with PDF+AI fallback. Requirements: AGND-01, AGND-02. Depends on Phase 32. Part of v1.7 RDOS Ingestion milestone.
   - Label: enhancement

3. **"Phase 7.2: YouTube Video Client"** (Phase 34)
   - Body: Summary from ROADMAP Phase 34 -- YouTube channel listing, audio download via yt-dlp, orchestrator routing. Requirements: TUBE-01, TUBE-02, TUBE-03, MUNI-02. Depends on Phase 32. Part of v1.7 RDOS Ingestion milestone.
   - Label: enhancement

4. **"Phase 7.3: Board Members"** (Phase 35)
   - Body: Summary from ROADMAP Phase 35 -- Scrape RDOS board members and election data. Requirements: MEMB-01, MEMB-02. Depends on Phase 32. Part of v1.7 RDOS Ingestion milestone.
   - Label: enhancement

5. **"Phase 7.4: End-to-End Integration"** (Phase 36)
   - Body: Summary from ROADMAP Phase 36 -- Full 5-phase pipeline run for RDOS Board meetings with --municipality rdos flag. Requirements: INTG-01. Depends on Phases 32-35. Part of v1.7 RDOS Ingestion milestone.
   - Label: enhancement

**Note on naming:** Use "Phase 7.x" numbering to match the GitHub issue convention (GitHub issues used "Phase 0-6" for the original milestones). The internal roadmap uses Phase 32-36 but externally these are the 7th major phase grouping.

After creating issues, add each to the project board (project #5) with status "Todo":
```
gh project item-add 5 --owner "@me" --url ISSUE_URL
```

Also update issue #28 ("Phase 6: Second Town Onboarding") with a comment noting that v1.7 RDOS Ingestion (the new issues) covers the RDOS portion of this broader goal, and that the Esquimalt/Legistar portion remains future work.
  </action>
  <verify>
    <automated>gh issue list --state open --label enhancement --json number,title | python3 -c "import json,sys; issues=json.load(sys.stdin); titles=[i['title'] for i in issues]; assert any('Escribemeetings' in t or 'Municipality Foundation' in t for t in titles), f'Missing RDOS issue. Open issues: {titles}'; print('OK: v1.7 issues created')"</automated>
  </verify>
  <done>Five new GitHub issues created for v1.7 RDOS Ingestion phases, all added to the project board with "Todo" status. Issue #28 updated with cross-reference comment.</done>
</task>

</tasks>

<verification>
- `gh issue list --state open` shows no issues for shipped work (#22, #23, #24 closed)
- `gh issue list --state open --label enhancement` includes new v1.7 phase issues
- `gh project item-list 5 --owner "@me"` shows updated statuses (Done for shipped, Todo for v1.7)
- Issue #28 has a comment referencing v1.7 RDOS issues
</verification>

<success_criteria>
GitHub Issues and Project Board accurately reflect:
1. All shipped milestones (v1.0-v1.6) have their corresponding issues closed
2. v1.7 RDOS Ingestion phases are tracked as open issues on the project board
3. Genuinely incomplete features remain open with no false closures
4. Project board statuses match reality (Done/Todo/In Progress)
</success_criteria>

<output>
After completion, create `.planning/quick/17-update-the-github-issues-and-projects-wi/17-SUMMARY.md`
</output>
