import os
import sys
import time
from urllib.parse import urljoin
from pipeline import utils
from pipeline.civicweb import CivicWebClient
from pipeline.paths import ARCHIVE_ROOT

# --- Configuration ---
BASE_URL = "https://viewroyalbc.civicweb.net"

class CivicWebScraper(CivicWebClient):
    def __init__(self):
        super().__init__()

    def download_file(self, item, top_level, parent_folder_name):
        """
        Downloads a single file, determining its correct archive path first.
        """
        title = item.get('Title', 'Untitled')
        file_id = item.get('Id')
        extension = item.get('Extension', '').replace('.', '')
        if not extension:
            extension = item.get('FileFormat', '')

        # Skip Html.docx files (redundant HTML-exported Word docs)
        if '- Html' in title and extension.lower() == 'docx':
            return

        # 1. Determine Correct Archive Path
        meta = utils.parse_file_metadata(title, parent_folder_name)
        if not meta["date"]:
            folder_date = utils.extract_date_from_string(parent_folder_name)
            if folder_date:
                meta["date"] = folder_date

        if not meta["date"]:
            return

        target_dir = utils.get_target_path(ARCHIVE_ROOT, top_level or "Uncategorized", meta)

        # 2. Determine filename
        filename = utils.sanitize_filename(title)

        if extension and not filename.lower().endswith(f".{extension.lower()}"):
            filename = f"{filename}.{extension}"

        file_path = os.path.join(target_dir, filename)

        if os.path.exists(file_path):
            return

        # 3. Download
        download_suffix = item.get('ContentUrl')
        if not download_suffix and file_id:
            download_suffix = f"/document/{file_id}"

        if not download_suffix:
            return

        download_url = urljoin(BASE_URL, download_suffix)

        if not os.path.exists(target_dir):
            os.makedirs(target_dir, exist_ok=True)

        print(f"[*] Downloading: {filename} -> {os.path.relpath(target_dir, ARCHIVE_ROOT)}")
        try:
            with self.session.get(download_url, stream=True) as r:
                r.raise_for_status()
                with open(file_path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
                # Save the URL to a companion file
                with open(f"{file_path}.url", 'w') as f:
                    f.write(download_url)
        except Exception as e:
            print(f"[!] Failed to download {filename}: {e}")

    def scrape_recursive(self, folder_id=None, top_level=None, parent_folder_name=""):
        """
        Recursively processes folders.
        """
        items = list(self._fetch_items(folder_id))
        if not items:
            return

        for item in items:
            item_id = item.get('Id')
            title = item.get('Title', 'Unknown')
            is_folder = item.get('Folder', False)

            if is_folder:
                current_top = top_level
                if folder_id is None:
                    current_top = utils.normalize_top_level(title)
                
                self.scrape_recursive(item_id, current_top, title)
            else:
                self.download_file(item, top_level, parent_folder_name)

def run_scraper():
    print("--- CivicWeb Scraper (Archive Mode) ---")
    print(f"Archive: {ARCHIVE_ROOT}")
    print("---------------------------------------")
    scraper = CivicWebScraper()
    try:
        scraper.scrape_recursive(None)
        print("\n[SUCCESS] Scraping completed.")
    except KeyboardInterrupt:
        print("\n[!] Stopped by user.")
    except Exception as e:
        print(f"\n[!] Unexpected Error: {e}")

if __name__ == "__main__":
    run_scraper()