---
phase: 12-investigate-and-fix-missing-agenda-items
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/pipeline/pipeline/ingestion/ingester.py
  - apps/pipeline/pipeline/orchestrator.py
  - apps/pipeline/tests/ingestion/test_ingester.py
autonomous: true
requirements: [FIX-HALF-INGEST, FIX-SELF-HEAL]
must_haves:
  truths:
    - "Meetings with has_agenda=true but 0 agenda items are re-processed on next run instead of skipped"
    - "Pipeline logs a clear warning when GEMINI_API_KEY is missing during ingestion phase"
  artifacts:
    - path: "apps/pipeline/pipeline/ingestion/ingester.py"
      provides: "Self-healing already-ingested check"
      contains: "agenda_items"
    - path: "apps/pipeline/pipeline/orchestrator.py"
      provides: "Early warning for missing GEMINI_API_KEY"
      contains: "GEMINI_API_KEY"
  key_links:
    - from: "ingester.py process_meeting (line ~862)"
      to: "supabase agenda_items table"
      via: "count query on agenda_items for meeting_id"
      pattern: "agenda_items.*count"
---

<objective>
Fix pipeline to prevent permanently half-ingested meetings when GEMINI_API_KEY is missing.

Purpose: When the automated pipeline runs without GEMINI_API_KEY, meetings get created with has_agenda=true but 0 agenda items. On subsequent runs, the "already ingested" check skips them entirely, creating a permanently broken state. This fix adds self-healing detection and an early warning log.

Output: Modified ingester.py with self-healing check, modified orchestrator.py with early warning, updated tests.
</objective>

<execution_context>
@/Users/kyle/.claude/get-shit-done/workflows/execute-plan.md
@/Users/kyle/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/pipeline/pipeline/ingestion/ingester.py
@apps/pipeline/pipeline/orchestrator.py
@apps/pipeline/tests/ingestion/test_ingester.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add self-healing check for half-ingested meetings and early GEMINI_API_KEY warning</name>
  <files>
    apps/pipeline/pipeline/ingestion/ingester.py
    apps/pipeline/pipeline/orchestrator.py
  </files>
  <action>
**In `ingester.py` `process_meeting()`, around lines 862-871** — enhance the "already ingested" check:

Currently:
```python
if not dry_run and not force_update and not precomputed_refinement:
    res = (
        self.supabase.table("meetings")
        .select("id")
        .eq("archive_path", normalized_path)
        .execute()
    )
    if res.data:
        print("  [->] Meeting already ingested. Skipping.")
        return None
```

Change to:
```python
if not dry_run and not force_update and not precomputed_refinement:
    res = (
        self.supabase.table("meetings")
        .select("id, has_agenda")
        .eq("archive_path", normalized_path)
        .execute()
    )
    if res.data:
        meeting_row = res.data[0]
        # Self-healing: if meeting claims has_agenda but has 0 agenda items,
        # it was half-ingested (e.g. GEMINI_API_KEY was missing). Re-process it.
        if meeting_row.get("has_agenda"):
            items_res = (
                self.supabase.table("agenda_items")
                .select("id", count="exact")
                .eq("meeting_id", meeting_row["id"])
                .execute()
            )
            if items_res.count == 0:
                print(f"  [!] Meeting {meeting_row['id']} has has_agenda=true but 0 agenda items. Re-processing (self-healing).")
                force_update = True
                # Fall through to re-process instead of returning
            else:
                print("  [->] Meeting already ingested. Skipping.")
                return None
        else:
            print("  [->] Meeting already ingested. Skipping.")
            return None
```

Key details:
- Query `has_agenda` alongside `id` in the existing check
- Only when `has_agenda=true`, do a count query on `agenda_items` for that meeting_id
- If count is 0, set `force_update = True` and fall through (do NOT return None)
- If count > 0 or has_agenda is false, skip as before
- Use `count="exact"` on the agenda_items select for efficiency (don't fetch rows)

**In `orchestrator.py` `_ingest_meetings()`, around line 522** — after the `MeetingIngester` is created, add a warning:

After the line `ingester = MeetingIngester(...)`, add:
```python
if not config.GEMINI_API_KEY:
    print("  [WARNING] GEMINI_API_KEY is not set. AI refinement will fail and meetings will be partially ingested (no agenda items/motions). Set GEMINI_API_KEY to enable full processing.")
```

This makes the root cause immediately visible in logs rather than buried as individual meeting failures.
  </action>
  <verify>
    cd /Users/kyle/development/viewroyal/apps/pipeline && python -c "
from pipeline.ingestion.ingester import MeetingIngester
import inspect
src = inspect.getsource(MeetingIngester.process_meeting)
assert 'agenda_items' in src, 'Missing agenda_items check'
assert 'self-healing' in src.lower() or 'Self-healing' in src, 'Missing self-healing comment'
print('OK: ingester.py has self-healing check')
" && python -c "
from pipeline.orchestrator import PipelineOrchestrator
import inspect
src = inspect.getsource(PipelineOrchestrator._ingest_meetings)
assert 'GEMINI_API_KEY' in src, 'Missing GEMINI_API_KEY warning'
assert 'WARNING' in src or 'warning' in src, 'Missing warning keyword'
print('OK: orchestrator.py has GEMINI_API_KEY warning')
"
  </verify>
  <done>
    - process_meeting detects has_agenda=true + 0 agenda_items and re-processes instead of skipping
    - _ingest_meetings logs a clear warning when GEMINI_API_KEY is not set
  </done>
</task>

<task type="auto">
  <name>Task 2: Add test for self-healing detection logic</name>
  <files>apps/pipeline/tests/ingestion/test_ingester.py</files>
  <action>
Add a new test class `TestSelfHealingCheck` to the existing test file `tests/ingestion/test_ingester.py`.

The test should verify the self-healing logic by mocking the Supabase client. Add these tests:

```python
class TestSelfHealingCheck:
    """Tests for the self-healing 'already ingested' check in process_meeting."""

    @pytest.fixture(autouse=True)
    def setup_ingester(self):
        self.ingester = MeetingIngester("http://test.url", "test-key", gemini_key=None)

    def test_skip_when_no_agenda(self):
        """Meeting with has_agenda=false should be skipped normally."""
        mock_table = MagicMock()
        self.ingester.supabase.table = MagicMock(return_value=mock_table)
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=[{"id": 1, "has_agenda": False}])

        result = self.ingester.process_meeting("/fake/path")
        assert result is None  # Should skip

    def test_skip_when_has_agenda_and_items_exist(self):
        """Meeting with has_agenda=true AND agenda items should be skipped."""
        mock_table = MagicMock()
        self.ingester.supabase.table = MagicMock(return_value=mock_table)
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table

        # First call: meetings table returns has_agenda=true
        # Second call: agenda_items table returns count > 0
        mock_table.execute.side_effect = [
            MagicMock(data=[{"id": 1, "has_agenda": True}]),
            MagicMock(count=5, data=[]),
        ]

        result = self.ingester.process_meeting("/fake/path")
        assert result is None  # Should skip (items exist)

    def test_reprocess_when_has_agenda_but_no_items(self, tmp_path):
        """Meeting with has_agenda=true but 0 items should be re-processed."""
        # Create minimal meeting folder structure so process_meeting can proceed
        agenda_dir = tmp_path / "Agenda"
        agenda_dir.mkdir()

        mock_table = MagicMock()
        self.ingester.supabase.table = MagicMock(return_value=mock_table)
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.is_.return_value = mock_table

        # First call: meetings table returns has_agenda=true
        # Second call: agenda_items count returns 0
        mock_table.execute.side_effect = [
            MagicMock(data=[{"id": 1, "has_agenda": True}]),
            MagicMock(count=0, data=[]),
        ]

        # We expect it NOT to return None at the "already ingested" check.
        # It will proceed further and likely fail on metadata parsing,
        # which is fine — the point is it didn't short-circuit with "Skipping".
        with patch("pipeline.ingestion.ingester.parser") as mock_parser:
            mock_parser.extract_meeting_metadata.return_value = None
            result = self.ingester.process_meeting(str(tmp_path))

        # Result is None because metadata parsing failed, but we verify it
        # got PAST the "already ingested" check by confirming parser was called
        mock_parser.extract_meeting_metadata.assert_called_once()
```

Import `patch` from `unittest.mock` if not already imported (it already is in the existing file).
  </action>
  <verify>cd /Users/kyle/development/viewroyal/apps/pipeline && uv run pytest tests/ingestion/test_ingester.py::TestSelfHealingCheck -v</verify>
  <done>
    - Three tests pass covering: skip (no agenda), skip (has items), re-process (has agenda but 0 items)
    - Tests confirm the self-healing check does not short-circuit when meeting is half-ingested
  </done>
</task>

</tasks>

<verification>
1. `cd /Users/kyle/development/viewroyal/apps/pipeline && uv run pytest tests/ingestion/test_ingester.py -v` -- all existing + new tests pass
2. Verify ingester.py contains agenda_items count check in the "already ingested" block
3. Verify orchestrator.py contains GEMINI_API_KEY warning in _ingest_meetings
</verification>

<success_criteria>
- Self-healing check detects has_agenda=true + 0 agenda_items and triggers re-processing
- Missing GEMINI_API_KEY produces a clear warning in pipeline logs during ingestion phase
- All tests pass including new self-healing tests
- No regression in existing test suite
</success_criteria>

<output>
After completion, create `.planning/quick/12-investigate-and-fix-missing-agenda-items/12-SUMMARY.md`
</output>
