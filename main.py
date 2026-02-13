import argparse
from src.core import config
from src.core.paths import ARCHIVE_ROOT
from src.pipeline.orchestrator import Archiver

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="View Royal CivicWeb & Vimeo Archiver")

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

    args = parser.parse_args()

    # Use centralized ARCHIVE_ROOT as default
    output_dir = args.input_dir if args.input_dir else ARCHIVE_ROOT

    app = Archiver()

    if args.process_only or args.rediarize:
        if app.ai_enabled:
            mode = "Re-diarizing" if args.rediarize else "Processing"
            print(f"{mode} existing audio files in {output_dir}...")
            # pylint: disable=protected-access
            app._process_audio_files(
                limit=args.limit, output_dir=output_dir, rediarize=args.rediarize
            )
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
        )