import os
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from src.core import utils
from src.core.paths import ARCHIVE_ROOT

# Configuration
BASE_URL = "https://www.viewroyal.ca"
BYLAWS_URL = "https://www.viewroyal.ca/EN/main/town/bylaws/administration.html"
TARGET_DIR = os.path.join(ARCHIVE_ROOT, "Bylaws")


def sanitize_bylaw_name(name):
    """
    Sanitizes the filename to be safe for filesystem.
    Removes [PDF - ...] suffix if present and other common noise.
    """
    # Remove the [PDF - ... ] part if it exists in the link text
    name = re.sub(r"\s*\[PDF\s*-\s*.*?\]", "", name, flags=re.IGNORECASE)
    # Remove trailing file sizes or type indicators often found in link text
    name = re.sub(r"\s*\(\d+\s*KB\)", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s*\(\d+\s*MB\)", "", name, flags=re.IGNORECASE)

    return utils.sanitize_filename(name.strip())


def download_bylaw(url, title, folder):
    """Downloads a single bylaw PDF."""
    filename = sanitize_bylaw_name(title)

    # Ensure extension
    if not filename.lower().endswith(".pdf"):
        filename += ".pdf"

    filepath = os.path.join(folder, filename)

    if os.path.exists(filepath):
        # Optional: Check size or overwrite? For now, skip if exists to be polite.
        print(f"[SKIP] Already exists: {filename}")
        return

    print(f"[*] Downloading: {filename}")
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()
        with open(filepath, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
    except Exception as e:
        print(f"[!] Failed to download {filename}: {e}")


def scrape_bylaws():
    print(f"--- View Royal Bylaws Scraper ---")
    print(f"Target URL: {BYLAWS_URL}")
    print(f"Archive Dir: {TARGET_DIR}")

    if not os.path.exists(TARGET_DIR):
        print(f"[*] Creating directory: {TARGET_DIR}")
        os.makedirs(TARGET_DIR, exist_ok=True)

    try:
        print(f"[*] Fetching index...")
        response = requests.get(BYLAWS_URL)
        response.raise_for_status()

        soup = BeautifulSoup(response.content, "html.parser")

        # The page lists bylaws alphabetically.
        # We assume that any link pointing to a PDF with "Bylaw" or "Plan" in the text
        # (or effectively any PDF on this specific 'All Bylaws' page) is a target.

        links = soup.find_all("a", href=True)

        count = 0
        for link in links:
            href = link["href"]
            text = link.get_text(" ", strip=True)  # Replace newlines with spaces

            # We are only interested in PDFs
            if href.lower().endswith(".pdf"):
                # Filter logic: The "All Bylaws" page is fairly clean, but we can check keywords
                # to avoid headers or footer links (though footer links usually aren't PDFs).
                # Most bylaws have "Bylaw" in the title, but some might be "Official Community Plan".

                # Heuristic: If it has a Bylaw number or year, or explicitly says Bylaw/Plan
                if any(
                    x in text.lower()
                    for x in ["bylaw", "plan", "policy", "schedule", "regulation"]
                ):
                    full_url = urljoin(BASE_URL, href)
                    download_bylaw(full_url, text, TARGET_DIR)
                    count += 1
                else:
                    # Log what we skipped just in case we miss something important
                    # (e.g. "Fee Schedule" might not have 'bylaw' in text)
                    pass

        print(f"\n[SUCCESS] Processed {count} documents.")

    except Exception as e:
        print(f"[!] Fatal Error: {e}")


if __name__ == "__main__":
    scrape_bylaws()
