"""Persistent conversation history for Mai Buddy.

Stores chat turns as JSON in the application support directory so previous
conversations survive restarts.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

from .store import _config_dir  # type: ignore  # internal helper reuse


_HISTORY_FILE = _config_dir() / "history.json"
_MAX_TURNS = 200  # cap to keep file small


def load_history() -> List[Dict[str, Any]]:
    if not _HISTORY_FILE.exists():
        return []
    try:
        with _HISTORY_FILE.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, list):
            return [m for m in data if isinstance(m, dict) and "role" in m and "content" in m]
    except (OSError, json.JSONDecodeError):
        pass
    return []


def save_history(history: List[Dict[str, Any]]) -> None:
    trimmed = history[-_MAX_TURNS:]
    tmp = _HISTORY_FILE.with_suffix(".json.tmp")
    try:
        with tmp.open("w", encoding="utf-8") as fh:
            json.dump(trimmed, fh, indent=2)
        tmp.replace(_HISTORY_FILE)
    except OSError:
        pass


def clear_history() -> None:
    try:
        if _HISTORY_FILE.exists():
            _HISTORY_FILE.unlink()
    except OSError:
        pass
