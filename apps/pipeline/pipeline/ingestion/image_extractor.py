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
            images.append({
                "xref": xref,
                "page": page_num + 1,  # Back to 1-indexed
                "width": width,
                "height": height,
                "format": img_format,
                "data": extracted["image"],  # bytes
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
    """Extract [Image: ...] descriptions from Gemini's markdown output.

    Returns descriptions in order of appearance.
    """
    return re.findall(r"\[Image:\s*([^\]]+)\]", section_text)


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


# ── Section-aware matching ────────────────────────────────────────────


def match_images_to_sections(
    sections: list[dict],
    images: list[dict],
) -> list[dict]:
    """Match extracted images to sections using [Image:] tags in section text.

    Walks sections and images in document order. For each section, parses
    its [Image: ...] tags and consumes images from the front of the list.
    Junk images (logos/signatures) are skipped without consuming a tag slot.
    Images matched to a section get section_id and description assigned.

    Args:
        sections: Ordered list of {section_id, section_text} dicts.
        images: Ordered list of PyMuPDF image dicts (by page + position).

    Returns images with 'section_id' and 'description' populated where matched.
    Unmatched images (no tags left) are kept with section_id=None.
    """
    kept = []
    skipped = 0
    img_idx = 0

    for section in sections:
        section_id = section.get("section_id")
        section_text = section.get("section_text", "")
        descs = parse_image_descriptions(section_text)

        for desc in descs:
            # Consume images until we find a non-junk one or run out
            while img_idx < len(images):
                img = images[img_idx]
                img_idx += 1

                if is_junk_image(desc):
                    # The description says junk — skip this tag entirely
                    skipped += 1
                    break

                img["section_id"] = section_id
                img["description"] = desc
                kept.append(img)
                break

    # Any remaining images have no matching tag — keep with no section
    while img_idx < len(images):
        img = images[img_idx]
        img_idx += 1
        img["section_id"] = None
        img.setdefault("description", None)
        kept.append(img)

    if skipped:
        logger.info("Skipped %d junk images (logos/signatures/etc)", skipped)

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
