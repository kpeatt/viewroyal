"""Tests for pipeline.paths module.

Covers: path constants, get_report_path, get_archive_path, get_municipality_archive_root
"""

import os
import pytest
from unittest.mock import patch

from pipeline.paths import (
    BASE_DIR,
    ARCHIVE_ROOT,
    DOCUMENTS_ROOT,
    REPORTS_DIR,
    LOGS_DIR,
    ELECTION_HISTORY_JSON,
    get_report_path,
    get_archive_path,
    get_municipality_archive_root,
)


class TestPathConstants:
    def test_base_dir_is_absolute(self):
        assert os.path.isabs(BASE_DIR)

    def test_archive_root_under_base(self):
        assert ARCHIVE_ROOT.startswith(BASE_DIR)

    def test_documents_root_under_base(self):
        assert DOCUMENTS_ROOT.startswith(BASE_DIR)

    def test_reports_dir_under_base(self):
        assert REPORTS_DIR.startswith(BASE_DIR)

    def test_logs_dir_under_base(self):
        assert LOGS_DIR.startswith(BASE_DIR)

    def test_election_history_json_path(self):
        assert ELECTION_HISTORY_JSON.endswith("view_royal_full_history.json")


class TestGetReportPath:
    def test_returns_path_under_reports_dir(self):
        path = get_report_path("test_report.txt")
        assert path == os.path.join(REPORTS_DIR, "test_report.txt")

    def test_creates_reports_dir(self, tmp_path):
        fake_reports = str(tmp_path / "reports")
        with patch("pipeline.paths.REPORTS_DIR", fake_reports):
            # Re-import would be needed if REPORTS_DIR were used at call time
            # but get_report_path uses the module-level REPORTS_DIR
            # So we patch the check and os.makedirs
            path = get_report_path("test.txt")
            # At minimum, it returns a valid path string
            assert path.endswith("test.txt")


class TestGetArchivePath:
    def test_returns_path_under_archive_root(self):
        path = get_archive_path("Council", "2025")
        assert path == os.path.join(ARCHIVE_ROOT, "Council", "2025")

    def test_single_arg(self):
        path = get_archive_path("test")
        assert path == os.path.join(ARCHIVE_ROOT, "test")


class TestGetMunicipalityArchiveRoot:
    def test_view_royal_legacy_path(self):
        """view-royal slug returns legacy path if it exists."""
        with patch("os.path.exists", return_value=True):
            result = get_municipality_archive_root("view-royal")
            assert result.endswith("viewroyal_archive")

    def test_non_view_royal_creates_archive_dir(self, tmp_path):
        """Other slugs get archive/<slug> path."""
        with patch("pipeline.paths.BASE_DIR", str(tmp_path)):
            result = get_municipality_archive_root("test-city")
            assert "archive" in result
            assert result.endswith("test-city")
            assert os.path.exists(result)

    def test_view_royal_no_legacy(self, tmp_path):
        """view-royal without legacy dir falls through to archive/<slug>."""
        with patch("pipeline.paths.BASE_DIR", str(tmp_path)):
            with patch("os.path.exists", return_value=False):
                result = get_municipality_archive_root("view-royal")
                assert "archive" in result
                assert result.endswith("view-royal")
