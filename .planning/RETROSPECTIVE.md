# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.7 — View Royal Intelligence

**Shipped:** 2026-03-24
**Phases:** 4 | **Plans:** 9

### What Was Built
- RAG observability (trace logging + user feedback) and LLM reranking for better answer quality
- Consolidated RAG agent (10 tools -> 4) with parallel sub-queries
- Topic taxonomy classification and key vote detection algorithm
- AI-generated councillor narrative profiles with evidence synthesis
- 6-tab council member profile page redesign
- Meeting attendance info and redesigned email digests

### What Worked
- SQL-first classification with Gemini fallback was highly efficient — handled majority of 12K agenda items without any API calls
- Consolidated tool pattern (Promise.all sub-queries) reduced agent round-trips while keeping code simple
- Municipality meta JSONB pattern for attendance data enabled zero-migration deployment of configurable UI data
- Graceful degradation pattern (reranking failures pass results through, email uses hardcoded fallbacks) made features robust without over-engineering
- Plan execution remained extremely fast (avg 4 min/plan) across all 9 plans

### What Was Inefficient
- 18-day calendar span for 36 minutes of execution — long gaps between sessions
- No milestone audit run before completion — skipped due to 14/14 requirements checked off

### Patterns Established
- `normalizeMotionResult` as canonical motion result comparison (handles all 11 DB values + typos)
- `MotionOutcomeBadge` as canonical motion outcome rendering component
- Municipality meta JSONB for configurable UI data with per-entity sparse overrides
- Fire-and-forget pattern for non-critical DB inserts in SSE streams
- Flatten-rerank-unflatten pattern for scoring composite tool results

### Key Lessons
1. SQL-first with AI-fallback is the right default for classification tasks — avoids unnecessary API costs and latency
2. Consolidating overlapping tools/functions into fewer with broader scope reduces confusion (both for AI agents and humans)
3. Municipality meta JSONB is a powerful pattern for municipality-specific configuration without schema changes

### Cost Observations
- Model mix: quality profile (opus for planning, sonnet for execution)
- 9 plans executed in ~36 minutes total
- Notable: v1.7 had the longest calendar duration (18 days) but shortest execution time (~36 min) of any milestone with 4+ phases

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Execution Time | Key Change |
|-----------|--------|-------|----------------|------------|
| v1.0 | 6 | 11 | 1.65h | Initial MVP, 4 PR merges |
| v1.1 | 6 | 20 | 2.77h | Largest milestone by plan count |
| v1.2 | 3 | 5 | 12min | Pipeline automation, fastest milestone |
| v1.3 | 4 | 14 | 50min | API-heavy, lots of endpoints |
| v1.4 | 6 | 10 | 46min | Documentation portal |
| v1.5 | 4 | 7 | N/A | Document experience |
| v1.6 | 3 | 7 | N/A | Search experience |
| v1.7 | 4 | 9 | 36min | Intelligence + UX polish |

### Cumulative Stats

- Total milestones shipped: 8 (v1.0 through v1.7)
- Total phases completed: 40
- Total plans executed: 78
- Requirements satisfied: 14/14 (v1.7), all prior milestones at 100%

### Top Lessons (Verified Across Milestones)

1. SQL-first approaches (RPCs, IMMUTABLE functions) outperform API calls for batch operations — verified in v1.1 (RRF), v1.3 (OCD IDs), v1.7 (topic classification)
2. Graceful degradation patterns (catch + passthrough) make features robust without over-engineering — verified across RAG, email, and profile features
3. Municipality meta JSONB is the right pattern for per-municipality configuration — established v1.0, extended v1.7
