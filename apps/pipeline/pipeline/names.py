# Canonical Names from Council/Staff records
# This list represents the preferred "clean" version of names.
CANONICAL_NAMES = [
    # Staff
    "Scott M. Sommerville", "Elena Bolster", "Jennifer Cochrane", "Steven Vella",
    "Joel Adams", "Leanne Taylor", "Acacia Hooker", "Paul Hurst", "Kelsea Korki",
    "Ivan Leung", "Ben Lubberts", "Dave Podmoroff",
    "Kim Anema", "Sarah Jones", "Damon Christenson", "Sterling Scory", "Lindsay Chase",
    "Jeff Chow", "John Rosenberg", "Dawn Christenson", "Elena McCusker", "J. Beauchamp",
    "M. Dillabaugh", "K. Day", "K. Young", "M. Gloumeau", "G. Faykes", "J. Crockett",
    "D. Becelaere", "T. Preston",
    
    # Council
    "Sid Tobias", "David Screech", "Damian Kowalewich", "John Rogers",
    "Alison MacKenzie", "Ron Mattson", "Gery Lemon", "Don Brown",
    "Graham Hill", "Heidi Rast", "Andrew Britton", "Aaron Weisgerber",
    "Nicholas Anderson"
]

# Subset for voting validation (Confirmed from DB)
COUNCIL_NAMES = [
    "Aaron Weisgerber", "Alison MacKenzie", "Andrew Britton", "Damian Kowalewich",
    "David Screech", "Don Brown", "Geri Anderson", "Gery Lemon", "Graham Hill",
    "Heidi Rast", "John Rogers", "Ron Mattson", "Sid Tobias"
]

# Manual name variants and common typos for high-confidence mapping
NAME_VARIANTS = {
    "matson": "Ron Mattson",
    "mattson": "Ron Mattson",
    "rogers": "John Rogers",
    "brown": "Don Brown",
    "lemon": "Gery Lemon",
    "lemmon": "Gery Lemon",
    "damian lemon": "Gery Lemon",
    "kowalewich": "Damian Kowalewich",
    "mackenzie": "Alison MacKenzie",
    "allison mackenzie": "Alison MacKenzie",
    "screech": "David Screech",
    "tobias": "Sid Tobias",
    "weisgerber": "Aaron Weisgerber",
    "anema": "Kim Anema",
    "amena": "Kim Anema",
    "k anema": "Kim Anema",
    "kanema": "Kim Anema",
    "jones": "Sarah Jones",
    "scott": "Scott M. Sommerville",
    "sommerville": "Scott M. Sommerville",
    "s sommerville": "Scott M. Sommerville",
    "s jones": "Sarah Jones",
    "l chase": "Lindsay Chase",
    "e bolster": "Elena Bolster",
    "j rosenberg": "John Rosenberg",
    "d christenson": "Damon Christenson",
    "d christensen": "Damon Christenson",
    "p hurst": "Paul Hurst",
    "jeff": "Jeff Chow",
    "j chow": "Jeff Chow",
    "ivan": "Ivan Leung",
    "i leung": "Ivan Leung",
    "leanne": "Leanne Taylor",
    "l taylor": "Leanne Taylor",
    "e mccusker": "Elena McCusker",
    "j cochrane": "Jennifer Cochrane",
    "m brennan": "M. Brennan",
    "s vella": "Steven Vella",
    "j davison": "J. Davison",
    "s scory": "Sterling Scory",
    "i scott": "I. Scott",
    "k day": "K. Day",
    "k young": "K. Young",
    "m gloumeau": "M. Gloumeau",
    "g hill": "Graham Hill",
    "graham hill": "Graham Hill",
    "mayor hill": "Graham Hill",
    "mayorhill": "Graham Hill",
    "david screech": "David Screech",
    "anderson": "Nicholas Anderson",
    "m a y o r  h i l l": "Graham Hill",
    "m a y o r h i l l": "Graham Hill"
}

# Names or terms that should never be created as Person records
PERSON_BLOCKLIST = [
    "the mayor", "staff", "resident", "unknown", "speaker", "everyone",
    "all council", "public", "audience", "applicant", "consultant",
    "gallery", "various", "multiple", "unidentified", "city staff",
    "town staff", "clerk", "recording secretary", "moderator",
    "presenter", "developer", "architect", "engineer", "planner"
]

def is_valid_name(name):
    """
    Returns False if the name is empty, too short, or in the blocklist.
    """
    if not name: return False
    
    clean = name.lower().strip()
    
    # 1. Blocklist check (exact or contains)
    for blocked in PERSON_BLOCKLIST:
        if clean == blocked or clean.startswith(blocked + " "):
            return False
            
    # 2. Too short (likely noise)
    if len(clean) < 3 and clean not in ["k. day", "k. young"]: # Allow known initials
        return False
        
    # 3. Numeric noise
    if any(char.isdigit() for char in clean):
        return False
        
    return True

def get_canonical_name(name):
    """
    Returns the canonical version of a name if a match is found.
    """
    if not name: return name
    
    lower_name = name.lower().strip().replace('.', '')
    
    # Check direct variants
    if lower_name in NAME_VARIANTS:
        return NAME_VARIANTS[lower_name]
    
    # Check if name is already canonical (case insensitive check)
    for c_name in CANONICAL_NAMES:
        if c_name.lower() == name.lower():
            return c_name
            
    # Check surnames if it's just a single name
    parts = name.split()
    if len(parts) == 1:
        surname = parts[0].lower()
        if surname in NAME_VARIANTS:
            return NAME_VARIANTS[surname]
            
    return name
