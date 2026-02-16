from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date


@dataclass
class MunicipalityConfig:
    """Municipality configuration loaded from DB or dict."""

    id: int
    slug: str
    name: str
    short_name: str
    source_config: dict
    province: str = "BC"
    classification: str = "Town"

    @classmethod
    def from_db_row(cls, row: dict) -> MunicipalityConfig:
        return cls(
            id=row["id"],
            slug=row["slug"],
            name=row["name"],
            short_name=row["short_name"],
            source_config=row["source_config"],
            province=row.get("province", "BC"),
            classification=row.get("classification", "Town"),
        )


@dataclass
class ScrapedDocument:
    """A document associated with a meeting."""

    title: str
    url: str
    category: str | None = None  # Agenda, Minutes, etc.
    file_format: str | None = None


@dataclass
class ScrapedMeeting:
    """Standardized meeting representation from any scraper."""

    date: date
    title: str
    meeting_type: str | None = None
    organization_name: str | None = None
    agenda_url: str | None = None
    minutes_url: str | None = None
    video_url: str | None = None
    source_id: str | None = None
    documents: list[ScrapedDocument] = field(default_factory=list)
    meta: dict = field(default_factory=dict)


class BaseScraper(ABC):
    """Abstract base for all municipality scrapers."""

    def __init__(self, municipality: MunicipalityConfig):
        self.municipality = municipality
        self.source_config = municipality.source_config

    @abstractmethod
    def discover_meetings(
        self, since_date: date | None = None
    ) -> list[ScrapedMeeting]:
        """Discover meetings from the source system."""
        ...

    @abstractmethod
    def download_documents(
        self, meeting: ScrapedMeeting, target_dir: str
    ) -> list[str]:
        """Download meeting documents to target_dir. Returns list of downloaded file paths."""
        ...
