"""Tests for pipeline.alignment module.

Covers: normalize_text, find_item_marker, find_motion_marker, align_meeting_items
"""

import pytest
from pipeline.alignment import (
    normalize_text,
    find_item_marker,
    find_motion_marker,
    align_meeting_items,
)


# --- normalize_text ---


class TestNormalizeText:
    def test_lowercases_and_strips(self):
        assert normalize_text("  Hello World  ") == "hello world"

    def test_removes_punctuation(self):
        assert normalize_text("Item 8.1: Rezoning Application") == "item 81 rezoning application"

    def test_empty_string(self):
        assert normalize_text("") == ""


# --- find_item_marker ---


class TestFindItemMarker:
    def _make_segments(self, texts_and_times):
        """Helper to build segments from (start, end, text) tuples."""
        return [
            {"start": s, "end": e, "text": t}
            for s, e, t in texts_and_times
        ]

    def test_call_to_order_returns_first_segment(self):
        segments = self._make_segments([
            (0.0, 5.0, "Good evening everyone"),
            (5.0, 10.0, "Welcome to the meeting"),
        ])
        result = find_item_marker(segments, "1", "Call to Order")
        assert result is not None
        assert result[0] == 0.0
        assert result[1] == 2.0  # High confidence score

    def test_termination_searches_last_segments(self):
        segments = self._make_segments([
            (0.0, 5.0, "Item discussion"),
            (100.0, 105.0, "I move we terminate the meeting"),
            (105.0, 110.0, "Carried"),
        ])
        result = find_item_marker(segments, "17", "Termination")
        assert result is not None
        assert result[0] == 100.0

    def test_adjournment_detected(self):
        segments = self._make_segments([
            (0.0, 5.0, "Some talk"),
            (200.0, 205.0, "I move to adjourn"),
        ])
        result = find_item_marker(segments, "15", "Adjournment")
        assert result is not None
        assert result[0] == 200.0

    def test_numeric_item_order_found(self):
        segments = self._make_segments([
            (50.0, 55.0, "Moving on to item 8.1"),
            (55.0, 60.0, "Discussion continues"),
        ])
        result = find_item_marker(segments, "8.1", "Rezoning Application")
        assert result is not None
        assert result[0] == 50.0

    def test_title_keyword_match(self):
        segments = self._make_segments([
            (200.0, 205.0, "Now we discuss the rezoning application for Helmcken Road"),
        ])
        result = find_item_marker(segments, "99", "Rezoning Application for Helmcken Road")
        assert result is not None
        assert result[0] == 200.0

    def test_no_match_returns_none(self):
        segments = self._make_segments([
            (0.0, 5.0, "Nothing relevant here"),
        ])
        result = find_item_marker(segments, "42", "Obscure Topic Nobody Discussed")
        assert result is None

    def test_empty_segments(self):
        result = find_item_marker([], "1", "Call to Order")
        # Call to Order with no segments returns (0.0, 2.0)
        assert result == (0.0, 2.0)

    def test_no_order_no_title(self):
        segments = self._make_segments([(0.0, 5.0, "test")])
        result = find_item_marker(segments, "", "")
        assert result is None


# --- find_motion_marker ---


class TestFindMotionMarker:
    def _make_segments(self, texts_and_times):
        return [
            {"start": s, "end": e, "text": t}
            for s, e, t in texts_and_times
        ]

    def test_finds_motion_in_window(self):
        segments = self._make_segments([
            (100.0, 105.0, "I move that we approve the rezoning application"),
            (105.0, 110.0, "Seconded"),
        ])
        result = find_motion_marker(segments, "approve the rezoning application", 90.0, 120.0)
        assert result is not None
        assert 95.0 <= result <= 115.0

    def test_generic_motion_fallback(self):
        segments = self._make_segments([
            (100.0, 105.0, "Some unrelated discussion"),
            (105.0, 110.0, "So moved"),
        ])
        result = find_motion_marker(segments, "specific unique text not present", 90.0, 120.0)
        assert result is not None
        assert result == 105.0

    def test_no_motion_found(self):
        segments = self._make_segments([
            (100.0, 105.0, "Just regular discussion about weather"),
        ])
        result = find_motion_marker(segments, "completely unrelated motion text about bylaws", 200.0, 300.0)
        assert result is None

    def test_empty_motion_text(self):
        segments = self._make_segments([(0.0, 5.0, "test")])
        result = find_motion_marker(segments, "", 0.0, 10.0)
        assert result is None

    def test_prefer_latest_for_termination(self):
        segments = self._make_segments([
            (400.0, 405.0, "I move to terminate the meeting"),
            (410.0, 415.0, "I also move to terminate"),
        ])
        result = find_motion_marker(
            segments, "terminate the meeting", 395.0, 420.0, prefer_latest=True
        )
        assert result is not None


# --- align_meeting_items ---


class TestAlignMeetingItems:
    def _make_segments(self, texts_and_times):
        return [
            {"start": s, "end": e, "text": t}
            for s, e, t in texts_and_times
        ]

    def test_empty_transcript_returns_items_unchanged(self):
        items = [{"item_order": "1", "title": "Test"}]
        result = align_meeting_items(items, [])
        assert result == items

    def test_basic_alignment_sets_times(self):
        segments = self._make_segments([
            (0.0, 5.0, "Good evening, call to order"),
            (50.0, 55.0, "Moving on to item 2"),
            (300.0, 305.0, "I move to terminate the meeting"),
            (305.0, 310.0, "Carried"),
        ])
        items = [
            {"item_order": "1", "title": "Call to Order"},
            {"item_order": "2", "title": "Approval of Agenda"},
            {"item_order": "3", "title": "Termination"},
        ]
        result = align_meeting_items(items, segments)
        assert len(result) == 3
        # All items should have start and end times set
        for item in result:
            assert "discussion_start_time" in item
            assert "discussion_end_time" in item
            assert item["discussion_start_time"] is not None
            assert item["discussion_end_time"] is not None

    def test_items_sorted_by_natural_order(self):
        segments = self._make_segments([
            (0.0, 5.0, "call to order"),
            (100.0, 105.0, "done"),
        ])
        items = [
            {"item_order": "2", "title": "Second"},
            {"item_order": "1", "title": "First"},
            {"item_order": "10", "title": "Tenth"},
        ]
        result = align_meeting_items(items, segments)
        orders = [r["item_order"] for r in result]
        assert orders == ["1", "2", "10"]

    def test_end_times_are_set_correctly(self):
        segments = self._make_segments([
            (0.0, 5.0, "call to order"),
            (500.0, 505.0, "end"),
        ])
        items = [
            {"item_order": "1", "title": "Call to Order"},
            {"item_order": "2", "title": "Middle Item"},
            {"item_order": "3", "title": "Termination"},
        ]
        result = align_meeting_items(items, segments)
        # Each item's end should be >= its start
        for item in result:
            assert item["discussion_end_time"] >= item["discussion_start_time"]
        # Last item's end should be meeting_end
        assert result[-1]["discussion_end_time"] == 505.0
