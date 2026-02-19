#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PIPELINE_DIR="$REPO_DIR/apps/pipeline"
WEB_DIR="$REPO_DIR/apps/web"

echo "================================"
echo "  Pre-deploy Test Gate"
echo "================================"
echo ""

echo "[1/2] Pipeline tests..."
cd "$PIPELINE_DIR"
uv run pytest --tb=short -q --ignore=tests/core/test_marker_ocr.py
echo ""

echo "[2/2] Web server tests..."
cd "$WEB_DIR"
pnpm test run 2>&1
echo ""

echo "================================"
echo "  All tests passed. Safe to deploy."
echo "================================"
