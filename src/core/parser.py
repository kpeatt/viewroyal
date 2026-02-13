import json
import os
import re
from datetime import datetime

import fitz  # PyMuPDF
from bs4 import BeautifulSoup

from src.core import utils


def extract_meeting_metadata(folder_path):
    """
    Extracts date and type from the folder name and path.
    Example: 'viewroyal_archive/Committee of the Whole/2023/01/2023-01-10 ...'
    """
    folder_name = os.path.basename(folder_path)
    full_path = folder_path.lower()

    # Regex to find date YYYY-MM-DD
    date_match = re.search(r"(\d{4}-\d{2}-\d{2})", folder_name)
    if not date_match:
        return None

    meeting_date = date_match.group(1)

    # Determine type based on path hierarchy or folder name
    meeting_type = "Council"  # Default

    if "committee of the whole" in full_path:
        meeting_type = "Committee of the Whole"
    elif "public hearing" in full_path:
        meeting_type = "Public Hearing"
    elif "joint advisory" in full_path or "advisory committee" in full_path:
        meeting_type = "Joint Advisory Committee"
    elif "special council" in full_path:
        meeting_type = "Special Council"
    elif "committee" in full_path:
        meeting_type = "Committee"

    return {
        "meeting_date": meeting_date,
        "meeting_type": meeting_type,
        "title": folder_name.replace(meeting_date, "").strip(" -_"),
    }


def _parse_agenda_lines(lines):
    """
    Shared logic for parsing extracted text lines into agenda items.
    Handles '5.1 Title' and '5.1 \n Title' formats.
    """
    items = []

    # Regex for item numbers: "1.", "5.1", "10(a)"
    item_pattern = re.compile(r"^(\d+(\.\d+)*)\.?$")  # Just the number: "1." or "5.1"
    item_pattern_full = re.compile(
        r"^(\d+(\.\d+)*)\.?\s+(.+)$"
    )  # Number + Title: "1. Call to Order"

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        if not line:
            i += 1
            continue

        # Case A: "1. Call to Order" (Same line)
        match_full = item_pattern_full.match(line)
        if match_full:
            item_order = match_full.group(1)
            title = match_full.group(3)
            # Filter out noise/page numbers
            if len(title) > 3 and not title.isdigit():
                items.append(
                    {"item_order": item_order, "title": title, "description": ""}
                )
            i += 1
            continue

        # Case B: "1." (Split line) -> Look ahead for title
        match_split = item_pattern.match(line)
        if match_split:
            item_order = match_split.group(1)

            # Look at next line for title
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if next_line and not item_pattern.match(
                    next_line
                ):  # Ensure next line isn't another number
                    items.append(
                        {
                            "item_order": item_order,
                            "title": next_line,
                            "description": "",
                        }
                    )
                    i += 2  # Skip next line
                    continue

        i += 1

    return items


def extract_agenda_items(html_path):
    """
    Parses HTML to find agenda items.
    """
    if not os.path.exists(html_path):
        return []

    try:
        html_content = utils.read_text_file(html_path)
        soup = BeautifulSoup(html_content, "html.parser")
    except Exception as e:
        print(f"Error reading HTML agenda: {e}")
        return []

    # The text is likely in <p> tags or <span> tags
    lines = [p.get_text(" ", strip=True) for p in soup.find_all("p")]

    # If <p> didn't work well, try all strings
    if not lines:
        lines = [s.strip() for s in soup.stripped_strings]

    return _parse_agenda_lines(lines)


def get_pdf_text(pdf_path, max_pages=None):
    """
    Returns the raw text from a PDF, optionally limited to max_pages.
    Uses PyMuPDF (fitz) for speed and robustness.
    """
    if not os.path.exists(pdf_path):
        return ""
    try:
        # Suppress MuPDF warnings (e.g. "format error: No default Layer config")
        # Note: This affects global state, but is generally safe for extraction tasks.
        fitz.TOOLS.mupdf_display_errors(False)

        doc = fitz.open(pdf_path)
        full_text = ""

        # Limit pages if requested
        num_pages = min(len(doc), max_pages) if max_pages else len(doc)

        for i in range(num_pages):
            page = doc.load_page(i)
            text = page.get_text()
            # Post-processing to clean up known garbage characters
            full_text += _clean_extracted_text(text) + "\n"

        doc.close()
        return full_text
    except Exception as e:
        print(f"  [!] PDF Extraction Failed ({os.path.basename(pdf_path)}): {e}")
        return ""


# Lazy singleton for Marker models (expensive to load)
_marker_converter = None


def get_pdf_text_ocr(pdf_path):
    """
    OCR fallback for scanned-image PDFs where PyMuPDF returns no text.
    Uses the marker-pdf library which includes OCR and layout analysis.
    """
    global _marker_converter
    if not os.path.exists(pdf_path):
        return ""
    try:
        from marker.converters.pdf import PdfConverter
        from marker.models import create_model_dict
        from marker.output import text_from_rendered

        if _marker_converter is None:
            print("  [i] Loading Marker OCR models (first use)...")
            _marker_converter = PdfConverter(artifact_dict=create_model_dict())

        print(f"  [OCR] Running Marker on {os.path.basename(pdf_path)}...")
        rendered = _marker_converter(pdf_path)
        text, _, images = text_from_rendered(rendered)
        return text or ""
    except Exception as e:
        print(f"  [!] Marker OCR failed ({os.path.basename(pdf_path)}): {e}")
        return ""


def _clean_extracted_text(text):
    """
    Cleans up garbage Unicode and ASCII patterns often produced by
    PyMuPDF when fonts are not correctly mapped.
    """
    if not text:
        return text

    # Translation table for Unicode garbage (synced with src/maintenance/db/clean_agenda_markdown.py)
    # This is a subset of the most common ones
    table = {
        0x03ED: "1",
        0x03EE: "2",
        0x03EF: "3",
        0x03F0: "4",
        0x03F1: "5",
        0x03F2: "6",
        0x03F3: "7",
        0x03F4: "8",
        0x03F5: "9",
        0x03EC: "0",
        0x03A8: "$",
        0x0358: ".",
        0x0355: ",",
        0x0372: "-",
        0x0439: "%",
        0x043D: "+",
        0x038E: "*",
        0x0398: "&",
        0x037E: "(",
        0x037F: ")",
        0x036C: "/",
        0x0357: ":",
        0x01C0: "|",
        0x2013: "-",
        0x2019: "'",
        0x201C: '"',
        0x201D: '"',
        0x2022: "*",
        0x0102: "a",
        0x0110: "c",
        0x010F: "d",
        0x011A: "e",
        0x0128: "f",
        0x0150: "g",
        0x015A: "h",
        0x015D: "i",
        0x016C: "k",
        0x019A: "l",
        0x01C1: "l",
        0x0175: "m",
        0x0176: "n",
        0x017D: "o",
        0x0189: "p",
        0x018B: "q",
        0x018C: "r",
        0x0190: "s",
        0x011E: "t",
        0x016F: "u",
        0x01B5: "v",
        0x01C7: "y",
        0x01C6: "x",
        0x019F: "ti",
        0xFB01: "fi",
        0xFB03: "ffi",
        0xFB00: "ff",
    }

    text = text.translate(table)

    # Common garbled word patterns
    words = {
        "Wrimt": "Prime",
        "dvrf": "Adult",
        "Eon-": "Non-",
        "ommtrciau": "Commercial",
        "zovlh": "Youth",
        "evul": "Adult",
        "rlificiau": "Artificial",
        "itue": "Site",
        "auf": "Ice",
        "^porl": "Sport",
        "uoor": "Floor",
        "dimt": "Time",
        "fov": "for",
    }
    for garbled, clean in words.items():
        text = text.replace(garbled, clean)

    # Remove specific control chars
    for char in ["\x03", "\x04", "\x12", "\x1c", "\x18", "\x11"]:
        text = text.replace(char, "")

    return text


def extract_minutes_data(pdf_path):
    """
    Parses PDF Minutes to extract:
    1. Attendance
    2. Agenda Items
    3. Motions (Mover, Seconder, Text, Result)
    """
    full_text = get_pdf_text(pdf_path)
    if not full_text:
        return None

    data = {"attendance": [], "items": []}

    # 1. Parse Attendance
    # Look for "PRESENT WERE:" or "PRESENT:"
    # This is a simple heuristic; might need refinement for "Staff:" sections
    attendance_match = re.search(
        r"(?:PRESENT WERE|PRESENT|ATTENDEES):(.*?)(?:\n\s*\n|\n[A-Z]+:)",
        full_text,
        re.DOTALL | re.IGNORECASE,
    )
    if attendance_match:
        raw_names = attendance_match.group(1)
        # Split by newlines, clean up titles
        for line in raw_names.split("\n"):
            line = line.strip()
            # Simple filter for names (e.g., "Mayor Tobias", "Councillor Brown")
            if line and ("Mayor" in line or "Councillor" in line):
                data["attendance"].append(line)

    # 2. Parse Items & Motions
    # We scan line by line.
    # State machine:
    # - Searching for Item Header (Number + Title)
    # - Searching for Motion (MOVED BY)
    # - Capturing Motion Text
    # - Finding Result (CARRIED)

    # Pre-process lines to remove headers/footers
    lines = full_text.split("\n")
    cleaned_lines = []
    header_pattern = re.compile(r"Council Meeting Minutes.*Page \d+", re.IGNORECASE)

    for line in lines:
        line = line.strip()
        if not line:
            continue
        if header_pattern.search(line):
            continue
        cleaned_lines.append(line)

    lines = cleaned_lines

    # Regex for item numbers: "1.", "5.1", "10." (Top level usually)
    # We want to be strict. View Royal often uses "8.1" or "9."
    # We want to avoid catching "1. Report dated..." which is a sub-item of 8.1
    # Heuristic: Main items often are UPPERCASE or Title Case with specific numbering.
    # Sub-lists often start with "1." inside a section.
    # Let's try to capture "X." or "X.Y".
    item_pattern = re.compile(r"^(\d+(\.\d+)?)\.?\s+(.+)$")

    current_item = None
    current_motion = None

    i = 0
    while i < len(lines):
        line = lines[i]

        # Check for Item Header
        match_item = item_pattern.match(line)
        if match_item:
            item_order = match_item.group(1)
            title = match_item.group(3)

            # Heuristic: If title starts with "Report dated" or "expenditures", it's likely a sub-list
            is_sub_item = (
                title.lower().startswith("report dated")
                or title.lower().startswith("expenditures")
                or "members of the" in title.lower()
                or len(title) < 3
            )

            if not is_sub_item:
                # Save previous item
                if current_item:
                    if current_motion:  # Save pending motion
                        current_item["motions"].append(current_motion)
                        current_motion = None
                    data["items"].append(current_item)

                current_item = {"item_order": item_order, "title": title, "motions": []}
                i += 1
                continue

        # Check for Motion Start
        if line.upper().startswith("MOVED BY:"):
            if current_motion and current_item:
                current_item["motions"].append(current_motion)

            mover = line.split(":", 1)[1].strip()
            current_motion = {
                "mover": mover,
                "seconder": None,
                "text": "",
                "result": None,
            }
            i += 1
            continue

        if line.upper().startswith("SECONDED:"):
            if current_motion:
                current_motion["seconder"] = line.split(":", 1)[1].strip()
            i += 1
            continue

        # Check for Result
        # Look for CARRIED on this line or strictly the line itself is CARRIED
        if line.upper() in [
            "CARRIED",
            "DEFEATED",
            "CARRIED UNANIMOUSLY",
        ] or line.upper().endswith(" CARRIED"):
            if current_motion:
                current_motion["result"] = (
                    "CARRIED" if "CARRIED" in line.upper() else "DEFEATED"
                )
                if current_item:
                    current_item["motions"].append(current_motion)
                current_motion = None
            i += 1
            continue

        # Motion Text Accumulation
        if current_motion and not current_motion["result"]:
            # Check if next line is a Result, sometimes it's split
            # But here we are just accumulating text.

            # Skip motion codes like C-01-24 if they appear alone
            if re.match(r"^C-\d{2}-\d{2}", line):
                i += 1
                continue

            # If text starts with motion code, strip it
            clean_line = re.sub(r"^C-\d{2}-\d{2}\s+", "", line)
            current_motion["text"] += " " + clean_line

        i += 1

    # Flush last item
    if current_item:
        if current_motion:
            current_item["motions"].append(current_motion)
        data["items"].append(current_item)

    return data


def parse_minutes_into_blocks(text):
    """
    Parses raw text into a list of structured blocks.
    Equivalent to the TypeScript implementation for DB storage.
    """
    if not text:
        return []

    lines = text.split("\n")
    blocks = []

    current_para = []

    def flush_para():
        if current_para:
            blocks.append({"type": "paragraph", "content": " ".join(current_para)})
            current_para.clear()

    # Markdown-tolerant patterns
    # Matches "8.1 TITLE" or "**8.1 TITLE**" or "# 8.1 TITLE"
    header_pattern = re.compile(r"^[#\s\*]*(\d+(\.\d+)*)\.?\s+[A-Z]")
    # Matches "a) TITLE" or "**a) TITLE**"
    list_pattern = re.compile(r"^[#\s\*]*(([a-z]|\d+)\)|[-•*])\s+", re.IGNORECASE)
    result_patterns = ["CARRIED", "DEFEATED", "CARRIED UNANIMOUSLY"]

    for line in lines:
        trimmed = line.strip()

        if not trimmed:
            flush_para()
            if not blocks or blocks[-1]["type"] != "spacer":
                blocks.append({"type": "spacer"})
            continue

        # Check for headers/lists but strip MD markers for semantic check
        clean_line = trimmed.replace("*", "").replace("#", "").strip()

        is_header = bool(header_pattern.match(trimmed))
        is_list_item = bool(list_pattern.match(trimmed))
        is_motion_meta = clean_line.upper().startswith(
            "MOVED BY:"
        ) or clean_line.upper().startswith("SECONDED:")
        is_result = any(res in clean_line.upper() for res in result_patterns)
        is_formal_motion = clean_line.upper().startswith("THAT")
        is_divider = bool(re.match(r"^[A-Z\s]+:$", clean_line))

        if (
            is_header
            or is_list_item
            or is_motion_meta
            or is_result
            or is_formal_motion
            or is_divider
        ):
            flush_para()

            if is_header:
                blocks.append({"type": "header", "content": trimmed})
            elif is_list_item:
                blocks.append({"type": "list_item", "content": trimmed})
            elif is_motion_meta:
                blocks.append({"type": "motion_meta", "content": trimmed})
            elif is_formal_motion:
                blocks.append({"type": "motion_text", "content": trimmed})
            elif is_divider:
                blocks.append({"type": "divider", "content": trimmed})
            elif is_result:
                blocks.append(
                    {
                        "type": "result",
                        "content": trimmed,
                        "is_carried": "CARRIED" in clean_line.upper(),
                    }
                )
        else:
            current_para.append(trimmed)

    flush_para()
    return blocks


def blocks_to_markdown(blocks):
    """
    Converts a list of structured blocks into a standardized Markdown string.
    """
    if not blocks:
        return ""

    md_lines = []

    for b in blocks:
        b_type = b.get("type")
        content = b.get("content", "").strip()

        if b_type == "header":
            md_lines.append(f"\n# {content}\n")
        elif b_type == "motion_meta":
            md_lines.append(f"\n**{content}**")
        elif b_type == "motion_text":
            md_lines.append(f"> *{content}*")
        elif b_type == "result":
            md_lines.append(f"\n**{content}**\n")
        elif b_type == "divider":
            md_lines.append(f"\n---\n")
        elif b_type == "list_item":
            md_lines.append(f"- {content}")
        elif b_type == "paragraph":
            md_lines.append(content)
        elif b_type == "spacer":
            if md_lines and md_lines[-1] != "":
                md_lines.append("")

    return "\n".join(md_lines).strip()


def extract_transcript_segments(json_path):
    """
    Loads the transcript.json and adds numeric IDs for reference.
    """
    if not os.path.exists(json_path):
        return []

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Standardize format - handle dict vs list
    if isinstance(data, dict):
        if "segments" in data:
            data = data["segments"]
        elif "chunks" in data:
            data = data["chunks"]
        else:
            # If it's a dict but we don't recognize the segments key,
            # we can't easily process it as a list of segments.
            return []

    segments = []
    for i, seg in enumerate(data):
        # Handle different field names ('start' vs 'start_time' vs 'timestamp')
        start = seg.get("start")
        if start is None:
            start = seg.get("start_time")

        if start is None:
            # Try to parse "MM:SS" from 'timestamp' field
            ts = seg.get("timestamp")
            if ts and ":" in str(ts):
                parts = ts.split(":")
                start = int(parts[0]) * 60 + int(parts[1])
            else:
                start = 0

        end = seg.get("end")
        if end is None:
            end = seg.get("end_time")

        segments.append(
            {
                "id": i,
                "speaker": seg.get("speaker", "Unknown"),
                "start_time": start,
                "end_time": end if end is not None else (start + 5),
                "text": seg.get("text", ""),
            }
        )

    return segments


def extract_speaker_centroids(json_path):
    """
    Extracts speaker centroids (voice fingerprints) from transcript JSON.
    Returns a dict mapping speaker_id -> centroid array, or empty dict if not present.
    """
    if not os.path.exists(json_path):
        return {}

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Centroids are stored in a dict format: {"segments": [...], "speaker_centroids": {...}}
    if isinstance(data, dict) and "speaker_centroids" in data:
        return data["speaker_centroids"]

    return {}


def extract_fingerprint_aliases(json_path):
    """
    Extracts pre-matched speaker aliases from voice fingerprints in transcript JSON.
    Returns a list of alias dicts: [{"label": "SPEAKER_01", "name": "John Smith", "person_id": 123}, ...]
    """
    if not os.path.exists(json_path):
        return []

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Aliases are stored in: {"segments": [...], "speaker_aliases": [...]}
    if isinstance(data, dict) and "speaker_aliases" in data:
        return data["speaker_aliases"]

    return []


def extract_speaker_samples(json_path):
    """
    Extracts speaker sample timestamps from transcript JSON.
    Returns dict: {"SPEAKER_01": {"start": 0.0, "end": 15.0}, ...}
    """
    if not os.path.exists(json_path):
        return {}

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, dict) and "speaker_samples" in data:
        return data["speaker_samples"]

    return {}
