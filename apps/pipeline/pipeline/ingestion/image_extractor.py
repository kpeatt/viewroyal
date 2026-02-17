"""
PyMuPDF image extraction with Cloudflare R2 upload.

Extracts meaningful images (maps, charts, diagrams, renderings) from PDFs,
filtering out decorative graphics, logos, and signatures based on dimensions.
Uploads to R2 for edge serving.
"""

import logging
import os

logger = logging.getLogger(__name__)

# ── Dimension filters ─────────────────────────────────────────────────
MIN_WIDTH = 100       # Skip images narrower than 100px
MIN_HEIGHT = 100      # Skip images shorter than 100px
MIN_AREA = 20000      # Skip images smaller than 20K sq pixels
MAX_ASPECT_RATIO = 5.0  # Skip very wide/short images (horizontal rules)

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


# ── R2 upload ────────────────────────────────────────────────────────


def upload_images_to_r2(
    images: list[dict], meeting_id: int, extracted_doc_id: int
) -> list[dict]:
    """Upload extracted images to Cloudflare R2.

    Returns list of dicts: {r2_key, page, width, height, format, file_size}
    Returns empty list if R2 is not configured (graceful degradation).
    """
    client = get_r2_client()
    if client is None:
        return []

    bucket = os.environ.get("R2_BUCKET_NAME", "viewroyal-document-images")
    uploaded = []

    for img in images:
        r2_key = (
            f"documents/{meeting_id}/{extracted_doc_id}/{img['xref']}.{img['format']}"
        )

        # Map format to content type
        content_type_map = {
            "png": "image/png",
            "jpeg": "image/jpeg",
            "jpg": "image/jpeg",
            "webp": "image/webp",
            "tiff": "image/tiff",
            "bmp": "image/bmp",
        }
        content_type = content_type_map.get(img["format"], "application/octet-stream")

        try:
            client.put_object(
                Bucket=bucket,
                Key=r2_key,
                Body=img["data"],
                ContentType=content_type,
            )
            uploaded.append({
                "r2_key": r2_key,
                "page": img["page"],
                "width": img["width"],
                "height": img["height"],
                "format": img["format"],
                "file_size": len(img["data"]),
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
