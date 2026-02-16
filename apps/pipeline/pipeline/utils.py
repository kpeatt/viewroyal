import datetime
import os
import re


def sanitize_filename(name):
    """Sanitizes a string to be safe for filenames."""
    name = " ".join(name.split())  # Normalize whitespace
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    return name.strip()


def extract_date_from_string(text):
    """Returns 'YYYY-MM-DD' or None."""
    if not text:
        return None

    # YYYY-MM-DD
    match = re.search(r"(\d{4})[\s.-]+(\d{2})[\s.-]+(\d{2})", text)
    if match:
        return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"

    # Month DD, YYYY
    try:
        # Check for Month Name first
        date_pattern = r"([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})"
        match = re.search(date_pattern, text)
        if match:
            date_str = f"{match.group(1)} {match.group(2)} {match.group(3)}"
            
            # Try Full Month
            try:
                dt = datetime.datetime.strptime(date_str, "%B %d %Y")
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                pass
            
            # Try Abbreviated Month
            try:
                dt = datetime.datetime.strptime(date_str, "%b %d %Y")
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                pass
    except:
        pass
    return None


def infer_meeting_type(text):
    """
    Maps a meeting title or filename to the official meeting_type enum.
    """
    if not text:
        return None
        
    lower = text.lower()
    
    if "public hearing" in lower:
        return "Public Hearing"
    
    if "committee of the whole" in lower or "committee of whole" in lower or "cow" in lower.split():
        return "Committee of the Whole"
        
    if "board of variance" in lower:
        return "Board of Variance"
        
    if "special council" in lower:
        return "Special Council"
        
    if "regular council" in lower:
        return "Regular Council"
        
    if "standing committee" in lower:
        return "Standing Committee"
        
    if "advisory committee" in lower or "commission" in lower:
        return "Advisory Committee"
        
    if "council" in lower:
        # Default to Regular Council if 'Council' is mentioned but not 'Special'
        return "Regular Council"
        
    return None


def normalize_top_level(name):
    """Merges Special/Regular Council into 'Council'."""
    lower = name.lower()
    if "special council" in lower or "regular council" in lower:
        return "Council"
    
    # Strip suffixes like "Agenda", "Minutes"
    clean = re.sub(r"\s+(Agenda|Minutes|Meeting)$", "", name, flags=re.IGNORECASE)
    return clean.strip()


def parse_file_metadata(filename, context_str=""):
    """
    Analyzes filename + context (parent folder name) to determine:
    - Date
    - Meeting Suffix (e.g. 'Regular Council')
    - Category (Agenda, Minutes, Video, Transcript)
    """
    meta = {"date": None, "meeting_suffix": "Meeting", "category": "Other Documents"}

    # 1. Detect Date
    date_match = re.search(r"(\d{4})[\s.-](\d{2})[\s.-](\d{2})", filename)
    if date_match:
        meta["date"] = (
            f"{date_match.group(1)}-{date_match.group(2)}-{date_match.group(3)}"
        )

    # 2. Detect Category
    lower_name = filename.lower()
    if lower_name.endswith(".mp4"):
        meta["category"] = "Video"
    elif lower_name.endswith(".vtt") or lower_name.endswith(".srt"):
        meta["category"] = "Transcript"
    elif "agenda" in lower_name:
        meta["category"] = "Agenda"
    elif "minutes" in lower_name:
        meta["category"] = "Minutes"

    # 3. Detect Meeting Suffix
    combined = (filename + " " + context_str).lower()
    if "committee of the whole" in combined:
        meta["meeting_suffix"] = "Committee of the Whole"
    elif "committee of whole" in combined:
        meta["meeting_suffix"] = "Committee of the Whole"
    elif "cow" in combined.split():
        meta["meeting_suffix"] = "Committee of the Whole"
    elif "special council" in combined:
        meta["meeting_suffix"] = "Special Council"
    elif "regular council" in combined:
        meta["meeting_suffix"] = "Regular Council"
    elif "joint council" in combined:
        meta["meeting_suffix"] = "Joint Council"
    elif "public hearing" in combined:
        meta["meeting_suffix"] = "Public Hearing"
    elif "advisory" in combined:
        meta["meeting_suffix"] = "Advisory Committee"
    elif "council" in combined and meta["meeting_suffix"] == "Meeting":
        meta["meeting_suffix"] = "Council Meeting"

    return meta


def get_target_path(root_dir, top_level, meta):
    """
    Constructs the final organized path:
    root / TopLevel / Year / Month / YYYY-MM-DD Suffix / Category
    
    Includes 'Folder Awareness' to prevent duplicates:
    - If a folder for the same date already exists, use it.
    - If multiple exist, use the most descriptive one.
    """
    if not meta["date"]:
        return os.path.join(root_dir, "Unsorted", top_level or "General")

    # Override top_level based on specific meeting suffix to fix misfiling
    suffix_lower = meta["meeting_suffix"].lower()
    if "council" in suffix_lower and "advisory" not in suffix_lower:
        top_level = "Council"
    elif "committee of the whole" in suffix_lower:
        top_level = "Committee of the Whole"
    elif "public hearing" in suffix_lower:
        top_level = "Public Hearing"
    elif "advisory" in suffix_lower:
        top_level = "Joint Advisory Committee"
    elif "board of variance" in suffix_lower:
        top_level = "Board of Variance"

    year = meta["date"].split("-")[0]
    month = meta["date"].split("-")[1]
    
    base_dir = os.path.join(root_dir, top_level, year, month)
    
    # Check if a folder for this date already exists on disk
    existing_folder = None
    if os.path.exists(base_dir):
        # Look for folders starting with 'YYYY-MM-DD'
        for d in os.listdir(base_dir):
            if d.startswith(meta["date"]):
                # Found a potential match!
                # Logic: If existing folder is 'Meeting', and meta says 'Special Council', 
                # we SHOULD rename the folder, but for scraping purposes, we'll just merge into the existing one
                # to avoid fragmentation. If the existing one is descriptive, keep it.
                existing_folder = d
                break
                
    if existing_folder:
        meeting_folder = existing_folder
    else:
        # Create a new one
        meeting_folder = f"{meta['date']} {meta['meeting_suffix']}"

    return os.path.join(base_dir, meeting_folder, meta["category"])


# --- NLP / Text Cleaning ---

# Regex patterns for Roles
ROLE_PATTERNS = [
    # Council
    (r"\bMayor\b", "Mayor", "Council"),
    (r"\bActing Mayor\b", "Acting Mayor", "Council"),
    (r"\bCouncill?or\b", "Councillor", "Council"),
    
    # Staff - High Level
    (r"\bChief Administrative Officer\b", "Chief Administrative Officer", "Staff"),
    (r"\bCAO\b", "Chief Administrative Officer", "Staff"),
    (r"\bCorporate Officer\b", "Corporate Officer", "Staff"),
    (r"\bFire Chief\b", "Fire Chief", "Staff"),
    (r"\bDeputy Fire Chief\b", "Deputy Fire Chief", "Staff"),
    
    # Staff - Directors (Specific departments)
    (r"\bDirector of (Finance|Engineering|Planning|Development Services|Corporate Administration|Parks|Recreation)\b", lambda m: m.group(0).strip(), "Staff"),
    (r"\bDirector\b", "Director", "Staff"),
    
    # Staff - Managers
    (r"\bManager of (Accounting|Finance|Engineering|Planning)\b", lambda m: m.group(0).strip(), "Staff"),
    (r"\bManager\b", "Manager", "Staff"),
    
    # Staff - Planners/Engineers
    (r"\bSenior Planner\b", "Senior Planner", "Staff"),
    (r"\bCommunity Planner\b", "Community Planner", "Staff"),
    (r"\bPlanner\b", "Planner", "Staff"),
    (r"\bTown Engineer\b", "Town Engineer", "Staff"),
    
    # Generic Staff catch-all (if 'Staff' appears in name)
    (r"\bStaff\b", "Staff Member", "Staff"),
]

def extract_roles_from_name(name):
    """
    Extracts roles like 'Mayor', 'Councillor', 'Director of X' from a name string.
    Returns a list of tuples: (role_name, organization_type)
    """
    found_roles = []
    
    for pattern, role_val, org_type in ROLE_PATTERNS:
        match = re.search(pattern, name, re.IGNORECASE)
        if match:
            if callable(role_val):
                role_str = role_val(match)
            else:
                role_str = role_val
            role_str = role_str.strip()
            found_roles.append((role_str, org_type))
            
    # Filter subsets (e.g. keep "Director of Finance", drop "Director")
    final_roles = []
    for r1 in found_roles:
        is_subset = False
        for r2 in found_roles:
            if r1 == r2: continue
            if r1[0] in r2[0] and len(r2[0]) > len(r1[0]):
                is_subset = True
                break
        if not is_subset:
            final_roles.append(r1)
            
    return list(set(final_roles))


import difflib

def parse_name_components(name):
    """Split name into components for better comparison."""
    if not name:
        return {"first": "", "last": "", "initial": "", "full": ""}
    
    parts = name.split()
    if len(parts) == 1:
        return {
            "first": "",
            "initial": "",
            "last": parts[0],
            "full": name
        }
    
    first = parts[0]
    last = parts[-1]
    
    is_initial = len(first) <= 2 and (first.endswith('.') or len(first) == 1)
    
    return {
        "first": first if not is_initial else "",
        "initial": first[0] if first else "",
        "last": last,
        "full": name
    }


def is_potential_duplicate(p1_name, p2_name):
    """
    Check if two names are likely the same person.
    Ported from find_duplicates.py
    """
    if not p1_name or not p2_name:
        return False
        
    n1_raw = p1_name.strip()
    n2_raw = p2_name.strip()
    
    # Special cases
    if (n1_raw == "Maureen Rogers" and n2_raw == "Rogers") or (n2_raw == "Maureen Rogers" and n1_raw == "Rogers"):
        return False

    n1 = parse_name_components(n1_raw)
    n2 = parse_name_components(n2_raw)
    
    # If last names are provided for both, they must match closely
    if n1['last'] and n2['last']:
        last_ratio = difflib.SequenceMatcher(None, n1['last'].lower(), n2['last'].lower()).ratio()
        if last_ratio < 0.85:
            if not (n1['last'].lower() in n2['last'].lower() or n2['last'].lower() in n1['last'].lower()):
                return False
    elif n1['last'] or n2['last']:
        avail_last = n1['last'] if n1['last'] else n1['full']
        other_last = n2['last'] if n2['last'] else n2['full']
        if avail_last.lower() != other_last.lower():
            return False

    # First name / initial compatibility
    if n1['first'] and n2['first']:
        first_ratio = difflib.SequenceMatcher(None, n1['first'].lower(), n2['first'].lower()).ratio()
        if first_ratio < 0.8:
            return False
    elif n1['initial'] and n2['initial']:
        if n1['initial'].lower() != n2['initial'].lower():
            return False
    elif n1['initial'] and n2['first']:
        if n1['initial'].lower() != n2['first'][0].lower():
            return False
    elif n2['initial'] and n1['first']:
        if n2['initial'].lower() != n1['first'][0].lower():
            return False
            
    return True


from pipeline.names import get_canonical_name

def match_person(raw_name, people_list):
    """
    Attempts to match a raw name against a list of existing people.
    Does NOT create new records.
    """
    if not raw_name:
        return None
    
    normalized = normalize_person_name(raw_name)
    if not normalized:
        return None
        
    lower_norm = normalized.lower()
    
    # 1. Exact match on normalized name
    for p in people_list:
        if p["name"].lower() == lower_norm:
            return p["id"]
            
    # 2. Surname-only match if confident (unique in the people_list)
    parts = normalized.split()
    if len(parts) >= 1:
        surname = parts[-1].lower()
        matches = [p for p in people_list if p["name"].split()[-1].lower() == surname]
        if len(matches) == 1:
            return matches[0]["id"]
            
    # 3. Use potential duplicate logic
    for p in people_list:
        if is_potential_duplicate(normalized, p["name"]):
            return p["id"]
            
    return None


def normalize_person_name(name):
    """
    Cleans and canonicalizes a person's name.
    """
    clean = clean_person_name(name)
    return get_canonical_name(clean)


def clean_person_name(name):
    """
    Strips titles, honorifics, and job descriptions from a name.
    e.g. "Mayor David Screech" -> "David Screech"
    e.g. "K. Anema, Chief Administrative Officer" -> "K. Anema"
    """
    if not name: return ""

    # Handle "M a y o r  H i l l" - check if it's very spaced out
    if " " in name and len(name) > 5:
        # Collapse spaces if it matches a pattern of letters separated by space
        if re.search(r'([A-Z]\s){3,}', name):
             name = name.replace(' ', '')
        elif "  " in name:
             # If it looks like a spaced header, try to collapse it
             collapsed = re.sub(r'\s{2,}', ' ', name).strip()
             if len(collapsed) < len(name) / 1.5:
                  name = collapsed

    # 1. Strip anything after delimiters (usually a title or meeting info)
    # Delimiters: comma, em-dash, en-dash, hyphen (if followed by space)
    delimiters = [',', '–', '—', ' - ']
    for d in delimiters:
        if d in name:
            name = name.split(d)[0].strip()

    # 2. Remove parenthetical info
    name = re.sub(r'\s*\(.*\)', '', name)

    # 3. Handle names with spaces between every letter (e.g. "M a y o r")
    if re.match(r'^([A-Z]\s){3,}', name):
        name = name.replace(' ', '')

    # 4. Specific long titles first (as prefixes)
    long_prefixes = [
        "Chief Administrative Officer", "Corporate Officer",
        "Director of Finance and Technology", "Director of Finance", 
        "Director of Engineering", "Director of Planning", 
        "Director of Development Services", "Director of Corporate Administration",
        "Director of Protective Services",
        "Manager of Accounting", "Deputy Corporate Officer", "Deputy Municipal Clerk"
    ]
    for p in long_prefixes:
         pattern = re.compile(f"^{re.escape(p)}\\s+", re.IGNORECASE)
         name = pattern.sub("", name)

    prefixes = [
        "Mayor", "Acting Mayor", "Councillor", "Councilor", "Council member", "Cclr",
        "Dr.", "Mr.", "Mrs.", "Ms.", "Chief",
        "Director", "Planner", "Staff", "Fire Chief"
    ]
    for p in prefixes:
        # Match prefix followed by space or dot+space
        pattern = re.compile(f"^{re.escape(p)}\\.?\\s+", re.IGNORECASE)
        name = pattern.sub("", name)
        
    return name.strip()


def read_text_file(path):
    """
    Reads a text file trying multiple encodings (utf-8, cp1252, latin-1).
    """
    encodings = ["utf-8", "cp1252", "latin-1"]
    last_exception = None
    
    for enc in encodings:
        try:
            with open(path, "r", encoding=enc) as f:
                return f.read()
        except UnicodeDecodeError as e:
            last_exception = e
            continue
        except Exception as e:
            # Other errors (FileNotFound, etc) should just raise
            raise e
            
    # If we get here, all encodings failed
    if last_exception:
        raise last_exception
    return ""


def natural_sort_key(s):
    """
    Key for natural sorting (e.g., "Item 10" comes after "Item 2").
    Splits text into a list of strings and integers.
    """
    if not s:
        return []
    return [int(text) if text.isdigit() else text.lower()
            for text in re.split(r'([0-9]+)', str(s))]



