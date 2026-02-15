# Plan: Multi-Town Council Meeting Ingestion

## Problem Statement

ViewRoyal.ai currently ingests data from a single municipality (View Royal, BC) using a single source type (CivicWeb). To support additional towns like Esquimalt (Legistar) and RDOS (custom website), the system needs to become source-agnostic and municipality-aware at every layer: database, pipeline, and web app.

## Source System Analysis

### Current: CivicWeb (View Royal)
- **API**: Undocumented REST API at `{base}/api/documents/getchildlist` with pagination
- **Data**: Hierarchical folder tree containing PDFs (agendas, minutes) organized by meeting type and date
- **Video**: Separate Vimeo account (`vimeo.com/viewroyal`), matched to meetings by date
- **Strengths**: Consistent folder structure, reliable date extraction from folder names

### Target 1: Legistar/InSite (Esquimalt)
- **API**: Documented REST API at `webapi.legistar.com/v1/{client}/events` with OData filtering
- **Data**: Structured JSON with events, event items, matters, votes, people, and bodies — already parsed, no PDF extraction needed for structured fields
- **Video**: Often embedded as `EventVideoPath` in the event record, or linked from InSite pages
- **Strengths**: Pre-structured data (motions, votes, sponsors already parsed), standardized across 1000+ municipalities
- **Gotchas**: Some clients require API tokens; 1000-record page limit; some data only on InSite HTML pages (not in API)

### Target 2: Custom Websites (RDOS)
- **Structure**: Static HTML pages organized by year with links to PDF agenda packages
- **URL pattern**: `rdos.bc.ca/assets/BOARD/Agendas/{YEAR}/{DATE}-Agenda-Package.pdf`
- **Video**: YouTube channel (separate from website)
- **Challenges**: No API — requires HTML scraping; PDF-only content; URL patterns vary per site

## Architecture Changes

### Layer 0: Python Monorepo Reorganization

The current Python code lives in a bare `src/` at the repo root alongside `main.py` and `pyproject.toml`. This is ambiguous in a monorepo that also has `apps/web/` and `apps/vimeo-proxy/`. Before adding multi-town abstractions, move the Python pipeline into `apps/pipeline/` to match the monorepo convention and establish a proper package structure.

#### Current layout (problems)

```
viewroyal/
    main.py                  # Entrypoint at repo root — competes with web config files
    pyproject.toml           # Python config at repo root
    tests/                   # Tests at repo root
    src/                     # Ambiguous — "src of what?"
        core/                # Shared utilities, names, config, parser
            mlx_diarizer/    # Only subpackage with __init__.py
        pipeline/            # Scraper, ingester, diarizer, embeddings
            scraper.py       # CivicWeb-only
            vimeo.py         # Vimeo-only
        analysis/            # Ad-hoc analysis scripts
        maintenance/         # Mix of one-off scripts AND code imported by pipeline
            audit/
                check_occurred_meetings.py  # Imported by orchestrator — not really "maintenance"
            archive/         # One-off cleanup scripts
            db/              # One-off DB scripts
            seeding/         # Seed data importers
            transcript/      # One-off transcript fixes
```

**Problems:**
- No `__init__.py` files (except `mlx_diarizer/`) — relies on repo root in `sys.path`
- `src/maintenance/audit/check_occurred_meetings.py` is imported by the orchestrator at runtime — it's core pipeline code hiding in "maintenance"
- Multiple dead/duplicate files in `pipeline/`: `batch.py`, `batch_embeddings.py`, `diarizer.py` (superseded by `local_diarizer.py`), `embeddings.py` (superseded by `embed_local.py`), `ingest.py` (older entrypoint alongside `ingester.py`)
- `pyproject.toml`, `main.py`, `tests/` at repo root compete with `pnpm-workspace.yaml`, `wrangler.toml`, etc.

#### Target layout

```
apps/pipeline/                    # Python ETL pipeline — parallel to apps/web/, apps/vimeo-proxy/
    pyproject.toml
    main.py
    tests/
        core/
            test_parser.py
            test_utils.py
            test_marker_ocr.py
            test_nlp.py
        pipeline/
            test_ingester_logic.py
            test_local_refiner_logic.py
            test_agenda_only.py
    pipeline/                     # Importable Python package (has __init__.py)
        __init__.py
        config.py                 # was: src/core/config.py
        paths.py                  # was: src/core/paths.py
        utils.py                  # was: src/core/utils.py
        names.py                  # was: src/core/names.py
        parser.py                 # was: src/core/parser.py
        marker_parser.py          # was: src/core/marker_parser.py
        alignment.py              # was: src/core/alignment.py
        embeddings.py             # was: src/core/embeddings.py
        markdown_generator.py     # was: src/core/markdown_generator.py
        diarization/              # was: src/core/mlx_diarizer/ + pipeline/local_diarizer.py
            __init__.py
            local_diarizer.py
            audio.py
            clustering.py
            convert.py
            diarization_types.py
            inference.py
            models.py
            pipeline.py
            resnet_embedding.py
        scrapers/                 # was: src/pipeline/scraper.py + src/core/civicweb.py
            __init__.py           # Scraper registry + get_scraper()
            base.py               # BaseScraper ABC + ScrapedMeeting dataclass
            civicweb.py           # Merged from core/civicweb.py + pipeline/scraper.py
            legistar.py           # NEW (Phase 2)
            static_html.py        # NEW (Phase 2)
        video/                    # was: src/pipeline/vimeo.py
            __init__.py           # Video source registry + get_video_client()
            base.py               # BaseVideoSource ABC
            vimeo.py              # Refactored from pipeline/vimeo.py
            youtube.py            # NEW (Phase 2)
        ingestion/                # was: src/pipeline/ingester.py, ai_refiner.py, etc.
            __init__.py
            ingester.py
            ai_refiner.py
            matter_matching.py
            embed.py              # was: pipeline/embed_local.py
            bylaws.py             # was: pipeline/ingest_bylaws.py
            process_agenda.py     # was: pipeline/process_agenda_intelligence.py
            process_bylaws.py     # was: pipeline/process_bylaws_intelligence.py
            audit.py              # was: maintenance/audit/check_occurred_meetings.py (runtime dependency)
        orchestrator.py
    scripts/                      # One-off / manual-run scripts (NOT imported at runtime)
        archive/
            canonicalize_archive.py
            cleanup_documents.py
            fix_misplaced_council_meetings.py
        db/
            clean_agenda_markdown.py
            link_matters_to_bylaws.py
            reset_db.py
        seeding/
            import_election_history.py
            import_staff.py
            seed_organizations.py
        transcript/
            clean_transcript_spellings.py
            harvest_corrections.py
        analysis/
            check_votes.py
            person_analysis.py
        audit/
            meeting_inventory.py
            run_audit.py
```

#### What changes

| Before | After | Notes |
|--------|-------|-------|
| `from src.core import utils` | `from pipeline import utils` | All imports simplified |
| `from src.pipeline.scraper import CivicWebScraper` | `from pipeline.scrapers import get_scraper` | Dynamic dispatch via registry |
| `from src.core.civicweb import CivicWebClient` | (merged into `pipeline/scrapers/civicweb.py`) | No longer split across core/pipeline |
| `from src.maintenance.audit.check_occurred_meetings import ...` | `from pipeline.ingestion.audit import ...` | Runtime dependency moved into package |
| Global `ARCHIVE_ROOT` constant | `get_archive_root(municipality_slug)` | Per-municipality archives |

#### Files to delete (dead/superseded code)

Verify these are unused before deleting:
- `src/pipeline/batch.py` — old batch processing entrypoint
- `src/pipeline/batch_embeddings.py` — old batch embedding runner
- `src/pipeline/diarizer.py` — superseded by `local_diarizer.py`
- `src/pipeline/embeddings.py` — superseded by `embed_local.py`
- `src/pipeline/ingest.py` — older ingestion entrypoint (vs `ingester.py`)
- `src/pipeline/scrape_election_results.py` — one-off scraper, move to `scripts/` if still useful

#### Import rewriting strategy

All imports use the `from src.` prefix pattern — a global find-and-replace of `from src.core` → `from pipeline` and `from src.pipeline` → `from pipeline` covers the majority. The `pyproject.toml` moves into `apps/pipeline/` and the `[project]` name changes from `viewroyal` to `civic-pipeline` (or similar). Commands become:

```bash
cd apps/pipeline && uv run python main.py --municipality view-royal
cd apps/pipeline && uv run pytest
```

Or with a root-level pnpm script that wraps it:
```json
{ "scripts": { "pipeline": "cd apps/pipeline && uv run python main.py" } }
```

### Layer 1: Database — Add `municipalities` Table

Add a new `municipalities` table as the top-level entity that scopes all data.

```sql
CREATE TABLE municipalities (
    id bigint generated by default as identity primary key,
    slug text not null unique,          -- "view-royal", "esquimalt", "rdos"
    name text not null,                 -- "Town of View Royal"
    short_name text not null,           -- "View Royal"
    province text default 'BC',
    classification text default 'Town', -- "Town", "City", "District", "Regional District"

    -- Source configuration (JSONB for flexibility across source types)
    source_config jsonb not null,
    -- Example for CivicWeb:
    -- {
    --   "type": "civicweb",
    --   "base_url": "https://viewroyalbc.civicweb.net",
    --   "video_source": {"type": "vimeo", "user": "viewroyal"}
    -- }
    -- Example for Legistar:
    -- {
    --   "type": "legistar",
    --   "client_id": "esquimalt",
    --   "timezone": "America/Vancouver",
    --   "video_source": {"type": "legistar_inline"}
    -- }
    -- Example for custom scraper:
    -- {
    --   "type": "custom",
    --   "scraper_class": "RDOSScraper",
    --   "base_url": "https://www.rdos.bc.ca",
    --   "video_source": {"type": "youtube", "channel": "RDOS"}
    -- }

    -- Display/branding
    map_center_lat float,               -- 48.455
    map_center_lng float,               -- -123.44
    website_url text,                   -- "https://www.viewroyal.ca"
    rss_url text,                       -- Public notices RSS
    contact_email text,

    meta jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
```

**Add `municipality_id` foreign key** to these tables:
- `organizations` (required — each council belongs to a municipality)
- `meetings` (via organization, but add direct FK for query efficiency)
- `matters` (bylaws/permits are municipality-scoped)
- `people` (people can appear in multiple municipalities — use a join table or keep them global with municipality context via memberships)
- `elections`
- `bylaws`

**Migration strategy**: Add `municipality_id` columns as nullable first, backfill existing data with the View Royal municipality record, then make non-null.

**Impact on unique constraints**: `matters.identifier` should become unique per municipality (`unique(municipality_id, identifier)`), not globally unique. Same for `organizations.name`.

### Layer 2: Pipeline — Scraper Abstraction

#### 2a. Define a `BaseScraper` Interface

Create `pipeline/scrapers/base.py` (already in target layout from Layer 0):

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class ScrapedMeeting:
    """Normalized output from any scraper."""
    date: str                      # ISO date
    meeting_type: str              # "Regular Council", "Public Hearing", etc.
    title: str                     # Human-readable title
    agenda_pdf_urls: list[str]     # Direct download URLs
    minutes_pdf_urls: list[str]
    video_url: str | None
    audio_url: str | None
    source_metadata: dict          # Scraper-specific data preserved for debugging

class BaseScraper(ABC):
    def __init__(self, municipality_config: dict):
        self.config = municipality_config

    @abstractmethod
    def discover_meetings(self, since_date=None) -> list[ScrapedMeeting]:
        """Return all meetings, optionally filtered to after since_date."""
        ...

    @abstractmethod
    def download_documents(self, meeting: ScrapedMeeting, target_dir: str) -> str:
        """Download PDFs to target_dir. Return the meeting archive folder path."""
        ...
```

#### 2b. Implement Source-Specific Scrapers

These live under `apps/pipeline/pipeline/scrapers/` (established in Layer 0):

**CivicWeb scraper** (`civicweb.py`): Refactor existing `CivicWebScraper` to extend `BaseScraper`. The recursive folder traversal and PDF download logic stays the same — just parameterize the base URL from `municipality_config`.

**Legistar scraper** (`legistar.py`):
- `discover_meetings()`: Call `GET /v1/{client}/events` with OData date filter. Each event contains `EventDate`, `EventBodyName`, `EventAgendaFile`, `EventMinutesFile`, `EventVideoPath`.
- `download_documents()`: Download agenda/minutes PDFs from the file URLs.
- **Bonus**: For Legistar, much of the AI refinement work is unnecessary because the API already provides structured event items, matter details, votes, and sponsors. Add a `has_structured_data` flag to skip or simplify AI refinement when structured data is available.
- Use `GET /v1/{client}/events/{id}/eventitems` to get agenda items, each with `EventItemMatterId`, `EventItemTitle`, `EventItemActionText`, `EventItemMover`, `EventItemSeconder`, `EventItemPassedFlag`, etc.
- Use `GET /v1/{client}/events/{id}/eventitems/{itemId}/votes` for roll call votes.

**Static HTML scraper** (`static_html.py`):
- Take a CSS selector config (or XPath) for finding meeting links on a page.
- Follow links to find PDF downloads.
- More manual per-site — but config-driven enough to cover RDOS-style sites without writing a new scraper class each time.

#### 2c. Scraper Registry

```python
# pipeline/scrapers/__init__.py
SCRAPER_REGISTRY = {
    "civicweb": CivicWebScraper,
    "legistar": LegistarScraper,
    "static_html": StaticHtmlScraper,
}

def get_scraper(municipality_config: dict) -> BaseScraper:
    scraper_type = municipality_config["source_config"]["type"]
    return SCRAPER_REGISTRY[scraper_type](municipality_config)
```

#### 2d. Archive Directory Per Municipality

Change the archive structure from:

```
viewroyal_archive/
    Council/2024/01/2024-01-15 Regular Council/
```

To:

```
archive/
    view-royal/
        Council/2024/01/2024-01-15 Regular Council/
    esquimalt/
        Council/2024/01/2024-01-15 Regular Council/
    rdos/
        Board/2024/01/2024-01-15 Regular Board/
```

Update `paths.py` to take a `municipality_slug` parameter:
```python
def get_archive_root(municipality_slug: str) -> str:
    return os.path.join(BASE_DIR, "archive", municipality_slug)
```

### Layer 3: Pipeline — Orchestrator Changes

#### 3a. Municipality-Aware CLI

Update `main.py` to accept `--municipality` (or `--all`):

```
uv run python main.py --municipality view-royal          # Single town
uv run python main.py --municipality esquimalt --ingest-only
uv run python main.py --all                              # All configured municipalities
```

Municipalities are loaded from a config file (`municipalities.yaml` or from the database).

#### 3b. Orchestrator Refactoring

The `Archiver` class currently hard-instantiates `CivicWebScraper()` and `VimeoClient()`. Refactor to:

```python
class Archiver:
    def __init__(self, municipality: dict):
        self.municipality = municipality
        self.scraper = get_scraper(municipality)         # Dynamic dispatch
        self.video_client = get_video_client(municipality) # Vimeo, YouTube, or inline
        self.archive_root = get_archive_root(municipality["slug"])
        ...
```

Each phase uses `self.archive_root` instead of the global `ARCHIVE_ROOT`.

#### 3c. Video Source Abstraction

Similar to scrapers, abstract video sources:

```python
class BaseVideoSource(ABC):
    @abstractmethod
    def get_video_map(self, limit=None) -> dict[str, list[dict]]:
        """Return {date_key: [video_data, ...]}"""
        ...

    @abstractmethod
    def download_video(self, video_data, target_dir, **kwargs) -> str | None:
        ...
```

Implementations:
- `VimeoVideoSource` — refactored from existing `vimeo.py`
- `YouTubeVideoSource` — for RDOS and others using YouTube
- `InlineVideoSource` — for Legistar where video URL is part of the event data (no discovery needed)
- `NullVideoSource` — for municipalities without video

### Layer 4: Pipeline — Ingestion Changes

#### 4a. Pass Municipality Context Through Ingestion

`MeetingIngester.process_meeting()` needs a `municipality_id` parameter to:
- Set `municipality_id` on created meetings, organizations, matters
- Scope uniqueness checks (e.g., `matters.identifier` unique per municipality)
- Pass municipality name/context to the AI refiner prompts

#### 4b. Legistar Fast Path

When ingesting from Legistar, most of the AI refinement can be skipped because the API provides structured data. Add a branch in the ingester:

```python
if meeting.source_type == "legistar":
    # Direct structured ingestion — skip AI refinement
    self._ingest_legistar_structured(meeting_data)
else:
    # PDF-based ingestion — extract text, call AI refiner
    self._ingest_from_documents(meeting_folder)
```

This makes Legistar ingestion much faster and cheaper (no Gemini API calls).

#### 4c. Canonical Names Per Municipality

Move `CANONICAL_NAMES` from `pipeline/names.py` (hardcoded View Royal council members) into the database or per-municipality config. The AI refiner prompt should receive the correct list of known people for the current municipality.

### Layer 4.5: Structured Document Storage

#### The Problem

Currently, PDF text is extracted, fed to Gemini, and only the AI-processed summaries are stored. Three things are lost:

1. **Document structure** — section hierarchy, formatting, tables, page layout are discarded
2. **Attachments/schedules** — agenda packages contain staff reports, development applications, maps, financial statements, correspondence, engineering drawings, etc. These are the actual substance council debates. The ingester currently only processes the **first PDF** in each folder and **truncates after "ADJOURNMENT"** to strip embedded attachments.
3. **Reproducibility** — the original documents cannot be faithfully rendered from what's in the database

**Goal**: Store all document content — including every schedule, addendum, and attachment — in a structured way so that complete agenda packages can be faithfully reproduced and searched in the web app, without storing the PDF blobs themselves.

#### 4.5a. `documents` Table

A new table to store the full structured content of each document. This includes the main agenda/minutes AND every attachment (staff reports, schedules, addenda):

```sql
CREATE TABLE documents (
    id bigint generated by default as identity primary key,
    meeting_id bigint REFERENCES meetings(id) ON DELETE CASCADE not null,
    municipality_id bigint REFERENCES municipalities(id) not null,
    agenda_item_id bigint REFERENCES agenda_items(id) ON DELETE SET NULL, -- Which item this attachment supports

    -- Document identity & hierarchy
    document_type text not null,               -- "agenda", "minutes", "staff_report", "schedule",
                                               -- "addendum", "correspondence", "map", "bylaw_text",
                                               -- "financial_statement", "application", "presentation"
    parent_document_id bigint REFERENCES documents(id) ON DELETE CASCADE,
                                               -- null for main agenda/minutes; points to parent for attachments
    attachment_label text,                      -- "Schedule A", "Attachment 1", "Appendix B" (as referenced in agenda)
    sort_order int default 0,                  -- Order within the agenda package

    title text not null,                       -- "Staff Report: Rezoning Application - 123 Island Hwy"
    source_url text,                           -- Original CivicWeb/Legistar download URL
    source_filename text,                      -- "Schedule A - Staff Report.pdf"

    -- Full structured content (the core of this feature)
    content_markdown text not null,            -- Full document as structured markdown
    content_html text,                         -- Pre-rendered HTML version for fast serving

    -- Document metadata
    page_count int,
    author text,                               -- "Director of Engineering", "Building Inspector"
    department text,                           -- "Corporate Services", "Planning", "Engineering"
    adopted_date date,                         -- For minutes: date they were officially adopted
    report_date date,                          -- For staff reports: date the report was written

    -- Extraction provenance
    extraction_method text,                    -- "pymupdf", "marker_ocr", "legistar_structured"
    extraction_quality float,                  -- 0.0-1.0 confidence score
    extraction_warnings text[],                -- ["table on page 3 may have OCR errors", ...]
    extracted_at timestamptz,

    -- Search
    embedding vector(768),                     -- For semantic search across all documents
    meta jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

CREATE INDEX idx_documents_meeting ON documents(meeting_id);
CREATE INDEX idx_documents_municipality ON documents(municipality_id);
CREATE INDEX idx_documents_parent ON documents(parent_document_id);
CREATE INDEX idx_documents_agenda_item ON documents(agenda_item_id);
CREATE INDEX idx_documents_type ON documents(meeting_id, document_type);
```

**Example data for a single meeting:**

| id | document_type | parent_document_id | agenda_item_id | attachment_label | title |
|----|--------------|-------------------|----------------|-----------------|-------|
| 1 | agenda | null | null | null | Regular Council Meeting Agenda - Jan 15, 2024 |
| 2 | staff_report | 1 | 42 | Schedule A | Staff Report: Rezoning Application - 123 Island Hwy |
| 3 | map | 1 | 42 | Schedule B | Site Plan and Context Map |
| 4 | correspondence | 1 | 42 | Schedule C | Letters from Neighbours (12 submissions) |
| 5 | financial_statement | 1 | 45 | Schedule A | 2024 Q3 Financial Variance Report |
| 6 | bylaw_text | 1 | 47 | Schedule A | Bylaw No. 1045 - Zoning Amendment |
| 7 | addendum | 1 | null | Addendum | Late Items - Added Jan 14, 2024 |
| 8 | minutes | null | null | null | Regular Council Meeting Minutes - Jan 15, 2024 |

#### 4.5b. `document_sections` Table

Break each document into its hierarchical section structure — the bones needed to reproduce the document:

```sql
CREATE TABLE document_sections (
    id bigint generated by default as identity primary key,
    document_id bigint REFERENCES documents(id) ON DELETE CASCADE not null,
    agenda_item_id bigint REFERENCES agenda_items(id) ON DELETE SET NULL, -- Links section to parsed agenda item

    -- Hierarchy
    parent_section_id bigint REFERENCES document_sections(id) ON DELETE CASCADE,
    section_order int not null,                -- Sort order within parent
    depth int not null default 0,              -- 0 = top-level, 1 = subsection, etc.

    -- Content
    section_number text,                       -- "5.1", "8.a", "B.2" (as printed in document)
    heading text,                              -- "BYLAWS – Third Reading" or "REPORTS OF COMMITTEES"
    body_markdown text,                        -- Section body content as markdown
    body_html text,                            -- Pre-rendered HTML

    -- Formatting hints for faithful reproduction
    section_type text,                         -- "heading", "motion", "attendance", "call_to_order",
                                               -- "adjournment", "correspondence", "resolution",
                                               -- "table", "appendix", "cover_page",
                                               -- "recommendation", "background", "analysis",
                                               -- "financial_impact", "options", "conclusion"
    page_number int,                           -- Page in original PDF where this section starts
    is_consent_item boolean default false,

    -- For motion sections specifically
    motion_text text,                          -- "THAT the minutes be adopted as circulated"
    motion_result text,                        -- "CARRIED", "DEFEATED"
    motion_mover text,
    motion_seconder text,

    meta jsonb,
    created_at timestamptz default now()
);

CREATE INDEX idx_doc_sections_document ON document_sections(document_id);
CREATE INDEX idx_doc_sections_parent ON document_sections(parent_section_id);
CREATE INDEX idx_doc_sections_agenda_item ON document_sections(agenda_item_id);
```

Staff report sections get their own `section_type` values that reflect municipal report structure:
- `recommendation` — "Staff recommends that Council approve..."
- `background` — project history and context
- `analysis` — detailed assessment
- `financial_impact` — budget implications
- `options` — alternatives considered
- `conclusion` — summary and next steps

#### 4.5c. Extraction Pipeline Changes

The current pipeline has three problems to fix:

**Problem 1: Only the first PDF is processed.** The ingester does `pdf_files[0]` and ignores every other file in the folder.

**Fix**: Process ALL PDFs in the meeting folder. Enumerate every file, classify by document type, and create a `documents` row for each:

```python
def process_meeting_documents(meeting_folder: str, meeting_id: int) -> list[Document]:
    """Extract and store ALL documents in a meeting folder."""
    documents = []

    # Main agenda + minutes (existing logic, enhanced)
    for category in ["Agenda", "Minutes"]:
        category_dir = os.path.join(meeting_folder, category)
        for pdf_path in sorted(glob.glob(os.path.join(category_dir, "*.pdf"))):
            doc = extract_and_store_document(pdf_path, meeting_id, category)
            documents.append(doc)

    # Schedules, attachments, and other documents
    for subdir in sorted(os.listdir(meeting_folder)):
        if subdir in ("Agenda", "Minutes", "Audio"):
            continue
        subdir_path = os.path.join(meeting_folder, subdir)
        if os.path.isdir(subdir_path):
            for pdf_path in sorted(glob.glob(os.path.join(subdir_path, "*.pdf"))):
                doc = extract_and_store_document(pdf_path, meeting_id, classify_document(pdf_path, subdir))
                documents.append(doc)

    return documents
```

**Problem 2: Agenda text is truncated after "ADJOURNMENT".** The ingester strips everything after the last agenda item, removing embedded schedules from combined PDFs.

**Fix**: Remove the truncation. Store the full content. For the AI refiner (which still needs a focused view for summarization), pass only the skeleton — but store the complete document.

**Problem 3: Structure is discarded.** Marker OCR produces structured output but only flat text is kept.

**Fix**: Enhanced `marker_parser.py` produces a structured section tree:

```python
@dataclass
class DocumentSection:
    section_number: str | None      # "5.1"
    heading: str                    # "REPORTS OF COMMITTEES"
    body_markdown: str              # Full markdown content
    section_type: str               # "heading", "motion", "table", etc.
    page_number: int | None
    children: list["DocumentSection"]

def extract_document_structure(pdf_path: str) -> list[DocumentSection]:
    """Parse PDF into hierarchical section tree preserving all content."""
    ...
```

**Section type detection**: Use heuristics + AI to classify sections:
- "MOVED BY ... SECONDED BY ... CARRIED" → `motion`
- "Members Present:" / "Regrets:" → `attendance`
- "The meeting was called to order at..." → `call_to_order`
- Numbered items matching agenda format → `agenda_item`
- Tables (detected by Marker's table extraction) → `table`
- "RECOMMENDATION:" / "That Council approve..." → `recommendation`
- "BACKGROUND" / "PURPOSE" → `background`
- "FINANCIAL IMPLICATIONS" → `financial_impact`

#### 4.5d. Attachment-to-Agenda-Item Linking

Attachments need to be linked to their parent agenda items so users can see "this staff report was discussed under item 5.1." Two linking strategies:

**Strategy 1: CivicWeb folder structure.** When CivicWeb organizes schedules in subfolders, the folder name or position often corresponds to an agenda item. The scraper can preserve this relationship.

**Strategy 2: Cross-reference by title/label.** The main agenda text references schedules: "See Schedule A attached" under item 5.1. Parse these references during ingestion and link the corresponding attachment document to `agenda_item_id`.

**Strategy 3: AI-assisted linking.** Pass the agenda skeleton + list of attachment filenames to Gemini and ask it to match each attachment to its agenda item. Fast and cheap (small prompt, structured output).

In practice, use all three — folder structure as primary signal, text cross-references as secondary, AI as fallback for ambiguous cases.

#### 4.5e. Markdown Fidelity

The `content_markdown` field in `documents` should be high-fidelity markdown that preserves:
- All headers at correct levels (`#`, `##`, `###`)
- Tables in GFM markdown table syntax
- Bold/italic for emphasis as in original
- Horizontal rules between major sections
- Blockquotes for quoted motions
- Page break markers (`<!-- page:3 -->`) to indicate original pagination
- Attendance lists, signatures, and formal language verbatim
- Staff report structure (recommendation boxes, financial tables, option matrices)

**HTML pre-rendering**: Generate `content_html` at ingestion time using a consistent markdown-to-HTML pipeline (e.g., `markdown-it` or `remark`) with a stylesheet that mimics official municipal document formatting. This avoids re-rendering on every page load.

#### 4.5f. Document Viewer Component

New web app component to render full agenda packages faithfully:

```typescript
// app/components/document-viewer.tsx
// Renders content_html with official document styling:
// - Serif font (matching municipal document conventions)
// - Proper margins and spacing
// - Section numbering preserved from source
// - Motion blocks styled distinctively (indented, bordered)
// - Page break indicators
// - Print-friendly layout (@media print)
// - Table of contents generated from section headings
```

**Agenda package view**: Renders the main agenda with inline or linked attachments. Each agenda item shows its schedules:

```
5. REPORTS OF COMMITTEES
   5.1 Rezoning Application - 123 Island Highway
       📎 Schedule A: Staff Report (12 pages)
       📎 Schedule B: Site Plan and Context Map (2 pages)
       📎 Schedule C: Neighbourhood Correspondence (8 pages)
```

Users can expand attachments inline (rendered HTML) or open them in a full-page view. The document viewer supports switching between:
- **Package view** — agenda + all attachments as one continuous document
- **Structured view** — current card-based UI with AI summaries
- **Individual document view** — single attachment in official document styling

#### 4.5g. Linking Document Sections to Existing Data

Each `document_section` can link to the corresponding `agenda_item` via `agenda_item_id`. This creates a bidirectional relationship:
- From the agenda item detail page, link to "View in original document" → scrolls to that section in the document viewer
- From the document viewer, link section numbers to the enriched agenda item pages (with AI summaries, debate, motions, transcript)
- From the agenda item detail page, show all associated attachments with expandable previews

This also enables:
- **Quality audit**: Compare what the AI refiner extracted vs. what the document actually says
- **Better RAG**: The search endpoint can now search across staff reports, not just agenda titles and transcript — answering "what did the engineering report say about the bridge condition?" becomes possible
- **Citation depth**: RAG answers can cite specific pages of specific attachments, not just "discussed at the Jan 15 meeting"

### Layer 5: Web App — Multi-Tenancy

#### 5a. Deployment Model Decision

Two options, not mutually exclusive:

**Option A: Subdomain routing** (recommended for branded deployments)
- `viewroyal.civicai.ca`, `esquimalt.civicai.ca`
- Each subdomain resolves to the same Worker, which reads the subdomain to determine municipality context
- Requires a single Cloudflare Worker with wildcard route `*.civicai.ca/*`

**Option B: Path-based routing** (simpler, single domain)
- `civicai.ca/view-royal/meetings`, `civicai.ca/esquimalt/meetings`
- Municipality slug is a route parameter prefix
- Easier to deploy; one domain, one Worker

Either way, the implementation pattern is the same: a React Router layout route that resolves the municipality from the URL and provides it via context.

#### 5b. Municipality Context Provider

Create a loader that resolves municipality config and provides it to all child routes:

```typescript
// app/routes/municipality-layout.tsx (or root-level loader)
export async function loader({ params, request }) {
    const municipality = await getMunicipality(params.slug);
    return { municipality };
}
```

Components read from this context instead of hardcoding "View Royal":
- Navbar logo text
- Home page hero copy
- Meta tags (title, description, og:*)
- Map center coordinates
- RSS feed URL
- RAG system prompts

#### 5c. RAG System Prompt Parameterization

In `rag.server.ts`, replace hardcoded town references:

```typescript
// Before:
`You are a research agent for the Town of View Royal, British Columbia...`

// After:
`You are a research agent for the ${municipality.name}, ${municipality.province}...`
```

All tool functions (`search_motions`, `search_transcript_segments`, etc.) need a `municipality_id` filter added to their Supabase queries.

#### 5d. Service Layer Scoping

Every service function that queries meetings, matters, people, etc. needs an optional `municipality_id` parameter:

```typescript
export async function getMeetings(client, { municipalityId, ...filters }) {
    let query = client.from("meetings").select("...");
    if (municipalityId) query = query.eq("municipality_id", municipalityId);
    // ...
}
```

#### 5e. Municipality Index Page

Build a top-level landing page that lists all active municipalities. This is the entry point when a user visits the root domain (e.g., `civicai.ca/` or the root subdomain).

**Route**: `app/routes/index.tsx` (or `app/routes/municipalities.tsx` if the root remains a splash page)

**Loader**:
```typescript
export async function loader({ context }) {
    const client = getSupabaseAdminClient();
    const { data: municipalities } = await client
        .from("municipalities")
        .select("slug, name, short_name, classification, province, map_center_lat, map_center_lng, website_url, meta")
        .order("name");
    return { municipalities };
}
```

**UI elements**:
- Card grid or list of municipalities, each showing:
  - Municipality name and classification (e.g., "Town of View Royal")
  - Province
  - A summary stat: meeting count, latest meeting date (from a DB view or a `meta` JSONB field updated periodically by the pipeline)
  - Link to the municipality's home page (`/{slug}/` or subdomain)
- Optional: a map showing all municipalities with clickable markers (reuse the existing map component with multi-point data from `map_center_lat/lng`)
- Search/filter if the list grows beyond a handful of towns

**Service function**: `app/services/municipalities.ts`
```typescript
export async function getAllMunicipalities(client: SupabaseClient) {
    const { data, error } = await client
        .from("municipalities")
        .select("slug, name, short_name, classification, province, map_center_lat, map_center_lng, website_url, meta")
        .order("name");
    if (error) throw error;
    return data;
}

export async function getMunicipality(client: SupabaseClient, slug: string) {
    const { data, error } = await client
        .from("municipalities")
        .select("*")
        .eq("slug", slug)
        .single();
    if (error) throw error;
    return data;
}
```

**Summary stats**: To show "42 meetings indexed" or "Last updated 3 days ago" on each card without N+1 queries, either:
- Add a `stats` field to `municipalities.meta` JSONB, updated by the pipeline after each run
- Or create a database view that joins counts: `CREATE VIEW municipality_stats AS SELECT municipality_id, count(*) as meeting_count, max(date) as latest_meeting FROM meetings GROUP BY municipality_id`

#### 5f. Files Requiring Town-Specific String Changes

22 files in the web app contain hardcoded "View Royal" references. These all need to read from municipality context instead. The full list:
- `app/root.tsx` — meta tags, site name
- `app/components/navbar.tsx` — logo text
- `app/components/matters-map.tsx` — map center coordinates
- `app/routes/home.tsx` — hero text, placeholder
- `app/routes/about.tsx` — about page content
- `app/routes/ask.tsx`, `bylaws.tsx`, `elections.tsx`, `meetings.tsx`, `people.tsx`, `privacy.tsx`, `terms.tsx`, `person-profile.tsx`, `election-detail.tsx`, `bylaw-detail.tsx`, `meeting-detail.tsx`, `matter-detail.tsx` — SEO meta descriptions
- `app/services/rag.server.ts` — system prompts (2 places)
- `app/services/site.ts` — RSS URL, hardcoded `organization_id = 1`
- `app/services/people.ts` — hardcoded `organization_id = 1`
- `app/content/about.md` — about page markdown
- `wrangler.toml` — route pattern

### Layer 6: Public API — Civic Data + AI Research

The current API endpoints (`/api/ask`, `/api/intel/:id`, etc.) are internal to the web app — they use SSE streaming, form actions, and redirects designed for the React frontend. A public API exposes the same data and RAG capabilities to external consumers (journalists, researchers, other civic apps, municipal staff tools) through a documented, stable JSON interface.

#### 6a. API Routes

All public API routes live under `/api/v1/` and return JSON. They run in the same Cloudflare Worker as the web app (no separate deployment).

```
GET  /api/v1/municipalities                         # List all municipalities
GET  /api/v1/municipalities/:slug                    # Single municipality details + stats

GET  /api/v1/:slug/meetings                          # Paginated meeting list
GET  /api/v1/:slug/meetings/:id                      # Single meeting with agenda items
GET  /api/v1/:slug/meetings/:id/transcript           # Transcript segments for a meeting

GET  /api/v1/:slug/matters                           # Paginated matters list
GET  /api/v1/:slug/matters/:id                       # Single matter with related meetings

GET  /api/v1/:slug/people                            # People (council members, staff)
GET  /api/v1/:slug/people/:id                        # Person profile with vote history

GET  /api/v1/:slug/motions                           # Paginated motions with votes
GET  /api/v1/:slug/bylaws                            # Paginated bylaws

POST /api/v1/:slug/search                            # Semantic search across all content types
POST /api/v1/:slug/ask                               # RAG-powered research (non-streaming JSON response)
```

#### 6b. Request/Response Conventions

**Pagination**: Cursor-based using `?cursor=<id>&limit=20` (default 20, max 100). Returned as:
```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "abc123",
    "has_more": true
  }
}
```

**Filtering**: Query parameters for common filters — `?since=2024-01-01`, `?meeting_type=Regular+Council`, `?status=Active`.

**Search endpoint** (`POST /api/v1/:slug/search`):
```json
// Request
{
  "query": "bike lane infrastructure",
  "types": ["motions", "transcript", "matters"],  // optional filter
  "since": "2023-01-01",                          // optional
  "limit": 10
}

// Response
{
  "results": [
    {
      "type": "motion",
      "id": 42,
      "meeting_id": 15,
      "meeting_date": "2024-03-12",
      "title": "Motion to approve bike lane on Island Highway",
      "excerpt": "...relevant snippet...",
      "score": 0.87
    },
    ...
  ]
}
```

**Ask/Research endpoint** (`POST /api/v1/:slug/ask`):
```json
// Request
{
  "question": "What has council said about affordable housing in the last year?",
  "context": "optional previous Q&A for follow-ups"
}

// Response
{
  "answer": "Council has discussed affordable housing in 7 meetings since...",
  "sources": [
    {
      "type": "transcript",
      "id": 234,
      "meeting_id": 15,
      "meeting_date": "2024-06-11",
      "title": "Regular Council - June 11, 2024",
      "speaker_name": "Mayor David Mercer"
    },
    ...
  ],
  "usage": {
    "tools_called": 3,
    "model": "gemini-2.0-flash"
  }
}
```

This is the non-streaming equivalent of the existing `/api/ask` SSE endpoint. It runs the same `runQuestionAgent()` from `rag.server.ts` but collects all events into a single JSON response instead of streaming. Useful for programmatic consumers that don't want to parse SSE.

#### 6c. Authentication + Rate Limiting

**API keys**: Stored in a new `api_keys` table:

```sql
CREATE TABLE api_keys (
    id bigint generated by default as identity primary key,
    key_hash text not null unique,        -- SHA-256 of the key (never store plaintext)
    name text not null,                   -- "Jane's research project"
    contact_email text,
    tier text default 'free',             -- "free", "researcher", "municipal"
    rate_limit_per_minute int default 30,
    rate_limit_per_day int default 1000,
    municipality_ids bigint[],            -- null = all municipalities, or scoped list
    created_at timestamptz default now(),
    last_used_at timestamptz,
    revoked_at timestamptz
);
```

**Request authentication**: `Authorization: Bearer <api_key>` header. The middleware hashes the provided key and looks it up. No auth required for `GET /api/v1/municipalities` (public directory).

**Rate limiting**: Per-key limits using Cloudflare Workers KV or Durable Objects for counter storage. Tiered:
- **Free**: 30 req/min, 1000 req/day, ask endpoint limited to 10 req/day
- **Researcher**: 60 req/min, 5000 req/day, ask endpoint 100 req/day
- **Municipal**: 120 req/min, unlimited data endpoints, ask endpoint 500 req/day

Rate limit headers in every response:
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 27
X-RateLimit-Reset: 1708012800
```

#### 6d. Implementation in the Web App

The API routes coexist with the web app in `apps/web/app/routes/`:

```
app/routes/
    api.v1.municipalities.tsx           # GET list, single
    api.v1.$slug.meetings.tsx           # GET list
    api.v1.$slug.meetings.$id.tsx       # GET single + transcript
    api.v1.$slug.matters.tsx
    api.v1.$slug.people.tsx
    api.v1.$slug.motions.tsx
    api.v1.$slug.bylaws.tsx
    api.v1.$slug.search.tsx             # POST semantic search
    api.v1.$slug.ask.tsx                # POST RAG research
```

A shared middleware function handles API key validation, rate limiting, and municipality resolution for all `api.v1.$slug.*` routes:

```typescript
// app/lib/api-middleware.ts
export async function withApiAuth(request: Request, slug: string) {
    const apiKey = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!apiKey) return json({ error: "API key required" }, { status: 401 });

    const keyRecord = await validateApiKey(apiKey);
    if (!keyRecord) return json({ error: "Invalid API key" }, { status: 401 });
    if (keyRecord.revoked_at) return json({ error: "API key revoked" }, { status: 403 });

    const municipality = await getMunicipality(client, slug);
    if (!municipality) return json({ error: "Municipality not found" }, { status: 404 });

    // Check municipality scope
    if (keyRecord.municipality_ids && !keyRecord.municipality_ids.includes(municipality.id)) {
        return json({ error: "API key not authorized for this municipality" }, { status: 403 });
    }

    const rateLimitResult = await checkRateLimit(keyRecord);
    if (!rateLimitResult.allowed) return json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rateLimitResult) });

    return { keyRecord, municipality, rateLimitHeaders: rateLimitHeaders(rateLimitResult) };
}
```

#### 6e. Documentation

Auto-generate OpenAPI 3.1 spec from the route definitions. Serve interactive docs at `/api/v1/docs` using Scalar or Swagger UI (static HTML page, no build dependency). The spec itself is available at `/api/v1/openapi.json`.

Documentation should include:
- Authentication guide (how to get an API key, where to put it)
- Municipality discovery (start with `/api/v1/municipalities`, pick a slug)
- Pagination patterns
- Search vs Ask (when to use each)
- Rate limits by tier
- Example requests with curl

### Layer 7: Open Civic Data (OCD) API

Expose data in the [Open Civic Data](https://open-civic-data.readthedocs.io/en/latest/index.html) format — a standard schema used across civic tech projects for interoperability. This runs alongside the custom API (Layer 6) and serves the same data in OCD-compliant JSON.

The OCD spec defines six core entity types: **Divisions**, **Jurisdictions**, **Organizations**, **People**, **Events** (meetings), **Bills** (matters/bylaws), and **Votes**. Our data maps naturally to most of these.

#### 7a. OCD Entity Mapping

| OCD Entity | Our Data | Notes |
|------------|----------|-------|
| **Division** | Municipality geographic boundary | `ocd-division/country:ca/province:bc/csd:view-royal` |
| **Jurisdiction** | Municipality as a governing body | `ocd-jurisdiction/.../council` — one per municipality |
| **Organization** | `organizations` table | Council, committees, commissions. Parent org = jurisdiction. |
| **Person** | `people` table | Council members, staff. Linked via memberships to organizations. |
| **Membership** | `memberships` table (or derived from people + organizations) | Role, start/end dates, post (e.g., "Mayor", "Councillor Ward 1") |
| **Event** | `meetings` table | Date, status, location, participants, agenda items, media (video URL) |
| **Event Agenda Item** | `agenda_items` + `document_sections` | Ordered items with descriptions, related entities (bills/people) |
| **Bill** | `matters` table | Bylaws, resolutions, permits — anything with a legislative history |
| **Bill Action** | Motion results + status changes on matters | "First Reading", "Adopted", "Defeated" — derived from motions |
| **Bill Version** | `documents` table (agenda/minutes referencing a matter) | Different versions of text as it moves through readings |
| **Vote** | `motions` + `votes` tables | Motion text, outcome, individual roll call votes |

#### 7b. OCD Identifiers

Every entity gets an [OCD ID](https://open-civic-data.readthedocs.io/en/latest/ocdids.html) — a stable, opaque identifier that doesn't change when data is re-ingested:

```
ocd-division/country:ca/province:bc/csd:view-royal
ocd-jurisdiction/country:ca/province:bc/csd:view-royal/council
ocd-organization/view-royal-council
ocd-person/{uuid}
ocd-event/{uuid}
ocd-bill/{uuid}
ocd-vote/{uuid}
```

Store `ocd_id` as a column on `municipalities`, `organizations`, `people`, `meetings`, `matters`, and `motions`. Generate UUIDs at ingestion time. Add a unique index on `ocd_id` for each table.

```sql
ALTER TABLE municipalities ADD COLUMN ocd_id text unique;
ALTER TABLE organizations ADD COLUMN ocd_id text unique;
ALTER TABLE people ADD COLUMN ocd_id text unique;
ALTER TABLE meetings ADD COLUMN ocd_id text unique;
ALTER TABLE matters ADD COLUMN ocd_id text unique;
ALTER TABLE motions ADD COLUMN ocd_id text unique;
```

#### 7c. OCD API Endpoints

Served under `/api/ocd/` in the same Worker:

```
GET  /api/ocd/jurisdictions                    # List all jurisdictions (municipalities)
GET  /api/ocd/jurisdictions/:ocd_id            # Single jurisdiction

GET  /api/ocd/organizations                    # List organizations (filter by jurisdiction)
GET  /api/ocd/organizations/:ocd_id

GET  /api/ocd/people                           # List people (filter by jurisdiction, org, role)
GET  /api/ocd/people/:ocd_id                   # Person with memberships, contact details

GET  /api/ocd/events                           # List events/meetings (filter by jurisdiction, date range)
GET  /api/ocd/events/:ocd_id                   # Event with agenda, participants, media, documents

GET  /api/ocd/bills                            # List bills/matters (filter by jurisdiction, status, session)
GET  /api/ocd/bills/:ocd_id                    # Bill with actions, versions, sponsors, votes

GET  /api/ocd/votes                            # List votes (filter by jurisdiction, date range, bill)
GET  /api/ocd/votes/:ocd_id                    # Vote with roll call, motion text, outcome
```

**Pagination**: OCD convention uses `?page=1&per_page=20` with `max_page` in response metadata.

**Filtering**: Each endpoint supports query params:
- `jurisdiction`: OCD jurisdiction ID
- `updated_since`: ISO datetime — for incremental sync by consumers
- Entity-specific filters (e.g., `?member_of=ocd-organization/...` for people)

#### 7d. OCD Response Format

Responses follow the OCD JSON format with embedded related objects:

```json
// GET /api/ocd/events/ocd-event/abc123
{
  "id": "ocd-event/abc123",
  "_type": "event",
  "name": "Regular Council Meeting",
  "description": "Regular meeting of the Town of View Royal Council",
  "classification": "council-meeting",
  "start_time": "2024-01-15T19:00:00-08:00",
  "end_time": "2024-01-15T21:30:00-08:00",
  "timezone": "America/Vancouver",
  "status": "passed",
  "location": {
    "name": "View Royal Town Hall - Council Chambers",
    "url": "https://www.viewroyal.ca",
    "coordinates": { "latitude": 48.455, "longitude": -123.44 }
  },
  "participants": [
    {
      "name": "David Mercer",
      "id": "ocd-person/def456",
      "type": "person",
      "note": "chair"
    }
  ],
  "agenda": [
    {
      "description": "Adoption of Minutes",
      "order": "3",
      "subjects": [],
      "related_entities": [
        { "id": "ocd-vote/ghi789", "_type": "vote", "note": "motion to adopt" }
      ],
      "notes": []
    }
  ],
  "media": [
    {
      "name": "Video Recording",
      "type": "recording",
      "links": [
        { "media_type": "text/html", "url": "https://vimeo.com/viewroyal/..." }
      ]
    }
  ],
  "documents": [
    {
      "name": "Agenda",
      "type": "agenda",
      "date": "2024-01-15",
      "links": [
        { "media_type": "application/pdf", "url": "https://viewroyalbc.civicweb.net/..." },
        { "media_type": "text/html", "url": "https://civicai.ca/view-royal/meetings/15/agenda" }
      ]
    }
  ],
  "sources": [
    { "url": "https://viewroyalbc.civicweb.net/...", "note": "CivicWeb source" }
  ],
  "created_at": "2024-01-16T08:00:00Z",
  "updated_at": "2024-02-01T12:00:00Z"
}
```

#### 7e. OCD Serialization Layer

Add a `app/services/ocd-serializers.ts` module that transforms internal DB records into OCD-compliant JSON. This keeps the OCD formatting concerns out of the route handlers and service layer:

```typescript
// app/services/ocd-serializers.ts
export function serializeEventToOCD(meeting, agendaItems, participants, documents): OCDEvent { ... }
export function serializeBillToOCD(matter, actions, sponsors, votes): OCDBill { ... }
export function serializePersonToOCD(person, memberships, contactDetails): OCDPerson { ... }
export function serializeVoteToOCD(motion, rollCall): OCDVote { ... }
export function serializeOrganizationToOCD(org, posts, memberships): OCDOrganization { ... }
```

#### 7f. Auth + Rate Limiting

OCD endpoints use the same API key system as the custom API (Layer 6). The OCD API is read-only — no write operations. Rate limits apply per key, shared across both `/api/v1/` and `/api/ocd/` endpoints.

Optionally support anonymous access for read-only OCD endpoints at a lower rate (5 req/min) to maximize interoperability — civic data should be open.

### Layer 8: Storage Optimization

As municipalities and their full document packages accumulate, database size becomes a cost concern. Supabase Pro includes 8 GB of database storage for $25/month — enough for the structured data, but not if we store rendered HTML and large text blobs for every attachment in every meeting across multiple towns.

#### 8a. Storage Budget Estimate

Back-of-envelope for one municipality (View Royal, ~12 meetings/year, ~5-10 attachments per meeting):

| Content | Per Meeting (naive) | Per Meeting (optimized) | Notes |
|---------|-------------------|----------------------|-------|
| Agenda markdown | ~20 KB | ~20 KB | Kept in Postgres (searchable) |
| Minutes markdown | ~30 KB | ~30 KB | Kept in Postgres (searchable) |
| Attachment markdown (5-10 docs) | ~200 KB | ~200 KB | Kept in Postgres (searchable) |
| Pre-rendered HTML (all docs) | ~500 KB | **→ R2** | Offloaded to Cloudflare R2 |
| Document sections (rows) | ~100 KB | ~100 KB | Structure metadata in Postgres |
| Segment embeddings — `vector(768)` | ~553 KB | **0** | Replaced by discussion-level + key statement embeddings |
| Discussion + key statement embeddings | — | ~27 KB | ~35 embeddings × `halfvec(384)` instead of ~180 × `vector(768)` |
| Transcript segments (text) | ~200 KB | ~100 KB | Consolidated turns, drop duplicate text column |
| Key statements (new) | — | ~15 KB | ~25 rows × text + metadata |
| Transcript raw JSON | — | **→ R2** | Full verbatim transcript offloaded |
| **Total in Postgres** | **~1.6 MB** | **~492 KB** | **~69% reduction** |

For 3 municipalities at ~12 meetings/year: ~18 MB/year (down from ~58 MB). For 50 municipalities: ~295 MB/year. With 5+ years historical backfill: ~1.5 GB — well within Supabase Pro's 8 GB with plenty of headroom for growth.

#### 8b. Tiered Storage Strategy

Use the right storage tier for each content type:

| Content | Storage | Rationale |
|---------|---------|-----------|
| Structured data (meetings, items, motions, people) | **Supabase Postgres** | Needs querying, joins, filtering |
| `content_markdown` on `documents` | **Supabase Postgres** | Needed for full-text search and RAG |
| `body_markdown` on `document_sections` | **Supabase Postgres** | Needed for section-level queries |
| `content_html` on `documents` | **Cloudflare R2** | Read-only rendered output; no need to query |
| `body_html` on `document_sections` | **Cloudflare R2** | Same — render-only |
| Embeddings | **Supabase Postgres as `halfvec(384)` or `halfvec(256)`** | 75-83% smaller than `vector(768)` via Matryoshka + half-precision |
| Full raw transcript JSON | **Cloudflare R2** | Verbatim transcript for video sync; only indexed chunks in Postgres |
| Transcript `text_content` (pre-correction) | **Dropped after correction** | Redundant with `corrected_text_content` |
| Large attachment markdown (>100 KB) | **Cloudflare R2** with stub in Postgres | Keep first 500 chars in Postgres for previews; full content in R2 |

This keeps the database lean (structured data + searchable markdown + embeddings) while offloading the bulky rendered HTML to R2 (zero egress, pennies per GB stored).

#### 8c. Cloudflare R2 for Rendered Content

Store pre-rendered HTML in R2 with a predictable key structure:

```
documents/{municipality_slug}/{meeting_id}/{document_id}.html
documents/{municipality_slug}/{meeting_id}/{document_id}/sections/{section_id}.html
```

The document viewer component fetches HTML directly from R2 (via a public bucket or Worker binding) instead of from Postgres. The `documents` table stores an `r2_html_key` reference instead of the full `content_html`:

```sql
-- Replace content_html text with R2 reference
ALTER TABLE documents ADD COLUMN r2_html_key text;  -- "documents/view-royal/42/1.html"
ALTER TABLE documents DROP COLUMN content_html;

ALTER TABLE document_sections ADD COLUMN r2_html_key text;
ALTER TABLE document_sections DROP COLUMN body_html;
```

**Pipeline change**: After generating HTML at ingestion time, upload to R2 via the S3-compatible API, then store the key in Postgres.

**Web app change**: The document viewer fetches from R2:

```typescript
// In loader:
const htmlUrl = `${R2_PUBLIC_URL}/${document.r2_html_key}`;
// Or via Worker binding:
const html = await env.R2_BUCKET.get(document.r2_html_key);
```

#### 8d. Cloudflare KV for Frequently Accessed Content

Cache hot data in Workers KV for sub-millisecond reads at the edge:

- **Municipality configs** — small, read constantly, rarely updated. Perfect for KV.
- **Meeting summaries** — the 50 most recent meetings per municipality. Populate from Supabase, cache in KV with TTL.
- **Document table of contents** — small JSON structure built from `document_sections` headings. Cache per document.

This reduces Supabase query volume (and egress) for the most common page loads.

#### 8e. Embedding Compression — `halfvec` + Reduced Dimensions

Embeddings are the single largest per-row storage cost. Currently: `vector(768)` = 768 × 4 bytes = **3,072 bytes per embedding**. With HNSW indexes, the index itself doubles this. Across 7 tables (transcript_segments, agenda_items, motions, matters, meetings, bylaws, bylaw_chunks + the new documents table), this adds up fast.

**Strategy: Use `halfvec` (16-bit floats) at reduced dimensions via Matryoshka truncation.**

Both embedding models in use — OpenAI `text-embedding-3-small` and `nomic-embed-text-v1.5` — support [Matryoshka Representation Learning](https://www.nomic.ai/blog/posts/nomic-embed-matryoshka), which means embeddings can be truncated to smaller dimensions (256, 384, 512) with minimal recall loss. Combined with pgvector's `halfvec` type (16-bit instead of 32-bit floats), the savings are dramatic:

| Configuration | Bytes per embedding | vs. current | Notes |
|--------------|-------------------|-------------|-------|
| `vector(768)` (current) | 3,072 | baseline | 32-bit floats, full dimension |
| `halfvec(768)` | 1,536 | **-50%** | 16-bit floats, same dimension |
| `vector(256)` | 1,024 | **-67%** | 32-bit floats, Matryoshka truncated |
| `halfvec(256)` | 512 | **-83%** | 16-bit floats + Matryoshka |
| `halfvec(384)` | 768 | **-75%** | Good balance of recall + savings |

**Recommended: `halfvec(384)`** for most tables. This gives 75% storage reduction with negligible recall loss according to Matryoshka benchmarks. For transcript segments (highest volume, lower precision tolerance), `halfvec(256)` saves 83%.

**Migration path:**

```sql
-- 1. Add new halfvec column
ALTER TABLE transcript_segments ADD COLUMN embedding_hv halfvec(384);

-- 2. Pipeline generates new embeddings at reduced dimension
--    OpenAI: dimensions=384 parameter
--    Nomic: truncate_dim=384 + re-normalize

-- 3. Backfill existing embeddings (truncate + cast)
UPDATE transcript_segments
SET embedding_hv = (embedding::real[])[1:384]::halfvec(384)
WHERE embedding IS NOT NULL;

-- 4. Rebuild HNSW index on new column
CREATE INDEX idx_ts_embedding_hv ON transcript_segments
    USING hnsw (embedding_hv halfvec_cosine_ops);

-- 5. Drop old column and index
DROP INDEX idx_transcript_segments_embedding;
ALTER TABLE transcript_segments DROP COLUMN embedding;
ALTER TABLE transcript_segments RENAME COLUMN embedding_hv TO embedding;
```

**Index optimization**: Use `halfvec_cosine_ops` for HNSW indexes. These build faster and use less memory than full-precision indexes.

**Selective embedding**: Not every table needs embeddings. Consider:
- **Always embed**: transcript_segments, motions, agenda_items, documents (needed for RAG)
- **Embed at lower dimension**: matters, bylaws (searched less frequently)
- **Drop embedding**: meetings (the meeting-level embedding is rarely useful — people search by item/topic, not by meeting summary)

#### 8f. Rethinking Transcript Embeddings — Agenda-Item-Level Search

The current approach embeds every transcript segment longer than 10 words. This is fundamentally wasteful: a 2-hour meeting produces ~200 segments, each getting its own 3 KB embedding (~600 KB of vectors), when most segments are fragments of the same discussion. A user searching for "what did council say about the bike lane" doesn't need to match against 15 individual utterances from that discussion — they need to find the agenda item where it was discussed, then see the relevant quotes.

**The better approach: embed at the agenda-item discussion level, not per-segment.**

##### Primary strategy: Discussion-level embeddings

For each agenda item, concatenate all transcript segments that fall within its discussion timeframe into a single text block. Embed that block once. This captures the full semantic context of the discussion in one vector instead of scattering it across dozens of fragment embeddings.

```python
def build_discussion_embeddings(meeting_id: int):
    """Create one embedding per agenda item's discussion, not per segment."""
    agenda_items = get_agenda_items(meeting_id)
    segments = get_transcript_segments(meeting_id)

    for item in agenda_items:
        # Get all segments that fall within this item's discussion window
        item_segments = [
            s for s in segments
            if s["start_time"] >= item["discussion_start"]
            and s["start_time"] < item["discussion_end"]
        ]
        if not item_segments:
            continue

        # Build a single discussion text block
        discussion_text = "\n".join(
            f"{s['speaker_name']}: {s['corrected_text_content']}"
            for s in item_segments
        )

        # One embedding for the entire discussion
        embedding = generate_embedding(discussion_text[:8000])  # Truncate to model limit
        update_agenda_item_discussion_embedding(item["id"], embedding)
```

This reduces transcript-related embeddings from ~200 per meeting to ~10-15 (one per agenda item with discussion). The `agenda_items` table already exists and already has an `embedding` column — this changes what gets embedded from just the item title/summary to the full discussion text.

##### Secondary strategy: Key statement extraction

During AI refinement, extract substantive statements — proposals, objections, claims, commitments, questions — as standalone searchable units. These are the things people actually search for:

- "I believe we should delay the rezoning until traffic studies are complete" — *substantive claim*
- "Staff recommends approval subject to the conditions in Schedule A" — *recommendation*
- "This will cost approximately $2.3 million over three years" — *financial claim*
- "The residents on Helmcken Road have expressed strong opposition" — *public input summary*

Store these in a new `key_statements` table:

```sql
CREATE TABLE key_statements (
    id bigint generated by default as identity primary key,
    meeting_id bigint REFERENCES meetings(id) ON DELETE CASCADE not null,
    agenda_item_id bigint REFERENCES agenda_items(id) ON DELETE SET NULL,
    municipality_id bigint REFERENCES municipalities(id) not null,

    speaker_name text,                           -- Who said it
    statement_text text not null,                -- The extracted statement
    statement_type text,                         -- "proposal", "objection", "claim", "commitment",
                                                 -- "recommendation", "question", "financial", "public_input"
    source_segment_ids bigint[],                 -- Which transcript segments this was extracted from
    start_time float,                            -- Timestamp in video for citation

    embedding halfvec(384),                      -- For semantic search
    created_at timestamptz default now()
);

CREATE INDEX idx_key_statements_meeting ON key_statements(meeting_id);
CREATE INDEX idx_key_statements_agenda_item ON key_statements(agenda_item_id);
CREATE INDEX idx_key_statements_embedding ON key_statements
    USING hnsw (embedding halfvec_cosine_ops);
```

This gives ~20-30 high-quality, information-dense embeddings per meeting that capture exactly what users search for. The AI refiner already reads the transcript — extracting key statements is a small addition to the prompt.

##### What happens to individual transcript segments?

**No embeddings on `transcript_segments` at all.** Segments remain in Postgres for:
- Video sync (the meeting detail page plays video with synced transcript)
- Citation display (RAG finds an agenda item or key statement, then fetches the underlying segments for verbatim quotes)
- Timeline navigation (jump to a point in the meeting)

But they don't need their own embeddings. The retrieval path becomes:

```
User query → embed query → search agenda_item discussion embeddings + key_statement embeddings
  → find relevant agenda item(s)
  → fetch transcript_segments WHERE agenda_item_id = X (or by timestamp range)
  → return segments as citations with video timestamps
```

This is strictly better for RAG: instead of matching against a fragment like "I think we should probably look at that more carefully" (meaningless without context), the search matches against the full discussion about the bike lane proposal, which contains all the relevant vocabulary and context.

##### Consolidation of transcript segments (still valuable)

Even without embeddings, reducing the number of segment rows saves storage. Merge consecutive same-speaker segments:

```python
def consolidate_segments(segments: list[dict]) -> list[dict]:
    """Merge consecutive same-speaker segments into turns."""
    consolidated = []
    current = None
    for seg in segments:
        if current and seg["speaker"] == current["speaker"] and seg["start_time"] - current["end_time"] < 3.0:
            current["end_time"] = seg["end_time"]
            current["text"] += " " + seg["text"]
        else:
            if current:
                consolidated.append(current)
            current = dict(seg)
    if current:
        consolidated.append(current)
    return consolidated
```

This reduces segment count by 30-50% (200 → 100-130 rows), which matters for storage even without embeddings.

##### Drop redundant text column

Both `text_content` and `corrected_text_content` store nearly identical text. After AI correction runs, keep only `corrected_text_content` (rename to `text_content`). Store the raw version in R2 with the full transcript JSON if needed for debugging.

##### Store raw transcript in R2

The full verbatim transcript (every utterance with timestamps, pre-consolidation) goes to R2 as a JSON file. Postgres stores only the consolidated, corrected segments for display and citation. The meeting detail page fetches from R2 for the video sync UI if the full granularity is needed.

##### Linking segments to agenda items

This strategy depends on knowing which transcript segments belong to which agenda item. Two approaches:

1. **Timestamp-based**: The AI refiner already identifies discussion start/end times for each agenda item. Use these time windows to assign segments.
2. **AI-assigned during refinement**: When the AI processes the transcript, it can tag each segment or group of segments with the agenda item being discussed. This handles cases where discussion jumps between items.

Add `agenda_item_id` to `transcript_segments` if not already present (or use a join table for segments that span multiple items).

##### Combined impact estimate for a typical 2-hour meeting:

| Metric | Current approach | New approach | Savings |
|--------|-----------------|-------------|---------|
| Transcript segment rows | ~200 | ~120 (consolidated) | -40% rows |
| Segment embeddings | ~180 (>10 words) | **0** | -100% |
| Agenda item discussion embeddings | ~10 (title only) | ~10 (full discussion text) | same count, better quality |
| Key statement embeddings | 0 | ~25 | +25 new, high-value |
| **Total transcript-related embeddings** | **~180** | **~35** | **-80%** |
| Bytes per embedding (with halfvec(384)) | 3,072 (vector(768)) | 768 (halfvec(384)) | -75% per vector |
| **Total embedding storage per meeting** | **~553 KB** | **~27 KB** | **-95%** |
| Text columns on segments | 2 (text + corrected) | 1 | -50% text storage |
| **Total transcript storage per meeting** | **~1 MB** | **~100 KB** | **~90%** |

##### RAG search quality comparison

| Scenario | Current (per-segment) | New (discussion + key statements) |
|----------|----------------------|----------------------------------|
| "What did council say about bike lanes?" | Matches 3-4 scattered fragments, some out of context | Matches the full bike lane discussion item + specific statements |
| "Who opposed the rezoning?" | Might match "I don't think we should" (no context) | Matches key statement: "Cllr. Smith objected to the rezoning citing traffic concerns" |
| "What's the budget for the park upgrade?" | Matches "2.3 million" fragment | Matches key statement with full financial context |
| "Show me discussions about housing" | Many low-relevance matches across meetings | Focused matches on agenda items where housing was the topic |

The new approach produces fewer but much higher-quality search results, with less storage and better citation context.

##### Quote retrieval without segment embeddings

A natural concern: if transcript segments don't have embeddings, how do you find specific quotes? For example, a user asking "find where someone said the bridge is structurally unsound."

The answer is that **segment-level embeddings are actually bad at finding specific quotes**. A short fragment like "I believe the bridge may be structurally unsound and we need an assessment" contains too little context for an embedding model to understand what it's about — the vector ends up generic and low-signal. Semantic search on short text works poorly.

**Two better approaches for quote finding:**

**1. Full-text search (tsvector) on transcript segments.** For finding specific words or phrases someone said, PostgreSQL full-text search is more reliable than vector similarity. It's also much cheaper — a `tsvector` index is tiny compared to HNSW. Add a GIN index during the consolidation migration:

```sql
ALTER TABLE transcript_segments ADD COLUMN text_search tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(corrected_text_content, ''))) STORED;

CREATE INDEX idx_ts_text_search ON transcript_segments USING GIN (text_search);
```

This enables fast keyword search: `SELECT * FROM transcript_segments WHERE text_search @@ plainto_tsquery('bridge structurally unsound')`. Combined with `ts_rank` for relevance scoring and `ts_headline` for excerpt highlighting, this handles the "find the exact quote" use case better than embeddings ever could.

**2. Two-phase retrieval for RAG.** When the RAG agent needs quotes to support an answer:

```
Phase 1 (semantic): Search discussion embeddings + key statements
  → "The bridge condition was discussed at the Nov 12, 2024 meeting, item 7.2"

Phase 2 (targeted): Fetch transcript segments WHERE agenda_item_id = 7.2
  → Full transcript for that discussion, with speaker names and timestamps
  → RAG agent selects the most relevant quotes from this focused set
```

The RAG agent already has tool-calling capability — it can first find the relevant topic, then fetch the specific segments. This two-phase approach actually produces better quotes because the agent has full discussion context when selecting what to cite, rather than getting isolated fragments from vector search.

**3. Key statements are the pre-extracted quotes.** The `key_statements` table stores the most notable and quotable things said at each meeting, already extracted and attributed. For many "find the quote where..." queries, the key statement is exactly what the user wants — and it has its own embedding for semantic search.

**Combined quote retrieval strategy:**

| Query type | Method | Storage cost |
|-----------|--------|-------------|
| "Find where someone said X" (specific words) | Full-text search on `transcript_segments` | GIN index: ~5 KB/meeting |
| "What did Cllr. Smith say about housing?" | Key statement semantic search | Already in `key_statements` embeddings |
| "Show me the debate about the rezoning" | Discussion embedding → fetch segments | Already in agenda item embeddings |
| RAG citation (supporting quotes for an answer) | Two-phase: topic search → segment fetch | No additional cost |

This is strictly better than embedding every segment: better quote quality, better search relevance, and ~95% less embedding storage.

#### 8g. PostgreSQL-Level Optimizations

Additional Postgres optimizations:

- **TOAST compression**: Automatic for `text` values >2 KB — already happening for markdown columns. No action needed, but be aware that TOAST adds read overhead.
- **Partial HNSW indexes**: Only index rows that need semantic search (see transcript partial index above). This reduces index size and build time significantly.
- **Materialized views for stats**: Instead of computing meeting counts and latest dates on every page load, use materialized views refreshed by the pipeline after each run:
  ```sql
  CREATE MATERIALIZED VIEW municipality_stats AS
  SELECT municipality_id, count(*) as meeting_count, max(meeting_date) as latest_meeting
  FROM meetings GROUP BY municipality_id;
  ```
- **Embedding archival for old content**: Embeddings for meetings older than 3+ years are rarely searched. Drop them and regenerate on-demand if a search touches old data. This recovers significant space while keeping the structured data intact for browsing.
- **Vacuuming**: After large backfill operations, run `VACUUM FULL` to reclaim dead tuple space.

#### 8f. Supabase Storage for Original PDF Access

While we don't store PDF blobs in the database, the `source_url` column points to the original CivicWeb/Legistar URL — which may go offline. For long-term preservation:

- Upload original PDFs to a **Supabase Storage bucket** (`documents` bucket) during ingestion
- This is the only case where the PDF binary is stored — purely for archival access
- Supabase Storage is S3-compatible and charged separately from database size (100 GB included on Pro)
- The `documents` table gets a `storage_path` column pointing to the bucket object
- The web app can serve a "Download original PDF" link via signed URL (already proven with the bylaws download route)

This keeps the PDFs accessible even if the source municipality changes their CMS.

## Implementation Sequence

### Phase 0: Python Monorepo Reorganization
1. Audit `src/pipeline/` for dead code — delete `batch.py`, `batch_embeddings.py`, `diarizer.py`, `embeddings.py`, `ingest.py` if confirmed unused
2. Move `check_occurred_meetings.py` from `maintenance/audit/` into the pipeline package (it's a runtime dependency, not a maintenance script)
3. Move entire Python codebase from `src/` + `main.py` + `pyproject.toml` + `tests/` into `apps/pipeline/`
4. Establish proper Python package: add `__init__.py` files, rename `src/` → `pipeline/`
5. Rewrite all imports (`from src.core` → `from pipeline`, `from src.pipeline` → `from pipeline`)
6. Create stub `scrapers/`, `video/`, `ingestion/` directories with `__init__.py` (empty implementations — just the structure for Phase 2)
7. Move one-off scripts to `apps/pipeline/scripts/`
8. Verify `uv run pytest` passes from `apps/pipeline/`
9. Update CLAUDE.md command reference

### Phase 1: Database + Storage Foundation
1. Create `municipalities` table
2. Add `municipality_id` FK to `organizations`, `meetings`, `matters`, `elections`, `bylaws`
3. Insert View Royal as the first municipality record
4. Backfill all existing data with `municipality_id = 1`
5. Update unique constraints to be municipality-scoped
6. Add compound indexes for `(municipality_id, ...)` queries
7. Add `ocd_id` columns to `municipalities`, `organizations`, `people`, `meetings`, `matters`, `motions`
8. Create `documents` and `document_sections` tables (with `r2_html_key` instead of `content_html`)
9. Create `key_statements` table for extracted quotable statements
10. Add `tsvector` generated column + GIN index on `transcript_segments` for full-text quote search
11. Create Cloudflare R2 bucket for rendered HTML and bind to Worker in `wrangler.toml`
12. Create Supabase Storage bucket for PDF archival
13. Set up Cloudflare KV namespace for cached municipality configs and hot content

### Phase 2: Scraper Abstraction
1. Create `BaseScraper` interface and `ScrapedMeeting` dataclass in `pipeline/scrapers/base.py`
2. Refactor existing CivicWeb code (merge `civicweb.py` client + `scraper.py`) into `pipeline/scrapers/civicweb.py` extending `BaseScraper`
3. Implement `LegistarScraper` in `pipeline/scrapers/legistar.py` using the Legistar Web API
4. Implement `StaticHtmlScraper` in `pipeline/scrapers/static_html.py` for RDOS-style sites
5. Build scraper registry with factory function in `pipeline/scrapers/__init__.py`
6. Parameterize archive paths per municipality in `pipeline/paths.py`

### Phase 3: Pipeline Refactoring
1. Abstract video sources into `pipeline/video/` (Vimeo, YouTube, inline)
2. Refactor `Archiver` to accept municipality config instead of hard-instantiating CivicWeb + Vimeo
3. Add `--municipality` CLI parameter to `main.py`
4. Pass `municipality_id` through ingester
5. Move canonical names to per-municipality config (database or YAML)
6. Add Legistar structured-data fast path in ingester

### Phase 3b: Structured Document Ingestion
1. Fix ingester to process ALL PDFs in meeting folders (not just the first one)
2. Remove the post-"ADJOURNMENT" truncation hack — store full document content
3. Add document type classifier (agenda, minutes, staff_report, schedule, correspondence, map, etc.)
4. Enhance `marker_parser.py` to produce a hierarchical `DocumentSection` tree (not just flat text)
5. Add section type classification (motion, attendance, recommendation, background, financial_impact, etc.)
6. Store full document markdown + section tree into `documents` and `document_sections` tables
7. Link attachments to parent documents via `parent_document_id` and to agenda items via `agenda_item_id`
8. Implement attachment-to-item linking (folder structure → text cross-references → AI fallback)
9. Generate pre-rendered HTML at ingestion time → upload to Cloudflare R2 (not stored in Postgres)
10. Upload original PDFs to Supabase Storage bucket for archival access
11. Add embeddings for document content (enables RAG search across staff reports, not just transcripts)
12. Generate OCD IDs for all entities during ingestion
13. Backfill: re-ingest ALL existing View Royal PDFs (including previously-ignored attachments) to populate `documents` and `document_sections`

### Phase 3c: Embedding Strategy Migration
1. Add key statement extraction to the AI refiner prompt — extract substantive claims, proposals, objections, recommendations, financial claims, and public input summaries during meeting refinement
2. Store extracted key statements in `key_statements` table with speaker attribution, statement type, and source segment IDs
3. Switch agenda item embeddings from title-only to full discussion text — concatenate all transcript segments within each item's discussion window
4. Generate `halfvec(384)` embeddings on `key_statements` and agenda item discussion text using Matryoshka-truncated dimensions
5. Migrate all existing embedding columns from `vector(768)` to `halfvec(384)` (backfill via truncation + cast)
6. Drop embedding column from `transcript_segments` — replace with `tsvector` full-text search index
7. Consolidate transcript segments (merge same-speaker consecutive turns)
8. Drop redundant `text_content` column (keep `corrected_text_content` only)
9. Upload raw transcripts to R2, update meeting detail page to fetch from R2 for video sync
10. Update RAG tools to use new two-phase retrieval: semantic search on discussion/key statement embeddings → fetch segments by agenda_item_id for citations
11. Backfill: re-process existing View Royal meetings to extract key statements and generate discussion-level embeddings
12. Verify RAG quality with before/after test queries

### Phase 4: Web App Multi-Tenancy
1. Add `municipalities` service layer (`getAllMunicipalities`, `getMunicipality`)
2. Build municipality index page — card grid listing all active towns with summary stats
3. Add municipality context layout loader and provider
4. Replace all hardcoded "View Royal" strings with context reads
5. Scope all service queries by `municipality_id`
6. Parameterize RAG system prompts
7. Update routing for subdomain or path-based access
8. Update `wrangler.toml` for new domain/route patterns

### Phase 4b: Document Viewer
1. Build document viewer component with official-document styling (serif fonts, proper margins, print-friendly)
2. Add document view routes: `/:slug/meetings/:id/agenda`, `/:slug/meetings/:id/minutes`, `/:slug/meetings/:id/documents/:docId`
3. Build agenda package view — main agenda with inline/linked schedules per agenda item
4. Generate table of contents from `document_sections` headings
5. Add bidirectional links between document sections and enriched agenda item pages
6. Show attachment list on agenda item detail pages with expandable previews
7. Add "View in original document" link from agenda item detail pages

### Phase 5: Public API
1. Create `api_keys` table and key validation utility
2. Build API middleware (auth, rate limiting, municipality resolution, error formatting)
3. Implement data endpoints: meetings, matters, people, motions, bylaws (thin wrappers over existing service layer with pagination)
4. Implement `POST /api/v1/:slug/search` — semantic search across content types
5. Implement `POST /api/v1/:slug/ask` — non-streaming RAG research endpoint (reuses `runQuestionAgent`, collects into JSON)
6. Add document endpoints: `GET /api/v1/:slug/meetings/:id/documents` — full structured content
7. Add rate limiting with Cloudflare Workers KV (per-key counters, tiered limits)
8. Generate OpenAPI spec and serve interactive docs at `/api/v1/docs`
9. Build a simple API key request/management page (or start with manual issuance)

### Phase 5b: Open Civic Data API
1. Build OCD serialization layer (`ocd-serializers.ts`) — transforms internal records to OCD JSON
2. Implement OCD endpoints: `/api/ocd/jurisdictions`, `organizations`, `people`, `events`, `bills`, `votes`
3. Add OCD pagination, filtering (`updated_since`, jurisdiction scoping)
4. Support anonymous read access at lower rate limit for open-data interoperability
5. Validate output against OCD spec (automated tests with sample data)
6. Publish OCD endpoint documentation alongside the custom API docs

### Phase 6: Second Town Onboarding
1. Configure Esquimalt municipality in database with OCD IDs
2. Run Legistar scraper to populate data (structured ingestion path — documents populated from API data)
3. Verify web app renders Esquimalt data correctly, including document viewer
4. Verify OCD API returns correct Esquimalt data
5. Configure RDOS municipality
6. Run static HTML scraper for RDOS
7. End-to-end validation across all three municipalities, both custom and OCD APIs

## Key Design Decisions

### Why `municipality_id` on tables instead of separate databases?
- Single Supabase instance is simpler to manage and cheaper
- Cross-municipality queries become possible (compare councils, shared matters)
- Shared `people` table handles people who serve on multiple bodies
- RLS policies can scope access per municipality if needed later

### Why JSONB for `source_config`?
- Each source type has different configuration needs (CivicWeb needs `base_url`, Legistar needs `client_id` + `timezone`, custom needs `scraper_class` + selectors)
- JSONB avoids a wide table with mostly-null columns
- New source types can be added without schema migrations

### Why keep PDF-based and structured ingestion paths?
- CivicWeb and custom sites only have PDFs — AI refinement is essential
- Legistar provides structured data — AI refinement would be wasteful
- Keeping both paths lets each source type play to its strengths
- The `ScrapedMeeting` dataclass can carry an optional `structured_data` field for pre-parsed sources

### Why colocate the public API in the web app Worker?
- The API routes use the same Supabase client, service layer, and RAG engine — no code duplication
- A single Cloudflare Worker deployment is simpler to operate than two
- Cloudflare Workers handle routing efficiently — `/api/v1/*` paths add negligible overhead to non-API requests
- If the API needs independent scaling later (heavy usage, different caching), it can be split into its own Worker by extracting the route files — the shared service layer makes this straightforward
- The alternative (separate `apps/api/` Worker) would require duplicating or publishing the service layer as a shared package, which adds complexity before there's a scaling reason

### Why store structured content instead of PDF blobs?
- PDF blobs are opaque — they can't be searched, linked, or rendered in the web app without a PDF viewer
- Storing structured markdown + sections means the content is queryable, indexable, and renderable as HTML
- The document viewer can apply consistent styling across all municipalities regardless of source PDF formatting
- Sections link bidirectionally to agenda items, enabling "view in original document" navigation
- Far smaller storage footprint — markdown text vs. multi-MB PDFs
- Original PDFs preserved in Supabase Storage bucket (cheap, S3-compatible) for archival access and "Download original" links

### Why split storage across Postgres, R2, KV, and Supabase Storage?
- **Postgres (Supabase)**: Structured data, searchable text, embeddings — everything that needs queries, joins, and vector search. This is the expensive tier ($25/mo Pro includes 8 GB).
- **R2 (Cloudflare)**: Pre-rendered HTML for the document viewer. Read-only, no queries needed, zero egress fees, ~$0.015/GB/month stored. Keeps the biggest content out of Postgres.
- **KV (Cloudflare)**: Hot cache for municipality configs, meeting summaries, document TOCs. Sub-millisecond reads at the edge, reduces Supabase query volume.
- **Supabase Storage**: Original PDF archival. 100 GB included on Pro plan. Served via signed URLs for "Download original" links.
- Each tier plays to its strengths. The pipeline writes to all four; the web app reads from the right one per use case.
- If we stored everything in Postgres, we'd hit the 8 GB ceiling at ~30 municipalities with full historical backfill. The tiered approach supports 100+ municipalities within the Pro plan budget.

### Why implement OCD alongside a custom API?
- The custom API (Layer 6) is optimized for our specific data model — includes RAG search, semantic search, document content, and features not covered by OCD
- OCD provides interoperability — civic tech tools, open data portals, and researchers can consume our data using a format they already understand
- OCD is a read-only projection of existing data (serialization layer only) — it doesn't require changing the internal data model
- Supporting both costs relatively little: the OCD serializers are thin transformations, and the routes reuse the same service layer

### What about the `meeting_type` enum?
- The current enum (`Regular Council`, `Special Council`, etc.) is View Royal-specific
- RDOS uses "Board" meetings, not "Council"
- Esquimalt may have different committee names
- **Recommendation**: Convert from enum to text column, or expand the enum to cover common BC municipal meeting types. Use a validation list per municipality rather than a database-level constraint.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Legistar API may require tokens for some clients | Check `esquimalt.ca` specifically; fall back to InSite HTML scraping if needed |
| Custom HTML scrapers are brittle to site redesigns | Use config-driven selectors; add monitoring/alerting for scrape failures |
| AI refinement prompts tuned for View Royal may produce poor results for other towns | Make prompts municipality-aware; include town-specific context (committee names, known members) |
| Migration of existing data could break the running View Royal instance | Use additive-only migrations (nullable columns first, backfill, then constrain) |
| Performance of unscoped queries after adding municipality dimension | Add compound indexes; ensure all hot queries include `municipality_id` filter |
| PDF structure extraction varies wildly across municipalities | Use Marker OCR for consistent extraction; add `extraction_quality` score and `extraction_warnings`; manual QA for first batch per municipality |
| Document sections don't cleanly map to agenda items for all document types | Allow `agenda_item_id` to be null; build a matching heuristic based on section numbers + titles; flag unmatched sections for manual review |
| OCD spec is loosely maintained (last major refactor 2014) | Implement the core entities faithfully; don't over-invest in edge cases; treat OCD as a best-effort interop layer |
| Public API abuse — RAG endpoint is expensive (Gemini calls per request) | Tier the ask endpoint aggressively (10/day free); require API keys; monitor usage; consider caching common questions |
| API versioning — breaking changes after consumers depend on v1 | Commit to v1 stability; use additive changes only; version bump (v2) for breaking changes |
