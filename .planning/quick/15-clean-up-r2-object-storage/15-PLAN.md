---
phase: quick-15
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/pipeline/scripts/cleanup_r2_orphans.py
autonomous: false
requirements: [QUICK-15]

must_haves:
  truths:
    - "Script lists all R2 objects and compares against document_images.r2_key"
    - "Orphaned objects (in R2 but not in DB) are identified and reported"
    - "Dry-run mode (default) reports counts without deleting anything"
    - "Delete mode removes orphans in batches of up to 1000"
  artifacts:
    - path: "apps/pipeline/scripts/cleanup_r2_orphans.py"
      provides: "Standalone cleanup script for R2 orphan detection and removal"
  key_links:
    - from: "apps/pipeline/scripts/cleanup_r2_orphans.py"
      to: "pipeline.ingestion.image_extractor.get_r2_client"
      via: "import"
      pattern: "from pipeline.ingestion.image_extractor import get_r2_client"
    - from: "apps/pipeline/scripts/cleanup_r2_orphans.py"
      to: "supabase.document_images"
      via: "supabase client query"
      pattern: 'table\("document_images"\).*select\("r2_key"\)'
---

<objective>
Create a standalone Python script that finds and removes orphaned objects from the R2 `viewroyal-document-images` bucket -- objects that exist in R2 but have no corresponding `r2_key` in the `document_images` Supabase table.

Purpose: Free storage and keep R2 in sync with the database after pipeline re-runs or partial failures.
Output: `apps/pipeline/scripts/cleanup_r2_orphans.py`
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/pipeline/scripts/backfill_images.py (pattern reference: dotenv, supabase client, R2 client, argparse)
@apps/pipeline/pipeline/ingestion/image_extractor.py (get_r2_client function, R2_BUCKET_NAME env var)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create R2 orphan cleanup script</name>
  <files>apps/pipeline/scripts/cleanup_r2_orphans.py</files>
  <action>
Create `apps/pipeline/scripts/cleanup_r2_orphans.py` following the established script pattern from `backfill_images.py`:

1. **Boilerplate** (copy pattern from backfill_images.py):
   - `sys.path.insert(0, str(Path(__file__).resolve().parent.parent))` for pipeline imports
   - `load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")` to load root .env
   - `from pipeline.ingestion.image_extractor import get_r2_client` for R2 access
   - `from supabase import create_client` for DB access
   - `get_supabase()` helper using `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (fallback `SUPABASE_KEY`)
   - `logging.basicConfig` with INFO level, time format `%H:%M:%S`
   - `argparse` with `--delete` flag (default is dry-run / report-only)

2. **List all R2 objects** using boto3 paginator:
   ```python
   client = get_r2_client()
   bucket = os.environ.get("R2_BUCKET_NAME", "viewroyal-document-images")
   paginator = client.get_paginator("list_objects_v2")
   r2_keys = set()
   for page in paginator.paginate(Bucket=bucket):
       for obj in page.get("Contents", []):
           r2_keys.add(obj["Key"])
   ```

3. **Fetch all r2_key values from document_images** using paginated Supabase queries (1000 rows per page, same pattern as backfill_images.py):
   ```python
   db_keys = set()
   offset = 0
   page_size = 1000
   while True:
       result = supabase.table("document_images").select("r2_key").range(offset, offset + page_size - 1).execute()
       batch = result.data or []
       db_keys.update(row["r2_key"] for row in batch)
       if len(batch) < page_size:
           break
       offset += page_size
   ```

4. **Compute orphans**: `orphans = r2_keys - db_keys`

5. **Report**:
   - Total R2 objects count
   - Total DB keys count
   - Orphaned objects count
   - If orphans exist and count is small (< 50), log each orphan key
   - If orphans exist and count is large, log first 20 as sample

6. **Delete (only if --delete flag)**:
   - Use S3 `delete_objects` in batches of 1000 (AWS limit)
   - Log progress every batch: "Deleted batch N (X/Y orphans removed)"
   - Final summary: "Deleted N orphaned objects from R2"
   - If --delete not passed, log: "Dry run complete. Pass --delete to remove orphaned objects."

7. Make the script executable with `if __name__ == "__main__": main()`
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/pipeline && python -c "import ast; ast.parse(open('scripts/cleanup_r2_orphans.py').read()); print('Syntax OK')"</automated>
  </verify>
  <done>Script exists at apps/pipeline/scripts/cleanup_r2_orphans.py, parses without syntax errors, has --delete flag (default dry-run), lists R2 objects via paginator, fetches DB keys via paginated Supabase query, computes and reports orphans, deletes in batches of 1000 when --delete is passed.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Verify dry-run output</name>
  <files>apps/pipeline/scripts/cleanup_r2_orphans.py</files>
  <action>User verifies the script works correctly in dry-run mode.</action>
  <what-built>R2 orphan cleanup script with dry-run default and --delete mode</what-built>
  <how-to-verify>
    1. Run dry-run mode: `cd apps/pipeline && uv run python scripts/cleanup_r2_orphans.py`
    2. Check output shows: total R2 objects, total DB keys, orphan count
    3. Confirm NO deletions happened (should say "Dry run complete")
    4. If orphans found and you want to delete: `uv run python scripts/cleanup_r2_orphans.py --delete`
  </how-to-verify>
  <verify>User confirms dry-run output looks correct</verify>
  <done>User has reviewed dry-run output and approved the script behavior</done>
  <resume-signal>Type "approved" after reviewing dry-run output, or describe issues</resume-signal>
</task>

</tasks>

<verification>
- Script file exists and has valid Python syntax
- Dry-run mode reports counts without modifying R2
- --delete mode removes only orphaned objects
</verification>

<success_criteria>
- Script correctly identifies orphaned R2 objects (in bucket but not in document_images table)
- Default (no flags) is safe dry-run that only reports
- --delete flag removes orphans in batches
- Follows established pipeline script patterns (dotenv, supabase, argparse, logging)
</success_criteria>

<output>
After completion, create `.planning/quick/15-clean-up-r2-object-storage/15-SUMMARY.md`
</output>
