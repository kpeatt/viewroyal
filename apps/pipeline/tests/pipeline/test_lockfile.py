"""Tests for PipelineLock concurrency protection."""

import os
import subprocess
import sys

import pytest

from pipeline.lockfile import PipelineLock


class TestPipelineLock:
    """Test suite for PipelineLock context manager."""

    def test_acquires_lock_successfully(self, tmp_path):
        """Lock can be acquired and released without error."""
        lock_path = str(tmp_path / "test.lock")
        with PipelineLock(lock_path=lock_path):
            assert os.path.exists(lock_path)
            # Lock file should contain our PID
            with open(lock_path) as f:
                assert f.read().strip() == str(os.getpid())

    def test_contention_exits_cleanly(self, tmp_path):
        """A second lock attempt while the first is held exits with code 0."""
        lock_path = str(tmp_path / "test.lock")

        with PipelineLock(lock_path=lock_path):
            # Spawn a subprocess that tries to acquire the same lock
            result = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    f"""
import sys
sys.path.insert(0, '{os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))}')
from pipeline.lockfile import PipelineLock
with PipelineLock(lock_path="{lock_path}"):
    pass
""",
                ],
                capture_output=True,
                text=True,
                cwd=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            )
            # Should exit cleanly (code 0), not crash
            assert result.returncode == 0
            assert "Another pipeline run is in progress" in result.stdout

    def test_lock_released_after_exit(self, tmp_path):
        """After the first lock is released, a second attempt succeeds."""
        lock_path = str(tmp_path / "test.lock")

        # First acquisition
        with PipelineLock(lock_path=lock_path):
            pass  # Lock released on exit

        # Second acquisition should succeed
        with PipelineLock(lock_path=lock_path):
            with open(lock_path) as f:
                assert f.read().strip() == str(os.getpid())

    def test_lock_released_on_exception(self, tmp_path):
        """Lock is released even if an exception occurs inside the context."""
        lock_path = str(tmp_path / "test.lock")

        with pytest.raises(RuntimeError, match="boom"):
            with PipelineLock(lock_path=lock_path):
                raise RuntimeError("boom")

        # Lock should be available again
        with PipelineLock(lock_path=lock_path):
            pass  # Should not raise

    def test_creates_directory_if_missing(self, tmp_path):
        """Lock file directory is created automatically."""
        lock_path = str(tmp_path / "nested" / "dir" / "test.lock")
        with PipelineLock(lock_path=lock_path):
            assert os.path.exists(lock_path)
