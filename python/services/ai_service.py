"""Anthropic Claude wrapper with persistent history + MCP tool-use loop.

Mirrors the response shape of the Electron ``send-message`` IPC handler so
the existing renderer (``src/renderer/renderer.js``) consumes it without
changes.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from anthropic import Anthropic

from . import history_store, mcp_tools, store

log = logging.getLogger("mai-buddy.ai")

DEFAULT_MODEL = "claude-sonnet-4-5"
DEFAULT_MAX_TOKENS = 1024
MAX_HISTORY_TURNS = 20
MAX_TOOL_ITERATIONS = 5


class AIService:
    def __init__(self) -> None:
        self._client: Anthropic | None = None
        self._model: str = DEFAULT_MODEL
        # Content can be a string (simple turn) or an Anthropic content-block
        # list when tool use occurred — both are valid Messages API inputs.
        self._history: List[Dict[str, Any]] = history_store.load_history()
        self._system_prompt: str = (
            "You are Mai Buddy, a helpful, friendly desktop AI assistant. "
            "Keep responses concise. You have access to local filesystem, "
            "shell, and GitHub tools — use them when the user asks for "
            "actions on their machine or repos."
        )
        self.reload()

    def reload(self) -> None:
        settings = store.get_settings()
        self._model = (
            settings.get("aiModel") or settings.get("model") or DEFAULT_MODEL
        )
        custom_prompt = (settings.get("systemPrompt") or "").strip()
        if custom_prompt:
            self._system_prompt = custom_prompt
        api_key = store.get_api_key()
        self._client = Anthropic(api_key=api_key) if api_key else None

    def clear_history(self) -> None:
        self._history.clear()
        history_store.clear_history()

    def get_history(self) -> List[Dict[str, Any]]:
        """Renderer-friendly history view (string content only)."""
        out: List[Dict[str, Any]] = []
        for m in self._history:
            content = m.get("content")
            if isinstance(content, str):
                out.append({"role": m["role"], "content": content})
            elif isinstance(content, list):
                text = "".join(
                    b.get("text", "") for b in content
                    if isinstance(b, dict) and b.get("type") == "text"
                )
                if text:
                    out.append({"role": m["role"], "content": text})
        return out

    def process_message(self, message: str) -> Dict[str, Any]:
        if not self._client:
            return {
                "success": False,
                "error": "Anthropic API key not configured. Please set it in settings.",
            }

        original_len = len(self._history)
        self._history.append({"role": "user", "content": message})

        state: Dict[str, Any] = {
            "tool_executed": False,
            "tool_error": None,
            "last_tool_result": None,
            "usage_in": 0,
            "usage_out": 0,
            "last_model": self._model,
            "reply_text": "",
        }

        try:
            self._run_tool_loop(state)
        except Exception as exc:
            log.exception("Anthropic call failed")
            del self._history[original_len:]
            return {"success": False, "error": str(exc)}

        history_store.save_history(self._history)

        return {
            "success": True,
            "response": state["reply_text"],
            "model": state["last_model"],
            "usage": {
                "prompt_tokens": state["usage_in"],
                "completion_tokens": state["usage_out"],
                "total_tokens": state["usage_in"] + state["usage_out"],
            },
            "toolExecuted": state["tool_executed"],
            "toolError": state["tool_error"],
            "toolResult": state["last_tool_result"] if state["tool_executed"] else None,
        }

    def _run_tool_loop(self, state: Dict[str, Any]) -> None:
        tools = mcp_tools.anthropic_tools()
        for _ in range(MAX_TOOL_ITERATIONS):
            response = self._client.messages.create(
                model=self._model,
                max_tokens=DEFAULT_MAX_TOKENS,
                system=self._system_prompt,
                messages=self._history[-MAX_HISTORY_TURNS:],
                tools=tools,
            )
            state["last_model"] = getattr(response, "model", self._model)
            self._accumulate_usage(response, state)

            assistant_blocks = [
                b.model_dump() if hasattr(b, "model_dump") else dict(b)
                for b in (response.content or [])
            ]
            self._history.append({"role": "assistant", "content": assistant_blocks})

            if getattr(response, "stop_reason", None) != "tool_use":
                state["reply_text"] = _extract_text(assistant_blocks)
                return

            tool_results = self._handle_tool_uses(assistant_blocks, state)
            if not tool_results:
                return
            self._history.append({"role": "user", "content": tool_results})
        else:
            state["reply_text"] = state["reply_text"] or "(tool-use loop exceeded iteration cap)"

    @staticmethod
    def _accumulate_usage(response: Any, state: Dict[str, Any]) -> None:
        u = getattr(response, "usage", None)
        if not u:
            return
        state["usage_in"] += getattr(u, "input_tokens", 0) or 0
        state["usage_out"] += getattr(u, "output_tokens", 0) or 0

    @staticmethod
    def _handle_tool_uses(
        assistant_blocks: List[Dict[str, Any]], state: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        tool_results: List[Dict[str, Any]] = []
        for block in assistant_blocks:
            if block.get("type") != "tool_use":
                continue
            state["tool_executed"] = True
            name = block.get("name", "")
            tool_input = block.get("input") or {}
            log.info("AI invoking tool %s with %s", name, tool_input)
            res = mcp_tools.execute_tool(name, tool_input)
            state["last_tool_result"] = res
            if not res.get("success"):
                state["tool_error"] = res.get("error")
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.get("id"),
                "content": str(
                    res.get("result") if res.get("success")
                    else f"Error: {res.get('error')}"
                ),
                "is_error": not res.get("success"),
            })
        return tool_results


def _extract_text(blocks: List[Dict[str, Any]]) -> str:
    return "".join(
        b.get("text", "") for b in blocks if b.get("type") == "text"
    )
