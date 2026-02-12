import pytest
from datetime import date
from src.core import utils

def test_sanitize_filename():
    assert utils.sanitize_filename("Meeting / Date: 2023") == "Meeting _ Date_ 2023"
    assert utils.sanitize_filename("CleanName") == "CleanName"
    assert utils.sanitize_filename("  Trim Me  ") == "Trim Me"

def test_extract_date_from_string():
    # YYYY-MM-DD
    assert utils.extract_date_from_string("2023-01-15 Council Meeting") == "2023-01-15"
    assert utils.extract_date_from_string("Folder 2023 12 05") == "2023-12-05"
    
    # Text formats
    assert utils.extract_date_from_string("January 15, 2023") == "2023-01-15"
    assert utils.extract_date_from_string("Feb 2, 2024") == "2024-02-02"
    
    # No date
    assert utils.extract_date_from_string("Regular Council Meeting") is None

def test_normalize_top_level():
    assert utils.normalize_top_level("Regular Council Minutes") == "Council"
    assert utils.normalize_top_level("Committee of the Whole Agenda") == "Committee of the Whole"
    assert utils.normalize_top_level("Random Event") == "Random Event"
