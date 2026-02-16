from pipeline.scrapers.base import (
    BaseScraper,
    MunicipalityConfig,
    ScrapedDocument,
    ScrapedMeeting,
)

SCRAPER_REGISTRY: dict[str, type[BaseScraper]] = {}


def register_scraper(source_type: str, scraper_class: type[BaseScraper]):
    SCRAPER_REGISTRY[source_type] = scraper_class


def get_scraper(municipality: MunicipalityConfig) -> BaseScraper:
    source_type = municipality.source_config.get("type")
    if source_type not in SCRAPER_REGISTRY:
        raise ValueError(f"No scraper registered for source type: {source_type}")
    return SCRAPER_REGISTRY[source_type](municipality)
