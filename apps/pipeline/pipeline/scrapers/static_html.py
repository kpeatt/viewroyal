"""Static HTML scraper for municipalities with simple HTML meeting pages."""

import os
import re
import time
from datetime import date, datetime
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from pipeline import config
from pipeline.scrapers.base import (
    BaseScraper,
    MunicipalityConfig,
    ScrapedDocument,
    ScrapedMeeting,
)


class StaticHtmlScraper(BaseScraper):
    """Scraper for municipalities that publish meetings as static HTML pages.

    Parses an index page for meeting entries and follows links to download
    PDF documents. Configurable via CSS selectors in source_config.

    Expected source_config:
        {
            "type": "static_html",
            "base_url": "https://www.rdos.bc.ca",
            "index_url": "https://www.rdos.bc.ca/meetings/",
            "selectors": {
                "meeting_list": ".meeting-list .meeting-item",
                "date": ".meeting-date",
                "title": ".meeting-title",
                "links": "a[href$='.pdf']"
            },
            "date_format": "%B %d, %Y",
            "video_source": {"type": "youtube", "channel": "RDOS"}
        }
    """

    def __init__(self, municipality: MunicipalityConfig):
        super().__init__(municipality)
        self.base_url = self.source_config.get("base_url", "")
        self.index_url = self.source_config.get("index_url", "")
        self.selectors = self.source_config.get("selectors", {})
        self.date_format = self.source_config.get("date_format", "%B %d, %Y")

        if not self.index_url:
            raise ValueError(
                f"Static HTML scraper requires 'index_url' in source_config for {municipality.slug}"
            )

        self.session = requests.Session()
        self.session.headers.update(
            {"User-Agent": config.USER_AGENT, "Accept": "text/html"}
        )

    def discover_meetings(
        self, since_date: date | None = None
    ) -> list[ScrapedMeeting]:
        """Parse the index page for meeting entries."""
        try:
            resp = self.session.get(
                self.index_url, timeout=config.REQUEST_TIMEOUT
            )
            resp.raise_for_status()
        except requests.RequestException as e:
            print(f"  [!] Failed to fetch index page {self.index_url}: {e}")
            return []

        soup = BeautifulSoup(resp.text, "html.parser")
        meeting_selector = self.selectors.get("meeting_list", ".meeting-item")
        date_selector = self.selectors.get("date", ".date")
        title_selector = self.selectors.get("title", ".title")
        link_selector = self.selectors.get("links", "a[href$='.pdf']")

        items = soup.select(meeting_selector)
        meetings = []

        for item in items:
            # Extract date
            date_el = item.select_one(date_selector)
            if not date_el:
                continue

            meeting_date = self._parse_date(date_el.get_text(strip=True))
            if not meeting_date:
                continue

            if since_date and meeting_date < since_date:
                continue

            # Extract title
            title_el = item.select_one(title_selector)
            title = title_el.get_text(strip=True) if title_el else "Meeting"

            # Extract document links
            documents = []
            for link in item.select(link_selector):
                href = link.get("href", "")
                if href:
                    full_url = urljoin(self.base_url, href)
                    link_text = link.get_text(strip=True) or os.path.basename(
                        urlparse(href).path
                    )

                    # Guess category from link text
                    category = None
                    text_lower = link_text.lower()
                    if "agenda" in text_lower:
                        category = "Agenda"
                    elif "minute" in text_lower:
                        category = "Minutes"

                    documents.append(
                        ScrapedDocument(
                            title=link_text,
                            url=full_url,
                            category=category,
                            file_format="pdf",
                        )
                    )

            meeting = ScrapedMeeting(
                date=meeting_date,
                title=title,
                meeting_type=self._guess_meeting_type(title),
                organization_name=self.municipality.name,
                agenda_url=next(
                    (d.url for d in documents if d.category == "Agenda"), None
                ),
                minutes_url=next(
                    (d.url for d in documents if d.category == "Minutes"), None
                ),
                documents=documents,
            )
            meetings.append(meeting)

        print(
            f"  [StaticHTML] Discovered {len(meetings)} meeting(s) from {self.index_url}"
        )
        return meetings

    def download_documents(
        self, meeting: ScrapedMeeting, target_dir: str
    ) -> list[str]:
        """Download meeting documents to target_dir."""
        os.makedirs(target_dir, exist_ok=True)
        downloaded = []

        for doc in meeting.documents:
            if not doc.url:
                continue

            # Organize by category
            if doc.category:
                subfolder = os.path.join(target_dir, doc.category)
            else:
                subfolder = target_dir
            os.makedirs(subfolder, exist_ok=True)

            filename = os.path.basename(urlparse(doc.url).path) or f"{doc.title}.pdf"
            file_path = os.path.join(subfolder, filename)

            if os.path.exists(file_path):
                downloaded.append(file_path)
                continue

            try:
                resp = self.session.get(
                    doc.url, stream=True, timeout=config.REQUEST_TIMEOUT
                )
                resp.raise_for_status()
                with open(file_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        f.write(chunk)
                print(f"  [+] Downloaded: {filename}")
                downloaded.append(file_path)
                time.sleep(config.DELAY_BETWEEN_REQUESTS)
            except requests.RequestException as e:
                print(f"  [!] Failed to download {doc.title}: {e}")

        return downloaded

    def _parse_date(self, text: str) -> date | None:
        """Try to parse a date string using the configured format."""
        # Try configured format first
        try:
            return datetime.strptime(text.strip(), self.date_format).date()
        except ValueError:
            pass

        # Fallback: try common formats
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d %B %Y", "%B %d, %Y"):
            try:
                return datetime.strptime(text.strip(), fmt).date()
            except ValueError:
                continue

        # Last resort: regex for YYYY-MM-DD
        match = re.search(r"(\d{4}-\d{2}-\d{2})", text)
        if match:
            try:
                return datetime.strptime(match.group(1), "%Y-%m-%d").date()
            except ValueError:
                pass

        return None

    @staticmethod
    def _guess_meeting_type(title: str) -> str | None:
        """Guess the meeting type from the title."""
        title_lower = title.lower()
        if "council" in title_lower:
            return "Regular Council"
        if "committee of the whole" in title_lower or "cow" in title_lower:
            return "Committee of the Whole"
        if "public hearing" in title_lower:
            return "Public Hearing"
        if "board" in title_lower:
            return "Board Meeting"
        if "committee" in title_lower:
            return "Committee"
        return None
