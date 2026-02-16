import time
import requests
from urllib.parse import urljoin
from pipeline import config

class CivicWebClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": config.USER_AGENT, 
            "Accept": "application/json"
        })

    def _get_api_url(self, folder_id=None):
        if folder_id is None:
            return urljoin(config.CIVICWEB_BASE_URL, "/api/documents/getchildlist")
        return urljoin(config.CIVICWEB_BASE_URL, f"/api/document/{folder_id}/getchildlist")

    def _fetch_items(self, folder_id):
        page = 1
        url = self._get_api_url(folder_id)
        while True:
            params = {
                "page": page, 
                "resultsPerPage": 100, 
                "_": int(time.time() * 1000)
            }
            try:
                response = self.session.get(url, params=params, timeout=config.REQUEST_TIMEOUT)
                if response.status_code != 200:
                    break

                data = response.json()
                items = data if isinstance(data, list) else data.get("items", data.get("result", []))

                if not items:
                    break
                for item in items:
                    yield item
                if len(items) < 100:
                    break
                page += 1
                time.sleep(config.DELAY_BETWEEN_REQUESTS)
            except Exception as e:
                print(f"[!] Error fetching folder {folder_id}: {e}")
                break
