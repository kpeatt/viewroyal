---
phase: quick-11
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - pipeline/ingestion/image_extractor.py
  - tests/ingestion/test_image_extractor.py
autonomous: true
requirements: [QUICK-11]
must_haves:
  truths:
    - "Multi-image pages do not bleed extra images into subsequent sections"
    - "Images on a new page correctly map to the section that references them"
    - "Meeting 3649 doc 20798 images have correct section_id and description after re-extraction"
  artifacts:
    - path: "pipeline/ingestion/image_extractor.py"
      provides: "Page-boundary-aware match_images_to_sections"
      contains: "last_consumed_page"
    - path: "tests/ingestion/test_image_extractor.py"
      provides: "Unit tests for image-to-section matching"
      contains: "test_multi_image_page_does_not_bleed"
  key_links:
    - from: "pipeline/ingestion/image_extractor.py"
      to: "batch_extractor.py"
      via: "match_images_to_sections called during extraction"
      pattern: "match_images_to_sections"
---

<objective>
Fix the image-to-section matcher so multi-image PDF pages (e.g., collage slides with 3 photos but 1 [Image:] tag) do not bleed extra images into subsequent sections. Then re-extract meeting 3649's document images with the corrected algorithm.

Purpose: Images are currently shifted by 2 positions for doc 20798 because page 3 has 3 raster images but only 1 [Image:] tag. The extra 2 images get consumed by later sections, cascading every subsequent match.
Output: Fixed matcher, unit tests, corrected image records for meeting 3649.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@pipeline/ingestion/image_extractor.py
@pipeline/ingestion/batch_extractor.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix match_images_to_sections page-boundary logic and add tests</name>
  <files>pipeline/ingestion/image_extractor.py, tests/ingestion/test_image_extractor.py</files>
  <action>
In `pipeline/ingestion/image_extractor.py`, modify `match_images_to_sections` (lines 232-286):

After the `for desc in descs` loop completes for each section, add page-boundary cleanup: track the page number of the LAST image consumed by that section. Then skip forward past any remaining images on that same page, appending them to `kept` with `section_id=None` and `description=None`. This prevents extra raster images from a multi-image page (like a collage slide) from being consumed by the next section's tags.

Specifically:
1. Add `last_consumed_page = None` before the `for desc in descs` loop
2. Set `last_consumed_page = img["page"]` when an image is successfully matched (line 272 area)
3. After the `for desc in descs` loop, add a while loop that skips images where `images[img_idx]["page"] == last_consumed_page`, adding them to `kept` with `section_id=None`

Also create `tests/ingestion/test_image_extractor.py` (new file) with these test cases:
- `test_basic_matching`: 3 sections each with 1 [Image:] tag, 3 images on 3 pages -> each image matched to correct section
- `test_multi_image_page_does_not_bleed`: Section 1 has 1 [Image:] tag, page 1 has 3 images. Section 2 has 1 [Image:] tag, page 2 has 1 image. Assert: section 1 gets image 0, images 1-2 get section_id=None (skipped as same-page overflow), section 2 gets image 3
- `test_junk_description_skipped`: Section with [Image: company logo] tag -> image skipped (junk pattern)
- `test_no_tags_remaining`: More images than tags -> extras get section_id=None
- `test_parse_image_descriptions`: Verify [Image: foo] and [Image: bar baz] extraction from markdown text

Tests should import directly: `from pipeline.ingestion.image_extractor import match_images_to_sections, parse_image_descriptions, is_junk_image`

Use simple dicts for test data -- no need for actual image bytes. Images need: {page, xref, width, height, format, data: b"fake"}. Sections need: {section_id, section_text}.
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/pipeline && uv run pytest tests/ingestion/test_image_extractor.py -v</automated>
  </verify>
  <done>All 5 tests pass. The multi-image-page test proves that extra images from a collage page do NOT bleed into subsequent sections.</done>
</task>

<task type="auto">
  <name>Task 2: Re-extract meeting 3649 document 20798 images with fixed matcher</name>
  <files>scripts/reextract_3649.py</files>
  <action>
Write a one-off script `scripts/reextract_3649.py` that:

1. Connects to Supabase using env vars (SUPABASE_URL, SUPABASE_SECRET_KEY)
2. Queries `extracted_documents` for id=20798 to get `meeting_id` and `source_pdf_path`
3. Queries `document_sections` for extracted_document_id=20798 ordered by `position` to get section_id + section_text
4. Deletes existing `document_images` where extracted_document_id=20798
5. Calls `extract_images(pdf_path, page_start, page_end)` using the PDF path and document's page range
6. Calls the FIXED `match_images_to_sections(sections, images)`
7. Calls `upload_images_to_r2(matched_images, meeting_id, 20798)` to re-upload with correct metadata
8. Inserts new `document_images` rows with the corrected section_id and description
9. Logs a summary: how many images re-matched, how many sections got images

Get the PDF path from the `source_pdf_path` column on extracted_documents. Get page_start/page_end from `page_start`/`page_end` columns.

Use `from supabase import create_client` and `from pipeline.ingestion.image_extractor import extract_images, match_images_to_sections, upload_images_to_r2`.

Run with: `cd apps/pipeline && uv run python scripts/reextract_3649.py`

Note: This script is in `scripts/` which is gitignored per CLAUDE.md. It is a one-time fix, not production code.
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/pipeline && uv run python scripts/reextract_3649.py 2>&1 | tail -5</automated>
    <manual>Check viewroyal.ai meeting 3649 document viewer -- images should now match their captions (e.g., Western Gateway boundary map should be captioned as boundary map, not "Scenario 1")</manual>
  </verify>
  <done>document_images for doc 20798 are deleted and re-inserted with correct section_id mappings. Script output confirms images re-matched. Visual spot-check shows correct image-caption alignment.</done>
</task>

</tasks>

<verification>
- `uv run pytest tests/ingestion/test_image_extractor.py -v` -- all tests pass
- Re-extraction script completes without errors
- Spot-check 2-3 images on meeting 3649 to confirm captions match content
</verification>

<success_criteria>
1. match_images_to_sections skips remaining same-page images after consuming all tags for a section
2. Unit tests prove the page-boundary behavior with the collage scenario
3. Meeting 3649 doc 20798 images have correct section assignments in the database
</success_criteria>

<output>
After completion, create `.planning/quick/11-fix-pipeline-image-to-section-matcher-an/11-SUMMARY.md`
</output>
