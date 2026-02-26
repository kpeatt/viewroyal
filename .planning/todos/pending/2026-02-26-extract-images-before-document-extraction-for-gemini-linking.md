---
created: 2026-02-26T22:13:17.166Z
title: Extract images before document extraction for Gemini linking
area: pipeline
files:
  - pipeline/ingestion/image_extractor.py
  - pipeline/ingestion/batch_extractor.py
  - pipeline/ingestion/gemini_extractor.py
---

## Problem

The current pipeline extracts document text with Gemini first (producing `[Image: description]` tags), then extracts raster images with PyMuPDF separately, then matches them positionally. This breaks when:

1. Gemini describes multiple images as one (e.g. "collage" for 3 street photos on a slide)
2. Vector graphics exist in the PDF that PyMuPDF can't extract (diagrams, maps) — Gemini writes tags for them but no matching image exists
3. The positional cursor shifts, causing cascading mismatches across all subsequent sections

Quick-11 added a same-page skip heuristic, but the fundamental issue remains: blind positional matching between two independent extraction passes.

## Solution

Extract images with PyMuPDF FIRST, then pass them to Gemini alongside the PDF pages during content extraction. Gemini can then:

1. See both the PDF page layout AND the individual extracted images
2. Directly reference each image by index/ID in its `[Image:]` tags
3. Skip vector-only content it can see but that wasn't extracted
4. Correctly handle multi-image compositions (collages) by referencing multiple image IDs

This would eliminate the matching step entirely — Gemini does the linking as part of content extraction.
