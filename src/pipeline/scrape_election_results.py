import json
import random
import time

from bs4 import BeautifulSoup
from curl_cffi import requests


def scrape_view_royal_json():
    base_url = "https://www.civicinfo.bc.ca/election-results-v3/index.php"
    lg_id = 143

    # 1. Get Years
    print("Fetching years...")
    r = requests.get(f"{base_url}?localgovernmentid={lg_id}", impersonate="chrome")
    soup = BeautifulSoup(r.content, "html.parser")

    # Find all years in the dropdown
    years = [
        o["value"]
        for o in soup.select("select[name='select-year'] option")
        if o["value"].isdigit()
    ]

    results = {"municipality": "Town of View Royal", "id": lg_id, "elections": []}

    # 2. Loop Years
    for year in years:
        print(f"Scraping {year}...")
        election_entry = {"year": int(year), "offices": []}

        # Fetch the page
        url = f"{base_url}?localgovernmentid={lg_id}&select-year={year}&select-view-by=municipality"
        r = requests.get(url, impersonate="chrome")
        soup = BeautifulSoup(r.content, "html.parser")

        # Find all tables
        tables = soup.find_all("table")

        for table in tables:
            # Find the header before the table (e.g., "Councillor Election Results")
            header = table.find_previous(re.compile(r"^h\d"))
            header_text = header.get_text(strip=True) if header else "Unknown"

            # Determine Position
            position = "Unknown"
            if "Mayor" in header_text:
                position = "Mayor"
            elif "Council" in header_text:
                position = "Councillor"
            elif "School" in header_text:
                position = "School Trustee"
            else:
                continue  # Skip other tables like "Referendum"

            office_entry = {"position": position, "candidates": []}

            # Parse Rows
            rows = table.find_all("tr")[1:]  # Skip header
            for tr in rows:
                cols = tr.find_all("td")
                if not cols:
                    continue

                # Check bold for elected status
                is_elected = bool(tr.select_one("b, strong"))

                # Extract Text
                name = cols[0].get_text(strip=True)

                # Handle Acclamation (no votes)
                votes = 0
                acclaimed = False
                if len(cols) > 1:
                    vote_text = cols[1].get_text(strip=True).replace(",", "")
                    if vote_text.isdigit():
                        votes = int(vote_text)
                    elif "acclaim" in vote_text.lower():
                        acclaimed = True

                candidate = {"name": name, "votes": votes, "elected": is_elected}
                if acclaimed:
                    candidate["acclaimed"] = True

                office_entry["candidates"].append(candidate)

            election_entry["offices"].append(office_entry)

        results["elections"].append(election_entry)
        time.sleep(random.uniform(1, 3))  # Polite delay

    # 3. Save to File
    with open("view_royal_full_history.json", "w") as f:
        json.dump(results, f, indent=2)

    print("Done! Saved to view_royal_full_history.json")


if __name__ == "__main__":
    import re

    scrape_view_royal_json()
