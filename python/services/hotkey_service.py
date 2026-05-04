"""Global keyboard shortcut listener (Cmd+Shift+M by default).

Uses ``pynput``. On macOS this requires Accessibility permission for the
launching terminal/IDE. Fails gracefully if pynput is missing or perms are
denied.
"""

from __future__ import annotations

import logging
import threading
from typing import Callable, Optional

log = logging.getLogger("mai-buddy.hotkey")


# Map a small subset of human-friendly accelerators to pynput's notation.
def _to_pynput(combo: str) -> str:
    parts = [p.strip().lower() for p in combo.split("+") if p.strip()]
    out: list[str] = []
    for p in parts:
        if p in ("cmd", "command", "meta", "win", "super"):
            out.append("<cmd>")
        elif p in ("ctrl", "control"):
            out.append("<ctrl>")
        elif p in ("shift",):
            out.append("<shift>")
        elif p in ("alt", "option", "opt"):
            out.append("<alt>")
        elif len(p) == 1:
            out.append(p)
        else:
            out.append(f"<{p}>")
    return "+".join(out)


class HotkeyService:
    def __init__(self, on_toggle: Callable[[], None]) -> None:
        self.on_toggle = on_toggle
        self._listener = None
        self._thread: Optional[threading.Thread] = None
        self._combo: str = "<cmd>+<shift>+m"

    def start(self, combo: str = "Cmd+Shift+M") -> None:
        try:
            from pynput import keyboard  # type: ignore
        except ImportError:
            log.warning("pynput not installed; global hotkey disabled")
            return

        self._combo = _to_pynput(combo)

        def _on_activate():
            try:
                self.on_toggle()
            except Exception:
                log.exception("hotkey toggle failed")

        def _run():
            try:
                with keyboard.GlobalHotKeys({self._combo: _on_activate}) as listener:
                    self._listener = listener
                    listener.join()
            except Exception:
                log.exception("hotkey listener crashed (Accessibility permission?)")

        self._thread = threading.Thread(target=_run, name="mai-buddy-hotkey", daemon=True)
        self._thread.start()
        log.info("Global hotkey listening on %s", self._combo)

    def stop(self) -> None:
        if self._listener is not None:
            try:
                self._listener.stop()
            except Exception:
                pass
