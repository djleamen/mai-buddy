"""Mai Buddy — pywebview spike entry point.

Boots a frameless, always-on-top native webview that loads the existing
renderer (``src/renderer/index.html``) and bridges JS calls into Python via
``api.Api``.

Run from the repo root:

    cd python
    python -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    python main.py
"""

from __future__ import annotations

import logging
import sys
import threading
from pathlib import Path

import webview
from dotenv import load_dotenv

# Ensure relative imports work whether launched as a module or a script.
PYTHON_DIR = Path(__file__).resolve().parent
REPO_ROOT = PYTHON_DIR.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from python.api import Api  # noqa: E402
from python.services.hotkey_service import HotkeyService  # noqa: E402
from python.services.tray_service import TrayService  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
log = logging.getLogger("mai-buddy")


def main() -> None:
    load_dotenv(REPO_ROOT / ".env")

    index_path = REPO_ROOT / "src" / "renderer" / "index.html"
    if not index_path.exists():
        raise SystemExit(f"Renderer not found at {index_path}")

    api = Api()

    window = webview.create_window(
        title="Mai Buddy",
        url=str(index_path),
        js_api=api,
        width=400,
        height=600,
        frameless=True,
        easy_drag=False,  # honor data-pywebview-drag-region in the HTML
        on_top=True,
        transparent=True,
        resizable=True,
    )
    api.window = window

    def _show():
        try:
            window.show()
        except Exception:
            pass

    def _hide():
        try:
            window.hide()
        except Exception:
            pass

    def _toggle():
        try:
            if getattr(window, "shown", True):
                window.hide()
            else:
                window.show()
        except Exception:
            _show()

    def _quit():
        # Same rationale as Api.do_quit_app: hard-exit avoids cross-thread
        # Cocoa teardown deadlocks. History is already persisted per turn.
        import os
        log.info("quit requested via tray")
        threading.Timer(0.15, lambda: os._exit(0)).start()

    icon_path = REPO_ROOT / "assets" / "icon.png"
    tray = TrayService(icon_path, on_show=_show, on_hide=_hide,
                       on_toggle=_toggle, on_quit=_quit)
    tray.start()

    hotkey = HotkeyService(on_toggle=_toggle)
    hotkey.start("Cmd+Shift+M")

    debug = "--debug" in sys.argv or "MAI_DEBUG" in __import__("os").environ
    log.info("Starting pywebview (debug=%s)", debug)
    try:
        webview.start(debug=debug)
    finally:
        tray.stop()
        hotkey.stop()


if __name__ == "__main__":
    main()
