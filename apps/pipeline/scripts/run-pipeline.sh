#!/bin/bash
# ViewRoyal.ai Pipeline - Daily Update Runner
# Invoked by launchd (com.viewroyal.pipeline.plist)

set -euo pipefail

# Project paths
PIPELINE_DIR="$HOME/development/viewroyal/apps/pipeline"

# Load environment variables (.env in pipeline dir has Supabase, Gemini, Moshi tokens)
if [ -f "$PIPELINE_DIR/.env" ]; then
    set -a
    source "$PIPELINE_DIR/.env"
    set +a
fi

cd "$PIPELINE_DIR"

# Run pipeline in update-mode (detect changes, re-process, notify)
# Lockfile prevents overlapping runs; logging captures all output to logs/pipeline.log
"$HOME/.local/bin/uv" run python main.py --update-mode 2>&1

exit $?
