# GitHub Issue & Project Sync

## When to apply

This skill applies whenever GSD phases are **planned**, **executed**, or **completed**. Executors and orchestrators MUST follow these rules to keep GitHub issues and the project board (project #5) in sync with the GSD roadmap.

## Rules

### Phase Planning (new phases added to ROADMAP.md)

When new phases are added to the roadmap:

1. Create a GitHub issue for each phase using `gh issue create`
2. Title format: `Phase X.Y: <Phase Name>` (use the public-facing numbering, not internal phase numbers)
3. Label: `enhancement`
4. Body should include: goal summary, requirements list, dependencies, and milestone reference
5. Add each issue to project board #5: `gh project item-add 5 --owner "@me" --url <issue-url>`
6. Set project board status to "Todo"

### Phase Execution (phase work begins)

When a phase starts execution:

1. Find the corresponding GitHub issue by title search: `gh issue list --search "Phase X.Y" --json number`
2. Update project board status to "In Progress" for that item

### Phase Completion (phase marked complete)

When a phase is completed:

1. Close the GitHub issue with a comment summarizing what was built: `gh issue close <number> --comment "<summary>"`
2. The project board status will automatically update to "Done" when the issue is closed

### Milestone Completion

When a milestone is completed:

1. Verify all phase issues in that milestone are closed
2. Close any milestone-level tracking issues with a summary comment

### Issue-to-Phase Mapping

Current mapping (as of 2026-03-05):

| GitHub Issue | Phase | Milestone | Status |
|---|---|---|---|
| #15 | Phase 0 | v1.0 | Closed |
| #16 | Phase 1 | v1.0 | Closed |
| #17 | Phase 2 | v1.0 | Closed |
| #18 | Phase 3 | v1.0 | Closed |
| #19 | Phase 3b | v1.1 | Closed |
| #20 | Phase 3c | v1.1 | Closed |
| #21 | Phase 4 | v1.1 | Closed |
| #22 | Phase 4b | v1.5 | Closed |
| #23 | Phase 5 | v1.3 | Closed |
| #24 | Phase 5b | v1.3 | Closed |
| #38 | Phase 7 (32) | v1.7 | Open |
| #39 | Phase 7.1 (33) | v1.7 | Open |
| #40 | Phase 7.2 (34) | v1.7 | Open |
| #41 | Phase 7.3 (35) | v1.7 | Open |
| #42 | Phase 7.4 (36) | v1.7 | Open |

### Backlog issues (not tied to roadmap phases)

These are feature ideas not yet scheduled into phases. Leave open until planned:

| Issue | Title | Notes |
|---|---|---|
| #4 | Meeting Summary Cards | GSD todo #2 |
| #6 | Topic/Issue Clustering Page | GSD todo #3 |
| #8 | Financial Transparency | GSD todo #4 |
| #9 | Neighbourhood Relevance Filtering | GSD todo #5 |
| #10 | Meeting Outcome Badges | GSD todo #6 |
| #27 | Speaker Identification | GSD todo #7 |
| #43 | RAG: LLM Reranking | GSD todo #8 |
| #44 | RAG: Redesigned Tool Set | GSD todo #9 |
| #45 | RAG: Conversation Memory & Follow-ups | GSD todo #10 |
| #46 | RAG: Observability & Quality Feedback | GSD todo #11 |
| #47 | Council Member: AI Profile Generation | GSD todo #12 |
| #48 | Council Member: Profile Page Redesign | GSD todo #13, depends on #47 |

### Project board commands

```bash
# Add issue to project board
gh project item-add 5 --owner "@me" --url <issue-url>

# List project items
gh project item-list 5 --owner "@me" --format json

# Close issue with comment
gh issue close <number> --comment "<summary>"

# Create issue
gh issue create --title "Phase X.Y: Name" --label enhancement --body "<body>"
```

## Structure Mapping: GSD <-> GitHub

GSD and GitHub track work at different granularities. This mapping keeps them in sync.

### Concept mapping

| GSD Concept | GitHub Equivalent | Sync Rule |
|---|---|---|
| Milestone (v1.7) | No direct equivalent | Mention in issue body/title prefix |
| Phase (32-36) | Issue (with `enhancement` label) | 1:1 — create issue when phase added to roadmap |
| Plan (32-01, 32-02) | No equivalent | Too granular for GitHub — stays in GSD only |
| Quick task | Issue (with `quick-task` label) | Create on start, close on completion |
| Todo (STATE.md) | Backlog issue | 1:1 — each todo references a GitHub issue number |
| STATE.md status | Project board status | Sync: planning->Todo, executing->In Progress, done->Done |

### Sync triggers

| Event | GSD Action | GitHub Action |
|---|---|---|
| New milestone created | ROADMAP.md updated | Create issues for each phase, add to project board |
| Phase planning starts | STATE.md status -> planning | Project board item -> "Todo" (default) |
| Phase execution starts | STATE.md status -> executing | Project board item -> "In Progress" |
| Phase completed | ROADMAP.md checkbox, STATE.md progress | Close issue with summary comment (board auto-updates to "Done") |
| Todo added to STATE.md | New todo entry with [#N] reference | Verify issue #N exists and is open |
| Todo scheduled into a phase | Todo removed, phase added to ROADMAP.md | Issue stays open, gets phase reference in comment |
| Todo completed via quick task | Todo removed, quick task row added | Close issue with quick task reference |
| Quick task started | STATE.md quick task row | Create issue with `quick-task` label |
| Quick task completed | STATE.md row updated with commit | Close issue with summary comment |
| Backlog issue created on GitHub | — | Add matching todo to STATE.md with [#N] |

### Naming conventions

- **Phase issues**: `Phase X.Y: <Name>` (public numbering, not internal phase numbers)
  - v1.0 phases: Phase 0-4b (issues #15-#22)
  - v1.3 phases: Phase 5-5b (issues #23-#24)
  - v1.7 phases: Phase 7-7.4 (issues #38-#42)
- **Backlog issues**: Descriptive title, no phase prefix (e.g., "RAG: LLM Reranking")
- **GitHub issue body**: Always reference the GSD todo number or roadmap phase

### Important notes

- The `gh` token needs `project` write scope. If missing, run: `gh auth refresh -h github.com -s project`
- Project board is project #5 under `@me`
- Quick tasks get a GitHub issue created and closed on completion, with `quick-task` label
- Both roadmap phases and quick tasks get GitHub issues
