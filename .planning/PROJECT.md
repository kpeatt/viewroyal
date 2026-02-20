# ViewRoyal.ai — Civic Intelligence Platform

## What This Is

A civic transparency platform that scrapes council meeting documents and video from municipal websites, diarizes speakers, extracts structured data with AI, and serves it through a searchable web app with subscription-based email alerts. Citizens can browse meetings, motions, bylaws, people, and matters — search across all content types with hybrid keyword+vector search — ask natural language questions answered by a RAG agent with conversation memory — view AI-generated councillor stance summaries backed by evidence — compare councillors side by side — and subscribe to topics for personalized email digests.

## Core Value

Citizens can understand what their council decided, why, and who said what — without attending meetings or reading hundreds of pages of PDFs.

## Requirements

### Validated

- ✓ Python ETL pipeline: scrape, download, diarize, AI refine, embed — v1.0
- ✓ CivicWeb scraper for View Royal — v1.0
- ✓ Legistar scraper (Esquimalt) with structured data fast path — v1.0
- ✓ Static HTML scraper (RDOS) — v1.0
- ✓ Pluggable scraper registry with BaseScraper interface — v1.0
- ✓ Video source abstraction (Vimeo, YouTube, inline, null) — v1.0
- ✓ Municipality-aware CLI (`--municipality`, `--all`) — v1.0
- ✓ `municipalities` table with source_config JSONB — v1.0
- ✓ `municipality_id` FK on organizations, meetings, matters, elections, bylaws — v1.0
- ✓ `documents` and `document_sections` tables for structured document storage — v1.0
- ✓ `key_statements` table for extracted quotable statements — v1.0
- ✓ Full document ingestion (all PDFs, no truncation, section hierarchy) — v1.0
- ✓ Attachment-to-agenda-item linking — v1.0
- ✓ OCD ID columns on core tables — v1.0
- ✓ `tsvector` full-text search on transcript_segments — v1.0
- ✓ SSR web app on Cloudflare Workers with React Router 7 — v1.0
- ✓ Meeting detail pages with agenda items, motions, transcript, video — v1.0
- ✓ RAG Q&A with Gemini (ask page, streaming answers with citations) — v1.0
- ✓ People profiles with voting history and speaking stats — v1.0
- ✓ Matters tracking with timeline — v1.0
- ✓ Bylaws and elections pages — v1.0
- ✓ Matters map with geographic display — v1.0
- ✓ MLX diarization with voice fingerprinting (Apple Silicon) — v1.0
- ✓ Embedding migration: halfvec(384), key statement embeddings, consolidated segments — v1.0
- ✓ Key statement extraction prompt improvements — v1.0
- ✓ Web app multi-tenancy: dynamic municipality context replacing hardcoded "View Royal" — v1.0
- ✓ User subscriptions (matter, councillor, topic, neighbourhood, digest) with email alerts — v1.0
- ✓ Public user signup with guided onboarding (topics, location, digest preference) — v1.0
- ✓ Home page with active matters, decisions feed, upcoming meeting preview, public notices — v1.0
- ✓ Divided vote visualization with controversial toggle — v1.0
- ✓ Personalized digest emails with subscription highlighting — v1.0
- ✓ Pre-meeting alert capability in Edge Function — v1.0
- ✓ Pipeline chunks PDF documents into sections with heading-based parsing — v1.1
- ✓ Document sections with halfvec(384) embeddings and tsvector FTS indexes — v1.1
- ✓ Document sections linked to agenda items via title matching — v1.1
- ✓ Existing documents backfilled into sections with embeddings — v1.1
- ✓ Unified search page replacing separate Search and Ask pages — v1.1
- ✓ Intent detection: keyword queries show results, questions trigger AI answers — v1.1
- ✓ Hybrid search RPCs with Reciprocal Rank Fusion across 4 content types — v1.1
- ✓ Follow-up questions with 5-turn conversation memory — v1.1
- ✓ Speaking time metrics from transcript segment durations — v1.1
- ✓ AI stance summaries per councillor per topic with confidence scoring — v1.1
- ✓ Side-by-side councillor comparison (voting, stances, activity) — v1.1
- ✓ Pipeline detects new documents and video for existing meetings — v1.2
- ✓ Pipeline selectively re-ingests only meetings with new content — v1.2
- ✓ Daily scheduled pipeline runs via launchd on Mac Mini — v1.2
- ✓ Moshi push notifications when new content is found and processed — v1.2
- ✓ Rotating log file and concurrency lock for safe unattended runs — v1.2

### Active

(No active milestone — run `/gsd:new-milestone` to start next cycle)

### Out of Scope

- Document viewer with official-document styling — future milestone candidate
- Public API with OCD-compliant endpoints — future milestone candidate
- Speaker ID improvements (multi-sample fingerprints, custom vocabulary) — future milestone candidate
- Second town onboarding (Esquimalt, RDOS) — deferred until intelligence layer is stable
- Push notifications / native app — overkill for current user base size
- Social features (comments, reactions, forums) — undermines official record credibility
- Real-time live meeting notifications — architecture mismatch (batch pipeline)
- SMS notifications — cost/compliance overhead unjustified at current scale
- OAuth providers (Google, GitHub) — inappropriate for civic audience; magic links are lower friction

## Context

Shipped v1.2 with ~81,500 LOC (TypeScript + Python), 40+ database tables, 357 automated tests.
Tech stack: React Router 7, Cloudflare Workers, Supabase PostgreSQL + pgvector, Google Gemini (gemini-3-flash-preview), fastembed.
v1.0: 6 phases, 11 plans in 1.65 hours. v1.1: 6 phases, 20 plans in 2.77 hours. v1.2: 3 phases, 5 plans in 12 minutes.

**Known technical debt:**
- `bootstrap.sql` is out of date with 30+ applied migrations
- Phase 7.1 Gemini Batch API extraction paused — backfill waiting on quota
- `document_chunker.py` and several web modules lack dedicated test coverage
- Email delivery requires one-time external Resend/SMTP configuration

## Constraints

- **Runtime**: Cloudflare Workers — no `process.env`, no Node.js APIs, env vars inlined at build time via Vite
- **AI**: Google Gemini (gemini-3-flash-preview) for refinement + RAG + stances; fastembed for pipeline embeddings
- **Diarization**: MLX on Apple Silicon — pipeline runs locally, not in CI/CD
- **Auth**: Supabase Auth with public signup (needs dashboard toggle to enable)
- **Cost**: Gemini API calls per meeting; Legistar fast path skips AI for structured sources
- **Email**: Resend via Supabase Edge Function; needs API key and domain DNS configuration

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Monorepo with pnpm workspaces | Web app + pipeline + proxy share repo but deploy independently | ✓ Good |
| Supabase for DB + auth + storage | Managed Postgres with pgvector, auth, storage, edge functions | ✓ Good |
| Cloudflare Workers for web app | SSR at edge, KV/R2 available, single deployment | ✓ Good |
| Municipality context via DB, not config files | Enables runtime discovery of towns, no redeploy to add one | ✓ Good |
| halfvec(384) over vector(768) | 95% storage reduction, Matryoshka truncation preserves quality | ✓ Good |
| Resend for transactional email | Free tier sufficient for initial scale, Edge Function compatible | ✓ Good |
| PyMuPDF font-analysis for doc chunking | Body_size * 1.2 threshold for headings, no ML dependency | ✓ Good |
| Hybrid search with RRF over Elasticsearch | pgvector + tsvector covers hybrid search natively | ✓ Good |
| Gemini for stance generation | Same provider as refinement, lazy singleton pattern | ✓ Good |
| Category normalization as IMMUTABLE SQL fn | Covers ~300/470 categories to 8 topics, no RPC needed | ✓ Good |
| @google/genai SDK over @google/generative-ai | New official SDK, model-per-call pattern, async iterables | ✓ Good |
| Pre-deploy test gating | pytest + vitest must pass before wrangler deploy | ✓ Good |
| Phase 7.1 pause (Batch API) | DOC requirements satisfied by Phase 7; batch backfill deferred | ✓ Good |
| Reuse audit.py for update detection | Existing find_meetings_needing_reingest() covers document changes | ✓ Good |
| MOSHI_TOKEN as feature toggle | Missing token silently disables notifications, no CLI flag needed | ✓ Good |
| fcntl.flock for pipeline lock | Auto-releases on crash/kill, no stale pidfile cleanup needed | ✓ Good |
| launchd over cron | Native macOS, better logging integration, StartCalendarInterval | ✓ Good |

---
*Last updated: 2026-02-20 after v1.2 milestone complete*
