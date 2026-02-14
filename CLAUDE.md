# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ViewRoyal.ai — a civic intelligence platform for the Town of View Royal, BC. A Python ETL pipeline scrapes council meeting documents, diarizes video, and ingests into Supabase. A React Router 7 web app serves it on Cloudflare Workers.

## Monorepo Structure

```
apps/web/          # React Router 7 web app (Cloudflare Workers)
apps/vimeo-proxy/  # Cloudflare Worker + Puppeteer for Vimeo URL extraction
src/               # Python ETL pipeline
sql/               # Database bootstrap (bootstrap.sql)
tests/             # Python tests (pytest)
```

## Commands

### Web App (`apps/web/`)
```bash
pnpm dev              # Vite dev server (localhost:5173)
pnpm build            # Build for Cloudflare Workers
pnpm deploy           # Build + wrangler deploy
pnpm typecheck        # React Router typegen + tsc
```

### Python Pipeline
```bash
uv run python main.py                    # Full 5-phase pipeline
uv run python main.py --target 42        # Single meeting by ID
uv run python main.py --ingest-only      # Phase 4 only
uv run python main.py --embed-only       # Phase 5 only
uv run python main.py --rediarize        # Re-diarize from cached transcripts
uv run pytest                            # All tests
uv run pytest tests/core/test_parser.py -v  # Single test file
```

## Tech Stack

- **Frontend**: React 19, React Router 7 (SSR), Tailwind CSS 4, shadcn/ui + Radix UI, lucide-react
- **Backend**: Cloudflare Workers (wrangler), Supabase (PostgreSQL + pgvector)
- **AI**: Google Gemini (refinement + RAG Q&A), fastembed (nomic-embed-text-v1.5 embeddings)
- **Pipeline**: Python 3.13+, uv package manager, MLX diarization (Apple Silicon)
- **Build**: pnpm workspaces, Vite 7, TypeScript 5.9

## Architecture

### Data Flow
```
CivicWeb PDFs + Vimeo Video → Python Pipeline (5 phases) → Supabase → Web App
```

Pipeline phases: scrape → download audio → diarize → AI refine + ingest → embed

### Web App Routing
Flat file routes in `apps/web/app/routes/`. Server loaders fetch from Supabase, components render with SSR. API routes (`api.ask.tsx`, `api.vimeo-url.ts`) handle server actions.

### Supabase Client Initialization
Three clients exist — use the right one:
- **Browser** (`app/lib/supabase.ts`): `createBrowserClient` — for React components. Lazy-inits only in browser to avoid breaking Workers SSR.
- **Server with auth** (`app/lib/supabase.server.ts`): `createSupabaseServerClient(request, responseHeaders)` — for loaders/actions needing user context.
- **Server admin** (`app/lib/supabase.server.ts`): `getSupabaseAdminClient()` — bypasses RLS, cached singleton.

### Service Layer
`app/services/*.ts` contains typed Supabase query functions. Loaders call these with the appropriate client.

### RAG Q&A
`app/services/rag.server.ts` — generates query embedding, vector-searches transcript/motion tables, passes context to Gemini for answer + citations.

## Environment Variables

Public vars live in `wrangler.toml [vars]` (parsed at build time by `vite.config.ts`). Secrets must be set as:
- **Cloudflare Worker secrets** (runtime): `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `VIMEO_PROXY_API_KEY`
- **Cloudflare Build Configuration variables** (build-time): `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`
- **Local `.env`** files (not committed): loaded by Vite's `loadEnv` from both root and `apps/web/`

The `vite.config.ts` `define` block inlines all env vars at build time since `process.env` doesn't exist in Cloudflare Workers. Priority: wrangler.toml vars < process.env < root .env < local .env.

## Database Gotchas

- The `neighborhood` column does NOT exist on `agenda_items` despite being in TypeScript types. Don't add it to Supabase queries.
- Always verify columns exist in the actual database before adding them to `.select()` strings — TypeScript types in `app/lib/types.ts` can be aspirational/ahead of the schema.
- Schema is bootstrapped from `sql/bootstrap.sql`. Uses pgvector extension for embeddings.

## Known Issues

- Pre-existing type error in `voice-fingerprints.tsx` line 404 — ignore it.
- `wrangler deploy` overwrites dashboard-set vars with `wrangler.toml` — all public vars must be in `[vars]` section.
- `separator.tsx` sourcemap warning during build is harmless.
