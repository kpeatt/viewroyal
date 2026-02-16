# Codebase Structure

**Analysis Date:** 2026-02-16

## Directory Layout

```
viewroyal/
├── apps/
│   ├── web/                    # React Router 7 SSR web app (Cloudflare Workers)
│   ├── pipeline/               # Python ETL pipeline (5-phase scraper + ingester)
│   └── vimeo-proxy/            # Cloudflare Worker for Vimeo URL extraction
├── sql/                        # Database schema bootstrap
├── .planning/                  # GSD planning artifacts
├── CLAUDE.md                   # Developer guidance (dependencies, gotchas)
├── README.md                   # Project overview + CLI documentation
└── [root env/config files]     # .env, .gitignore, etc.
```

## Directory Purposes

**apps/web/**
- Purpose: React Router 7 full-stack web application with SSR on Cloudflare Workers
- Contains: Routes, components, services, utilities, configuration
- Key files: `vite.config.ts`, `wrangler.toml`, `tsconfig.json`
- Build output: `build/` (server + client)

**apps/web/app/**
- Purpose: Source code for web app logic
- Contains: Routes, components, services, lib utilities, hooks
- Key structure:
  - `routes/` — file-based routes (one `.tsx` per page or API endpoint)
  - `components/` — React components (ui/, meeting/, utils/)
  - `services/` — Supabase query functions
  - `lib/` — Utilities (supabase clients, types, helpers)
  - `hooks/` — Custom React hooks

**apps/web/app/routes/**
- Purpose: Page routes and API endpoints (flat file structure)
- Contains: `.tsx` files matching URL paths
- Pattern: `[name].tsx` → `/[name]`, `api.[name].tsx` → `/api/[name]`
- Key routes:
  - `meeting-detail.tsx` → `/meeting-detail/:id` (main video player page)
  - `meetings.tsx` → `/meetings` (meeting list)
  - `api.ask.tsx` → `/api/ask` (RAG Q&A streaming endpoint)
  - `api.vimeo-url.ts` → `/api/vimeo-url` (proxy URL extraction)
  - `search.tsx`, `bylaws.tsx`, `people.tsx`, etc.

**apps/web/app/components/**
- Purpose: React component library
- Contains:
  - `ui/` — shadcn/ui primitives (Button, Card, Dialog, etc.)
  - `meeting/` — meeting-specific components (VideoWithSidebar, AgendaOverview, MeetingTabs)
  - `utils/` — utility components (ClientOnly)
  - Root level — page-level components (MeetingCard, PersonCard, AskQuestion)

**apps/web/app/services/**
- Purpose: Typed Supabase query functions (data access layer)
- Contains: Async functions that take a client + params, return typed data
- Key files:
  - `rag.server.ts` — RAG Q&A agent with vector search + Gemini
  - `meetings.ts` — Fetch meeting, agenda items, transcript segments
  - `people.ts` — Council member profiles, voting records, attendance
  - `vectorSearch.ts` — pgvector semantic search utilities
  - `vimeo.server.ts` — Vimeo URL extraction via proxy worker
- Usage pattern: `import { getMeetingById } from "../services/meetings"; const data = await getMeetingById(client, id);`

**apps/web/app/lib/**
- Purpose: Shared utilities and configuration
- Contains:
  - `supabase.ts` — Browser client (lazy-init for Workers SSR compatibility)
  - `supabase.server.ts` — Admin client + authenticated server client factory
  - `types.ts` — TypeScript interfaces for database models
  - `embeddings.server.ts` — Query embedding generation (fastembed-like)
  - `timeline-utils.ts` — Video timeline calculations
  - `colors.ts`, `utils.ts`, `alignment-utils.ts` — Helper functions

**apps/web/app/hooks/**
- Purpose: Custom React hooks
- Contains:
  - `useVideoPlayer.ts` — Video playback state, seeking, timeline sync
  - `useSpeakerStats.ts` — Aggregate speaker stats from transcript
  - `use-api.ts` — Generic fetch hook with error handling

**apps/web/public/**
- Purpose: Static assets (not committed, built from source)
- Contains: og-image.png, favicon, etc.

**apps/web/workers/**
- Purpose: Cloudflare Workers handler
- Contains: `app.ts` — React Router SSR entry point
- Pattern: Exports `fetch` handler that calls React Router

**apps/pipeline/**
- Purpose: Python ETL pipeline (5 phases: scrape → download → diarize → ingest → embed)
- Contains: Pipeline package, tests, scripts
- Key files: `main.py`, `pyproject.toml`, `pytest.ini`

**apps/pipeline/pipeline/**
- Purpose: Core pipeline package
- Contains: Orchestration, scrapers, diarization, ingestion, embeddings
- Key structure:
  - `orchestrator.py` — Archiver class, 5-phase coordination
  - `scrapers/` — Pluggable scraper implementations
  - `video/` — Vimeo client for downloading audio/video
  - `diarization/` — (legacy location; now in local_diarizer.py)
  - `ingestion/` — AI refinement, ingester, matter matching
  - `local_diarizer.py` — senko + parakeet speech-to-text + diarization
  - `parser.py` — PDF/HTML parsing, agenda extraction
  - `config.py` — Environment configuration, DB URLs
  - `paths.py` — Archive directory paths

**apps/pipeline/pipeline/scrapers/**
- Purpose: Pluggable scrapers for different document sources
- Contains:
  - `base.py` — BaseScraper interface, MunicipalityConfig class
  - `civicweb.py` — CivicWebScraper (default for View Royal)
  - `legistar.py` — LegistarScraper (alternative)
  - `static_html.py` — StaticHtmlScraper for archives
  - `bylaws.py` — Bylaw document scraper

**apps/pipeline/pipeline/ingestion/**
- Purpose: Database ingestion, AI refinement, embeddings
- Contains:
  - `ingester.py` — MeetingIngester class, DB upsert logic, change detection
  - `ai_refiner.py` — Gemini-based extraction (motions, key statements, decisions)
  - `process_agenda.py` — Agenda item normalization
  - `process_bylaws.py` — Bylaw ingestion
  - `matter_matching.py` — Link agenda items to matters across meetings
  - `embed.py` — fastembed integration, pgvector upserts
  - `audit.py` — Consistency checks (meetings with outdated flags)

**apps/pipeline/pipeline/video/**
- Purpose: Video source integration
- Contains:
  - `vimeo.py` — VimeoClient (fetch video metadata, download audio)

**apps/pipeline/tests/**
- Purpose: Python test suite (pytest)
- Contains:
  - `core/` — Core utility tests (parser, utils)
  - `pipeline/` — Integration tests (scraper, ingester mocks)

**apps/pipeline/scripts/**
- Purpose: One-off maintenance and analysis scripts (not committed)
- Contains:
  - `seeding/` — Database seeding (organizations, staff, elections)
  - `analysis/` — Data quality checks, vote analysis
  - `audit/` — Consistency audits
  - `db/` — Direct DB manipulation (cleanup, migrations)
  - `misc/` — Ad-hoc utilities

**apps/vimeo-proxy/**
- Purpose: Standalone Cloudflare Worker for Vimeo URL extraction
- Contains:
  - `src/` — TypeScript source
  - `wrangler.toml` — Worker configuration

**sql/**
- Purpose: Database schema and migrations
- Contains:
  - `bootstrap.sql` — Complete schema (all tables, enums, indexes, RLS policies)
  - `migrations/` — Incremental schema changes (versioned)

**.planning/codebase/**
- Purpose: GSD (Getting Stuff Done) planning documents
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, STACK.md, INTEGRATIONS.md, CONCERNS.md

## Key File Locations

**Entry Points:**
- `apps/web/workers/app.ts` — Cloudflare Workers HTTP handler (exports `fetch`)
- `apps/web/app/root.tsx` — React Router root layout (if exists; check .react-router types)
- `apps/pipeline/main.py` — Python pipeline CLI entry point

**Configuration:**
- `apps/web/vite.config.ts` — Vite build config + env var loading (wrangler.toml, .env precedence)
- `apps/web/wrangler.toml` — Cloudflare Workers config (routes, crons, vars)
- `apps/web/tsconfig.json` — TypeScript config with path aliases (`~` → `./app`)
- `apps/pipeline/pyproject.toml` — Python dependencies (uv)
- `apps/pipeline/pytest.ini` — pytest configuration
- `apps/pipeline/pipeline/config.py` — Runtime config (SUPABASE_URL, API keys)

**Core Logic:**
- `apps/web/app/services/rag.server.ts` — RAG Q&A agent (vector search + Gemini)
- `apps/web/app/services/meetings.ts` — Meeting queries
- `apps/web/app/routes/meeting-detail.tsx` — Main meeting page (video + sidebar)
- `apps/pipeline/pipeline/orchestrator.py` — 5-phase pipeline orchestration
- `apps/pipeline/pipeline/ingestion/ingester.py` — Database ingestion logic
- `apps/pipeline/pipeline/local_diarizer.py` — Speaker diarization + transcription

**Testing:**
- `apps/pipeline/tests/core/test_parser.py` — Agenda parser tests
- `apps/pipeline/tests/pipeline/` — Integration tests

**Database:**
- `sql/bootstrap.sql` — Complete schema (read this for column names, types, constraints)
- `apps/web/app/lib/types.ts` — TypeScript interfaces (may be aspirational; verify against schema)

## Naming Conventions

**Files:**
- Routes: `[name].tsx` or `api.[name].tsx` (kebab-case)
- Components: `PascalCase.tsx` (e.g., `VideoWithSidebar.tsx`)
- Services: `camelCase.ts` (e.g., `rag.server.ts`, `meetings.ts`)
- Utilities: `camelCase.ts` (e.g., `timeline-utils.ts`, `alignment-utils.ts`)
- Tests: `test_[module].py` or `[module].test.ts` (pytest convention)

**Directories:**
- Components: `camelCase/` for feature groups (e.g., `meeting/`)
- Services: `services/` (flat, all services together)
- Utilities: `lib/` or `utils/`
- Tests: `tests/` (mirrors source structure)

**Database Tables:**
- Plural, snake_case: `meetings`, `agenda_items`, `transcript_segments`, `people`, `organizations`
- Enum columns: `type`, `status`, `classification`, `vote` (PostgreSQL ENUM types)

**TypeScript Types:**
- PascalCase: `Meeting`, `AgendaItem`, `Person`, `TranscriptSegment`
- Exported from: `apps/web/app/lib/types.ts`

**Python Classes:**
- PascalCase: `Archiver`, `MeetingIngester`, `LocalDiarizer`, `CivicWebScraper`

**Python Functions:**
- snake_case: `extract_meeting_metadata()`, `align_meeting_items()`

## Where to Add New Code

**New Feature (Page/Route):**
1. Primary code: `apps/web/app/routes/[feature-name].tsx`
2. Components: `apps/web/app/components/[feature-name]/` (if complex)
3. Service queries: `apps/web/app/services/[feature].ts`
4. Tests: `apps/pipeline/tests/` (for backend) or component tests in web app (if added)

**New Component/Module:**
- Implementation: `apps/web/app/components/[name].tsx` (simple) or `apps/web/app/components/[feature]/[Component].tsx` (grouped)
- Usage: Import in routes or other components

**Utilities & Helpers:**
- Shared TypeScript: `apps/web/app/lib/[purpose].ts` (e.g., `timeline-utils.ts`)
- Shared Python: `apps/pipeline/pipeline/[module].py` (e.g., `parser.py`, `utils.py`)
- Hooks: `apps/web/app/hooks/[use-name].ts`

**Database Schema Changes:**
1. Create migration: `sql/migrations/[timestamp]_[purpose].sql`
2. Update bootstrap: `sql/bootstrap.sql` (keep as source of truth)
3. Update types: `apps/web/app/lib/types.ts` (verify columns exist in schema first!)
4. Important: The `neighborhood` column does NOT exist on `agenda_items` — check actual schema before querying

**API Endpoints:**
- Implementation: `apps/web/app/routes/api.[endpoint].tsx`
- Pattern: Export `loader()` or `action()` function; handle GET via loader, POST via action
- Rate limiting: See `api.ask.tsx` for example (in-memory IP tracking)

**Pipeline Scraper (New Municipality):**
1. Create class extending `BaseScraper` in `apps/pipeline/pipeline/scrapers/[source].py`
2. Register in `orchestrator.py`: `register_scraper("[name]", MyScraperClass)`
3. Add MunicipalityConfig to `municipalities` table in Supabase
4. Update `apps/pipeline/pipeline/config.py` to load from DB

## Special Directories

**apps/web/.react-router/**
- Purpose: Generated types for React Router (file-based routing)
- Generated: Yes (do not edit manually)
- Committed: Yes (.gitignore excludes, but generated files are tracked)
- Update command: `pnpm typecheck` regenerates this

**apps/web/build/**
- Purpose: Built output for Cloudflare Workers deployment
- Generated: Yes
- Committed: No (.gitignore)
- Build command: `pnpm build` → `build/server` (SSR handler) + `build/client` (browser assets)

**apps/web/.wrangler/**
- Purpose: Cloudflare Workers local dev state and cache
- Generated: Yes
- Committed: No (.gitignore)
- Contains: Miniflare cache, state snapshots, tmp files

**viewroyal_archive/**
- Purpose: Local filesystem cache of downloaded documents (PDFs, audio, transcripts)
- Generated: Yes (by pipeline phase 1-3)
- Committed: No (.gitignore)
- Structure: `viewroyal_archive/[Type]/[Year]/[Month]/[Date] [Meeting Name]/`
- Contents: `*_AGENDA.pdf`, `*_MINUTES.pdf`, audio.mp3, transcript.json, diarized.json

**logs/, models/, reports/, scripts/, batch_workspace/**
- Purpose: Legacy or root-level pipeline artifacts
- Note: Ephemeral, keep .gitignored

---

*Structure analysis: 2026-02-16*
