"""JS-facing API exposed to the renderer through pywebview.

The renderer uses Electron-style ``ipcRenderer.invoke('channel', ...args)``
calls. ``pywebview-bridge.js`` forwards every call to ``Api.invoke`` here, which
dispatches to the matching handler. New channels can be added by defining a
``do_<snake_channel>`` method on this class.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Optional

from .services import mcp_tools, store
from .services.ai_service import AIService

log = logging.getLogger("mai-buddy.api")


class Api:
    def __init__(self) -> None:
        self.window = None
        self.ai = AIService()
        self.quit_callback: Optional[Callable[[], None]] = None

    def _channel_to_method(self, channel: str) -> str:
        return "do_" + channel.replace("-", "_")

    def invoke(self, channel: str, args: List[Any] | None = None) -> Any:
        """Single dispatcher called from JS."""
        args = args or []
        method_name = self._channel_to_method(channel)
        handler = getattr(self, method_name, None)
        if handler is None:
            log.warning("Unhandled IPC channel: %s", channel)
            return {"success": False, "error": f"Unknown channel: {channel}"}
        try:
            return handler(*args)
        except Exception as exc:  # pragma: no cover
            log.exception("Handler %s failed", channel)
            return {"success": False, "error": str(exc)}

    def do_get_settings(self) -> Dict[str, Any]:
        return store.get_settings()

    def do_save_settings(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        store.save_settings(settings or {})
        self.ai.reload()
        if self.window is not None:
            try:
                self.window.on_top = bool(settings.get("alwaysOnTop", True))
            except Exception:
                pass
        return {"success": True}

    def do_send_message(self, message: str) -> Dict[str, Any]:
        return self.ai.process_message(message or "")

    def do_clear_conversation(self) -> Dict[str, Any]:
        self.ai.clear_history()
        return {"success": True}

    def do_get_conversation_history(self) -> Dict[str, Any]:
        return {"success": True, "history": self.ai.get_history()}

    def do_mcp_get_connections(self) -> Dict[str, Any]:
        connections = mcp_tools.list_connections()
        return {
            "success": True,
            "connections": connections,
            "stats": {"total": len(connections), "connected": len(connections)},
        }

    def do_mcp_get_available_types(self) -> Dict[str, Any]:
        return {"success": True, "types": mcp_tools.list_available_types()}

    def do_mcp_get_connection_schema(self, type_or_id: str | None = None) -> Dict[str, Any]:
        return {"success": True, "schema": mcp_tools.get_connection_schema(type_or_id or "")}

    def do_mcp_save_connection_config(
        self, type_or_id: str | None = None, values: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        return mcp_tools.save_connection_config(type_or_id or "", values or {})

    def do_mcp_add_connection(self, *_args: Any) -> Dict[str, Any]:
        return {"success": True}

    def do_mcp_remove_connection(self, *_args: Any) -> Dict[str, Any]:
        return {"success": True}

    def do_mcp_test_connection(self, connection_id: str | None = None) -> Dict[str, Any]:
        # Renderer expects {success, result: {success, message}}.
        try:
            inner = mcp_tools.test_connection(connection_id or "")
        except Exception as exc:
            log.exception("mcp test_connection failed")
            inner = {"success": False, "message": str(exc)}
        return {"success": True, "result": inner, "id": connection_id}

    def do_mcp_get_tools(self, connection_type: str | None = None) -> Dict[str, Any]:
        return {"success": True, "tools": mcp_tools.list_tools(connection_type)}

    def do_mcp_execute_tool(self, name: str, params: Dict[str, Any] | None = None) -> Dict[str, Any]:
        return mcp_tools.execute_tool(name, params or {})

    def do_mcp_reconnect_all(self) -> Dict[str, Any]:
        return {"success": True}

    def do_text_to_speech(self, *_args: Any) -> Dict[str, Any]:
        return {"success": False, "error": "Voice not implemented in spike"}

    def do_start_listening(self) -> Dict[str, Any]:
        return {"success": False, "error": "Voice not implemented in spike"}

    def do_stop_listening(self) -> Dict[str, Any]:
        return {"success": True}

    def do_get_available_voices(self) -> Dict[str, Any]:
        return {"success": True, "voices": []}

    def do_hide_window(self) -> Dict[str, Any]:
        if self.window is not None:
            try:
                self.window.hide()
            except Exception:
                pass
        return {"success": True}

    def do_show_window(self) -> Dict[str, Any]:
        if self.window is not None:
            try:
                self.window.show()
            except Exception:
                pass
        return {"success": True}

    def do_toggle_window(self) -> Dict[str, Any]:
        if self.window is None:
            return {"success": False}
        try:
            shown = bool(getattr(self.window, "shown", True))
            if shown:
                self.window.hide()
            else:
                self.window.show()
        except Exception:
            try:
                self.window.show()
            except Exception:
                pass
        return {"success": True}

    def do_show_settings(self) -> Dict[str, Any]:
        return {"success": True}

    def do_show_mcp_manager(self) -> Dict[str, Any]:
        return {"success": True}

    def do_quit_app(self) -> Dict[str, Any]:
        # Cocoa requires window.destroy() and NSStatusItem teardown on the main
        # thread, but we're being called from the JS bridge worker thread, so a
        # cooperative shutdown deadlocks the NSApp run loop. History is already
        # persisted after every turn, so a hard exit is safe and reliable.
        import os, threading
        log.info("quit requested; exiting process")
        threading.Timer(0.15, lambda: os._exit(0)).start()
        return {"success": True}
