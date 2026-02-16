from pipeline import parser

def test_extract_meeting_metadata_regular():
    path = "viewroyal_archive/Committee of the Whole/2023/01/2023-01-10 Committee of the Whole"
    meta = parser.extract_meeting_metadata(path)
    assert meta["meeting_date"] == "2023-01-10"
    assert meta["meeting_type"] == "Committee of the Whole"
    assert meta["title"] == "Committee of the Whole"

def test_extract_meeting_metadata_council():
    path = "viewroyal_archive/Council/2023/12/2023-12-05 Council Meeting"
    meta = parser.extract_meeting_metadata(path)
    assert meta["meeting_date"] == "2023-12-05"
    assert meta["meeting_type"] == "Council"

def test_extract_meeting_metadata_invalid():
    path = "viewroyal_archive/Random/Folder"
    meta = parser.extract_meeting_metadata(path)
    assert meta is None

def test_parse_agenda_lines_simple():
    lines = [
        "1. Call to Order",
        "2. Approval of Agenda",
        "3.1 Minutes of Previous Meeting",
        "Random Noise"
    ]
    items = parser._parse_agenda_lines(lines)
    assert len(items) == 3
    assert items[0]["item_order"] == "1"
    assert items[0]["title"] == "Call to Order"
    assert items[2]["item_order"] == "3.1"
    assert items[2]["title"] == "Minutes of Previous Meeting"

def test_parse_agenda_lines_split():
    lines = [
        "4.",
        "Public Participation",
        "5.1",
        "Bylaw Report"
    ]
    items = parser._parse_agenda_lines(lines)
    assert len(items) == 2
    assert items[0]["item_order"] == "4"
    assert items[0]["title"] == "Public Participation"
    assert items[1]["item_order"] == "5.1"
    assert items[1]["title"] == "Bylaw Report"
