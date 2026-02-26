---
phase: quick-9
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - pipeline/update_detector.py
  - tests/conftest.py
autonomous: true
requirements: [QUICK-9]

must_haves:
  truths:
    - "detect_new_meetings() completes without TypeError when called with a real Supabase client"
    - "The .not_.is_() property-then-method chain matches the pattern used everywhere else in the codebase"
    - "Existing tests still pass after the fix"
  artifacts:
    - path: "pipeline/update_detector.py"
      provides: "Fixed not_ usage on line 256"
      contains: ".not_.is_("
    - path: "tests/conftest.py"
      provides: "Mock that mirrors real supabase not_ property behavior"
      contains: "table_mock.not_ = table_mock"
  key_links:
    - from: "pipeline/update_detector.py"
      to: "postgrest SyncSelectRequestBuilder"
      via: ".not_.is_() property chain"
      pattern: '\\.not_\\.is_\\("archive_path"'
---

<objective>
Fix TypeError in update_detector.py where `.not_("archive_path", "is", "null")` is called as a method, but in postgrest-py 2.28.0 `.not_` is a property (negation modifier) not a callable method.

Purpose: The pipeline's update detection crashes on `detect_new_meetings()` because of this API mismatch. Every other file in the codebase uses the correct `.not_.is_()` pattern.
Output: Working `detect_new_meetings()` and a mock fixture that properly reflects the real API.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@pipeline/update_detector.py
@tests/conftest.py
@tests/pipeline/test_update_detector.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix .not_() call and update mock fixture</name>
  <files>pipeline/update_detector.py, tests/conftest.py</files>
  <action>
In `pipeline/update_detector.py` line 256, change:
```python
.not_("archive_path", "is", "null")
```
to:
```python
.not_.is_("archive_path", "null")
```

This matches the postgrest-py 2.28.0 API where `.not_` is a property that returns a negated builder, and `.is_()` is then called as a method on it. This is the same pattern used in:
- `pipeline/orchestrator.py` lines 829, 1029
- `pipeline/profiling/stance_generator.py` line 90
- `pipeline/profiling/profile_agent.py` line 244

In `tests/conftest.py`, update the mock_supabase fixture to properly mock `.not_` as a property (attribute) rather than a callable method:
1. Remove `"not_"` from the list of chainable methods on line 74
2. After the for-loop (after line 79), add: `table_mock.not_ = table_mock`

This makes the mock behave like the real client: `table_mock.not_` returns `table_mock` (as a property access), then `.is_("col", "val")` is called on it (as a method). The existing mock accidentally worked because MagicMock makes any attribute callable, but this change makes the intent explicit and matches the pattern used in `tests/profiling/test_stance_generator.py` line 293.
  </action>
  <verify>
    <automated>cd /Users/kyle/development/viewroyal/apps/pipeline && uv run pytest tests/pipeline/test_update_detector.py tests/orchestrator/test_orchestrator.py -x -q</automated>
    <manual>Verify the fix by grepping for old pattern: `grep -n 'not_(' pipeline/update_detector.py` should return zero matches</manual>
  </verify>
  <done>
    - Line 256 uses `.not_.is_("archive_path", "null")` instead of `.not_("archive_path", "is", "null")`
    - conftest.py mock_supabase sets `table_mock.not_ = table_mock` as attribute, not method
    - All existing tests pass
  </done>
</task>

</tasks>

<verification>
```bash
cd /Users/kyle/development/viewroyal/apps/pipeline && uv run pytest tests/ -x -q
```
Full test suite passes with no regressions.
</verification>

<success_criteria>
- No TypeError when detect_new_meetings() is called with a Supabase client
- The .not_.is_() pattern is consistent across the entire codebase (no remaining .not_() method calls)
- All existing tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/9-fix-typeerror-in-update-detector-py-not-/9-SUMMARY.md`
</output>
