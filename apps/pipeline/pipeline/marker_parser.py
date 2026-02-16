import fitz
import re
from collections import Counter

def analyze_fonts(doc):
    """
    Analyzes the most frequent fonts and sizes to determine roles (Body, Header, etc.)
    """
    styles = {}
    font_counts = Counter()

    for page in doc:
        blocks = page.get_text("dict")["blocks"]
        for b in blocks:
            if b['type'] == 0:  # Text block
                for line in b["lines"]:
                    for span in line["spans"]:
                        text = span['text'].strip()
                        if not text: continue
                        
                        size = round(span['size'] * 2) / 2
                        identifier = f"{span['font']}_{size}"
                        
                        styles[identifier] = {
                            'font': span['font'],
                            'size': span['size'],
                            'flags': span['flags'] 
                        }
                        font_counts[identifier] += len(text)

    if not font_counts:
        return None, {}
        
    body_style_id = font_counts.most_common(1)[0][0]
    return styles[body_style_id], styles

def clean_garbage(text):
    """
    Cleans up garbage Unicode characters and garbled words common in these PDFs.
    """
    if not text:
        return text

    # Mapping of garbage characters to their intended ASCII/Clean equivalents
    translation_table = {
        0x03ed: '1', 0x03ee: '2', 0x03ef: '3', 0x03f0: '4', 0x03f1: '5',
        0x03f2: '6', 0x03f3: '7', 0x03f4: '8', 0x03f5: '9', 0x03ec: '0',
        0x03a8: '$', 0x0358: '.', 0x0355: ',', 0x0372: '-', 0x0439: '%',
        0x043d: '+', 0x038e: '*', 0x0398: '&', 0x037e: '(', 0x037f: ')',
        0x036c: '/', 0x0357: ':', 0x01c0: '|', 
        0x2013: '-', 0x2014: '--', 0x2019: "'", 0x2018: "'", 0x201c: '"', 0x201d: '"',
        0x2022: '*', 0x202f: ' ', 0x200b: '',
        0x0102: 'a', 0x0110: 'c', 0x010f: 'd', 0x011a: 'e', 0x0128: 'f',
        0x0150: 'g', 0x015a: 'h', 0x015d: 'i', 0x016c: 'k', 0x019a: 'l',
        0x01c1: 'l', 0x0175: 'm', 0x0176: 'n', 0x017d: 'o', 0x0189: 'p',
        0x018b: 'q', 0x018c: 'r', 0x0190: 's', 0x011e: 't', 0x016f: 'u',
        0x01b5: 'v', 0x01c7: 'y', 0x01c6: 'x',
        0x019f: 'ti', 0xfb01: 'fi', 0xfb03: 'ffi', 0xfb00: 'ff',
        0xf071: '*', 0xf0d8: '*', 0xf0fc: '*', 0xf0a7: '*', 
        0x2610: '[ ]', 0x2612: '[x]'
    }
    
    text = text.translate(translation_table)
    
    # Common garbled word patterns
    words = {
        'Wrimt': 'Prime', 'dvrf': 'Adult', 'Eon-': 'Non-',
        'ommtrciau': 'Commercial', 'zovlh': 'Youth', 'evul': 'Adult',
        'rlificiau': 'Artificial', 'itue': 'Site', 'auf': 'Ice',
        '^porl': 'Sport', 'uoor': 'Floor', 'dimt': 'Time', 'fov': 'for',
        'ituez': 'Site', 'D-&': 'M-F', 'Dienighl': 'Midnight',
        'uueay': 'Tuesday', 'limth': 'Time', '/ct-': 'Ice-'
    }
    for garbled, clean in words.items():
        text = text.replace(garbled, clean)
        
    # Remove specific control chars
    for char in ['\x03', '\x04', '\x12', '\x1c', '\x18', '\x11']:
        text = text.replace(char, '')
        
    return text

def clean_md_artifacts(text):
    """
    Cleans up redundant markdown artifacts produced by span-merging.
    """
    # Fix missing spaces before numbering (e.g. "REPORTS4.1" -> "REPORTS 4.1")
    text = re.sub(r'([A-Z])(\d{1,3}(\.\d+)*\.)', r'\1 \2', text)

    # Fix missing spaces after numbering (e.g. "1.CALL" or "4.1STAFF" -> "4.1 STAFF")
    text = re.sub(r'(\b\d{1,3}(\.\d+)*\.?\*?\*?)([A-Z])', r'\1 \2', text)

    # Clean up redundant/floating bold markers
    text = text.replace('** **', ' ')
    text = re.sub(r'\*\*\*+', '**', text)
    
    # Remove leading/trailing spaces inside emphasis markers (Fixes MD037)
    text = re.sub(r'\*\*\s+', '**', text)
    text = re.sub(r'\s+\*\*', '**', text)
    
    # Handle nested/redundant bold: ** **Text** ** -> **Text**
    text = re.sub(r'\*\* \*\*(.*?)\*\* \*\*', r'**\1**', text)
    
    # Remove empty bold blocks
    text = re.sub(r'\*\*\s*\*\*', '', text)
    
    # Final pass for any remaining 4-asterisk blocks
    text = re.sub(r'\*\*\*\*+', '**', text)
    
    # Character level garbage cleaning
    text = clean_garbage(text)
    
    # Ensure no floating bold markers at start/end of lines after cleaning
    lines = []
    for line in text.split('\n'):
        trimmed = line.strip()
        
        # Remove trailing ** if they are alone or at the end of a line
        trimmed = re.sub(r'\s*\*\*\s*$', '', trimmed)
        
        # If line still has odd number of **, something is broken
        if trimmed.count('**') % 2 != 0:
            if trimmed.startswith('**'):
                trimmed = re.sub(r'^\s*\*\*', '', trimmed).strip()
        lines.append(trimmed)
    
    return '\n'.join(lines).strip()

def is_footer_content(text):
    """
    Checks if text looks like a footer (Page X, Date, etc) without position check.
    """
    patterns = [
        r"^Page \d+$",
        r"^Minutes of a .*? Meeting",
        r"^Council Minutes\s+[A-Z][a-z]+ \d{1,2}, \d{4}$",
        r"^[A-Z][a-z]+ \d{1,2}, \d{4}$" # Date only
    ]
    for p in patterns:
        if re.search(p, text.strip(), re.IGNORECASE):
            return True
    return False

def is_footer_or_header(text, page_height, bbox):
    """
    Identifies recursive headers/footers based on text content and page position.
    Ignores blocks that are too tall to be simple headers.
    """
    height = bbox[3] - bbox[1]
    # If block covers significant height (>10% of page), it's content, not a header
    if height > page_height * 0.10:
        return False

    if is_footer_content(text):
        y_pos = bbox[1]
        is_at_edges = (y_pos < page_height * 0.10) or (y_pos > page_height * 0.90)
        return is_at_edges
    
    return False

def extract_pdf_markdown(pdf_path, annotate=True):
    """
    Extracts structured Markdown from a PDF using Layout Analysis.
    """
    try:
        # Suppress MuPDF warnings
        fitz.TOOLS.mupdf_display_errors(False)
        doc = fitz.open(pdf_path)
    except Exception as e:
        print(f"Error opening PDF {pdf_path}: {e}")
        return ""

    body_style, _ = analyze_fonts(doc)
    if not body_style:
        return "" 

    markdown_lines = []
    
    # State Tracking
    current_item_id = "0"
    motion_counter = 0
    is_first_block = True
    agenda_ended = False
    in_motion = False
    pending_item_id = None
    pending_labels = []

    header_pattern = re.compile(r"^((\d{1,3}(\.\d+)*\.)(?:\s*|$))")
    sublist_pattern = re.compile(r"^[a-z]\)\s+")
    # Matches "Internal" headers inside a block. Key Splitters:
    # 1. Numbered Header: "5. BYLAWS" or "6.1.3 Reports" or "7.2 292 Bessborough"
    token_pattern = re.compile(r"(?:^|[\s\*]+|(?<=[A-Z]))((\d{1,3}(\.\d+)*\.)(?:[\s\*]|$|(?=[a-zA-Z]))|MOVED BY:|SECONDED:|THAT\s+|PRESENT WERE:|REGRETS:|PRESENT ALSO:|CARRIED|DEFEATED|Page\s+\d+|Council Minutes\s+)")

    for page in doc:
        blocks = page.get_text("dict")["blocks"]
        blocks.sort(key=lambda b: (b["bbox"][1], b["bbox"][0]))
        page_height = page.rect.height
        
        page_left = 9999
        for b in blocks:
            if b['type'] == 0:
                for line in b["lines"]:
                    if line["bbox"][0] < page_left:
                        page_left = line["bbox"][0]
        
        for b in blocks:
            if b['type'] != 0: continue 
            if not b["lines"]: continue
            
            indent = b["lines"][0]["bbox"][0] - page_left
            
            lines_text = []
            for line in b["lines"]:
                line_parts = []
                for span in line["spans"]:
                    text = span["text"]
                    # If this isn't the first span and neither side has a space, add one
                    if line_parts and not line_parts[-1].endswith(" ") and not text.startswith(" "):
                        line_parts.append(" ")
                    
                    if not text.strip(): continue
                    is_bold = (span["flags"] & 16) or "Bold" in span["font"] or "Black" in span["font"]
                    # Only apply bolding if it contains actual content
                    if is_bold and re.search(r'[a-zA-Z0-9]', span["text"]):
                        # Trim text and wrap in bold, preserving leading/trailing space outside
                        clean_span = span["text"].strip()
                        if clean_span:
                            leading_space = " " if span["text"].startswith(" ") else ""
                            trailing_space = " " if span["text"].endswith(" ") else ""
                            text = f"{leading_space}**{clean_span}**{trailing_space}"
                        else:
                            text = span["text"]
                    line_parts.append(text)
                lines_text.append("".join(line_parts))
            
            # Process block line-by-line to prevent merged headers across spans
            block_segments = []
            for line in lines_text:
                line = clean_garbage(line)
                
                # Split on 3+ spaces to handle columns (Mover/Seconder)
                raw_segments = re.split(r'\s{3,}', line)
                for rs in raw_segments:
                    cursor = 0
                    for match in token_pattern.finditer(rs):
                        content_start = match.start(1)
                        # Check if there are bold markers immediately before group 1
                        while content_start > cursor and rs[content_start-1] == "*":
                            content_start -= 1
                        
                        if content_start > cursor:
                            block_segments.append(rs[cursor:content_start].strip())
                            cursor = content_start
                    block_segments.append(rs[cursor:].strip())

            for segment in block_segments:
                if not segment: continue
                segment = clean_md_artifacts(segment)
                if is_footer_content(segment): continue
                
                if is_first_block:
                    if "TOWN OF VIEW ROYAL" in segment.upper() or "MINUTES" in segment.upper():
                        title_clean = segment.replace('**', '').replace('\n', ' ').strip()
                        markdown_lines.append(f"# {title_clean}\n")
                        is_first_block = False
                        continue
                    is_first_block = False 

                plain_seg = segment.replace("*", "").replace("\n", " ")
                
                # Rule A: Numbered Items (Numeric)
                header_match = header_pattern.match(plain_seg.strip())
                if (header_match or pending_item_id) and not in_motion:
                    # If we matched just a number before, this segment is the title
                    if header_match:
                        item_id = header_match.group(2).strip().strip(".")
                        title_part = plain_seg.strip()[header_match.end():].strip()
                        
                        # Safety Check: If top-level ID is > 100, it's likely a year or address, not an item
                        first_part = item_id.split(".")[0]
                        if first_part.isdigit() and int(first_part) > 100:
                            markdown_lines.append(segment.replace("\n", " "))
                            continue

                        if not title_part:
                            # Just a number, title is likely in next segment
                            pending_item_id = item_id
                            continue
                    else:
                        item_id = pending_item_id
                        title_part = plain_seg.strip()
                        pending_item_id = None

                    # Indentation Check:
                    is_uppercase_header = re.search(r"[A-Z]{4,}", plain_seg)
                    if "." not in item_id and indent > 20 and not is_uppercase_header:
                         markdown_lines.append(segment.replace("\n", " "))
                         continue

                    # Heuristic: If it starts with "1." but says "Report" or "Verbal Report", skip Item tag
                    is_report_ref = re.search(r"^\d+\.\s+.*?\bReport\b", plain_seg.strip(), re.IGNORECASE)
                    
                    if not is_report_ref or is_uppercase_header:
                        current_item_id = item_id
                        motion_counter = 0 
                        if "TERMINATION" in plain_seg.upper() or "ADJOURNMENT" in plain_seg.upper():
                            agenda_ended = True
                        if annotate and not agenda_ended:
                            markdown_lines.append(f"\n<!-- item:{item_id} -->")
                        
                        # Reconstruct full header if it was split
                        header_text = title_part if title_part else segment
                        clean_header = clean_md_artifacts(header_text.strip().replace("\n", " ").strip())
                        markdown_lines.append(f"## {item_id}. {clean_header}\n")
                        continue
                
                # Rule A.2: Sub-Items (a), b)) - Promote to ITEM status
                sub_match = sublist_pattern.match(plain_seg.strip())
                if sub_match and not in_motion:
                    # Extract "a" from "a)"
                    sub_id = plain_seg.strip()[0]
                    
                    # We update current_item_id so motions link to this sub-item
                    if current_item_id and current_item_id[-1].isalpha():
                        if "-" in current_item_id:
                            parent = current_item_id.split("-")[0]
                            current_item_id = f"{parent}-{sub_id}"
                        else:
                            current_item_id = f"{current_item_id}-{sub_id}"
                    elif current_item_id:
                        current_item_id = f"{current_item_id}-{sub_id}"
                    else:
                        current_item_id = sub_id
                        
                    motion_counter = 0
                    if annotate and not agenda_ended:
                        markdown_lines.append(f"\n<!-- item:{current_item_id} -->")
                    
                    # Clean up
                    clean_seg = segment.replace('\n', ' ')
                    markdown_lines.append(f"### {clean_seg}\n") # H3 for sub-items
                    continue
                
                # Rule B: Attendance Lists
                attendance_labels = ["PRESENT WERE:", "PRESENT ALSO:", "REGRETS:"]
                matched_label = next((l for l in attendance_labels if plain_seg.startswith(l)), None)
                if matched_label:
                    markdown_lines.append(f"\n**{matched_label}**\n")
                    # Extract names from lines
                    lines = segment.split("\n")
                    for line in lines:
                        # Strip label if present in this line
                        line = line.replace(f"**{matched_label}**", "").replace(matched_label, "").strip()
                        # Clean up bolding and extra spaces
                        line = re.sub(r"\s{2,}", " ", line.replace("*", "")).strip()
                        if line and len(line) > 2:
                            markdown_lines.append(f"- {line}")
                    # Ensure blank line after list
                    markdown_lines.append("")
                    continue

                # Rule C: Motions
                if "MOVED BY:" in plain_seg:
                    in_motion = True
                    motion_counter += 1
                    name_part = plain_seg.replace("MOVED BY:", "").strip()
                    
                    if annotate and not agenda_ended:
                        markdown_lines.append(f"\n<!-- motion:{current_item_id}-{motion_counter} -->")
                    
                    if name_part:
                        markdown_lines.append(f"**MOVED BY:** {name_part}")
                    else:
                        pending_labels.append("MOVED")
                    continue
                
                if "SECONDED:" in plain_seg:
                    name_part = plain_seg.replace("SECONDED:", "").strip()
                    
                    if annotate and not agenda_ended:
                        markdown_lines.append(f"\n<!-- seconder:{current_item_id}-{motion_counter} -->")
                    
                    if name_part:
                        markdown_lines.append(f"**SECONDED:** {name_part}")
                    else:
                        pending_labels.append("SECONDED")
                    continue
                
                # Rule D: Blockquotes (THAT ...)
                if plain_seg.strip().startswith("THAT"):
                    content = segment.replace(">", "").replace("\n", " ").strip()
                    last_content = next((l for l in reversed(markdown_lines) if l.strip()), "")
                    if last_content.startswith(">") or last_content.startswith("<!--"):
                         markdown_lines.append(f"> {content}")
                    else:
                        markdown_lines.append(f"\n> {content}")
                    continue
                
                # Rule E: Results
                if any(plain_seg.strip().startswith(x) for x in ["CARRIED", "DEFEATED"]):
                    in_motion = False
                    outcome = "CARRIED" if plain_seg.strip().startswith("CARRIED") else "DEFEATED"
                    if annotate and not agenda_ended:
                        markdown_lines.append(f"\n<!-- result:{current_item_id}-{motion_counter} {outcome} -->")
                    seg_clean = clean_md_artifacts(segment.replace('\n', ' '))
                    if not (seg_clean.startswith("**") and seg_clean.endswith("**")):
                        seg_clean = f"**{seg_clean}**"
                    markdown_lines.append(f"{seg_clean}\n")
                    continue
                
                # Handling pending labels (Mover/Seconder names)
                if pending_labels and len(plain_seg.strip()) > 3:
                    label = pending_labels.pop(0)
                    markdown_lines.append(f"**{label} BY:** {segment}")
                    continue

                # For paragraphs, replace internal newlines with spaces
                markdown_lines.append(segment.replace("\n", " "))

    output = "\n".join(markdown_lines)
    output = re.sub(r'\n{3,}', '\n\n', output)
    return output.strip() + "\n"