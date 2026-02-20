"""
File-based lock for pipeline concurrency protection.

Uses fcntl.flock() to ensure only one pipeline instance runs at a time.
The lock is automatically released if the process crashes or is killed
(the OS releases flock when the file descriptor is closed).
"""

import fcntl
import os
import sys

from pipeline.paths import LOGS_DIR

DEFAULT_LOCK_PATH = os.path.join(LOGS_DIR, "pipeline.lock")


class PipelineLock:
    """Context manager that acquires an exclusive file lock.

    If another pipeline instance holds the lock, prints a message and
    exits cleanly with code 0 (not an error -- just a no-op).

    Args:
        lock_path: Path to the lock file. Defaults to LOGS_DIR/pipeline.lock.
    """

    def __init__(self, lock_path: str | None = None):
        self.lock_path = lock_path or DEFAULT_LOCK_PATH
        self._fd = None

    def __enter__(self):
        # Ensure the directory exists
        os.makedirs(os.path.dirname(self.lock_path), exist_ok=True)

        self._fd = open(self.lock_path, "w")
        try:
            fcntl.flock(self._fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (BlockingIOError, OSError):
            self._fd.close()
            self._fd = None
            print("[!] Another pipeline run is in progress. Exiting.")
            sys.exit(0)

        # Write PID for debugging
        self._fd.write(str(os.getpid()))
        self._fd.flush()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._fd is not None:
            fcntl.flock(self._fd, fcntl.LOCK_UN)
            self._fd.close()
            self._fd = None
        return False
