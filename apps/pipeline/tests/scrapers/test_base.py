"""Tests for pipeline.scrapers.base -- MunicipalityConfig, ScrapedMeeting, BaseScraper, registry."""

import pytest
from datetime import date
from unittest.mock import MagicMock

from pipeline.scrapers.base import (
    BaseScraper,
    MunicipalityConfig,
    ScrapedDocument,
    ScrapedMeeting,
)
from pipeline.scrapers import (
    SCRAPER_REGISTRY,
    get_scraper,
    register_scraper,
)


# ── MunicipalityConfig ──────────────────────────────────────────────────


class TestMunicipalityConfig:
    def test_create_with_required_fields(self):
        cfg = MunicipalityConfig(
            id=1,
            slug="view-royal",
            name="Town of View Royal",
            short_name="View Royal",
            source_config={"type": "civicweb", "base_url": "https://example.com"},
        )
        assert cfg.id == 1
        assert cfg.slug == "view-royal"
        assert cfg.name == "Town of View Royal"
        assert cfg.short_name == "View Royal"
        assert cfg.source_config["type"] == "civicweb"

    def test_default_province_and_classification(self):
        cfg = MunicipalityConfig(
            id=2,
            slug="saanich",
            name="District of Saanich",
            short_name="Saanich",
            source_config={},
        )
        assert cfg.province == "BC"
        assert cfg.classification == "Town"

    def test_custom_province_and_classification(self):
        cfg = MunicipalityConfig(
            id=3,
            slug="toronto",
            name="City of Toronto",
            short_name="Toronto",
            source_config={},
            province="ON",
            classification="City",
        )
        assert cfg.province == "ON"
        assert cfg.classification == "City"

    def test_from_db_row(self):
        row = {
            "id": 10,
            "slug": "langford",
            "name": "City of Langford",
            "short_name": "Langford",
            "source_config": {"type": "civicweb"},
            "province": "BC",
            "classification": "City",
        }
        cfg = MunicipalityConfig.from_db_row(row)
        assert cfg.id == 10
        assert cfg.slug == "langford"
        assert cfg.name == "City of Langford"
        assert cfg.classification == "City"

    def test_from_db_row_uses_defaults(self):
        row = {
            "id": 11,
            "slug": "colwood",
            "name": "City of Colwood",
            "short_name": "Colwood",
            "source_config": {},
        }
        cfg = MunicipalityConfig.from_db_row(row)
        assert cfg.province == "BC"
        assert cfg.classification == "Town"


# ── ScrapedMeeting & ScrapedDocument ────────────────────────────────────


class TestScrapedMeeting:
    def test_create_meeting_with_defaults(self):
        m = ScrapedMeeting(date=date(2025, 6, 15), title="Regular Council")
        assert m.date == date(2025, 6, 15)
        assert m.title == "Regular Council"
        assert m.meeting_type is None
        assert m.documents == []
        assert m.meta == {}

    def test_create_meeting_with_documents(self):
        doc = ScrapedDocument(title="Agenda.pdf", url="https://example.com/agenda.pdf")
        m = ScrapedMeeting(
            date=date(2025, 6, 15),
            title="Regular Council",
            meeting_type="Regular Council",
            documents=[doc],
        )
        assert len(m.documents) == 1
        assert m.documents[0].title == "Agenda.pdf"


# ── BaseScraper (abstract) ──────────────────────────────────────────────


class TestBaseScraper:
    def test_cannot_instantiate_directly(self):
        cfg = MunicipalityConfig(
            id=1, slug="test", name="Test", short_name="T", source_config={}
        )
        with pytest.raises(TypeError):
            BaseScraper(cfg)

    def test_concrete_subclass_gets_municipality(self):
        class DummyScraper(BaseScraper):
            def discover_meetings(self, since_date=None):
                return []

            def download_documents(self, meeting=None, target_dir=None):
                return []

        cfg = MunicipalityConfig(
            id=1, slug="test", name="Test", short_name="T",
            source_config={"key": "value"},
        )
        scraper = DummyScraper(cfg)
        assert scraper.municipality is cfg
        assert scraper.source_config == {"key": "value"}


# ── Scraper Registry ────────────────────────────────────────────────────


class TestScraperRegistry:
    def test_register_and_retrieve(self):
        class FakeScraper(BaseScraper):
            def discover_meetings(self, since_date=None):
                return []

            def download_documents(self, meeting=None, target_dir=None):
                return []

        register_scraper("fake_source", FakeScraper)
        assert "fake_source" in SCRAPER_REGISTRY
        assert SCRAPER_REGISTRY["fake_source"] is FakeScraper

        # Clean up
        del SCRAPER_REGISTRY["fake_source"]

    def test_get_scraper_returns_instance(self):
        class FakeScraper(BaseScraper):
            def discover_meetings(self, since_date=None):
                return []

            def download_documents(self, meeting=None, target_dir=None):
                return []

        register_scraper("fake_test", FakeScraper)
        cfg = MunicipalityConfig(
            id=1, slug="test", name="Test", short_name="T",
            source_config={"type": "fake_test"},
        )
        scraper = get_scraper(cfg)
        assert isinstance(scraper, FakeScraper)
        assert scraper.municipality is cfg

        # Clean up
        del SCRAPER_REGISTRY["fake_test"]

    def test_get_scraper_unknown_type_raises(self):
        cfg = MunicipalityConfig(
            id=1, slug="test", name="Test", short_name="T",
            source_config={"type": "nonexistent_source"},
        )
        with pytest.raises(ValueError, match="No scraper registered"):
            get_scraper(cfg)

    def test_builtin_scrapers_registered(self):
        """legistar and static_html are registered in scrapers/__init__.py.

        civicweb is registered in orchestrator.py (import-time side effect),
        so we only verify the two that __init__.py registers.
        """
        assert "legistar" in SCRAPER_REGISTRY
        assert "static_html" in SCRAPER_REGISTRY
