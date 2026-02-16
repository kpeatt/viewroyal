# Testing Patterns

**Analysis Date:** 2026-02-16

## Test Framework

**Runner:**
- pytest 9.0.2+ (Python)
- Config: `apps/pipeline/pytest.ini`

**Assertion Library:**
- pytest assertions (built-in)
- `unittest.mock` for mocking

**Run Commands (from `apps/pipeline/`):**
```bash
uv run pytest                                    # Run all tests
uv run pytest tests/core/test_parser.py -v      # Single test file with verbose
uv run pytest -k "test_extract_meeting"          # Tests matching pattern
```

**TypeScript/Web App:**
- No test framework detected (vitest/jest not configured)
- Development via `pnpm run dev` (Vite dev server)
- Type safety via `pnpm run typecheck` (React Router typegen + tsc strict)

## Test File Organization

**Location:**
- `apps/pipeline/tests/` directory parallel to source code
- Pattern: tests co-located by feature/module

**Naming:**
- `test_*.py` (prefix style)
  - Example: `test_parser.py`, `test_ingester_logic.py`, `test_utils.py`

**Structure:**
```
apps/pipeline/
├── tests/
│   ├── core/                    # Low-level utility tests
│   │   ├── test_parser.py
│   │   ├── test_utils.py
│   │   ├── test_nlp.py
│   │   └── test_marker_ocr.py
│   └── pipeline/                # Feature/integration tests
│       ├── test_ingester_logic.py
│       ├── test_local_refiner_logic.py
│       └── test_agenda_only.py
```

## Test Structure

**Suite Organization:**
```python
# tests/core/test_parser.py
from pipeline import parser

def test_extract_meeting_metadata_regular():
    path = "viewroyal_archive/Committee of the Whole/2023/01/2023-01-10 Committee of the Whole"
    meta = parser.extract_meeting_metadata(path)
    assert meta["meeting_date"] == "2023-01-10"
    assert meta["meeting_type"] == "Committee of the Whole"
    assert meta["title"] == "Committee of the Whole"

def test_extract_meeting_metadata_invalid():
    path = "viewroyal_archive/Random/Folder"
    meta = parser.extract_meeting_metadata(path)
    assert meta is None
```

**Patterns:**
- No setup/teardown (fixtures used when needed)
- Direct function calls with known inputs
- Multiple test cases per feature (positive, negative, edge cases)
- Test names describe the scenario: `test_<function>_<condition>`

## Mocking

**Framework:**
- `unittest.mock.MagicMock` for creating mock objects
- `pytest-mock` plugin (version 3.15.1+)

**Patterns:**
```python
# tests/pipeline/test_ingester_logic.py
from unittest.mock import MagicMock
from pipeline.ingestion.ingester import MeetingIngester

def test_map_type_to_org():
    # Mocking Supabase and Gemini to avoid network calls during logic tests
    ingester = MeetingIngester("http://test.url", "test-key", gemini_key=None)

    # Assert logic without external dependencies
    assert ingester.map_type_to_org("Regular Council") == ("Council", "Council")
    assert ingester.map_type_to_org("Board of Variance") == ("Board of Variance", "Board")
```

**What to Mock:**
- Database connections (Supabase client)
- API clients (Gemini, OpenAI, Vimeo)
- External HTTP calls
- Heavy computation (diarization, OCR)

**What NOT to Mock:**
- Core parsing logic (date extraction, text parsing)
- Data transformation functions
- Type validation

## Fixtures and Factories

**Test Data:**
- Hardcoded test inputs as inline strings in tests
  ```python
  def test_parse_agenda_lines_simple():
      lines = [
          "1. Call to Order",
          "2. Approval of Agenda",
          "3.1 Minutes of Previous Meeting",
          "Random Noise"
      ]
      items = parser._parse_agenda_lines(lines)
      assert len(items) == 3
  ```

**Location:**
- No shared fixture files detected
- Test data embedded directly in test functions
- Database test paths hardcoded: `"viewroyal_archive/Committee of the Whole/2023/01/2023-01-10 Committee of the Whole"`

## Coverage

**Requirements:**
- No coverage target enforced; tests written for critical logic
- Focus: Parsing logic, data transformation, type mapping

**View Coverage:**
```bash
# Not configured; use pytest-cov plugin manually if needed:
uv run pytest --cov=pipeline tests/
```

## Test Types

**Unit Tests (primary):**
- `tests/core/` directory — pure functions with deterministic outputs
  - `test_parser.py`: meeting metadata extraction, agenda line parsing
  - `test_utils.py`: filename sanitization, date extraction, type normalization
  - `test_nlp.py`: person name cleaning, role extraction
  - `test_marker_ocr.py`: PDF text detection fallbacks
- Scope: Single function, no external dependencies
- Pattern: Input → Function → Assert output

**Integration Tests (limited):**
- `tests/pipeline/test_ingester_logic.py`: Ingester class methods and mappings
  - Tests logic without network calls (mocks Supabase)
- `tests/pipeline/test_local_refiner_logic.py`: Data refinement merging
- Scope: Class methods with business logic

**E2E Tests:**
- Not implemented
- Would require full pipeline with real data/Supabase

## Common Patterns

**Async Testing:**
- Not used; Python tests are synchronous
- Async ingestion/database calls tested via mocking (sync wrapper code)

**Error Testing:**
```python
def test_extract_meeting_metadata_invalid():
    path = "viewroyal_archive/Random/Folder"
    meta = parser.extract_meeting_metadata(path)
    assert meta is None  # Returns None on invalid input, no exception
```

**Parametrization:**
- Not extensively used; separate test functions for variations
  ```python
  def test_extract_date_from_string():
      # YYYY-MM-DD
      assert utils.extract_date_from_string("2023-01-15 Council Meeting") == "2023-01-15"
      # Text formats
      assert utils.extract_date_from_string("January 15, 2023") == "2023-01-15"
  ```

## TypeScript/Web App Testing

**Status:**
- No test framework configured (vitest/jest not in devDependencies)
- Type safety via `tsc` strict mode
- Route/component testing done manually or via dev server

**Type Checking:**
```bash
pnpm run typecheck  # Runs react-router typegen + tsc strict
```

## Test Configuration

**pytest.ini:**
```ini
[pytest]
pythonpath = .
testpaths = tests
python_files = test_*.py
addopts = -v --tb=short
```

- `pythonpath = .`: Allows imports like `from pipeline import parser`
- `testpaths = tests`: Only discover tests in `tests/` directory
- `python_files = test_*.py`: Naming convention
- `-v`: Verbose output
- `--tb=short`: Short traceback format on failures

## Running Tests

**All tests:**
```bash
cd /Users/kyle/development/viewroyal/apps/pipeline
uv run pytest
```

**Specific test file:**
```bash
uv run pytest tests/core/test_parser.py -v
```

**Watch mode:**
- Not configured; pytest doesn't have native watch (use with `pytest-watch` if needed)

**Examples from codebase:**
```python
# test_parser.py
def test_parse_agenda_lines_split():
    lines = [
        "4.",
        "Public Participation",
        "5.1",
        "Bylaw Report"
    ]
    items = parser._parse_agenda_lines(lines)
    assert len(items) == 2
    assert items[0]["item_order"] == "4"
    assert items[0]["title"] == "Public Participation"

# test_utils.py
def test_sanitize_filename():
    assert utils.sanitize_filename("Meeting / Date: 2023") == "Meeting _ Date_ 2023"
    assert utils.sanitize_filename("CleanName") == "CleanName"

# test_ingester_logic.py (with mocking)
def test_map_advisory_committee_from_title():
    ingester = MeetingIngester("http://test.url", "test-key", gemini_key=None)
    meeting_data = {"title": "2023-01-01 Official Community Plan Review Advisory Committee"}

    refined_type = "Advisory Committee"
    target_org_name, target_org_class = ingester.map_type_to_org(refined_type)

    # Apply special override logic
    if refined_type == "Advisory Committee":
        for candidate_org in ["Official Community Plan Review Advisory Committee", ...]:
            if candidate_org.lower() in meeting_data["title"].lower():
                target_org_name = candidate_org
                target_org_class = "Advisory Committee"
                break

    assert target_org_name == "Official Community Plan Review Advisory Committee"
```

---

*Testing analysis: 2026-02-16*
