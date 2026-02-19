---
status: complete
phase: 10-add-better-test-suite
source: 10-01-SUMMARY.md, 10-02-SUMMARY.md, 10-03-SUMMARY.md, 10-04-SUMMARY.md, 10-05-SUMMARY.md
started: 2026-02-19T02:40:00Z
updated: 2026-02-19T03:14:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Pipeline test suite runs and passes
expected: Running `cd apps/pipeline && uv run pytest --ignore=tests/core/test_marker_ocr.py -q` passes 357+ tests in under 10 seconds with a coverage report showing line-by-line coverage of the pipeline package.
result: pass

### 2. Web app test suite runs and passes
expected: Running `cd apps/web && pnpm test run` passes 70 tests in under 2 seconds with no failures.
result: pass

### 3. Pre-deploy script gates both test suites
expected: Running `./scripts/pre-deploy.sh` from the repo root executes both pipeline and web tests sequentially, prints "All tests passed. Safe to deploy." on success. If either suite fails, the script exits non-zero.
result: pass

### 4. Test-all convenience script with arg passthrough
expected: Running `./scripts/test-all.sh -v --ignore=tests/core/test_marker_ocr.py` passes arguments through to pytest and runs both suites.
result: pass

### 5. Deploy is gated on web test pass
expected: The `apps/web/package.json` contains a `predeploy` script that runs `vitest run`, so `pnpm deploy` would automatically run tests first. Verify by checking: `cd apps/web && grep predeploy package.json`
result: pass

### 6. Previously-skipped test now passes
expected: Running `cd apps/pipeline && uv run pytest tests/pipeline/test_local_refiner_logic.py::test_merge_refinements -v` shows the test passing (it was previously decorated with @pytest.mark.skip).
result: pass

### 7. Pipeline coverage shows meaningful numbers
expected: Running `cd apps/pipeline && uv run pytest --cov=pipeline --cov-report=term-missing --ignore=tests/core/test_marker_ocr.py -q` shows coverage. Key modules should show: alignment.py 80%+, document_extractor.py 70%+, ingester.py 40%+.
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
