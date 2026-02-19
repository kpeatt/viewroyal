"""Tests for pipeline.ingestion.matter_matching module.

Covers: normalize_identifier, parse_compound_identifier, extract_addresses,
        normalize_address, extract_numbers, check_number_mismatch,
        MatterMatcher initialization and matching.
"""

import pytest
from unittest.mock import MagicMock

from pipeline.ingestion.matter_matching import (
    normalize_identifier,
    parse_compound_identifier,
    extract_addresses,
    normalize_address,
    extract_numbers,
    check_number_mismatch,
    _extract_category_keywords,
    MatterMatcher,
)


# --- normalize_identifier ---


class TestNormalizeIdentifier:
    def test_bylaw_with_no(self):
        assert normalize_identifier("Bylaw No. 1160") == "Bylaw 1160"

    def test_bylaw_without_no(self):
        assert normalize_identifier("Bylaw 1160") == "Bylaw 1160"

    def test_amendment_bylaw(self):
        assert normalize_identifier("Amendment Bylaw No. 1101") == "Bylaw 1101"

    def test_rezoning(self):
        assert normalize_identifier("Rezoning Application No. 2025-01") == "REZ 2025-01"

    def test_rez_abbreviation(self):
        assert normalize_identifier("REZ 2025-01") == "REZ 2025-01"

    def test_tup(self):
        assert normalize_identifier("Temporary Use Permit No. 2025-03") == "TUP 2025-03"

    def test_dvp(self):
        assert normalize_identifier("Development Variance Permit No. 2024-01") == "DVP 2024-01"

    def test_dp(self):
        assert normalize_identifier("Development Permit No. 2024-02") == "DP 2024-02"

    def test_empty_string(self):
        assert normalize_identifier("") == ""

    def test_none(self):
        assert normalize_identifier(None) == ""

    def test_fallback_strips_whitespace(self):
        assert normalize_identifier("  Some   Other  Thing  ") == "Some Other Thing"

    def test_rezoning_with_slash(self):
        assert normalize_identifier("Rezoning Application No. 2025/01") == "REZ 2025-01"


# --- parse_compound_identifier ---


class TestParseCompoundIdentifier:
    def test_single_identifier(self):
        assert parse_compound_identifier("Bylaw No. 1160") == ["Bylaw 1160"]

    def test_compound_semicolon(self):
        result = parse_compound_identifier("Bylaw No. 1160; REZ 2025-01")
        assert len(result) == 2
        assert "Bylaw 1160" in result
        assert "REZ 2025-01" in result

    def test_empty_string(self):
        assert parse_compound_identifier("") == []

    def test_none(self):
        assert parse_compound_identifier(None) == []

    def test_short_parts_filtered(self):
        # Parts with <= 2 chars after normalization should be filtered
        assert parse_compound_identifier("AB") == []


# --- extract_addresses ---


class TestExtractAddresses:
    def test_simple_address(self):
        result = extract_addresses("Discussion about 258 Helmcken Road")
        assert len(result) == 1
        assert "258 helmcken road" in result[0]

    def test_multiple_addresses(self):
        result = extract_addresses("Properties at 100 View Royal Avenue and 200 Helmcken Road")
        assert len(result) == 2

    def test_no_address(self):
        assert extract_addresses("No addresses here") == []

    def test_empty_string(self):
        assert extract_addresses("") == []

    def test_none(self):
        assert extract_addresses(None) == []


# --- normalize_address ---


class TestNormalizeAddress:
    def test_expands_abbreviations(self):
        assert normalize_address("258 Helmcken Rd") == "258 helmcken road"

    def test_lowercases(self):
        assert normalize_address("100 VIEW ROYAL AVENUE") == "100 view royal avenue"

    def test_empty(self):
        assert normalize_address("") == ""

    def test_none(self):
        assert normalize_address(None) == ""


# --- extract_numbers ---


class TestExtractNumbers:
    def test_extracts_numbers(self):
        assert extract_numbers("Bylaw 1160 and REZ 2025-01") == {"1160", "2025", "01"}

    def test_empty_string(self):
        assert extract_numbers("") == set()

    def test_none(self):
        assert extract_numbers(None) == set()

    def test_no_numbers(self):
        assert extract_numbers("no numbers here") == set()


# --- check_number_mismatch ---


class TestCheckNumberMismatch:
    def test_matching_numbers(self):
        assert check_number_mismatch("Bylaw 258", "Bylaw 258") is False

    def test_disjoint_numbers(self):
        assert check_number_mismatch("Bylaw 1156", "Bylaw 1157") is True

    def test_subset_numbers(self):
        assert check_number_mismatch("Bylaw 258", "Bylaw 258 REZ 2025") is False

    def test_partial_overlap_mismatch(self):
        assert check_number_mismatch("Bylaw 2016 Section 7", "Bylaw 2016 Section 9") is True

    def test_no_numbers_either_side(self):
        assert check_number_mismatch("No numbers", "Also none") is False


# --- _extract_category_keywords ---


class TestExtractCategoryKeywords:
    def test_rezoning(self):
        assert "rezoning" in _extract_category_keywords("Rezoning Application for 100 Main St")

    def test_bylaw(self):
        assert "bylaw" in _extract_category_keywords("Amendment Bylaw No. 1101")

    def test_multiple_categories(self):
        cats = _extract_category_keywords("Rezoning and Bylaw Amendment")
        assert "rezoning" in cats
        assert "bylaw" in cats

    def test_empty(self):
        assert _extract_category_keywords("") == set()

    def test_none(self):
        assert _extract_category_keywords(None) == set()


# --- MatterMatcher ---


class TestMatterMatcher:
    def test_init_defaults(self, mock_supabase):
        matcher = MatterMatcher(mock_supabase)
        assert matcher.municipality_id == 1
        assert matcher._loaded is False
        assert matcher.matters == []

    def test_find_match_triggers_load(self, mock_supabase):
        matcher = MatterMatcher(mock_supabase)
        # find_match should trigger load if not loaded
        result = matcher.find_match("Bylaw 123", "Test Title")
        assert matcher._loaded is True
        # With no matters loaded, should return no match
        assert result == (None, "no_match", 0.0)

    def test_find_match_exact_identifier(self, mock_supabase):
        matcher = MatterMatcher(mock_supabase)
        # Pre-load a matter
        matcher._loaded = True
        matter = {
            "id": 42,
            "title": "Noise Control Bylaw",
            "identifier": "Bylaw 1160",
            "status": "Active",
            "category": "Bylaw",
            "_addresses": set(),
        }
        matcher.matters = [matter]
        matcher._build_identifier_index()
        matcher._build_address_index()

        result = matcher.find_match("Bylaw No. 1160", "Noise Control")
        assert result[0] == 42
        assert "identifier_exact" in result[1]
        assert result[2] == 1.0

    def test_find_match_no_match(self, mock_supabase):
        matcher = MatterMatcher(mock_supabase)
        matcher._loaded = True
        matcher.matters = []
        matcher._build_identifier_index()
        matcher._build_address_index()

        result = matcher.find_match(None, "Random Title")
        assert result == (None, "no_match", 0.0)

    def test_add_matter_to_indices(self, mock_supabase):
        matcher = MatterMatcher(mock_supabase)
        matcher._loaded = True
        matcher._build_identifier_index()
        matcher._build_address_index()

        new_matter = {
            "id": 99,
            "title": "Test Matter",
            "identifier": "Bylaw 999",
            "status": "Active",
            "category": "Bylaw",
            "_addresses": {"100 test road"},
        }
        matcher._add_matter_to_indices(new_matter)

        assert len(matcher.matters) == 1
        assert "bylaw 999" in matcher.identifier_index
        assert "100 test road" in matcher.address_index
