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

### Phase 1: Database Foundation
1. Create `municipalities` table
2. Add `municipality_id` FK to `organizations`, `meetings`, `matters`, `elections`, `bylaws`
3. Insert View Royal as the first municipality record
4. Backfill all existing data with `municipality_id = 1`
5. Update unique constraints to be municipality-scoped
6. Add compound indexes for `(municipality_id, ...)` queries

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

### Phase 4: Web App Multi-Tenancy
1. Add `municipalities` service layer (`getAllMunicipalities`, `getMunicipality`)
2. Build municipality index page — card grid listing all active towns with summary stats
3. Add municipality context layout loader and provider
4. Replace all hardcoded "View Royal" strings with context reads
5. Scope all service queries by `municipality_id`
6. Parameterize RAG system prompts
7. Update routing for subdomain or path-based access
8. Update `wrangler.toml` for new domain/route patterns

### Phase 5: Second Town Onboarding
1. Configure Esquimalt municipality in database
2. Run Legistar scraper to populate data
3. Verify web app renders Esquimalt data correctly
4. Configure RDOS municipality
5. Run static HTML scraper for RDOS
6. End-to-end validation across all three municipalities

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
