---
created: 2026-02-19T03:54:59.534Z
title: Connect R2 images to document viewer inline
area: ui
files:
  - apps/web/app/components/meeting/DocumentSections.tsx
  - apps/pipeline/pipeline/ingestion/image_extractor.py
  - apps/pipeline/pipeline/ingestion/document_extractor.py
---

## Problem

Document images extracted by the pipeline (Phase 7.1) are uploaded to Cloudflare R2 and stored in `document_images` table with R2 URLs, but the web app's document viewer doesn't render them. When viewing extracted document sections on a meeting detail page, images are missing — users see text-only content even when the original PDF had diagrams, maps, or photos.

## Solution

- Fetch `document_images` associated with each `extracted_document` / `document_section`
- Render R2-hosted images inline within document section content at their correct positions (using page number / bounding box metadata from `document_images`)
- May need a signed URL or public R2 bucket configuration depending on current R2 access settings
- Consider lazy loading for performance since some documents have many images
