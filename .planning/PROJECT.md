# ViewRoyal.ai — Civic Intelligence Platform

## What This Is

A civic transparency platform that scrapes council meeting documents and video from municipal websites, diarizes speakers, extracts structured data with AI, and serves it through a searchable web app. Currently focused on View Royal, BC with multi-town architecture in progress. Citizens can browse meetings, motions, bylaws, people, matters — and ask natural language questions answered by a RAG agent grounded in transcripts and documents.

## Core Value

Citizens can understand what their council decided, why, and who said what — without attending meetings or reading hundreds of pages of PDFs.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Python ETL pipeline: scrape, download, diarize, AI refine, embed — Phase 0-3
- ✓ CivicWeb scraper for View Royal — Phase 2
- ✓ Legistar scraper (Esquimalt) with structured data fast path — Phase 2
- ✓ Static HTML scraper (RDOS) — Phase 2
- ✓ Pluggable scraper registry with BaseScraper interface — Phase 2
- ✓ Video source abstraction (Vimeo, YouTube, inline, null) — Phase 3
- ✓ Municipality-aware CLI (`--municipality`, `--all`) — Phase 3
- ✓ `municipalities` table with source_config JSONB — Phase 1
- ✓ `municipality_id` FK on organizations, meetings, matters, elections, bylaws — Phase 1
- ✓ `documents` and `document_sections` tables for structured document storage — Phase 1/3b
- ✓ `key_statements` table for extracted quotable statements — Phase 1/3c
- ✓ Full document ingestion (all PDFs, no truncation, section hierarchy) — Phase 3b
- ✓ Attachment-to-agenda-item linking — Phase 3b
- ✓ OCD ID columns on core tables — Phase 1
- ✓ `tsvector` full-text search on transcript_segments — Phase 1/3c
- ✓ SSR web app on Cloudflare Workers with React Router 7 — existing
- ✓ Meeting detail pages with agenda items, motions, transcript, video — existing
- ✓ RAG Q&A with Gemini (ask page, streaming answers with citations) — existing
- ✓ People profiles with voting history and speaking stats — existing
- ✓ Matters tracking with timeline — existing
- ✓ Bylaws and elections pages — existing
- ✓ Matters map with geographic display — existing
- ✓ MLX diarization with voice fingerprinting (Apple Silicon) — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] Web app multi-tenancy: dynamic municipality context replacing hardcoded "View Royal" (PR #36)
- [ ] Embedding migration: halfvec(384), key statement embeddings, consolidated segments (PR #35)
- [ ] Key statement extraction prompt improvements (PR #37)
- [ ] User subscriptions and email alerts system (PR #13)
- [ ] Surface active matters on home page (issue #3)

### Out of Scope

<!-- Explicit boundaries for this milestone. -->

- Phase 4b: Document viewer — deferred to next milestone
- Phase 5/5b: Public API and OCD API — deferred, depends on multi-tenancy landing
- Phase 5c: RAG overhaul — deferred, large scope
- Phase 5d: Council member profiling — deferred
- Phase 5e: Speaker ID improvements — deferred
- Phase 6: Second town onboarding — deferred until multi-tenancy is solid
- Decisions feed on home page (#1) — not in this milestone
- Divided decisions page (#2) — not in this milestone
- Meeting summary cards (#4) — not in this milestone
- Enhanced Ask page (#5) — not in this milestone
- Topic clustering (#6) — not in this milestone
- Enhanced person profiles (#7) — not in this milestone
- Financial transparency (#8) — not in this milestone
- Neighbourhood filtering (#9) — not in this milestone, DB column may not exist yet
- Meeting outcome badges (#10) — not in this milestone
- Surface underused schema data (#12) — not in this milestone

## Context

- Monorepo: `apps/web/` (React Router 7), `apps/pipeline/` (Python ETL), `apps/vimeo-proxy/` (Cloudflare Worker)
- DB: Supabase PostgreSQL with pgvector, ~40+ tables including municipalities, meetings, agenda_items, motions, matters, transcript_segments, documents, key_statements
- 4 open PRs ready to review and merge (#35, #36, #37, #13) representing months of development
- `PLAN-multi-town-ingestion.md` contains the comprehensive 11-layer architecture plan
- GitHub issues #1-28 track the full roadmap with priority/effort labels
- Phases 0-3c completed and merged; phases 4-6 and features #1-12 are open
- The `neighborhood` column does NOT exist on `agenda_items` despite TypeScript types suggesting otherwise

## Constraints

- **Runtime**: Cloudflare Workers — no `process.env`, no Node.js APIs, env vars inlined at build time via Vite
- **AI**: Google Gemini for refinement + RAG; fastembed for local embeddings (pipeline only)
- **Diarization**: MLX on Apple Silicon — pipeline runs locally, not in CI/CD
- **Auth**: Supabase Auth exists but is admin-only; PR #13 opens it for public sign-up
- **Cost**: Gemini API calls per meeting; Legistar fast path skips AI for structured sources

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Monorepo with pnpm workspaces | Web app + pipeline + proxy share repo but deploy independently | ✓ Good |
| Supabase for DB + auth + storage | Managed Postgres with pgvector, auth, storage, edge functions | ✓ Good |
| Cloudflare Workers for web app | SSR at edge, KV/R2 available, single deployment | ✓ Good |
| Municipality context via DB, not config files | Enables runtime discovery of towns, no redeploy to add one | ✓ Good |
| halfvec(384) over vector(768) | 95% storage reduction, Matryoshka truncation preserves quality | — Pending (PR #35) |
| Resend for transactional email | Free tier sufficient for initial scale, Edge Function compatible | — Pending (PR #13) |
| Mix multi-town + UX features in this milestone | Land existing PRs while adding one high-impact UX feature | — Pending |

---
*Last updated: 2026-02-16 after initialization*
