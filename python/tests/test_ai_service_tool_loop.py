"""The tool-use loop must not persist a dangling tool_result turn when it
hits its iteration cap.

If it did, history would end on a ``user`` (tool_result) turn; the next
``process_message`` appends a second ``user`` turn back-to-back, the Messages
API rejects the non-alternating roles, and the conversation stays broken until
history is cleared manually. These tests pin history to alternating roles.
"""
import sys
import types

import pytest

# CI installs only pytest, so stub the anthropic SDK before importing the
# service (it does ``from anthropic import Anthropic`` at module load).
if "anthropic" not in sys.modules:
    _stub = types.ModuleType("anthropic")
    _stub.Anthropic = type("Anthropic", (), {"__init__": lambda self, *a, **k: None})
    sys.modules["anthropic"] = _stub

from python.services import ai_service, history_store, mcp_tools, store  # noqa: E402


class _Resp:
    """Minimal stand-in for an Anthropic Messages response."""

    def __init__(self, content, stop_reason):
        self.content = content
        self.stop_reason = stop_reason
        self.model = "fake-model"
        self.usage = None


class _AlwaysToolUse:
    """A client whose every turn asks for another tool call, so the loop can
    only ever exit through the iteration cap."""

    def __init__(self):
        self.messages = self
        self.calls = 0

    def create(self, **_kwargs):
        self.calls += 1
        return _Resp(
            [{"type": "tool_use", "id": f"t{self.calls}", "name": "noop", "input": {}}],
            "tool_use",
        )


@pytest.fixture
def service(monkeypatch):
    # Isolate construction from disk, the keychain, and the real SDK.
    monkeypatch.setattr(history_store, "load_history", lambda: [])
    monkeypatch.setattr(history_store, "save_history", lambda history: None)
    monkeypatch.setattr(store, "get_settings", lambda: {})
    monkeypatch.setattr(store, "get_api_key", lambda: "")
    monkeypatch.setattr(mcp_tools, "anthropic_tools", lambda: [])
    monkeypatch.setattr(
        mcp_tools, "execute_tool", lambda name, tool_input: {"success": True, "result": "ok"}
    )

    svc = ai_service.AIService()
    svc._client = _AlwaysToolUse()
    svc._history = []
    return svc


def _has_consecutive_user_turns(history):
    return any(
        history[i]["role"] == "user" and history[i + 1]["role"] == "user"
        for i in range(len(history) - 1)
    )


def test_capped_loop_ends_history_on_assistant_turn(service):
    result = service.process_message("hello")

    assert result["success"] is True
    # The loop ran the full cap (always asking for a tool) ...
    assert service._client.calls == ai_service.MAX_TOOL_ITERATIONS
    # ... and history must not be left ending on a tool_result (user) turn.
    assert service._history[-1]["role"] == "assistant"
    assert not _has_consecutive_user_turns(service._history)


def test_second_message_after_capped_loop_stays_alternating(service):
    # A capped loop followed by another message is exactly the sequence that
    # used to produce two back-to-back user turns and brick the conversation.
    service.process_message("first")
    service.process_message("second")

    assert not _has_consecutive_user_turns(service._history)
    assert service._history[-1]["role"] == "assistant"
