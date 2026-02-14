"""
Reproduce Marker OCR failure on scanned PDFs.

Usage:
    pytest tests/core/test_marker_ocr.py -s -v
"""

import os
import traceback

import pytest

# A scanned PDF known to fail with "stack expects a non-empty TensorList"
SCANNED_PDF = os.path.join(
    os.path.dirname(__file__),
    "..",
    "..",
    "viewroyal_archive",
    "Council",
    "2015",
    "11",
    "2015-11-03 Council Meeting",
    "Agenda",
    "2015 11 03 Council Agenda.pdf",
)


@pytest.fixture(scope="module")
def marker_converter():
    """Load Marker models once for the module (slow), skipping table processors."""
    from marker.converters.pdf import PdfConverter
    from marker.models import create_model_dict

    processors = [
        f"{p.__module__}.{p.__name__}"
        for p in PdfConverter.default_processors
        if "table" not in p.__name__.lower()
    ]
    return PdfConverter(
        artifact_dict=create_model_dict(),
        processor_list=processors,
    )


def test_scanned_pdf_exists():
    assert os.path.exists(SCANNED_PDF), f"Test PDF not found: {SCANNED_PDF}"


def test_pymupdf_returns_no_text():
    """Confirm this is actually a scanned/image PDF with no extractable text."""
    import fitz

    doc = fitz.open(SCANNED_PDF)
    text = "".join(page.get_text() for page in doc)
    doc.close()
    print(f"\nPyMuPDF extracted {len(text.strip())} chars")
    assert len(text.strip()) < 100, "PDF has extractable text — not a scanned PDF"


def test_marker_ocr_on_scanned_pdf(marker_converter):
    """Reproduce the 'stack expects a non-empty TensorList' error."""
    from marker.output import text_from_rendered

    rendered = marker_converter(SCANNED_PDF)
    text, _, images = text_from_rendered(rendered)
    print(f"\nMarker extracted {len(text or '')} chars")
    assert text and len(text.strip()) > 50, "Marker failed to extract meaningful text"
