# Architecture

**Analysis Date:** 2026-02-16

## Pattern Overview

**Overall:** Full-stack civic transparency platform with clear separation between data ingestion pipeline (Python ETL), backend query layer (Node.js/Cloudflare Workers), and frontend presentation (React Router 7 SSR).

**Key Characteristics:**
- **Event-driven ETL**: 5-phase pipeline with smart change detection (scrape → download → diarize → ingest → embed)
- **SSR-first frontend**: React Router 7 with server loaders/actions, deployed to Cloudflare Workers
- **Semantic vector search**: pgvector embeddings with RAG-powered Q&A via Google Gemini
- **Modular ingestion**: Pluggable scrapers + AI refinement + local diarization (no external APIs for transcription)
- **Multi-tenant ready**: Configuration per municipality loaded from Supabase

## Layers

**Scraping & Data Collection Layer:**
- Purpose: Fetch meeting documents (PDFs/HTML) from CivicWeb and video metadata from Vimeo
- Location: `apps/pipeline/pipeline/scrapers/` and `apps/pipeline/pipeline/video/`
- Contains: `CivicWebScraper`, `VimeoClient`, and pluggable scraper interface (`BaseScraper`)
- Depends on: HTTP clients, PDF parsing (PyMuPDF), Vimeo API
- Used by: `Archiver` orchestrator

**Audio Processing & Diarization Layer:**
- Purpose: Extract speaker diarization and transcript from audio files using local ML models
- Location: `apps/pipeline/pipeline/local_diarizer.py`, diarization models (senko + parakeet)
- Contains: Voice fingerprinting (CAM++ embeddings), speaker clustering, transcript generation
- Depends on: senko (speaker diarization), parakeet-mlx (transcription), voice fingerprint database
- Used by: Orchestrator → AI Refiner → Ingester

**AI Refinement & Augmentation Layer:**
- Purpose: Use Gemini to refine raw meeting data into structured records (motions, decisions, voting patterns)
- Location: `apps/pipeline/pipeline/ingestion/ai_refiner.py`
- Contains: Prompt-based extraction, matter matching, key statement extraction
- Depends on: Google Gemini API
- Used by: Ingester

**Ingestion & Database Layer:**
- Purpose: Normalize processed data and upsert into Supabase with change detection
- Location: `apps/pipeline/pipeline/ingestion/` (ingester.py, process_agenda.py, matter_matching.py)
- Contains: Matter tracking, agenda parsing, voting record alignment, deduplication
- Depends on: Supabase client, Python utils
- Used by: Orchestrator

**Embeddings Generation Layer:**
- Purpose: Create vector embeddings for semantic search across transcripts, motions, and bylaws
- Location: `apps/pipeline/pipeline/ingestion/embed.py` and `apps/web/app/lib/embeddings.server.ts`
- Contains: fastembed (nomic-embed-text-v1.5) for Python, Google Gemini embeddings API for inline operations
- Depends on: fastembed library, Supabase pgvector extension
- Used by: Pipeline phase 5, RAG search in web app

**Backend Query & RAG Layer:**
- Purpose: Fetch meeting data, perform vector searches, and synthesize Gemini responses
- Location: `apps/web/app/services/` and `apps/web/app/routes/api.*.tsx`
- Contains: `rag.server.ts` (question agent), vector search, fact retrieval, Supabase queries
- Depends on: Supabase client, Google Gemini API, embeddings generation
- Used by: React Router loaders, server actions

**Frontend Presentation Layer:**
- Purpose: Render interactive UI for browsing meetings, searching, voting analysis
- Location: `apps/web/app/routes/` (page routes), `apps/web/app/components/`
- Contains: React components, hooks, layout orchestration
- Depends on: React Router, Supabase browser client, utility hooks
- Used by: Cloudflare Workers / browser

**Media Access & Proxy Layer:**
- Purpose: Extract playable URLs from Vimeo, proxy through fallback workers if needed
- Location: `apps/vimeo-proxy/` (Cloudflare Worker), `apps/web/app/services/vimeo.server.ts`
- Contains: Puppeteer-based URL extraction, fallback retry logic
- Depends on: Vimeo API, Puppeteer, Cloudflare Workers runtime
- Used by: Frontend video player, audio downloader

## Data Flow

**Pipeline (Offline, Python):**

1. **Scrape (Phase 1):** CivicWeb scraper downloads agenda + minutes PDFs → `/viewroyal_archive/`
2. **Download Audio (Phase 2):** VimeoClient fetches MP3/MP4 files from Vimeo user albums
3. **Diarize (Phase 3):** LocalDiarizer processes audio → transcript JSON + speaker segments, stores fingerprints in DB
4. **Ingest (Phase 4):** Ingester parses transcripts + documents → AI refines via Gemini → upserts meetings/items/motions/votes with change detection
5. **Embed (Phase 5):** fastembed creates vectors for transcript segments + motions → upsert to pgvector columns

**Web App (Online, Node.js):**

1. **Route Loader:** React Router loader calls service function (e.g., `getMeetingById`)
2. **Service Query:** Service uses Supabase client (admin or authenticated) to fetch data with joins
3. **Vector Search (RAG):** `runQuestionAgent` in `rag.server.ts`:
   - Generate embedding for user question
   - Vector search transcript_segments + motions tables
   - Pass context to Gemini with citations
   - Stream response back to client as SSE
4. **Response:** Loader data → component tree → HTML (SSR) + hydration payload → browser

**State Management:**

- **Pipeline state:** File existence on disk (`has_agenda`, `has_minutes`, `has_transcript` flags) vs. DB state
- **Web app state:** Loader data passed to components via `useRouteLoaderData()`, form state via React Router actions
- **Real-time interactions:** Video timeline sync, speaker color assignment (client-side)
- **Authentication:** Supabase Auth cookies stored in `Set-Cookie` headers, parsed in server client

## Key Abstractions

**Scraper Interface:**
- Purpose: Pluggable scraper strategy for different municipalities
- Examples: `CivicWebScraper`, `LegistarScraper`, `StaticHtmlScraper`
- Pattern: Extends `BaseScraper`, implements `scrape(root_url) → list[Meeting]`

**MunicipalityConfig:**
- Purpose: Load municipality-specific settings (URLs, member names, scraper type)
- Examples: `apps/pipeline/pipeline/scrapers/base.py` defines config class
- Pattern: Loaded from `municipalities` table or hardcoded defaults for View Royal

**Orchestrator:**
- Purpose: Coordinate 5-phase pipeline with CLI flags and smart change detection
- Examples: `Archiver` class in `apps/pipeline/pipeline/orchestrator.py`
- Pattern: Phases run sequentially, each can be skipped; phase 4 checks DB flags before re-ingesting

**Service Layer (Web):**
- Purpose: Encapsulate Supabase queries with TypeScript types
- Examples: `meetings.ts`, `people.ts`, `rag.server.ts` in `apps/web/app/services/`
- Pattern: Export typed async functions that take client + params, return normalized data

**RAG Agent (Web):**
- Purpose: Multi-turn conversational search with retrieval augmentation
- Examples: `runQuestionAgent()` generator in `rag.server.ts`
- Pattern: Streaming event-based responses, vector search → context → Gemini → citations

## Entry Points

**Pipeline Entry:**
- Location: `apps/pipeline/main.py`
- Triggers: Manual `uv run python main.py [flags]` or scheduled (cron job in Cloudflare Workers)
- Responsibilities: Parse CLI flags, instantiate Archiver, run 5-phase pipeline with logging

**Web App Entry (Server):**
- Location: `apps/web/workers/app.ts` (Cloudflare Workers handler)
- Triggers: HTTP requests to `viewroyal.ai/*`
- Responsibilities: Initialize React Router SSR handler, pass request to router

**Web App Entry (Routes):**
- Location: `apps/web/app/routes/*.tsx` (file-based routing)
- Triggers: Navigation to path (e.g., `/meetings/42`)
- Responsibilities: Define loader (data fetch), meta (SEO), component (render)
- Pattern: Flat structure in `routes/` → React Router maps to URL

**API Handlers:**
- Location: `apps/web/app/routes/api.*.tsx` (REST endpoints)
- Examples: `/api/ask` (RAG Q&A), `/api/vimeo-url` (proxy), `/api.report-video-failure.ts`
- Responsibilities: Handle streaming requests, rate limiting, error handling

## Error Handling

**Strategy:** Graceful degradation; prefer partial data over complete failure.

**Patterns:**
- **Pipeline:** Log errors, continue to next item (no try-catch abort)
- **Ingestion:** Mark failed meetings as status='error', store error in `meta.last_error`
- **Web loaders:** Catch service errors, return fallback data or redirect
- **RAG:** Catch Gemini API errors, return "Error: could not generate answer" in streaming response
- **Video proxy:** Fallback to secondary proxy URL on timeout, then return null

## Cross-Cutting Concerns

**Logging:** Console logging throughout pipeline with `[Phase]` prefixes; web app uses standard `console.log/error` → Cloudflare Logpush

**Validation:**
- Pipeline: Regex for folder names, optional schema validation before DB insert
- Web: TypeScript types at compile time, Supabase PostgREST validation

**Authentication:**
- Pipeline: Supabase service role key (full access to all tables)
- Web (public routes): Supabase anon key (RLS enabled on all tables)
- Web (admin routes): Custom session check via `currentUser()` in loaders

**Caching:**
- Pipeline: Files cached on disk in `viewroyal_archive/`
- Web: HTTP caching headers on static assets via Cloudflare cache rules; no query-level caching (data freshness priority)

**Rate Limiting:**
- RAG `/api/ask` endpoint: 10 requests per 60s per IP (in-memory map, cleaned inline)
- Video proxy: Fallback retry with exponential backoff

---

*Architecture analysis: 2026-02-16*
