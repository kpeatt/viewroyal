# Technology Stack

**Analysis Date:** 2026-02-16

## Languages

**Primary:**
- TypeScript 5.9.2 - Web frontend and Cloudflare Workers backend (`apps/web/`)
- Python 3.13+ - ETL pipeline and data processing (`apps/pipeline/`)

**Secondary:**
- JavaScript - Build and configuration files (Vite, Wrangler)
- SQL - Database schema (`sql/bootstrap.sql`) and queries

## Runtime

**Environment:**
- Node.js (LTS) - Web app and vimeo-proxy
- Python 3.13 - Pipeline execution (defined in `.python-version`)
- Cloudflare Workers - Production runtime for web app

**Package Manager:**
- pnpm (monorepo workspaces) - JavaScript/Node.js packages
  - Lockfile: `pnpm-lock.yaml`
- uv - Python package management (`apps/pipeline/`)
  - Dependencies defined in `pyproject.toml`

## Frameworks

**Frontend:**
- React 19.2.3 - Component library
- React Router 7.12.0 - SSR framework with file-based routing
- Vite 7.1.7 - Build tool and dev server
- Tailwind CSS 4.1.13 - Utility CSS framework
- shadcn/ui + Radix UI - Component primitives
  - `@radix-ui/react-dialog`, `@radix-ui/react-tabs`, `@radix-ui/react-scroll-area`, etc.
- lucide-react 0.562.0 - Icon library

**Deployment/Hosting:**
- Cloudflare Workers - Serverless runtime (wrangler v4.64.0)
- Cloudflare Puppeteer - Browser automation for Vimeo proxy

**Build/Dev:**
- @cloudflare/vite-plugin 1.24.0 - Vite integration for Workers
- @tailwindcss/vite 4.1.13 - Tailwind CSS integration
- vite-tsconfig-paths 5.1.4 - TypeScript path aliases

**Testing:**
- pytest 9.0.2+ - Python test runner
- pytest-mock 3.15.1+ - Test mocking utilities

## Key Dependencies

**Critical:**

**Web App:**
- `@supabase/supabase-js` 2.90.1 - Supabase client for browser
- `@supabase/ssr` 0.8.0 - Server-side Supabase with cookie handling
- `@google/generative-ai` 0.24.1 - Google Gemini API client
- `openai` 6.17.0 - OpenAI client (embeddings via `text-embedding-3-small`)
- `@vimeo/player` 2.30.1 - Vimeo embedded player
- `hls.js` 1.6.15 - HTTP Live Streaming playback
- `leaflet` 1.9.4 + `react-leaflet` 5.0.0 - Map visualization
- `react-markdown` 10.1.0 + `remark-gfm` 4.0.1 - Markdown rendering with GitHub Flavored Markdown support

**Pipeline:**
- `supabase` 2.27.2 - Supabase Python client
- `google-genai` 1.59.0 - Google Generative AI (Gemini)
- `openai` 2.15.0 - OpenAI Python client
- `fastembed` 0.7.3 - Local embeddings (nomic-embed-text-v1.5)
- `beautifulsoup4` 4.14.3+ - HTML parsing
- `requests` 2.32.5+ - HTTP client
- `yt-dlp` 2025.12.8 - Video downloader (YouTube and Vimeo)
- `marker-pdf` 1.6.1 - PDF-to-Markdown conversion
- `pymupdf` (fitz) 1.26.7 - PDF processing
- `surya-ocr` 0.13.1 - Optical Character Recognition
- `pydub` 0.25.1 - Audio processing
- `pandas` 2.3.3+ - Data manipulation
- `psycopg2-binary` 2.9.11+ - PostgreSQL client
- `curl-cffi` 0.14.0+ - HTTP with anti-detection
- `python-dotenv` 1.2.1+ - Environment variable loading
- `tqdm` 4.67.1+ - Progress bars

**Custom:**
- `senko` - Git dependency from `https://github.com/narcotic-sh/senko` (diarization/speech processing)

## Infrastructure

**Database:**
- Supabase (PostgreSQL 15+)
  - pgvector extension for semantic search (768-dim embeddings)
  - Connection: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (service role)

**AI Models:**
- Google Gemini API - LLM refinement and RAG Q&A
- OpenAI API - Text embeddings (`text-embedding-3-small`, 768 dims)
- Fastembed - Local embeddings (`nomic-embed-text-v1.5`, fallback)

**External APIs:**
- Vimeo API - Video metadata and transcript retrieval (OAuth token)
- CivicWeb - Municipal council document scraping

**Caching:**
- In-memory (application-level) for Vimeo thumbnails and metadata
- Supabase `meetings.meta` JSONB column for cached video URLs (3-hour TTL)

## Configuration

**Environment:**
- Web app: `apps/web/wrangler.toml [vars]` section defines build-time public vars
  - Public vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, `VIMEO_PROXY_URL`, `VIMEO_PROXY_FALLBACK_URL`
- Web app: `apps/web/.env` (local development, not committed)
- Pipeline: `apps/pipeline/.env` (not committed)
- Root: `.env` (monorepo-level secrets, not committed)

**Build:**
- `apps/web/vite.config.ts` - Vite configuration with environment variable loading
  - Loads from `wrangler.toml [vars]` first, then `process.env`, then root `.env`, then local `.env`
  - Uses `define` block to inline env vars at build time (required for Cloudflare Workers where `process.env` doesn't exist)
- `apps/pipeline/pyproject.toml` - Python project metadata and dependencies

**Secrets Management:**
- Cloudflare Workers: Runtime secrets (`SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `VIMEO_PROXY_API_KEY`)
- Cloudflare Build Configuration: Build-time secrets for compilation
- Local `.env` files: Development environment

## Database Schema

- PostgreSQL 15+ via Supabase
- Extensions: `pgvector` (vector embeddings)
- Key tables: `meetings`, `agenda_items`, `motions`, `transcript_segments`, `people`, `organizations`, `memberships`, `bylaws`, `documents`, `matters`
- Embedding dimension: 768 (Gemini embedding-001 output)
- Index type: HNSW (Hierarchical Navigable Small World) for vector search

## Monorepo Structure

```
apps/web/              # React Router 7 web app (Cloudflare Workers)
apps/vimeo-proxy/      # Cloudflare Worker + Puppeteer for Vimeo URL extraction
apps/pipeline/         # Python ETL pipeline
sql/                   # Database bootstrap (bootstrap.sql)
.planning/codebase/    # Codebase documentation (this directory)
```

## Platform Requirements

**Development:**
- Node.js LTS (for pnpm, Vite, wrangler)
- Python 3.13 (pipeline execution)
- macOS with Apple Silicon (for MLX diarization) or equivalent Linux/Windows setup

**Production:**
- Cloudflare Workers (web app hosting)
- Supabase (PostgreSQL 15+, pgvector extension)
- Vimeo API access (OAuth token required)

---

*Stack analysis: 2026-02-16*
