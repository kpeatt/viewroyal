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
| #4 | Meeting Summary Cards | Not yet planned |
| #5 | Enhanced Ask Page Discovery | Partially addressed in v1.6 |
| #6 | Topic/Issue Clustering Page | Not built |
| #8 | Financial Transparency | Not built |
| #9 | Neighbourhood Relevance Filtering | Not built |
| #10 | Meeting Outcome Badges | Not built |
| #12 | Surface Underused Schema Data | Partially addressed |
| #27 | Phase 5e: Speaker Identification | Not built |
| #28 | Phase 6: Second Town Onboarding | v1.7 covers RDOS portion |
| #43 | RAG: LLM Reranking | Split from #25 |
| #44 | RAG: Redesigned Tool Set | Split from #25 |
| #45 | RAG: Conversation Memory & Follow-ups | Split from #25 |
| #46 | RAG: Observability & Quality Feedback | Split from #25 |
| #47 | Council Member: AI Profile Generation | Split from #26 |
| #48 | Council Member: Profile Page Redesign | Split from #26, depends on #47 |

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

### Important notes

- The `gh` token needs `project` write scope. If missing, run: `gh auth refresh -h github.com -s project`
- Project board is project #5 under `@me`
- Quick tasks do NOT get GitHub issues (they're tracked only in STATE.md)
- Only roadmap phases get GitHub issues
