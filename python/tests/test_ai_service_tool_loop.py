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


class _OneToolThenText:
    """Asks for a single tool call, then answers in text."""

    def __init__(self, name, tool_input):
        self.messages = self
        self.calls = 0
        self._name = name
        self._input = tool_input

    def create(self, **_kwargs):
        self.calls += 1
        if self.calls == 1:
            return _Resp(
                [{"type": "tool_use", "id": "t1", "name": self._name, "input": self._input}],
                "tool_use",
            )
        return _Resp([{"type": "text", "text": "done"}], "end_turn")


@pytest.mark.parametrize("tool", ["execute_command", "write_file"])
def test_side_effecting_tools_need_user_approval(service, monkeypatch, tool):
    executed = []
    monkeypatch.setattr(
        mcp_tools, "execute_tool",
        lambda name, tool_input: executed.append(name) or {"success": True, "result": "ok"},
    )
    asked = []
    service.approve_tool = lambda name, tool_input: asked.append(name) or False
    service._client = _OneToolThenText(tool, {"command": "echo hi", "path": "~/x", "content": "y"})

    service.process_message("do it")

    assert asked == [tool]
    assert executed == []  # declined -> never ran
    tool_result = service._history[-2]["content"][0]
    assert tool_result["is_error"] is True and "declined" in tool_result["content"]


def test_read_only_tools_run_without_prompt(service, monkeypatch):
    executed = []
    monkeypatch.setattr(
        mcp_tools, "execute_tool",
        lambda name, tool_input: executed.append(name) or {"success": True, "result": "ok"},
    )
    service.approve_tool = lambda *_: pytest.fail("read-only tools must not prompt")
    service._client = _OneToolThenText("read_file", {"path": "~/notes.txt"})

    service.process_message("read it")

    assert executed == ["read_file"]


def test_default_service_denies_side_effects_until_ui_installs_a_prompt(service):
    assert service.approve_tool("execute_command", {"command": "ls"}) is False
