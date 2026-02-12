import argparse
import os
import re
import sys

import fitz  # PyMuPDF
from dotenv import load_dotenv
from supabase import create_client

# Ensure we can import from src
sys.path.append(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

from src.core.embeddings import get_embedding_client
from src.core.paths import ARCHIVE_ROOT

load_dotenv()

# Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY")
BYLAWS_DIR = os.path.join(ARCHIVE_ROOT, "Bylaws")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def extract_metadata(filename):
    """
    Extracts Title, Bylaw Number, and Year from filename.
    Expected format: "Name of Bylaw No. 123, 2023.pdf"
    """
    clean_name = filename.replace(".pdf", "").replace(".PDF", "")

    # regex for "No. 1234"
    number_match = re.search(r"No\.?\s*(\d+)", clean_name, re.IGNORECASE)
    bylaw_number = number_match.group(1) if number_match else None

    # regex for year
    year_match = re.search(r"\b(19|20)\d{2}\b", clean_name)
    year = int(year_match.group(0)) if year_match else None

    return {"title": clean_name, "bylaw_number": bylaw_number, "year": year}


def extract_text_from_pdf(filepath):
    """Reads PDF and returns full text content."""
    try:
        doc = fitz.open(filepath)
        text = ""
        for page in doc:
            text += page.get_text() + "\n"
        return text
    except Exception as e:
        print(f"[!] Error reading PDF {filepath}: {e}")
        return None


def chunk_text(text, chunk_size=1000, overlap=200):
    """Splits text into overlapping chunks."""
    if not text:
        return []

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]

        # Try to break at a newline or period if possible to avoid cutting words
        # but only if we are not at the very end
        if end < len(text):
            # Look for last newline first
            last_break = chunk.rfind("\n")
            if last_break == -1:
                last_break = chunk.rfind(". ")

            if last_break > chunk_size * 0.7:  # Only back off if we don't lose too much
                end = start + last_break + 1
                chunk = text[start:end]

        if len(chunk.strip()) > 20:  # Filter out tiny noise
            chunks.append(chunk.strip())

        start = end - overlap

    return chunks


def ingest_bylaws(force_update=False):
    print("--- View Royal Bylaw Ingestion ---")

    if not os.path.exists(BYLAWS_DIR):
        print(f"Directory not found: {BYLAWS_DIR}")
        return

    # Initialize Embedding Client (lazy load)
    try:
        embedding_client = get_embedding_client()
    except Exception as e:
        print(f"Failed to initialize embedding client: {e}")
        return

    files = [f for f in os.listdir(BYLAWS_DIR) if f.lower().endswith(".pdf")]
    print(f"Found {len(files)} PDFs in {BYLAWS_DIR}")

    for filename in files:
        filepath = os.path.join(BYLAWS_DIR, filename)
        rel_path = os.path.relpath(filepath, ARCHIVE_ROOT)

        # Check existence
        existing = (
            supabase.table("bylaws").select("id").eq("file_path", rel_path).execute()
        )

        if existing.data and not force_update:
            print(f"[SKIP] Already ingested: {filename}")
            continue

        print(f"[*] Processing: {filename}")

        # 1. Extract Text & Metadata
        full_text = extract_text_from_pdf(filepath)
        if not full_text:
            print(f"    [!] No text extracted.")
            continue

        meta = extract_metadata(filename)

        # 2. Generate Doc-Level Embedding (Title + first 1000 chars usually contains purpose)
        # This helps 'match_bylaws' find the document itself.
        doc_context = f"{meta['title']}\n{full_text[:1000]}"
        doc_embedding = embedding_client.embed_text(
            doc_context, task_type="RETRIEVAL_DOCUMENT", title=meta["title"]
        )

        # 3. Upsert Bylaw Record
        bylaw_data = {
            "title": meta["title"],
            "bylaw_number": meta["bylaw_number"],
            "year": meta["year"],
            "file_path": rel_path,
            "full_text": full_text,
            "embedding": doc_embedding,
            "updated_at": "now()",
        }

        # Upsert based on file_path (which is unique)
        bylaw_id = None
        if existing.data:
            bylaw_id = existing.data[0]["id"]
            # We must update using ID because we might have changed columns
            supabase.table("bylaws").update(bylaw_data).eq("id", bylaw_id).execute()
        else:
            res = supabase.table("bylaws").insert(bylaw_data).execute()
            if res.data:
                bylaw_id = res.data[0]["id"]

        if not bylaw_id:
            print(f"    [!] Failed to insert/get ID for {filename}")
            continue

        # 4. Chunking & Chunk Embeddings
        # Clear existing chunks if updating
        if force_update or existing.data:
            supabase.table("bylaw_chunks").delete().eq("bylaw_id", bylaw_id).execute()

        chunks = chunk_text(full_text)
        print(f"    -> Generated {len(chunks)} chunks. Generating embeddings...")

        # Embed in batches
        chunk_embeddings = embedding_client.embed_batch(
            chunks, task_type="RETRIEVAL_DOCUMENT"
        )

        # Prepare rows
        chunk_rows = []
        for i, (txt, emb) in enumerate(zip(chunks, chunk_embeddings)):
            chunk_rows.append(
                {
                    "bylaw_id": bylaw_id,
                    "chunk_index": i,
                    "text_content": txt,
                    "embedding": emb,
                }
            )

        # Insert chunks (Supabase/PostgREST has a limit on payload size, so batch inserts)
        batch_size = 50
        for i in range(0, len(chunk_rows), batch_size):
            batch = chunk_rows[i : i + batch_size]
            try:
                supabase.table("bylaw_chunks").insert(batch).execute()
            except Exception as e:
                print(f"    [!] Error inserting batch {i}: {e}")

        print(f"    -> Ingested {len(chunks)} chunks.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--update", action="store_true", help="Force re-ingest existing bylaws"
    )
    args = parser.parse_args()

    ingest_bylaws(force_update=args.update)
