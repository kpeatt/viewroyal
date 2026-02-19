# Phase 10: Add Better Test Suite - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Comprehensive automated test suite covering the full Python ETL pipeline (all 5 phases) with light coverage of the React Router 7 web app's server layer. Tests catch expensive mistakes — bad data in Supabase, broken deploys, silent pipeline failures — before they happen. No CI pipeline in this phase (local-only with pre-deploy hooks).

</domain>

<decisions>
## Implementation Decisions

### Scope & priorities
- Pipeline is the primary focus — all 5 phases (scrape, download, diarize, refine/ingest, embed)
- Web app gets light coverage — server loaders and API routes (not UI components)
- Use real meeting data from View Royal as test fixtures (Claude picks a canonical meeting with good feature coverage)
- Include snapshot/golden-file testing for AI outputs (Gemini extraction results, stance generation)

### Coverage philosophy
- Comprehensive: happy paths, error paths, edge cases, boundary conditions
- 80%+ line coverage target with coverage reporting
- Coverage tracked and reported now, enforced as a build gate later once stable

### Pain points driving this
- Mistakes are expensive to fix after the fact — bad DB data, broken production, silent pipeline failures
- Currently manually checking both pipeline output in Supabase AND web app pages after changes
- Proactive: codebase is growing, safety nets needed before problems compound
- Close calls caught manually that tests should have caught

### Workflow integration
- Tests run locally only (no CI/GitHub Actions in this phase)
- Pre-deploy hooks: tests must pass before `pnpm deploy` and pipeline runs succeed
- Test commands and reporting format at Claude's discretion

### Claude's Discretion
- External service handling strategy (mock vs integration mix)
- Whether to restructure existing pipeline tests or build on them
- Which web app loaders/API routes to cover (highest-value picks)
- Schema/migration testing (whether it's worth the effort)
- Full E2E pipeline test vs phase-level integration tests
- Test reporting format and coverage report tooling
- Unified root test command vs separate per-app commands
- Canonical test meeting selection from real data

</decisions>

<specifics>
## Specific Ideas

- Real meeting data as fixtures — snapshot actual PDFs, transcripts, API responses from known meetings
- Golden-file testing for AI outputs — capture known-good Gemini extraction and stance generation results
- Pre-deploy hook integration — tests gate both web deploys and pipeline runs
- Mistakes are expensive, not just risky — the priority is catching things that cost time to diagnose and repair

</specifics>

<deferred>
## Deferred Ideas

- CI/GitHub Actions integration — add in a future phase once test suite is stable
- Coverage enforcement as a build gate — report now, enforce later
- Web app UI/component testing — only server layer covered in this phase

</deferred>

---

*Phase: 10-add-better-test-suite*
*Context gathered: 2026-02-18*
