"""Tests for pipeline.ingestion.ai_refiner module.

Covers: refine_meeting_data (full/agenda-only/retry/no-key), _merge_refinements,
        build_refinement_prompt, build_agenda_only_prompt
"""

import pytest
from unittest.mock import patch, MagicMock

from pipeline.ingestion.ai_refiner import (
    refine_meeting_data,
    _merge_refinements,
    build_refinement_prompt,
    build_agenda_only_prompt,
    MeetingRefinement,
    AgendaItemRecord,
    MotionRecord,
    SpeakerAlias,
    TranscriptCorrection,
    KeyQuote,
    KeyStatement,
    VoteRecord,
)


def _make_refinement(**kwargs):
    """Helper to create a MeetingRefinement with minimal required fields."""
    defaults = {
        "scratchpad_speaker_map": "",
        "scratchpad_timeline": "",
        "summary": "Test summary",
        "meeting_type": "Regular Council",
        "status": "Completed",
        "chair_person_name": "Sid Tobias",
        "attendees": ["Sid Tobias"],
        "speaker_aliases": [],
        "transcript_corrections": [],
        "items": [],
    }
    defaults.update(kwargs)
    return MeetingRefinement(**defaults)


# --- refine_meeting_data ---


class TestRefineMeetingData:
    @patch("pipeline.ingestion.ai_refiner.client")
    def test_full_refinement_calls_gemini(self, mock_client):
        """Full refinement (all 3 inputs) mocks Gemini and verifies structure."""
        mock_response = MagicMock()
        mock_response.parsed = _make_refinement()
        mock_client.models.generate_content.return_value = mock_response

        result = refine_meeting_data(
            agenda_text="Agenda text here" * 20,
            minutes_text="Minutes text here" * 20,
            transcript_text="Transcript text here" * 20,
            provider="gemini",
        )
        assert result is not None
        assert mock_client.models.generate_content.called

    @patch("pipeline.ingestion.ai_refiner.client")
    def test_agenda_only_mode(self, mock_client):
        """Agenda-only mode (no minutes, no transcript) uses different prompt."""
        mock_response = MagicMock()
        mock_response.parsed = _make_refinement(status="Planned")
        mock_client.models.generate_content.return_value = mock_response

        result = refine_meeting_data(
            agenda_text="Agenda text here",
            minutes_text="",
            transcript_text="",
            provider="gemini",
        )
        assert result is not None
        assert result.status == "Planned"

    @patch("pipeline.ingestion.ai_refiner.client")
    def test_gemini_failure_with_retries(self, mock_client):
        """Gemini failure triggers retries and eventually returns None."""
        mock_client.models.generate_content.side_effect = Exception("API Error")

        with patch("pipeline.ingestion.ai_refiner.time.sleep"):
            result = refine_meeting_data(
                agenda_text="Agenda",
                minutes_text="Minutes text" * 20,
                transcript_text="Transcript text" * 20,
                provider="gemini",
            )
        assert result is None
        assert mock_client.models.generate_content.call_count == 3  # max_retries

    @patch("pipeline.ingestion.ai_refiner.client", None)
    def test_no_api_key_returns_none(self):
        """When client is None (no API key), returns None gracefully."""
        result = refine_meeting_data(
            agenda_text="Agenda",
            minutes_text="Minutes" * 20,
            transcript_text="Transcript",
            provider="gemini",
        )
        assert result is None


# --- build_refinement_prompt ---


class TestBuildRefinementPrompt:
    def test_includes_all_sources(self):
        prompt = build_refinement_prompt(
            "Agenda text", "Minutes text", "Transcript text"
        )
        assert "AGENDA" in prompt
        assert "MINUTES" in prompt
        assert "TRANSCRIPT" in prompt
        assert "Agenda text" in prompt
        assert "Minutes text" in prompt
        assert "Transcript text" in prompt

    def test_no_transcript_uses_different_instructions(self):
        prompt = build_refinement_prompt("Agenda text", "Minutes text", "")
        assert "NO TRANSCRIPT AVAILABLE" in prompt
        assert "Not Available" in prompt

    def test_includes_attendees_context(self):
        prompt = build_refinement_prompt(
            "Agenda", "Minutes", "Transcript",
            attendees_context="Present: Mayor Tobias\nPresent: Councillor Mattson",
        )
        assert "KNOWN ATTENDEES" in prompt
        assert "Mayor Tobias" in prompt

    def test_includes_fingerprint_aliases(self):
        prompt = build_refinement_prompt(
            "Agenda", "Minutes", "Transcript",
            fingerprint_aliases=[
                {"label": "SPEAKER_01", "name": "Sid Tobias", "confidence": 0.92}
            ],
        )
        assert "PRE-IDENTIFIED SPEAKERS" in prompt
        assert "SPEAKER_01" in prompt
        assert "Sid Tobias" in prompt

    def test_includes_active_council_members(self):
        prompt = build_refinement_prompt(
            "Agenda", "Minutes", "Transcript",
            active_council_members=["Sid Tobias", "Ron Mattson"],
        )
        assert "ACTIVE COUNCIL MEMBERS" in prompt
        assert "Sid Tobias" in prompt


# --- build_agenda_only_prompt ---


class TestBuildAgendaOnlyPrompt:
    def test_includes_agenda_text(self):
        prompt = build_agenda_only_prompt("Full agenda text here")
        assert "Full agenda text here" in prompt
        assert "Planned" in prompt

    def test_upcoming_meeting_instructions(self):
        prompt = build_agenda_only_prompt("Some agenda")
        assert "UPCOMING" in prompt or "INCOMPLETE" in prompt


# --- _merge_refinements ---


class TestMergeRefinements:
    def test_empty_list_returns_none(self):
        assert _merge_refinements([]) is None

    def test_single_refinement_returns_itself(self):
        r = _make_refinement(
            items=[
                AgendaItemRecord(
                    item_order="1", title="Call to Order", description=None,
                    plain_english_summary=None, category="Procedural", tags=[],
                    financial_cost=None, funding_source=None, is_controversial=False,
                    debate_summary=None, key_quotes=[], discussion_start_time=0.0,
                    discussion_end_time=10.0, motions=[],
                )
            ]
        )
        merged = _merge_refinements([r])
        assert merged is not None
        assert len(merged.items) == 1
        assert merged.items[0].title == "Call to Order"

    def test_merges_attendees(self):
        r1 = _make_refinement(attendees=["Sid Tobias", "Ron Mattson"])
        r2 = _make_refinement(attendees=["Sid Tobias", "Damian Kowalewich"])
        merged = _merge_refinements([r1, r2])
        assert "Ron Mattson" in merged.attendees
        assert "Damian Kowalewich" in merged.attendees
        assert "Sid Tobias" in merged.attendees

    def test_merges_speaker_aliases(self):
        r1 = _make_refinement(
            speaker_aliases=[SpeakerAlias(label="Speaker_01", name="Sid Tobias")]
        )
        r2 = _make_refinement(
            speaker_aliases=[SpeakerAlias(label="Speaker_02", name="Ron Mattson")]
        )
        merged = _merge_refinements([r1, r2])
        assert len(merged.speaker_aliases) == 2

    def test_merges_transcript_corrections(self):
        r1 = _make_refinement(transcript_corrections=[])
        r2 = _make_refinement(
            transcript_corrections=[
                TranscriptCorrection(
                    original_text="Helmakin", corrected_text="Helmcken", reason="Typo"
                )
            ]
        )
        merged = _merge_refinements([r1, r2])
        assert len(merged.transcript_corrections) == 1

    def test_deduplicates_items_by_title(self):
        item1 = AgendaItemRecord(
            item_order="1", title="Call to Order", description=None,
            plain_english_summary=None, category="Procedural", tags=[],
            financial_cost=None, funding_source=None, is_controversial=False,
            debate_summary=None, key_quotes=[], discussion_start_time=0.0,
            discussion_end_time=10.0, motions=[],
        )
        item2 = AgendaItemRecord(
            item_order="1", title="Call to Order", description=None,
            plain_english_summary=None, category="Procedural", tags=[],
            financial_cost=None, funding_source=None, is_controversial=False,
            debate_summary="Additional info", key_quotes=[], discussion_start_time=5.0,
            discussion_end_time=15.0, motions=[],
        )
        r1 = _make_refinement(items=[item1])
        r2 = _make_refinement(items=[item2])
        merged = _merge_refinements([r1, r2])
        # Should deduplicate to 1 item, merging debate_summary
        assert len(merged.items) == 1
        assert merged.items[0].debate_summary == "Additional info"

    def test_merges_overlapping_items_timestamps(self):
        """Earlier start_time and later end_time should be kept."""
        item1 = AgendaItemRecord(
            item_order="2", title="Discussion", description=None,
            plain_english_summary=None, category="Substantive", tags=[],
            financial_cost=None, funding_source=None, is_controversial=False,
            debate_summary="Part A", key_quotes=[], discussion_start_time=100.0,
            discussion_end_time=None, motions=[],
        )
        item2 = AgendaItemRecord(
            item_order="2", title="Discussion", description=None,
            plain_english_summary=None, category="Substantive", tags=[],
            financial_cost=None, funding_source=None, is_controversial=False,
            debate_summary="Part B", key_quotes=[], discussion_start_time=None,
            discussion_end_time=200.0, motions=[],
        )
        r1 = _make_refinement(items=[item1])
        r2 = _make_refinement(items=[item2])
        merged = _merge_refinements([r1, r2])
        assert len(merged.items) == 1
        assert merged.items[0].discussion_start_time == 100.0
        assert merged.items[0].discussion_end_time == 200.0

    def test_merges_motions(self):
        item1 = AgendaItemRecord(
            item_order="3", title="Bylaw", description=None,
            plain_english_summary=None, category="Bylaws", tags=[],
            financial_cost=None, funding_source=None, is_controversial=False,
            debate_summary=None, key_quotes=[], discussion_start_time=None,
            discussion_end_time=None,
            motions=[MotionRecord(motion_text="First reading", result="CARRIED")],
        )
        item2 = AgendaItemRecord(
            item_order="3", title="Bylaw", description=None,
            plain_english_summary=None, category="Bylaws", tags=[],
            financial_cost=None, funding_source=None, is_controversial=False,
            debate_summary=None, key_quotes=[], discussion_start_time=None,
            discussion_end_time=None,
            motions=[MotionRecord(motion_text="Second reading", result="CARRIED")],
        )
        r1 = _make_refinement(items=[item1])
        r2 = _make_refinement(items=[item2])
        merged = _merge_refinements([r1, r2])
        assert len(merged.items) == 1
        assert len(merged.items[0].motions) == 2


# --- Pydantic model validation ---


class TestPydanticModels:
    def test_meeting_refinement_minimal(self):
        r = _make_refinement()
        assert r.summary == "Test summary"
        assert r.meeting_type == "Regular Council"

    def test_agenda_item_record(self):
        item = AgendaItemRecord(
            item_order="1",
            title="Test Item",
            description=None,
            plain_english_summary="A test",
            category="Procedural",
            tags=["test"],
            financial_cost=None,
            funding_source=None,
            is_controversial=False,
            debate_summary=None,
            key_quotes=[],
            discussion_start_time=0.0,
            discussion_end_time=10.0,
            motions=[],
        )
        assert item.item_order == "1"
        assert item.title == "Test Item"

    def test_motion_record_defaults(self):
        m = MotionRecord(motion_text="Move to approve", result="CARRIED")
        assert m.mover is None
        assert m.seconder is None
        assert m.votes == []
        assert m.plain_english_summary is None

    def test_speaker_alias(self):
        sa = SpeakerAlias(label="Speaker_01", name="John Doe")
        assert sa.label == "Speaker_01"

    def test_vote_record(self):
        v = VoteRecord(person_name="Jane Smith", vote="Yes", reason=None)
        assert v.vote == "Yes"

    def test_key_statement(self):
        ks = KeyStatement(
            statement_text="Traffic increased 40%",
            speaker="Councillor Smith",
            statement_type="claim",
            context="During rezoning debate",
            timestamp=1234.5,
        )
        assert ks.statement_type == "claim"
