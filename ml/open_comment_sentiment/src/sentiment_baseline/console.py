"""Console helpers shared by the offline pipeline scripts."""

from __future__ import annotations

import sys


def force_utf8_output() -> None:
    """Make stdout/stderr UTF-8 so Vietnamese text cannot crash on Windows.

    Windows consoles, redirected output and test runners often default to cp1252,
    where any non-ASCII character raises UnicodeEncodeError on print. Reconfiguring
    is best-effort: streams that do not support it are left untouched.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            continue
