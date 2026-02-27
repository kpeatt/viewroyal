---
created: 2026-02-27T19:50:16.905Z
title: Ingest and store minute PDFs as documents
area: pipeline
files:
  - apps/pipeline/pipeline/ingestion/document_extractor.py
  - apps/pipeline/pipeline/ingestion/gemini_extractor.py
  - apps/pipeline/pipeline/orchestrator.py
---

## Problem

Currently the document extraction pipeline only processes agenda PDFs — it runs `detect_boundaries()` + `extract_content()` on agenda packages to produce `extracted_documents` and `document_sections`. However, many meetings also have separate minute PDFs (approved minutes from previous meetings, special minutes, etc.) that contain valuable content (motions passed, voting records, discussion summaries) that never gets extracted or made searchable.

These minute PDFs are already downloaded and stored in the archive but are not fed through the Gemini extraction pipeline. They should be treated as documents and extracted into `extracted_documents` / `document_sections` just like agenda PDFs.

## Solution

1. Identify minute PDFs in the archive (they follow a naming pattern like `*Minutes*.pdf`)
2. Create `documents` rows for minute PDFs (if not already tracked)
3. Run the same `extract_and_store_documents()` pipeline on them — boundary detection, content extraction with images, section splitting
4. May need to handle that minutes are typically a single document (not a multi-document package like agendas), so boundary detection may return just one boundary spanning the full PDF
5. Update `backfill_extracted_documents()` to include minute PDFs in its scan
