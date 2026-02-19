#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PIPELINE_DIR="$REPO_DIR/apps/pipeline"
WEB_DIR="$REPO_DIR/apps/web"

echo "=== Pipeline Tests ==="
cd "$PIPELINE_DIR"
uv run pytest "$@"
echo ""

echo "=== Web Tests ==="
cd "$WEB_DIR"
pnpm test run
echo ""

echo "All tests passed."
