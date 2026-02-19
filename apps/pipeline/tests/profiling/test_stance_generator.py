"""Tests for pipeline.profiling.stance_generator -- stance generation, evidence gathering, Gemini interaction."""

import json

import pytest
from unittest.mock import patch, MagicMock

from pipeline.profiling.stance_generator import (
    TOPICS,
    _build_prompt,
    _call_gemini,
    _determine_confidence,
    _enrich_quotes_with_meeting_id,
    _gather_evidence,
    _normalize_category_to_topic,
    _parse_json_response,
    _parse_stance_response,
    _upsert_stance,
)


# ── Category Normalization ──────────────────────────────────────────────


class TestNormalizeCategoryToTopic:
    def test_bylaw_keywords(self):
        assert _normalize_category_to_topic("Bylaw Review") == "Bylaw"
        assert _normalize_category_to_topic("Zoning Amendment") == "Bylaw"
        assert _normalize_category_to_topic("Rezoning Application") == "Bylaw"

    def test_development_keywords(self):
        assert _normalize_category_to_topic("Development Permit") == "Development"
        assert _normalize_category_to_topic("Land Use Planning") == "Development"
        assert _normalize_category_to_topic("Housing Strategy") == "Development"
        assert _normalize_category_to_topic("OCP Amendment") == "Development"

    def test_environment_keywords(self):
        assert _normalize_category_to_topic("Environmental Assessment") == "Environment"
        assert _normalize_category_to_topic("Parks and Trails") == "Environment"
        assert _normalize_category_to_topic("Climate Action Plan") == "Environment"
        assert _normalize_category_to_topic("Tree Preservation") == "Environment"

    def test_finance_keywords(self):
        assert _normalize_category_to_topic("Financial Report") == "Finance"
        assert _normalize_category_to_topic("Budget 2025") == "Finance"
        assert _normalize_category_to_topic("Tax Rate") == "Finance"
        assert _normalize_category_to_topic("Capital Plan") == "Finance"

    def test_transportation_keywords(self):
        assert _normalize_category_to_topic("Transportation Master Plan") == "Transportation"
        assert _normalize_category_to_topic("Traffic Calming") == "Transportation"
        assert _normalize_category_to_topic("Road Improvement") == "Transportation"
        assert _normalize_category_to_topic("Transit Service") == "Transportation"

    def test_public_safety_keywords(self):
        assert _normalize_category_to_topic("Public Safety Report") == "Public Safety"
        assert _normalize_category_to_topic("Police Board") == "Public Safety"
        assert _normalize_category_to_topic("Fire Department") == "Public Safety"
        assert _normalize_category_to_topic("Emergency Plan") == "Public Safety"

    def test_administration_keywords(self):
        assert _normalize_category_to_topic("Administration Report") == "Administration"
        assert _normalize_category_to_topic("Committee Appointments") == "Administration"
        assert _normalize_category_to_topic("Minutes Approval") == "Administration"
        assert _normalize_category_to_topic("Consent Agenda") == "Administration"

    def test_general_fallback(self):
        assert _normalize_category_to_topic("Something Unrelated") == "General"
        assert _normalize_category_to_topic("") == "General"
        assert _normalize_category_to_topic(None) == "General"

    def test_case_insensitive(self):
        assert _normalize_category_to_topic("BYLAW REVIEW") == "Bylaw"
        assert _normalize_category_to_topic("development PERMIT") == "Development"


# ── Confidence Determination ────────────────────────────────────────────


class TestDetermineConfidence:
    def test_low_confidence(self):
        assert _determine_confidence(0) == "low"
        assert _determine_confidence(1) == "low"
        assert _determine_confidence(2) == "low"

    def test_medium_confidence(self):
        assert _determine_confidence(3) == "medium"
        assert _determine_confidence(5) == "medium"
        assert _determine_confidence(7) == "medium"

    def test_high_confidence(self):
        assert _determine_confidence(8) == "high"
        assert _determine_confidence(15) == "high"
        assert _determine_confidence(100) == "high"


# ── JSON Parsing ────────────────────────────────────────────────────────


class TestParseJsonResponse:
    def test_valid_json(self):
        text = '{"position": "supports", "position_score": 0.8, "summary": "Test"}'
        result = _parse_json_response(text)
        assert result["position"] == "supports"
        assert result["position_score"] == 0.8

    def test_json_with_markdown_fencing(self):
        text = '```json\n{"position": "opposes", "position_score": -0.5, "summary": "Test"}\n```'
        result = _parse_json_response(text)
        assert result["position"] == "opposes"

    def test_missing_required_fields(self):
        text = '{"position": "neutral"}'
        result = _parse_json_response(text, required_fields={"position", "summary"})
        assert result is None

    def test_invalid_json(self):
        result = _parse_json_response("not json at all")
        assert result is None

    def test_non_dict_json(self):
        result = _parse_json_response("[1, 2, 3]")
        assert result is None


class TestParseStanceResponse:
    def test_valid_stance(self):
        text = json.dumps({
            "position": "supports",
            "position_score": 0.7,
            "summary": "Councillor supports development.",
            "key_quotes": [],
            "confidence_note": "Based on 5 statements",
        })
        result = _parse_stance_response(text)
        assert result is not None
        assert result["position"] == "supports"

    def test_missing_required_field(self):
        text = json.dumps({"position": "supports"})
        result = _parse_stance_response(text)
        assert result is None


# ── Prompt Building ─────────────────────────────────────────────────────


class TestBuildPrompt:
    def test_prompt_includes_councillor_and_topic(self):
        evidence = {"key_statements": [], "votes": [], "statement_count": 0}
        prompt = _build_prompt("Jane Doe", "Finance", evidence)
        assert "Jane Doe" in prompt
        assert "Finance" in prompt

    def test_prompt_low_evidence_hedged_language(self):
        evidence = {"key_statements": [{"text": "test", "meeting_date": "2025-01-01", "agenda_item_title": "Budget"}], "votes": [], "statement_count": 1}
        prompt = _build_prompt("Jane Doe", "Finance", evidence)
        assert "hedged language" in prompt.lower() or "Limited data" in prompt

    def test_prompt_medium_evidence(self):
        stmts = [{"text": f"stmt {i}", "meeting_date": "2025-01-01", "agenda_item_title": "Item"} for i in range(5)]
        evidence = {"key_statements": stmts, "votes": [], "statement_count": 5}
        prompt = _build_prompt("Jane Doe", "Finance", evidence)
        assert "measured language" in prompt.lower() or "Generally appears" in prompt

    def test_prompt_high_evidence(self):
        stmts = [{"text": f"stmt {i}", "meeting_date": "2025-01-01", "agenda_item_title": "Item"} for i in range(10)]
        evidence = {"key_statements": stmts, "votes": [], "statement_count": 10}
        prompt = _build_prompt("Jane Doe", "Finance", evidence)
        assert "confident assertions" in prompt.lower() or "Consistently supports" in prompt

    def test_prompt_includes_votes(self):
        evidence = {
            "key_statements": [],
            "votes": [
                {"vote": "For", "motion_text": "Approve budget", "result": "Carried", "meeting_date": "2025-01-01"}
            ],
            "statement_count": 1,
        }
        prompt = _build_prompt("Jane Doe", "Finance", evidence)
        assert "Approve budget" in prompt
        assert "Voted For" in prompt


# ── Quote Enrichment ────────────────────────────────────────────────────


class TestEnrichQuotesWithMeetingId:
    def test_enriches_by_date_and_text(self):
        evidence = {
            "key_statements": [
                {"text": "I strongly support this initiative for climate action", "meeting_date": "2025-06-15", "meeting_id": 42}
            ],
            "votes": [],
        }
        quotes = [
            {"text": "I strongly support this initiative for climate action", "meeting_date": "2025-06-15"}
        ]
        enriched = _enrich_quotes_with_meeting_id(quotes, evidence)
        assert enriched[0]["meeting_id"] == 42

    def test_enriches_by_date_fallback(self):
        evidence = {
            "key_statements": [
                {"text": "Original text here that's different", "meeting_date": "2025-06-15", "meeting_id": 42}
            ],
            "votes": [],
        }
        quotes = [
            {"text": "Completely different text", "meeting_date": "2025-06-15"}
        ]
        # Date-only fallback: only 1 item on that date
        enriched = _enrich_quotes_with_meeting_id(quotes, evidence)
        assert enriched[0]["meeting_id"] == 42

    def test_preserves_existing_meeting_id(self):
        evidence = {"key_statements": [], "votes": []}
        quotes = [{"text": "test", "meeting_id": 99, "meeting_date": "2025-01-01"}]
        enriched = _enrich_quotes_with_meeting_id(quotes, evidence)
        assert enriched[0]["meeting_id"] == 99

    def test_normalizes_date_field(self):
        evidence = {"key_statements": [], "votes": []}
        quotes = [{"text": "test", "meeting_id": 99, "meeting_date": "2025-01-01"}]
        enriched = _enrich_quotes_with_meeting_id(quotes, evidence)
        assert "date" in enriched[0]

    def test_skips_non_dict_entries(self):
        evidence = {"key_statements": [], "votes": []}
        quotes = ["not a dict", {"text": "valid", "meeting_date": "2025-01-01"}]
        enriched = _enrich_quotes_with_meeting_id(quotes, evidence)
        assert len(enriched) == 1


# ── Gemini Call (mocked) ────────────────────────────────────────────────


class TestCallGemini:
    @patch("pipeline.profiling.stance_generator._get_gemini_client")
    def test_successful_call(self, mock_get_client):
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.text = '{"position": "supports"}'
        mock_client.models.generate_content.return_value = mock_response
        mock_get_client.return_value = mock_client

        result = _call_gemini("test prompt")
        assert result == '{"position": "supports"}'

    @patch("pipeline.profiling.stance_generator._get_gemini_client")
    def test_retries_on_transient_error(self, mock_get_client):
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "ok"
        mock_client.models.generate_content.side_effect = [
            Exception("429 rate limit exceeded"),
            mock_response,
        ]
        mock_get_client.return_value = mock_client

        with patch("pipeline.profiling.stance_generator.time.sleep"):
            result = _call_gemini("test prompt")
        assert result == "ok"

    @patch("pipeline.profiling.stance_generator._get_gemini_client")
    def test_non_transient_error_returns_none(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception("Invalid API key")
        mock_get_client.return_value = mock_client

        result = _call_gemini("test prompt")
        assert result is None


# ── Evidence Gathering (mocked Supabase) ────────────────────────────────


class TestGatherEvidence:
    def test_gathers_statements_filtered_by_topic(self):
        """Evidence is filtered by topic via _normalize_category_to_topic in Python."""
        # Build a fresh mock that tracks which table is queried.
        # _gather_evidence calls:
        #   supabase.table("key_statements").select(...).eq(...).not_.is_(...).execute()
        #   supabase.table("votes").select(...).eq(...).execute()
        supabase = MagicMock()

        def _make_chainable_table(data):
            """Create a mock table that supports fluent chaining including .not_.is_()."""
            mock_table = MagicMock()
            for method in ["select", "eq", "neq", "is_"]:
                getattr(mock_table, method).return_value = mock_table
            # .not_ is accessed as an attribute, then .is_() is called on it
            mock_table.not_ = mock_table
            mock_table.execute.return_value = MagicMock(data=data)
            return mock_table

        def table_side_effect(name):
            if name == "key_statements":
                return _make_chainable_table([
                    {
                        "id": 1,
                        "statement_text": "I support the budget increase",
                        "statement_type": "opinion",
                        "context": "Budget discussion",
                        "source_segment_ids": [10],
                        "agenda_item_id": 5,
                        "agenda_items": {"id": 5, "title": "Budget Review", "category": "Financial Report"},
                        "meetings": {"id": 100, "meeting_date": "2025-06-15"},
                    },
                    {
                        "id": 2,
                        "statement_text": "The park needs improvement",
                        "statement_type": "opinion",
                        "context": "Parks discussion",
                        "source_segment_ids": [20],
                        "agenda_item_id": 6,
                        "agenda_items": {"id": 6, "title": "Parks Update", "category": "Environmental Assessment"},
                        "meetings": {"id": 101, "meeting_date": "2025-06-16"},
                    },
                ])
            else:
                return _make_chainable_table([])

        supabase.table.side_effect = table_side_effect

        evidence = _gather_evidence(supabase, person_id=1, topic="Finance")
        # Only the Financial Report item should match Finance topic
        finance_statements = evidence["key_statements"]
        assert len(finance_statements) == 1
        assert "budget" in finance_statements[0]["text"].lower()

    def test_empty_evidence(self, mock_supabase):
        mock_supabase.table.return_value.execute.return_value = MagicMock(data=[])
        evidence = _gather_evidence(mock_supabase, person_id=1, topic="Finance")
        assert evidence["statement_count"] == 0
        assert evidence["key_statements"] == []
        assert evidence["votes"] == []

    def test_handles_query_error(self, mock_supabase):
        mock_supabase.table.return_value.execute.side_effect = Exception("DB error")
        evidence = _gather_evidence(mock_supabase, person_id=1, topic="Finance")
        assert evidence["statement_count"] == 0


# ── Upsert (mocked Supabase) ───────────────────────────────────────────


class TestUpsertStance:
    def test_successful_upsert(self, mock_supabase):
        result = {
            "position": "supports",
            "position_score": 0.7,
            "summary": "Supports financial initiatives",
            "key_quotes": [],
        }
        success = _upsert_stance(mock_supabase, person_id=1, topic="Finance", result=result, statement_count=5)
        assert success is True
        mock_supabase.table.assert_called_with("councillor_stances")

    def test_upsert_failure(self, mock_supabase):
        mock_supabase.table.return_value.execute.side_effect = Exception("DB error")
        result = {
            "position": "supports",
            "position_score": 0.7,
            "summary": "Test",
            "key_quotes": [],
        }
        success = _upsert_stance(mock_supabase, person_id=1, topic="Finance", result=result, statement_count=5)
        assert success is False

    def test_upsert_sets_confidence(self, mock_supabase):
        result = {
            "position": "neutral",
            "position_score": 0.0,
            "summary": "Neutral on topic",
            "key_quotes": [],
        }
        _upsert_stance(mock_supabase, person_id=1, topic="General", result=result, statement_count=2)
        call_args = mock_supabase.table.return_value.upsert.call_args
        row = call_args[0][0]
        assert row["confidence"] == "low"


# ── Snapshot Testing for Stance Structure ───────────────────────────────


class TestStanceStructureSnapshot:
    def test_stance_output_structure(self, snapshot):
        """Verify the processed stance output structure matches snapshot."""
        # This is the kind of response Gemini would return
        raw_gemini_response = json.dumps({
            "position": "supports",
            "position_score": 0.75,
            "summary": "Councillor Smith has consistently supported environmental initiatives, voting in favor of climate action plans and speaking positively about park improvements.",
            "key_quotes": [
                {"text": "We need to invest more in our parks", "meeting_date": "2025-06-15", "segment_id": None},
                {"text": "Climate action is a priority for our community", "meeting_date": "2025-07-20", "segment_id": None},
            ],
            "confidence_note": "Based on 10 statements across 6 meetings",
        })

        parsed = _parse_stance_response(raw_gemini_response)
        assert parsed is not None

        # Build the row that would be upserted (mimicking _upsert_stance logic)
        confidence = _determine_confidence(10)
        key_quotes = parsed.get("key_quotes", [])

        output = {
            "person_id": 35,
            "topic": "Environment",
            "position": parsed["position"],
            "position_score": float(parsed["position_score"]),
            "summary": parsed["summary"],
            "evidence_quotes": key_quotes,
            "statement_count": 10,
            "confidence": confidence,
        }

        assert output == snapshot

    def test_low_confidence_stance_structure(self, snapshot):
        """Verify low-confidence stance output matches snapshot."""
        raw_response = json.dumps({
            "position": "neutral",
            "position_score": 0.1,
            "summary": "Limited data suggests Councillor Jones may lean towards supporting transportation improvements, but evidence is insufficient for a definitive position.",
            "key_quotes": [
                {"text": "The road needs repair", "meeting_date": "2025-03-10", "segment_id": None},
            ],
            "confidence_note": "Based on 1 statement in 1 meeting",
        })

        parsed = _parse_stance_response(raw_response)
        confidence = _determine_confidence(1)

        output = {
            "person_id": 40,
            "topic": "Transportation",
            "position": parsed["position"],
            "position_score": float(parsed["position_score"]),
            "summary": parsed["summary"],
            "evidence_quotes": parsed.get("key_quotes", []),
            "statement_count": 1,
            "confidence": confidence,
        }

        assert output == snapshot


# ── Topics constant ─────────────────────────────────────────────────────


class TestTopicsConstant:
    def test_eight_topics_defined(self):
        assert len(TOPICS) == 8

    def test_expected_topics(self):
        expected = {"Administration", "Bylaw", "Development", "Environment", "Finance", "General", "Public Safety", "Transportation"}
        assert set(TOPICS) == expected
