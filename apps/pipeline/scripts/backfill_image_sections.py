"""
Backfill document_section_id on document_images.

Re-computes image-to-section matching for all existing extracted documents
using [Image:] tags in section text, without re-running Gemini or re-uploading.

Usage:
    cd apps/pipeline
    uv run python scripts/backfill_image_sections.py [--limit N] [--dry-run]

Options:
    --limit N    Only process N extracted documents (for testing)
    --dry-run    Show what would be updated without writing to DB
"""

import argparse
import logging
import sys
from pathlib import Path

# Ensure pipeline package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")

from supabase import create_client
import os

from pipeline.ingestion.image_extractor import (
    is_junk_image,
    parse_image_descriptions,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
)
logger = logging.getLogger(__name__)


def get_supabase():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SECRET_KEY"]
    return create_client(url, key)


def backfill(limit: int | None = None, dry_run: bool = False):
    supabase = get_supabase()

    # Find all extracted_document IDs that have unlinked images (paginated)
    logger.info("Querying extracted documents with unlinked images...")
    all_rows = []
    page_size = 1000
    offset = 0
    while True:
        result = (
            supabase.table("document_images")
            .select("extracted_document_id")
            .is_("document_section_id", "null")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = result.data or []
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    if not all_rows:
        logger.info("No images without section links found. Nothing to do.")
        return

    # Unique extracted_document_ids
    ed_ids = sorted(set(row["extracted_document_id"] for row in all_rows))
    logger.info("Found %d extracted documents with unlinked images", len(ed_ids))

    if limit:
        ed_ids = ed_ids[:limit]
        logger.info("Limited to %d extracted documents", len(ed_ids))

    total_linked = 0
    total_skipped_junk = 0
    total_unmatched = 0
    processed = 0

    for ed_id in ed_ids:
        # Load sections in order
        sec_res = (
            supabase.table("document_sections")
            .select("id, section_text, section_order")
            .eq("extracted_document_id", ed_id)
            .order("section_order", desc=False)
            .execute()
        )
        sections = sec_res.data or []

        if not sections:
            continue

        # Load ALL images in order (page, then id for stable positional matching)
        img_res = (
            supabase.table("document_images")
            .select("id, page, description, document_section_id")
            .eq("extracted_document_id", ed_id)
            .order("page", desc=False)
            .order("id", desc=False)
            .execute()
        )
        images = img_res.data or []

        if not images:
            continue

        # Run matching: walk sections, parse [Image:] tags, consume images
        img_idx = 0
        updates = []  # (image_id, section_id, description)

        for sec in sections:
            section_id = sec["id"]
            section_text = sec.get("section_text", "")
            descs = parse_image_descriptions(section_text)

            for desc in descs:
                if img_idx >= len(images):
                    break

                if is_junk_image(desc):
                    total_skipped_junk += 1
                    continue

                img = images[img_idx]
                img_idx += 1
                already_linked = img.get("document_section_id") is not None
                updates.append((img["id"], section_id, desc, already_linked))

        newly_linked = sum(1 for _, _, _, al in updates if not al)
        unmatched_count = len(images) - img_idx
        total_linked += newly_linked
        total_unmatched += unmatched_count

        if not dry_run and updates:
            for img_id, section_id, desc, already_linked in updates:
                if already_linked:
                    continue  # Skip images already linked (e.g. by SQL backfill)
                update_data = {"document_section_id": section_id}
                # Also backfill description if it was null
                if desc:
                    update_data["description"] = desc
                supabase.table("document_images").update(update_data).eq(
                    "id", img_id
                ).execute()

        processed += 1
        if processed % 100 == 0:
            logger.info(
                "Progress: %d/%d docs, %d images linked so far",
                processed, len(ed_ids), total_linked,
            )

    prefix = "[DRY RUN] " if dry_run else ""
    logger.info(
        "%sBackfill complete: %d docs processed, %d images linked, "
        "%d junk skipped, %d unmatched (no tag)",
        prefix, processed, total_linked, total_skipped_junk, total_unmatched,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill image-section links")
    parser.add_argument("--limit", type=int, help="Limit documents to process")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to DB")
    args = parser.parse_args()

    backfill(limit=args.limit, dry_run=args.dry_run)
