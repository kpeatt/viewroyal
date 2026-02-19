# ViewRoyal.ai

An open-source civic intelligence platform for the Town of View Royal, BC. Browse council meetings, watch video with synced transcripts, explore voting records, and ask AI-powered questions about local government decisions.

**Live at [viewroyal.ai](https://viewroyal.ai)**

## Features

- **Meeting Explorer** — Watch council meeting video with a synced sidebar showing agenda items, motions, and speaker-attributed transcripts
- **Unified Search** — Perplexity-style single search page with auto-intent detection: keyword queries show hybrid-ranked results across all content types; natural language questions trigger streaming AI answers with inline citations
- **Hybrid Search** — Reciprocal Rank Fusion combining vector similarity and full-text search across motions, key statements, document sections, and transcript segments
- **Voting Records** — See how each council member voted on every motion, with alignment analysis
- **AI Q&A** — Multi-tool RAG agent with streaming answers, confidence indicators, conversation follow-ups (5-turn memory), and shareable cached answer URLs
- **Key Statement Extraction** — AI-extracted typed statements (claims, proposals, objections, recommendations, financial impacts, public input) attributed to speakers
- **Council Profiles** — Attendance stats, voting history, speaking time metrics (trend sparkline, topic breakdown, peer ranking), and AI-generated stance summaries per topic with confidence scoring and evidence quotes
- **Councillor Comparison** — Side-by-side comparison of any two councillors: voting alignment percentage, per-topic stance agreement indicators, activity stats, and speaking time by topic
- **Bylaw & Matter Tracking** — Follow issues as they move through council across multiple meetings
- **Election History** — Past election results with candidate details
- **Speaker Identification** — Diarized transcripts with speaker aliases resolved to real names via AI matching

## Architecture

```
apps/
  web/                    # React Router 7 web application (Cloudflare Workers)
  pipeline/               # Python ETL pipeline
    pipeline/             #   Core package
      scrapers/           #     CivicWeb, Legistar, Static HTML scrapers
      ingestion/          #     AI refiner, ingester, embeddings
      video/              #     Vimeo client, audio processing
      diarization/        #     MLX transcription + speaker diarization
    scripts/              #   Maintenance & backfill scripts
    main.py               #   Pipeline entry point
  vimeo-proxy/            # Cloudflare Worker for Vimeo URL extraction
sql/
  bootstrap.sql           # Complete database schema (Supabase/PostgreSQL + pgvector)
```

**Data flow:** CivicWeb (PDFs/HTML) + Vimeo (video/audio) → Python pipeline (5 phases) → Supabase → React Router web app

**Municipality context layer:** The root loader fetches the municipality row (currently hardcoded to slug `"view-royal"`), providing `name`, `short_name`, `website_url`, `rss_url`, `contact_email`, and `map_center` to all routes. Meta tags, service queries, AI prompts, and component copy are all driven by this data rather than hardcoded strings.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web app | [React Router 7](https://reactrouter.com/) (SSR on Cloudflare Workers), [Tailwind CSS 4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) |
| Hosting | [Cloudflare Workers](https://workers.cloudflare.com/) |
| Database | [Supabase](https://supabase.com/) (PostgreSQL + pgvector + halfvec) |
| Pipeline | Python 3.13+, [uv](https://github.com/astral-sh/uv) |
| AI Refinement | Google Gemini 3 Flash (structured meeting extraction) |
| AI Q&A | Google Gemini 3 Flash (multi-tool RAG agent with citations) |
| Embeddings | OpenAI `text-embedding-3-small` (384-dim halfvec via Matryoshka truncation) |
| Transcription | Local MLX-based diarization on Apple Silicon |
| Video | Vimeo API + HLS playback |

## Database Schema

20 tables powered by Supabase (PostgreSQL + pgvector):

| Table | Purpose |
|-------|---------|
| `meetings` | Council meetings with status flags, video URLs, summaries |
| `agenda_items` | Per-meeting items with AI-generated summaries, debate summaries, discussion timestamps |
| `motions` | Formal motions with mover/seconder, results, vote tallies |
| `votes` | Individual council member votes on each motion |
| `transcript_segments` | Speaker-attributed transcript with timestamps and full-text search |
| `key_statements` | AI-extracted typed statements (claim/proposal/objection/recommendation/financial/public_input) |
| `meeting_speaker_aliases` | Maps diarization labels (Speaker_01) to real people |
| `matters` | Longitudinal topics tracked across meetings |
| `bylaws` + `bylaw_chunks` | Bylaw text split into searchable chunks |
| `documents` | Meeting PDFs (agendas, minutes, staff reports) |
| `people` | Council members, staff, public delegates |
| `organizations` + `memberships` | Governance structure and roles |
| `elections` + `candidacies` | Election history |
| `attendance` + `meeting_events` | Meeting participation tracking |
| `municipalities` | Municipality config: name, slug, website URL, RSS feed, map center, contact email |
| `topics` | Controlled taxonomy for agenda item classification |
| `councillor_stances` | AI-generated stance summaries per councillor per topic with position scores, confidence, and evidence |

**Search infrastructure:**
- `halfvec(384)` HNSW indexes on agenda_items, motions, matters, bylaws, bylaw_chunks, key_statements, meetings, documents
- `tsvector` GIN indexes for full-text search on transcript_segments, motions, agenda_items, matters, key_statements
- 3 `hybrid_search_*` RPC functions using Reciprocal Rank Fusion (vector + FTS)
- 7 `match_*` RPC functions for vector similarity search
- `search_results_cache` table for shareable AI answer URLs (30-day TTL)

## Getting Started

### Prerequisites

- [pnpm](https://pnpm.io/) (web app)
- [uv](https://github.com/astral-sh/uv) (pipeline)
- A [Supabase](https://supabase.com/) project

### Environment Setup

Create a `.env` file in the project root:

```env
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SECRET_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:your-password@db.your-project.supabase.co:5432/postgres
SUPABASE_DB_PASSWORD=your-db-password

# Web app (also needs these in apps/web/.env or root .env)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key

# AI & Video
GEMINI_API_KEY=your-google-ai-key
OPENAI_API_KEY=your-openai-key
VIMEO_TOKEN=your-vimeo-api-token
```

### Database Setup

Apply the schema in your Supabase SQL Editor:

```sql
-- Run the contents of sql/bootstrap.sql
```

### Web App

```bash
cd apps/web
pnpm install
pnpm dev        # http://localhost:5173
pnpm deploy     # build + deploy to Cloudflare Workers
```

## Data Pipeline

The pipeline scrapes, transcribes, and processes council meetings into structured data. All commands run from `apps/pipeline/`.

### Full Pipeline (5 Phases)

```bash
cd apps/pipeline

# Run everything: scrape → download audio → diarize → ingest → embed
uv run python main.py --download-audio
```

| Phase | What it does |
|-------|-------------|
| 1. Documents | Scrape agendas & minutes PDFs from CivicWeb (or Legistar/static HTML) |
| 2. Vimeo Download | Match meetings to Vimeo videos, download audio |
| 3. Diarization | Transcribe + speaker-diarize audio files locally (MLX on Apple Silicon) |
| 4. Ingestion | AI refinement via Gemini Flash: extracts agenda items, motions, votes, speaker aliases, key statements, summaries. Upserts to Supabase with smart change detection. |
| 5. Embeddings | Generate OpenAI `text-embedding-3-small` halfvec(384) vectors for semantic search |

Phase 4 uses **smart change detection**: it compares disk state (new agenda/minutes/transcript files) against DB flags (`has_agenda`, `has_minutes`, `has_transcript`) and automatically re-ingests meetings that have new data.

### Selective Execution

```bash
# Only run ingestion with change detection (Phase 4)
uv run python main.py --ingest-only

# Force-update all meetings during ingestion
uv run python main.py --ingest-only --update

# Only generate embeddings for rows missing them (Phase 5)
uv run python main.py --embed-only

# Process audio → ingest → embed (skip scraping/download)
uv run python main.py --process-only

# Re-diarize cached transcripts → re-ingest → embed
uv run python main.py --rediarize --limit 5

# Target a single meeting by DB ID
uv run python main.py --target 42

# Target a specific municipality
uv run python main.py --municipality esquimalt
```

### All CLI Flags

| Flag | Description |
|------|-------------|
| `--download-audio` | Download audio files (MP3) from Vimeo |
| `--include-video` | Download MP4 video files |
| `--videos-only` | Skip document scraping (Phase 1) |
| `--skip-diarization` | Skip audio processing (Phase 3) |
| `--skip-ingest` | Skip database ingestion (Phase 4) |
| `--skip-embed` | Skip embedding generation (Phase 5) |
| `--process-only` | Only diarize existing audio (skip Phases 1-2) |
| `--rediarize` | Re-run diarization reusing cached raw transcripts |
| `--ingest-only` | Only run Phase 4 (with change detection) |
| `--embed-only` | Only run Phase 5 |
| `--target <id\|path>` | Target a single meeting (force re-processes) |
| `--update` | Force update existing meetings (with `--ingest-only`) |
| `--extract-documents` | Run Gemini-powered document extraction on agenda PDFs (resumable) |
| `--batch` | Use Gemini Batch API for extraction (50% cost savings, use with `--extract-documents`) |
| `--force` | Delete and reprocess all extraction data (use with `--extract-documents`) |
| `--generate-stances` | Generate AI stance summaries for all councillors using Gemini (use `--target` for single person) |
| `--municipality <slug>` | Target a specific municipality (loads config from DB) |
| `--limit N` | Limit number of items to process (testing) |
| `--input-dir DIR` | Override archive directory |

### Standalone Embeddings

```bash
# Embed all tables
uv run python -m pipeline.ingestion.embed --table all

# Embed a specific table
uv run python -m pipeline.ingestion.embed --table motions

# Re-embed everything from scratch
uv run python -m pipeline.ingestion.embed --table all --force
```

### AI Refinement

Phase 4 sends meeting documents (agenda PDF text + minutes PDF text + diarized transcript) to Gemini Flash for structured extraction. The AI refiner produces:

- **Meeting metadata** — type, status, chair, attendees
- **Speaker aliases** — maps Speaker_01 → "John Rogers" etc.
- **Transcript corrections** — fixes ASR misspellings
- **Agenda items** — titles, plain English summaries, debate summaries, discussion timestamps, categories
- **Key statements** — typed statements (claim/proposal/objection/recommendation/financial/public_input) attributed to speakers
- **Motions** — text, mover, seconder, vote results with individual votes
- **Key quotes** — notable quotes from discussion

### Multi-Municipality Support

The pipeline supports multiple municipalities via a scraper abstraction layer:

| Scraper | Source | Municipalities |
|---------|--------|---------------|
| `CivicWebScraper` | CivicWeb portal | View Royal (active) |
| `LegistarScraper` | Legistar/InSite API | Esquimalt (planned) |
| `StaticHtmlScraper` | CSS selector-based | RDOS (planned) |

Scrapers are registered via `SCRAPER_REGISTRY` and selected based on the municipality's `source_config.type`. Each municipality gets its own archive directory and `municipality_id` foreign key throughout the schema.

## RAG Q&A System

The unified search page (`/search`) combines keyword search and AI Q&A in a single interface:

**Keyword Mode** — Hybrid search using Reciprocal Rank Fusion across motions, key statements, document sections, and transcript segments. Results ranked by combined vector similarity + full-text relevance.

**AI Answer Mode** — Streaming RAG agent with 9 tools:
- `search_motions` — Hybrid search on motions (vector + FTS)
- `search_agenda_items` — Full-text search on agenda items
- `search_key_statements` — Hybrid search on extracted statements
- `search_document_sections` — Hybrid search on PDF document sections
- `search_matters` — Vector search on longitudinal topics
- `search_transcript_segments` — Full-text search on transcripts
- `get_statements_by_person` — Find what a specific person said
- `get_voting_history` — Look up voting records
- `get_current_date` — Date context

**Conversation Continuity** — Follow-up questions carry context from previous answers (capped at 5 turns). Topic changes auto-clear context. Gemini generates suggested follow-up chips after each answer.

**Shareable URLs** — Completed AI answers are cached with short IDs (`/search?id=abc123`) for sharing without re-generation.

Embeddings are generated via OpenAI `text-embedding-3-small` at 384 dimensions (Matryoshka truncation), stored as `halfvec(384)` for 4x storage savings over full float32 vector(768).

## Adapting for Another Municipality

1. Add your municipality to the `municipalities` table in Supabase
2. Create a scraper class extending `BaseScraper` (or use an existing one if your source matches CivicWeb/Legistar/static HTML)
3. Register the scraper in `pipeline/scrapers/__init__.py`
4. Apply `sql/bootstrap.sql` to a fresh Supabase project
5. Run the pipeline: `uv run python main.py --municipality your-slug --download-audio`
6. Deploy the web app with your Supabase credentials

## License

[MIT](LICENSE)
