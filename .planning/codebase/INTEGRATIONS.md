# External Integrations

**Analysis Date:** 2026-02-16

## APIs & External Services

**Vimeo:**
- What it's used for: Video hosting, streaming, and transcript retrieval
  - SDK/Client: `@vimeo/player` (browser), custom `VimeoClient` in pipeline (`pipeline/video/vimeo.py`), yt-dlp (fallback download)
  - Auth: `VIMEO_TOKEN` (OAuth token, service role key)
  - Endpoints:
    - API: `https://api.vimeo.com/users/{user}/videos` (video metadata, transcripts)
    - Player: `https://player.vimeo.com/video/{id}`, `https://player.vimeo.com/video/{id}/config` (player config with video/audio streams)
  - Notes: Vimeo proxy uses Puppeteer + Cloudflare Workers to extract direct URLs and bypass authentication

**Google Gemini:**
- What it's used for: LLM-based refinement of meeting data (motions, votes, key statements), RAG Q&A agent
  - SDK/Client: `@google/generative-ai` (browser/server), `google-genai` (pipeline)
  - Auth: `GEMINI_API_KEY`
  - Models: `models/gemini-embedding-001` (768-dim embeddings), `gemini-2.0-flash` or similar (LLM refinement)
  - Endpoints: Google AI Studio API
  - Location in code:
    - Web: `apps/web/app/services/rag.server.ts`, `apps/web/app/lib/embeddings.server.ts`
    - Pipeline: `apps/pipeline/pipeline/ingestion/ai_refiner.py`, `apps/pipeline/pipeline/embeddings.py`

**OpenAI:**
- What it's used for: Text embeddings (text-embedding-3-small, 768 dims)
  - SDK/Client: `openai` (JavaScript v6.17.0, Python v2.15.0)
  - Auth: `OPENAI_API_KEY`
  - Model: `text-embedding-3-small`
  - Location in code:
    - Web: `apps/web/app/lib/embeddings.server.ts` (server-side embeddings)
    - Pipeline: `apps/pipeline/pipeline/ingestion/embed.py` (bulk embedding generation)

**CivicWeb:**
- What it's used for: Scrape municipality council meeting PDFs, agendas, and minutes
  - SDK/Client: Custom `CivicWebClient` and `CivicWebScraper` (`pipeline/civicweb.py`, `pipeline/scrapers/civicweb.py`)
  - Auth: None (public scraping)
  - Base URL: `https://viewroyalbc.civicweb.net`
  - Endpoints: Dynamic document listing and download pages
  - Notes: Uses curl-cffi to handle anti-scraping measures

**YouTube / Video Downloaders:**
- What it's used for: Download video and audio streams from Vimeo/YouTube
  - SDK/Client: `yt-dlp`
  - Auth: None (public videos)
  - Location: `pipeline/video/__init__.py` (YouTubeClient class)

## Data Storage

**Databases:**

**Supabase (PostgreSQL 15+)**
- Connection: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (service role)
- Client libraries: `@supabase/supabase-js` (v2.90.1), `supabase` (Python v2.27.2)
- Extensions: `pgvector` (vector embeddings for semantic search)
- Key tables:
  - `meetings` - Council meeting metadata, video URLs, summaries
  - `agenda_items` - Meeting agenda items with descriptions
  - `motions` - Motion records with text, summaries, voting results
  - `transcript_segments` - Diarized and transcribed speech segments with embeddings
  - `people` - Council members and attendees
  - `organizations` - Town departments, committees, boards
  - `memberships` - Person → Organization relationships
  - `matters` - Business items linked to motions and meetings
  - `bylaws` - Municipal bylaws and regulations
  - `bylaw_chunks` - Searchable bylaw sections
  - `documents` - Supporting documents (policies, reports, etc.)
  - `votes` - Individual votes by person on motions
  - `transcripts` - Full meeting transcripts

**File Storage:**
- Local filesystem only: `viewroyal_archive/` directory (development) or artifact storage during pipeline runs
- No cloud object storage (S3, etc.)

**Caching:**
- Supabase `meetings.meta` JSONB column: Stores cached Vimeo URLs (3-hour TTL)
- In-memory cache: Vimeo thumbnail and metadata caching in web app (`apps/web/app/services/vimeo.server.ts`)

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (PostgreSQL row-level security)
  - Implementation: Cookie-based session management with `@supabase/ssr`
  - Server-side client: `createSupabaseServerClient()` in `apps/web/app/lib/supabase.server.ts`
  - Browser client: `createBrowserClient()` lazy-initialized in `apps/web/app/lib/supabase.ts`
  - Admin (bypass RLS): `getSupabaseAdminClient()` uses service role key

**Authorization:**
- Row-level security (RLS) policies in Supabase
- No explicit user roles detected; likely public read access for most tables

## Monitoring & Observability

**Error Tracking:**
- Not explicitly detected; console.error() used throughout

**Logs:**
- Cloudflare Workers observability enabled in `wrangler.toml`:
  - `[observability]` section with `invocation_logs = true`
- Pipeline: Standard console/print logging with progress bars (tqdm)

**Performance Monitoring:**
- None detected; rate limiting implemented at API level (`apps/web/app/routes/api.ask.tsx`)

## CI/CD & Deployment

**Hosting:**
- Cloudflare Workers - Web app (React Router SSR + API routes)
- Cloudflare Pages - Vimeo proxy
- Pipeline runs locally or via external scheduler (not detected)

**CI Pipeline:**
- Not detected in codebase; deployment appears manual via `pnpm deploy` (wrangler)

**Build Configuration:**
- `wrangler.toml` defines public vars (`[vars]` section) and routes
- Environment variables: Cloudflare dashboard variables + build-time secrets

## Environment Configuration

**Required env vars:**

**Web App:**
- `VITE_SUPABASE_URL` - Public Supabase URL
- `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` - Public Supabase anon key
- `SUPABASE_SECRET_KEY` - Service role key (for server actions)
- `GEMINI_API_KEY` - Google Gemini API key
- `OPENAI_API_KEY` - OpenAI API key
- `VIMEO_PROXY_URL` - Primary vimeo-proxy Worker URL
- `VIMEO_PROXY_FALLBACK_URL` - Fallback vimeo-proxy URL (Render)
- `VIMEO_PROXY_API_KEY` - API key for vimeo-proxy auth
- `VIMEO_PROXY_FALLBACK_API_KEY` - Fallback vimeo-proxy API key

**Pipeline:**
- `SUPABASE_URL` - Supabase URL
- `SUPABASE_KEY` - Supabase anon key (optional)
- `SUPABASE_SECRET_KEY` - Service role key
- `DATABASE_URL` - Direct PostgreSQL connection string (alternative to Supabase client)
- `SUPABASE_DB_PASSWORD` - Database password (for direct connection)
- `VIMEO_TOKEN` - Vimeo API OAuth token
- `GEMINI_API_KEY` - Google Gemini API key
- `OPENAI_API_KEY` - OpenAI API key

**Optional Pipeline Config:**
- `USE_PARAKEET` - Use Parakeet ASR model (default: false)
- `DIARIZATION_DEVICE` - Device for diarization: 'mps' (Apple Silicon), 'cuda', 'cpu' (default: mps)
- `MARKER_LLM_SERVICE` - Marker PDF service (default: ollama)
- `MARKER_LLM_BASE_URL` - Ollama or LM Studio endpoint (default: http://192.168.1.10:11434)
- `MARKER_LLM_MODEL` - LLM model name (default: qwen3:14b)
- `LOCAL_MODEL_URL` - Local model endpoint for AI refiner (default: http://192.168.1.10:11434/v1)
- `LOCAL_MODEL_NAME` - Local model name (default: gemma3:12b)
- `LOCAL_MODEL_TEMPERATURE` - Model temperature (default: 0.1)
- `LOCAL_MODEL_CTX` - Context window size (default: 8192)

**Secrets location:**
- Web app: Cloudflare Worker secrets (runtime) + Cloudflare Build Configuration (build-time)
- Pipeline: `.env` file (not committed, loaded by python-dotenv)
- Vimeo proxy: Cloudflare Worker secrets (`VIMEO_COOKIES` for Netscape format cookies, `API_KEY` for endpoint auth)

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- Vimeo transcript sync: Pipeline fetches transcripts via Vimeo API
- No outbound webhooks detected

## API Routes (Web App)

**Server Actions / API Endpoints:**
- `POST /api/ask` - RAG Q&A agent (streaming response)
  - Rate limited: 10 requests per minute per IP
  - Streaming: Server-sent events (SSE)
  - Location: `apps/web/app/routes/api.ask.tsx`

- `POST /api/vimeo-url` - Extract direct Vimeo streaming URLs
  - Proxy endpoint: Calls vimeo-proxy Worker
  - Location: `apps/web/app/routes/api.vimeo-url.ts` (likely route handler)
  - Fallback: If primary vimeo-proxy fails, uses fallback URL

## Network Configuration

**CORS:**
- Vimeo proxy: Whitelist-based CORS (`ALLOWED_ORIGINS` environment variable)
- Web app: Cloudflare Workers default CORS behavior

**Rate Limiting:**
- Web app Q&A API: In-memory rate limiter (10 req/min per IP)
- No database-level rate limiting detected

---

*Integration audit: 2026-02-16*
