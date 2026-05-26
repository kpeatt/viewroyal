#!/bin/bash
# ViewRoyal.ai Pipeline - Daily Update Runner
# Invoked by launchd (com.viewroyal.pipeline.plist)

set -euo pipefail

# Homebrew (launchd doesn't inherit shell PATH)
export PATH="/opt/homebrew/bin:$PATH"

# Project paths
PROJECT_DIR="$HOME/development/viewroyal"
PIPELINE_DIR="$PROJECT_DIR/apps/pipeline"

# Load environment variables (root .env has all keys)
if [ -f "$PROJECT_DIR/.env" ]; then
    set -a
    source "$PROJECT_DIR/.env"
    set +a
fi
# Override with pipeline-specific .env if present
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
