"""Tests for pipeline.ingestion.ingester pure functions and utility methods.

Covers: to_seconds, extract_identifier_from_text, normalize_address_list,
        map_type_to_org, find_transcript, _classify_document, _normalize_archive_path
"""

import os
import pytest
from unittest.mock import patch, MagicMock

from pipeline.ingestion.ingester import to_seconds, MeetingIngester


# --- to_seconds ---


class TestToSeconds:
    def test_float_passthrough(self):
        assert to_seconds(123.45) == 123.45

    def test_int_passthrough(self):
        assert to_seconds(60) == 60.0

    def test_hhmmss(self):
        assert to_seconds("1:23:45") == 1 * 3600 + 23 * 60 + 45

    def test_mmss(self):
        assert to_seconds("5:30") == 5 * 60 + 30

    def test_none_returns_none(self):
        assert to_seconds(None) is None

    def test_invalid_string(self):
        assert to_seconds("not a time") is None

    def test_zero(self):
        assert to_seconds(0) == 0.0

    def test_hhmmss_with_decimals(self):
        result = to_seconds("0:01:30.5")
        assert result is not None
        assert abs(result - 90.5) < 0.01

    def test_string_without_colon(self):
        assert to_seconds("12345") is None

    def test_empty_string(self):
        assert to_seconds("") is None


# --- extract_identifier_from_text ---


class TestExtractIdentifier:
    @pytest.fixture(autouse=True)
    def setup_ingester(self):
        self.ingester = MeetingIngester("http://test.url", "test-key", gemini_key=None)

    def test_bylaw_number(self):
        result = self.ingester.extract_identifier_from_text(
            "Discussion of Bylaw No. 1160 regarding noise"
        )
        assert result == "Bylaw 1160"

    def test_amendment_bylaw(self):
        result = self.ingester.extract_identifier_from_text(
            "Amendment Bylaw No. 1101 for zoning changes"
        )
        assert result == "Bylaw 1101"

    def test_rezoning(self):
        result = self.ingester.extract_identifier_from_text(
            "Rezoning Application No. 2025-01"
        )
        assert result is not None
        assert "2025" in result

    def test_development_variance_permit(self):
        result = self.ingester.extract_identifier_from_text(
            "Development Variance Permit No. 2024-01"
        )
        assert result is not None
        assert "2024-01" in result

    def test_dvp_abbreviation(self):
        result = self.ingester.extract_identifier_from_text("DVP No. 2024-01")
        assert result is not None
        assert "2024-01" in result

    def test_development_permit(self):
        result = self.ingester.extract_identifier_from_text(
            "Development Permit No. 2024-02"
        )
        assert result is not None
        assert "2024-02" in result

    def test_no_identifier(self):
        result = self.ingester.extract_identifier_from_text(
            "General discussion about community events"
        )
        assert result is None

    def test_none_input(self):
        result = self.ingester.extract_identifier_from_text(None)
        assert result is None

    def test_empty_string(self):
        result = self.ingester.extract_identifier_from_text("")
        assert result is None

    def test_tup(self):
        result = self.ingester.extract_identifier_from_text(
            "Temporary Use Permit No. 2025-03"
        )
        assert result is not None
        assert "2025-03" in result


# --- normalize_address_list ---


class TestNormalizeAddressList:
    @pytest.fixture(autouse=True)
    def setup_ingester(self):
        self.ingester = MeetingIngester("http://test.url", "test-key", gemini_key=None)

    def test_none_returns_empty(self):
        assert self.ingester.normalize_address_list(None) == []

    def test_list_passthrough(self):
        result = self.ingester.normalize_address_list(["100 Main St", "200 Oak Ave"])
        assert result == ["100 Main St", "200 Oak Ave"]

    def test_list_strips_whitespace(self):
        result = self.ingester.normalize_address_list(["  100 Main St  ", "200 Oak Ave"])
        assert result == ["100 Main St", "200 Oak Ave"]

    def test_list_filters_empty_entries(self):
        result = self.ingester.normalize_address_list(["100 Main St", "", None])
        assert result == ["100 Main St"]

    def test_multi_number_pattern(self):
        result = self.ingester.normalize_address_list(
            "105, 106 and 107 Glentana Road"
        )
        assert len(result) == 3
        assert "105 Glentana Road" in result
        assert "106 Glentana Road" in result
        assert "107 Glentana Road" in result

    def test_four_numbers_and_pattern(self):
        result = self.ingester.normalize_address_list(
            "100, 101, 102 and 103 Test Street"
        )
        assert len(result) == 4
        assert "100 Test Street" in result
        assert "103 Test Street" in result

    def test_comma_separated_addresses(self):
        result = self.ingester.normalize_address_list("100 Main St, 200 Oak Ave")
        assert len(result) == 2
        assert "100 Main St" in result
        assert "200 Oak Ave" in result

    def test_and_separated_addresses(self):
        result = self.ingester.normalize_address_list("100 Main St and 200 Oak Ave")
        assert len(result) == 2

    def test_single_address_string(self):
        result = self.ingester.normalize_address_list("258 Helmcken Road")
        assert result == ["258 Helmcken Road"]

    def test_empty_string(self):
        assert self.ingester.normalize_address_list("") == []

    def test_non_string_non_list(self):
        assert self.ingester.normalize_address_list(42) == []


# --- map_type_to_org ---


class TestMapTypeToOrg:
    @pytest.fixture(autouse=True)
    def setup_ingester(self):
        self.ingester = MeetingIngester("http://test.url", "test-key", gemini_key=None)

    def test_regular_council(self):
        assert self.ingester.map_type_to_org("Regular Council") == ("Council", "Council")

    def test_special_council(self):
        assert self.ingester.map_type_to_org("Special Council") == ("Council", "Council")

    def test_committee_of_the_whole(self):
        assert self.ingester.map_type_to_org("Committee of the Whole") == ("Council", "Council")

    def test_public_hearing(self):
        assert self.ingester.map_type_to_org("Public Hearing") == ("Council", "Council")

    def test_board_of_variance(self):
        assert self.ingester.map_type_to_org("Board of Variance") == ("Board of Variance", "Board")

    def test_advisory_committee(self):
        assert self.ingester.map_type_to_org("Advisory Committee") == ("Advisory Committee", "Advisory Committee")

    def test_generic_fallback(self):
        name, cls = self.ingester.map_type_to_org("Standing Committee")
        assert name == "Standing Committee"
        assert cls == "Committee"


# --- find_transcript ---


class TestFindTranscript:
    @pytest.fixture(autouse=True)
    def setup_ingester(self):
        self.ingester = MeetingIngester("http://test.url", "test-key", gemini_key=None)

    def test_no_audio_folder(self, tmp_path):
        result = self.ingester.find_transcript(str(tmp_path))
        assert result is None

    def test_finds_transcript(self, tmp_path):
        audio_dir = tmp_path / "Audio"
        audio_dir.mkdir()
        transcript = audio_dir / "2025-01-01_meeting.json"
        transcript.write_text("{}")
        result = self.ingester.find_transcript(str(tmp_path))
        assert result == str(transcript)

    def test_skips_raw_transcript(self, tmp_path):
        audio_dir = tmp_path / "Audio"
        audio_dir.mkdir()
        (audio_dir / "some_raw_transcript.json").write_text("{}")
        result = self.ingester.find_transcript(str(tmp_path))
        assert result is None

    def test_skips_segments_and_shared_media(self, tmp_path):
        audio_dir = tmp_path / "Audio"
        audio_dir.mkdir()
        (audio_dir / "meeting_segments.json").write_text("{}")
        (audio_dir / "shared_media.json").write_text("{}")
        (audio_dir / "refinement.json").write_text("{}")
        (audio_dir / "attendance.json").write_text("{}")
        result = self.ingester.find_transcript(str(tmp_path))
        assert result is None


# --- _classify_document ---


class TestClassifyDocument:
    @pytest.fixture(autouse=True)
    def setup_ingester(self):
        self.ingester = MeetingIngester("http://test.url", "test-key", gemini_key=None)

    def test_agenda(self):
        assert self.ingester._classify_document("Council Agenda.pdf") == "Agenda"

    def test_minutes(self):
        assert self.ingester._classify_document("Council Minutes.pdf") == "Minutes"

    def test_addendum(self):
        assert self.ingester._classify_document("Addendum Package.pdf") == "Addendum"

    def test_late_items(self):
        assert self.ingester._classify_document("Late Items.pdf") == "Late Items"

    def test_supplementary(self):
        assert self.ingester._classify_document("Supplementary Package.pdf") == "Supplementary"

    def test_report(self):
        assert self.ingester._classify_document("Staff Report.pdf") == "Report"

    def test_other(self):
        assert self.ingester._classify_document("random_file.pdf") == "Other"


# --- _normalize_archive_path ---


class TestNormalizeArchivePath:
    @pytest.fixture(autouse=True)
    def setup_ingester(self):
        self.ingester = MeetingIngester("http://test.url", "test-key", gemini_key=None)

    def test_legacy_viewroyal_archive(self):
        result = self.ingester._normalize_archive_path(
            "/home/user/project/viewroyal_archive/Council/2025/01"
        )
        assert result.startswith("viewroyal_archive/")

    def test_new_archive_format(self):
        result = self.ingester._normalize_archive_path(
            "/home/user/project/archive/view-royal/Council/2025"
        )
        assert result.startswith("archive/")

    def test_relative_path_fallback(self):
        result = self.ingester._normalize_archive_path("some/random/path")
        # Should return as-is or normalized form
        assert result is not None
