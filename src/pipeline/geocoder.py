"""
Geocode related_address values on agenda_items using Google Geocoding API.
Writes PostGIS geography points via psycopg2, then propagates to matters.

Usage:
    uv run python -m src.pipeline.geocoder
    uv run python -m src.pipeline.geocoder --dry-run
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

load_dotenv()

import requests
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_KEY")
GOOGLE_GEOCODING_API_KEY = os.environ.get("GOOGLE_GEOCODING_API_KEY")

CACHE_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "geocode_cache.json"

# View Royal bounding box for biasing results
VIEW_ROYAL_BOUNDS = "48.43,-123.45|48.47,-123.39"
VIEW_ROYAL_SUFFIX = ", View Royal, BC, Canada"

GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json"

# Suffixes to strip for normalization (case-insensitive)
CITY_SUFFIXES = re.compile(
    r",?\s*(?:View Royal|Victoria|Langford|Colwood|Esquimalt|Saanich),?\s*(?:BC|B\.C\.)?(?:\s+V\d\w\s*\d\w\d)?\.?\s*$",
    re.IGNORECASE,
)


def normalize_address(addr: str) -> str:
    """Normalize address for deduplication. Returns a canonical form."""
    addr = addr.strip()
    # Strip trailing city/province/postal suffixes
    addr = CITY_SUFFIXES.sub("", addr)
    # Collapse whitespace
    addr = re.sub(r"\s+", " ", addr).strip().rstrip(".")
    return addr


def load_cache() -> dict:
    """Load geocode cache from disk."""
    if CACHE_PATH.exists():
        with open(CACHE_PATH) as f:
            return json.load(f)
    return {}


def save_cache(cache: dict):
    """Write geocode cache to disk."""
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_PATH, "w") as f:
        json.dump(cache, f, indent=2)


def geocode_address(address: str, api_key: str) -> dict | None:
    """
    Geocode a single address via Google Geocoding API.
    Returns {"lat": float, "lng": float} or None on failure.
    """
    query = address if "view royal" in address.lower() else address + VIEW_ROYAL_SUFFIX

    resp = requests.get(
        GEOCODING_URL,
        params={
            "address": query,
            "key": api_key,
            "bounds": VIEW_ROYAL_BOUNDS,
        },
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()

    if data["status"] == "OK" and data["results"]:
        loc = data["results"][0]["geometry"]["location"]
        return {"lat": loc["lat"], "lng": loc["lng"]}

    if data["status"] == "ZERO_RESULTS":
        print(f"  [!] No results for: {address}")
        return None

    print(f"  [!] Geocoding error for '{address}': {data['status']}")
    return None


def get_db_connection():
    """Reuse the connection logic from embed_local."""
    from src.pipeline.embed_local import get_db_connection as _get_conn
    return _get_conn()


def geocode_all_addresses(dry_run: bool = False):
    """Main geocoding flow."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env")
        sys.exit(1)

    if not GOOGLE_GEOCODING_API_KEY:
        print("Error: GOOGLE_GEOCODING_API_KEY must be set in .env")
        sys.exit(1)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Fetch agenda items that have an address but no geo (paginate past 1000 limit)
    print("Fetching agenda items needing geocoding...")
    items = []
    page_size = 1000
    offset = 0
    while True:
        result = (
            supabase.table("agenda_items")
            .select("id, related_address")
            .not_.is_("related_address", "null")
            .is_("geo", "null")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        items.extend(result.data)
        if len(result.data) < page_size:
            break
        offset += page_size

    print(f"  Found {len(items)} agenda items with addresses but no geo")

    if not items:
        print("Nothing to geocode.")
        return

    # Deduplicate addresses (related_address is a JSON array of strings)
    # Normalize to collapse near-duplicates like "1767 Island Highway" vs
    # "1767 Island Highway, Victoria, BC"
    address_to_ids: dict[str, list[int]] = {}
    for item in items:
        addrs = item["related_address"]
        if isinstance(addrs, str):
            addrs = [addrs]
        if not isinstance(addrs, list):
            continue
        for addr in addrs:
            normalized = normalize_address(str(addr))
            if normalized:
                address_to_ids.setdefault(normalized, []).append(item["id"])

    unique_addresses = list(address_to_ids.keys())
    print(f"  {len(unique_addresses)} unique addresses to geocode (after normalization)")

    # Load cache
    cache = load_cache()
    cached_count = sum(1 for a in unique_addresses if a in cache)
    if cached_count:
        print(f"  {cached_count} already cached, {len(unique_addresses) - cached_count} to fetch")

    # Geocode each unique address
    api_calls = 0
    for addr in unique_addresses:
        if addr in cache:
            continue

        if dry_run:
            print(f"  [dry-run] Would geocode: {addr}")
            continue

        result = geocode_address(addr, GOOGLE_GEOCODING_API_KEY)
        api_calls += 1

        if result:
            cache[addr] = result
            print(f"  Geocoded: {addr} -> ({result['lat']}, {result['lng']})")
        else:
            # Cache failures as None so we don't re-try
            cache[addr] = None

        # Rate limit: 10 req/sec
        time.sleep(0.1)

    if not dry_run:
        save_cache(cache)
        print(f"\n  API calls made: {api_calls}")

    if dry_run:
        print(f"\n[dry-run] Would make up to {len(unique_addresses) - cached_count} API calls")
        return

    # Build update list: (item_id, lat, lng)
    updates: list[tuple[int, float, float]] = []
    for addr, item_ids in address_to_ids.items():
        coords = cache.get(addr)
        if coords:
            for item_id in item_ids:
                updates.append((item_id, coords["lat"], coords["lng"]))

    if not updates:
        print("No successful geocode results to write.")
        return

    print(f"\nUpdating {len(updates)} agenda items with geo coordinates...")
    conn = get_db_connection()
    try:
        cur = conn.cursor()

        # Update agenda_items.geo
        for item_id, lat, lng in updates:
            cur.execute(
                """
                UPDATE agenda_items
                SET geo = ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
                WHERE id = %s AND geo IS NULL
                """,
                (lng, lat, item_id),
            )

        agenda_updated = cur.rowcount
        conn.commit()
        print(f"  Updated {len(updates)} agenda items")

        # Propagate to matters: set geo from first geocoded agenda item
        print("Propagating geo to matters...")
        cur.execute(
            """
            UPDATE matters m
            SET geo = sub.geo
            FROM (
                SELECT DISTINCT ON (matter_id) matter_id, geo
                FROM agenda_items
                WHERE matter_id IS NOT NULL AND geo IS NOT NULL
                ORDER BY matter_id, id
            ) sub
            WHERE m.id = sub.matter_id AND m.geo IS NULL
            """
        )
        matters_updated = cur.rowcount
        conn.commit()
        print(f"  Updated {matters_updated} matters")

        cur.close()
    finally:
        conn.close()

    print(f"\nDone. {len(updates)} agenda items geocoded, {matters_updated} matters propagated.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Geocode agenda item addresses")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be geocoded without making changes")
    args = parser.parse_args()
    geocode_all_addresses(dry_run=args.dry_run)
