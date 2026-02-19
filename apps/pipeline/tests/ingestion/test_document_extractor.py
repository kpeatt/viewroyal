"""Tests for pipeline.ingestion.document_extractor module.

Covers: _split_markdown_into_sections, _enforce_size_limit,
        _normalize_item_number, _resolve_agenda_item, extract_and_store_documents
"""

import pytest
from unittest.mock import patch, MagicMock, call

from pipeline.ingestion.document_extractor import (
    _split_markdown_into_sections,
    _enforce_size_limit,
    _normalize_item_number,
    _resolve_agenda_item,
    extract_and_store_documents,
)


# --- _normalize_item_number ---


class TestNormalizeItemNumber:
    def test_strips_parentheses(self):
        assert _normalize_item_number("6.1a)") == "6.1a"

    def test_strips_trailing_period(self):
        assert _normalize_item_number("3.a.") == "3.a"

    def test_removes_whitespace(self):
        assert _normalize_item_number("  8 . 1 a  ") == "8.1a"

    def test_lowercases(self):
        assert _normalize_item_number("6.1A") == "6.1a"

    def test_simple_number(self):
        assert _normalize_item_number("1") == "1"

    def test_empty_string(self):
        assert _normalize_item_number("") == ""


# --- _split_markdown_into_sections ---


class TestSplitMarkdownIntoSections:
    def test_empty_string(self):
        assert _split_markdown_into_sections("") == []

    def test_none(self):
        assert _split_markdown_into_sections(None) == []

    def test_whitespace_only(self):
        assert _split_markdown_into_sections("   ") == []

    def test_no_headings_single_section(self):
        md = "This is just some text content without any headings."
        result = _split_markdown_into_sections(md)
        assert len(result) == 1
        assert result[0]["section_title"] == "Document Content"
        assert result[0]["section_order"] == 1
        assert result[0]["token_count"] > 0

    def test_with_headings_splits_correctly(self):
        md = """# Title

Some intro text.

## Background

Background information here.

## Recommendation

Staff recommends approval.
"""
        result = _split_markdown_into_sections(md)
        assert len(result) >= 2  # Preamble + at least 2 headed sections
        titles = [s["section_title"] for s in result]
        assert "Background" in titles
        assert "Recommendation" in titles

    def test_section_order_increments(self):
        md = """## First

Content 1.

## Second

Content 2.

## Third

Content 3.
"""
        result = _split_markdown_into_sections(md)
        orders = [s["section_order"] for s in result]
        assert orders == list(range(1, len(orders) + 1))

    def test_token_count_is_positive(self):
        md = "## Section\n\nSome text content here with words."
        result = _split_markdown_into_sections(md)
        assert all(s["token_count"] > 0 for s in result)


# --- _enforce_size_limit ---


class TestEnforceSizeLimit:
    def test_short_text_single_section(self):
        result = _enforce_size_limit("Title", "Short text", 8000)
        assert len(result) == 1
        assert result[0]["section_title"] == "Title"

    def test_long_text_splits_into_parts(self):
        long_text = "\n\n".join([f"Paragraph {i} " * 100 for i in range(20)])
        result = _enforce_size_limit("Report", long_text, 500)
        assert len(result) > 1
        # Check part numbering
        assert "Part 1 of" in result[0]["section_title"]

    def test_unsplittable_long_text(self):
        # Single paragraph exceeding limit
        long_text = "x" * 10000
        result = _enforce_size_limit("Title", long_text, 500)
        assert len(result) == 1  # Cannot split single paragraph


# --- _resolve_agenda_item ---


class TestResolveAgendaItem:
    def test_exact_match(self, mock_supabase):
        mock_supabase.table.return_value.execute.return_value = MagicMock(
            data=[
                {"id": 101, "item_order": "6.1a"},
                {"id": 102, "item_order": "6.1b"},
            ]
        )
        result = _resolve_agenda_item("6.1a", 42, mock_supabase)
        assert result == 101

    def test_normalized_match(self, mock_supabase):
        mock_supabase.table.return_value.execute.return_value = MagicMock(
            data=[{"id": 101, "item_order": "6.1a)"}]
        )
        result = _resolve_agenda_item("6.1a", 42, mock_supabase)
        assert result == 101

    def test_containment_match(self, mock_supabase):
        mock_supabase.table.return_value.execute.return_value = MagicMock(
            data=[{"id": 101, "item_order": "6.1"}]
        )
        result = _resolve_agenda_item("6.1a", 42, mock_supabase)
        assert result == 101

    def test_no_match(self, mock_supabase):
        mock_supabase.table.return_value.execute.return_value = MagicMock(
            data=[{"id": 101, "item_order": "7.1"}]
        )
        result = _resolve_agenda_item("99.9", 42, mock_supabase)
        assert result is None

    def test_empty_string(self, mock_supabase):
        result = _resolve_agenda_item("", 42, mock_supabase)
        assert result is None

    def test_none_input(self, mock_supabase):
        result = _resolve_agenda_item(None, 42, mock_supabase)
        assert result is None

    def test_no_agenda_items(self, mock_supabase):
        mock_supabase.table.return_value.execute.return_value = MagicMock(data=[])
        result = _resolve_agenda_item("6.1", 42, mock_supabase)
        assert result is None

    def test_db_error_returns_none(self, mock_supabase):
        mock_supabase.table.return_value.execute.side_effect = Exception("DB Error")
        result = _resolve_agenda_item("6.1", 42, mock_supabase)
        assert result is None


# --- extract_and_store_documents ---


class TestExtractAndStoreDocuments:
    @patch("pipeline.ingestion.gemini_extractor.extract_content")
    @patch("pipeline.ingestion.gemini_extractor.detect_boundaries")
    def test_no_boundaries_returns_early(self, mock_detect, mock_extract, mock_supabase):
        mock_detect.return_value = []
        stats = extract_and_store_documents(
            "/tmp/test.pdf", 1, 100, mock_supabase
        )
        assert stats["boundaries_found"] == 0
        assert stats["sections_created"] == 0
        mock_extract.assert_not_called()

    @patch("pipeline.ingestion.gemini_extractor.extract_content")
    @patch("pipeline.ingestion.gemini_extractor.detect_boundaries")
    def test_with_boundaries_creates_documents(self, mock_detect, mock_extract, mock_supabase):
        mock_detect.return_value = [
            {
                "title": "Staff Report",
                "type": "report",
                "page_start": 1,
                "page_end": 3,
                "summary": "A staff report",
                "key_facts": None,
                "agenda_item": None,
            }
        ]
        mock_extract.return_value = "## Background\n\nReport content here."

        # Mock DB insertions
        mock_supabase.table.return_value.execute.return_value = MagicMock(
            data=[{"id": 50}]
        )

        stats = extract_and_store_documents(
            "/tmp/test.pdf", 1, 100, mock_supabase
        )
        assert stats["boundaries_found"] == 1
        assert stats["documents_extracted"] >= 1

    @patch("pipeline.ingestion.gemini_extractor.detect_boundaries")
    def test_gemini_failure_raises(self, mock_detect, mock_supabase):
        mock_detect.side_effect = Exception("Gemini API Error")
        with pytest.raises(Exception, match="Gemini API Error"):
            extract_and_store_documents("/tmp/test.pdf", 1, 100, mock_supabase)

    @patch("pipeline.ingestion.gemini_extractor.extract_content")
    @patch("pipeline.ingestion.gemini_extractor.detect_boundaries")
    def test_summary_fallback_when_no_markdown(self, mock_detect, mock_extract, mock_supabase):
        """When content extraction fails, a section is created from the summary."""
        mock_detect.return_value = [
            {
                "title": "Brief Report",
                "type": "report",
                "page_start": 1,
                "page_end": 1,
                "summary": "This is a brief report summary.",
                "key_facts": None,
                "agenda_item": None,
            }
        ]
        mock_extract.side_effect = Exception("Content extraction failed")

        # Mock DB insertions
        mock_supabase.table.return_value.execute.return_value = MagicMock(
            data=[{"id": 50}]
        )

        stats = extract_and_store_documents(
            "/tmp/test.pdf", 1, 100, mock_supabase
        )
        assert stats["boundaries_found"] == 1
        assert stats["documents_extracted"] >= 1
        # Section should be created from summary fallback
        assert stats["sections_created"] >= 1
