# Phase 10: Add Better Test Suite - Research

**Researched:** 2026-02-18
**Domain:** Python pytest + TypeScript Vitest testing infrastructure
**Confidence:** HIGH

## Summary

This phase adds comprehensive automated testing to a civic intelligence platform with two distinct testing domains: a Python ETL pipeline (`apps/pipeline/`) and a React Router 7 web app (`apps/web/`). The pipeline is the primary focus, with the web app getting light server-layer coverage.

The current test suite has 19 tests (15 passing, 1 skipped, 3 in a slow marker-OCR module). Coverage is limited to utility functions (parser, NLP, date extraction) and a few mocked AI integration tests. There is zero coverage of the scraper, diarization, document extraction, embedding, profiling, orchestrator, and most ingestion logic. There are no web app tests at all.

**Primary recommendation:** Use pytest with pytest-cov for the pipeline (already the established tool), add Vitest for the web app's server layer. Build a test fixture system around meeting ID 693 (2025-11-18 Regular Council -- the richest meeting with 33 agenda items, 44 motions, 204 votes, 1086 segments, 36 key statements). Use golden-file snapshots for AI outputs. Gate `pnpm deploy` and pipeline runs on test passes via shell scripts.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Pipeline is the primary focus -- all 5 phases (scrape, download, diarize, refine/ingest, embed)
- Web app gets light coverage -- server loaders and API routes (not UI components)
- Use real meeting data from View Royal as test fixtures (Claude picks a canonical meeting with good feature coverage)
- Include snapshot/golden-file testing for AI outputs (Gemini extraction results, stance generation)
- Comprehensive: happy paths, error paths, edge cases, boundary conditions
- 80%+ line coverage target with coverage reporting
- Coverage tracked and reported now, enforced as a build gate later once stable
- Tests run locally only (no CI/GitHub Actions in this phase)
- Pre-deploy hooks: tests must pass before `pnpm deploy` and pipeline runs succeed
- Mistakes are expensive to fix after the fact -- bad DB data, broken production, silent pipeline failures

### Claude's Discretion
- External service handling strategy (mock vs integration mix)
- Whether to restructure existing pipeline tests or build on them
- Which web app loaders/API routes to cover (highest-value picks)
- Schema/migration testing (whether it's worth the effort)
- Full E2E pipeline test vs phase-level integration tests
- Test reporting format and coverage report tooling
- Unified root test command vs separate per-app commands
- Canonical test meeting selection from real data

### Deferred Ideas (OUT OF SCOPE)
- CI/GitHub Actions integration -- add in a future phase once test suite is stable
- Coverage enforcement as a build gate -- report now, enforce later
- Web app UI/component testing -- only server layer covered in this phase
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pytest | 9.0.2 (installed) | Python test runner | Already in use, mature, excellent plugin ecosystem |
| pytest-cov | latest | Coverage reporting | Standard pytest coverage plugin, wraps coverage.py |
| pytest-mock | 3.15.1 (installed) | Mock/patch helpers | Already in use, simplifies unittest.mock usage |
| Vitest | 3.x | TypeScript test runner | Vite-native, same config as build, fast, compatible with Cloudflare Workers |
| @vitest/coverage-v8 | latest | TS coverage reporting | V8 coverage provider, no extra config needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest-xdist | latest | Parallel test execution | Optional, for when suite grows large (>100 tests) |
| responses | latest | HTTP request mocking | For mocking requests library calls (scraper, Nominatim geocoding, Vimeo) |
| syrupy | latest | Snapshot/golden-file testing | For AI output snapshots (Gemini extraction, stance generation) |
| pytest-snapshot | latest | Alternative snapshot testing | Simpler alternative to syrupy if preferred |
| freezegun | latest | Time freezing | For testing date-dependent logic (meeting status, planned/occurred) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| syrupy | inline golden files (JSON fixtures) | Syrupy auto-updates snapshots with `--snapshot-update`; JSON fixtures require manual maintenance but are more explicit |
| responses | unittest.mock.patch | responses is purpose-built for HTTP mocking; patch works but is more verbose for request mocking |
| Vitest | Jest | Jest requires separate Babel config; Vitest shares Vite config and understands ESM natively |

**Installation (Pipeline):**
```bash
cd apps/pipeline && uv add --dev pytest-cov responses syrupy freezegun
```

**Installation (Web App):**
```bash
cd apps/web && pnpm add -D vitest @vitest/coverage-v8
```

## Architecture Patterns

### Recommended Test Structure

#### Pipeline (`apps/pipeline/tests/`)
```
tests/
├── conftest.py              # Shared fixtures: supabase mock, canonical meeting data, tmp dirs
├── fixtures/                 # Golden files, sample PDFs, JSON snapshots
│   ├── meeting_693/          # Canonical meeting fixture data
│   │   ├── refinement.json   # Known-good AI refinement output
│   │   ├── agenda_text.txt   # Raw agenda text
│   │   ├── minutes_text.txt  # Raw minutes text
│   │   └── transcript_segments.json  # Sample transcript segments
│   ├── gemini_responses/     # Captured AI responses for snapshot testing
│   │   ├── boundary_detection.json
│   │   └── stance_generation.json
│   └── sample_pdfs/          # Small test PDFs for extraction
├── core/                     # Pure function unit tests (existing + new)
│   ├── test_parser.py        # KEEP: Parser tests (5 tests)
│   ├── test_nlp.py           # KEEP: Name normalization tests (4 tests, rename to test_names.py)
│   ├── test_utils.py         # KEEP: Utility tests (3 tests)
│   ├── test_alignment.py     # NEW: Transcript-agenda alignment
│   ├── test_matter_matching.py  # NEW: Matter deduplication logic
│   └── test_paths.py         # NEW: Path resolution logic
├── ingestion/                # Ingestion phase tests
│   ├── test_ingester.py      # NEW: MeetingIngester logic (process_meeting, get_raw_texts, etc.)
│   ├── test_ai_refiner.py    # RESTRUCTURE: Merge existing agenda_only + refiner tests
│   ├── test_document_extractor.py  # NEW: Document extraction orchestrator
│   ├── test_gemini_extractor.py    # NEW: Gemini boundary/content extraction (mocked)
│   ├── test_embed.py         # NEW: Embedding generation (mocked OpenAI)
│   ├── test_audit.py         # NEW: Disk vs DB audit logic
│   └── test_image_extractor.py     # NEW: Image extraction
├── scrapers/                 # Scraper tests
│   ├── test_civicweb.py      # NEW: CivicWeb scraper (mocked HTTP)
│   └── test_base.py          # NEW: Base scraper, MunicipalityConfig
├── profiling/                # Profiling tests
│   ├── test_stance_generator.py  # NEW: Stance generation (mocked Gemini, snapshot outputs)
│   └── test_profile_agent.py     # NEW: Profile agent logic
├── video/                    # Video tests
│   └── test_vimeo.py         # NEW: Vimeo client (mocked HTTP)
├── orchestrator/             # Orchestrator integration tests
│   └── test_orchestrator.py  # NEW: Archiver class, phase coordination
└── integration/              # Phase-level integration tests
    └── test_ingest_meeting.py  # NEW: End-to-end single meeting ingestion (mocked externals)
```

#### Web App (`apps/web/tests/`)
```
tests/
├── setup.ts                  # Test setup (env vars, mocks)
├── services/
│   ├── meetings.test.ts      # Service function tests with mocked Supabase
│   ├── rag.test.ts           # RAG service with mocked Gemini + Supabase
│   └── hybrid-search.test.ts # Hybrid search with mocked Supabase RPCs
├── routes/
│   ├── api.ask.test.ts       # ASK API route (rate limiter, streaming response)
│   ├── api.search.test.ts    # Search API route (intent classification, routing)
│   └── api.subscribe.test.ts # Subscription API route (auth gating)
└── lib/
    ├── intent.test.ts         # Intent classifier (pure function, no mocks needed)
    └── supabase.test.ts       # Client initialization logic
```

### Pattern 1: Mocking External Services
**What:** Mock all external API calls (Supabase, Gemini, OpenAI, Vimeo, Nominatim) at the boundary, test internal logic directly.
**When to use:** All tests except explicitly marked integration tests.
**Example:**
```python
# conftest.py - Supabase mock fixture
import pytest
from unittest.mock import MagicMock

@pytest.fixture
def mock_supabase():
    """Create a mock Supabase client with chainable query builder."""
    client = MagicMock()
    # Make .table().select().eq().execute() chainable
    table_mock = MagicMock()
    table_mock.select.return_value = table_mock
    table_mock.eq.return_value = table_mock
    table_mock.in_.return_value = table_mock
    table_mock.lte.return_value = table_mock
    table_mock.or_.return_value = table_mock
    table_mock.single.return_value = table_mock
    table_mock.insert.return_value = table_mock
    table_mock.upsert.return_value = table_mock
    table_mock.update.return_value = table_mock
    table_mock.delete.return_value = table_mock
    table_mock.not_.is_.return_value = table_mock
    table_mock.range.return_value = table_mock
    table_mock.execute.return_value = MagicMock(data=[], count=0)
    client.table.return_value = table_mock
    return client

@pytest.fixture
def mock_gemini():
    """Create a mock Gemini client."""
    client = MagicMock()
    response = MagicMock()
    response.parsed = None  # Set per test
    client.models.generate_content.return_value = response
    return client
```

### Pattern 2: Golden-File Snapshot Testing
**What:** Capture known-good AI outputs and compare future runs against them.
**When to use:** AI-generated content (refinements, stances, document extraction).
**Example:**
```python
# Using syrupy for snapshot testing
def test_refinement_output_structure(snapshot, mock_gemini):
    """Verify AI refinement produces expected structure."""
    # Load known-good refinement from fixture
    with open("tests/fixtures/meeting_693/refinement.json") as f:
        known_good = json.load(f)

    mock_gemini.models.generate_content.return_value.parsed = MeetingRefinement(**known_good)

    result = refine_meeting_data(agenda_text, minutes_text, transcript_text)

    # Snapshot testing -- auto-creates/compares against stored snapshot
    assert result.model_dump() == snapshot
```

### Pattern 3: Fixture-Based Testing with Real Meeting Data
**What:** Use actual meeting data (ID 693: 2025-11-18 Regular Council) as the canonical test fixture.
**When to use:** Integration tests, data flow validation.
**Rationale for meeting 693:**
- Richest meeting in the database: 33 agenda items, 44 motions, 204 votes, 1086 transcript segments, 36 key statements
- Regular Council type (most common meeting type)
- Has all three inputs: agenda, minutes, transcript
- Has video URL
- 6 attendees with attendance records
- Has key statements across multiple categories
- Recent enough to represent current data patterns (2025-11-18)

### Pattern 4: Pre-Deploy Hook
**What:** Shell script that runs tests before allowing deploys.
**When to use:** Before `pnpm deploy` (web) and pipeline runs.
**Example:**
```bash
#!/bin/bash
# scripts/pre-deploy.sh
set -e

echo "=== Running Pipeline Tests ==="
cd apps/pipeline && uv run pytest --tb=short -q
echo ""

echo "=== Running Web Tests ==="
cd ../web && pnpm test run
echo ""

echo "All tests passed. Safe to deploy."
```

### Anti-Patterns to Avoid
- **Testing AI output verbatim:** AI outputs are non-deterministic. Test structure (has required fields, types are correct, values are within bounds) not exact text content.
- **Hitting real external APIs in tests:** Every test must mock Supabase, Gemini, OpenAI, Vimeo, and HTTP requests. Integration tests with real APIs are a future phase.
- **Giant test files:** Split by module boundary, not by test type. Each pipeline module gets its own test file.
- **Testing private methods directly:** Test through public interfaces. Exception: `_parse_agenda_lines` is already tested directly (it's effectively a public helper).
- **Ignoring the skipped test:** The `test_merge_refinements` is skipped due to a `SpeakerAlias` dict/model mismatch. Fix it as part of this phase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP request mocking | Manual urllib/requests patching | `responses` library | Handles redirects, error codes, request history, body matching |
| Snapshot comparisons | Custom JSON diff | `syrupy` or `pytest-snapshot` | Auto-updates, human-readable diffs, serializer support |
| Coverage reporting | Manual line counting | `pytest-cov` | HTML reports, branch coverage, excludes, CI integration |
| Supabase mock chains | Per-test mock setup | Shared `conftest.py` fixture | Supabase's chainable API needs careful mock setup; do it once |
| Time-dependent tests | Conditional date checks | `freezegun` | Deterministic date/time for meeting status logic |
| Temp directory management | Manual mkdir/cleanup | `pytest` `tmp_path` fixture | Auto-cleanup, unique per test, handles OS differences |

**Key insight:** The codebase has many external dependencies (Supabase, Gemini, OpenAI, Vimeo, Nominatim, local file system). The testing strategy must mock all of these consistently. Building a shared mock layer in `conftest.py` prevents every test file from reinventing mock chains.

## Common Pitfalls

### Pitfall 1: Supabase Mock Chain Breakage
**What goes wrong:** Supabase's query builder uses method chaining (`.table("x").select("y").eq("z", val).execute()`). If any link in the chain isn't mocked, the test silently returns a MagicMock instead of realistic data.
**Why it happens:** `MagicMock()` returns a new MagicMock for any attribute access, so broken chains don't raise errors -- they return garbage data.
**How to avoid:** Build a reusable mock factory in `conftest.py` that pre-configures all chain methods. Use `spec=` or `wraps=` for the client object. Assert `.execute()` was called.
**Warning signs:** Tests pass but assert on MagicMock objects instead of real data.

### Pitfall 2: AI Snapshot Brittleness
**What goes wrong:** Snapshot tests break on every trivial prompt change because AI outputs differ.
**Why it happens:** Snapshots capture exact output text, but AI generation is non-deterministic even with mocking if prompts change.
**How to avoid:** Snapshot the *structure* (field names, types, counts) not the *content* (exact text). For true golden-file testing, mock the AI response entirely and test the downstream processing.
**Warning signs:** Tests break after prompt wording changes that don't affect logic.

### Pitfall 3: Test Isolation Failure
**What goes wrong:** Tests pass individually but fail when run together because one test modifies global state.
**Why it happens:** The pipeline uses module-level singletons (`_client` in `gemini_extractor.py`, `client` in `ai_refiner.py`, `local_client` in `ai_refiner.py`).
**How to avoid:** Always patch at the module level (`@patch("pipeline.ingestion.ai_refiner.client")`), not at the import level. Use `autouse` fixtures to reset singletons between tests.
**Warning signs:** Tests pass with `pytest tests/path/test_file.py` but fail with `pytest`.

### Pitfall 4: File System Test Pollution
**What goes wrong:** Tests create files (refinement.json, agenda.md, minutes.md) in the real archive directory.
**Why it happens:** The ingester writes output files to `folder_path` which might point to actual archive data.
**How to avoid:** Always use `tmp_path` fixtures. Create temporary meeting folder structures. Never point tests at the real `viewroyal_archive/` directory.
**Warning signs:** `git status` shows unexpected modified/untracked files after running tests.

### Pitfall 5: Import Side Effects
**What goes wrong:** Importing pipeline modules triggers side effects (loading environment variables, initializing API clients, registering scrapers).
**Why it happens:** `config.py` calls `load_dotenv()` at module level. `ai_refiner.py` creates Gemini client at module level. `orchestrator.py` calls `register_scraper()` at module level.
**How to avoid:** Use `monkeypatch` to set environment variables before imports, or use `importlib.reload()` in fixtures. For client singletons, patch them after import.
**Warning signs:** Tests fail with "API key not set" errors even when mocking is in place.

### Pitfall 6: Vitest + Cloudflare Workers Compatibility
**What goes wrong:** Tests import modules that use Cloudflare-specific APIs (`process.env` replacement, Workers runtime).
**Why it happens:** `vite.config.ts` replaces `process.env.*` at build time. In test mode, these replacements may not apply.
**How to avoid:** Configure Vitest to use the same `define` block as the main config. Set env vars in the test setup file. Use `vi.mock()` for modules that depend on Workers runtime.
**Warning signs:** "process is not defined" or "supabaseUrl is undefined" errors in web tests.

## Code Examples

### Example 1: Testing MeetingIngester Pure Functions
```python
# tests/ingestion/test_ingester.py
import pytest
from pipeline.ingestion.ingester import MeetingIngester, to_seconds

class TestToSeconds:
    def test_float_passthrough(self):
        assert to_seconds(3600.0) == 3600.0

    def test_int_passthrough(self):
        assert to_seconds(120) == 120.0

    def test_hh_mm_ss(self):
        assert to_seconds("1:23:45") == 5025.0

    def test_mm_ss(self):
        assert to_seconds("5:30") == 330.0

    def test_none(self):
        assert to_seconds(None) is None

    def test_invalid_string(self):
        assert to_seconds("not a time") is None


class TestExtractIdentifier:
    @pytest.fixture
    def ingester(self):
        return MeetingIngester("http://test.url", "test-key", gemini_key=None)

    def test_bylaw_number(self, ingester):
        assert ingester.extract_identifier_from_text("Bylaw No. 1160") == "Bylaw 1160"

    def test_amendment_bylaw(self, ingester):
        result = ingester.extract_identifier_from_text("Amendment Bylaw No. 1101")
        assert result == "Bylaw 1101"

    def test_rezoning(self, ingester):
        result = ingester.extract_identifier_from_text("Rezoning Application No. 2025-01")
        assert result is not None
        assert "2025-01" in result

    def test_no_identifier(self, ingester):
        assert ingester.extract_identifier_from_text("Call to Order") is None

    def test_none_input(self, ingester):
        assert ingester.extract_identifier_from_text(None) is None


class TestNormalizeAddressList:
    @pytest.fixture
    def ingester(self):
        return MeetingIngester("http://test.url", "test-key", gemini_key=None)

    def test_none(self, ingester):
        assert ingester.normalize_address_list(None) == []

    def test_list_passthrough(self, ingester):
        assert ingester.normalize_address_list(["123 Main St"]) == ["123 Main St"]

    def test_multi_number_pattern(self, ingester):
        result = ingester.normalize_address_list("105, 106 and 107 Glentana Road")
        assert len(result) == 3
        assert "105 Glentana Road" in result

    def test_comma_separated(self, ingester):
        result = ingester.normalize_address_list("123 Main St, 456 Oak Ave")
        assert len(result) == 2
```

### Example 2: Testing Intent Classifier (Web App)
```typescript
// tests/lib/intent.test.ts
import { describe, it, expect } from "vitest";
import { classifyIntent } from "../../app/lib/intent";

describe("classifyIntent", () => {
  it("classifies question mark as question", () => {
    expect(classifyIntent("what about housing?")).toBe("question");
  });

  it("classifies question starters as question", () => {
    expect(classifyIntent("how did council vote")).toBe("question");
    expect(classifyIntent("who proposed the bylaw")).toBe("question");
  });

  it("classifies short queries as keyword", () => {
    expect(classifyIntent("tree bylaw")).toBe("keyword");
    expect(classifyIntent("parking")).toBe("keyword");
  });

  it("classifies empty as keyword", () => {
    expect(classifyIntent("")).toBe("keyword");
  });

  it("classifies long phrases as question", () => {
    expect(classifyIntent("council decision about housing density")).toBe("question");
  });

  it("handles 'tell me' starter", () => {
    expect(classifyIntent("tell me about the budget")).toBe("question");
  });
});
```

### Example 3: Mocking Gemini for AI Refiner Tests
```python
# tests/ingestion/test_ai_refiner.py
import pytest
from unittest.mock import patch, MagicMock
from pipeline.ingestion.ai_refiner import refine_meeting_data, MeetingRefinement

@pytest.fixture
def sample_refinement():
    """Return a valid MeetingRefinement with typical data."""
    return MeetingRefinement(
        scratchpad_speaker_map="Speaker_01: David Screech",
        scratchpad_timeline="1. Call to Order (0:00-0:30)",
        summary="Council discussed budget and bylaw amendments.",
        meeting_type="Regular Council",
        status="Completed",
        chair_person_name="David Screech",
        attendees=["David Screech", "Ron Mattson"],
        speaker_aliases=[],
        transcript_corrections=[],
        items=[]
    )

class TestRefineMeetingData:
    @patch("pipeline.ingestion.ai_refiner.client")
    def test_agenda_only_mode(self, mock_client, sample_refinement):
        """When only agenda is provided, should use agenda-only prompt."""
        sample_refinement.status = "Planned"
        mock_client.models.generate_content.return_value.parsed = sample_refinement

        result = refine_meeting_data("Agenda text here", "", "")
        assert result is not None
        assert result.status == "Planned"

    @patch("pipeline.ingestion.ai_refiner.client")
    def test_full_refinement(self, mock_client, sample_refinement):
        """With all three inputs, should use full refinement prompt."""
        mock_client.models.generate_content.return_value.parsed = sample_refinement

        result = refine_meeting_data("Agenda", "Minutes text", "Transcript text")
        assert result is not None
        assert result.meeting_type == "Regular Council"
        mock_client.models.generate_content.assert_called_once()

    @patch("pipeline.ingestion.ai_refiner.client")
    def test_gemini_failure_retries(self, mock_client):
        """Should retry up to 3 times on Gemini failure."""
        mock_client.models.generate_content.side_effect = Exception("API Error")

        result = refine_meeting_data("Agenda", "Minutes", "Transcript")
        assert result is None
        assert mock_client.models.generate_content.call_count == 3

    def test_no_api_key(self):
        """Should return None gracefully when no Gemini client is available."""
        with patch("pipeline.ingestion.ai_refiner.client", None):
            result = refine_meeting_data("Agenda", "Minutes", "Transcript")
            assert result is None
```

### Example 4: Pre-Deploy Hook Script
```bash
#!/bin/bash
# scripts/pre-deploy.sh
set -e

PIPELINE_DIR="$(cd "$(dirname "$0")/../apps/pipeline" && pwd)"
WEB_DIR="$(cd "$(dirname "$0")/../apps/web" && pwd)"

echo "================================"
echo "  Pre-deploy Test Gate"
echo "================================"
echo ""

echo "[1/2] Pipeline tests..."
cd "$PIPELINE_DIR"
uv run pytest --tb=short -q --ignore=tests/core/test_marker_ocr.py
echo ""

echo "[2/2] Web server tests..."
cd "$WEB_DIR"
pnpm test run 2>&1
echo ""

echo "All tests passed."
```

## Decisions on Discretion Areas

### External Service Handling Strategy
**Recommendation: Mock everything, no integration tests in this phase.**

All external services (Supabase, Gemini, OpenAI, Vimeo, Nominatim, R2) should be mocked. The rationale:
- Tests must run without API keys or network access
- Tests must be fast (< 30 seconds total)
- AI services are non-deterministic and rate-limited
- Supabase state would need setup/teardown between tests
- Integration tests against real services belong in a future CI phase

### Restructure vs Build On Existing Tests
**Recommendation: Keep existing tests, reorganize directory structure.**

The existing 7 test files are well-written and passing. Keep them in place but:
1. Move from `tests/core/` and `tests/pipeline/` into the new structure (keep `tests/core/` for pure function tests)
2. Fix the skipped `test_merge_refinements` (the SpeakerAlias dict/model mismatch)
3. Add `conftest.py` with shared fixtures
4. Do NOT break existing tests during reorganization

### Web App Server Layer Coverage
**Recommendation: Cover these high-value targets:**

1. **`app/lib/intent.ts`** -- Pure function, no mocks needed, easy wins, high impact (drives search routing)
2. **`app/routes/api.search.tsx`** -- Intent classification + routing logic, rate limiter
3. **`app/routes/api.ask.tsx`** -- Rate limiter logic, streaming response construction
4. **`app/services/meetings.ts`** -- Query builder with many filter options
5. **`app/routes/api.subscribe.tsx`** -- Auth gating, CRUD logic
6. **`app/lib/supabase.server.ts`** -- Client initialization edge cases

Skip: `rag.server.ts` (too deeply coupled to Gemini + Supabase RPCs), `hybrid-search.server.ts` (pure RPC wrapper), all UI routes.

### Schema/Migration Testing
**Recommendation: Skip for now.**

The database schema is managed through Supabase migrations. Testing migrations requires a test database instance, which adds infrastructure complexity. The existing `sql/bootstrap.sql` could theoretically be tested against a local Postgres, but:
- The schema is stable and rarely changes
- Supabase's migration system has its own validation
- This is better suited for the CI phase

### Full E2E vs Phase-Level Integration Tests
**Recommendation: Phase-level integration tests, not full E2E.**

A full E2E test (scrape -> diarize -> ingest -> embed) would require real files on disk, significant time, and many mocked services. Instead:
- Test each phase independently with mocked inputs/outputs
- Create ONE integration test that exercises `ingester.process_meeting()` with a mocked Supabase and pre-loaded fixture data
- This catches data flow issues without needing the full pipeline

### Test Reporting Format
**Recommendation: pytest-cov HTML reports + terminal summary.**

```ini
# pytest.ini additions
[pytest]
addopts = -v --tb=short --cov=pipeline --cov-report=term-missing --cov-report=html:coverage_html
```

For the web app:
```json
// vitest.config.ts
{
  "test": {
    "coverage": {
      "provider": "v8",
      "reporter": ["text", "html"],
      "include": ["app/services/**", "app/routes/api.*", "app/lib/intent.ts", "app/lib/supabase.server.ts"]
    }
  }
}
```

### Unified Root Test Command vs Separate
**Recommendation: Separate commands per app, with a convenience wrapper.**

Each app has its own test runner (pytest vs vitest) and its own configuration. A root-level script can run both:
```bash
# scripts/test-all.sh
cd apps/pipeline && uv run pytest "$@"
cd ../web && pnpm test run
```

But the primary workflow is running tests per-app since developers typically work in one context at a time.

### Canonical Test Meeting Selection
**Recommendation: Meeting ID 693 (2025-11-18 Regular Council Meeting).**

This meeting was selected because it has the richest data across all dimensions:
- **33 agenda items** (highest in the database)
- **44 motions** with **204 votes** (rich voting data)
- **1086 transcript segments** (substantial transcript)
- **36 key statements** (good for search testing)
- **6 attendees** with attendance records
- **1 document** with full text
- **Regular Council** type (most common, most complex processing path)
- Recent enough (2025-11-18) to represent current data patterns

Fixture data should be extracted from the live database and saved as JSON files in `tests/fixtures/meeting_693/`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| unittest | pytest | 2015+ | pytest is the standard; no need for unittest classes |
| manual mocking | pytest-mock + responses | Stable | Cleaner syntax, better error messages |
| manual coverage | pytest-cov | Stable | Integrated coverage reporting |
| Jest for TS | Vitest | 2022+ | Native ESM, Vite-compatible, faster |
| JSON fixture comparison | syrupy snapshot testing | 2021+ | Auto-update, better diffs, serializer support |

**Deprecated/outdated:**
- `nose`: Dead project, replaced by pytest
- `unittest.TestCase` subclassing: Unnecessary with pytest's function-based tests
- `coverage run` directly: Use `pytest-cov` wrapper instead

## Open Questions

1. **Marker OCR Test Strategy**
   - What we know: `test_marker_ocr.py` tests OCR on a specific scanned PDF that must exist on disk. It's slow and hardware-dependent (requires ML models).
   - What's unclear: Should this test remain as-is, be excluded from the standard suite, or be refactored?
   - Recommendation: Mark with `@pytest.mark.slow` and exclude from default runs. Include in a separate `pytest -m slow` command for when OCR changes are made.

2. **Vitest Configuration for Cloudflare Workers**
   - What we know: The web app runs on Cloudflare Workers with `process.env` replacements at build time. Vitest needs to handle this.
   - What's unclear: Whether Vitest's `environment: "miniflare"` (via `vitest-environment-miniflare`) is needed or if standard Node environment with mocked env vars suffices for server-layer tests.
   - Recommendation: Start with standard Node environment + env vars in setup file. Only add miniflare if tests hit Workers-specific issues. The server-layer tests (services, API routes) should work fine with mocked Supabase clients regardless of runtime.

3. **Fixture Data Extraction**
   - What we know: Meeting 693 data exists in the production database and would make excellent test fixtures.
   - What's unclear: Exact format and granularity for fixture extraction. Should we snapshot the entire meeting record or just the fields needed for specific tests?
   - Recommendation: Extract a focused subset: meeting record, first 5 agenda items with motions/votes, first 20 transcript segments, the refinement.json from disk. Keep fixtures small and targeted.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: All 7 existing test files read and analyzed
- Codebase analysis: All pipeline modules inspected for testable boundaries
- Codebase analysis: Web app routes and services inspected for server-layer coverage
- Database query: Meeting 693 verified as richest fixture candidate (33 items, 44 motions, 204 votes)
- pytest docs: Test configuration and fixtures (stable, well-known)
- Vitest docs: Configuration and Vite compatibility (stable, well-known)

### Secondary (MEDIUM confidence)
- syrupy: Snapshot testing approach based on established patterns
- responses library: HTTP mocking approach based on established patterns
- Vitest + Cloudflare Workers: Based on known patterns; specific edge cases may surface during implementation

### Tertiary (LOW confidence)
- Coverage target achievability: 80%+ is a target; actual achievability depends on how much of the pipeline code is pure logic vs external service calls. The diarization module (`pipeline/diarization/`) may be difficult to test without real audio files.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - pytest and Vitest are well-established; all tools already proven in this ecosystem
- Architecture: HIGH - Test structure follows standard Python/TypeScript conventions; fixture pattern proven
- Pitfalls: HIGH - Based on direct analysis of the codebase's external dependencies and singleton patterns
- Coverage target: MEDIUM - 80% is achievable for ingestion/core modules; diarization module may require exclusion

**Research date:** 2026-02-18
**Valid until:** 2026-04-18 (60 days -- testing tools are stable)
