"""Tests for pipeline.scrapers.civicweb -- CivicWebScraper and CivicWebClient HTTP interactions."""

import json
import os

import pytest
import responses

from pipeline.civicweb import CivicWebClient
from pipeline.scrapers.base import MunicipalityConfig
from pipeline.scrapers.civicweb import CivicWebScraper


# ── Fixtures ────────────────────────────────────────────────────────────


SAMPLE_FOLDER_ITEMS = [
    {"Id": 100, "Title": "Council", "Folder": True},
    {"Id": 101, "Title": "Public Hearing", "Folder": True},
]

SAMPLE_FILE_ITEMS = [
    {
        "Id": 200,
        "Title": "2025-06-15 Regular Council Agenda",
        "Folder": False,
        "Extension": ".pdf",
        "FileFormat": "pdf",
        "ContentUrl": "/document/200",
    },
    {
        "Id": 201,
        "Title": "2025-06-15 Regular Council Minutes",
        "Folder": False,
        "Extension": ".pdf",
        "FileFormat": "pdf",
        "ContentUrl": "/document/201",
    },
]

SAMPLE_MIXED_ITEMS = SAMPLE_FOLDER_ITEMS + SAMPLE_FILE_ITEMS

BASE_URL = "https://test.civicweb.net"


def _make_municipality():
    return MunicipalityConfig(
        id=1,
        slug="test-town",
        name="Test Town",
        short_name="Test",
        source_config={"type": "civicweb", "base_url": BASE_URL},
    )


# ── CivicWebClient Tests ───────────────────────────────────────────────


class TestCivicWebClient:
    def test_api_url_no_folder_id(self):
        client = CivicWebClient(base_url=BASE_URL)
        url = client._get_api_url(None)
        assert url == f"{BASE_URL}/api/documents/getchildlist"

    def test_api_url_with_folder_id(self):
        client = CivicWebClient(base_url=BASE_URL)
        url = client._get_api_url(42)
        assert url == f"{BASE_URL}/api/document/42/getchildlist"

    @responses.activate
    def test_fetch_items_returns_list(self):
        """When API returns a JSON list, all items are yielded."""
        responses.add(
            responses.GET,
            f"{BASE_URL}/api/documents/getchildlist",
            json=SAMPLE_FOLDER_ITEMS,
            status=200,
        )
        client = CivicWebClient(base_url=BASE_URL)
        items = list(client._fetch_items(None))
        assert len(items) == 2
        assert items[0]["Title"] == "Council"

    @responses.activate
    def test_fetch_items_returns_dict_with_items_key(self):
        """When API returns {"items": [...]}, items are extracted."""
        responses.add(
            responses.GET,
            f"{BASE_URL}/api/documents/getchildlist",
            json={"items": SAMPLE_FILE_ITEMS},
            status=200,
        )
        client = CivicWebClient(base_url=BASE_URL)
        items = list(client._fetch_items(None))
        assert len(items) == 2
        assert items[0]["Id"] == 200

    @responses.activate
    def test_fetch_items_returns_dict_with_result_key(self):
        """When API returns {"result": [...]}, items are extracted."""
        responses.add(
            responses.GET,
            f"{BASE_URL}/api/documents/getchildlist",
            json={"result": SAMPLE_FILE_ITEMS},
            status=200,
        )
        client = CivicWebClient(base_url=BASE_URL)
        items = list(client._fetch_items(None))
        assert len(items) == 2

    @responses.activate
    def test_fetch_items_empty_response(self):
        """Empty list response yields no items."""
        responses.add(
            responses.GET,
            f"{BASE_URL}/api/documents/getchildlist",
            json=[],
            status=200,
        )
        client = CivicWebClient(base_url=BASE_URL)
        items = list(client._fetch_items(None))
        assert items == []

    @responses.activate
    def test_fetch_items_http_500_stops(self):
        """Server error stops iteration without raising."""
        responses.add(
            responses.GET,
            f"{BASE_URL}/api/documents/getchildlist",
            status=500,
        )
        client = CivicWebClient(base_url=BASE_URL)
        items = list(client._fetch_items(None))
        assert items == []

    @responses.activate
    def test_fetch_items_http_404_stops(self):
        responses.add(
            responses.GET,
            f"{BASE_URL}/api/documents/getchildlist",
            status=404,
        )
        client = CivicWebClient(base_url=BASE_URL)
        items = list(client._fetch_items(None))
        assert items == []

    @responses.activate
    def test_fetch_items_connection_error(self):
        """Network error is caught and stops iteration."""
        responses.add(
            responses.GET,
            f"{BASE_URL}/api/documents/getchildlist",
            body=ConnectionError("Connection refused"),
        )
        client = CivicWebClient(base_url=BASE_URL)
        items = list(client._fetch_items(None))
        assert items == []

    @responses.activate
    def test_fetch_items_pagination(self):
        """When first page returns 100 items, client fetches page 2."""
        # Page 1: 100 items (triggers next page fetch)
        page1_items = [{"Id": i, "Title": f"Item {i}", "Folder": False} for i in range(100)]
        # Page 2: fewer than 100 items (stops pagination)
        page2_items = [{"Id": 200, "Title": "Last Item", "Folder": False}]

        responses.add(
            responses.GET,
            f"{BASE_URL}/api/documents/getchildlist",
            json=page1_items,
            status=200,
        )
        responses.add(
            responses.GET,
            f"{BASE_URL}/api/documents/getchildlist",
            json=page2_items,
            status=200,
        )

        client = CivicWebClient(base_url=BASE_URL)
        items = list(client._fetch_items(None))
        assert len(items) == 101

    @responses.activate
    def test_fetch_items_for_subfolder(self):
        """Subfolder fetch uses correct URL pattern."""
        responses.add(
            responses.GET,
            f"{BASE_URL}/api/document/42/getchildlist",
            json=SAMPLE_FILE_ITEMS,
            status=200,
        )
        client = CivicWebClient(base_url=BASE_URL)
        items = list(client._fetch_items(42))
        assert len(items) == 2


# ── CivicWebScraper Tests ──────────────────────────────────────────────


class TestCivicWebScraper:
    def test_init_with_municipality(self):
        cfg = _make_municipality()
        scraper = CivicWebScraper(municipality=cfg)
        assert scraper.municipality is cfg
        assert scraper.base_url == BASE_URL

    def test_init_without_municipality(self):
        """Backward compatibility: no municipality uses defaults."""
        scraper = CivicWebScraper()
        assert scraper.municipality is None

    def test_discover_meetings_returns_empty(self):
        """CivicWeb scraper discovery returns empty (uses download_documents instead)."""
        cfg = _make_municipality()
        scraper = CivicWebScraper(municipality=cfg)
        assert scraper.discover_meetings() == []

    @responses.activate
    def test_download_file_skips_html_docx(self, tmp_path):
        """Html.docx files are skipped to avoid redundant exports."""
        cfg = _make_municipality()
        scraper = CivicWebScraper(municipality=cfg)
        scraper.archive_root = str(tmp_path)

        item = {
            "Id": 300,
            "Title": "2025-06-15 Agenda - Html",
            "Extension": ".docx",
            "FileFormat": "docx",
            "ContentUrl": "/document/300",
        }
        # Should return early without downloading
        scraper.download_file(item, "Council", "2025-06-15 Regular Council", str(tmp_path))
        # No HTTP calls were made
        assert len(responses.calls) == 0

    @responses.activate
    def test_download_file_skips_no_date(self, tmp_path):
        """Items without a parseable date are skipped."""
        cfg = _make_municipality()
        scraper = CivicWebScraper(municipality=cfg)
        scraper.archive_root = str(tmp_path)

        item = {
            "Id": 301,
            "Title": "Some random document",
            "Extension": ".pdf",
            "ContentUrl": "/document/301",
        }
        scraper.download_file(item, "Council", "Miscellaneous", str(tmp_path))
        assert len(responses.calls) == 0

    @responses.activate
    def test_download_file_success(self, tmp_path):
        """Successful file download creates file and .url companion."""
        cfg = _make_municipality()
        scraper = CivicWebScraper(municipality=cfg)
        scraper.archive_root = str(tmp_path)

        responses.add(
            responses.GET,
            f"{BASE_URL}/document/302",
            body=b"%PDF-1.4 fake content",
            status=200,
        )

        item = {
            "Id": 302,
            "Title": "2025-06-15 Regular Council Agenda",
            "Extension": "pdf",
            "ContentUrl": "/document/302",
        }
        scraper.download_file(item, "Council", "2025-06-15 Regular Council", str(tmp_path))
        assert len(responses.calls) == 1

    @responses.activate
    def test_download_file_http_error_handled(self, tmp_path):
        """HTTP errors during download are caught, not raised."""
        cfg = _make_municipality()
        scraper = CivicWebScraper(municipality=cfg)
        scraper.archive_root = str(tmp_path)

        responses.add(
            responses.GET,
            f"{BASE_URL}/document/303",
            status=500,
        )

        item = {
            "Id": 303,
            "Title": "2025-06-15 Regular Council Agenda",
            "Extension": "pdf",
            "ContentUrl": "/document/303",
        }
        # Should not raise
        scraper.download_file(item, "Council", "2025-06-15 Regular Council", str(tmp_path))

    @responses.activate
    def test_scrape_recursive_empty(self, tmp_path):
        """Empty folder returns without processing."""
        cfg = _make_municipality()
        scraper = CivicWebScraper(municipality=cfg)
        scraper.archive_root = str(tmp_path)

        responses.add(
            responses.GET,
            f"{BASE_URL}/api/documents/getchildlist",
            json=[],
            status=200,
        )
        scraper.scrape_recursive(None, archive_root=str(tmp_path))
