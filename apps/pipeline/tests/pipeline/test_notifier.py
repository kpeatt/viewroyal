"""Tests for the Moshi push notification module."""

from unittest.mock import patch

import responses

from pipeline.notifier import send_update_notification, _format_change_line
from pipeline.update_detector import ChangeReport, MeetingChange


def _make_change(
    date="2025-01-15",
    meeting_type="Council",
    change_type="new_documents",
    details=None,
    meta=None,
):
    """Helper to create a MeetingChange for testing."""
    return MeetingChange(
        archive_path=f"/archive/{date}",
        meeting_date=date,
        meeting_type=meeting_type,
        change_type=change_type,
        details=details or ["Missing minutes on disk"],
        meta=meta or {},
    )


def _make_report(doc_changes=None, video_changes=None):
    """Helper to create a ChangeReport for testing."""
    return ChangeReport(
        meetings_with_new_docs=doc_changes or [],
        meetings_with_new_video=video_changes or [],
    )


@responses.activate
@patch("pipeline.notifier.config")
def test_sends_notification_on_changes(mock_config):
    """When changes exist and token is set, POST to Moshi webhook."""
    mock_config.MOSHI_TOKEN = "test-token-123"

    responses.add(
        responses.POST,
        "https://api.getmoshi.app/api/webhook",
        json={"ok": True},
        status=200,
    )

    report = _make_report(
        doc_changes=[
            _make_change("2025-01-15", "Council", details=["Missing minutes on disk"]),
        ],
        video_changes=[
            _make_change("2025-02-03", "Council", change_type="new_video", details=["Vimeo video available"]),
        ],
    )

    send_update_notification(report, processed_count=2)

    assert len(responses.calls) == 1
    call = responses.calls[0]
    body = call.request.body
    import json
    payload = json.loads(body)

    assert payload["token"] == "test-token-123"
    assert payload["title"] == "Pipeline: 2 meetings updated"
    assert "Jan 15 Council" in payload["message"]
    assert "Feb 3 Council (video)" in payload["message"]


@responses.activate
@patch("pipeline.notifier.config")
def test_skips_when_no_changes(mock_config):
    """When report has 0 changes, no HTTP call should be made."""
    mock_config.MOSHI_TOKEN = "test-token-123"

    report = _make_report()  # Empty -- 0 changes

    send_update_notification(report)

    assert len(responses.calls) == 0


@responses.activate
@patch("pipeline.notifier.config")
def test_skips_when_no_token(mock_config):
    """When MOSHI_TOKEN is not set, no HTTP call should be made."""
    mock_config.MOSHI_TOKEN = None

    report = _make_report(
        doc_changes=[_make_change()],
    )

    send_update_notification(report)

    assert len(responses.calls) == 0


@responses.activate
@patch("pipeline.notifier.config")
def test_handles_http_error_gracefully(mock_config):
    """When Moshi returns 500, no exception should be raised."""
    mock_config.MOSHI_TOKEN = "test-token-123"

    responses.add(
        responses.POST,
        "https://api.getmoshi.app/api/webhook",
        json={"error": "server error"},
        status=500,
    )

    report = _make_report(
        doc_changes=[_make_change()],
    )

    # Should not raise
    send_update_notification(report, processed_count=1)

    assert len(responses.calls) == 1


@responses.activate
@patch("pipeline.notifier.config")
def test_message_truncation(mock_config):
    """When more than 5 meetings, show first 5 and '+N more'."""
    mock_config.MOSHI_TOKEN = "test-token-123"

    responses.add(
        responses.POST,
        "https://api.getmoshi.app/api/webhook",
        json={"ok": True},
        status=200,
    )

    # Create 8 document changes
    changes = [
        _make_change(f"2025-01-{15 + i:02d}", "Council")
        for i in range(8)
    ]
    report = _make_report(doc_changes=changes)

    send_update_notification(report, processed_count=8)

    assert len(responses.calls) == 1
    import json
    payload = json.loads(responses.calls[0].request.body)
    message = payload["message"]

    # Should show exactly 5 meetings + "+3 more"
    lines = message.split("\n")
    assert len(lines) == 6  # 5 meetings + "+3 more"
    assert "+3 more" in lines[-1]


def test_summary_format():
    """Verify meeting summary line includes date, type, and content type."""
    change = _make_change(
        date="2025-03-01",
        meeting_type="Special",
        change_type="new_documents",
        details=["Missing agenda on disk"],
    )

    line = _format_change_line(change)

    assert "Mar" in line
    assert "1" in line
    assert "Special" in line
    assert "agenda" in line
