"""
PyMuPDF image extraction with Cloudflare R2 upload.

Extracts meaningful images (maps, charts, diagrams, renderings) from PDFs,
filtering out decorative graphics, logos, and signatures based on dimensions
and Gemini's image descriptions. Optimizes to WebP before uploading to R2.
"""

import io
import logging
import os
import re
from collections import deque

logger = logging.getLogger(__name__)

# ── Dimension filters ─────────────────────────────────────────────────
MIN_WIDTH = 100       # Skip images narrower than 100px
MIN_HEIGHT = 100      # Skip images shorter than 100px
MIN_AREA = 20000      # Skip images smaller than 20K sq pixels
MAX_ASPECT_RATIO = 5.0  # Skip very wide/short images (horizontal rules)

# ── Optimization settings ─────────────────────────────────────────────
MAX_DIMENSION = 1600  # Cap longest edge at 1600px
WEBP_QUALITY = 80     # WebP quality (80 = good quality, great compression)

# ── Junk image patterns (case-insensitive) ────────────────────────────
SKIP_PATTERNS = re.compile(
    r"\b(logo|signature|letterhead|header|footer|crest|coat of arms|"
    r"watermark|handwritten|stamp|seal|branding)\b",
    re.IGNORECASE,
)

# ── Lazy singleton R2 client ─────────────────────────────────────────

_r2_client = None
_r2_warned = False


def get_r2_client():
    """Return a lazily-initialized boto3 S3 client configured for R2.

    Returns None if boto3 is not installed or credentials are missing.
    """
    global _r2_client, _r2_warned

    if _r2_client is not None:
        return _r2_client

    try:
        import boto3
    except ImportError:
        if not _r2_warned:
            logger.warning("boto3 not installed — R2 image uploads will be skipped")
            _r2_warned = True
        return None

    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    endpoint = os.environ.get("R2_ENDPOINT_URL")

    if not all([access_key, secret_key, endpoint]):
        if not _r2_warned:
            logger.warning(
                "R2 credentials not fully configured (need R2_ACCESS_KEY_ID, "
                "R2_SECRET_ACCESS_KEY, R2_ENDPOINT_URL) — image uploads will be skipped"
            )
            _r2_warned = True
        return None

    _r2_client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )
    logger.info("R2 client initialized (endpoint: %s)", endpoint)
    return _r2_client


# ── Image extraction ─────────────────────────────────────────────────


def extract_images(pdf_path: str, page_start: int, page_end: int) -> list[dict]:
    """Extract meaningful images from a PDF page range.

    Parameters use 1-indexed page numbers (matching Gemini boundary output).
    Filters out small/decorative images based on dimension thresholds.
    Deduplicates by xref (same image appearing on multiple pages).

    Returns list of dicts: {xref, page, width, height, format, data (bytes)}
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.error("PyMuPDF (fitz) required for image extraction")
        return []

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        logger.error("Failed to open PDF for image extraction: %s", e)
        return []

    images = []
    seen_xrefs = set()

    # Convert 1-indexed to 0-indexed for PyMuPDF
    start_idx = max(0, page_start - 1)
    end_idx = min(len(doc), page_end)

    for page_num in range(start_idx, end_idx):
        page = doc[page_num]
        try:
            page_images = page.get_images(full=True)
        except Exception as e:
            logger.warning("Failed to get images from page %d: %s", page_num + 1, e)
            continue

        for img_info in page_images:
            xref = img_info[0]

            # Deduplicate: same image can appear on multiple pages
            if xref in seen_xrefs:
                continue

            try:
                extracted = doc.extract_image(xref)
            except Exception as e:
                logger.debug("Failed to extract image xref %d: %s", xref, e)
                continue

            if not extracted or not extracted.get("image"):
                continue

            width = extracted.get("width", 0)
            height = extracted.get("height", 0)
            img_format = extracted.get("ext", "png")

            # Apply dimension filters
            if width < MIN_WIDTH or height < MIN_HEIGHT:
                continue

            area = width * height
            if area < MIN_AREA:
                continue

            # Aspect ratio check (skip horizontal rules, thin banners)
            if width > 0 and height > 0:
                aspect = max(width / height, height / width)
                if aspect > MAX_ASPECT_RATIO:
                    continue

            seen_xrefs.add(xref)

            rects = page.get_image_rects(xref)
            bbox = None
            if rects:
                r = rects[0]
                bbox = {"x0": r.x0, "y0": r.y0, "x1": r.x1, "y1": r.y1}

            images.append({
                "xref": xref,
                "page": page_num + 1,  # Back to 1-indexed
                "width": width,
                "height": height,
                "format": img_format,
                "data": extracted["image"],  # bytes
                "bbox": bbox,
            })

    doc.close()

    if images:
        logger.info(
            "Extracted %d images from pages %d-%d of %s",
            len(images), page_start, page_end, os.path.basename(pdf_path),
        )

    return images


# ── Description matching ──────────────────────────────────────────────


def parse_image_descriptions(section_text: str) -> list[str]:
    """Extract [Image: ...] or [Image N: ...] descriptions from Gemini's markdown output.

    Returns descriptions in order of appearance.
    """
    return re.findall(r"\[Image(?:\s+\d+)?:\s*([^\]]+)\]", section_text)


def is_junk_image(description: str) -> bool:
    """Return True if the description indicates a non-valuable image."""
    return bool(SKIP_PATTERNS.search(description))


def match_descriptions_to_images(
    images: list[dict],
    descriptions_by_page: dict[int, list[str]],
) -> list[dict]:
    """Match extracted images to Gemini descriptions and filter junk.

    For each page, assumes PyMuPDF images and Gemini [Image: ...] tags
    appear in the same top-to-bottom order. Images without a matching
    description are kept (no description to disqualify them). Images
    whose description matches junk patterns are dropped.

    Adds 'description' key to each surviving image dict.
    """
    kept = []
    skipped = 0

    for img in images:
        page = img["page"]
        page_descs = descriptions_by_page.get(page, [])

        if page_descs:
            # Pop first description for this page (order-matched)
            desc = page_descs.pop(0)
            if is_junk_image(desc):
                skipped += 1
                continue
            img["description"] = desc
        else:
            # No description available — keep but mark unknown
            img["description"] = None

        kept.append(img)

    if skipped:
        logger.info("Skipped %d junk images (logos/signatures/etc)", skipped)

    return kept


# ── Collage proximity helpers ─────────────────────────────────────────


def _images_are_nearby(a, b, threshold=30):
    """True if two images' bboxes are within threshold PDF points (~10mm)."""
    ba, bb = a.get("bbox"), b.get("bbox")
    if not ba or not bb:
        return False
    h_gap = max(0, max(ba["x0"] - bb["x1"], bb["x0"] - ba["x1"]))
    v_gap = max(0, max(ba["y0"] - bb["y1"], bb["y0"] - ba["y1"]))
    return h_gap <= threshold and v_gap <= threshold


def _find_collage_group(consumed, candidates, threshold=30):
    """Find images forming a collage with consumed image via transitive closure."""
    group = []
    queue = [consumed]
    candidate_set = list(candidates)
    while queue:
        current = queue.pop(0)
        group.append(current)
        still_remaining = []
        for img in candidate_set:
            if _images_are_nearby(current, img, threshold):
                queue.append(img)
            else:
                still_remaining.append(img)
        candidate_set = still_remaining
    return group, candidate_set  # (collage members including consumed, non-collage remainder)


# ── Section-aware matching ────────────────────────────────────────────


def match_images_to_sections(
    sections: list[dict],
    images: list[dict],
) -> list[dict]:
    """Match extracted images to sections using [Image:] tags in section text.

    Walks sections and images in document order. For each section, parses
    its [Image: ...] tags and consumes images from a deque. Junk image
    descriptions are skipped without consuming an image slot.

    After processing each section's tags, same-page overflow images are
    partitioned into collage extras (nearby bboxes → same section) vs
    independent images (re-queued for later sections). Falls back to the
    old skip-all behavior when bbox data is unavailable.

    Args:
        sections: Ordered list of {section_id, section_text} dicts.
        images: Ordered list of PyMuPDF image dicts (by page + position).

    Returns images with 'section_id' and 'description' populated where matched.
    Unmatched images (no tags left) are kept with section_id=None.
    """
    kept = []
    skipped = 0
    remaining = deque(images)

    for section in sections:
        section_id = section.get("section_id")
        section_text = section.get("section_text", "")
        descs = parse_image_descriptions(section_text)

        last_consumed = None
        for desc in descs:
            if not remaining:
                break
            if is_junk_image(desc):
                skipped += 1
                continue
            img = remaining.popleft()
            img["section_id"] = section_id
            img["description"] = desc
            last_consumed = img
            kept.append(img)

        # Collage detection: partition same-page overflow images
        if last_consumed is not None:
            same_page = []
            while remaining and remaining[0]["page"] == last_consumed["page"]:
                same_page.append(remaining.popleft())

            if same_page and last_consumed.get("bbox"):
                collage_extras, independent = _find_collage_group(
                    last_consumed, same_page
                )
                # Collage extras → same section, null description
                for img in collage_extras:
                    if img is not last_consumed:
                        img["section_id"] = section_id
                        img["description"] = None
                        kept.append(img)
                # Independent → put back at front of queue for later sections
                for img in reversed(independent):
                    remaining.appendleft(img)
            else:
                # No bbox data → fall back to skip all same-page (current behavior)
                for img in same_page:
                    img["section_id"] = None
                    img.setdefault("description", None)
                    kept.append(img)

    # Remaining unmatched
    for img in remaining:
        img["section_id"] = None
        img.setdefault("description", None)
        kept.append(img)

    if skipped:
        logger.info("Skipped %d junk images (logos/signatures/etc)", skipped)

    return kept


# ── Gemini numbered image assignment ──────────────────────────────────


def assign_images_by_number(sections: list[dict], images: list[dict]) -> list[dict]:
    """Assign images to sections using numbered [Image N: desc] tags from Gemini.

    Gemini references images by number (1-indexed) matching the order they were
    sent. Parses these tags from section text to create direct image->section mapping.
    Images not referenced by Gemini are kept with section_id=None (likely junk).
    """
    assigned = set()
    kept = []

    for section in sections:
        section_id = section.get("section_id")
        section_text = section.get("section_text", "")

        for match in re.finditer(r"\[Image\s+(\d+):\s*([^\]]+)\]", section_text):
            idx = int(match.group(1)) - 1  # Convert to 0-indexed
            desc = match.group(2).strip()
            if 0 <= idx < len(images) and idx not in assigned:
                img = images[idx]
                img["section_id"] = section_id
                img["description"] = desc
                assigned.add(idx)
                kept.append(img)

    # Unmatched images (not referenced by Gemini — likely junk/logos)
    for i, img in enumerate(images):
        if i not in assigned:
            img["section_id"] = None
            img["description"] = None
            kept.append(img)

    referenced = len(assigned)
    unreferenced = len(images) - referenced
    if unreferenced:
        logger.info(
            "Gemini referenced %d/%d images (%d unreferenced — likely logos/decorative)",
            referenced, len(images), unreferenced,
        )
    return kept


# ── Image optimization ────────────────────────────────────────────────


def optimize_image(data: bytes, src_format: str) -> tuple[bytes, int, int, str]:
    """Optimize an image: resize to max dimension and convert to WebP.

    Returns (optimized_bytes, new_width, new_height, "webp").
    Falls back to original data if Pillow is unavailable.
    """
    try:
        from PIL import Image
    except ImportError:
        logger.warning("Pillow not installed — uploading unoptimized images")
        return data, 0, 0, src_format

    try:
        img = Image.open(io.BytesIO(data))

        # Convert CMYK/palette to RGB for WebP compatibility
        if img.mode in ("CMYK", "P", "PA"):
            img = img.convert("RGBA" if "A" in img.mode or img.mode == "PA" else "RGB")
        elif img.mode == "LA":
            img = img.convert("RGBA")
        elif img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")

        # Resize if either dimension exceeds MAX_DIMENSION
        w, h = img.size
        if max(w, h) > MAX_DIMENSION:
            if w >= h:
                new_w = MAX_DIMENSION
                new_h = int(h * (MAX_DIMENSION / w))
            else:
                new_h = MAX_DIMENSION
                new_w = int(w * (MAX_DIMENSION / h))
            img = img.resize((new_w, new_h), Image.LANCZOS)
            w, h = new_w, new_h

        # Encode as WebP
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=WEBP_QUALITY, method=4)
        optimized = buf.getvalue()

        return optimized, w, h, "webp"

    except Exception as e:
        logger.warning("Image optimization failed, uploading original: %s", e)
        return data, 0, 0, src_format


# ── R2 upload ────────────────────────────────────────────────────────


def upload_images_to_r2(
    images: list[dict], meeting_id: int, extracted_doc_id: int
) -> list[dict]:
    """Optimize and upload extracted images to Cloudflare R2.

    Images are converted to WebP and resized before upload.
    Returns list of dicts: {r2_key, page, width, height, format, file_size}
    Returns empty list if R2 is not configured (graceful degradation).
    """
    client = get_r2_client()
    if client is None:
        return []

    bucket = os.environ.get("R2_BUCKET_NAME", "viewroyal-document-images")
    uploaded = []

    for img in images:
        # Optimize: resize + convert to WebP
        optimized_data, opt_w, opt_h, opt_format = optimize_image(
            img["data"], img["format"]
        )

        # Use optimized dimensions if available, else original
        final_w = opt_w if opt_w > 0 else img["width"]
        final_h = opt_h if opt_h > 0 else img["height"]

        r2_key = (
            f"documents/{meeting_id}/{extracted_doc_id}/{img['xref']}.{opt_format}"
        )

        try:
            client.put_object(
                Bucket=bucket,
                Key=r2_key,
                Body=optimized_data,
                ContentType=f"image/{opt_format}",
            )
            uploaded.append({
                "r2_key": r2_key,
                "page": img["page"],
                "width": final_w,
                "height": final_h,
                "format": opt_format,
                "file_size": len(optimized_data),
                "description": img.get("description"),
                "section_id": img.get("section_id"),
            })
        except Exception as e:
            logger.warning("Failed to upload image %s to R2: %s", r2_key, e)
            continue

    if uploaded:
        logger.info(
            "Uploaded %d/%d images to R2 (meeting=%d, doc=%d)",
            len(uploaded), len(images), meeting_id, extracted_doc_id,
        )

    return uploaded
