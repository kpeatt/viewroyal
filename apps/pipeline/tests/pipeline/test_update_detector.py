"""Tests for pipeline.update_detector -- UpdateDetector, MeetingChange, ChangeReport."""

import os

import pytest
from unittest.mock import patch, MagicMock

from pipeline.update_detector import UpdateDetector, ChangeReport, MeetingChange


# ── Document Change Detection ─────────────────────────────────────────


class TestDetectDocumentChanges:
    def test_finds_new_minutes(self, mock_supabase):
        """Meetings with new documents on disk should appear in results."""
        audit_results = [
            {
                "id": 42,
                "archive_path": "viewroyal_archive/Council/2025/01/2025-01-15 Regular Council",
                "meeting_date": "2025-01-15",
                "meeting_type": "Regular Council",
                "status": "Occurred",
                "reasons": ["New minutes found on disk"],
                "disk": {"has_agenda": True, "has_minutes": True, "has_transcript": False},
                "db": {"has_agenda": True, "has_minutes": False, "has_transcript": False},
            }
        ]

        with patch(
            "pipeline.update_detector.find_meetings_needing_reingest",
            return_value=audit_results,
        ):
            detector = UpdateDetector(archive_root="/tmp/archive")
            changes = detector.detect_document_changes(supabase=mock_supabase)

        assert len(changes) == 1
        assert changes[0].change_type == "new_documents"
        assert changes[0].meeting_date == "2025-01-15"
        assert changes[0].meeting_type == "Regular Council"
        assert "New minutes found on disk" in changes[0].details

    def test_no_changes_returns_empty(self, mock_supabase):
        """When audit finds nothing, detection should return empty list."""
        with patch(
            "pipeline.update_detector.find_meetings_needing_reingest",
            return_value=[],
        ):
            detector = UpdateDetector(archive_root="/tmp/archive")
            changes = detector.detect_document_changes(supabase=mock_supabase)

        assert changes == []

    def test_no_supabase_returns_empty(self):
        """Without a Supabase client, document detection should return empty."""
        detector = UpdateDetector(archive_root="/tmp/archive")
        changes = detector.detect_document_changes(supabase=None)
        assert changes == []

    def test_filters_non_document_reasons(self, mock_supabase):
        """Meetings with only status-upgrade reasons should be excluded."""
        audit_results = [
            {
                "id": 99,
                "archive_path": "viewroyal_archive/Council/2025/02/2025-02-01 Regular Council",
                "meeting_date": "2025-02-01",
                "meeting_type": "Regular Council",
                "status": "Occurred",
                "reasons": ["Could upgrade status to Completed", "Missing refinement.json (AI processing needed)"],
                "disk": {"has_agenda": True, "has_minutes": True, "has_transcript": True},
                "db": {"has_agenda": True, "has_minutes": True, "has_transcript": True},
            }
        ]

        with patch(
            "pipeline.update_detector.find_meetings_needing_reingest",
            return_value=audit_results,
        ):
            detector = UpdateDetector(archive_root="/tmp/archive")
            changes = detector.detect_document_changes(supabase=mock_supabase)

        assert changes == []


# ── Video Change Detection ────────────────────────────────────────────


class TestDetectVideoChanges:
    def test_finds_new_video(self, tmp_path):
        """Meeting with Vimeo video but no audio should be detected."""
        # Create archive structure: meeting folder with Agenda but no Audio
        meeting_dir = tmp_path / "Council" / "2025" / "01" / "2025-01-15 Regular Council"
        agenda_dir = meeting_dir / "Agenda"
        agenda_dir.mkdir(parents=True)
        (agenda_dir / "agenda.pdf").write_bytes(b"fake pdf")

        mock_vimeo = MagicMock()
        mock_vimeo.get_video_map.return_value = {
            "2025-01-15": [
                {
                    "url": "https://vimeo.com/123",
                    "title": "Regular Council Meeting January 15, 2025",
                    "uri": "/videos/123",
                    "duration": 3600,
                }
            ]
        }

        detector = UpdateDetector(
            archive_root=str(tmp_path),
            vimeo_client=mock_vimeo,
        )
        changes = detector.detect_video_changes()

        assert len(changes) == 1
        assert changes[0].change_type == "new_video"
        assert changes[0].meeting_date == "2025-01-15"
        assert "Vimeo video available" in changes[0].details[0]

    def test_skips_meeting_with_existing_audio(self, tmp_path):
        """Meeting with existing audio files should NOT be flagged."""
        meeting_dir = tmp_path / "Council" / "2025" / "01" / "2025-01-15 Regular Council"
        agenda_dir = meeting_dir / "Agenda"
        agenda_dir.mkdir(parents=True)
        (agenda_dir / "agenda.pdf").write_bytes(b"fake pdf")

        # Add existing audio
        audio_dir = meeting_dir / "Audio"
        audio_dir.mkdir()
        (audio_dir / "meeting.mp3").write_bytes(b"fake audio")

        mock_vimeo = MagicMock()
        mock_vimeo.get_video_map.return_value = {
            "2025-01-15": [
                {
                    "url": "https://vimeo.com/123",
                    "title": "Regular Council Meeting January 15, 2025",
                    "uri": "/videos/123",
                    "duration": 3600,
                }
            ]
        }

        detector = UpdateDetector(
            archive_root=str(tmp_path),
            vimeo_client=mock_vimeo,
        )
        changes = detector.detect_video_changes()

        assert len(changes) == 0

    def test_skips_meeting_with_existing_transcript(self, tmp_path):
        """Meeting with existing transcript JSON should NOT be flagged."""
        meeting_dir = tmp_path / "Council" / "2025" / "01" / "2025-01-15 Regular Council"
        agenda_dir = meeting_dir / "Agenda"
        agenda_dir.mkdir(parents=True)

        # Add diarized JSON in Audio/
        audio_dir = meeting_dir / "Audio"
        audio_dir.mkdir()
        (audio_dir / "meeting_diarized.json").write_text("{}")

        mock_vimeo = MagicMock()
        mock_vimeo.get_video_map.return_value = {
            "2025-01-15": [
                {
                    "url": "https://vimeo.com/123",
                    "title": "Meeting January 15, 2025",
                    "uri": "/videos/123",
                    "duration": 3600,
                }
            ]
        }

        detector = UpdateDetector(
            archive_root=str(tmp_path),
            vimeo_client=mock_vimeo,
        )
        changes = detector.detect_video_changes()

        assert len(changes) == 0

    def test_no_vimeo_videos_returns_empty(self, tmp_path):
        """When Vimeo has no videos, detection should return empty."""
        meeting_dir = tmp_path / "Council" / "2025" / "01" / "2025-01-15 Regular Council"
        agenda_dir = meeting_dir / "Agenda"
        agenda_dir.mkdir(parents=True)

        mock_vimeo = MagicMock()
        mock_vimeo.get_video_map.return_value = {}

        detector = UpdateDetector(
            archive_root=str(tmp_path),
            vimeo_client=mock_vimeo,
        )
        changes = detector.detect_video_changes()

        assert changes == []

    def test_no_vimeo_client_returns_empty(self, tmp_path):
        """Without a Vimeo client, video detection should return empty."""
        detector = UpdateDetector(archive_root=str(tmp_path))
        changes = detector.detect_video_changes()
        assert changes == []


# ── Combined Report ───────────────────────────────────────────────────


class TestDetectAllChanges:
    def test_combines_both_detection_types(self, tmp_path, mock_supabase):
        """detect_all_changes should combine document and video changes."""
        doc_change = MeetingChange(
            archive_path="/archive/meeting1",
            meeting_date="2025-01-15",
            meeting_type="Regular Council",
            change_type="new_documents",
            details=["New minutes found on disk"],
        )
        video_change = MeetingChange(
            archive_path="/archive/meeting2",
            meeting_date="2025-02-01",
            meeting_type="Committee of the Whole",
            change_type="new_video",
            details=["Vimeo video available: COW Feb 1 2025"],
        )

        detector = UpdateDetector(archive_root=str(tmp_path))

        with patch.object(
            detector, "detect_document_changes", return_value=[doc_change]
        ), patch.object(
            detector, "detect_video_changes", return_value=[video_change]
        ):
            report = detector.detect_all_changes(supabase=mock_supabase)

        assert isinstance(report, ChangeReport)
        assert len(report.meetings_with_new_docs) == 1
        assert len(report.meetings_with_new_video) == 1
        assert report.total_changes == 2
        assert report.checked_at  # Should have a timestamp

    def test_empty_report_when_no_changes(self, tmp_path, mock_supabase):
        """Report with zero changes should still be valid."""
        detector = UpdateDetector(archive_root=str(tmp_path))

        with patch.object(
            detector, "detect_document_changes", return_value=[]
        ), patch.object(
            detector, "detect_video_changes", return_value=[]
        ):
            report = detector.detect_all_changes(supabase=mock_supabase)

        assert report.total_changes == 0
        assert report.meetings_with_new_docs == []
        assert report.meetings_with_new_video == []
