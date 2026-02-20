import argparse
from pipeline import config
from pipeline.paths import ARCHIVE_ROOT
from pipeline.orchestrator import Archiver, load_municipality

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Municipal CivicWeb & Vimeo Archiver")

    parser.add_argument(
        "--municipality", type=str, default=None,
        help="Municipality slug (e.g. 'view-royal'). Loads config from DB.",
    )

    parser.add_argument(
        "--videos-only", action="store_true", help="Skip the document scanning phase."
    )

    parser.add_argument(
        "--include-video", action="store_true", help="Download MP4 video files."
    )

    parser.add_argument(
        "--download-audio",
        action="store_true",
        help="Download audio files (MP3) for processing.",
    )

    parser.add_argument(
        "--limit",
        type=int,
        help="Limit the number of videos to match/download (for testing).",
    )

    parser.add_argument(
        "--skip-diarization",
        action="store_true",
        help="Skip the diarization/transcription phase.",
    )

    parser.add_argument(
        "--process-only",
        action="store_true",
        help="Only process existing audio files (skip download/scrape).",
    )

    parser.add_argument(
        "--input-dir",
        type=str,
        help="Directory containing audio files to process (overrides default).",
    )

    parser.add_argument(
        "--rediarize",
        action="store_true",
        help="Re-run diarization only, reusing cached raw transcripts (skips STT).",
    )

    parser.add_argument(
        "--skip-ingest",
        action="store_true",
        help="Skip Phase 4 (database ingestion).",
    )

    parser.add_argument(
        "--skip-embed",
        action="store_true",
        help="Skip Phase 5 (embedding generation).",
    )

    parser.add_argument(
        "--ingest-only",
        action="store_true",
        help="Only run Phase 4 (ingestion with change detection).",
    )

    parser.add_argument(
        "--embed-only",
        action="store_true",
        help="Only run Phase 5 (embed rows where embedding IS NULL).",
    )

    parser.add_argument(
        "--extract-documents",
        action="store_true",
        help="Run Gemini-powered document extraction on all agenda PDFs (resumable). "
             "Replaces existing document_sections. Use --force to delete and reprocess all. "
             "Use --limit N to process only N meetings.",
    )

    parser.add_argument(
        "--backfill-sections",
        action="store_true",
        help="[DEPRECATED: use --extract-documents] Backfill document sections for all existing documents.",
    )

    parser.add_argument(
        "--batch",
        action="store_true",
        help="Use Gemini Batch API for extraction (50%% cost savings, higher latency). "
             "Use with --extract-documents.",
    )

    parser.add_argument(
        "--concurrency",
        type=int,
        default=1,
        help="Number of meetings to process in parallel (default 1). "
             "Use with --extract-documents. Recommended: 5-10.",
    )

    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-processing (delete and recreate existing data). Used with --extract-documents or --backfill-sections.",
    )

    parser.add_argument(
        "--target",
        type=str,
        help="Target a specific meeting by DB ID or folder path (force re-processes).",
    )

    parser.add_argument(
        "--update",
        action="store_true",
        help="Force update existing meetings during ingestion.",
    )

    parser.add_argument(
        "--check-updates",
        action="store_true",
        help="Check CivicWeb and Vimeo for new content without processing. "
             "Prints a report of meetings with changes.",
    )

    parser.add_argument(
        "--update-mode",
        action="store_true",
        help="Run in update mode: scrape CivicWeb, check Vimeo, detect changes, "
             "and selectively re-process only meetings with new content. "
             "Recommended for daily automated runs.",
    )

    parser.add_argument(
        "--test",
        action="store_true",
        help="Mark this as a test run. Push notifications will be prefixed with [TEST].",
    )

    parser.add_argument(
        "--generate-stances",
        action="store_true",
        help="Generate AI stance summaries for all councillors using Gemini. "
             "Use --target to generate for a specific person ID only.",
    )
    parser.add_argument(
        "--generate-highlights",
        action="store_true",
        help="Generate councillor overview + notable policy positions using Gemini. "
             "Use --target to generate for a specific person ID only.",
    )

    args = parser.parse_args()

    # Load municipality config if specified
    municipality = None
    if args.municipality:
        municipality = load_municipality(args.municipality)
        print(f"[*] Municipality: {municipality.name} ({municipality.slug})")

    # Use centralized ARCHIVE_ROOT as default
    output_dir = args.input_dir if args.input_dir else ARCHIVE_ROOT

    app = Archiver(municipality=municipality)

    if args.check_updates:
        print("\n--- Update Check (Dry Run) ---")
        app.run_update_check()
    elif args.update_mode:
        print("\n--- Update Mode ---")
        app.run_update_mode(
            download_audio=True,  # Always download audio in update mode
            skip_diarization=args.skip_diarization,
            skip_embed=args.skip_embed,
            test=args.test,
        )
    elif args.generate_stances:
        print("\n--- Generating Councillor Stance Summaries ---")
        person_id = int(args.target) if args.target else None
        app.generate_stances(person_id=person_id)
    elif args.generate_highlights:
        print("\n--- Generating Councillor Highlights ---")
        person_id = int(args.target) if args.target else None
        app.generate_highlights(person_id=person_id, force=args.force)
    elif args.target:
        # Targeted mode: diarize → ingest → embed for a single meeting
        folder = app._resolve_target(args.target)
        diarized = set()
        if app.ai_enabled and not args.skip_diarization:
            print(f"\n--- Diarizing target: {folder} ---")
            diarized = app._process_audio_files(
                limit=args.limit, output_dir=folder, rediarize=args.rediarize
            )
        if not args.skip_ingest:
            print(f"\n--- Ingesting target: {folder} ---")
            app._ingest_meetings(diarized_folders=diarized, target_folder=folder, force_update=True)
        if not args.skip_embed:
            print("\n--- Embedding new content ---")
            app._embed_new_content()
    elif args.ingest_only:
        print("\n--- Ingestion Only (with change detection) ---")
        app._ingest_meetings(force_update=args.update)
    elif args.embed_only:
        print("\n--- Embedding Only ---")
        app._embed_new_content()
    elif args.extract_documents:
        if args.batch:
            print("\n--- Extract Documents (Gemini Batch API) ---")
            app.backfill_extracted_documents_batch(force=args.force, limit=args.limit)
        else:
            print("\n--- Extract Documents (Gemini 2.5 Flash) ---")
            app.backfill_extracted_documents(force=args.force, limit=args.limit, concurrency=args.concurrency)
        if not args.skip_embed:
            print("\n--- Embedding Document Sections ---")
            app._embed_new_content()
    elif args.backfill_sections:
        print("\n--- Backfill Document Sections (DEPRECATED: use --extract-documents) ---")
        app.backfill_document_sections(force=args.force)
        if not args.skip_embed:
            print("\n--- Embedding Document Sections ---")
            app._embed_new_content()
    elif args.process_only or args.rediarize:
        if app.ai_enabled:
            mode = "Re-diarizing" if args.rediarize else "Processing"
            print(f"{mode} existing audio files in {output_dir}...")
            # pylint: disable=protected-access
            diarized = app._process_audio_files(
                limit=args.limit, output_dir=output_dir, rediarize=args.rediarize
            )
            if not args.skip_ingest:
                print("\n--- Phase 4: Database Ingestion ---")
                app._ingest_meetings(diarized_folders=diarized)
            if not args.skip_embed:
                print("\n--- Phase 5: Embedding Generation ---")
                app._embed_new_content()
        else:
            print("[Error] AI processing not enabled.")
    else:
        app.run(
            skip_docs=args.videos_only,
            include_video=args.include_video,
            limit=args.limit,
            download_audio=args.download_audio,
            skip_diarization=args.skip_diarization,
            rediarize=args.rediarize,
            skip_ingest=args.skip_ingest,
            skip_embed=args.skip_embed,
        )
