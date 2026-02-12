import argparse
import concurrent.futures
import os
import sys
import time
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

# Ensure we can import from src when running as a script
sys.path.append(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

from src.core.embeddings import EmbeddingClient
from src.pipeline.ingester import MeetingIngester

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env")
    sys.exit(1)


class EmbeddingPipeline:
    def __init__(self, max_workers: int = 5, force: bool = False):
        # We reuse the ingester's supabase client
        self.ingester = MeetingIngester(SUPABASE_URL, SUPABASE_KEY, "")
        self.supabase = self.ingester.supabase
        self.client = EmbeddingClient()
        self.api_batch_size = 100  # Google API limit for embed_content
        self.db_batch_size = 200  # Number of rows to update in one Supabase call
        self.max_workers = max_workers
        self.force = force

    def _bulk_update(self, table_name: str, rows: List[Dict[str, Any]]):
        """
        Updates multiple rows in Supabase using upsert.
        Expects rows to have 'id' and 'embedding'.
        """
        if not rows:
            return

        try:
            # Using upsert with the id as the conflict target allows bulk updates
            self.supabase.table(table_name).upsert(rows, on_conflict="id").execute()
            return True
        except Exception as e:
            print(f"    [!] Bulk update failed for {table_name}: {e}")
            return False

    def _process_chunk(
        self, table_name: str, chunk_rows: List[Dict[str, Any]], text_column: str
    ):
        """Processes a specific chunk of rows: embeds and updates DB."""
        ids = [row["id"] for row in chunk_rows]
        texts = [row[text_column] if row[text_column] else "" for row in chunk_rows]
        cleaned_texts = [t.strip() for t in texts]

        # Generate embeddings
        embeddings = self.client.embed_batch(
            cleaned_texts, batch_size=self.api_batch_size
        )

        # Filter out failures
        update_rows = []
        for i, row_id in enumerate(ids):
            if not all(v == 0 for v in embeddings[i]):
                update_rows.append({"id": row_id, "embedding": embeddings[i]})

        if update_rows:
            self._bulk_update(table_name, update_rows)
            return len(update_rows)
        return 0

    def process_table(self, table_name: str, text_column: str, limit: int = 1000):
        """
        Generic processor for tables with NULL embeddings using parallel bulk updates.
        If self.force is True, it processes all records regardless of embedding status.
        """
        print(f"\n--- Processing {table_name} ({text_column}) ---")

        query = self.supabase.table(table_name).select(f"id, {text_column}")

        if not self.force:
            query = query.is_("embedding", "NULL")

        try:
            res = query.limit(limit).execute()
        except Exception as e:
            print(f"  [!] Error fetching data: {e}")
            return

        rows = res.data
        if not rows:
            print(f"  No pending rows found for {table_name}.")
            return

        print(
            f"  Found {len(rows)} rows to embed (Force: {self.force}). Using {self.max_workers} workers."
        )

        # Split rows into chunks for parallel processing
        chunks = [
            rows[i : i + self.api_batch_size]
            for i in range(0, len(rows), self.api_batch_size)
        ]

        success_total = 0
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=self.max_workers
        ) as executor:
            futures = [
                executor.submit(self._process_chunk, table_name, chunk, text_column)
                for chunk in chunks
            ]
            for future in concurrent.futures.as_completed(futures):
                try:
                    success_total += future.result()
                except Exception as e:
                    print(f"    [!] Worker error: {e}")

        print(
            f"  Successfully updated {success_total}/{len(rows)} rows in {table_name}."
        )

    def process_transcripts(self, limit: int = 2000):
        """Specialized handling for transcript segments with parallel processing."""
        print(f"\n--- Processing transcript_segments ---")

        query = self.supabase.table("transcript_segments").select(
            "id, text_content, corrected_text_content"
        )

        if not self.force:
            query = query.is_("embedding", "NULL")

        try:
            res = query.limit(limit).execute()
        except Exception as e:
            print(f"  [!] Error fetching transcripts: {e}")
            return

        rows = res.data
        if not rows:
            print(f"  No pending transcripts found.")
            return

        print(
            f"  Found {len(rows)} transcript segments. Using {self.max_workers} workers."
        )

        chunks = [
            rows[i : i + self.api_batch_size]
            for i in range(0, len(rows), self.api_batch_size)
        ]

        success_total = 0
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=self.max_workers
        ) as executor:

            def process_transcript_chunk(chunk):
                ids = [row["id"] for row in chunk]
                texts = [
                    row.get("corrected_text_content") or row.get("text_content") or ""
                    for row in chunk
                ]
                cleaned_texts = [t.strip() for t in texts]
                embeddings = self.client.embed_batch(
                    cleaned_texts, batch_size=self.api_batch_size
                )

                update_rows = [
                    {"id": ids[i], "embedding": embeddings[i]}
                    for i in range(len(ids))
                    if not all(v == 0 for v in embeddings[i])
                ]

                if update_rows:
                    self._bulk_update("transcript_segments", update_rows)
                    return len(update_rows)
                return 0

            futures = [
                executor.submit(process_transcript_chunk, chunk) for chunk in chunks
            ]
            for future in concurrent.futures.as_completed(futures):
                success_total += future.result()

        print(
            f"  Successfully updated {success_total}/{len(rows)} transcript segments."
        )

    def process_matters(self, limit: int = 500):
        print(f"\n--- Processing matters ---")
        query = self.supabase.table("matters").select(
            "id, title, plain_english_summary"
        )

        if not self.force:
            query = query.is_("embedding", "NULL")

        try:
            res = query.limit(limit).execute()
        except Exception as e:
            print(f"  [!] Error: {e}")
            return

        rows = res.data
        if not rows:
            return

        ids = [row["id"] for row in rows]
        texts = [
            row.get("plain_english_summary") or row.get("title") or "" for row in rows
        ]

        embeddings = self.client.embed_batch(texts, batch_size=self.api_batch_size)
        update_rows = [
            {"id": ids[i], "embedding": embeddings[i]}
            for i in range(len(ids))
            if not all(v == 0 for v in embeddings[i])
        ]
        self._bulk_update("matters", update_rows)
        print(f"  Updated {len(update_rows)} matters.")

    def process_agenda_items(self, limit: int = 500):
        print(f"\n--- Processing agenda_items ---")
        query = self.supabase.table("agenda_items").select("id, title, description")

        if not self.force:
            query = query.is_("embedding", "NULL")

        try:
            res = query.limit(limit).execute()
        except Exception as e:
            print(f"  [!] Error: {e}")
            return

        rows = res.data
        if not rows:
            return

        ids = [row["id"] for row in rows]
        texts = [f"{r['title']}\n{r.get('description') or ''}".strip() for r in rows]

        embeddings = self.client.embed_batch(texts, batch_size=self.api_batch_size)
        update_rows = [
            {"id": ids[i], "embedding": embeddings[i]}
            for i in range(len(ids))
            if not all(v == 0 for v in embeddings[i])
        ]

        self._bulk_update("agenda_items", update_rows)
        print(f"  Updated {len(update_rows)} agenda items.")

    def process_motions(self, limit: int = 500):
        self.process_table("motions", "text_content", limit=limit)

    def process_meetings(self, limit: int = 200):
        self.process_table("meetings", "summary", limit=limit)


def main():
    parser = argparse.ArgumentParser(
        description="Generate embeddings with Parallel Processing & Bulk Upload"
    )
    parser.add_argument(
        "--table",
        type=str,
        choices=["all", "transcripts", "motions", "matters", "items", "meetings"],
        default="all",
    )
    parser.add_argument(
        "--limit", type=int, default=1000, help="Max records per table to process"
    )
    parser.add_argument(
        "--workers", type=int, default=5, help="Number of parallel workers"
    )
    parser.add_argument(
        "--force", action="store_true", help="Regenerate embeddings even if they exist"
    )
    parser.add_argument(
        "--loop", action="store_true", help="Continuously process until caught up"
    )

    args = parser.parse_args()
    pipeline = EmbeddingPipeline(max_workers=args.workers, force=args.force)

    def run_cycle():
        if args.table in ["all", "transcripts"]:
            pipeline.process_transcripts(limit=args.limit)
        if args.table in ["all", "motions"]:
            pipeline.process_motions(limit=args.limit // 2)
        if args.table in ["all", "matters"]:
            pipeline.process_matters(limit=args.limit // 2)
        if args.table in ["all", "items"]:
            pipeline.process_agenda_items(limit=args.limit // 2)
        if args.table in ["all", "meetings"]:
            pipeline.process_meetings(limit=args.limit // 5)

    if args.loop:
        print(
            f"Starting parallel bulk embedding loop ({args.workers} workers, Force: {args.force}). Ctrl+C to stop."
        )
        try:
            while True:
                run_cycle()
                print("\nCycle complete. Sleeping for 10 seconds...")
                time.sleep(10)
        except KeyboardInterrupt:
            print("\nStopping pipeline.")
    else:
        run_cycle()


if __name__ == "__main__":
    main()
