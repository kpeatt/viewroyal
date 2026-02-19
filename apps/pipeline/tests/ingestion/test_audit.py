"""Tests for pipeline.ingestion.audit module.

Covers: check_disk_documents, find_meetings_needing_reingest
"""

import os
import pytest
from unittest.mock import patch, MagicMock

from pipeline.ingestion.audit import check_disk_documents, find_meetings_needing_reingest


# --- check_disk_documents ---


class TestCheckDiskDocuments:
    def test_nonexistent_folder(self):
        result = check_disk_documents("/nonexistent/path/to/meeting")
        assert result["has_agenda"] is False
        assert result["has_minutes"] is False
        assert result["has_transcript"] is False
        assert result["has_refinement"] is False

    def test_empty_folder(self, tmp_path):
        result = check_disk_documents(str(tmp_path))
        assert result["has_agenda"] is False
        assert result["has_minutes"] is False
        assert result["has_transcript"] is False

    def test_with_agenda_pdf(self, tmp_path):
        agenda_dir = tmp_path / "Agenda"
        agenda_dir.mkdir()
        (agenda_dir / "agenda.pdf").write_bytes(b"%PDF-1.4 test")
        result = check_disk_documents(str(tmp_path))
        assert result["has_agenda"] is True
        assert len(result["agenda_files"]) == 1

    def test_with_agenda_md(self, tmp_path):
        (tmp_path / "agenda.md").write_text("# Agenda\n\nContent here")
        result = check_disk_documents(str(tmp_path))
        assert result["has_agenda"] is True
        assert result["has_agenda_md"] is True

    def test_with_minutes_pdf(self, tmp_path):
        minutes_dir = tmp_path / "Minutes"
        minutes_dir.mkdir()
        (minutes_dir / "minutes.pdf").write_bytes(b"%PDF-1.4 test")
        result = check_disk_documents(str(tmp_path))
        assert result["has_minutes"] is True
        assert len(result["minutes_files"]) == 1

    def test_with_minutes_md(self, tmp_path):
        (tmp_path / "minutes.md").write_text("# Minutes\n\nContent")
        result = check_disk_documents(str(tmp_path))
        assert result["has_minutes"] is True
        assert result["has_minutes_md"] is True

    def test_with_transcript_json(self, tmp_path):
        audio_dir = tmp_path / "Audio"
        audio_dir.mkdir()
        (audio_dir / "meeting_transcript.json").write_text("[]")
        result = check_disk_documents(str(tmp_path))
        assert result["has_transcript"] is True

    def test_with_transcript_json_direct(self, tmp_path):
        (tmp_path / "transcript.json").write_text("[]")
        result = check_disk_documents(str(tmp_path))
        assert result["has_transcript"] is True

    def test_with_transcript_clean_md(self, tmp_path):
        (tmp_path / "transcript_clean.md").write_text("Transcript content")
        result = check_disk_documents(str(tmp_path))
        assert result["has_transcript"] is True

    def test_with_shared_media(self, tmp_path):
        (tmp_path / "shared_media.json").write_text('{"canonical_folder": "../other"}')
        result = check_disk_documents(str(tmp_path))
        assert result["has_transcript"] is True

    def test_with_refinement(self, tmp_path):
        (tmp_path / "refinement.json").write_text("{}")
        result = check_disk_documents(str(tmp_path))
        assert result["has_refinement"] is True

    def test_audio_raw_files_excluded(self, tmp_path):
        audio_dir = tmp_path / "Audio"
        audio_dir.mkdir()
        (audio_dir / "raw_recording.json").write_text("[]")
        result = check_disk_documents(str(tmp_path))
        # raw_ files should be filtered out
        assert len(result["transcript_files"]) == 0

    def test_with_html_agenda(self, tmp_path):
        agenda_dir = tmp_path / "Agenda"
        agenda_dir.mkdir()
        (agenda_dir / "agenda.html").write_text("<html>Agenda</html>")
        result = check_disk_documents(str(tmp_path))
        assert result["has_agenda"] is True

    def test_full_meeting_folder(self, tmp_path):
        """Test with a complete meeting folder."""
        # Create Agenda
        agenda_dir = tmp_path / "Agenda"
        agenda_dir.mkdir()
        (agenda_dir / "agenda.pdf").write_bytes(b"%PDF")
        # Create Minutes
        minutes_dir = tmp_path / "Minutes"
        minutes_dir.mkdir()
        (minutes_dir / "minutes.pdf").write_bytes(b"%PDF")
        # Create Audio with transcript
        audio_dir = tmp_path / "Audio"
        audio_dir.mkdir()
        (audio_dir / "meeting.json").write_text("[]")
        # Create refinement
        (tmp_path / "refinement.json").write_text("{}")
        # Create cached md
        (tmp_path / "agenda.md").write_text("# Agenda")
        (tmp_path / "minutes.md").write_text("# Minutes")

        result = check_disk_documents(str(tmp_path))
        assert result["has_agenda"] is True
        assert result["has_minutes"] is True
        assert result["has_transcript"] is True
        assert result["has_refinement"] is True
        assert result["has_agenda_md"] is True
        assert result["has_minutes_md"] is True


# --- find_meetings_needing_reingest ---


class TestFindMeetingsNeedingReingest:
    def test_no_meetings_returns_empty(self, mock_supabase):
        mock_supabase.table.return_value.execute.return_value = MagicMock(data=[])
        result = find_meetings_needing_reingest(mock_supabase)
        assert result == []

    def test_meeting_with_new_agenda_on_disk(self, mock_supabase, tmp_path):
        """Meeting claims no agenda in DB, but agenda exists on disk."""
        # Create agenda on disk
        agenda_dir = tmp_path / "Agenda"
        agenda_dir.mkdir()
        (agenda_dir / "agenda.pdf").write_bytes(b"%PDF-test")

        mock_supabase.table.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": 1,
                    "archive_path": str(tmp_path),
                    "meeting_date": "2025-01-01",
                    "type": "Regular Council",
                    "status": "Occurred",
                    "has_agenda": False,
                    "has_minutes": False,
                    "has_transcript": False,
                }
            ]
        )

        result = find_meetings_needing_reingest(mock_supabase)
        assert len(result) == 1
        assert any("New agenda" in r for r in result[0]["reasons"])

    def test_meeting_up_to_date(self, mock_supabase, tmp_path):
        """Meeting with matching DB and disk state should not need reingest."""
        # Empty folder -- no documents
        mock_supabase.table.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": 2,
                    "archive_path": str(tmp_path),
                    "meeting_date": "2025-01-01",
                    "type": "Regular Council",
                    "status": "Occurred",
                    "has_agenda": False,
                    "has_minutes": False,
                    "has_transcript": False,
                }
            ]
        )

        result = find_meetings_needing_reingest(mock_supabase)
        assert len(result) == 0

    def test_missing_refinement_flagged(self, mock_supabase, tmp_path):
        """Meeting with documents but no refinement should be flagged."""
        # Create agenda without refinement
        agenda_dir = tmp_path / "Agenda"
        agenda_dir.mkdir()
        (agenda_dir / "agenda.pdf").write_bytes(b"%PDF-test")

        mock_supabase.table.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": 3,
                    "archive_path": str(tmp_path),
                    "meeting_date": "2025-01-01",
                    "type": "Regular Council",
                    "status": "Occurred",
                    "has_agenda": True,
                    "has_minutes": False,
                    "has_transcript": False,
                }
            ]
        )

        result = find_meetings_needing_reingest(mock_supabase)
        assert len(result) == 1
        assert any("refinement" in r.lower() for r in result[0]["reasons"])

    def test_status_upgrade_detected(self, mock_supabase, tmp_path):
        """Meeting with minutes+transcript on disk but Occurred status."""
        minutes_dir = tmp_path / "Minutes"
        minutes_dir.mkdir()
        (minutes_dir / "minutes.pdf").write_bytes(b"%PDF-test")
        (tmp_path / "transcript.json").write_text("[]")
        (tmp_path / "refinement.json").write_text("{}")

        mock_supabase.table.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": 4,
                    "archive_path": str(tmp_path),
                    "meeting_date": "2025-01-01",
                    "type": "Regular Council",
                    "status": "Occurred",
                    "has_agenda": False,
                    "has_minutes": True,
                    "has_transcript": True,
                }
            ]
        )

        result = find_meetings_needing_reingest(mock_supabase)
        assert len(result) == 1
        assert any("Completed" in r for r in result[0]["reasons"])

    def test_no_archive_path_skipped(self, mock_supabase):
        """Meetings without archive_path are skipped."""
        mock_supabase.table.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "id": 5,
                    "archive_path": None,
                    "meeting_date": "2025-01-01",
                    "type": "Regular Council",
                    "status": "Occurred",
                    "has_agenda": False,
                    "has_minutes": False,
                    "has_transcript": False,
                }
            ]
        )

        result = find_meetings_needing_reingest(mock_supabase)
        assert len(result) == 0
