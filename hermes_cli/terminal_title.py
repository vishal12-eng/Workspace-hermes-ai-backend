"""Best-effort terminal tab and window title updates for the classic CLI."""

from __future__ import annotations

import os
import re
import sys
import threading
from typing import TextIO


_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f-\x9f]")
_MAX_TITLE_LENGTH = 200
_WRITE_LOCK = threading.Lock()


def sanitize_terminal_title(value: object) -> str:
    """Return a printable, bounded title that cannot inject terminal escapes."""
    text = _CONTROL_CHARS.sub("", str(value or ""))
    return " ".join(text.split())[:_MAX_TITLE_LENGTH]


def terminal_title_symbol(response_label: object, fallback: str = "⚕") -> str:
    """Extract the skin's leading symbol from its response-panel label."""
    label = sanitize_terminal_title(response_label)
    return label.split(maxsplit=1)[0] if label else fallback


def compose_terminal_title(
    response_label: object,
    session_title: object = "",
    *,
    busy: bool = False,
) -> str:
    """Compose the short tab title for an idle or active classic CLI session."""
    parts = [terminal_title_symbol(response_label)]
    title = sanitize_terminal_title(session_title)
    if title:
        parts.append(title)
    if busy:
        parts.append("⏳")
    return " ".join(parts)


def write_terminal_title(title: object, stream: TextIO | None = None) -> bool:
    """Emit OSC 1/2 title updates when stdout is an interactive terminal.

    OSC 1 updates a terminal icon/tab label and OSC 2 updates the window title.
    Unsupported terminals safely ignore both sequences. The writer deliberately
    avoids logging failures because it may be called from an agent callback.
    """
    if os.environ.get("TERM", "").lower() == "dumb":
        return False

    output = stream if stream is not None else sys.stdout
    try:
        if output is None or not output.isatty():
            return False
        clean_title = sanitize_terminal_title(title)
        if not clean_title:
            return False
        with _WRITE_LOCK:
            output.write(f"\033]1;{clean_title}\a\033]2;{clean_title}\a")
            output.flush()
        return True
    except Exception:
        return False
