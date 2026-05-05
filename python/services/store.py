"""Persistent settings + secret storage for the pywebview spike.

Settings (non-secret) live in ``~/Library/Application Support/mai-buddy/settings.json``
on macOS. Secrets (API keys) are stored in the OS keychain via ``keyring``.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict

try:
    import keyring  # type: ignore
except ImportError:  # pragma: no cover - keyring optional in dev
    keyring = None  # type: ignore

KEYRING_SERVICE = "mai-buddy"
SECRET_KEYS = (
    "apiKey",
    "anthropicApiKey",
    "openaiApiKey",
    "elevenLabsApiKey",
    "githubToken",
)


def _config_dir() -> Path:
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    elif os.name == "nt":
        base = Path(os.environ.get("APPDATA", Path.home()))
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    path = base / "mai-buddy"
    path.mkdir(parents=True, exist_ok=True)
    return path


_SETTINGS_FILE = _config_dir() / "settings.json"


def _load_raw() -> Dict[str, Any]:
    if not _SETTINGS_FILE.exists():
        return {}
    try:
        with _SETTINGS_FILE.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}


def _save_raw(data: Dict[str, Any]) -> None:
    tmp = _SETTINGS_FILE.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
    tmp.replace(_SETTINGS_FILE)


def _get_secret(name: str) -> str:
    if keyring is None:
        return ""
    try:
        return keyring.get_password(KEYRING_SERVICE, name) or ""
    except Exception:
        return ""


def _set_secret(name: str, value: str) -> None:
    if keyring is None or not value:
        return
    try:
        keyring.set_password(KEYRING_SERVICE, name, value)
    except Exception:
        pass


def get_settings() -> Dict[str, Any]:
    """Return settings with secrets reattached from the keychain."""
    data = _load_raw()
    defaults: Dict[str, Any] = {
        "provider": "anthropic",
        "apiKey": "",
        "anthropicApiKey": "",
        "openaiApiKey": "",
        "elevenLabsApiKey": "",
        "aiModel": "claude-sonnet-4-5",
        "model": "claude-sonnet-4-5",
        "voice": "Rachel",
        "voiceId": "Rachel",
        "voiceStability": 0.5,
        "autoSpeak": False,
        "startOnBoot": False,
        "minimizeToTray": True,
        "alwaysOnTop": True,
        "systemPrompt": "",
    }
    merged: Dict[str, Any] = {**defaults, **data}
    for key in SECRET_KEYS:
        secret = _get_secret(key)
        if secret:
            merged[key] = secret
    # The renderer status check reads `apiKey`; the settings form writes
    # `anthropicApiKey`. Keep them aligned (preferring anthropic).
    if not merged.get("apiKey"):
        merged["apiKey"] = merged.get("anthropicApiKey") or merged.get("openaiApiKey") or ""
    return merged


def save_settings(settings: Dict[str, Any]) -> None:
    """Persist settings, keeping secrets out of the JSON file."""
    sanitised: Dict[str, Any] = {}
    for key, value in (settings or {}).items():
        if key in SECRET_KEYS:
            _set_secret(key, str(value or ""))
            continue
        sanitised[key] = value
    # Mirror the active provider key into the `apiKey` slot in the keychain
    # so the renderer's connection-status check works without further edits.
    if settings:
        primary = settings.get("anthropicApiKey") or settings.get("openaiApiKey")
        if primary:
            _set_secret("apiKey", str(primary))
    _save_raw(sanitised)


def get_api_key() -> str:
    """Best-effort lookup of the active Anthropic key for AI calls."""
    return (
        _get_secret("anthropicApiKey")
        or _get_secret("apiKey")
        or os.environ.get("ANTHROPIC_API_KEY", "")
    )


def update_settings(partial: Dict[str, Any]) -> Dict[str, Any]:
    """Merge ``partial`` into stored settings without dropping other keys.

    Secret keys are routed to the keychain; everything else is merged into the
    JSON file. Returns the resulting settings dict (with secrets reattached).
    """
    if not partial:
        return get_settings()
    raw = _load_raw()
    for key, value in partial.items():
        if key in SECRET_KEYS:
            _set_secret(key, str(value or ""))
            continue
        raw[key] = value
    _save_raw(raw)
    return get_settings()


def has_secret(name: str) -> bool:
    return bool(_get_secret(name))
