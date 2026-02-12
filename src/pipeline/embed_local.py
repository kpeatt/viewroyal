"""
Local embedding generation using fastembed (nomic-embed-text-v1.5).
Generates 768-dim embeddings and writes them directly to Supabase via psycopg2 COPY.

Usage:
    uv run python src/pipeline/embed_local.py --table all
    uv run python src/pipeline/embed_local.py --table transcript_segments
    uv run python src/pipeline/embed_local.py --table agenda_items --force
"""

import argparse
import io
import os
import sys
import time

from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY")

# Table -> (text_columns, select_columns)
TABLE_CONFIG = {
    "transcript_segments": {
        "select": "id, text_content, corrected_text_content",
        "text_fn": lambda r: (r[2] or r[1] or "").strip(),
    },
    "agenda_items": {
        "select": "id, title, description",
        "text_fn": lambda r: f"{r[1] or ''}\n{r[2] or ''}".strip(),
    },
    "motions": {
        "select": "id, text_content",
        "text_fn": lambda r: (r[1] or "").strip(),
    },
    "matters": {
        "select": "id, plain_english_summary, title",
        "text_fn": lambda r: (r[1] or r[2] or "").strip(),
    },
    "meetings": {
        "select": "id, summary",
        "text_fn": lambda r: (r[1] or "").strip(),
    },
}

BATCH_SIZE = 256  # rows per embedding batch (fastembed handles this efficiently)
DB_BATCH_SIZE = 500  # rows per database update
DEFAULT_MIN_WORDS = {
    "transcript_segments": 15,  # skip short procedural utterances
    "agenda_items": 0,
    "motions": 0,
    "matters": 0,
    "meetings": 0,
}


def get_db_connection():
    """Get a direct psycopg2 connection to the database."""
    import psycopg2

    if DATABASE_URL:
        return psycopg2.connect(DATABASE_URL)

    # Derive from Supabase URL: https://PROJECT_ID.supabase.co
    if SUPABASE_URL:
        project_id = SUPABASE_URL.replace("https://", "").split(".")[0]
        db_password = os.environ.get("SUPABASE_DB_PASSWORD")
        if db_password:
            conn_str = f"postgresql://postgres:{db_password}@db.{project_id}.supabase.co:5432/postgres"
            return psycopg2.connect(conn_str)

    raise RuntimeError(
        "Set DATABASE_URL or both SUPABASE_URL + SUPABASE_DB_PASSWORD in .env"
    )


def fetch_rows_needing_embeddings(conn, table: str, force: bool = False):
    """Fetch rows that need embeddings using psycopg2 cursor."""
    config = TABLE_CONFIG[table]
    query = f"SELECT {config['select']} FROM {table}"
    if not force:
        query += " WHERE embedding IS NULL"
    query += " ORDER BY id"

    cur = conn.cursor(name=f"fetch_{table}")  # server-side cursor for large tables
    cur.itersize = 2000
    cur.execute(query)
    return cur, config["text_fn"]


def update_embeddings_batch(conn, table: str, updates: list):
    """Bulk update embeddings using a temp table and UPDATE FROM."""
    if not updates:
        return

    cur = conn.cursor()

    # Create temp table
    cur.execute("""
        CREATE TEMP TABLE IF NOT EXISTS _embed_tmp (
            id INTEGER PRIMARY KEY,
            embedding vector(768)
        ) ON COMMIT DROP
    """)
    cur.execute("TRUNCATE _embed_tmp")

    # Use COPY for fast bulk insert into temp table
    buf = io.StringIO()
    for row_id, embedding in updates:
        vec_str = "[" + ",".join(str(v) for v in embedding) + "]"
        buf.write(f"{row_id}\t{vec_str}\n")
    buf.seek(0)

    cur.copy_from(buf, "_embed_tmp", columns=("id", "embedding"))

    # Bulk update from temp table
    cur.execute(f"""
        UPDATE {table} t
        SET embedding = e.embedding
        FROM _embed_tmp e
        WHERE t.id = e.id
    """)
    updated = cur.rowcount
    conn.commit()
    return updated


def embed_table(table: str, force: bool = False, min_words: int = None):
    """Generate and store embeddings for a single table."""
    from fastembed import TextEmbedding

    if min_words is None:
        min_words = DEFAULT_MIN_WORDS.get(table, 0)

    print(f"\n{'='*60}")
    print(f"Embedding: {table}")
    print(f"{'='*60}")

    conn = get_db_connection()

    # Count rows needing embeddings
    cur = conn.cursor()
    count_query = f"SELECT COUNT(*) FROM {table}"
    if not force:
        count_query += " WHERE embedding IS NULL"
    cur.execute(count_query)
    total = cur.fetchone()[0]
    cur.close()

    if total == 0:
        print(f"  No rows need embeddings in {table}.")
        conn.close()
        return

    print(f"  {total} rows to process" + (f" (min {min_words} words)" if min_words else ""))

    # Initialize model (downloads on first run, ~275MB)
    print("  Loading nomic-embed-text-v1.5...")
    model = TextEmbedding("nomic-embed-text-v1.5", max_length=512)
    print("  Model ready.")

    # Fetch rows
    row_cursor, text_fn = fetch_rows_needing_embeddings(conn, table, force)

    # Process in batches
    batch_ids = []
    batch_texts = []
    processed = 0
    skipped = 0
    db_buffer = []  # accumulate (id, embedding) for DB writes
    start_time = time.time()

    for row in row_cursor:
        text = text_fn(row)
        if not text or (min_words and len(text.split()) < min_words):
            skipped += 1
            continue

        # fastembed nomic model expects "search_document: " prefix for documents
        batch_ids.append(row[0])
        batch_texts.append(f"search_document: {text}")

        if len(batch_texts) >= BATCH_SIZE:
            # Generate embeddings
            embeddings = list(model.embed(batch_texts))
            for row_id, emb in zip(batch_ids, embeddings):
                db_buffer.append((row_id, emb.tolist()))

            processed += len(batch_texts)
            batch_ids = []
            batch_texts = []

            # Write to DB when buffer is large enough
            if len(db_buffer) >= DB_BATCH_SIZE:
                update_embeddings_batch(conn, table, db_buffer)
                db_buffer = []

            elapsed = time.time() - start_time
            rate = processed / elapsed if elapsed > 0 else 0
            eta = (total - processed) / rate if rate > 0 else 0
            print(
                f"  Progress: {processed}/{total} ({processed/total*100:.1f}%) "
                f"- {rate:.0f} rows/sec - ETA {eta:.0f}s",
                end="\r",
            )

    # Final batch
    if batch_texts:
        embeddings = list(model.embed(batch_texts))
        for row_id, emb in zip(batch_ids, embeddings):
            db_buffer.append((row_id, emb.tolist()))
        processed += len(batch_texts)

    if db_buffer:
        update_embeddings_batch(conn, table, db_buffer)

    row_cursor.close()
    conn.close()

    elapsed = time.time() - start_time
    print(f"\n  Done: {processed} embedded, {skipped} skipped (empty text), {elapsed:.1f}s")


def main():
    parser = argparse.ArgumentParser(description="Local embedding generation")
    parser.add_argument(
        "--table",
        default="all",
        help="Table to embed (transcript_segments, motions, agenda_items, matters, meetings, or all)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-embed all rows, even those with existing embeddings",
    )
    parser.add_argument(
        "--min-words",
        type=int,
        default=None,
        help="Skip rows with fewer words (default: 15 for transcript_segments, 0 for others)",
    )
    args = parser.parse_args()

    tables = (
        list(TABLE_CONFIG.keys()) if args.table == "all" else [args.table]
    )

    for table in tables:
        if table not in TABLE_CONFIG:
            print(f"Unknown table: {table}")
            continue
        embed_table(table, args.force, args.min_words)


if __name__ == "__main__":
    main()
