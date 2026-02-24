"""
Moshi push notification support for pipeline update-mode.

Sends a concise summary to the operator's phone when update-mode
detects and processes new content.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import requests

from pipeline import config

if TYPE_CHECKING:
    from pipeline.update_detector import ChangeReport


def _format_change_line(change) -> str:
    """Format a single MeetingChange into a human-readable line.

    Example output: "Jan 15 Council (minutes)"
    """
    from datetime import datetime

    # Parse meeting_date (format: "YYYY-MM-DD") into "Mon DD" format
    date_str = change.meeting_date
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        formatted_date = dt.strftime("%b %-d")
    except (ValueError, TypeError):
        formatted_date = date_str or "Unknown date"

    meeting_type = change.meeting_type or "Meeting"

    # Derive content type from change_type and details
    if change.change_type == "new_video":
        content_type = "video"
    elif change.details:
        # Extract content types from detail strings like "Missing agenda on disk"
        types = []
        for detail in change.details:
            detail_lower = detail.lower()
            if "agenda" in detail_lower:
                types.append("agenda")
            elif "minutes" in detail_lower:
                types.append("minutes")
            elif "transcript" in detail_lower:
                types.append("transcript")
        content_type = ", ".join(types) if types else "documents"
    else:
        content_type = "documents"

    return f"{formatted_date} {meeting_type} ({content_type})"


def send_update_notification(report: ChangeReport, processed_count: int = 0, test: bool = False) -> None:
    """Send a Moshi push notification summarizing pipeline update results.

    Args:
        report: ChangeReport from the update detector.
        processed_count: Number of meetings successfully re-processed.
        test: If True, prefix the notification title with [TEST].

    Silently returns (no crash) when:
    - MOSHI_TOKEN is not set
    - report.total_changes == 0
    - HTTP request fails
    """
    token = config.MOSHI_TOKEN
    if not token:
        return

    if report.total_changes == 0:
        return

    # Build title
    prefix = "[TEST] " if test else ""
    if processed_count > 0:
        title = f"{prefix}Pipeline: {processed_count} meetings updated"
    else:
        title = f"{prefix}Pipeline Update"

    # Build message body -- one line per meeting change
    all_changes = (
        list(report.meetings_new)
        + list(report.meetings_with_new_docs)
        + list(report.meetings_with_new_video)
    )

    lines = [_format_change_line(c) for c in all_changes]

    # Truncate if more than 5 meetings
    if len(lines) > 5:
        shown = lines[:5]
        remaining = len(lines) - 5
        shown.append(f"+{remaining} more")
        lines = shown

    message = "\n".join(lines)

    # Send notification
    payload = {
        "token": token,
        "title": title,
        "message": message,
    }

    try:
        resp = requests.post(
            "https://api.getmoshi.app/api/webhook",
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
        print(f"[notify] Push notification sent: {title}")
    except Exception as e:
        print(f"[notify] Failed to send notification: {e}")
