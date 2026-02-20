# ViewRoyal.ai -- Data Pipeline

Python ETL pipeline that scrapes council meeting documents, diarizes video, and ingests structured data into Supabase.

## Setup

### Prerequisites

- Python 3.13+
- [uv](https://github.com/astral-sh/uv) package manager

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon key |
| `SUPABASE_SECRET_KEY` | Supabase service role key |
| `GEMINI_API_KEY` | Google Generative AI key (Phase 4 refinement) |
| `OPENAI_API_KEY` | OpenAI key (Phase 5 embeddings) |
| `VIMEO_TOKEN` | Vimeo API token (Phase 2 audio download) |
| `MOSHI_TOKEN` | Moshi push notification token (optional, update-mode alerts) |

## Quick Start

```bash
cd apps/pipeline
uv run python main.py --download-audio
```

This runs the full 5-phase pipeline: scrape, download audio, diarize, ingest, and embed.

## Pipeline Phases

| Phase | What it does |
|-------|-------------|
| 1. Documents | Scrape agendas & minutes PDFs from CivicWeb (or Legistar/static HTML) |
| 2. Vimeo Download | Match meetings to Vimeo videos, download audio |
| 3. Diarization | Transcribe + speaker-diarize audio files locally (MLX on Apple Silicon) |
| 4. Ingestion | AI refinement via Gemini Flash: extracts agenda items, motions, votes, speaker aliases, key statements, summaries. Upserts to Supabase with smart change detection. |
| 5. Embeddings | Generate OpenAI `text-embedding-3-small` halfvec(384) vectors for semantic search |

Phase 4 uses **smart change detection**: it compares disk state (new agenda/minutes/transcript files) against DB flags (`has_agenda`, `has_minutes`, `has_transcript`) and automatically re-ingests meetings that have new data.

## CLI Reference

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

## Selective Execution

```bash
# Only run ingestion with change detection (Phase 4)
uv run python main.py --ingest-only

# Force-update all meetings during ingestion
uv run python main.py --ingest-only --update

# Only generate embeddings for rows missing them (Phase 5)
uv run python main.py --embed-only

# Process audio -> ingest -> embed (skip scraping/download)
uv run python main.py --process-only

# Re-diarize cached transcripts -> re-ingest -> embed
uv run python main.py --rediarize --limit 5

# Target a single meeting by DB ID
uv run python main.py --target 42

# Target a specific municipality
uv run python main.py --municipality esquimalt
```

## Standalone Embeddings

```bash
# Embed all tables
uv run python -m pipeline.ingestion.embed --table all

# Embed a specific table
uv run python -m pipeline.ingestion.embed --table motions

# Re-embed everything from scratch
uv run python -m pipeline.ingestion.embed --table all --force
```

## AI Refinement

Phase 4 sends meeting documents (agenda PDF text + minutes PDF text + diarized transcript) to Gemini Flash for structured extraction. The AI refiner produces:

- **Meeting metadata** -- type, status, chair, attendees
- **Speaker aliases** -- maps Speaker_01 to "John Rogers" etc.
- **Transcript corrections** -- fixes ASR misspellings
- **Agenda items** -- titles, plain English summaries, debate summaries, discussion timestamps, categories
- **Key statements** -- typed statements (claim/proposal/objection/recommendation/financial/public_input) attributed to speakers
- **Motions** -- text, mover, seconder, vote results with individual votes
- **Key quotes** -- notable quotes from discussion

## Multi-Municipality Support

The pipeline supports multiple municipalities via a scraper abstraction layer:

| Scraper | Source | Municipalities |
|---------|--------|---------------|
| `CivicWebScraper` | CivicWeb portal | View Royal (active) |
| `LegistarScraper` | Legistar/InSite API | Esquimalt (planned) |
| `StaticHtmlScraper` | CSS selector-based | RDOS (planned) |

Scrapers are registered via `SCRAPER_REGISTRY` and selected based on the municipality's `source_config.type`. Each municipality gets its own archive directory and `municipality_id` foreign key throughout the schema.

## Testing

```bash
# Run all tests
uv run pytest

# Run a single test file with verbose output
uv run pytest tests/core/test_parser.py -v
```

## Project Structure

```
apps/pipeline/
  main.py                   Entry point
  pipeline/
    orchestrator.py          Pipeline orchestration and phase execution
    config.py                Configuration and environment loading
    paths.py                 File path management for archives
    utils.py                 Shared utilities
    scrapers/
      base.py                BaseScraper abstract class
      civicweb.py            CivicWeb portal scraper
      legistar.py            Legistar/InSite API scraper
      static_html.py         CSS selector-based HTML scraper
      bylaws.py              Bylaw scraping
    video/
      vimeo.py               Vimeo API client and audio download
    diarization/
      pipeline.py            Diarization orchestration
      inference.py           MLX model inference
      audio.py               Audio preprocessing
      clustering.py          Speaker clustering
      models.py              Model loading
    ingestion/
      ai_refiner.py          Gemini-powered meeting extraction
      ingester.py            Supabase upsert logic
      embed.py               Embedding generation (OpenAI)
      gemini_extractor.py    Document section extraction
      batch_extractor.py     Gemini Batch API extraction
      document_chunker.py    PDF document chunking
      image_extractor.py     Document image extraction
      audit.py               Change detection and audit
      matter_matching.py     Cross-meeting matter linking
    profiling/               Councillor stance generation
    update_detector.py       New meeting/document detection
    notifier.py              Push notification integration (Moshi)
  tests/                     pytest test suite
  scripts/                   One-off maintenance scripts (gitignored)
```
