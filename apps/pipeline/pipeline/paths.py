import os

# Root project directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Data and Archive
ARCHIVE_ROOT = os.path.join(BASE_DIR, "viewroyal_archive")
DOCUMENTS_ROOT = os.path.join(BASE_DIR, "viewroyal_all_documents")

# Output and Reports
REPORTS_DIR = os.path.join(BASE_DIR, "reports")
LOGS_DIR = os.path.join(BASE_DIR, "logs")

# Specific Data Files
ELECTION_HISTORY_JSON = os.path.join(BASE_DIR, "data", "seed", "view_royal_full_history.json")

def get_report_path(filename):
    """Returns the absolute path for a report file."""
    if not os.path.exists(REPORTS_DIR):
        os.makedirs(REPORTS_DIR, exist_ok=True)
    return os.path.join(REPORTS_DIR, filename)

def get_archive_path(*args):
    """Returns a path relative to the archive root."""
    return os.path.join(ARCHIVE_ROOT, *args)


def get_municipality_archive_root(slug: str) -> str:
    """Returns archive root for a municipality, e.g. /project/archive/view-royal/"""
    if slug == "view-royal":
        # Backward compatibility: use the legacy viewroyal_archive if it exists
        legacy_path = os.path.join(BASE_DIR, "viewroyal_archive")
        if os.path.exists(legacy_path):
            return legacy_path

    root = os.path.join(BASE_DIR, "archive", slug)
    os.makedirs(root, exist_ok=True)
    return root
