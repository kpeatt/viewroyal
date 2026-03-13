"""Tests for key vote detection algorithm."""

import pytest
from unittest.mock import MagicMock, patch

from pipeline.profiling.key_vote_detector import (
    compute_vote_counts,
    detect_minority_positions,
    detect_close_votes,
    detect_ally_breaks,
    compute_pairwise_alignment,
    compute_composite_score,
    _get_vote_split,
    _detect_for_person,
    _fallback_context_summary,
    ALLY_ALIGNMENT_THRESHOLD,
)


# ── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def mock_supabase():
    """Create a mock Supabase client."""
    return MagicMock()


@pytest.fixture
def sample_person_votes():
    """Sample votes for a person with various motion results."""
    return [
        # Minority: voted No on CARRIED motion
        {"vote_id": 1, "vote": "No", "motion_id": 100, "person_id": 1,
         "result": "CARRIED", "motion_text": "Approve rezoning", "agenda_item_title": "Helmcken Rd Rezoning",
         "meeting_id": 10, "meeting_date": "2025-06-15"},
        # Minority: voted Yes on DEFEATED motion
        {"vote_id": 2, "vote": "Yes", "motion_id": 101, "person_id": 1,
         "result": "DEFEATED", "motion_text": "Increase park budget", "agenda_item_title": "Parks Budget",
         "meeting_id": 11, "meeting_date": "2025-07-20"},
        # Not minority: voted Yes on CARRIED motion
        {"vote_id": 3, "vote": "Yes", "motion_id": 102, "person_id": 1,
         "result": "CARRIED", "motion_text": "Approve minutes", "agenda_item_title": "Minutes Approval",
         "meeting_id": 12, "meeting_date": "2025-08-01"},
        # Minority: voted No on CARRIED AS AMENDED
        {"vote_id": 4, "vote": "No", "motion_id": 103, "person_id": 1,
         "result": "CARRIED AS AMENDED", "motion_text": "Amend bylaw 123", "agenda_item_title": "Bylaw 123",
         "meeting_id": 13, "meeting_date": "2025-09-10"},
    ]


@pytest.fixture
def sample_vote_counts():
    """Vote counts per motion from the votes table."""
    return {
        100: {"Yes": 5, "No": 2},        # margin 3 - not close
        101: {"Yes": 3, "No": 4},         # margin 1 - close
        102: {"Yes": 7, "No": 0},         # margin 7 - not close
        103: {"Yes": 4, "No": 3},         # margin 1 - close
        104: {"Yes": 4, "No": 4},         # margin 0 - very close (tie)
        105: {"Yes": 5, "No": 3},         # margin 2 - close
    }


# ── Test: compute_vote_counts ────────────────────────────────────────────


def test_compute_vote_counts(mock_supabase):
    """Vote counts computed from votes table, not motions columns."""
    mock_supabase.table.return_value.select.return_value.execute.return_value = MagicMock(
        data=[
            {"motion_id": 100, "vote": "Yes"},
            {"motion_id": 100, "vote": "Yes"},
            {"motion_id": 100, "vote": "No"},
            {"motion_id": 101, "vote": "Yes"},
            {"motion_id": 101, "vote": "No"},
            {"motion_id": 101, "vote": "No"},
        ]
    )

    counts = compute_vote_counts(mock_supabase)

    assert counts[100] == {"Yes": 2, "No": 1}
    assert counts[101] == {"Yes": 1, "No": 2}


def test_compute_vote_counts_empty(mock_supabase):
    """Returns empty dict when no votes exist."""
    mock_supabase.table.return_value.select.return_value.execute.return_value = MagicMock(data=[])
    counts = compute_vote_counts(mock_supabase)
    assert counts == {}


# ── Test: _get_vote_split ────────────────────────────────────────────────


def test_get_vote_split():
    """Formats vote split correctly."""
    yes, no, split = _get_vote_split({"Yes": 5, "No": 2})
    assert yes == 5
    assert no == 2
    assert split == "5-2"


def test_get_vote_split_empty():
    """Handles empty vote counts."""
    yes, no, split = _get_vote_split({})
    assert yes == 0
    assert no == 0
    assert split == "0-0"


# ── Test: detect_minority_positions ──────────────────────────────────────


def test_minority_no_on_carried(sample_person_votes, sample_vote_counts):
    """Detects voting No on a CARRIED motion as minority."""
    minorities = detect_minority_positions(sample_person_votes, sample_vote_counts)
    assert 100 in minorities  # No on CARRIED


def test_minority_yes_on_defeated(sample_person_votes, sample_vote_counts):
    """Detects voting Yes on a DEFEATED motion as minority."""
    minorities = detect_minority_positions(sample_person_votes, sample_vote_counts)
    assert 101 in minorities  # Yes on DEFEATED


def test_minority_no_on_carried_as_amended(sample_person_votes, sample_vote_counts):
    """Detects voting No on a CARRIED AS AMENDED motion as minority."""
    minorities = detect_minority_positions(sample_person_votes, sample_vote_counts)
    assert 103 in minorities  # No on CARRIED AS AMENDED


def test_not_minority_yes_on_carried(sample_person_votes, sample_vote_counts):
    """Voting Yes on CARRIED is NOT a minority position."""
    minorities = detect_minority_positions(sample_person_votes, sample_vote_counts)
    assert 102 not in minorities  # Yes on CARRIED


def test_minority_case_insensitive():
    """Detection works regardless of case in vote/result values."""
    votes = [
        {"motion_id": 200, "vote": "no", "result": "carried"},
        {"motion_id": 201, "vote": "yes", "result": "Not Carried"},
    ]
    minorities = detect_minority_positions(votes, {})
    assert 200 in minorities
    assert 201 in minorities


# ── Test: detect_close_votes ─────────────────────────────────────────────


def test_close_vote_margin_1(sample_person_votes, sample_vote_counts):
    """Margin of 1 is a close vote with closeness_factor 0.75."""
    close = detect_close_votes(sample_person_votes, sample_vote_counts)
    # Motion 101: 3-4 margin=1, Motion 103: 4-3 margin=1
    assert close.get(101) == 0.75
    assert close.get(103) == 0.75


def test_close_vote_margin_0():
    """Margin of 0 (tie) has closeness_factor 1.0."""
    votes = [{"motion_id": 104, "vote": "Yes", "person_id": 1}]
    counts = {104: {"Yes": 4, "No": 4}}
    close = detect_close_votes(votes, counts)
    assert close[104] == 1.0


def test_close_vote_margin_2():
    """Margin of 2 has closeness_factor 0.5."""
    votes = [{"motion_id": 105, "vote": "Yes", "person_id": 1}]
    counts = {105: {"Yes": 5, "No": 3}}
    close = detect_close_votes(votes, counts)
    assert close[105] == 0.5


def test_not_close_vote_margin_3(sample_person_votes, sample_vote_counts):
    """Margin of 3 or more is NOT a close vote."""
    close = detect_close_votes(sample_person_votes, sample_vote_counts)
    assert 100 not in close  # 5-2 margin=3
    assert 102 not in close  # 7-0 margin=7


def test_close_vote_no_counts():
    """Votes without counts in the lookup are not flagged."""
    votes = [{"motion_id": 999, "vote": "Yes", "person_id": 1}]
    close = detect_close_votes(votes, {})
    assert 999 not in close


# ── Test: compute_pairwise_alignment ─────────────────────────────────────


def test_pairwise_alignment_high():
    """Two councillors who always agree have 100% alignment."""
    all_votes = {
        1: {100: "Yes", 101: "No", 102: "Yes", 103: "Yes", 104: "No"},
        2: {100: "Yes", 101: "No", 102: "Yes", 103: "Yes", 104: "No"},
    }
    alignments = compute_pairwise_alignment(all_votes)
    assert alignments[(1, 2)] == 1.0
    assert alignments[(2, 1)] == 1.0  # symmetric


def test_pairwise_alignment_partial():
    """Alignment rate reflects actual agreement."""
    all_votes = {
        1: {100: "Yes", 101: "No", 102: "Yes", 103: "Yes", 104: "No"},
        2: {100: "Yes", 101: "Yes", 102: "Yes", 103: "No", 104: "No"},
    }
    alignments = compute_pairwise_alignment(all_votes)
    # Agree on 100, 102, 104 = 3/5 = 0.6
    assert alignments[(1, 2)] == pytest.approx(0.6)


def test_pairwise_alignment_insufficient_shared_votes():
    """Pairs with fewer than MIN_SHARED_VOTES_FOR_ALIGNMENT are excluded."""
    all_votes = {
        1: {100: "Yes", 101: "No"},
        2: {100: "Yes", 102: "No"},
    }
    alignments = compute_pairwise_alignment(all_votes)
    # Only 1 shared vote (motion 100), below threshold of 5
    assert (1, 2) not in alignments


# ── Test: detect_ally_breaks ─────────────────────────────────────────────


def test_ally_break_detected():
    """Ally break flagged when usually-aligned councillors disagree."""
    person_votes = [
        {"motion_id": 200, "vote": "No", "person_id": 1},
    ]
    # Person 1 and 2 are allies (90% alignment)
    all_votes = {
        1: {100: "Yes", 101: "No", 102: "Yes", 103: "Yes", 104: "No", 200: "No"},
        2: {100: "Yes", 101: "No", 102: "Yes", 103: "Yes", 104: "No", 200: "Yes"},
    }
    alignments = {(1, 2): 0.90, (2, 1): 0.90}
    person_names = {1: "Alice", 2: "Bob"}

    breaks = detect_ally_breaks(1, person_votes, all_votes, alignments, person_names)

    assert 200 in breaks
    assert breaks[200][0]["person_id"] == 2
    assert breaks[200][0]["person_name"] == "Bob"
    assert breaks[200][0]["usual_alignment"] == 0.90


def test_no_ally_break_low_alignment():
    """No ally break when pair alignment is below threshold."""
    person_votes = [
        {"motion_id": 200, "vote": "No", "person_id": 1},
    ]
    all_votes = {
        1: {200: "No"},
        2: {200: "Yes"},
    }
    # Below 80% threshold
    alignments = {(1, 2): 0.60, (2, 1): 0.60}
    person_names = {1: "Alice", 2: "Bob"}

    breaks = detect_ally_breaks(1, person_votes, all_votes, alignments, person_names)
    assert len(breaks) == 0


def test_no_ally_break_when_agree():
    """No ally break when allies voted the same way."""
    person_votes = [
        {"motion_id": 200, "vote": "Yes", "person_id": 1},
    ]
    all_votes = {
        1: {200: "Yes"},
        2: {200: "Yes"},
    }
    alignments = {(1, 2): 0.95, (2, 1): 0.95}
    person_names = {1: "Alice", 2: "Bob"}

    breaks = detect_ally_breaks(1, person_votes, all_votes, alignments, person_names)
    assert len(breaks) == 0


# ── Test: compute_composite_score ────────────────────────────────────────


def test_composite_score_all_patterns():
    """Score combines all three patterns correctly."""
    score = compute_composite_score(
        is_minority=True,
        closeness_factor=0.75,
        ally_break_count=2,
    )
    # 3 + 0.75*2 + 2*1 = 3 + 1.5 + 2 = 6.5
    assert score == pytest.approx(6.5)


def test_composite_score_minority_only():
    """Minority-only vote scores 3.0."""
    score = compute_composite_score(
        is_minority=True,
        closeness_factor=0.0,
        ally_break_count=0,
    )
    assert score == pytest.approx(3.0)


def test_composite_score_close_vote_only():
    """Close-vote-only with margin 0 scores 2.0."""
    score = compute_composite_score(
        is_minority=False,
        closeness_factor=1.0,
        ally_break_count=0,
    )
    assert score == pytest.approx(2.0)


def test_composite_score_ally_break_only():
    """Ally-break-only scores 1.0 per break."""
    score = compute_composite_score(
        is_minority=False,
        closeness_factor=0.0,
        ally_break_count=3,
    )
    assert score == pytest.approx(3.0)


def test_composite_score_zero():
    """No patterns triggered gives score 0."""
    score = compute_composite_score(
        is_minority=False,
        closeness_factor=0.0,
        ally_break_count=0,
    )
    assert score == pytest.approx(0.0)


def test_composite_score_ranking():
    """Higher-scoring votes rank above lower-scoring ones."""
    minority_close = compute_composite_score(True, 1.0, 0)  # 3 + 2 = 5
    minority_only = compute_composite_score(True, 0.0, 0)    # 3
    close_only = compute_composite_score(False, 0.75, 0)      # 1.5
    ally_only = compute_composite_score(False, 0.0, 1)        # 1

    assert minority_close > minority_only > close_only > ally_only


# ── Test: _detect_for_person (integration) ───────────────────────────────


@patch("pipeline.profiling.key_vote_detector._generate_context_summary")
def test_detect_for_person_integration(mock_context, sample_person_votes, sample_vote_counts):
    """Full detection pipeline finds expected key votes."""
    mock_context.return_value = "Test context summary"

    all_votes_by_person = {
        1: {100: "No", 101: "Yes", 102: "Yes", 103: "No"},
    }
    alignments = {}
    person_names = {1: "Test Councillor"}

    records = _detect_for_person(
        person_id=1,
        person_name="Test Councillor",
        person_votes=sample_person_votes,
        vote_counts=sample_vote_counts,
        all_votes_by_person=all_votes_by_person,
        alignments=alignments,
        person_names=person_names,
    )

    # Should find key votes for motions 100 (minority), 101 (minority+close), 103 (minority+close)
    motion_ids = {r["motion_id"] for r in records}
    assert 100 in motion_ids  # minority
    assert 101 in motion_ids  # minority + close
    assert 103 in motion_ids  # minority + close
    assert 102 not in motion_ids  # nothing special about this one

    # Records should be sorted by composite score descending
    scores = [r["composite_score"] for r in records]
    assert scores == sorted(scores, reverse=True)


@patch("pipeline.profiling.key_vote_detector._generate_context_summary")
def test_detect_for_person_with_zero_motions_yes_no(mock_context):
    """Detection works when motions.yes_votes/no_votes are 0 (uses votes table counts)."""
    mock_context.return_value = "Test context"

    # Person voted No on a CARRIED motion, but we only have vote_counts from votes table
    person_votes = [
        {"vote_id": 1, "vote": "No", "motion_id": 300, "person_id": 1,
         "result": "CARRIED", "motion_text": "Test motion", "agenda_item_title": "Test",
         "meeting_id": 10, "meeting_date": "2025-01-01"},
    ]
    # Vote counts computed from votes table (not motions.yes_votes/no_votes)
    vote_counts = {300: {"Yes": 5, "No": 2}}

    all_votes_by_person = {1: {300: "No"}}

    records = _detect_for_person(
        person_id=1,
        person_name="Test",
        person_votes=person_votes,
        vote_counts=vote_counts,
        all_votes_by_person=all_votes_by_person,
        alignments={},
        person_names={1: "Test"},
    )

    assert len(records) == 1
    assert records[0]["motion_id"] == 300
    assert "minority" in records[0]["detection_type"]
    assert records[0]["vote_split"] == "5-2"


# ── Test: _fallback_context_summary ──────────────────────────────────────


def test_fallback_context_minority():
    """Fallback summary mentions minority position."""
    summary = _fallback_context_summary(
        "Alice", "No", "5-2", "CARRIED", "Helmcken Rd Rezoning", ["minority"]
    )
    assert "5-2" in summary
    assert "No" in summary
    assert "Helmcken" in summary


def test_fallback_context_close_vote():
    """Fallback summary mentions close decision."""
    summary = _fallback_context_summary(
        "Bob", "Yes", "4-3", "CARRIED", "Budget Amendment", ["close_vote"]
    )
    assert "close" in summary.lower()
    assert "4-3" in summary
