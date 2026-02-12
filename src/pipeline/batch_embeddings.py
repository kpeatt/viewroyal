import argparse
import concurrent.futures
import json
import os
import sys
import time
from typing import Any, Dict, List

from dotenv import load_dotenv
from google import genai
from google.genai import types

# Ensure we can import from src
sys.path.append(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)
from src.pipeline.ingester import MeetingIngester

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE credentials not found.")
    sys.exit(1)

# Initialize shared Ingester/Supabase client
ingester = MeetingIngester(SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY)
supabase = ingester.supabase

client = None
if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)

# Define absolute path to workspace relative to project root
# This file is in src/pipeline/batch_embeddings.py -> 3 levels deep from root
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BATCH_WORKSPACE = os.path.join(PROJECT_ROOT, "batch_embeddings_workspace")
STATE_FILE = os.path.join(BATCH_WORKSPACE, "batch_state.json")

os.makedirs(BATCH_WORKSPACE, exist_ok=True)

# Table configuration map
TABLE_CONFIG = {
    "transcript_segments": "text_content",
    "motions": "text_content",
    "agenda_items": "title",
    "matters": "plain_english_summary",
    "meetings": "summary",
}


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    return {"jobs": {}}


def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def create_batches(table: str, batch_size: int = 10000, force: bool = False):
    """
    Creates .jsonl files for the Gemini Batch API for a specific table.
    Uses models/gemini-embedding-001 with RETRIEVAL_DOCUMENT task type.
    """
    if table == "all":
        for t in TABLE_CONFIG.keys():
            create_batches(t, batch_size, force)
        return

    text_column = TABLE_CONFIG.get(table)
    if not text_column:
        print(f"Error: Table {table} not configured for embeddings.")
        return

    print(f"Creating batches for {table}.{text_column}...")

    # Load IDs that are already in flight (in state or in local files)
    in_flight_ids = set()
    if not force:
        # 1. IDs from existing local .jsonl files in the workspace
        local_files = [f for f in os.listdir(BATCH_WORKSPACE) if f.endswith(".jsonl")]
        if local_files:
            print(f"  Scanning {len(local_files)} local batch files for existing IDs...")
            for filename in local_files:
                filepath = os.path.join(BATCH_WORKSPACE, filename)
                try:
                    with open(filepath, "r") as f:
                        for line in f:
                            data = json.loads(line)
                            cid = data.get("custom_id", "")
                            if cid.startswith(f"{table}:"):
                                in_flight_ids.add(int(cid.split(":")[1]))
                except Exception as e:
                    print(f"    Warning: Could not read {filename}: {e}")
            print(f"  Found {len(in_flight_ids)} IDs already in local batch files.")

    # Define columns to fetch
    columns = f"id, {text_column}"
    if table == "agenda_items":
        columns = "id, title, description"
    elif table == "transcript_segments":
        columns = "id, text_content, corrected_text_content"
    elif table == "matters":
        columns = "id, title, plain_english_summary"

    # Paginate to get all records (Supabase default limit is 1000)
    rows = []
    page_size = 1000
    offset = 0

    while True:
        query = supabase.table(table).select(columns)
        if not force:
            query = query.is_("embedding", "null")

        res = query.range(offset, offset + page_size - 1).execute()
        if not res.data:
            break

        # Filter out in-flight IDs
        new_rows = [r for r in res.data if r["id"] not in in_flight_ids]
        rows.extend(new_rows)
        
        offset += page_size
        print(f"  Fetched {offset} records... (Accumulated {len(rows)} new candidates)", end="\r")

        if len(res.data) < page_size:
            break  # Last page
    
    print() # Newline after progress

    if not rows:
        print(f"  No new records found needing embeddings for {table}.")
        return

    print(f"  Found {len(rows)} records. Splitting into batches of {batch_size}...")

    timestamp = int(time.time())
    chunks = [rows[i : i + batch_size] for i in range(0, len(rows), batch_size)]

    for i, chunk in enumerate(chunks):
        filename = f"embed_batch_{table}_{timestamp}_{i + 1}.jsonl"
        filepath = os.path.join(BATCH_WORKSPACE, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            for row in chunk:
                # Table-specific text extraction logic
                if table == "transcript_segments":
                    text = (
                        row.get("corrected_text_content")
                        or row.get("text_content")
                        or ""
                    )
                elif table == "agenda_items":
                    text = (
                        f"{row.get('title', '')}\n{row.get('description', '')}".strip()
                    )
                elif table == "matters":
                    text = row.get("plain_english_summary") or row.get("title") or ""
                else:
                    text = row.get(text_column) or ""

                if not text.strip():
                    continue

                # Correct format for create_embeddings: custom_id and embedContent request
                # Uses output_dimensionality=768 for HNSW index compatibility
                request = {
                    "custom_id": f"{table}:{row['id']}",
                    "request": {
                        "model": "models/gemini-embedding-001",
                        "task_type": "RETRIEVAL_DOCUMENT",
                        "output_dimensionality": 768,
                        "content": {"parts": [{"text": text.strip()}]},
                    },
                }
                f.write(json.dumps(request) + "\n")

        print(f"    Created {filepath}")


def submit_batches():
    """Uploads .jsonl files to Gemini and starts the batch jobs using experimental create_embeddings."""
    if not client:
        print("Error: Gemini API client not initialized.")
        return

    state = load_state()
    files = [f for f in os.listdir(BATCH_WORKSPACE) if f.endswith(".jsonl")]
    existing_files = {j.get("source_file") for j in state["jobs"].values()}

    for filename in files:
        if filename in existing_files:
            continue

        filepath = os.path.join(BATCH_WORKSPACE, filename)
        print(f"Submitting {filename}...")

        try:
            # 1. Upload file
            uploaded_file = client.files.upload(
                file=filepath, config={"mime_type": "text/plain"}
            )
            print(f"  Uploaded: {uploaded_file.name}")

            # 2. Create batch job using create_embeddings as per documentation
            job = client.batches.create_embeddings(
                model="gemini-embedding-001",
                src=types.EmbeddingsBatchJobSource(file_name=uploaded_file.name),
            )

            state["jobs"][job.name] = {
                "job_id": job.name,
                "status": job.state,
                "source_file": filename,
                "file_name": uploaded_file.name,
                "created_at": time.time(),
                "ingested": False,
            }
            print(f"  Job created: {job.name}")
            save_state(state)

            # Respect rate limits for job creation
            time.sleep(2)

        except Exception as e:
            print(f"  Error submitting {filename}: {e}")


def check_statuses():
    """Checks the progress of active batch jobs."""
    state = load_state()
    active_jobs = [
        j
        for j in state["jobs"].values()
        if j["status"]
        not in ["JOB_STATE_SUCCEEDED", "JOB_STATE_FAILED", "JOB_STATE_CANCELLED"]
    ]

    if not active_jobs:
        print("No active jobs to check.")
        return

    for job_info in active_jobs:
        job_id = job_info["job_id"]
        try:
            job = client.batches.get(name=job_id)
            job_info["status"] = job.state
            print(f"Job {job_id} ({job_info['source_file']}): {job.state}")
        except Exception as e:
            print(f"Error checking job {job_id}: {e}")

    save_state(state)


def upsert_batch(target_table: str, rows: List[Dict], max_retries: int = 5) -> int:
    """Upsert a batch of rows into a table. Returns number of failed rows."""
    for attempt in range(max_retries):
        try:
            supabase.table(target_table).upsert(
                rows, on_conflict="id"
            ).execute()
            return 0
        except Exception as e:
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 1.0  # 1s, 2s, 4s, 8s
                time.sleep(wait_time)
            else:
                print(f"    Batch failed after {max_retries} attempts: {e}")
                return len(rows)


def ingest_results():
    """Downloads results for completed jobs and updates Supabase using batch upserts."""
    state = load_state()
    completed_jobs = [
        j
        for j in state["jobs"].values()
        if j["status"] == "JOB_STATE_SUCCEEDED" and not j["ingested"]
    ]

    if not completed_jobs:
        print("No completed jobs ready for ingestion.")
        return

    for job_info in completed_jobs:
        job_id = job_info["job_id"]
        print(f"Processing results for {job_id} ({job_info['source_file']})...")

        try:
            job = client.batches.get(name=job_id)
            output_uri = job.dest.file_name

            results_content = client.files.download(file=output_uri)
            lines = results_content.decode("utf-8").strip().split("\n")

            table_updates = {}

            for line in lines:
                if not line.strip():
                    continue
                data = json.loads(line)

                cid = data["custom_id"]
                if ":" not in cid:
                    continue

                target_table, row_id_str = cid.split(":", 1)
                row_id = int(row_id_str)

                if (
                    "response" in data
                    and "embedding" in data["response"]
                    and "values" in data["response"]["embedding"]
                ):
                    embedding = data["response"]["embedding"]["values"]
                else:
                    continue

                if target_table not in table_updates:
                    table_updates[target_table] = []

                table_updates[target_table].append(
                    {"id": row_id, "embedding": embedding}
                )

            for target_table, updates in table_updates.items():
                print(f"  Updating {len(updates)} rows in {target_table}...")

                # Batch upsert 200 rows at a time (~1.2MB per request with 768-dim vectors)
                # 3 concurrent batches to keep throughput high without overloading
                batch_size = 200
                total = len(updates)
                failed = 0
                batches = [updates[i : i + batch_size] for i in range(0, total, batch_size)]

                with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
                    futures = {
                        executor.submit(upsert_batch, target_table, batch): i
                        for i, batch in enumerate(batches)
                    }
                    completed_rows = 0
                    for future in concurrent.futures.as_completed(futures):
                        batch_failed = future.result()
                        failed += batch_failed
                        completed_rows += len(batches[futures[future]])
                        if completed_rows % 1000 < batch_size or completed_rows >= total:
                            print(f"    Progress: {completed_rows}/{total} ({(completed_rows/total)*100:.1f}%) - {failed} failures")

                if failed > 0:
                    print(f"    WARNING: {failed}/{total} rows failed to update")

            job_info["ingested"] = True
            save_state(state)
            print(f"  Successfully ingested all results from {job_id}.")

        except Exception as e:
            print(f"  Error ingesting {job_id}: {e}")


def main():
    parser = argparse.ArgumentParser(description="Gemini Batch Embedding Pipeline")
    parser.add_argument("action", choices=["create", "submit", "status", "ingest"])
    parser.add_argument(
        "--table",
        default="all",
        help="Table to process (transcript_segments, motions, agenda_items, matters, meetings, or all)",
    )
    parser.add_argument(
        "--batch-size", type=int, default=10000, help="Requests per batch file"
    )
    parser.add_argument(
        "--force", action="store_true", help="Regenerate all embeddings"
    )

    args = parser.parse_args()

    if args.action == "create":
        create_batches(args.table, args.batch_size, args.force)
    elif args.action == "submit":
        submit_batches()
    elif args.action == "status":
        check_statuses()
    elif args.action == "ingest":
        ingest_results()


if __name__ == "__main__":
    main()
