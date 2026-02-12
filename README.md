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
SUPABASE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:your-password@db.your-project.supabase.co:5432/postgres

# Web app (also needs these in apps/web/.env or root .env)
SUPABASE_SECRET_KEY=your-service-role-key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key

# AI & Video
GEMINI_API_KEY=your-google-ai-key
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

The pipeline scrapes, transcribes, and processes council meetings into structured data.

### Archive & Ingest

```bash
# Scrape documents from CivicWeb + download Vimeo audio
uv run python main.py --download-audio

# Scrape documents only (fastest)
uv run python main.py --videos-only

# Ingest archive into database
uv run python src/pipeline/ingest.py

# Ingest a specific meeting
uv run python src/pipeline/ingest.py "viewroyal_archive/Council/2023-11-21 Regular Council"
```

### Batch Processing

For processing many meetings efficiently using Gemini's batch API:

```bash
uv run python src/pipeline/batch.py create --batch-size 50
uv run python src/pipeline/batch.py submit
uv run python src/pipeline/batch.py status
uv run python src/pipeline/batch.py download
uv run python src/pipeline/batch.py ingest
```

### Embeddings

Generate semantic search vectors locally using nomic-embed-text-v1.5:

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

Requires `DATABASE_URL` in `.env` for direct Postgres access.

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
