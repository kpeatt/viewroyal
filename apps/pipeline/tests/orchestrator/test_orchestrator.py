"""Tests for pipeline.orchestrator -- Archiver class, phase coordination, CLI flag handling."""

import json
import os

import pytest
from unittest.mock import patch, MagicMock, PropertyMock

from pipeline.scrapers.base import MunicipalityConfig


# ── Helpers ─────────────────────────────────────────────────────────────


def _make_municipality(slug="view-royal", source_type="civicweb"):
    return MunicipalityConfig(
        id=1,
        slug=slug,
        name="Town of View Royal",
        short_name="View Royal",
        source_config={"type": source_type, "base_url": "https://test.civicweb.net"},
    )


# We must patch heavy dependencies before importing Archiver, since orchestrator.py
# has module-level side effects (register_scraper, imports from local_diarizer, etc.)

@pytest.fixture
def mock_orchestrator_deps():
    """Patch all heavy external dependencies that orchestrator imports at module level."""
    with patch("pipeline.orchestrator.create_client") as mock_create, \
         patch("pipeline.orchestrator.LocalDiarizer") as mock_diarizer_cls, \
         patch("pipeline.orchestrator.VimeoClient") as mock_vimeo_cls, \
         patch("pipeline.orchestrator.CivicWebScraper") as mock_scraper_cls:

        mock_diarizer = MagicMock()
        mock_diarizer_cls.return_value = mock_diarizer

        mock_vimeo = MagicMock()
        mock_vimeo_cls.return_value = mock_vimeo

        mock_scraper = MagicMock()
        mock_scraper_cls.return_value = mock_scraper

        mock_supabase = MagicMock()
        mock_create.return_value = mock_supabase

        yield {
            "create_client": mock_create,
            "diarizer_cls": mock_diarizer_cls,
            "diarizer": mock_diarizer,
            "vimeo_cls": mock_vimeo_cls,
            "vimeo": mock_vimeo,
            "scraper_cls": mock_scraper_cls,
            "scraper": mock_scraper,
            "supabase": mock_supabase,
        }


# ── Archiver Initialization ────────────────────────────────────────────


class TestArchiverInit:
    def test_default_init_no_municipality(self, mock_orchestrator_deps):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()
        assert archiver.municipality is None

    def test_init_with_municipality(self, mock_orchestrator_deps):
        from pipeline.orchestrator import Archiver
        cfg = _make_municipality()
        archiver = Archiver(municipality=cfg)
        assert archiver.municipality is cfg
        assert archiver.municipality.slug == "view-royal"

    def test_diarizer_failure_disables_ai(self, mock_orchestrator_deps):
        mock_orchestrator_deps["diarizer_cls"].side_effect = Exception("No MLX")
        from pipeline.orchestrator import Archiver
        archiver = Archiver()
        assert archiver.ai_enabled is False


# ── Phase Coordination (run method) ────────────────────────────────────


class TestArchiverRun:
    def test_run_default_calls_all_phases(self, mock_orchestrator_deps):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()
        archiver._ingest_meetings = MagicMock()
        archiver._embed_new_content = MagicMock()

        mock_orchestrator_deps["vimeo"].get_video_map.return_value = {}

        archiver.run()

        mock_orchestrator_deps["scraper"].scrape_recursive.assert_called_once()
        archiver._ingest_meetings.assert_called_once()
        archiver._embed_new_content.assert_called_once()

    def test_run_skip_docs(self, mock_orchestrator_deps):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()
        archiver._ingest_meetings = MagicMock()
        archiver._embed_new_content = MagicMock()

        mock_orchestrator_deps["vimeo"].get_video_map.return_value = {}

        archiver.run(skip_docs=True)

        mock_orchestrator_deps["scraper"].scrape_recursive.assert_not_called()

    def test_run_skip_ingest(self, mock_orchestrator_deps):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()
        archiver._ingest_meetings = MagicMock()
        archiver._embed_new_content = MagicMock()

        mock_orchestrator_deps["vimeo"].get_video_map.return_value = {}

        archiver.run(skip_ingest=True)

        archiver._ingest_meetings.assert_not_called()

    def test_run_skip_embed(self, mock_orchestrator_deps):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()
        archiver._ingest_meetings = MagicMock()
        archiver._embed_new_content = MagicMock()

        mock_orchestrator_deps["vimeo"].get_video_map.return_value = {}

        archiver.run(skip_embed=True)

        archiver._embed_new_content.assert_not_called()

    def test_run_rediarize_skips_scrape_and_download(self, mock_orchestrator_deps):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()
        archiver._ingest_meetings = MagicMock()
        archiver._embed_new_content = MagicMock()
        archiver._process_audio_files = MagicMock(return_value=set())

        archiver.run(rediarize=True)

        # Scrape should be skipped
        mock_orchestrator_deps["scraper"].scrape_recursive.assert_not_called()
        # Vimeo download should be skipped
        mock_orchestrator_deps["vimeo"].get_video_map.assert_not_called()
        # Diarization should be called
        archiver._process_audio_files.assert_called_once()


# ── Audio File Collection ───────────────────────────────────────────────


class TestCollectAudioFiles:
    def test_collect_audio_files(self, mock_orchestrator_deps, tmp_path):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()
        archiver.archive_root = str(tmp_path)

        # Create audio files
        audio_dir = tmp_path / "Council" / "2025-06-15" / "Audio"
        audio_dir.mkdir(parents=True)
        (audio_dir / "meeting.mp3").write_bytes(b"fake mp3")
        (audio_dir / "meeting.m4a").write_bytes(b"fake m4a")

        files = archiver._collect_audio_files(str(tmp_path))
        assert len(files) == 2

    def test_skip_already_processed(self, mock_orchestrator_deps, tmp_path):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()
        archiver.archive_root = str(tmp_path)

        audio_dir = tmp_path / "Audio"
        audio_dir.mkdir()
        (audio_dir / "meeting.mp3").write_bytes(b"fake mp3")
        # Create companion JSON (already processed)
        (audio_dir / "meeting.json").write_text("{}")

        files = archiver._collect_audio_files(str(tmp_path))
        assert len(files) == 0

    def test_rediarize_includes_already_processed(self, mock_orchestrator_deps, tmp_path):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()
        archiver.archive_root = str(tmp_path)

        audio_dir = tmp_path / "Audio"
        audio_dir.mkdir()
        (audio_dir / "meeting.mp3").write_bytes(b"fake mp3")
        (audio_dir / "meeting.json").write_text("{}")

        files = archiver._collect_audio_files(str(tmp_path), rediarize=True)
        assert len(files) == 1


# ── Target Resolution ──────────────────────────────────────────────────


class TestResolveTarget:
    def test_resolve_directory_path(self, mock_orchestrator_deps, tmp_path):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()
        target_dir = tmp_path / "some_meeting"
        target_dir.mkdir()
        result = archiver._resolve_target(str(target_dir))
        assert result == str(target_dir)

    def test_resolve_invalid_path_raises(self, mock_orchestrator_deps):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()
        with pytest.raises(ValueError, match="Not a directory"):
            archiver._resolve_target("/nonexistent/path")

    def test_resolve_db_id(self, mock_orchestrator_deps):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
            data={"archive_path": "/abs/path/to/meeting"}
        )
        mock_orchestrator_deps["create_client"].return_value = mock_supabase

        # Patch os.path.isabs to return True for this path
        with patch("pipeline.orchestrator.os.path.isabs", return_value=True):
            result = archiver._resolve_target("42")
        assert result == "/abs/path/to/meeting"


# ── Backfill Progress ──────────────────────────────────────────────────


class TestBackfillProgress:
    def test_load_fresh_progress(self, mock_orchestrator_deps, tmp_path):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()

        with patch("pipeline.orchestrator.BACKFILL_PROGRESS_FILE", str(tmp_path / "progress.json")):
            progress = archiver._load_backfill_progress()
        assert progress["processed_meeting_ids"] == []
        assert "started_at" in progress

    def test_load_existing_progress(self, mock_orchestrator_deps, tmp_path):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()

        progress_file = tmp_path / "progress.json"
        progress_file.write_text(json.dumps({
            "processed_meeting_ids": [1, 2, 3],
            "errors": {},
            "started_at": "2025-01-01T00:00:00Z",
            "last_updated": "2025-01-01T01:00:00Z",
        }))

        with patch("pipeline.orchestrator.BACKFILL_PROGRESS_FILE", str(progress_file)):
            progress = archiver._load_backfill_progress()
        assert len(progress["processed_meeting_ids"]) == 3

    def test_force_clears_progress(self, mock_orchestrator_deps, tmp_path):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()

        progress_file = tmp_path / "progress.json"
        progress_file.write_text(json.dumps({
            "processed_meeting_ids": [1, 2, 3],
            "errors": {},
            "started_at": "2025-01-01T00:00:00Z",
            "last_updated": "2025-01-01T01:00:00Z",
        }))

        with patch("pipeline.orchestrator.BACKFILL_PROGRESS_FILE", str(progress_file)):
            progress = archiver._load_backfill_progress(force=True)
        assert progress["processed_meeting_ids"] == []
        assert not progress_file.exists()

    def test_save_and_reload_progress(self, mock_orchestrator_deps, tmp_path):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()

        progress_file = tmp_path / "progress.json"
        progress_file.write_text(json.dumps({
            "processed_meeting_ids": [],
            "errors": {},
            "started_at": "2025-01-01T00:00:00Z",
            "last_updated": "2025-01-01T00:00:00Z",
        }))

        with patch("pipeline.orchestrator.BACKFILL_PROGRESS_FILE", str(progress_file)):
            archiver._save_backfill_progress({1, 5, 10}, {"5": "partial failure"})
            progress = archiver._load_backfill_progress()

        assert sorted(progress["processed_meeting_ids"]) == [1, 5, 10]
        assert "5" in progress["errors"]


# ── Generate Stances/Highlights ─────────────────────────────────────────


class TestGenerateStances:
    def test_generate_stances_calls_module(self, mock_orchestrator_deps):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()

        with patch("pipeline.orchestrator.config") as mock_config:
            mock_config.SUPABASE_URL = "https://test.supabase.co"
            mock_config.SUPABASE_SECRET_KEY = "secret"
            mock_config.SUPABASE_KEY = "key"

            with patch("pipeline.profiling.stance_generator.generate_all_stances") as mock_gen:
                archiver.generate_stances(person_id=35)
                mock_gen.assert_called_once()

    def test_generate_stances_no_credentials(self, mock_orchestrator_deps):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()

        with patch("pipeline.orchestrator.config") as mock_config:
            mock_config.SUPABASE_URL = None
            mock_config.SUPABASE_SECRET_KEY = None
            mock_config.SUPABASE_KEY = None
            # Should not raise, just print warning and return
            archiver.generate_stances()


class TestGenerateHighlights:
    def test_generate_highlights_calls_module(self, mock_orchestrator_deps):
        from pipeline.orchestrator import Archiver
        archiver = Archiver()

        with patch("pipeline.orchestrator.config") as mock_config:
            mock_config.SUPABASE_URL = "https://test.supabase.co"
            mock_config.SUPABASE_SECRET_KEY = "secret"
            mock_config.SUPABASE_KEY = "key"

            with patch("pipeline.profiling.stance_generator.generate_councillor_highlights") as mock_gen:
                archiver.generate_highlights(person_id=35, force=True)
                mock_gen.assert_called_once()


# ── Update Mode ──────────────────────────────────────────────────────


class TestRunUpdateCheck:
    def test_run_update_check_returns_report(self, mock_orchestrator_deps):
        from pipeline.orchestrator import Archiver
        from pipeline.update_detector import MeetingChange, ChangeReport

        archiver = Archiver()

        mock_report = ChangeReport(
            meetings_with_new_docs=[
                MeetingChange(
                    archive_path="/archive/Council/2026-01-15",
                    meeting_date="2026-01-15",
                    meeting_type="Council",
                    change_type="new_documents",
                    details=["Minutes PDF available"],
                ),
            ],
            meetings_with_new_video=[
                MeetingChange(
                    archive_path="/archive/Council/2026-02-12",
                    meeting_date="2026-02-12",
                    meeting_type="Council",
                    change_type="new_video",
                    details=["Vimeo video available: Council Meeting"],
                    meta={"video_data": [{"title": "Council Meeting", "uri": "/videos/123"}]},
                ),
            ],
        )

        with patch("pipeline.orchestrator.config") as mock_config, \
             patch("pipeline.update_detector.UpdateDetector") as mock_detector_cls:
            mock_config.SUPABASE_URL = "https://test.supabase.co"
            mock_config.SUPABASE_SECRET_KEY = "secret"
            mock_config.SUPABASE_KEY = "key"

            mock_detector = MagicMock()
            mock_detector.detect_all_changes.return_value = mock_report
            mock_detector_cls.return_value = mock_detector

            report = archiver.run_update_check()

            assert report.total_changes == 2
            assert len(report.meetings_with_new_docs) == 1
            assert len(report.meetings_with_new_video) == 1
            # Scraper should have been called first
            mock_orchestrator_deps["scraper"].scrape_recursive.assert_called_once()
            # Detector should have been created and called
            mock_detector_cls.assert_called_once()
            mock_detector.detect_all_changes.assert_called_once()


class TestRunUpdateMode:
    def test_run_update_mode_processes_only_changed_meetings(self, mock_orchestrator_deps, tmp_path):
        from pipeline.orchestrator import Archiver
        from pipeline.update_detector import MeetingChange, ChangeReport

        archiver = Archiver()
        archiver._ingest_meetings = MagicMock()
        archiver._embed_new_content = MagicMock()
        archiver._process_audio_files = MagicMock(return_value=set())

        # Use tmp_path for archive paths so os.makedirs works
        doc_path_1 = str(tmp_path / "Council" / "2026-01-15")
        doc_path_2 = str(tmp_path / "Council" / "2026-01-29")
        video_path = str(tmp_path / "Council" / "2026-02-12")
        os.makedirs(doc_path_1, exist_ok=True)
        os.makedirs(doc_path_2, exist_ok=True)
        os.makedirs(video_path, exist_ok=True)

        mock_report = ChangeReport(
            meetings_with_new_docs=[
                MeetingChange(
                    archive_path=doc_path_1,
                    meeting_date="2026-01-15",
                    meeting_type="Council",
                    change_type="new_documents",
                    details=["Minutes PDF available"],
                ),
                MeetingChange(
                    archive_path=doc_path_2,
                    meeting_date="2026-01-29",
                    meeting_type="Council",
                    change_type="new_documents",
                    details=["Agenda items added"],
                ),
            ],
            meetings_with_new_video=[
                MeetingChange(
                    archive_path=video_path,
                    meeting_date="2026-02-12",
                    meeting_type="Council",
                    change_type="new_video",
                    details=["Vimeo video available: Council Meeting"],
                    meta={"video_data": [{"title": "Council Meeting", "uri": "/videos/123"}]},
                ),
            ],
        )

        with patch("pipeline.orchestrator.config") as mock_config, \
             patch("pipeline.update_detector.UpdateDetector") as mock_detector_cls, \
             patch("pipeline.notifier.config") as mock_notifier_config:
            mock_config.SUPABASE_URL = "https://test.supabase.co"
            mock_config.SUPABASE_SECRET_KEY = "secret"
            mock_config.SUPABASE_KEY = "key"
            mock_notifier_config.MOSHI_TOKEN = None  # Prevent real notifications

            mock_detector = MagicMock()
            mock_detector.detect_all_changes.return_value = mock_report
            mock_detector_cls.return_value = mock_detector

            archiver.run_update_mode(download_audio=True, skip_diarization=True)

            # _ingest_meetings called 3 times (2 doc changes + 1 video change)
            assert archiver._ingest_meetings.call_count == 3

            # Each call should have force_update=True
            for call in archiver._ingest_meetings.call_args_list:
                assert call.kwargs.get("force_update") is True

            # Verify the correct archive paths were passed
            ingested_paths = [
                call.kwargs.get("target_folder") for call in archiver._ingest_meetings.call_args_list
            ]
            assert doc_path_1 in ingested_paths
            assert doc_path_2 in ingested_paths
            assert video_path in ingested_paths

            # _embed_new_content called exactly once at the end
            archiver._embed_new_content.assert_called_once()

            # Vimeo download should have been called for the video change
            mock_orchestrator_deps["vimeo"].download_video.assert_called_once()

    def test_run_update_mode_no_changes_skips_processing(self, mock_orchestrator_deps):
        from pipeline.orchestrator import Archiver
        from pipeline.update_detector import ChangeReport

        archiver = Archiver()
        archiver._ingest_meetings = MagicMock()
        archiver._embed_new_content = MagicMock()

        mock_report = ChangeReport()  # Empty report

        with patch("pipeline.orchestrator.config") as mock_config, \
             patch("pipeline.update_detector.UpdateDetector") as mock_detector_cls:
            mock_config.SUPABASE_URL = "https://test.supabase.co"
            mock_config.SUPABASE_SECRET_KEY = "secret"
            mock_config.SUPABASE_KEY = "key"

            mock_detector = MagicMock()
            mock_detector.detect_all_changes.return_value = mock_report
            mock_detector_cls.return_value = mock_detector

            archiver.run_update_mode()

            # Nothing should have been processed
            archiver._ingest_meetings.assert_not_called()
            archiver._embed_new_content.assert_not_called()

    def test_run_update_mode_skip_embed(self, mock_orchestrator_deps):
        from pipeline.orchestrator import Archiver
        from pipeline.update_detector import MeetingChange, ChangeReport

        archiver = Archiver()
        archiver._ingest_meetings = MagicMock()
        archiver._embed_new_content = MagicMock()

        mock_report = ChangeReport(
            meetings_with_new_docs=[
                MeetingChange(
                    archive_path="/archive/Council/2026-01-15",
                    meeting_date="2026-01-15",
                    meeting_type="Council",
                    change_type="new_documents",
                    details=["Minutes PDF available"],
                ),
            ],
        )

        with patch("pipeline.orchestrator.config") as mock_config, \
             patch("pipeline.update_detector.UpdateDetector") as mock_detector_cls, \
             patch("pipeline.notifier.config") as mock_notifier_config:
            mock_config.SUPABASE_URL = "https://test.supabase.co"
            mock_config.SUPABASE_SECRET_KEY = "secret"
            mock_config.SUPABASE_KEY = "key"
            mock_notifier_config.MOSHI_TOKEN = None  # Prevent real notifications

            mock_detector = MagicMock()
            mock_detector.detect_all_changes.return_value = mock_report
            mock_detector_cls.return_value = mock_detector

            archiver.run_update_mode(skip_embed=True)

            archiver._ingest_meetings.assert_called_once()
            archiver._embed_new_content.assert_not_called()
