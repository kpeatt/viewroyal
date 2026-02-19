"""Integration tests for MeetingIngester.process_meeting().

Exercises the full meeting ingestion flow end-to-end with all external
services mocked: Supabase, Gemini, VimeoClient, file I/O via tmp dirs.

Covers: happy path with precomputed refinement, no-documents path,
Gemini failure fallback, missing-transcript processing, dry run,
and already-ingested skip.
"""

import json
import os

import pytest
from unittest.mock import patch, MagicMock, call

from pipeline.ingestion.ingester import MeetingIngester


CHAINABLE_METHODS = [
    "select", "eq", "neq", "in_", "not_", "lte", "gte", "lt", "gt",
    "or_", "single", "insert", "upsert", "update", "delete",
    "range", "order", "limit", "is_", "ilike", "like", "filter",
    "contains", "contained_by", "overlap", "text_search",
]


def _make_table_mock(default_data=None, default_count=0):
    """Create a chainable Supabase table mock."""
    t = MagicMock()
    for method in CHAINABLE_METHODS:
        getattr(t, method).return_value = t
    data = default_data if default_data is not None else []
    t.execute.return_value = MagicMock(data=data, count=default_count)
    return t


@pytest.fixture
def per_table_supabase():
    """Supabase mock with per-table tracking of inserts/upserts.

    Pre-creates all tables that process_meeting touches so that
    _setup_supabase_responses can configure them before the test runs.

    Returns (client, tables) where tables is a dict mapping table name
    to a chainable MagicMock.
    """
    client = MagicMock()

    # Pre-create ALL tables that process_meeting interacts with
    table_names = [
        "meetings", "organizations", "people", "attendance",
        "meeting_speaker_aliases", "agenda_items", "motions", "votes",
        "key_statements", "transcript_segments", "documents",
        "extracted_documents", "memberships", "matters",
    ]
    tables = {name: _make_table_mock() for name in table_names}

    def table_router(name):
        if name not in tables:
            tables[name] = _make_table_mock()
        return tables[name]

    client.table.side_effect = table_router
    return client, tables


@pytest.fixture
def ingester(per_table_supabase):
    """Create MeetingIngester with mocked Supabase and no Gemini."""
    client, tables = per_table_supabase

    with patch("pipeline.ingestion.ingester.create_client", return_value=client):
        ing = MeetingIngester("http://test.url", "test-key", gemini_key=None)

    # Also mock the MatterMatcher to avoid real DB calls
    ing.matcher = MagicMock()
    ing.matcher.find_match.return_value = (None, "no_match", 0.0)

    return ing, tables


@pytest.fixture
def populated_archive(tmp_archive_dir, meeting_693_refinement):
    """Create a fully populated archive directory for meeting 693.

    Creates:
    - Folder named with date pattern for extract_meeting_metadata
    - agenda.md and minutes.md cached files
    - Audio/ directory with a transcript JSON
    - refinement.json with precomputed data
    """
    # Rename the tmp dir to match the expected date pattern
    meeting_dir = tmp_archive_dir.parent / "2025-11-18 Regular Council Meeting"
    tmp_archive_dir.rename(meeting_dir)

    # Create agenda.md
    agenda_text = """# Regular Council Meeting Agenda
## November 18, 2025

1. Call to Order
2. Approval of the Agenda
5.1 Public Participation - Traffic Concerns on Helmcken Road
8.1 Tree Protection Bylaw No. 1160 - Second and Third Readings
9.1 Annual Financial Report 2024-2025
""" + ("Padding content to exceed 100 chars. " * 5)
    (meeting_dir / "agenda.md").write_text(agenda_text)

    # Create minutes.md
    minutes_text = """# Regular Council Meeting Minutes
## November 18, 2025

Mayor Screech called the meeting to order at 7:00 PM.
All council members were present.

### 1. Call to Order
The meeting was called to order at 7:00 PM.

### 2. Approval of the Agenda
MOVED by Councillor Mattson, SECONDED by Councillor Kowalewich
THAT the agenda be approved as presented. CARRIED.

### 5.1 Public Participation - Helmcken Road
Three residents presented concerns about speeding on Helmcken Road.
""" + ("Additional minutes content for length. " * 10)
    (meeting_dir / "minutes.md").write_text(minutes_text)

    # Create Audio/ directory with transcript
    audio_dir = meeting_dir / "Audio"
    audio_dir.mkdir()
    transcript_segments = [
        {"speaker": "Speaker_01", "text": "Good evening, I call this meeting to order.", "start_time": 0.0, "end_time": 5.0},
        {"speaker": "Speaker_01", "text": "Can I have a motion to approve the agenda?", "start_time": 15.0, "end_time": 18.0},
        {"speaker": "Speaker_02", "text": "So moved.", "start_time": 18.5, "end_time": 19.5},
        {"speaker": "Speaker_03", "text": "Seconded.", "start_time": 19.5, "end_time": 20.5},
        {"speaker": "Speaker_01", "text": "All in favor? Carried.", "start_time": 21.0, "end_time": 23.0},
    ]
    (audio_dir / "2025-11-18_meeting.json").write_text(json.dumps(transcript_segments))

    # Save refinement.json
    (meeting_dir / "refinement.json").write_text(json.dumps(meeting_693_refinement))

    # Create Agenda/ subfolder (for _ingest_documents)
    agenda_folder = meeting_dir / "Agenda"
    agenda_folder.mkdir()

    return meeting_dir


def _setup_supabase_responses(tables):
    """Configure per-table Supabase mock responses for a standard happy-path run.

    Tables are already pre-created by the per_table_supabase fixture,
    so we just update their execute return values.
    """
    # organizations: return existing org (prevents insert path)
    tables["organizations"].execute.return_value = MagicMock(
        data=[{"id": 1}], count=1
    )

    # meetings: upsert/update returns meeting with id=693
    tables["meetings"].execute.return_value = MagicMock(
        data=[{"id": 693, "video_url": None, "meta": {}}], count=1
    )

    # people: always return an existing person
    tables["people"].execute.return_value = MagicMock(
        data=[{"id": 10}], count=1
    )

    # agenda_items: insert returns new item with id
    tables["agenda_items"].execute.return_value = MagicMock(
        data=[{"id": 5001}], count=1
    )

    # motions: insert returns new motion with id
    tables["motions"].execute.return_value = MagicMock(
        data=[{"id": 3001}], count=1
    )

    # documents: empty (no existing docs)
    tables["documents"].execute.return_value = MagicMock(data=[], count=0)

    # matters: return a new matter record when insert is called
    tables["matters"].execute.return_value = MagicMock(
        data=[{"id": 9001, "title": "test matter", "identifier": None}], count=1
    )

    # attendance, meeting_speaker_aliases, votes, key_statements: default empty OK
    # memberships: default empty OK


class TestIngestMeeting:
    """Integration tests for process_meeting() with all externals mocked."""

    def test_process_meeting_happy_path(
        self, ingester, populated_archive, meeting_693_refinement
    ):
        """Full meeting ingestion with precomputed refinement data.

        Verifies that process_meeting():
        1. Upserts the meeting record
        2. Processes agenda items from refinement
        3. Creates attendance records
        4. Creates speaker alias records
        5. Returns a result dict with meeting, attendance, and items
        """
        ing, tables = ingester
        _setup_supabase_responses(tables)

        with patch("pipeline.ingestion.ingester.VimeoClient") as mock_vimeo_cls:
            mock_vimeo = MagicMock()
            mock_vimeo.search_video.return_value = {
                "url": "https://vimeo.com/test/123"
            }
            mock_vimeo_cls.return_value = mock_vimeo

            with patch.object(ing, "_ingest_documents", return_value=0):
                with patch.object(ing, "_ingest_document_sections"):
                    with patch.object(ing, "_geocode_agenda_items", return_value=0):
                        result = ing.process_meeting(
                            str(populated_archive),
                            precomputed_refinement=meeting_693_refinement,
                        )

        # Verify result structure
        assert result is not None
        assert "meeting" in result
        assert "attendance" in result
        assert "items" in result

        # Verify the meeting was upserted
        assert tables["meetings"].upsert.called or tables["meetings"].update.called

        # Verify attendance records were created (6 attendees in refinement)
        assert tables["attendance"].upsert.called

        # Verify speaker aliases were created
        assert tables["meeting_speaker_aliases"].upsert.called

        # Verify agenda items were inserted
        assert tables["agenda_items"].insert.called

        # Verify motions were inserted (refinement has 2 motions across items)
        assert tables["motions"].insert.called

        # Verify the result contains the expected data
        assert len(result["attendance"]) == 6
        assert len(result["items"]) == 3

    def test_process_meeting_no_documents(self, ingester, tmp_path):
        """Meeting with no PDF documents should still process via cached text files.

        When there are no PDFs but agenda.md exists, process_meeting should
        still run and ingest items from precomputed refinement.
        """
        ing, tables = ingester
        _setup_supabase_responses(tables)

        # Create bare minimum directory structure with date in name
        meeting_dir = tmp_path / "2025-11-18 Regular Council Meeting"
        meeting_dir.mkdir()

        # Create minimal agenda.md (> 100 chars)
        (meeting_dir / "agenda.md").write_text(
            "# Agenda\n1. Call to Order\n2. Approval of Agenda\n"
            + ("Content padding for minimum length. " * 5)
        )

        # Supply a minimal precomputed refinement
        minimal_refinement = {
            "meeting_type": "Regular Council",
            "status": "Occurred",
            "summary": "Brief meeting.",
            "chair_person_name": None,
            "attendees": [],
            "speaker_aliases": [],
            "items": [
                {
                    "item_order": "1",
                    "title": "Call to Order",
                    "matter_identifier": None,
                    "matter_title": None,
                    "plain_english_summary": "Meeting called to order.",
                    "related_address": None,
                    "description": None,
                    "category": "Procedural",
                    "tags": [],
                    "financial_cost": None,
                    "funding_source": None,
                    "is_controversial": False,
                    "debate_summary": None,
                    "key_quotes": [],
                    "key_statements": [],
                    "discussion_start_time": None,
                    "discussion_end_time": None,
                    "motions": [],
                }
            ],
            "transcript_corrections": [],
        }

        with patch("pipeline.ingestion.ingester.VimeoClient") as mock_vimeo_cls:
            mock_vimeo = MagicMock()
            mock_vimeo.search_video.return_value = None
            mock_vimeo_cls.return_value = mock_vimeo

            with patch.object(ing, "_ingest_documents", return_value=0):
                with patch.object(ing, "_ingest_document_sections"):
                    with patch.object(ing, "_geocode_agenda_items", return_value=0):
                        result = ing.process_meeting(
                            str(meeting_dir),
                            precomputed_refinement=minimal_refinement,
                        )

        assert result is not None
        assert len(result["items"]) == 1
        assert result["items"][0]["title"] == "Call to Order"
        # No transcript means has_transcript should be False
        assert result["meeting"]["has_transcript"] is False

    def test_process_meeting_gemini_failure(self, ingester, tmp_path):
        """When Gemini fails and no precomputed refinement exists, process_meeting
        should attempt AI refinement, fail gracefully, and return None.
        """
        ing, tables = ingester
        _setup_supabase_responses(tables)

        # Create meeting directory with agenda and minutes
        meeting_dir = tmp_path / "2025-11-18 Regular Council Meeting"
        meeting_dir.mkdir()

        (meeting_dir / "agenda.md").write_text(
            "# Agenda\n1. Call to Order\n" + ("X" * 200)
        )
        (meeting_dir / "minutes.md").write_text(
            "# Minutes\nMayor called meeting to order.\n" + ("Y" * 200)
        )

        with patch("pipeline.ingestion.ingester.VimeoClient") as mock_vimeo_cls:
            mock_vimeo = MagicMock()
            mock_vimeo.search_video.return_value = None
            mock_vimeo_cls.return_value = mock_vimeo

            with patch.object(ing, "_ingest_documents", return_value=0):
                with patch.object(ing, "_ingest_document_sections"):
                    # Patch refine_meeting_data to simulate Gemini failure
                    with patch(
                        "pipeline.ingestion.ingester.refine_meeting_data",
                        return_value=None,
                    ):
                        result = ing.process_meeting(str(meeting_dir))

        # When refinement fails, process_meeting returns None
        assert result is None

    def test_process_meeting_missing_transcript(
        self, ingester, tmp_path, meeting_693_refinement
    ):
        """Meeting without transcript data should process agenda/minutes only.

        Verifies that items, motions, and votes are still created from
        refinement data even when no transcript segments exist.
        """
        ing, tables = ingester
        _setup_supabase_responses(tables)

        # Create directory with agenda/minutes but NO Audio folder
        meeting_dir = tmp_path / "2025-11-18 Regular Council Meeting"
        meeting_dir.mkdir()

        (meeting_dir / "agenda.md").write_text(
            "# Agenda\n1. Call to Order\n" + ("Content " * 30)
        )
        (meeting_dir / "minutes.md").write_text(
            "# Minutes\nMayor opened meeting.\n" + ("Content " * 30)
        )

        with patch("pipeline.ingestion.ingester.VimeoClient") as mock_vimeo_cls:
            mock_vimeo = MagicMock()
            mock_vimeo.search_video.return_value = None
            mock_vimeo_cls.return_value = mock_vimeo

            with patch.object(ing, "_ingest_documents", return_value=0):
                with patch.object(ing, "_ingest_document_sections"):
                    with patch.object(ing, "_geocode_agenda_items", return_value=0):
                        result = ing.process_meeting(
                            str(meeting_dir),
                            precomputed_refinement=meeting_693_refinement,
                        )

        assert result is not None
        # Should still have items from refinement
        assert len(result["items"]) == 3
        # No transcript
        assert result["meeting"]["has_transcript"] is False
        # But agenda and minutes should be detected
        assert result["meeting"]["has_agenda"] is True
        assert result["meeting"]["has_minutes"] is True
        # Items should still be inserted
        assert tables["agenda_items"].insert.called
        # Motions should still be inserted (from refinement data)
        assert tables["motions"].insert.called

    def test_process_meeting_dry_run(
        self, ingester, populated_archive, meeting_693_refinement
    ):
        """Dry run should not make any Supabase writes."""
        ing, tables = ingester

        with patch.object(ing, "_ingest_documents", return_value=0):
            with patch.object(ing, "_ingest_document_sections"):
                with patch.object(ing, "_geocode_agenda_items", return_value=0):
                    result = ing.process_meeting(
                        str(populated_archive),
                        dry_run=True,
                        precomputed_refinement=meeting_693_refinement,
                    )

        # Dry run still returns data
        assert result is not None
        # But no actual DB writes should happen
        assert not tables["attendance"].upsert.called
        assert not tables["transcript_segments"].insert.called

    def test_process_meeting_already_ingested(self, ingester, populated_archive):
        """When meeting already exists in DB, should skip and return None."""
        ing, tables = ingester

        # Configure meetings table to report meeting already exists
        tables["meetings"].execute.return_value = MagicMock(
            data=[{"id": 693}], count=1
        )

        result = ing.process_meeting(str(populated_archive))

        # Should return None because meeting was already ingested
        assert result is None
