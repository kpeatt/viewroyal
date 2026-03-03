"""
Clean up orphaned objects from R2 object storage.

Compares all objects in the R2 `viewroyal-document-images` bucket against
`document_images.r2_key` in Supabase. Objects that exist in R2 but have no
corresponding DB row are orphans (from pipeline re-runs or partial failures).

Default mode is dry-run (report only). Pass --delete to actually remove orphans.

Usage:
    cd apps/pipeline
    uv run python scripts/cleanup_r2_orphans.py            # dry-run
    uv run python scripts/cleanup_r2_orphans.py --delete    # remove orphans
"""

import argparse
import logging
import os
import sys
from pathlib import Path

# Ensure pipeline package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")

from supabase import create_client

from pipeline.ingestion.image_extractor import get_r2_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def get_supabase():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY must be set")
    return create_client(url, key)


def list_r2_objects() -> set[str]:
    """List all object keys in the R2 bucket using pagination."""
    client = get_r2_client()
    if client is None:
        raise RuntimeError(
            "R2 client not configured. Need R2_ACCESS_KEY_ID, "
            "R2_SECRET_ACCESS_KEY, R2_ENDPOINT_URL"
        )

    bucket = os.environ.get("R2_BUCKET_NAME", "viewroyal-document-images")
    paginator = client.get_paginator("list_objects_v2")
    r2_keys: set[str] = set()

    for page in paginator.paginate(Bucket=bucket):
        for obj in page.get("Contents", []):
            r2_keys.add(obj["Key"])

    return r2_keys


def fetch_db_keys(supabase) -> set[str]:
    """Fetch all r2_key values from document_images using paginated queries."""
    db_keys: set[str] = set()
    offset = 0
    page_size = 1000

    while True:
        result = (
            supabase.table("document_images")
            .select("r2_key")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = result.data or []
        db_keys.update(row["r2_key"] for row in batch if row.get("r2_key"))
        if len(batch) < page_size:
            break
        offset += page_size

    return db_keys


def delete_orphans(client, bucket: str, orphans: set[str]) -> int:
    """Delete orphaned objects from R2 in batches of 1000."""
    orphan_list = sorted(orphans)
    total = len(orphan_list)
    deleted = 0
    batch_size = 1000

    for i in range(0, total, batch_size):
        batch = orphan_list[i : i + batch_size]
        delete_request = {
            "Objects": [{"Key": key} for key in batch],
            "Quiet": True,
        }

        client.delete_objects(Bucket=bucket, Delete=delete_request)
        deleted += len(batch)
        batch_num = (i // batch_size) + 1
        logger.info(
            "Deleted batch %d (%d/%d orphans removed)", batch_num, deleted, total
        )

    return deleted


def main():
    parser = argparse.ArgumentParser(
        description="Find and remove orphaned objects from R2 storage"
    )
    parser.add_argument(
        "--delete",
        action="store_true",
        help="Actually delete orphaned objects (default is dry-run)",
    )
    args = parser.parse_args()

    # Step 1: List all R2 objects
    logger.info("Listing all R2 objects...")
    r2_keys = list_r2_objects()
    logger.info("Total R2 objects: %d", len(r2_keys))

    # Step 2: Fetch all DB keys
    logger.info("Fetching document_images.r2_key from Supabase...")
    supabase = get_supabase()
    db_keys = fetch_db_keys(supabase)
    logger.info("Total DB keys: %d", len(db_keys))

    # Step 3: Compute orphans
    orphans = r2_keys - db_keys
    logger.info("Orphaned objects (in R2 but not in DB): %d", len(orphans))

    if not orphans:
        logger.info("No orphans found. R2 and database are in sync.")
        return

    # Step 4: Report orphans
    if len(orphans) < 50:
        for key in sorted(orphans):
            logger.info("  orphan: %s", key)
    else:
        sample = sorted(orphans)[:20]
        for key in sample:
            logger.info("  orphan: %s", key)
        logger.info("  ... and %d more", len(orphans) - 20)

    # Step 5: Delete or dry-run
    if args.delete:
        client = get_r2_client()
        bucket = os.environ.get("R2_BUCKET_NAME", "viewroyal-document-images")
        deleted = delete_orphans(client, bucket, orphans)
        logger.info("Deleted %d orphaned objects from R2", deleted)
    else:
        logger.info(
            "Dry run complete. Pass --delete to remove %d orphaned objects.",
            len(orphans),
        )


if __name__ == "__main__":
    main()
