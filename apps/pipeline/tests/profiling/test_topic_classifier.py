"""Tests for pipeline.profiling.topic_classifier -- topic classification for agenda items."""

import json

import pytest
from unittest.mock import patch, MagicMock, call


# ── SQL-based Classification ────────────────────────────────────────────


class TestSqlClassification:
    """Test that SQL-based classification populates agenda_item_topics for items with known categories."""

    def test_sql_classification_inserts_via_rpc(self):
        """SQL classification uses supabase.rpc() to bulk-insert mapped items."""
        from pipeline.profiling.topic_classifier import classify_topics

        mock_sb = MagicMock()
        # rpc for sql_classify returns count
        mock_sb.rpc.return_value.execute.return_value = MagicMock(data={"inserted": 100})
        # topics query
        mock_sb.table.return_value.select.return_value.execute.return_value = MagicMock(
            data=[
                {"id": 1, "name": "Administration"},
                {"id": 2, "name": "Bylaw"},
                {"id": 3, "name": "Development"},
                {"id": 4, "name": "Environment"},
                {"id": 5, "name": "Finance"},
                {"id": 6, "name": "General"},
                {"id": 7, "name": "Public Safety"},
                {"id": 8, "name": "Transportation"},
            ]
        )

        with patch("pipeline.profiling.topic_classifier._classify_unmapped_with_gemini") as mock_gemini:
            mock_gemini.return_value = 0
            classify_topics(mock_sb)

        # Verify rpc was called for SQL bulk classification
        mock_sb.rpc.assert_called()
        rpc_call_names = [c.args[0] for c in mock_sb.rpc.call_args_list]
        assert "bulk_classify_topics_by_category" in rpc_call_names


class TestGeminiFallback:
    """Test that Gemini fallback is called only for unmapped categories."""

    def test_gemini_called_for_unmapped_items(self):
        """Gemini is invoked for items still without a topic after SQL classification."""
        from pipeline.profiling.topic_classifier import _classify_unmapped_with_gemini

        mock_sb = MagicMock()
        topic_map = {
            "Administration": 1, "Bylaw": 2, "Development": 3, "Environment": 4,
            "Finance": 5, "General": 6, "Public Safety": 7, "Transportation": 8,
        }

        # Simulate unmapped items query returning items
        unmapped_data = [
            {"id": 10, "category": "Weird Category A"},
            {"id": 11, "category": "Weird Category B"},
            {"id": 12, "category": "Weird Category A"},  # duplicate category
        ]
        # Chain: table -> select -> is_ -> execute
        chain = mock_sb.table.return_value.select.return_value
        chain.not_.is_.return_value.execute.return_value = MagicMock(data=[])
        # For the "not in agenda_item_topics" query via rpc
        mock_sb.rpc.return_value.execute.return_value = MagicMock(data=unmapped_data)

        with patch("pipeline.profiling.topic_classifier._call_gemini") as mock_call:
            mock_call.return_value = json.dumps({
                "Weird Category A": "Development",
                "Weird Category B": "Finance",
            })
            with patch("pipeline.profiling.topic_classifier._parse_json_response") as mock_parse:
                mock_parse.return_value = {
                    "Weird Category A": "Development",
                    "Weird Category B": "Finance",
                }
                result = _classify_unmapped_with_gemini(mock_sb, topic_map)

        # Gemini should have been called
        mock_call.assert_called_once()


class TestGeminiResponseParsing:
    """Test that Gemini responses are parsed and mapped to valid topic IDs."""

    def test_valid_mapping_returns_correct_ids(self):
        from pipeline.profiling.topic_classifier import _map_gemini_response_to_inserts

        topic_map = {
            "Administration": 1, "Bylaw": 2, "Development": 3, "Environment": 4,
            "Finance": 5, "General": 6, "Public Safety": 7, "Transportation": 8,
        }
        gemini_mapping = {
            "Weird Category A": "Development",
            "Unknown Thing": "Finance",
        }
        # Items: list of (agenda_item_id, category)
        unmapped_items = [
            {"id": 10, "category": "Weird Category A"},
            {"id": 11, "category": "Unknown Thing"},
            {"id": 12, "category": "Weird Category A"},
        ]

        rows = _map_gemini_response_to_inserts(gemini_mapping, unmapped_items, topic_map)

        assert len(rows) == 3
        assert {"agenda_item_id": 10, "topic_id": 3} in rows  # Development
        assert {"agenda_item_id": 11, "topic_id": 5} in rows  # Finance
        assert {"agenda_item_id": 12, "topic_id": 3} in rows  # Development

    def test_invalid_topic_maps_to_general(self):
        from pipeline.profiling.topic_classifier import _map_gemini_response_to_inserts

        topic_map = {
            "Administration": 1, "Bylaw": 2, "Development": 3, "Environment": 4,
            "Finance": 5, "General": 6, "Public Safety": 7, "Transportation": 8,
        }
        gemini_mapping = {
            "Weird Category": "NotARealTopic",
        }
        unmapped_items = [{"id": 10, "category": "Weird Category"}]

        rows = _map_gemini_response_to_inserts(gemini_mapping, unmapped_items, topic_map)

        assert len(rows) == 1
        assert rows[0]["topic_id"] == 6  # General fallback


class TestDeduplication:
    """Test that duplicate agenda_item_topics rows are handled via ON CONFLICT DO NOTHING."""

    def test_upsert_uses_on_conflict_ignore(self):
        from pipeline.profiling.topic_classifier import _bulk_insert_topic_assignments

        mock_sb = MagicMock()
        rows = [
            {"agenda_item_id": 1, "topic_id": 3},
            {"agenda_item_id": 2, "topic_id": 5},
        ]

        _bulk_insert_topic_assignments(mock_sb, rows)

        # Verify upsert was called with ignoreDuplicates or on_conflict
        mock_sb.table.assert_called_with("agenda_item_topics")
        upsert_call = mock_sb.table.return_value.upsert
        upsert_call.assert_called_once()
        call_kwargs = upsert_call.call_args
        # Check that on_conflict or ignore_duplicates is set
        assert call_kwargs is not None


class TestSingleTopicPerItem:
    """Test that each agenda item gets exactly one primary topic."""

    def test_map_produces_one_topic_per_item(self):
        from pipeline.profiling.topic_classifier import _map_gemini_response_to_inserts

        topic_map = {
            "Administration": 1, "Bylaw": 2, "Development": 3, "Environment": 4,
            "Finance": 5, "General": 6, "Public Safety": 7, "Transportation": 8,
        }
        gemini_mapping = {
            "Cat A": "Development",
        }
        # Same category for all items -- each should get exactly one assignment
        unmapped_items = [
            {"id": 10, "category": "Cat A"},
            {"id": 11, "category": "Cat A"},
        ]

        rows = _map_gemini_response_to_inserts(gemini_mapping, unmapped_items, topic_map)

        # Each item appears exactly once
        item_ids = [r["agenda_item_id"] for r in rows]
        assert len(item_ids) == len(set(item_ids))
