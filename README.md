# ViewRoyal.ai

An open-source civic transparency platform for the Town of View Royal, BC. Browse council meetings, watch video with synced transcripts, explore voting records, and ask AI-powered questions about local government decisions.

**Live at [viewroyal.ai](https://viewroyal.ai)**

## Features

- **Meeting Explorer** — Watch council meeting video with a synced sidebar showing agenda items, motions, and speaker-attributed transcripts
- **Full-Text Search** — Search across transcripts, motions, agenda items, and bylaws
- **Voting Records** — See how each council member voted on every motion, with alignment analysis
- **AI Q&A** — Ask natural language questions about council decisions, answered with citations from official records
- **Council Profiles** — Attendance stats, voting history, and speaking time for each member
- **Bylaw & Matter Tracking** — Follow issues as they move through council across multiple meetings
- **Election History** — Past election results with candidate details

## Architecture

```
apps/web/               # React Router 7 web application (Cloudflare Workers)
src/
  core/                 # Shared config, parsers, embeddings client
  pipeline/             # ETL: scraper, ingester, AI refiner, batch processing
  maintenance/          # Seeding, audits, archive tools
  analysis/             # RAG-powered person analysis, vote checking
sql/
  bootstrap.sql         # Complete database schema (Supabase/PostgreSQL)
```

**Data flow:** CivicWeb (PDFs/HTML) + Vimeo (video/audio) → Python pipeline → Supabase → React Router web app

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web app | [React Router 7](https://reactrouter.com/) (SSR), [Tailwind CSS 4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) |
| Hosting | [Cloudflare Workers](https://workers.cloudflare.com/) |
| Database | [Supabase](https://supabase.com/) (PostgreSQL + pgvector) |
| Pipeline | Python 3.13+, [uv](https://github.com/astral-sh/uv) |
| AI | Google Gemini (refinement, RAG Q&A) |
| Embeddings | [fastembed](https://github.com/qdrant/fastembed) (nomic-embed-text-v1.5, runs locally) |
| Transcription | Local MLX-based diarization on Apple Silicon |
| Video | Vimeo API + HLS playback |

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

Then seed the core reference data:

```bash
uv run python src/maintenance/seeding/seed_organizations.py --execute
uv run python src/maintenance/seeding/import_election_history.py --execute
uv run python src/maintenance/seeding/import_staff.py --execute
```

### Web App

```bash
cd apps/web
pnpm install
pnpm dev        # http://localhost:5173
pnpm deploy     # build + deploy to Cloudflare Workers
```

## Data Pipeline

The pipeline scrapes, transcribes, and processes council meetings into structured data. A single `python main.py` command runs all 5 phases with smart change detection.

### Full Pipeline (5 Phases)

```bash
# Run everything: scrape → download audio → diarize → ingest → embed
uv run python main.py --download-audio
```

| Phase | What it does |
|-------|-------------|
| 1. Documents | Scrape agendas & minutes PDFs from CivicWeb |
| 2. Vimeo Download | Match meetings to Vimeo videos, download audio |
| 3. Diarization | Transcribe + speaker-diarize audio files locally |
| 4. Ingestion | AI refinement + upsert meetings, items, motions, votes to DB |
| 5. Embeddings | Generate OpenAI `text-embedding-3-small` vectors for semantic search |

Phase 4 uses **smart change detection**: it compares disk state (new agenda/minutes/transcript files) against DB flags (`has_agenda`, `has_minutes`, `has_transcript`) and automatically re-ingests meetings that have new data. Freshly diarized meetings from Phase 3 are also force-updated.

### Selective Execution

```bash
# Original behavior (Phases 1-3 only, no DB writes)
uv run python main.py --download-audio --skip-ingest --skip-embed

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
```

### Targeting a Single Meeting

Re-process a specific meeting by DB ID or folder path:

```bash
# By database ID (looks up archive_path automatically)
uv run python main.py --target 42

# By folder path
uv run python main.py --target "viewroyal_archive/Council/2024/01/2024-01-16 Regular Council"

# Re-diarize + re-ingest a specific meeting
uv run python main.py --target 42 --rediarize

# Target but skip embedding
uv run python main.py --target 42 --skip-embed
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
| `--limit N` | Limit number of items to process (testing) |
| `--input-dir DIR` | Override archive directory |

### Batch Processing

For processing many meetings efficiently using Gemini's batch API:

```bash
uv run python src/pipeline/batch.py create --batch-size 50
uv run python src/pipeline/batch.py submit
uv run python src/pipeline/batch.py status
uv run python src/pipeline/batch.py download
uv run python src/pipeline/batch.py ingest
```

### Standalone Embeddings

Embeddings can also be run standalone with more options:

```bash
# Embed all tables (transcript segments filtered to 15+ words by default)
uv run python src/pipeline/embed_local.py --table all

# Embed a specific table
uv run python src/pipeline/embed_local.py --table motions

# Re-embed everything from scratch
uv run python src/pipeline/embed_local.py --table all --force

# Adjust minimum word filter for transcript segments
uv run python src/pipeline/embed_local.py --table transcript_segments --min-words 20
```

### Maintenance & Audits

```bash
# Check for meetings with new documents that need re-ingestion
uv run python src/maintenance/audit/check_occurred_meetings.py

# Actually re-ingest them
uv run python src/maintenance/audit/check_occurred_meetings.py --reingest --refine
```

### Analysis

```bash
# Analyze a council member's positions via RAG
uv run python src/analysis/person_analysis.py "David Screech" --interactive

# Check vote details
uv run python src/analysis/check_votes.py 2024-01-15 --detail
```

## Adapting for Another Municipality

This platform is designed around CivicWeb-powered municipalities. To adapt it:

1. Update `src/core/config.py` with your municipality's CivicWeb and Vimeo URLs
2. Modify the seeding scripts in `src/maintenance/seeding/` for your council members and organizations
3. Apply `sql/bootstrap.sql` to a fresh Supabase project
4. Run the pipeline to scrape and process your meetings
5. Deploy the web app with your Supabase credentials

## License

[MIT](LICENSE)
