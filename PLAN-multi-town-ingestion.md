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

### Layer 9: AI Search & RAG Enhancements

The current RAG system works but has fundamental limitations: each tool embeds the query independently (generating the same embedding 3-4 times per question), results are truncated to fit the context window, the orchestrator model is a single Gemini Flash call per step with no self-correction, and search quality degrades significantly for complex multi-topic or temporal questions. This layer addresses these by improving every stage of the RAG pipeline: query understanding, retrieval, context assembly, and answer synthesis.

#### 9a. Current State Assessment

**What works well:**
- The two-phase architecture (orchestrator gathers evidence → synthesizer writes answer) is sound
- Tool selection guidance in the system prompt produces good tool choices ~80% of the time
- Citation numbering system ensures valid references
- Streaming SSE gives good perceived latency

**What doesn't work well:**
- **Redundant embedding generation**: Each search tool independently calls `generateQueryEmbedding(query)`. A question that triggers `search_motions`, `search_transcript_segments`, and `search_matters` generates the same embedding 3 times — 3 API round-trips to OpenAI
- **No query rewriting**: The orchestrator passes the user's raw query to search tools verbatim. "What has council done about the bike lanes on Island Highway?" becomes a vector search for that entire sentence — when "Island Highway bike lane" would match much better
- **Truncation destroys context**: `truncateForContext()` caps results at 15 items and 2000 chars. For a question spanning multiple meetings, the orchestrator sees only a fraction of relevant evidence, then decides to stop — believing it has enough when it doesn't
- **No hybrid search**: Vector search alone misses exact matches. A user asking "bylaw 1045" gets semantic neighbors of the concept "bylaw 1045" instead of the exact bylaw. The `search_agenda_items` tool uses keyword-only (`ilike`), which is the opposite problem — no semantic understanding at all
- **No reranking**: Vector similarity scores from HNSW are approximate — the top-25 by cosine distance are not necessarily the top-25 by relevance to the question. A cross-encoder reranker (or LLM-as-judge) would significantly improve precision
- **Single-shot orchestration**: The orchestrator gets one chance per step. If it picks the wrong tool or bad search terms, it sees poor results and often gives up rather than trying a different approach
- **No document search**: With the `documents` and `document_sections` tables coming (Layer 4.5), the RAG system needs tools to search across staff reports, financial statements, engineering assessments, and other attachment content — the substance behind what council debates
- **No cross-municipality search**: As multi-town support comes online, users will want comparative queries ("How does View Royal's approach to short-term rentals compare to Esquimalt's?")
- **Synthesis context is thin**: The synthesizer receives only `[N] (type, date, speaker) 120-char title` per source — it never sees the actual evidence text. It's synthesizing from summaries of summaries. The orchestrator's `history` contains the evidence, but it's not passed to the synthesizer
- **No conversation memory**: The `context` parameter is a raw string of the previous question. Follow-up questions lose the evidence gathered in the previous turn
- **`search_agenda_items` uses `ilike` injection-vulnerable patterns**: The query is interpolated directly into a PostgREST filter string (`ilike.%${query}%`) without sanitization

#### 9b. Query Understanding & Rewriting

Add a lightweight query analysis step before the orchestrator loop. This runs once per question and produces structured metadata that all subsequent tool calls can use.

```typescript
interface QueryAnalysis {
  original_query: string;
  intent: "factual" | "person" | "comparative" | "temporal" | "exploratory";
  entities: {
    people: string[];         // ["Councillor Lemon", "Mayor Mercer"]
    topics: string[];         // ["bike lane", "Island Highway"]
    places: string[];         // ["Island Highway", "Helmcken Road"]
    dates: string[];          // ["2024", "last year", "January"]
    bylaws: string[];         // ["Bylaw 1045"]
    organizations: string[];  // ["Committee of the Whole"]
  };
  rewritten_queries: {
    semantic: string;         // Optimized for vector search: "Island Highway bike lane infrastructure"
    keyword: string;          // Optimized for text search: "bike lane" OR "cycling infrastructure"
    expanded: string[];       // Synonyms/related terms: ["cycling", "active transportation", "bike path"]
  };
  temporal: {
    has_temporal_intent: boolean;
    resolved_after_date: string | null;  // "2024-01-01" (resolved from "last year")
    resolved_before_date: string | null;
  } | null;
  municipality_scope: string | null;      // null = current context, "all" = cross-municipality
}
```

**Implementation**: A single Gemini Flash call with structured output (JSON schema enforcement). The prompt includes the current date, the municipality name, and known entity types. Cost: ~0.5¢ per question, <200ms latency.

This replaces `get_current_date` as a tool (temporal resolution happens upfront), eliminates the need for the orchestrator to craft search queries on its own, and enables hybrid search by providing both semantic and keyword query forms.

**Query expansion examples:**

| User query | Semantic rewrite | Keyword rewrite | Expanded terms |
|-----------|-----------------|----------------|----------------|
| "What has council done about the bike lanes on Island Highway?" | "Island Highway bike lane infrastructure" | "bike lane" OR "Island Highway" | ["cycling", "active transportation", "bike path", "bicycle"] |
| "Has anyone opposed Bylaw 1045?" | "Bylaw 1045 opposition vote" | "Bylaw 1045" OR "bylaw no. 1045" | ["rezoning", specific bylaw title from DB lookup] |
| "What's happening with housing?" | "affordable housing development policy" | "housing" OR "residential" | ["affordable housing", "rental", "OCP", "density", "zoning"] |
| "Compare View Royal and Esquimalt on short-term rentals" | "short-term rental regulation policy" | "short-term rental" OR "Airbnb" OR "STR" | ["vacation rental", "home sharing", "licensing"] |

**Entity pre-resolution**: When the analysis identifies a person name, do a database lookup immediately (reusing the existing `getPerson` logic). If the person exists, attach their `id` to the analysis so subsequent tools can skip the lookup. Same for bylaws — if "Bylaw 1045" is mentioned, look up its `matter_id` and title so search tools can use the title text instead of the identifier.

#### 9c. Hybrid Search Foundation

Replace the current per-tool embedding generation with a shared search infrastructure that combines vector similarity with full-text search.

**Shared embedding cache**: Generate the query embedding once per request and pass it to all tools:

```typescript
// In runQuestionAgent, before the orchestrator loop:
const analysis = await analyzeQuery(question, municipalityContext);
const queryEmbedding = await generateQueryEmbedding(analysis.rewritten_queries.semantic);

// Each tool receives the pre-computed embedding + analysis
const toolContext = { queryEmbedding, analysis, municipalityId };
```

This eliminates 2-3 redundant OpenAI API calls per question.

**Full-text search integration**: Add `tsvector` generated columns and GIN indexes (from Layer 8f plan) to enable combined retrieval:

```sql
-- Already planned in Layer 8; ensuring the RAG tools use them
ALTER TABLE transcript_segments ADD COLUMN text_search tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(corrected_text_content, text_content, ''))) STORED;
ALTER TABLE motions ADD COLUMN text_search tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(plain_english_summary, text_content, ''))) STORED;
ALTER TABLE agenda_items ADD COLUMN text_search tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(plain_english_summary, '') || ' ' || coalesce(debate_summary, ''))) STORED;
ALTER TABLE matters ADD COLUMN text_search tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(plain_english_summary, description, ''))) STORED;
ALTER TABLE documents ADD COLUMN text_search tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content_markdown, ''))) STORED;

CREATE INDEX idx_ts_segments_fts ON transcript_segments USING GIN (text_search);
CREATE INDEX idx_motions_fts ON motions USING GIN (text_search);
CREATE INDEX idx_agenda_items_fts ON agenda_items USING GIN (text_search);
CREATE INDEX idx_matters_fts ON matters USING GIN (text_search);
CREATE INDEX idx_documents_fts ON documents USING GIN (text_search);
```

**Hybrid search RPC function**: A single Supabase RPC that runs both vector and full-text search, then merges results with reciprocal rank fusion (RRF):

```sql
CREATE OR REPLACE FUNCTION hybrid_search(
    p_query_embedding vector(768),   -- or halfvec(384) after migration
    p_text_query text,               -- raw text for ts_query
    p_table_name text,               -- "motions", "transcript_segments", etc.
    p_municipality_id bigint DEFAULT NULL,
    p_after_date date DEFAULT NULL,
    p_before_date date DEFAULT NULL,
    p_match_count int DEFAULT 20,
    p_vector_weight float DEFAULT 0.7,
    p_text_weight float DEFAULT 0.3
) RETURNS TABLE (id bigint, vector_rank int, text_rank int, rrf_score float, similarity float)
```

**Reciprocal Rank Fusion**: Combines rankings from vector and keyword search without needing to normalize scores across different metrics:

```
RRF_score = vector_weight / (k + vector_rank) + text_weight / (k + text_rank)
```

Where `k = 60` (standard constant). Items that appear in both result sets get boosted; items from only one source still appear but ranked lower. This handles the "bylaw 1045" problem — exact text match ranks it #1 in keyword search, which boosts it above semantically-similar-but-wrong results from vector search.

#### 9d. Reranking with LLM-as-Judge

After hybrid search returns ~50 candidates, rerank the top results using the LLM to score relevance. This is dramatically more accurate than cosine similarity alone because the LLM understands the question's intent, not just vocabulary overlap.

**Why not a cross-encoder model?** Cross-encoders (e.g., `ms-marco-MiniLM`) are faster and cheaper per item, but they require hosting a model endpoint or running it client-side. Gemini Flash is already available, fast (~50ms per batch), and understands municipal context better than a generic cross-encoder.

**Batch reranking**: Send a single Gemini Flash call with the question and top-N candidates (20-30), asking it to score each 0-10 and return the top results:

```typescript
async function rerankResults(
  question: string,
  candidates: SearchResult[],
  topK: number = 10
): Promise<SearchResult[]> {
  const prompt = `Rate each result's relevance to the question on a scale of 0-10.
Question: "${question}"

Results:
${candidates.map((c, i) => `[${i}] ${c.type}: ${c.text.slice(0, 300)}`).join("\n\n")}

Return JSON: {"rankings": [{"index": 0, "score": 8, "reason": "directly addresses..."}, ...]}
Only include results scoring 5 or higher.`;

  const response = await geminiFlash.generateContent(prompt);
  // Parse, sort by score, return top K
}
```

**Cost**: ~1¢ per question (one Flash call with ~3K tokens input). **Latency**: ~300ms. **Quality improvement**: Eliminates the ~30% of results that are topically adjacent but not actually relevant (e.g., a motion about "road improvements" matching a query about "bike lanes" because both are transportation-related).

**When to rerank**: Only when the candidate set is large (>10 results) and the question is complex. Simple factual queries ("When was bylaw 1045 adopted?") can skip reranking — the entity pre-resolution from query analysis handles these.

#### 9e. Enhanced Tool Set

Redesign the RAG tools for the multi-town, document-rich data model. The tools shift from "search a single table" to "answer a type of question" — each tool encapsulates the hybrid search, municipality scoping, and result formatting internally.

**Retired tools:**
- `get_current_date` → replaced by query analysis temporal resolution (9b)
- `search_agenda_items` (keyword-only `ilike`) → replaced by `search_discussions` which uses hybrid search

**Redesigned tools:**

| Tool | Purpose | Changes from current |
|------|---------|---------------------|
| `search_discussions` | Find what was discussed about a topic | **Replaces both `search_transcript_segments` and `search_agenda_items`.** Searches agenda item discussion embeddings (Layer 8f) + key statements + full-text on segments. Returns agenda items with their key quotes and discussion summary, not raw segments. The orchestrator gets structured discussion context instead of scattered fragments. |
| `search_decisions` | Find council decisions and votes on a topic | **Replaces `search_motions`.** Hybrid search on motions + matters. Returns motions with vote breakdowns, related matter context, and outcome. Optionally includes the debate context (key statements from the discussion that led to the vote). |
| `get_person_activity` | Everything about a person on a topic | **Replaces both `get_statements_by_person` and `get_voting_history`.** Single tool that returns a person's statements, votes, and motions they moved/seconded on a topic. Handles aliases. Reduces tool calls for person-based questions from 2 to 1. |
| `search_documents` | Search across staff reports, attachments, and official documents | **New.** Searches the `documents` and `document_sections` tables (Layer 4.5). Finds staff recommendations, financial analyses, engineering assessments, correspondence. Returns section-level results with document context. Critical for questions like "What did the staff report say about traffic impacts?" |
| `get_meeting_context` | Get full context for a specific meeting | **New.** Given a meeting ID or date, returns the complete agenda, key decisions, attendance, and document list. Useful when the orchestrator finds a relevant meeting via another tool and needs to understand the full picture. |
| `compare_across_municipalities` | Compare how different towns handle a topic | **New (Phase 6+).** Runs the same search across multiple municipalities and returns side-by-side results. Enables "How does View Royal's tree bylaw compare to Esquimalt's?" |
| `get_timeline` | Chronological history of a topic across meetings | **New.** Given a matter ID or topic, returns a chronological sequence of events: when it was first raised, key debates, readings, votes, and current status. Synthesizes across meetings, motions, and agenda items. Essential for "What's the history of the OCP review?" |

**Tool definitions (detailed):**

```typescript
// search_discussions — primary topic search tool
{
  name: "search_discussions",
  description: `search_discussions(query: string, after_date?: string, before_date?: string)
    — Finds council discussions about a topic. Returns agenda items with their AI summaries,
    key quotes from debate, and meeting context. Best for: "What has council discussed about X?",
    "What was said about Y?", "Show me debates about Z."
    Uses semantic + keyword hybrid search. Short specific queries work best.`,
  call: async ({ query, after_date, before_date }, context) => {
    // 1. Hybrid search on agenda_items (discussion embeddings + full-text)
    // 2. For top results, fetch key_statements linked to those agenda items
    // 3. Return structured: { agenda_item, meeting_date, summary, key_quotes[], speakers[] }
  }
}

// search_documents — new tool for staff reports, attachments
{
  name: "search_documents",
  description: `search_documents(query: string, document_type?: string, after_date?: string)
    — Searches across official documents: staff reports, financial statements, engineering
    assessments, correspondence, and other attachments to agenda packages. Use when the question
    is about specific details, recommendations, or analysis that staff prepared for council.
    Optional document_type filter: "staff_report", "financial_statement", "correspondence",
    "bylaw_text", "map", "presentation".`,
  call: async ({ query, document_type, after_date }, context) => {
    // 1. Hybrid search on documents table (content_markdown + embedding)
    // 2. For top results, fetch parent document and linked agenda item for context
    // 3. Return: { document_title, document_type, section_heading, excerpt, meeting_date, agenda_item_title }
  }
}

// get_timeline — chronological topic tracking
{
  name: "get_timeline",
  description: `get_timeline(topic_or_matter_id: string)
    — Returns the chronological history of a topic or matter across all meetings. Shows when it
    was first raised, key debates, readings, votes, amendments, and current status. Use for
    questions like "What's the history of X?" or "How has the OCP review progressed?"
    Pass either a matter ID (if known from prior search) or a topic string.`,
  call: async ({ topic_or_matter_id }, context) => {
    // 1. If numeric, look up the matter directly
    // 2. If string, search matters to find the best match
    // 3. Fetch all agenda items, motions, and key events for that matter, ordered by date
    // 4. Return: { matter_title, status, timeline: [{ date, event_type, description, outcome }] }
  }
}
```

#### 9f. Richer Context Assembly

The current system passes truncated JSON blobs to the orchestrator and one-line summaries to the synthesizer. Both lose critical information. Redesign context assembly for each phase.

**Orchestrator context**: Instead of raw JSON dumps, format tool results as readable structured text that's easy for the model to reason about:

```typescript
function formatToolResultForOrchestrator(toolName: string, result: any): string {
  if (toolName === "search_discussions") {
    return result.map((r: any, i: number) =>
      `Discussion ${i+1}: "${r.agenda_item_title}" (${r.meeting_date}, ${r.meeting_type})
       Summary: ${r.plain_english_summary || "No summary"}
       Key quotes: ${r.key_quotes?.map((q: any) => `- ${q.speaker}: "${q.text}"`).join("\n") || "None"}
       Speakers: ${r.speakers?.join(", ") || "Unknown"}`
    ).join("\n\n");
  }
  // ... format per tool type
}
```

This gives the orchestrator much richer signal about what it found, enabling better decisions about whether to search further or finalize.

**Synthesizer evidence bundle**: Pass the full evidence text to the synthesizer, not just titles. The synthesizer currently receives:

```
[1] (transcript, 2024-01-15, Cllr. Lemon) Councillor Lemon noted that the bike lane...
```

Change to a structured evidence document:

```
[1] TRANSCRIPT — Regular Council, January 15, 2024
    Speaker: Councillor Lemon
    Context: Discussion on Island Highway Active Transportation Plan (Agenda Item 7.2)
    Quote: "I believe we need to delay the bike lane project until the traffic study is complete.
    The current proposal doesn't account for the increased volume from the new development at
    Helmcken Road. We're talking about a $2.3 million investment and we owe it to residents
    to get it right."

[2] MOTION — Regular Council, January 15, 2024
    Motion: "THAT Council direct staff to commission an independent traffic impact assessment
    for the Island Highway Active Transportation Corridor before proceeding to detailed design."
    Moved by: Councillor Lemon. Seconded by: Councillor Holland.
    Result: CARRIED (5-2). Opposed: Mayor Mercer, Councillor Bateman.

[3] STAFF REPORT — Regular Council, November 12, 2023
    Document: "Staff Report: Island Highway Active Transportation Plan — Phase 2 Design"
    Author: Director of Engineering
    Recommendation: "Staff recommends that Council approve the Phase 2 detailed design at an
    estimated cost of $2.3 million, funded from the Gas Tax Reserve."
    Key finding: "Traffic modeling indicates a 12% reduction in vehicle throughput during
    peak hours, offset by a projected 40% increase in cycling trips."
```

This gives the synthesizer enough context to write a genuinely informative answer with specific dates, quotes, vote counts, and document references — instead of a vague summary.

**Context window budget**: With Gemini 2.0 Flash's 1M token context, we have ample room. Budget:
- System prompt: ~1K tokens
- Evidence bundle: up to 8K tokens (~20 rich sources × ~400 tokens each)
- Question + instructions: ~200 tokens
- Output: ~600 tokens
- Total: ~10K tokens per synthesis call — well within limits, and 5x richer than current

#### 9g. Orchestrator Improvements

**Adaptive step budget**: Replace the fixed `maxSteps = 6` with a dynamic budget based on query complexity from the analysis:

| Query intent | Step budget | Rationale |
|-------------|------------|-----------|
| Simple factual ("When was bylaw 1045 adopted?") | 2 | Entity lookup + one search |
| Person-based ("What has Cllr. Lemon said about housing?") | 3 | Person lookup + statements + optional votes |
| Topic exploration ("What's happening with housing?") | 4 | Discussions + decisions + matters |
| Comparative ("How do councillors differ on density?") | 5 | Multiple person lookups + topic search |
| Historical ("What's the full history of the OCP review?") | 5 | Timeline + discussions + documents |
| Cross-municipality comparison | 6 | Parallel searches across towns |

**Self-correction loop**: When a tool returns fewer than 3 results, the orchestrator should automatically try a reformulated query before giving up. Add a retry instruction to the system prompt:

```
If a search returns 0-2 results, try ONE of these recovery strategies before finalizing:
- Broaden the query: "tree cutting permit" → "tree removal"
- Try a different tool: if search_discussions found nothing, try search_decisions
- Remove date filters: temporal filters may be too narrow
- Search for a related concept: "bike lane" → "active transportation"
Do NOT retry with the same query and tool.
```

**Parallel tool execution**: Currently, tools run sequentially (one per orchestrator step). For questions that clearly need multiple independent searches, the orchestrator should be able to request parallel execution:

```json
{"thought": "This is a comparative question. I need voting records for both councillors.",
 "action": {"parallel": [
   {"tool_name": "get_person_activity", "tool_args": {"person_name": "Lemon", "topic": "housing"}},
   {"tool_name": "get_person_activity", "tool_args": {"person_name": "Bateman", "topic": "housing"}}
 ]}}
```

The agent loop detects the `parallel` key and runs both tools concurrently via `Promise.all()`. This halves latency for comparative questions.

#### 9h. Answer Quality & Self-Evaluation

**Claim verification**: After the synthesizer produces an answer, run a lightweight verification pass that checks each factual claim against the evidence. This catches hallucinated dates, vote counts, or misattributed quotes:

```typescript
async function verifyAnswer(
  answer: string,
  evidence: NormalizedSource[],
  question: string
): Promise<{ verified: boolean; issues: string[] }> {
  const verificationPrompt = `Check each factual claim in this answer against the evidence.
Flag any claim that is not directly supported by the evidence.

Answer: ${answer}

Evidence:
${formattedEvidence}

Return JSON: {"verified": true/false, "issues": ["Claim X is not supported...", ...]}`;

  // Only run if answer contains specific claims (dates, numbers, names, vote counts)
  // Skip for vague or "insufficient evidence" answers
}
```

If issues are found, either: (a) regenerate the answer with a correction prompt, or (b) add a subtle disclaimer to the UI ("Some details in this answer could not be fully verified against council records").

**Confidence scoring**: Have the synthesizer output a confidence level alongside the answer. Display this to users so they know whether to trust the answer or dig deeper:

- **High confidence**: Multiple corroborating sources, recent data, clear evidence
- **Medium confidence**: Few sources, indirect evidence, older data
- **Low confidence**: Single source, inference-heavy, data gaps noted

The UI already shows sources — add a confidence indicator (e.g., a subtle badge or sentence like "Based on 7 council records from 2023-2024").

#### 9i. Conversation Memory & Follow-ups

The current `context` parameter is a raw string of the previous question. This loses all gathered evidence and forces re-retrieval for follow-ups. Implement lightweight conversation state.

**Session state structure:**

```typescript
interface ConversationState {
  session_id: string;
  turns: {
    question: string;
    analysis: QueryAnalysis;
    evidence: NormalizedSource[];   // Full evidence from this turn
    answer_summary: string;         // First 200 chars of answer
    entities_discovered: {          // Entities found during this turn
      people: { id: number; name: string }[];
      matters: { id: number; title: string }[];
      meetings: { id: number; date: string }[];
    };
  }[];
}
```

**Storage**: Cloudflare Workers KV with a 15-minute TTL (same as current rate limit window). Key: session ID from a cookie or header. Size: ~5-10 KB per session — well within KV limits.

**Follow-up handling**: When the orchestrator receives a follow-up question with conversation state:
1. The query analysis step receives prior context (entities, topics discussed)
2. Pronoun resolution: "What did she say about that?" → "What did Councillor Lemon say about the bike lane?"
3. Evidence reuse: If the prior turn found the relevant meeting, don't re-search — use the cached `meeting_id`
4. Incremental search: Only search for new information not already in the conversation

**Example flow:**
```
Turn 1: "What has council discussed about the Island Highway bike lane?"
→ Finds 5 discussions, 3 motions, 2 staff reports. Surfaces key quotes.

Turn 2: "Who opposed it?"
→ Query analysis resolves "it" = Island Highway bike lane (from turn 1)
→ Reuses the motion IDs from turn 1 to look up vote breakdowns
→ No new embedding generation or broad search needed — targeted vote lookup only
```

#### 9j. Observability & Quality Metrics

Add instrumentation to measure and improve RAG quality over time.

**Per-question telemetry** (stored in Supabase or KV):

```typescript
interface RAGTelemetry {
  question_id: string;
  question: string;
  municipality_slug: string;
  query_analysis_ms: number;
  embedding_ms: number;
  tool_calls: {
    tool: string;
    latency_ms: number;
    result_count: number;
    reranked: boolean;
  }[];
  total_sources: number;
  unique_sources: number;
  synthesis_ms: number;
  total_latency_ms: number;
  answer_length: number;
  confidence: "high" | "medium" | "low";
  // User feedback (optional, from thumbs up/down in UI)
  feedback?: "positive" | "negative";
  feedback_comment?: string;
}
```

**Quality dashboard** (admin-only route): Aggregated metrics showing:
- Average latency by stage (query analysis, search, reranking, synthesis)
- Tool usage distribution (which tools are called most, which return empty)
- Confidence score distribution
- User feedback ratio
- Questions with negative feedback (for manual review)
- Common query patterns (topics people ask about most)

**Feedback loop**: Add thumbs up/down buttons to the answer UI. Negative feedback triggers:
1. Store the question + answer + evidence for review
2. Periodically review low-rated answers to identify systematic issues (bad prompts, missing data, poor tool choices)
3. Use the feedback corpus to improve system prompts and tool descriptions

#### 9k. Search UI Enhancements

**Unified search bar**: Replace the separate search page and ask page with a single search experience that auto-routes based on query analysis:

- Simple keyword queries (< 4 words, no question mark) → instant keyword/hybrid search results
- Questions (detected by "?" or question intent) → route to RAG agent with streaming answer
- Entity queries ("Bylaw 1045", "Councillor Lemon") → route to entity detail page directly

**Suggested follow-ups**: After showing an answer, suggest 2-3 natural follow-up questions based on the evidence gathered. The synthesizer can generate these as a structured field:

```json
{
  "answer": "Council has discussed affordable housing in 7 meetings...",
  "follow_ups": [
    "How did each councillor vote on the housing density motion?",
    "What did the staff report recommend for the Helmcken Road development?",
    "What's the timeline for the Official Community Plan housing review?"
  ]
}
```

These render as clickable chips below the answer, encouraging deeper exploration.

**Source previews**: When a user hovers over a citation `[3]`, show a rich preview card with the full source excerpt (not just a title), the speaker, the meeting date, and a direct link to that moment in the meeting (video timestamp for transcripts, document section for staff reports). This is already partially implemented — enhance it with the richer evidence from 9f.

**Progressive disclosure for research steps**: The current UI shows tool names and result counts in a collapsible section. Enhance to show the actual search queries used, which helps users understand why certain results appeared and how to refine their questions:

```
🔍 Searched discussions for "Island Highway bike lane" → 5 results
🔍 Searched decisions for "bike lane infrastructure" → 3 results
📄 Found staff report: "Island Highway Active Transportation Plan — Phase 2 Design"
```

### Layer 10: Council Member Profiling

The current profile page shows raw data — vote counts, attendance percentages, a list of meetings attended — but doesn't answer the questions citizens actually have: *What does this councillor care about? Do they follow through on what they say? Who do they align with and on what issues? Are they effective?* This layer uses the data we already collect (transcripts, votes, motions, attendance) to generate rich, AI-synthesized council member profiles that surface patterns, positions, and legislative impact.

#### 10a. Current State & Gaps

**What exists today (`person-profile.tsx` + `people.ts`):**
- Name, image, bio (usually empty), email
- Memberships (Council, committees) with date ranges
- Attendance rate (percentage, paginated history)
- Vote counts (yes/no/abstain totals)
- Voting alignment with other councillors (single percentage per pair)
- Electoral history (elections, votes received)
- Motions moved/seconded (separate page, paginated)

**What's missing:**
- **Topic interests**: No analysis of what topics a councillor speaks about most or votes on. The data exists in transcript segments and motion categories, but it's never aggregated
- **Position summaries**: No AI-generated "Councillor X has consistently supported affordable housing and opposed increased density in residential neighborhoods." The raw data supports this but nobody synthesizes it
- **Speaking participation**: No metrics on how much each councillor speaks in meetings, asks questions, or contributes to debate vs. just voting
- **Legislative effectiveness**: No success rate (% of motions moved that passed), no co-sponsorship patterns, no amendment tracking
- **Temporal alignment**: Voting alignment is a single lifetime number. It doesn't show how alignment has shifted over time or differs by topic ("They agree 95% on budget items but only 40% on environmental issues")
- **Key votes**: No highlighting of votes where a councillor was in the minority or broke with their usual allies — the most interesting and informative data points
- **Position consistency**: No analysis of whether a councillor's statements match their votes ("Said they supported the bike lane in debate but voted against the funding motion")
- **Public engagement**: No tracking of how a councillor interacts with public delegations — do they ask questions? Thank presenters? Challenge staff recommendations?

#### 10b. Profile Generation Pipeline

Add an AI profile generation step that runs after meeting ingestion (or on a schedule) to synthesize structured profile data from raw records. This is a Python pipeline phase, not a real-time web computation.

**When it runs:**
- After each meeting ingestion completes (new data may change a councillor's profile)
- Optionally: nightly batch job that regenerates all profiles for the municipality
- Manual trigger: `uv run python main.py --regenerate-profiles`

**What it produces per councillor:**

```python
@dataclass
class CouncillorProfile:
    person_id: int
    municipality_id: int
    generated_at: datetime

    # AI-generated narrative sections
    summary: str                    # 2-3 sentence overview of the councillor
    policy_positions: list[PolicyPosition]  # Structured position statements
    notable_moments: list[NotableMoment]   # Key votes, speeches, confrontations

    # Computed statistics (deterministic, not AI)
    topic_distribution: dict[str, float]    # {topic: fraction_of_speaking_time}
    speaking_stats: SpeakingStats
    legislative_stats: LegislativeStats
    alignment_by_topic: dict[str, dict[int, float]]  # {topic: {person_id: alignment%}}
    attendance_trend: list[AttendancePeriod]
    key_votes: list[KeyVote]
```

**Data sources per councillor:**

| Source | What we extract | How |
|--------|----------------|-----|
| `transcript_segments` (via person_id + aliases) | Topics discussed, speaking volume, key quotes, questioning patterns | Aggregate by agenda_item category + AI topic classification |
| `votes` + `motions` | Voting patterns, minority votes, consistency | Deterministic aggregation + join with motion categories |
| `motions` (mover_id, seconder_id) | Legislative initiative, success rate, co-sponsorship pairs | Deterministic: count motions moved, fraction carried |
| `attendance` | Attendance trends over time, participation in specific meeting types | Deterministic: group by month/quarter |
| `agenda_items` (via transcript linkage) | Which policy areas they engage with | Category distribution from linked agenda items |
| `documents` (Layer 4.5) | Staff recommendations they supported/opposed | Cross-reference votes with staff report recommendations |

#### 10c. Topic Interest Detection

Automatically classify what each councillor cares about by analyzing their speaking and voting patterns.

**Step 1 — Build a topic taxonomy:**

Rather than using free-form AI topic extraction (which produces inconsistent labels across councillors), define a fixed taxonomy of municipal policy areas. This ensures comparability ("Councillor A talks about housing 30% of the time; Councillor B talks about housing 10%").

```python
MUNICIPAL_TOPICS = {
    "housing": ["affordable housing", "density", "rental", "zoning", "OCP housing"],
    "transportation": ["bike lane", "transit", "road", "traffic", "sidewalk", "active transportation"],
    "environment": ["tree", "climate", "stormwater", "park", "green space", "environmental"],
    "budget": ["budget", "tax", "financial", "reserve fund", "capital plan", "expenditure"],
    "development": ["rezoning", "subdivision", "development permit", "building permit", "OCP amendment"],
    "infrastructure": ["water", "sewer", "road maintenance", "capital project", "asset management"],
    "governance": ["bylaw", "policy", "procedure", "committee", "public hearing", "delegation"],
    "community": ["recreation", "library", "event", "culture", "senior", "youth", "accessibility"],
    "public_safety": ["RCMP", "fire", "emergency", "bylaw enforcement", "speed limit"],
    "regional": ["CRD", "regional", "intermunicipal", "first nations", "Esquimalt Nation"],
}
```

The taxonomy is municipality-configurable (stored in `municipalities.source_config` or a separate config table) since different towns have different policy focuses.

**Step 2 — Classify agenda items:**

Agenda items already have a `category` field from AI refinement, but the categories are inconsistent ("Development Application" vs "Land Use" vs "Zoning"). Map each agenda item to 1-3 topics from the taxonomy using either:
- Keyword matching on title + summary (fast, deterministic)
- Embedding similarity between agenda item text and topic descriptions (more accurate, uses existing embeddings)

Store the mapping: `agenda_item_topics(agenda_item_id, topic, confidence)`.

**Step 3 — Compute per-councillor topic distribution:**

```sql
-- How much does each councillor talk about each topic?
SELECT
    p.id as person_id,
    ait.topic,
    COUNT(DISTINCT ts.id) as segment_count,
    SUM(LENGTH(COALESCE(ts.corrected_text_content, ts.text_content))) as total_chars
FROM transcript_segments ts
JOIN agenda_item_topics ait ON ait.agenda_item_id = ts.agenda_item_id
JOIN people p ON p.id = ts.person_id
WHERE ts.person_id IS NOT NULL
GROUP BY p.id, ait.topic;
```

This produces a distribution like:
```json
{
    "Councillor Lemon": {
        "transportation": 0.28,
        "environment": 0.22,
        "development": 0.18,
        "budget": 0.15,
        "housing": 0.10,
        "other": 0.07
    }
}
```

**Step 4 — Detect position strength:**

For each topic, determine whether the councillor is a **champion** (speaks frequently + moves motions), a **participant** (votes but doesn't lead), or **passive** (attends but rarely engages). The signal comes from combining:
- Speaking volume on the topic (segments count)
- Motions moved/seconded on the topic
- Votes cast on topic-related motions
- Whether they deviate from the majority on this topic

#### 10d. AI-Generated Position Summaries

For each councillor's top 3-5 topics, generate a concise position summary using AI. This is the heart of the profiling system — turning hundreds of transcript segments and votes into a readable, cited narrative.

**Input to the AI (per topic, per councillor):**

```python
position_context = {
    "councillor": "Councillor Sarah Lemon",
    "topic": "transportation",
    "statements": [
        # Top 10 most relevant transcript segments on this topic
        {"date": "2024-01-15", "text": "I believe we need to delay the bike lane...", "agenda_item": "Island Highway Active Transportation Plan"},
        {"date": "2024-03-12", "text": "The traffic study clearly shows...", "agenda_item": "Budget Amendment - Transportation"},
        # ...
    ],
    "votes": [
        # All votes on transportation-related motions
        {"date": "2024-01-15", "motion": "Commission traffic impact assessment", "vote": "Yes", "result": "CARRIED 5-2"},
        {"date": "2024-06-10", "motion": "Approve bike lane detailed design", "vote": "No", "result": "CARRIED 4-3"},
        # ...
    ],
    "motions_moved": [
        {"date": "2024-01-15", "motion": "Commission traffic impact assessment", "result": "CARRIED"}
    ]
}
```

**Output structure:**

```python
@dataclass
class PolicyPosition:
    topic: str                # "transportation"
    summary: str              # "Councillor Lemon has been a vocal advocate for evidence-based
                              #  transportation planning. She successfully moved to delay the Island
                              #  Highway bike lane project until an independent traffic study was
                              #  completed (Jan 2024), but later voted against the project even after
                              #  the study supported it (Jun 2024), citing cost concerns."
    stance: str               # "cautious_support" | "strong_support" | "opposition" | "mixed" | "neutral"
    confidence: float         # 0.85 (how confident we are in this characterization)
    key_quotes: list[str]     # Selected representative quotes with dates
    key_votes: list[KeyVote]  # The most informative votes on this topic
    evidence_count: int       # Total number of segments + votes used
    date_range: tuple[str, str]  # Period covered by the evidence
```

**Prompt design**: The AI prompt explicitly instructs the model to:
- Only state positions supported by evidence (no inference beyond what was said/voted)
- Note contradictions or evolution in position
- Use neutral, factual language
- Flag when evidence is thin ("Based on limited available data...")
- Never editorialize about whether the position is good or bad

**Anti-bias safeguards:**
- Always present the full voting record, not cherry-picked votes
- When a councillor votes against the majority, include the context (what the majority argument was)
- Regenerate profiles regularly so recent activity doesn't get lost behind older, more voluminous data
- Display "Last updated" timestamp prominently so users know the freshness

#### 10e. Legislative Effectiveness Metrics

Compute deterministic statistics that quantify a councillor's legislative impact. These are factual (not AI-interpreted) and can be displayed alongside the AI narratives.

**Metrics per councillor:**

```typescript
interface LegislativeStats {
    // Motion success
    motions_moved: number;
    motions_carried: number;
    motion_success_rate: number;        // motions_carried / motions_moved
    motions_seconded: number;
    motions_seconded_carried: number;

    // Voting patterns
    total_votes: number;
    majority_votes: number;             // Voted with the winning side
    minority_votes: number;             // Voted with the losing side
    majority_rate: number;              // majority_votes / total_votes
    abstentions: number;
    recusals: number;

    // Engagement
    meetings_attended: number;
    meetings_expected: number;
    attendance_rate: number;
    segments_spoken: number;            // Total transcript segments
    avg_segments_per_meeting: number;   // Speaking participation rate
    questions_asked: number;            // Segments classified as questions (heuristic)
    unique_agenda_items_engaged: number; // How many distinct items they spoke on

    // Co-sponsorship
    most_frequent_seconder: { person_id: number; name: string; count: number };
    most_frequent_mover_for: { person_id: number; name: string; count: number };
}
```

**Key derived insights (computed, not AI):**
- **"Dissent rate"**: How often they vote against the majority — a proxy for independent thinking
- **"Engagement breadth"**: Number of distinct agenda items they speak on / total agenda items at attended meetings — do they engage broadly or focus narrowly?
- **"Follow-through score"**: When they raise a concern in debate, does a related motion appear within 3 meetings? (Heuristic: match transcript topics to subsequent motion topics)
- **"Co-sponsorship network"**: Who do they most frequently co-sponsor motions with? Reveals informal alliances

#### 10f. Voting Alignment Deep Dive

The current alignment calculation is a single lifetime number. Enhance it to be topic-aware and time-aware.

**Topic-scoped alignment:**

```sql
-- Alignment between two councillors on transportation topics only
SELECT
    v1.person_id as person_a,
    v2.person_id as person_b,
    COUNT(*) as shared_votes,
    SUM(CASE WHEN v1.vote = v2.vote THEN 1 ELSE 0 END) as matching_votes,
    ROUND(100.0 * SUM(CASE WHEN v1.vote = v2.vote THEN 1 ELSE 0 END) / COUNT(*), 1) as alignment_pct
FROM votes v1
JOIN votes v2 ON v1.motion_id = v2.motion_id AND v1.person_id < v2.person_id
JOIN motions m ON m.id = v1.motion_id
JOIN agenda_item_topics ait ON ait.agenda_item_id = m.agenda_item_id
WHERE ait.topic = 'transportation'
GROUP BY v1.person_id, v2.person_id;
```

This reveals patterns invisible in the overall number: "Lemon and Bateman agree 85% overall but only 40% on environmental issues."

**Time-windowed alignment:**

Group alignment by quarter or year to show how relationships evolve. Display as a sparkline or small chart on the profile page — rising alignment suggests forming alliances, falling alignment suggests growing disagreements.

**Bloc detection:**

Using the topic-scoped alignment matrix, identify voting blocs — groups of 2-3 councillors who consistently vote together above a threshold (e.g., >85% alignment). Display these as informal groupings on the profile ("Frequently votes with Councillor Bateman and Councillor Holland on development issues").

#### 10g. Notable Moments & Key Votes

Automatically identify the most interesting/noteworthy moments for each councillor. These are the moments citizens actually want to see — not the 95% of routine unanimous votes.

**Key vote detection (deterministic):**

A vote is "key" if any of:
1. The councillor was in the **minority** (voted against the winning side)
2. The motion was **close** (passed/failed by 1-2 votes — their vote mattered)
3. The councillor **broke** from their usual allies (voted differently from their top-2 aligned councillors)
4. The councillor **moved or seconded** the motion (they had a personal stake)
5. The motion was on one of the councillor's **top topics** (high-interest vote)

Score each vote 0-5 based on how many criteria it meets. Display the top 10 key votes prominently on the profile.

**Notable moment detection (AI-assisted):**

After key votes are identified, use AI to scan the surrounding transcript segments for notable exchanges — heated debates, pointed questions, emotional statements, public confrontations, or significant policy announcements. The AI extracts:

```python
@dataclass
class NotableMoment:
    date: str
    meeting_id: int
    description: str            # "Councillor Lemon questioned the Director of Engineering about
                                #  the cost overrun on the Helmcken Road project, resulting in
                                #  Council directing staff to prepare a revised budget."
    category: str               # "confrontation" | "policy_announcement" | "public_engagement"
                                # | "procedural_victory" | "key_vote" | "first_motion"
    transcript_segment_ids: list[int]  # Links to the actual transcript moments
    significance: str           # "This was the first time a councillor publicly questioned
                                #  the engineering budget since the 2022 election."
```

#### 10h. Speaking Pattern Analysis

Quantify how each councillor participates in debate, beyond just "number of segments spoken."

**Metrics (deterministic):**

- **Speaking volume per meeting**: Average number of transcript segments per attended meeting. Normalize by meeting length (total segments) to get a "participation share."
- **Topic concentration**: Herfindahl-Hirschman Index (HHI) of their topic distribution — a high HHI means they focus narrowly on a few topics; low HHI means they engage broadly
- **Question rate**: Fraction of their segments that are questions (detected by ? or interrogative phrasing). High question rate = scrutiny role; low = declaration role
- **Debate engagement**: Do they speak on items where there's disagreement (multiple speakers, non-unanimous vote) or only on routine items? Measured as: (segments on contested items) / (total segments)

**AI-assisted patterns:**

For the councillor's most recent 6 months of transcripts, classify each segment as:
- **Statement**: Declaring a position or sharing information
- **Question**: Asking staff or other councillors for clarification
- **Procedural**: Points of order, agenda management
- **Public engagement**: Responding to delegations or public input

Store the distribution. This reveals role differences: some councillors are primarily "questioners" (holding staff accountable), others are "declarers" (advancing policy positions), others are "proceduralists" (managing meeting flow).

#### 10i. Schema Extensions

**New table: `person_profiles`**

```sql
CREATE TABLE person_profiles (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    person_id bigint NOT NULL REFERENCES people(id),
    municipality_id bigint NOT NULL REFERENCES municipalities(id),

    -- AI-generated narrative
    summary text,                        -- 2-3 sentence overview
    policy_positions jsonb DEFAULT '[]',  -- Array of PolicyPosition objects
    notable_moments jsonb DEFAULT '[]',   -- Array of NotableMoment objects

    -- Computed statistics
    topic_distribution jsonb DEFAULT '{}',  -- {topic: fraction}
    speaking_stats jsonb DEFAULT '{}',      -- SpeakingStats object
    legislative_stats jsonb DEFAULT '{}',   -- LegislativeStats object
    alignment_by_topic jsonb DEFAULT '{}',  -- {topic: {person_id: pct}}
    key_votes jsonb DEFAULT '[]',           -- Array of KeyVote objects

    -- Metadata
    data_coverage_start date,             -- Earliest data used for this profile
    data_coverage_end date,               -- Latest data used for this profile
    meetings_analyzed int,                -- How many meetings contributed to this profile
    segments_analyzed int,                -- How many transcript segments analyzed
    generated_at timestamptz NOT NULL DEFAULT now(),

    UNIQUE (person_id, municipality_id)
);
```

**New table: `agenda_item_topics`**

```sql
CREATE TABLE agenda_item_topics (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    agenda_item_id bigint NOT NULL REFERENCES agenda_items(id) ON DELETE CASCADE,
    topic text NOT NULL,                 -- From the taxonomy
    confidence float NOT NULL DEFAULT 1.0,
    UNIQUE (agenda_item_id, topic)
);

CREATE INDEX idx_ait_topic ON agenda_item_topics(topic);
CREATE INDEX idx_ait_agenda_item ON agenda_item_topics(agenda_item_id);
```

**Extensions to `people` table:**

```sql
ALTER TABLE people ADD COLUMN IF NOT EXISTS pronouns text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS short_bio text;  -- AI-generated 1-liner for cards
```

The `short_bio` is generated from the full profile: "Transportation and environment advocate. Councillor since 2022. 94% attendance rate." This replaces the currently-empty `bio` field with something auto-generated and always current.

#### 10j. Profile Page Redesign

Restructure the person profile page to lead with synthesized insights rather than raw data tables.

**New layout (top to bottom):**

1. **Header**: Name, role, photo, short_bio, pronouns, tenure ("Councillor since Nov 2022")
2. **At a Glance** (card row):
   - Attendance rate (with trend arrow: up/down vs. previous period)
   - Voting record pie chart (yes/no/abstain)
   - Motion success rate
   - Dissent rate
   - Speaking participation rank ("3rd most active speaker")
3. **AI Summary**: The 2-3 sentence profile summary, with "Last updated" timestamp and "Based on N meetings" context
4. **Policy Positions** (expandable cards per topic):
   - Topic name + stance indicator (visual: green/red/yellow/gray)
   - Position summary paragraph
   - Key quotes (collapsible)
   - Key votes on this topic
   - "Explore more" link → filtered search for this person + topic
5. **Key Votes** (highlight reel):
   - The top 5-10 most noteworthy votes
   - Each showing: date, motion summary, their vote, outcome, why it's notable
   - Link to meeting page / transcript moment
6. **Voting Alignment** (enhanced):
   - Overall alignment table (existing, improved)
   - Topic-specific alignment selector (dropdown: "All topics", "Housing", "Budget", etc.)
   - Time-series alignment chart (sparklines per councillor pair)
   - Detected blocs/alliances callout
7. **Speaking Profile**:
   - Topic distribution bar chart
   - Speaking role breakdown (questioner / declarer / proceduralist)
   - Debate engagement metric
8. **Electoral History** (existing, moved lower)
9. **Full Voting Record** (existing paginated table, moved to subpage)
10. **Full Attendance History** (existing, moved to subpage)

**RAG integration**: The profile page includes the existing "Ask a question" component (`ask-question.tsx`), pre-populated with the councillor's name as context. The AI search tools (Layer 9) can reference the precomputed profile data to provide faster, richer answers about specific councillors without re-analyzing hundreds of transcript segments in real time.

#### 10k. Multi-Municipality Considerations

Profiles must work across municipalities with different council structures:

- **Council size**: View Royal has 7 (mayor + 6 councillors); other towns may have 5, 9, or 11
- **Meeting frequency**: Some councils meet weekly, others monthly — normalize speaking/attendance stats as rates, not counts
- **Committee structure**: Some councillors serve on 2-3 committees with separate meetings — membership tracking (already implemented) handles this, but "meetings expected" must account for committee assignments
- **Term lengths**: 4 years in BC, but by-elections create partial terms — use actual membership dates, not election cycle dates
- **Topic taxonomy**: Each municipality gets its own topic taxonomy (stored in config), though there's a shared base of common municipal topics

**Cross-municipality comparison** (Phase 6+): Once profiles exist for multiple municipalities, enable comparative views ("How does View Royal's mayor's attendance compare to Esquimalt's?"). This requires normalized metrics (rates, not counts) and is a natural extension of the profile data structure.

### Layer 11: Speaker Identification, Fingerprinting & Transcript Quality

The current diarization and speaker identification system works — Gemini identifies speakers from audio context, the local diarizer uses CAM++ embeddings for voice matching, and AI refinement corrects transcription errors. But the system has fundamental architectural gaps: speaker identity is scoped to individual meetings (a person gets a fresh "Speaker_01" label every time), voice fingerprints exist but aren't systematically built or maintained, name canonicalization is hardcoded to View Royal's 50 known people, and there's no quality scoring to know which transcripts are reliable and which need human review. This layer fixes the speaker identity lifecycle from enrollment through cross-meeting tracking, and adds quality infrastructure to measure and improve transcript accuracy over time.

#### 11a. Current State Assessment

**What works:**

- **Gemini diarization** (`diarizer.py`): Two-pass approach (speaker map → speaker segments) using meeting context. Produces speaker names when the audio + agenda provide enough context. Used for cloud-based processing.
- **Local diarization** (`local_diarizer.py`): senko + CAM++ embeddings + parakeet-mlx STT. Produces 192-dim speaker centroids and time-aligned segments. Supports voice fingerprint matching against known speakers. Used on Apple Silicon.
- **AI refinement** (`ai_refiner.py`): Validates speaker identifications against known council members, corrects transcription errors using agenda/minutes as ground truth, extracts structured data (motions, votes, timestamps).
- **Voice fingerprints**: Stored in `voice_fingerprints` table (person_id, 192-dim embedding, source_meeting_id). Matched during local diarization at cosine threshold 0.75. Saved via the speaker-alias UI.
- **Speaker alias UI** (`speaker-alias.tsx`): Manual correction interface for assigning speaker labels to people, accepting voice matches, splitting/relabeling segments.

**What doesn't work:**

- **Per-meeting identity silo**: `meeting_speaker_aliases` maps "Speaker_01" → person_id for one meeting only. The same person is "Speaker_01" in meeting 42, "Speaker_03" in meeting 43, and "SPEAKER_02" in meeting 44. There's no persistent identity that carries across meetings.
- **Voice fingerprints aren't systematically built**: A fingerprint is only saved when someone manually clicks "Accept match" in the speaker-alias UI. For the ~100 ingested meetings, maybe 10-15 have had fingerprints saved. The rest have speaker centroids in `meeting.meta` that were never promoted to persistent fingerprints.
- **Single fingerprint per person**: The `voice_fingerprints` table stores one embedding per person. But voice characteristics vary by microphone, room acoustics, audio quality, and even the person's mood. A single centroid averaged from one meeting's audio is a fragile representation.
- **No fingerprint quality tracking**: The `confidence` column on `voice_fingerprints` is always set to 1.0 (hardcoded at `speaker-alias.tsx:288`). There's no actual confidence calibration.
- **Hardcoded name lists**: `names.py` contains 50 hardcoded names and 50+ hardcoded variant mappings specific to View Royal. This doesn't scale to Esquimalt, RDOS, or any future municipality. Adding a new town requires manually populating `CANONICAL_NAMES` and `NAME_VARIANTS`.
- **`voice_fingerprints` table not in bootstrap.sql**: The table exists in production but was created manually — it's not part of the schema definition, meaning fresh deployments or CI environments won't have it.
- **No confidence on Gemini diarization**: The Gemini-based `diarizer.py` returns speaker_aliases with a confidence field, but this is a number the AI makes up — it's not calibrated or validated. Individual transcript segments from Gemini have no confidence at all.
- **No quality scoring**: `is_verified` (boolean) and `sentiment_score` (float) exist on `transcript_segments` but are never populated. There's no way to know which meetings have good transcripts and which are garbage without manually reading them.
- **Transcript corrections are one-shot**: AI refinement applies corrections during ingestion. If a correction is wrong, there's no way to override it. If new information reveals better corrections later, there's no mechanism to re-apply.
- **No audio preprocessing**: Audio goes directly from Vimeo MP4 to processing. No noise reduction, no volume normalization, no silence trimming. Meeting audio quality varies significantly (some have clear lapel mics, others have distant room mics with HVAC noise).

#### 11b. Voice Fingerprint Architecture

Redesign the voice fingerprint system from "single embedding per person" to a robust, multi-sample speaker model that improves over time.

**New `voice_fingerprints` table** (replace the undocumented existing table):

```sql
CREATE TABLE voice_fingerprints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id bigint NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    municipality_id bigint NOT NULL REFERENCES municipalities(id),
    embedding vector(192),           -- CAM++ centroid from a single meeting
    source_meeting_id bigint REFERENCES meetings(id),
    source_segment_range int4range,  -- Which segments contributed (start_time range)
    audio_quality_score float,       -- Estimated quality of the source audio (0-1)
    created_by text DEFAULT 'auto',  -- 'auto' | 'manual' | 'bulk_backfill'
    is_primary boolean DEFAULT false, -- The best-quality fingerprint for this person
    created_at timestamptz DEFAULT now(),

    -- One primary fingerprint per person per municipality
    UNIQUE (person_id, municipality_id) WHERE (is_primary = true)
);

CREATE INDEX idx_vfp_person ON voice_fingerprints(person_id);
CREATE INDEX idx_vfp_municipality ON voice_fingerprints(municipality_id);
```

**Key change: Multiple fingerprints per person.** Instead of one embedding, store one per meeting where the person spoke. The matching algorithm compares against all fingerprints for a person and uses the best match. Over time, more meetings = more fingerprints = more robust identification.

**Aggregated speaker model** (computed, stored on `people` table):

```sql
ALTER TABLE people ADD COLUMN IF NOT EXISTS voice_centroid vector(192);
ALTER TABLE people ADD COLUMN IF NOT EXISTS voice_sample_count int DEFAULT 0;
ALTER TABLE people ADD COLUMN IF NOT EXISTS voice_quality_score float;
```

The `voice_centroid` is the weighted average of all fingerprints for that person (weighted by `audio_quality_score`). It's recomputed whenever a new fingerprint is added. The `voice_sample_count` tracks how many meetings contributed — a person with 20 samples has a much more reliable centroid than one with 1.

**Matching with multiple samples:**

```python
def match_speaker(centroid: np.ndarray, municipality_id: int, threshold: float = 0.72) -> list[SpeakerMatch]:
    """
    Match a speaker centroid against all known fingerprints for this municipality.
    Returns ranked matches with confidence scores.
    """
    # 1. Quick check against aggregated centroids (people.voice_centroid)
    #    This is fast — one comparison per known person
    candidates = quick_centroid_match(centroid, municipality_id, threshold=threshold - 0.05)

    # 2. For top-5 candidates, compare against ALL their individual fingerprints
    #    Best individual match determines final confidence
    matches = []
    for person_id in candidates:
        fingerprints = get_fingerprints(person_id)
        similarities = [cosine_similarity(centroid, fp.embedding) for fp in fingerprints]

        best_sim = max(similarities)
        avg_sim = np.mean(similarities)
        sample_count = len(fingerprints)

        # Confidence combines best match, average match, and sample diversity
        confidence = compute_match_confidence(best_sim, avg_sim, sample_count)

        if confidence >= threshold:
            matches.append(SpeakerMatch(
                person_id=person_id,
                similarity=best_sim,
                confidence=confidence,
                sample_count=sample_count,
            ))

    return sorted(matches, key=lambda m: m.confidence, reverse=True)
```

**Confidence calibration:**

| Signal | Weight | Rationale |
|--------|--------|-----------|
| Best individual fingerprint similarity | 0.5 | The single best-matching sample — high similarity here means the voice is genuinely close |
| Average across all fingerprints | 0.2 | Consistency — if they match well on average, the identification is robust |
| Sample count (log-scaled) | 0.15 | More samples = more reliable. But diminishing returns: 10 samples isn't 10x better than 1 |
| Audio quality of best match | 0.15 | A high-quality sample match is worth more than a low-quality one |

The weighted score maps to human-interpretable confidence:
- **0.90+**: Very high confidence — auto-accept (display green)
- **0.80-0.90**: High confidence — auto-accept with review flag (display blue)
- **0.72-0.80**: Medium confidence — suggest but require confirmation (display amber)
- **Below 0.72**: No match — require manual identification (display gray)

#### 11c. Automatic Fingerprint Enrollment

Currently, fingerprints are only saved when a human manually confirms them in the speaker-alias UI. This means most meetings never contribute to the fingerprint database. Add automatic enrollment.

**When auto-enrollment triggers:**

1. **After AI refinement confirms a speaker identity** with high confidence: If the AI refiner maps "Speaker_01" to "Councillor Lemon" and the local diarizer produced a centroid for "Speaker_01", auto-save that centroid as a fingerprint for Councillor Lemon.

2. **After a human confirms an alias in the UI**: Already implemented — enhance to save the centroid from that meeting's `meta.speaker_centroids`.

3. **Bulk backfill**: A one-time script that processes all existing meetings with `meta.speaker_centroids` and `meeting_speaker_aliases`, and creates fingerprints for every confirmed speaker-to-person mapping.

**Auto-enrollment flow (during ingestion):**

```python
def auto_enroll_fingerprints(meeting_id: int, speaker_centroids: dict, speaker_aliases: list):
    """
    After ingestion, save fingerprints for speakers with confirmed identities.

    speaker_centroids: {"SPEAKER_01": [0.123, ...], "SPEAKER_02": [...]}
    speaker_aliases: [{"label": "SPEAKER_01", "person_id": 42, "confidence": 0.92}]
    """
    for alias in speaker_aliases:
        label = alias["label"]
        person_id = alias["person_id"]
        confidence = alias.get("confidence", 0.0)

        if label not in speaker_centroids:
            continue  # No centroid available (Gemini diarizer doesn't produce centroids)

        if confidence < 0.80:
            continue  # Only enroll high-confidence identifications

        centroid = speaker_centroids[label]

        # Check if this centroid is significantly different from existing fingerprints
        # (don't store near-duplicates from consecutive meetings in the same room)
        existing = get_fingerprints(person_id)
        if existing and max(cosine_similarity(centroid, fp.embedding) for fp in existing) > 0.95:
            continue  # Too similar to an existing sample — skip

        save_fingerprint(
            person_id=person_id,
            embedding=centroid,
            source_meeting_id=meeting_id,
            audio_quality_score=estimate_audio_quality(meeting_id),
            created_by="auto"
        )

        # Recompute aggregated centroid for this person
        recompute_voice_centroid(person_id)
```

**Diversity-aware enrollment**: Don't store fingerprints that are near-duplicates (>0.95 similarity) of existing ones. This encourages diversity in the sample set — different rooms, different mic setups, different days — which makes the aggregated centroid more robust.

#### 11d. Cross-Meeting Speaker Linking

The core identity gap: when a new meeting is ingested, the diarizer produces labels like "SPEAKER_01", "SPEAKER_02" etc. Currently, these are matched to people only within that meeting. With the fingerprint architecture from 11b, implement automatic cross-meeting speaker linking.

**Linking flow during ingestion:**

```
1. Audio → Local diarizer → Produces segments + speaker centroids
2. For each speaker centroid:
   a. Match against all known fingerprints for this municipality (11b)
   b. If high-confidence match (≥0.80): Auto-assign person_id
   c. If medium-confidence match (0.72-0.80): Create alias with "suggested" flag
   d. If no match: Leave as unknown speaker
3. Pass voice-identified speakers to AI refinement as "pre-identified speakers"
4. AI refinement validates/overrides using contextual clues
5. Final speaker_aliases saved to meeting_speaker_aliases
6. Auto-enroll fingerprints for confirmed speakers (11c)
```

**Step 3 is critical**: Voice matching produces probabilistic results; AI refinement uses semantic context (who's expected at this meeting, who the chair addresses by name, who moves motions) to validate or override. The two systems complement each other:

| Voice match says | AI refinement says | Result |
|-----------------|-------------------|--------|
| Speaker_01 = Cllr. Lemon (0.92) | Context confirms (chair says "Councillor Lemon") | Confirmed: Cllr. Lemon |
| Speaker_01 = Cllr. Lemon (0.85) | Context says Cllr. Lemon wasn't at this meeting | Override: Unknown (flag for review) |
| Speaker_01 = Unknown | Context identifies as "Mayor Hill" (chair greeting) | Assign: Mayor Hill |
| Speaker_01 = Cllr. Lemon (0.76) | No contextual evidence either way | Suggested: Cllr. Lemon (requires confirmation) |

**Conflict resolution priority**: AI contextual identification > high-confidence voice match > medium-confidence voice match > label-based guess

**New column on `meeting_speaker_aliases`:**

```sql
ALTER TABLE meeting_speaker_aliases ADD COLUMN IF NOT EXISTS identification_source text DEFAULT 'ai_refinement';
-- Values: 'voice_fingerprint', 'ai_refinement', 'ai_confirmed_voice', 'manual', 'bulk_backfill'
ALTER TABLE meeting_speaker_aliases ADD COLUMN IF NOT EXISTS confidence float DEFAULT 1.0;
```

This tracks how each alias was identified and how confident the system is, enabling quality auditing and targeted human review.

#### 11e. Database-Driven Name Canonicalization

Replace the hardcoded `names.py` lists with a database-driven system that works for any municipality.

**New table: `name_variants`**

```sql
CREATE TABLE name_variants (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    municipality_id bigint NOT NULL REFERENCES municipalities(id),
    variant text NOT NULL,            -- Lowercase: "matson", "allison mackenzie"
    canonical_person_id bigint NOT NULL REFERENCES people(id),
    source text DEFAULT 'manual',     -- 'manual' | 'ai_learned' | 'election_import'
    created_at timestamptz DEFAULT now(),
    UNIQUE (municipality_id, variant)
);

CREATE INDEX idx_name_variants_lookup ON name_variants(municipality_id, variant);
```

**New table: `name_blocklist`**

```sql
CREATE TABLE name_blocklist (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    municipality_id bigint REFERENCES municipalities(id),  -- NULL = global
    term text NOT NULL,
    UNIQUE (municipality_id, term)
);
```

**Migration path:**
1. Create the tables
2. Seed `name_variants` from the existing `NAME_VARIANTS` dict (with `municipality_id = 1` for View Royal)
3. Seed `name_blocklist` from the existing `PERSON_BLOCKLIST`
4. Auto-populate variants from election data (candidate name variants from `candidacies`)
5. Refactor `get_canonical_name()` and `is_valid_name()` to query the database instead of the hardcoded lists

**Auto-learning variants**: When the AI refiner or a human corrects a speaker name, add the correction to `name_variants` automatically:

```python
def record_name_correction(municipality_id: int, incorrect: str, person_id: int):
    """Record a name variant learned from a correction."""
    variant = incorrect.lower().strip()
    if not is_blocklisted(variant, municipality_id):
        upsert_name_variant(municipality_id, variant, person_id, source='ai_learned')
```

Over time, the system accumulates corrections and stops making the same mistakes. New municipalities start with an empty variant table and build it up as meetings are ingested.

**Seeding from election data**: When election history is imported (existing `import_election_history.py`), auto-generate obvious variants:
- Surname only: "Lemon" → Gery Lemon
- First + last without middle: "Scott Sommerville" → Scott M. Sommerville
- Common title prefixes: "Mayor Hill" → Graham Hill, "Councillor Lemon" → Gery Lemon

#### 11f. Transcript Quality Scoring

Add quality infrastructure to measure how reliable each transcript is, so the system can prioritize human review where it matters most and so downstream consumers (RAG, profiles) can weight evidence by quality.

**Per-segment quality score:**

```sql
ALTER TABLE transcript_segments ADD COLUMN IF NOT EXISTS quality_score float;
ALTER TABLE transcript_segments ADD COLUMN IF NOT EXISTS quality_flags text[] DEFAULT '{}';
```

**Quality signals (computed during ingestion):**

| Signal | Weight | How measured |
|--------|--------|-------------|
| Speaker identification confidence | 0.25 | From voice fingerprint match or AI refinement confidence |
| Text correction ratio | 0.20 | `edit_distance(text_content, corrected_text_content) / len(text_content)` — high ratio = many corrections needed = lower quality source |
| Segment length | 0.10 | Very short segments (<10 chars) are likely noise; very long segments (>2000 chars) may be segmentation errors |
| Audio overlap score | 0.15 | From local diarizer overlap ratio (how well the segment aligns with diarization boundaries) |
| Contextual coherence | 0.15 | Does this segment make grammatical/semantic sense? Quick heuristic: sentence structure, dictionary word ratio |
| Speaker continuity | 0.15 | Does the speaker assignment change rapidly (sign of diarization errors)? Measured as: fraction of surrounding segments with the same speaker |

**Quality flags** (machine-readable issues):

```python
QUALITY_FLAGS = {
    "no_speaker": "Speaker could not be identified",
    "low_confidence_speaker": "Speaker identification below 0.80 confidence",
    "heavy_corrections": "More than 30% of text was corrected by AI",
    "very_short": "Segment shorter than 10 characters",
    "very_long": "Segment longer than 2000 characters (possible segmentation error)",
    "rapid_speaker_change": "Speaker changed more than 3 times in 10 seconds",
    "possible_overlap": "Multiple speakers may be talking simultaneously",
    "low_audio_quality": "Source audio had significant noise or low volume",
    "unresolved_name": "Speaker name doesn't match any known person",
}
```

**Per-meeting quality score:**

```sql
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS transcript_quality_score float;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS transcript_quality_flags jsonb DEFAULT '{}';
```

Computed as weighted average of segment quality scores for that meeting, plus meeting-level signals:
- **Speaker coverage**: What fraction of segments have identified speakers? (>90% = good, <50% = poor)
- **Correction density**: Average corrections per segment
- **Diarization method**: Local diarizer (with voice fingerprints) > Gemini diarizer (no fingerprints) > no diarization
- **Unique speakers identified**: Should roughly match expected attendees — if the diarizer found 12 speakers but only 7 people were expected, something's wrong

**Quality dashboard**: Display transcript quality scores on the admin meetings list. Color-code: green (>0.8), yellow (0.6-0.8), red (<0.6). Allow sorting by quality to prioritize human review for the worst transcripts.

#### 11g. Audio Preprocessing Pipeline

Add preprocessing steps before diarization to improve STT and speaker identification quality.

**Steps (in order):**

1. **Format conversion** (existing): Convert to 16kHz mono WAV — already implemented in `local_diarizer.py`

2. **Volume normalization**: Normalize audio to a consistent RMS level. Meeting recordings vary wildly — some have loud PA systems, others have quiet room mics. Normalization ensures the STT model sees consistent input levels.

   ```bash
   ffmpeg -i input.wav -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 16000 -ac 1 output.wav
   ```

   Uses EBU R128 loudness normalization — standard for broadcast audio. The `loudnorm` filter measures the input, then applies gain to hit -16 LUFS integrated loudness.

3. **Noise reduction**: Apply spectral gating to reduce constant background noise (HVAC, projector fan, road noise). Use `noisereduce` library (Python) or `sox` (CLI):

   ```python
   import noisereduce as nr
   # Estimate noise profile from first 2 seconds (usually silence before meeting starts)
   noise_sample = audio[:2 * sample_rate]
   cleaned = nr.reduce_noise(y=audio, sr=sample_rate, y_noise=noise_sample, prop_decrease=0.8)
   ```

   Conservative `prop_decrease=0.8` — reduce noise by 80% but don't over-process (which creates artifacts that confuse speaker embeddings).

4. **Silence trimming**: Detect and trim leading/trailing silence (common in meeting recordings that start before/after the actual meeting). Use VAD (Voice Activity Detection) to find the first/last speech:

   ```python
   from silero_vad import load_silero_vad, get_speech_timestamps
   model = load_silero_vad()
   timestamps = get_speech_timestamps(audio, model, threshold=0.3)
   # Trim to first speech start - 2s to last speech end + 2s
   ```

5. **Audio quality estimation**: Before processing, estimate overall audio quality. Store on the meeting record for use in fingerprint quality weighting:

   ```python
   def estimate_audio_quality(audio_path: str) -> float:
       """Estimate audio quality on 0-1 scale."""
       # Signal-to-noise ratio
       snr = compute_snr(audio)
       # Clipping detection (peaks at max amplitude)
       clipping_ratio = count_clipped_samples(audio) / len(audio)
       # Silence ratio (too much silence = recording issues)
       silence_ratio = count_silent_frames(audio) / total_frames

       score = 0.0
       score += 0.5 * min(snr / 30.0, 1.0)     # 30 dB SNR = perfect
       score += 0.3 * (1.0 - clipping_ratio * 100)  # Any clipping is bad
       score += 0.2 * (1.0 - abs(silence_ratio - 0.3) * 2)  # ~30% silence is normal
       return max(0.0, min(1.0, score))
   ```

**When to preprocess**: Always for local diarization. For Gemini diarization, only volume normalization (Gemini handles noise reasonably well, and the audio is uploaded as-is).

**Storage**: Preprocessed audio is a temp file — not persisted. The original audio source (Vimeo URL) is the permanent reference. Preprocessing adds ~5 seconds per meeting and ~50 MB temp disk usage.

#### 11h. Transcript Correction Pipeline

Replace the one-shot correction model with an iterative, auditable correction system.

**Current problem**: `corrected_text_content` is set once during ingestion by applying AI refinement corrections. If the correction is wrong or incomplete, it's permanent. No history, no revert capability, no mechanism for humans to improve transcripts over time.

**New table: `transcript_corrections`**

```sql
CREATE TABLE transcript_corrections (
    id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    segment_id bigint NOT NULL REFERENCES transcript_segments(id) ON DELETE CASCADE,
    original_text text NOT NULL,
    corrected_text text NOT NULL,
    correction_type text NOT NULL,        -- 'spelling' | 'name' | 'grammar' | 'content' | 'speaker'
    source text NOT NULL,                 -- 'ai_refinement' | 'ai_post_process' | 'manual' | 'user_report'
    confidence float DEFAULT 1.0,
    applied boolean DEFAULT false,        -- Has this been applied to corrected_text_content?
    created_at timestamptz DEFAULT now(),
    created_by text                       -- User ID or 'system'
);

CREATE INDEX idx_tc_segment ON transcript_corrections(segment_id);
CREATE INDEX idx_tc_applied ON transcript_corrections(applied) WHERE NOT applied;
```

**Correction workflow:**

1. **During ingestion** (existing): AI refinement produces corrections → stored in `transcript_corrections` with `source='ai_refinement'`, `applied=true`. The `corrected_text_content` is set to the corrected version.

2. **Post-ingestion AI pass** (new): After all meetings are ingested, run a second correction pass that uses cross-meeting context:
   - Identify proper nouns that appear in multiple meetings and standardize spelling
   - Cross-reference spoken names against the `name_variants` table
   - Detect municipal jargon and acronyms, expand them (e.g., "OCP" → "Official Community Plan")
   - Source: `'ai_post_process'`

3. **User-reported corrections** (new): Add a "Report correction" button on transcript segments in the web UI. Users can suggest corrections (flagged for review, not auto-applied). Source: `'user_report'`

4. **Bulk re-correction** (new): When name_variants are updated or a new canonical name is added, re-scan all segments for the old variant and create corrections. This handles the case where "Matson" appears in 50 meetings and needs to become "Mattson" everywhere.

**Applying corrections**: `corrected_text_content` is always the latest version. When a new correction is applied:
1. Apply the text replacement to `corrected_text_content`
2. Mark the correction as `applied=true`
3. Log the change with timestamp

**Revert capability**: Since all corrections are stored individually, reverting means setting `applied=false` and recomputing `corrected_text_content` from `text_content` + all remaining `applied=true` corrections in order.

#### 11i. Speaker Verification & Review Workflow

Add a structured review workflow for speaker identifications that need human verification.

**Review queue**: Segments and aliases flagged for review appear in a queue on the speaker-alias page:

```typescript
interface ReviewItem {
    meeting_id: number;
    speaker_label: string;
    suggested_person_id: number | null;
    suggested_person_name: string | null;
    identification_source: string;       // 'voice_fingerprint' | 'ai_refinement'
    confidence: number;
    audio_sample_url: string;            // 15-second clip of the speaker
    transcript_excerpt: string;          // First few segments from this speaker
    context_clues: string[];             // "Chair addresses them as 'Councillor Lemon'"
}
```

**What gets queued:**
- Medium-confidence voice matches (0.72-0.80)
- AI refinement identifications that conflict with voice matches
- Speakers who appear in multiple meetings but haven't been confirmed
- Segments flagged with `low_confidence_speaker` quality flag

**Verification actions:**
- **Confirm**: Accept the suggested identification → saves alias + enrolls fingerprint
- **Correct**: Override with a different person → saves alias + enrolls fingerprint + adds to `name_variants`
- **Reject**: Mark as unknown speaker → removes suggestion, doesn't enroll fingerprint
- **Split**: This label contains two different people → split segments and re-assign

**Batch verification**: For a person with consistent voice matches across many meetings (all >0.85), offer a "Confirm all N matches" button that accepts all at once. This is the fastest way to backfill fingerprints for well-known speakers.

#### 11j. Gemini Diarization Enhancements

The Gemini-based diarizer (`diarizer.py`) has limitations compared to the local diarizer: no speaker centroids, no configurable confidence thresholds, limited context window. Improve it for the cloud-processing path.

**Structured output enforcement**: Replace free-form JSON prompting with Gemini's structured output (JSON schema):

```python
speaker_map_schema = {
    "type": "object",
    "properties": {
        "speaker_aliases": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "name": {"type": "string"},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "evidence": {"type": "string"},  # NEW: Why this identification was made
                },
                "required": ["label", "name", "confidence", "evidence"]
            }
        }
    }
}
```

The `evidence` field forces the model to explain its reasoning ("Chair addresses this speaker as 'Councillor Lemon' at 12:34"), which provides auditability and helps the AI refinement step validate identifications.

**Extended context**: The current 8000-char context truncation loses valuable information. With Gemini Flash's 1M token context, expand to include:
- Full agenda (not truncated)
- Attendance list (from prior ingestion or previous meeting)
- Known speaker characteristics from the fingerprint database ("Councillor Lemon: female, typically third to speak after the mayor")
- Prior meeting's speaker map (if available) — speakers at consecutive meetings are usually the same people

**Multi-pass speaker resolution**: When the single-pass approach leaves speakers unidentified, run a second pass with targeted prompts:
- "The following speakers were not identified: Speaker_03, Speaker_05. Based on the agenda, the expected participants who haven't been identified yet are: [list]. Listen for how they're addressed, what committee assignments they reference, and their speaking patterns."

**Confidence calibration**: Run a one-time calibration by comparing Gemini's confidence scores against the ground truth from manually-verified meetings. Adjust the threshold based on the actual precision/recall curve, not the model's self-reported confidence.

#### 11k. Multi-Municipality Speaker Handling

As new municipalities are onboarded, the speaker identification system needs to handle:

**Separate fingerprint pools**: Voice fingerprints are municipality-scoped. A Councillor in View Royal is a different person from a Councillor in Esquimalt, even if they have similar voices. The matching query always filters by `municipality_id`.

**Shared people across municipalities**: Some individuals serve on regional bodies (CRD) or appear as presenters/consultants at multiple councils. The `people` table is shared, but `voice_fingerprints` are municipality-scoped. Cross-municipality matching would use the person_id link: "This person in Esquimalt sounds like the CRD director we identified in View Royal."

**Per-municipality name configuration**:
- `name_variants` table is municipality-scoped (from 11e)
- `name_blocklist` can be global (NULL municipality_id) or municipality-specific
- Each municipality gets its own council member list from election imports — no hardcoding needed

**Municipality-specific diarization context**: The AI refinement prompt already receives meeting context. Extend to include municipality-specific context:
- Council structure (mayor + 6 councillors vs. board chair + 8 directors)
- Common titles (some municipalities use "Alderman" instead of "Councillor")
- Meeting format conventions (some have a formal roll call that helps identification)

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

### Phase 5c: AI Search & RAG Enhancements
1. **Query analysis pipeline** (9b): Build `analyzeQuery()` function — single Gemini Flash call that extracts intent, entities, temporal resolution, and query rewrites. Replace `get_current_date` tool. Add entity pre-resolution (person/bylaw DB lookups from extracted entities).
2. **Shared embedding + hybrid search foundation** (9c): Refactor to generate query embedding once per request (eliminate redundant OpenAI calls). Add `tsvector` generated columns + GIN indexes on `transcript_segments`, `motions`, `agenda_items`, `matters`, `documents`. Create `hybrid_search` RPC function implementing reciprocal rank fusion (RRF) across vector + full-text results.
3. **Reranking** (9d): Add LLM-as-judge reranking step — batch top-30 hybrid search candidates into a single Gemini Flash call, score 0-10, return top-K. Only trigger for complex queries with >10 candidates.
4. **Redesigned tool set** (9e): Implement `search_discussions` (replaces `search_transcript_segments` + `search_agenda_items`), `search_decisions` (replaces `search_motions`), `get_person_activity` (merges `get_statements_by_person` + `get_voting_history`), `search_documents` (new — searches staff reports and attachments), `get_meeting_context` (new — full meeting detail), `get_timeline` (new — chronological matter history). Wire all tools to use shared embedding + hybrid search + municipality scoping.
5. **Rich context assembly** (9f): Replace `truncateForContext()` with structured text formatting per tool type. Build full evidence bundles for synthesizer with quotes, vote breakdowns, and document excerpts instead of 120-char titles.
6. **Orchestrator improvements** (9g): Adaptive step budget based on query intent. Add self-correction instructions (retry with broader query on sparse results). Implement parallel tool execution (`Promise.all` for independent tool calls in a single orchestrator step).
7. **Answer quality** (9h): Add confidence scoring to synthesizer output. Implement claim verification pass (Gemini Flash checks answer claims against evidence). Add confidence indicator to answer UI.
8. **Conversation memory** (9i): Store conversation state in Cloudflare KV (session_id → turns with evidence + entities). Implement pronoun resolution and evidence reuse for follow-up questions. Add suggested follow-up questions to synthesizer output.
9. **Observability** (9j): Add per-question telemetry (latency by stage, tool usage, result counts, confidence). Build admin-only quality dashboard route. Add thumbs up/down feedback buttons to answer UI. Store negative-feedback questions for review.
10. **Search UI** (9k): Unify search page and ask page into single search bar with auto-routing (keywords → instant results, questions → RAG agent). Render suggested follow-ups as clickable chips. Enhance citation hover cards with full source excerpts. Show search queries used in progressive research step disclosure.
11. **Fix `search_agenda_items` injection vulnerability**: Sanitize query input in PostgREST `ilike` filter (or replace entirely with the new `search_discussions` hybrid tool).
12. **Create missing RPC functions**: Define `match_transcript_segments`, `match_motions`, `match_matters`, and `match_agenda_items` in a migration (currently called but not defined in `bootstrap.sql`).

### Phase 5d: Council Member Profiling
1. **Schema** (10i): Create `person_profiles` table (person_id, municipality_id, all JSONB stat/narrative columns, generated_at). Create `agenda_item_topics` table (agenda_item_id, topic, confidence). Add `pronouns` and `short_bio` columns to `people`.
2. **Topic taxonomy** (10c): Define default `MUNICIPAL_TOPICS` taxonomy. Implement agenda item topic classifier (keyword matching + embedding similarity fallback). Backfill `agenda_item_topics` for all existing agenda items.
3. **Deterministic stats** (10e, 10f, 10h): Build `compute_legislative_stats()` — motion success rate, dissent rate, co-sponsorship pairs. Build `compute_speaking_stats()` — segments per meeting, topic concentration (HHI), question rate. Build `compute_alignment_by_topic()` — topic-scoped voting alignment matrix. Build `detect_key_votes()` — score each vote 0-5 on minority/close/ally-break/mover/top-topic criteria.
4. **AI profile generation** (10d, 10g): Build `generate_position_summaries()` — for each councillor's top 5 topics, gather top statements + all votes, call Gemini to produce PolicyPosition objects. Build `detect_notable_moments()` — scan debate segments around key votes, classify as confrontation/announcement/engagement. Build `generate_summary()` — 2-3 sentence overview from stats + positions. Build `generate_short_bio()` — one-liner for card display.
5. **Pipeline integration** (10b): Add `--regenerate-profiles` flag to main.py. Hook profile generation into post-ingestion step (runs after embeddings). Implement incremental updates (only recompute stats for councillors with new data since last `generated_at`).
6. **Profile page redesign** (10j): Implement new layout — at-a-glance stat cards, AI summary section, expandable policy position cards with stance indicators, key votes highlight reel, topic-scoped alignment selector, speaking profile charts. Move full voting record and attendance history to subpages.
7. **RAG integration**: Wire `get_person_activity` tool (Layer 9) to read from `person_profiles` for quick stats lookup before falling back to raw data queries. Add profile data to synthesizer context for person-based questions.

### Phase 5e: Speaker Identification & Transcript Quality
1. **Voice fingerprint schema** (11b): Add `voice_fingerprints` table to `bootstrap.sql` (with UUID PK, person_id, municipality_id, 192-dim embedding, source_meeting_id, audio_quality_score, is_primary). Add `voice_centroid`, `voice_sample_count`, `voice_quality_score` columns to `people`. Migrate any existing fingerprint data.
2. **Database-driven name canonicalization** (11e): Create `name_variants` table (municipality_id, variant, canonical_person_id, source). Create `name_blocklist` table. Seed from existing `names.py` hardcoded lists. Refactor `get_canonical_name()` and `is_valid_name()` to query DB. Auto-seed variants from election imports (surname, first+last, title+last).
3. **Multi-sample fingerprint matching** (11b): Implement `match_speaker()` that compares against all fingerprints per person (quick centroid check → top-5 detailed comparison). Add calibrated confidence scoring (best similarity, average, sample count, audio quality weighted). Configure auto-accept threshold (0.80) and review threshold (0.72).
4. **Automatic fingerprint enrollment** (11c): Hook into post-ingestion — for every confirmed speaker alias with a centroid, auto-save fingerprint (skip near-duplicates >0.95 similarity). Recompute aggregated `people.voice_centroid` after each enrollment. Build bulk backfill script for existing meetings with `meta.speaker_centroids`.
5. **Cross-meeting speaker linking** (11d): Wire fingerprint matching into the ingestion pipeline — match centroids before AI refinement, pass pre-identified speakers to the refiner, implement conflict resolution priority (AI context > high-confidence voice > medium voice). Add `identification_source` and `confidence` columns to `meeting_speaker_aliases`.
6. **Audio preprocessing** (11g): Add volume normalization (ffmpeg loudnorm), noise reduction (noisereduce with 2-second noise profile), silence trimming (Silero VAD). Add `estimate_audio_quality()` function. Wire into local diarizer before STT. Store quality score on meetings.
7. **Transcript quality scoring** (11f): Add `quality_score` and `quality_flags` columns to `transcript_segments`. Add `transcript_quality_score` and `transcript_quality_flags` to `meetings`. Compute per-segment quality during ingestion (speaker confidence, correction ratio, segment length, overlap score, speaker continuity). Aggregate to per-meeting score.
8. **Transcript correction pipeline** (11h): Create `transcript_corrections` table. Refactor ingestion to log individual corrections (not just apply them). Build post-ingestion cross-meeting correction pass (proper noun standardization, name variant application, jargon expansion). Add "Report correction" UI button on transcript segments.
9. **Speaker verification workflow** (11i): Build review queue for medium-confidence identifications on speaker-alias page. Implement confirm/correct/reject/split actions. Add batch confirmation for consistent cross-meeting matches. Track review status per meeting.
10. **Gemini diarization enhancements** (11j): Add structured output schema (with evidence field). Expand context window (full agenda, attendance list, known speaker characteristics, prior meeting speaker map). Implement multi-pass resolution for unidentified speakers. Calibrate confidence thresholds against manually-verified ground truth.
11. **Quality dashboard**: Add admin route showing per-meeting transcript quality scores (color-coded), speaker identification coverage, flagged segments needing review, fingerprint enrollment status across all meetings.

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

### Why hybrid search (vector + full-text) instead of vector-only?
- Vector search excels at semantic similarity ("affordable housing" matches "residential density") but fails on exact matches ("Bylaw 1045" returns semantically-similar-but-wrong bylaws)
- Full-text search (tsvector/GIN) handles exact terms, identifiers, and proper nouns perfectly but has zero semantic understanding
- Reciprocal rank fusion combines both without needing to normalize incompatible score scales — items that appear in both result sets get a natural boost
- The cost is two indexes per table (HNSW + GIN) instead of one. GIN indexes are tiny (~5 KB per meeting vs. ~500 KB for HNSW), so the storage overhead is negligible
- Keyword-only `ilike` search (current `search_agenda_items`) is the worst of both worlds — slow (no index), no semantics, and SQL-injection-adjacent. Hybrid search replaces it entirely

### Why LLM reranking instead of a cross-encoder?
- Cross-encoders (ms-marco-MiniLM, etc.) are faster per item (~5ms vs ~300ms for a batch) but require hosting a model inference endpoint or a dedicated embedding service — another moving part to maintain
- Gemini Flash is already available, already paid for (used by the orchestrator), and understands municipal domain context (committee names, bylaw structures, motion phrasing) far better than a generic cross-encoder trained on web search pairs
- The reranker runs on ~20-30 candidates (not thousands), so the absolute latency (300ms) is acceptable within a multi-second RAG pipeline
- If latency becomes critical later, a dedicated cross-encoder can be swapped in at the same position in the pipeline without changing the surrounding architecture

### Why merge tools (e.g., `search_discussions` replaces two tools)?
- Fewer tools = fewer orchestrator decisions = fewer wrong choices. The current 7-tool set forces the orchestrator to choose between `search_transcript_segments` and `search_agenda_items` — two tools that often answer the same question from different angles. The orchestrator frequently picks one and misses evidence from the other
- Merged tools run hybrid search across multiple tables internally, returning a unified result set. The orchestrator sees "5 discussions found" instead of needing to mentally merge results from two separate tool calls
- Fewer tool calls per question = lower latency and lower LLM cost
- The merged tools are still distinct in purpose: `search_discussions` (what was said), `search_decisions` (what was decided), `get_person_activity` (everything about a person). The orchestrator's tool selection prompt becomes simpler and more reliable

### Why query analysis as a separate step instead of letting the orchestrator handle it?
- The orchestrator is a loop — it runs 2-6 times per question. Query analysis (intent classification, entity extraction, temporal resolution, query rewriting) only needs to run once
- Moving analysis out of the loop means the orchestrator starts with structured metadata (resolved dates, identified people, optimized search queries) instead of having to figure these out through trial-and-error tool calls
- It eliminates the `get_current_date` tool entirely — temporal expressions like "last 6 months" are resolved to concrete dates before the orchestrator runs
- Entity pre-resolution (looking up person IDs, matter IDs) in the analysis step means tools can use direct ID lookups instead of fuzzy name matching, which is both faster and more reliable
- The analysis step costs ~0.5¢ and ~200ms — trivial compared to the 3-6 orchestrator steps it replaces or simplifies

### Why precompute profiles in the pipeline instead of generating them on-demand?
- A councillor's profile draws from hundreds of transcript segments, every vote they've ever cast, all motions they've moved, and attendance across potentially hundreds of meetings. Computing this in a web request would take 10-30 seconds and dozens of database queries
- Precomputation turns a complex multi-table aggregation into a single row read. The profile page becomes a fast `SELECT * FROM person_profiles WHERE person_id = $1` instead of 15+ parallel queries (which is what `getPersonProfile()` does today)
- AI-generated summaries and position statements take 2-5 seconds per topic per councillor (Gemini calls). Even with just 7 councillors × 5 topics, that's 35 LLM calls — fine in a batch pipeline, unacceptable in a page load
- Profile freshness doesn't need to be real-time. Profiles change meaningfully only after a new meeting is ingested (roughly weekly). Running the profiler after each ingestion keeps data current without wasting compute on unchanged data
- The deterministic stats (vote counts, alignment scores, etc.) are computationally cheap individually but add up — the current `getPersonProfile()` fires ~15 parallel Supabase queries. Precomputing into JSONB columns eliminates this entirely

### Why a fixed topic taxonomy instead of free-form AI topic extraction?
- Free-form extraction produces inconsistent labels across councillors and across runs — "affordable housing", "housing affordability", "residential development", and "housing policy" might all refer to the same topic. This makes cross-councillor comparison impossible
- A fixed taxonomy (10 topics with keyword lists) ensures that when we say "Councillor A talks about housing 30% of the time", we're measuring the same thing as "Councillor B talks about housing 10%"
- The taxonomy is municipality-configurable — different towns can emphasize different topics (a coastal town might add "marine environment" while an urban centre might add "transit")
- Keyword matching on the taxonomy handles 80% of classification; embedding similarity against topic descriptions handles the remaining 20% (ambiguous cases). This hybrid approach is both fast and accurate
- The alternative — letting AI classify every agenda item into arbitrary topics — would require an LLM call per item (expensive at scale) and would still need a normalization step afterward to make topics comparable

### Why detect key votes algorithmically instead of letting AI pick them?
- Key vote detection is based on objective, verifiable criteria: minority position, close margin, alliance break, motion mover status. These are facts, not judgments
- AI selection of "interesting" votes would introduce editorial bias — the model might consider some topics more noteworthy than others based on training data, not the councillor's actual record
- Algorithmic scoring (0-5 based on how many criteria are met) is transparent, reproducible, and auditable. Citizens can understand why a vote was highlighted
- The AI does enter the picture for notable moment *description* — explaining why a key vote was significant. But the selection of which votes to highlight is deterministic

### Why multiple fingerprints per person instead of a single averaged embedding?
- Voice characteristics vary significantly by recording conditions: microphone type (lapel vs. room), room acoustics, background noise, audio codec, and even the speaker's physical state. A single averaged embedding smooths out these variations but also reduces discriminative power
- With multiple samples, the matching algorithm can find the best individual match — if a speaker's voice in today's meeting sounds most like their voice from the March meeting (same room, same mic), that specific match will have high similarity even if the average centroid would be mediocre
- Diversity-aware enrollment (skip near-duplicates >0.95) ensures the sample set captures different conditions, not 10 copies of the same meeting
- The aggregated centroid on `people.voice_centroid` still exists for fast initial screening (one comparison per known person), then detailed matching against individual fingerprints for the top candidates. This two-stage approach is both fast and accurate
- Storage cost is minimal: 192 floats × 4 bytes = 768 bytes per fingerprint. Even 100 meetings × 7 speakers = 700 fingerprints = ~500 KB total

### Why database-driven name canonicalization instead of keeping hardcoded lists?
- The current `names.py` has 50 names and 50+ variants hardcoded for View Royal. Adding Esquimalt requires manually adding another 50+ entries. Adding RDOS requires another set. This doesn't scale
- Database-driven variants are municipality-scoped — "Rogers" maps to "John Rogers" in View Royal but might map to a different person in another municipality
- Auto-learning from corrections means the system gets better over time without code changes. The first time the AI corrects "Matson" to "Mattson", the variant is recorded. It never makes that mistake again
- Election imports auto-generate obvious variants (surname-only, first+last, title+last), seeding the table with minimal manual effort
- The blocklist is also database-driven, allowing municipalities to add their own (e.g., an Indigenous community might have specific terms that shouldn't become person records)

### Why combine voice fingerprinting with AI contextual identification?
- Neither approach alone is sufficient. Voice fingerprinting identifies *who is speaking* based on vocal characteristics — but fails for new speakers, similar voices, or poor audio. AI contextual identification identifies speakers from what they say and how others address them — but requires distinctive conversational cues that not all speakers provide
- The two systems are complementary: voice matching provides probabilistic identity from the audio signal; AI context provides confirmation or correction from the semantic signal. Combined confidence is higher than either alone
- The priority order (AI context > high voice > medium voice) reflects reliability: when the chair says "Thank you, Councillor Lemon" and the voice match also says Lemon, confidence is near-certain. When the voice says Lemon but the context contradicts it (Lemon was absent), the context wins
- For new municipalities with no fingerprints yet, AI identification bootstraps the system — every confirmed identification enrolls a fingerprint for next time. After ~5 meetings, voice matching starts contributing. After ~20 meetings, it's highly reliable

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
| LLM reranking adds latency and cost to every RAG query | Only rerank when candidate set is large (>10) and query is complex; simple factual queries skip reranking entirely. Budget: ~300ms and ~1¢ per rerank call |
| Query analysis step could misclassify intent or extract wrong entities | Use structured output (JSON schema) to constrain Gemini; always fall back gracefully (if analysis fails, run the orchestrator with the raw query as before) |
| Claim verification pass could flag correct answers as unsupported | Only trigger verification when the answer contains specific factual claims (dates, numbers, vote counts); skip for qualitative or "insufficient evidence" answers. Use as a soft signal (confidence indicator) rather than hard blocking |
| Conversation memory in KV could grow unbounded for long sessions | Cap at 5 turns per session; 15-minute TTL auto-expires sessions; store only source IDs + entities (not full evidence text) to keep KV values under 25 KB |
| Hybrid search RPC function complexity — maintaining two search paths per table | The hybrid_search RPC is a single function that handles both paths, not per-table duplication. If one path fails (e.g., GIN index missing), degrade to the other gracefully |
| Merged tools reduce orchestrator flexibility for edge cases | Keep the original granular tools available as fallback options in the tool registry but deprioritize them in the system prompt. If the merged tool returns poor results, the orchestrator can explicitly call the underlying search |
| Missing RPC functions (`match_transcript_segments`, `match_motions`, `match_matters`) currently called but undefined | Create these in the first migration of Phase 5c; they're prerequisites for everything else. The hybrid_search RPC eventually supersedes them, but having them defined prevents runtime errors during incremental rollout |
| AI-generated position summaries could mischaracterize a councillor's stance | Always include evidence counts and date ranges so readers can gauge reliability. Show "Based on N statements and M votes over date range." Regenerate profiles after each meeting ingestion so stale characterizations don't persist. Add a feedback mechanism for councillors to flag inaccuracies |
| AI profiling could be perceived as editorial/biased by councillors or citizens | Position summaries use only factual language (no value judgments). Key vote selection is algorithmic, not AI-chosen. Display methodology transparently ("How are profiles generated?" info tooltip). Offer raw data views alongside AI summaries |
| Profile generation is expensive for large councils or long histories | Incremental updates: only recompute for councillors with new data since last `generated_at`. Batch Gemini calls (multiple topics per API call). Full regeneration is a manual trigger, not automatic. For a 7-member council with 100 meetings: ~35 Gemini calls, ~$0.50, ~3 minutes |
| Topic taxonomy may not cover all relevant policy areas for a municipality | Start with a common base taxonomy (10 topics) and allow per-municipality extensions. Uncategorized agenda items fall into "other" — if "other" exceeds 20% of items, the taxonomy needs expansion. Monitor and adjust during Phase 6 onboarding |
| Speaking pattern analysis depends on diarization quality — misattributed segments corrupt stats | Use confidence-weighted aggregation: segments with low speaker confidence contribute less to stats. Display data quality indicator on profile ("Speaker identification confidence: 87%"). High-confidence segments only for AI position summaries |
| `person_profiles` JSONB columns could grow large for long-serving councillors | Cap stored data: top 5 topics (not all), top 10 key votes (not all), top 5 notable moments. Full data available via direct queries for the detail subpages. Profile row stays under 50 KB |
| Voice fingerprint matching could produce false positives between similar-sounding speakers | Multi-sample matching (11b) reduces false positives by requiring consistency across multiple meetings. Confidence calibration against ground truth sets thresholds empirically. AI contextual validation catches remaining false positives. Medium-confidence matches go to review queue, not auto-accepted |
| Audio preprocessing (noise reduction) could distort speaker embeddings | Use conservative noise reduction (prop_decrease=0.8). Run speaker embedding extraction on the original audio, only use preprocessed audio for STT. Validate on a test set of known speakers before deploying |
| Bulk fingerprint backfill could propagate errors from incorrectly confirmed aliases | Backfill only from aliases with `identification_source='manual'` or with voice match confidence >0.85. Run a validation pass after backfill: flag any person whose fingerprints are inconsistent with each other (pairwise similarity <0.6 among their own samples) |
| Database-driven name lookup adds a query to every segment during ingestion | Cache the full `name_variants` table in memory at pipeline startup (typically <1000 rows). Refresh only when processing a new municipality. The in-memory lookup is O(1) per name, same as the current hardcoded dict |
| Transcript quality scoring could be gamed or misleading | Quality scores are internal signals, not public-facing grades. Display on admin dashboard only. Per-segment flags are machine-readable, not shown to end users. The meeting-level quality score is shown as a subtle indicator ("Transcript quality: Good / Fair / Needs review"), not a numeric score |
| Auto-enrollment of fingerprints during ingestion could slow down the pipeline | Fingerprint save is a single Supabase upsert per speaker per meeting (~50ms). For 7 speakers: ~350ms total. Centroid recomputation is a simple average — milliseconds. Total overhead per meeting: <1 second |
| `voice_fingerprints` table migration from undocumented existing table | Check for existing table in production, export data, create the new table via bootstrap.sql migration, import with column mapping. The existing table has minimal data (~15 fingerprints) so migration risk is low |
| Gemini diarization confidence scores are uncalibrated | Run calibration study: compare Gemini confidence against ground truth from 10-15 manually-verified meetings. Fit a simple sigmoid to map model confidence → actual precision. Use calibrated scores for the auto-accept/review threshold |
