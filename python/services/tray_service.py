"""System tray (menu-bar) icon for Mai Buddy.

On macOS we MUST call ``pystray.Icon.run_detached()`` from the main thread
*before* ``webview.start()`` so the single shared NSApplication run loop
services both the webview window and the status-bar icon. Running
``icon.run()`` from a background thread creates a competing NSApp and causes
``webview.start()`` to return immediately without ever showing a window.

On other platforms we keep the legacy "run on a daemon thread" behaviour.
Optional — if pystray or Pillow isn't available, ``start`` is a no-op.
"""

from __future__ import annotations

import logging
import sys
import threading
from pathlib import Path
from typing import Callable, Optional

log = logging.getLogger("mai-buddy.tray")


class TrayService:
    def __init__(
        self,
        icon_path: Path,
        on_show: Callable[[], None],
        on_hide: Callable[[], None],
        on_toggle: Callable[[], None],
        on_quit: Callable[[], None],
    ) -> None:
        self.icon_path = icon_path
        self.on_show = on_show
        self.on_hide = on_hide
        self.on_toggle = on_toggle
        self.on_quit = on_quit
        self._icon = None
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        try:
            import pystray  # type: ignore
            from PIL import Image  # type: ignore
        except ImportError:
            log.warning("pystray/Pillow not installed; tray disabled")
            return

        try:
            image = Image.open(self.icon_path)
        except Exception as exc:
            log.warning("Could not load tray icon %s: %s", self.icon_path, exc)
            image = Image.new("RGBA", (64, 64), (74, 144, 226, 255))

        def _toggle(_icon, _item):
            try:
                self.on_toggle()
            except Exception:
                log.exception("tray toggle failed")

        def _show(_icon, _item):
            try:
                self.on_show()
            except Exception:
                log.exception("tray show failed")

        def _hide(_icon, _item):
            try:
                self.on_hide()
            except Exception:
                log.exception("tray hide failed")

        def _quit(icon, _item):
            try:
                self.on_quit()
            finally:
                icon.stop()

        menu = pystray.Menu(
            pystray.MenuItem("Show / Hide", _toggle, default=True),
            pystray.MenuItem("Show", _show),
            pystray.MenuItem("Hide", _hide),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Quit", _quit),
        )
        self._icon = pystray.Icon("mai-buddy", image, "Mai Buddy", menu)

        if sys.platform == "darwin":
            # Run on the main thread; pywebview's NSApp run loop will service it.
            try:
                self._icon.run_detached()
                log.info("Tray icon started (detached, main thread)")
            except Exception:
                log.exception("tray run_detached failed")
            return

        def _run():
            try:
                self._icon.run()
            except Exception:
                log.exception("tray icon crashed")

        self._thread = threading.Thread(target=_run, name="mai-buddy-tray", daemon=True)
        self._thread.start()
        log.info("Tray icon started")

    def stop(self) -> None:
        if self._icon is not None:
            try:
                self._icon.stop()
            except Exception:
                pass
