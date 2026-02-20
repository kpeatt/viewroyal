"""
Logging configuration for unattended pipeline runs.

Configures a rotating file handler (5 MB, 5 backups) and a console handler.
Also redirects stdout through a TeeStream so that existing print() calls
are captured in the log file without modifying every source file.
"""

import logging
import os
import sys
from logging.handlers import RotatingFileHandler

from pipeline.paths import LOGS_DIR

LOG_FILE = os.path.join(LOGS_DIR, "pipeline.log")
LOG_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"
LOG_DATEFMT = "%Y-%m-%d %H:%M:%S"
MAX_BYTES = 5 * 1024 * 1024  # 5 MB
BACKUP_COUNT = 5


class TeeStream:
    """Wraps a stream so writes go to both the original stream and a log file stream."""

    def __init__(self, original, log_stream):
        self._original = original
        self._log_stream = log_stream

    def write(self, data):
        self._original.write(data)
        try:
            self._log_stream.write(data)
            self._log_stream.flush()
        except Exception:
            pass  # Don't let log I/O errors break the pipeline

    def flush(self):
        self._original.flush()
        try:
            self._log_stream.flush()
        except Exception:
            pass

    def fileno(self):
        return self._original.fileno()

    def isatty(self):
        return self._original.isatty()

    # Delegate any other attribute access to the original stream
    def __getattr__(self, name):
        return getattr(self._original, name)


def setup_logging():
    """Configure root logger with rotating file + console handlers and stdout tee."""
    os.makedirs(LOGS_DIR, exist_ok=True)

    # -- Rotating file handler --
    file_handler = RotatingFileHandler(
        LOG_FILE, maxBytes=MAX_BYTES, backupCount=BACKUP_COUNT
    )
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=LOG_DATEFMT))

    # -- Console handler (stderr) --
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=LOG_DATEFMT))

    # -- Root logger --
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    # Remove any existing handlers to avoid duplicates on re-init
    root_logger.handlers.clear()
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

    # -- Tee stdout so print() output lands in the log file --
    sys.stdout = TeeStream(sys.__stdout__, file_handler.stream)
