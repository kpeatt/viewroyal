import argparse
import copy
import glob
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
import src.pipeline.ai_refiner as refiner
from src.core.names import CANONICAL_NAMES
from src.pipeline.ingester import MeetingIngester

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE credentials not found.")
    sys.exit(1)

# Initialize shared Ingester
ingester_instance = MeetingIngester(SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY)

client = None
if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)

ARCHIVE_ROOT = "viewroyal_archive"
BATCH_WORKSPACE = "batch_workspace"
os.makedirs(BATCH_WORKSPACE, exist_ok=True)

STATE_FILE = os.path.join(BATCH_WORKSPACE, "batch_state.json")


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            try:
                state = json.load(f)
                if "jobs" not in state:
                    state["jobs"] = {}
                # Migration: if current_job exists, move it to jobs
                if "current_job" in state:
                    job = state.pop("current_job")
                    if job and "name" in job:
                        state["jobs"][job["name"]] = job
                return state
            except json.JSONDecodeError:
                return {"jobs": {}}
    return {"jobs": {}}


def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def inline_schema_defs(schema):
    """
    Recursively inlines $defs and cleans schema for Gemini Batch API compatibility.
    - Uses uppercase for 'type' (e.g., 'OBJECT', 'STRING').
    """
    if not isinstance(schema, dict):
        return schema

    schema = copy.deepcopy(schema)

    defs = schema.pop("$defs", {})
    if not defs:
        defs = schema.pop("definitions", {})

    def resolve(node):
        if isinstance(node, list):
            return [resolve(i) for i in node]

        if not isinstance(node, dict):
            return node

        # Handle $ref
        if "$ref" in node:
            ref_path = node["$ref"]
            ref_name = ref_path.split("/")[-1]
            if ref_name in defs:
                return resolve(defs[ref_name])
            return node

        # Recursively resolve children
        new_node = {}
        for k, v in node.items():
            if k == "title" and isinstance(v, str):
                continue

            if k == "type" and isinstance(v, str):
                new_node[k] = v.upper()
            else:
                new_node[k] = resolve(v)

        # Handle anyOf: [type, null] -> nullable: true
        if "anyOf" in new_node:
            any_of = new_node["anyOf"]
            if isinstance(any_of, list) and len(any_of) == 2:
                null_type = next(
                    (
                        t
                        for t in any_of
                        if isinstance(t, dict) and t.get("type") == "NULL"
                    ),
                    None,
                )
                other_type = next(
                    (
                        t
                        for t in any_of
                        if isinstance(t, dict) and t.get("type") != "NULL"
                    ),
                    None,
                )

                if null_type and other_type:
                    merged = other_type.copy()
                    merged["nullable"] = True
                    return merged

        return new_node

    return resolve(schema)


def create_batches(limit: int = 10000, batch_size: int = 50, update: bool = False):
    print("Scanning for meetings to process...")

    ingested_paths = set()

    # 1. Fetch from Database
    if not update:
        print("Fetching existing meetings from database to skip...")
        try:
            result = (
                ingester_instance.supabase.table("meetings")
                .select("archive_path")
                .execute()
            )
            if result.data:
                for row in result.data:
                    ingested_paths.add(row["archive_path"])
            print(f"Found {len(ingested_paths)} existing meetings.")
        except Exception as e:
            print(f"Error fetching existing meetings: {e}")

    # 2. Fetch "In-Flight" from Active Local Jobs
    if not update:
        state = load_state()
        in_flight_count = 0
        for job_info in state.get("jobs", {}).values():
            # If job is active or pending ingestion
            if job_info.get("status") not in [
                "JOB_STATE_FAILED",
                "JOB_STATE_CANCELLED",
            ] and not job_info.get("ingested"):
                source_path = job_info.get("source_file")
                if source_path and os.path.exists(source_path):
                    try:
                        with open(source_path, "r", encoding="utf-8") as f:
                            for line in f:
                                if not line.strip():
                                    continue
                                req = json.loads(line)
                                path = req.get("custom_id")
                                if path:
                                    ingested_paths.add(path)
                                    in_flight_count += 1
                    except Exception as e:
                        print(
                            f"Warning: Could not read in-flight file {source_path}: {e}"
                        )

        if in_flight_count > 0:
            print(
                f"Skipping {in_flight_count} meetings currently in-flight in other batches."
            )

    requests = []

    # 3. Collect All Requests
    total_count = 0
    for root, dirs, files in os.walk(ARCHIVE_ROOT):
        if "Agenda" in dirs or "Audio" in dirs:
            if not update and root in ingested_paths:
                continue

            agenda, minutes, transcript = ingester_instance.get_raw_texts(root)

            if not minutes and not agenda:
                continue

            # print(f"Preparing: {root}")

            attendees_context = ""
            attendance_path = os.path.join(root, "attendance.json")
            if os.path.exists(attendance_path):
                try:
                    with open(attendance_path, "r", encoding="utf-8") as f:
                        att_data = json.load(f)

                    lines = []
                    if att_data.get("present"):
                        names = []
                        for p in att_data["present"]:
                            name = p.get("name")
                            if name:
                                roles = p.get("roles", [])
                                role_str = f" ({', '.join(roles)})" if roles else ""
                                names.append(f"{name}{role_str}")
                        if names:
                            lines.append(f"Present: {', '.join(names)}")

                    if att_data.get("regrets"):
                        names = []
                        for p in att_data["regrets"]:
                            name = p.get("name")
                            if name:
                                roles = p.get("roles", [])
                                role_str = f" ({', '.join(roles)})" if roles else ""
                                names.append(f"{name}{role_str}")
                        if names:
                            lines.append(f"Regrets: {', '.join(names)}")

                    if att_data.get("staff"):
                        names = []
                        for p in att_data["staff"]:
                            name = p.get("name")
                            if name:
                                roles = p.get("roles", [])
                                role_str = f" ({', '.join(roles)})" if roles else ""
                                names.append(f"{name}{role_str}")
                        if names:
                            lines.append(f"Staff: {', '.join(names)}")

                    attendees_context = "\n".join(lines)
                except Exception as e:
                    # print(f"  [!] Error loading attendance.json: {e}")
                    pass

            canonical_str = ", ".join(CANONICAL_NAMES)
            prompt = refiner.build_refinement_prompt(
                agenda,
                minutes,
                transcript,
                attendees_context=attendees_context,
                canonical_names_context=canonical_str,
            )

            request_json = {
                "custom_id": root,
                "request": {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "system_instruction": {
                        "parts": [{"text": refiner.SYSTEM_INSTRUCTION}]
                    },
                    "generationConfig": {
                        "responseMimeType": "application/json",
                        "responseSchema": inline_schema_defs(
                            refiner.MeetingRefinement.model_json_schema()
                        ),
                    },
                },
            }
            requests.append(request_json)
            total_count += 1
            if total_count >= limit:
                break

    if not requests:
        print("No new meetings found to process.")
        return

    # 2. Split and Write Files
    chunks = [requests[i : i + batch_size] for i in range(0, len(requests), batch_size)]
    base_time = int(time.time())

    print(f"Generated {len(requests)} requests. Splitting into {len(chunks)} files...")

    for i, chunk in enumerate(chunks):
        filename = f"batch_requests_{base_time}_{i + 1}.jsonl"
        filepath = os.path.join(BATCH_WORKSPACE, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            for req in chunk:
                f.write(json.dumps(req) + "\n")
        print(f"Created {filename} ({len(chunk)} requests)")


def submit_batches():
    if not client:
        print("Error: GEMINI_API_KEY not set.")
        return

    state = load_state()
    # Find all jsonl files
    files = sorted(glob.glob(os.path.join(BATCH_WORKSPACE, "batch_requests_*.jsonl")))

    # Filter out files already associated with a job
    existing_files = set()
    for job in state["jobs"].values():
        if job.get("source_file"):
            existing_files.add(job.get("source_file"))

    submitted_count = 0
    for filepath in files:
        if filepath in existing_files:
            continue

        print(f"Submitting {filepath}...")
        try:
            uploaded_file = client.files.upload(
                file=filepath, config={"mime_type": "text/plain"}
            )
            print(f"  Uploaded: {uploaded_file.name}")

            batch_job = client.batches.create(
                model="gemini-flash-latest",
                src=uploaded_file.name,
                config={
                    "display_name": f"vr_batch_{int(time.time())}_{submitted_count}"
                },
            )
            print(f"  Job Created: {batch_job.name}")

            state["jobs"][batch_job.name] = {
                "name": batch_job.name,
                "source_file": filepath,
                "file_name": uploaded_file.name,
                "timestamp": time.time(),
                "status": batch_job.state,
                "ingested": False,
            }
            submitted_count += 1
            save_state(state)  # Save after each submit

            # Brief sleep between submissions to respect concurrent job creation limits
            time.sleep(2)

        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                print(f"\n[!] Quota Limit Reached during {filepath}.")
                print(
                    "    The Gemini Batch API limit for concurrent jobs has been hit."
                )
                print(f"    Successfully submitted {submitted_count} new jobs.")
                print("    Wait for these to finish before running 'submit' again.")
                break
            else:
                print(f"  Failed to submit {filepath}: {e}")

    if submitted_count == 0:
        print("No new batch files to submit.")


def check_statuses():
    if not client:
        return
    state = load_state()

    if not state.get("jobs"):
        print("No jobs found in state.")
        return

    print(f"Checking status for {len(state['jobs'])} jobs...")

    updated = False
    stats = {
        "PENDING": 0,
        "RUNNING": 0,
        "SUCCEEDED": 0,
        "FAILED": 0,
        "CANCELLED": 0,
        "TOTAL": 0,
    }

    for job_name, job_info in state["jobs"].items():
        stats["TOTAL"] += 1
        current_status = job_info.get("status", "UNKNOWN")

        # Check if status is already terminal
        if current_status in [
            "JOB_STATE_SUCCEEDED",
            "JOB_STATE_FAILED",
            "JOB_STATE_CANCELLED",
        ]:
            # Map long state names to short keys for our summary
            key = current_status.replace("JOB_STATE_", "")
            stats[key] = stats.get(key, 0) + 1
            continue

        print(f"  Fetching: {job_name} ({current_status})...")
        try:
            job = client.batches.get(name=job_name)
            job_info["status"] = job.state
            updated = True

            key = job.state.replace("JOB_STATE_", "")
            stats[key] = stats.get(key, 0) + 1

            if job.state == "JOB_STATE_SUCCEEDED":
                print(f"    -> SUCCEEDED!")
                if hasattr(job, "dest") and job.dest:
                    output_name = getattr(job.dest, "file_name", None)
                    if output_name:
                        job_info["output_file_name"] = output_name
                        # Try get URI
                        try:
                            f = client.files.get(name=output_name)
                            job_info["output_file_uri"] = f.uri
                        except:
                            pass
            elif job.state == "JOB_STATE_FAILED":
                print(f"    -> FAILED: {getattr(job, 'error', 'Unknown Error')}")
        except Exception as e:
            print(f"    Error checking {job_name}: {e}")

    if updated:
        save_state(state)

    print("\n--- Batch Job Summary ---")
    print(f"  Total:     {stats['TOTAL']}")
    print(f"  Succeeded: {stats.get('SUCCEEDED', 0)} (Ready for download/ingest)")
    print(f"  Running:   {stats.get('RUNNING', 0)}")
    print(f"  Pending:   {stats.get('PENDING', 0)}")
    print(f"  Failed:    {stats.get('FAILED', 0)}")
    print(f"  Cancelled: {stats.get('CANCELLED', 0)}")
    print("-------------------------\n")


def download_completed():
    if not client:
        return
    state = load_state()

    for job_name, job_info in state["jobs"].items():
        if job_info.get("status") == "JOB_STATE_SUCCEEDED" and not job_info.get(
            "local_results_path"
        ):
            print(f"Downloading results for {job_name}...")

            output_name = job_info.get("output_file_name")
            if not output_name:
                # Try to re-fetch job info if missing
                try:
                    job = client.batches.get(name=job_name)
                    if hasattr(job, "dest") and job.dest:
                        output_name = getattr(job.dest, "file_name", None)
                        job_info["output_file_name"] = output_name
                except:
                    pass

            if output_name:
                # Make a unique filename for the results
                # job_name format: projects/.../locations/.../batches/BATCH_ID
                batch_id = job_name.split("/")[-1]
                out_path = os.path.join(BATCH_WORKSPACE, f"results_{batch_id}.jsonl")
                try:
                    content = client.files.download(file=output_name)
                    with open(out_path, "wb") as f:
                        f.write(content)
                    print(f"  Saved to {out_path}")
                    job_info["local_results_path"] = out_path
                    save_state(state)
                except Exception as e:
                    print(f"  Download failed: {e}")
            else:
                print(f"  No output file info found for {job_name}")


def process_results_file(path):
    success_count = 0
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
                custom_id = item.get("custom_id")

                if not custom_id:
                    continue
                if "error" in item:
                    print(f"  [!] Error for {custom_id}: {item['error']}")
                    continue

                response_container = item.get("response", {})
                body = response_container
                if isinstance(body, str):
                    try:
                        body = json.loads(body)
                    except:
                        pass

                candidates = body.get("candidates", [])
                if not candidates:
                    continue

                part_text = (
                    candidates[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("text", "")
                )

                if not part_text:
                    continue

                refined_data = json.loads(part_text)

                print(f"  Ingesting {custom_id}...")
                try:
                    ingester_instance.process_meeting(
                        custom_id, dry_run=False, precomputed_refinement=refined_data
                    )
                    success_count += 1
                except Exception as e:
                    print(f"  Failed to ingest {custom_id}: {e}")

            except Exception as e:
                print(f"Error processing line in {path}: {e}")
    return success_count


def ingest_completed():
    state = load_state()

    for job_name, job_info in state["jobs"].items():
        if job_info.get("local_results_path") and not job_info.get("ingested"):
            path = job_info["local_results_path"]
            if not os.path.exists(path):
                print(f"Results file missing for {job_name}: {path}")
                continue

            print(f"Ingesting results from {path}...")
            success_count = process_results_file(path)

            if success_count > 0:
                print(f"  Ingested {success_count} meetings from {path}")
                job_info["ingested"] = True
                save_state(state)
            else:
                print(
                    f"  No meetings successfully ingested from {path} (or file empty/errors)."
                )
                # Mark as ingested anyway to prevent loop? Or leave False?
                # Leaving False allows retry.
                pass


def merge_batches():
    print("Merging pending batch files...")
    state = load_state()

    # Identify files already associated with jobs (active or otherwise)
    job_files = set()
    for job in state.get("jobs", {}).values():
        if job.get("source_file"):
            job_files.add(job.get("source_file"))

    # Find all batch files
    all_files = sorted(
        glob.glob(os.path.join(BATCH_WORKSPACE, "batch_requests_*.jsonl"))
    )

    # Filter for files that are NOT in jobs
    pending_files = [f for f in all_files if f not in job_files]

    if len(pending_files) < 2:
        print(f"Found {len(pending_files)} pending files. No merge needed.")
        return

    print(f"Found {len(pending_files)} pending files to merge.")

    merged_requests = []
    for pf in pending_files:
        try:
            with open(pf, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        merged_requests.append(line.strip())
        except Exception as e:
            print(f"Error reading {pf}: {e}")
            return

    # Write merged file
    timestamp = int(time.time())
    merged_filename = f"batch_requests_merged_{timestamp}.jsonl"
    merged_filepath = os.path.join(BATCH_WORKSPACE, merged_filename)

    print(f"Writing {len(merged_requests)} requests to {merged_filename}...")
    with open(merged_filepath, "w", encoding="utf-8") as f:
        for req in merged_requests:
            f.write(req + "\n")

    # Delete old files
    print("Deleting old files...")
    for pf in pending_files:
        try:
            os.remove(pf)
        except OSError as e:
            print(f"Warning: Could not remove {pf}: {e}")

    print("Merge complete.")


def main():
    parser = argparse.ArgumentParser(
        description="Batch Processing for View Royal Ingestion"
    )
    subparsers = parser.add_subparsers(dest="command")

    create_p = subparsers.add_parser("create", help="Create batch requests file")
    create_p.add_argument(
        "--limit", type=int, default=10000, help="Max requests to generate"
    )
    create_p.add_argument(
        "--batch-size", type=int, default=100, help="Requests per batch file"
    )
    create_p.add_argument(
        "--update", action="store_true", help="Reprocess even if already ingested"
    )

    subparsers.add_parser("submit", help="Submit all pending batch files")
    subparsers.add_parser("status", help="Check status of all active jobs")
    subparsers.add_parser("download", help="Download results of succeeded jobs")
    subparsers.add_parser("ingest", help="Ingest downloaded results into Supabase")
    subparsers.add_parser("merge", help="Merge pending batch files into a single file")

    args = parser.parse_args()

    if args.command == "create":
        create_batches(args.limit, args.batch_size, args.update)
    elif args.command == "submit":
        submit_batches()
    elif args.command == "status":
        check_statuses()
    elif args.command == "download":
        download_completed()
    elif args.command == "ingest":
        ingest_completed()
    elif args.command == "merge":
        merge_batches()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
