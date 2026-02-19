# Roadmap: ViewRoyal.ai

## Milestones

- ✅ **v1.0 Land & Launch** -- Phases 1-6 (shipped 2026-02-17) -- [Archive](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Deep Intelligence** -- Phases 7-9 (in progress)

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

### v1.1 Deep Intelligence

- [x] **Phase 7: Document Intelligence** - Pipeline chunks PDFs into sections with embeddings and full-text search, backfills existing documents (completed 2026-02-17)
- [ ] ~~**Phase 7.1: Upgrade Document Extraction**~~ - Gemini 2.5 Flash extraction (2/3 plans done, backfill paused — waiting on Batch API)
- [x] **Phase 8: Unified Search & Hybrid RAG** - Single search page with intent detection, hybrid search across all content types, conversation memory (completed 2026-02-18)
- [x] **Phase 9: AI Profiling & Comparison** - Speaking time metrics, AI stance summaries with evidence, side-by-side councillor comparison (completed 2026-02-18)

## Phase Details

### Phase 7: Document Intelligence
**Goal**: Every PDF document in the system is chunked into searchable, embeddable sections that downstream features can query
**Depends on**: Phase 6 (v1.0 complete)
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05
**Success Criteria** (what must be TRUE):
  1. Running the pipeline on a meeting with PDF attachments produces document_sections rows with heading-derived titles and content
  2. Each document section has a halfvec(384) embedding and a populated tsvector column
  3. Document sections are linked to the correct agenda items (verifiable on meeting detail page or via DB query)
  4. All previously-ingested documents have been backfilled into sections with embeddings (no orphan documents without sections)
  5. A full-text search query against document_sections returns relevant section-level results (not whole-document matches)
**Plans**: 2 plans

Plans:
- [ ] 07-01-PLAN.md -- Schema + pipeline chunker (document_sections table, document_chunker.py, embed.py integration)
- [ ] 07-02-PLAN.md -- Web UI + backfill CLI (accordion display on meeting pages, --backfill-sections flag)

### Phase 07.1: Upgrade document extraction with Gemini 2.5 Flash (INSERTED)

**Goal:** Replace PyMuPDF font-analysis document extraction with Gemini 2.5 Flash two-pass extraction (boundary detection + content extraction) and PyMuPDF image extraction, then backfill all 711+ meetings
**Depends on:** Phase 7
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05
**Plans:** 3 plans

Plans:
- [ ] 07.1-01-PLAN.md -- Schema migration (extracted_documents, document_images tables) + Gemini 2.5 Flash two-pass extractor module
- [ ] 07.1-02-PLAN.md -- Image extractor + document extraction orchestrator + pipeline integration + Docling removal
- [ ] 07.1-03-PLAN.md -- Resumable backfill pipeline + CLI updates + end-to-end verification

### Phase 8: Unified Search & Hybrid RAG
**Goal**: Users search and ask questions from a single page that intelligently handles both keyword lookups and natural language questions, with conversation continuity
**Depends on**: Phase 7
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05, SRCH-06
**Success Criteria** (what must be TRUE):
  1. A single /search page exists and the old separate Search and Ask pages are removed or redirect to it
  2. Typing a keyword query (e.g. "bylaw 1234") shows a results list; typing a question (e.g. "what did council decide about the new park?") triggers an AI answer with citations
  3. Search results include matches from document sections, key statements, transcript segments, and motions
  4. User can ask a follow-up question (e.g. "who voted against it?") and the AI answer references context from the previous exchange
  5. Conversation history persists within a browser session but resets on new session, capped at 5 turns
**Plans**: 5 plans

Plans:
- [ ] 08-01-PLAN.md -- Database migrations (hybrid search RPCs, key_statements tsvector, cache table) + hybrid-search.server.ts + intent classifier
- [ ] 08-02-PLAN.md -- Streaming search API route (api.search.tsx) + RAG agent document_sections tool
- [ ] 08-03-PLAN.md -- Unified search page UI with Perplexity-style tabs, AI answer, search results, citation badges
- [ ] 08-04-PLAN.md -- Follow-up conversation support, navigation updates, /ask redirect
- [ ] 08-05-PLAN.md -- End-to-end verification checkpoint

### Phase 9: AI Profiling & Comparison
**Goal**: Citizens can understand each councillor's speaking engagement, positions on key topics through AI-generated summaries backed by evidence, and compare any two councillors side by side
**Depends on**: Phase 8 (hybrid search improves stance evidence retrieval)
**Requirements**: PROF-02, PROF-04, PROF-05, PROF-06
**Success Criteria** (what must be TRUE):
  1. Councillor page shows speaking time metrics calculated from transcript segment durations
  2. Councillor page shows AI-generated stance summaries grouped by topic (e.g. "Housing", "Environment"), each grounded in specific meeting references
  3. Each stance summary displays a confidence score and links to the source evidence (transcript segments, motions, or document sections)
  4. User can select two councillors and see a side-by-side comparison of their voting records, activity metrics, and stance summaries
**Plans**: 4 plans

Plans:
- [ ] 09-01-PLAN.md -- Database foundation (councillor_stances table, speaking time RPCs, category normalization, topic utilities, profiling service)
- [ ] 09-02-PLAN.md -- Stance generation pipeline (Gemini-powered AI stance summaries, --generate-stances CLI flag)
- [ ] 09-03-PLAN.md -- Profile page UI (speaking time card, speaker ranking, stance summaries, position spectrum)
- [ ] 09-04-PLAN.md -- Comparison page (/compare route, dual councillor selection, side-by-side stance/activity comparison)

## Progress

**Execution Order:** 7 -> 7.1 (paused) -> 8 -> 9

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Schema Foundation | v1.0 | 2/2 | Complete | 2026-02-16 |
| 2. Multi-Tenancy | v1.0 | 1/1 | Complete | 2026-02-16 |
| 3. Subscriptions & Notifications | v1.0 | 2/2 | Complete | 2026-02-17 |
| 4. Home Page Enhancements | v1.0 | 2/2 | Complete | 2026-02-16 |
| 5. Advanced Subscriptions | v1.0 | 3/3 | Complete | 2026-02-16 |
| 6. Gap Closure & Cleanup | v1.0 | 1/1 | Complete | 2026-02-17 |
| 7. Document Intelligence | v1.1 | Complete    | 2026-02-17 | - |
| 7.1 Upgrade Document Extraction | v1.1 | 2/3 | Paused | - |
| 8. Unified Search & Hybrid RAG | v1.1 | 5/5 | Complete | 2026-02-18 |
| 9. AI Profiling & Comparison | v1.1 | Complete    | 2026-02-18 | - |

### Phase 10: Add better test suite

**Goal:** Comprehensive automated test suite covering the full Python ETL pipeline (all 5 phases) with light coverage of the React Router 7 web app's server layer, plus pre-deploy hooks to gate deploys on test passes
**Depends on:** Phase 9
**Requirements**: (none -- testing phase, no feature requirements)
**Plans:** 4/5 plans executed

Plans:
- [ ] 10-01-PLAN.md -- Pipeline test infrastructure (conftest.py, fixtures, coverage config, fix skipped test)
- [ ] 10-02-PLAN.md -- Web app Vitest setup + server-layer tests (intent, supabase.server, meetings)
- [ ] 10-03-PLAN.md -- Pipeline core + ingestion tests (ingester, ai_refiner, document_extractor, embed, audit)
- [ ] 10-04-PLAN.md -- Pipeline scraper, profiling, video, orchestrator tests
- [ ] 10-05-PLAN.md -- Integration test, pre-deploy hooks, coverage verification
