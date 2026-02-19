"""
Shared test fixtures for the pipeline test suite.

Provides:
- fixtures_dir: Path to test fixture data
- meeting_693_data: Canonical meeting record (2025-11-18 Regular Council)
- meeting_693_agenda_items: First 5 agenda items with motions and votes
- meeting_693_transcript: First 20 transcript segments
- meeting_693_refinement: AI refinement output for meeting 693
- mock_supabase: Chainable Supabase client mock
- mock_gemini: Mock Gemini client with generate_content
- tmp_archive_dir: Temporary archive directory structure
"""

import json
import os

import pytest
from pathlib import Path
from unittest.mock import MagicMock

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def fixtures_dir():
    """Return path to the test fixtures directory."""
    return FIXTURES_DIR


@pytest.fixture
def meeting_693_data():
    """Canonical meeting record for meeting 693 (2025-11-18 Regular Council)."""
    with open(FIXTURES_DIR / "meeting_693" / "meeting.json") as f:
        return json.load(f)


@pytest.fixture
def meeting_693_agenda_items():
    """First 5 agenda items for meeting 693 with nested motions and votes."""
    with open(FIXTURES_DIR / "meeting_693" / "agenda_items.json") as f:
        return json.load(f)


@pytest.fixture
def meeting_693_transcript():
    """First 20 transcript segments for meeting 693."""
    with open(FIXTURES_DIR / "meeting_693" / "transcript_segments.json") as f:
        return json.load(f)


@pytest.fixture
def meeting_693_refinement():
    """AI refinement output for meeting 693."""
    with open(FIXTURES_DIR / "meeting_693" / "refinement.json") as f:
        return json.load(f)


@pytest.fixture
def mock_supabase():
    """Chainable Supabase client mock.

    Supports the full fluent query builder API:
        client.table("x").select("y").eq("z", val).execute()

    Default execute() returns empty data. Override per test:
        mock_supabase.table.return_value.execute.return_value = MagicMock(data=[...], count=1)
    """
    client = MagicMock()
    table_mock = MagicMock()

    # All chainable methods return self for fluent API
    for method in [
        "select", "eq", "neq", "in_", "not_", "lte", "gte", "lt", "gt",
        "or_", "single", "insert", "upsert", "update", "delete",
        "range", "order", "limit", "is_", "ilike", "like", "filter",
        "contains", "contained_by", "overlap", "text_search",
    ]:
        getattr(table_mock, method).return_value = table_mock

    table_mock.execute.return_value = MagicMock(data=[], count=0)
    client.table.return_value = table_mock

    # Also support client.rpc()
    rpc_mock = MagicMock()
    rpc_mock.execute.return_value = MagicMock(data=[])
    client.rpc.return_value = rpc_mock

    # Support client.storage
    storage_mock = MagicMock()
    client.storage.from_.return_value = storage_mock

    return client


@pytest.fixture
def mock_gemini():
    """Mock Gemini client with generate_content.

    Default returns empty parsed response. Override per test:
        mock_gemini.models.generate_content.return_value.parsed = MyModel(...)
    """
    client = MagicMock()
    response = MagicMock()
    response.parsed = None
    response.text = ""
    client.models.generate_content.return_value = response
    return client


@pytest.fixture
def tmp_archive_dir(tmp_path):
    """Create a temporary archive directory structure for a fake meeting.

    Returns a Path to a meeting directory like:
        /tmp/pytest-xxx/2025-11-18_regular-council/

    Useful for testing ingester file I/O without touching the real archive.
    """
    meeting_dir = tmp_path / "2025-11-18_regular-council"
    meeting_dir.mkdir()
    return meeting_dir
