"""Legistar Web API scraper for municipalities using the Legistar platform."""

import os
import time
from datetime import date, datetime

import requests

from pipeline import config
from pipeline.scrapers.base import (
    BaseScraper,
    MunicipalityConfig,
    ScrapedDocument,
    ScrapedMeeting,
)


class LegistarScraper(BaseScraper):
    """Scraper for municipalities using the Legistar Web API.

    Uses the public Legistar Web API (webapi.legistar.com) to discover
    meetings and download associated documents.

    Expected source_config:
        {
            "type": "legistar",
            "client_id": "esquimalt",
            "timezone": "America/Vancouver",
            "video_source": {"type": "legistar_inline"}
        }
    """

    API_BASE = "https://webapi.legistar.com/v1"

    def __init__(self, municipality: MunicipalityConfig):
        super().__init__(municipality)
        self.client_id = self.source_config.get("client_id")
        if not self.client_id:
            raise ValueError(
                f"Legistar scraper requires 'client_id' in source_config for {municipality.slug}"
            )
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json"})

    def _api_url(self, endpoint: str) -> str:
        return f"{self.API_BASE}/{self.client_id}/{endpoint}"

    def _get(self, endpoint: str, params: dict | None = None) -> list | dict | None:
        """Make a GET request to the Legistar API with rate limiting."""
        url = self._api_url(endpoint)
        try:
            resp = self.session.get(url, params=params, timeout=config.REQUEST_TIMEOUT)
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            time.sleep(config.DELAY_BETWEEN_REQUESTS)
            return resp.json()
        except requests.RequestException as e:
            print(f"  [!] Legistar API error ({endpoint}): {e}")
            return None

    def discover_meetings(
        self, since_date: date | None = None
    ) -> list[ScrapedMeeting]:
        """Discover meetings from the Legistar Events API."""
        params = {"$orderby": "EventDate desc"}
        if since_date:
            params["$filter"] = f"EventDate ge datetime'{since_date.isoformat()}'"

        data = self._get("Events", params)
        if not data or not isinstance(data, list):
            return []

        meetings = []
        for event in data:
            event_date_str = event.get("EventDate", "")
            if not event_date_str:
                continue

            try:
                event_date = datetime.fromisoformat(
                    event_date_str.replace("T", " ").split("+")[0].split("Z")[0]
                ).date()
            except (ValueError, IndexError):
                continue

            meeting = ScrapedMeeting(
                date=event_date,
                title=event.get("EventBodyName", "Unknown"),
                meeting_type=event.get("EventBodyName"),
                organization_name=self.municipality.name,
                agenda_url=event.get("EventAgendaFile"),
                minutes_url=event.get("EventMinutesFile"),
                video_url=event.get("EventVideoPath"),
                source_id=str(event.get("EventId", "")),
                meta={"legistar_event": event},
            )

            # Fetch event items (agenda items with attachments)
            event_id = event.get("EventId")
            if event_id:
                items = self._get(f"Events/{event_id}/EventItems")
                if items and isinstance(items, list):
                    for item in items:
                        item_id = item.get("EventItemId")
                        if not item_id:
                            continue

                        attachments = self._get(
                            f"Events/{event_id}/EventItems/{item_id}/Attachments"
                        )
                        if attachments and isinstance(attachments, list):
                            for att in attachments:
                                doc = ScrapedDocument(
                                    title=att.get(
                                        "MatterAttachmentName", "Untitled"
                                    ),
                                    url=att.get("MatterAttachmentHyperlink", ""),
                                    category="Attachment",
                                    file_format=att.get(
                                        "MatterAttachmentFileName", ""
                                    )
                                    .rsplit(".", 1)[-1]
                                    if "." in att.get("MatterAttachmentFileName", "")
                                    else None,
                                )
                                if doc.url:
                                    meeting.documents.append(doc)

            meetings.append(meeting)

        print(f"  [Legistar] Discovered {len(meetings)} meeting(s) for {self.client_id}")
        return meetings

    def download_documents(
        self, meeting: ScrapedMeeting, target_dir: str
    ) -> list[str]:
        """Download meeting documents to target_dir."""
        os.makedirs(target_dir, exist_ok=True)
        downloaded = []

        # Download agenda PDF
        if meeting.agenda_url:
            path = self._download_file(meeting.agenda_url, target_dir, "Agenda")
            if path:
                downloaded.append(path)

        # Download minutes PDF
        if meeting.minutes_url:
            path = self._download_file(meeting.minutes_url, target_dir, "Minutes")
            if path:
                downloaded.append(path)

        # Download attachments
        for doc in meeting.documents:
            if doc.url:
                subfolder = os.path.join(target_dir, "Attachments")
                path = self._download_file(doc.url, subfolder, doc.title)
                if path:
                    downloaded.append(path)

        return downloaded

    def _download_file(
        self, url: str, target_dir: str, name: str
    ) -> str | None:
        """Download a single file. Returns the file path or None."""
        os.makedirs(target_dir, exist_ok=True)

        # Derive filename from URL or name
        filename = url.rsplit("/", 1)[-1] if "/" in url else f"{name}.pdf"
        file_path = os.path.join(target_dir, filename)

        if os.path.exists(file_path):
            return file_path

        try:
            resp = self.session.get(url, stream=True, timeout=config.REQUEST_TIMEOUT)
            resp.raise_for_status()
            with open(file_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
            print(f"  [+] Downloaded: {filename}")
            time.sleep(config.DELAY_BETWEEN_REQUESTS)
            return file_path
        except requests.RequestException as e:
            print(f"  [!] Failed to download {name}: {e}")
            return None
