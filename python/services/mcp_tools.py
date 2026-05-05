"""Local MCP-style tool registry for the pywebview port.

Mirrors the subset of ``src/main/services/mcp-tools.js`` that the
copilot-instructions identify as functional: filesystem, terminal (shell),
and a small slice of GitHub. Each tool is exposed both to the renderer's MCP
manager UI and (in Anthropic tool-use schema) to the AI service.
"""

from __future__ import annotations

import logging
import os
import shlex
import subprocess
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from . import store

log = logging.getLogger("mai-buddy.mcp")

_PROTECTED_ROOTS = (
    "/System", "/etc", "/usr", "/private", "/Library",
    "/bin", "/sbin", "/var", "/dev", "/boot", "/proc", "/sys",
)

def _expand(p: str) -> str:
    return os.path.expanduser(p) if p else p

def _assert_safe_write_path(raw: str) -> Path:
    if not isinstance(raw, str) or not raw:
        raise ValueError("Invalid path")
    resolved = Path(_expand(raw)).resolve()
    home = Path.home().resolve()
    s = str(resolved)
    if s in ("", "/"):
        raise ValueError(f"Refusing to operate on filesystem root: {s}")
    for root in _PROTECTED_ROOTS:
        if s == root or s.startswith(root + os.sep):
            raise ValueError(f"Refusing to operate on protected path: {s}")
    if resolved != home and home not in resolved.parents:
        raise ValueError(f"Path is outside the user home directory: {s}")
    return resolved

def _read_file(path: str, encoding: str = "utf-8") -> Dict[str, Any]:
    expanded = _expand(path)
    with open(expanded, "r", encoding=encoding) as fh:
        return {"content": fh.read(), "path": expanded}

def _write_file(path: str, content: str, encoding: str = "utf-8") -> Dict[str, Any]:
    safe = _assert_safe_write_path(path)
    safe.parent.mkdir(parents=True, exist_ok=True)
    with open(safe, "w", encoding=encoding) as fh:
        fh.write(content or "")
    return {"path": str(safe), "bytes": len(content or "")}

def _list_directory(path: str) -> Dict[str, Any]:
    expanded = _expand(path)
    entries = []
    for entry in sorted(os.listdir(expanded)):
        full = os.path.join(expanded, entry)
        try:
            stat = os.stat(full)
        except OSError:
            continue
        entries.append({
            "name": entry,
            "type": "directory" if os.path.isdir(full) else "file",
            "size": stat.st_size,
            "modified": stat.st_mtime,
        })
    return {"path": expanded, "entries": entries}

def _execute_command(command: str, timeout: int = 30) -> Dict[str, Any]:
    if not command or not isinstance(command, str):
        raise ValueError("command is required")
    # Run via shell so users can pipe; this is the same trust model as the
    # Node version. Tools should never be invoked without explicit user opt-in.
    proc = subprocess.run(
        command, shell=True, capture_output=True, text=True, timeout=timeout
    )
    return {
        "command": command,
        "exit_code": proc.returncode,
        "stdout": proc.stdout[-20000:],
        "stderr": proc.stderr[-20000:],
    }

def _github_headers() -> Dict[str, str]:
    settings = store.get_settings()
    token = settings.get("githubToken") or os.environ.get("GITHUB_TOKEN", "")
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "mai-buddy",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers

def _gh_get(path: str, params: Optional[Dict[str, Any]] = None) -> Any:
    import requests  # imported lazily so the rest of the app works without it

    resp = requests.get(
        f"https://api.github.com{path}",
        headers=_github_headers(),
        params=params or {},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()

def _github_list_repos(username: str | None = None, per_page: int = 30) -> Dict[str, Any]:
    path = f"/users/{username}/repos" if username else "/user/repos"
    data = _gh_get(path, {"per_page": per_page, "sort": "updated"})
    return {"repositories": [
        {"full_name": r.get("full_name"), "description": r.get("description"),
         "html_url": r.get("html_url"), "private": r.get("private"),
         "stargazers_count": r.get("stargazers_count")}
        for r in data
    ]}

def _github_get_repo(owner: str, repo: str) -> Dict[str, Any]:
    return _gh_get(f"/repos/{owner}/{repo}")

def _github_list_issues(owner: str, repo: str, state: str = "open", per_page: int = 30) -> Dict[str, Any]:
    data = _gh_get(f"/repos/{owner}/{repo}/issues", {"state": state, "per_page": per_page})
    return {"issues": [
        {"number": i.get("number"), "title": i.get("title"), "state": i.get("state"),
         "html_url": i.get("html_url"), "user": (i.get("user") or {}).get("login")}
        for i in data if "pull_request" not in i
    ]}

def _github_search_code(q: str, per_page: int = 20) -> Dict[str, Any]:
    import requests
    resp = requests.get(
        "https://api.github.com/search/code",
        headers=_github_headers(),
        params={"q": q, "per_page": per_page},
        timeout=15,
    )
    resp.raise_for_status()
    items = resp.json().get("items", [])
    return {"results": [
        {"name": i.get("name"), "path": i.get("path"),
         "repository": (i.get("repository") or {}).get("full_name"),
         "html_url": i.get("html_url")} for i in items
    ]}

class Tool:
    __slots__ = ("name", "type", "description", "schema", "handler")

    def __init__(
        self,
        name: str,
        type_: str,
        description: str,
        schema: Dict[str, Any],
        handler: Callable[..., Any],
    ) -> None:
        self.name = name
        self.type = type_
        self.description = description
        self.schema = schema
        self.handler = handler

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "type": self.type,
            "description": self.description,
            "inputSchema": self.schema,
        }

def _build_registry() -> Dict[str, Tool]:
    tools: List[Tool] = [
        Tool("read_file", "filesystem", "Read content from a file",
             {"type": "object", "properties": {
                 "path": {"type": "string", "description": "Absolute or ~-expanded path"},
                 "encoding": {"type": "string", "default": "utf-8"},
             }, "required": ["path"]},
             _read_file),
        Tool("write_file", "filesystem", "Write content to a file (within home dir)",
             {"type": "object", "properties": {
                 "path": {"type": "string"},
                 "content": {"type": "string"},
                 "encoding": {"type": "string", "default": "utf-8"},
             }, "required": ["path", "content"]},
             _write_file),
        Tool("list_directory", "filesystem", "List contents of a directory",
             {"type": "object", "properties": {"path": {"type": "string"}},
              "required": ["path"]},
             _list_directory),
        Tool("execute_command", "system", "Execute a shell command",
             {"type": "object", "properties": {
                 "command": {"type": "string"},
                 "timeout": {"type": "integer", "default": 30},
             }, "required": ["command"]},
             _execute_command),
        Tool("github_list_repos", "github", "List GitHub repositories for the authenticated user or a username",
             {"type": "object", "properties": {
                 "username": {"type": "string"},
                 "per_page": {"type": "integer", "default": 30},
             }},
             _github_list_repos),
        Tool("github_get_repo", "github", "Get repository information",
             {"type": "object", "properties": {
                 "owner": {"type": "string"}, "repo": {"type": "string"},
             }, "required": ["owner", "repo"]},
             _github_get_repo),
        Tool("github_list_issues", "github", "List issues in a repository",
             {"type": "object", "properties": {
                 "owner": {"type": "string"}, "repo": {"type": "string"},
                 "state": {"type": "string", "default": "open"},
                 "per_page": {"type": "integer", "default": 30},
             }, "required": ["owner", "repo"]},
             _github_list_issues),
        Tool("github_search_code", "github", "Search for code in GitHub",
             {"type": "object", "properties": {
                 "q": {"type": "string"},
                 "per_page": {"type": "integer", "default": 20},
             }, "required": ["q"]},
             _github_search_code),
    ]
    return {t.name: t for t in tools}

_REGISTRY: Dict[str, Tool] = _build_registry()

def list_tools(connection_type: str | None = None) -> List[Dict[str, Any]]:
    return [
        t.to_dict() for t in _REGISTRY.values()
        if connection_type is None or t.type == connection_type
    ]

def execute_tool(name: str, params: Dict[str, Any] | None) -> Dict[str, Any]:
    tool = _REGISTRY.get(name)
    if tool is None:
        return {"success": False, "error": f"Unknown tool: {name}"}
    try:
        result = tool.handler(**(params or {}))
        return {"success": True, "result": result}
    except subprocess.TimeoutExpired as exc:
        return {"success": False, "error": f"Command timed out: {exc}"}
    except Exception as exc:
        log.exception("Tool %s failed", name)
        return {"success": False, "error": str(exc)}

def anthropic_tools() -> List[Dict[str, Any]]:
    return [
        {
            "name": t.name,
            "description": f"[{t.type}] {t.description}",
            "input_schema": t.schema,
        }
        for t in _REGISTRY.values()
    ]

# The renderer's MCP modal expects a list of named connections. We expose one
# pseudo-connection per tool category so the UI shows something useful.
def list_connections() -> List[Dict[str, Any]]:
    by_type: Dict[str, List[str]] = {}
    for t in _REGISTRY.values():
        by_type.setdefault(t.type, []).append(t.name)
    out: List[Dict[str, Any]] = []
    for type_, names in by_type.items():
        schema = get_connection_schema(type_)
        configured = schema["configured"]
        out.append({
            "id": type_,
            "name": type_.title(),
            "type": type_,
            "category": "System" if type_ in ("filesystem", "system") else "Development",
            "status": "connected" if configured else "needs-config",
            "configured": configured,
            "requiresConfig": schema["requiresConfig"],
            "tools": names,
        })
    return out

def list_available_types() -> List[Dict[str, Any]]:
    return [
        {"type": "filesystem", "name": "Filesystem", "category": "System",
         "description": "Read files in your home directory."},
        {"type": "system", "name": "System / Shell", "category": "System",
         "description": "Run safe shell commands."},
        {"type": "github", "name": "GitHub", "category": "Development",
         "description": "Access repositories, issues, and pull requests."},
    ]


# UI-driven per-type configuration. Each field is rendered dynamically by the
# renderer's "Add Connection" / "Configure" modal.
_CONNECTION_SCHEMAS: Dict[str, List[Dict[str, Any]]] = {
    "filesystem": [],
    "system": [],
    "github": [
        {
            "key": "githubToken",
            "label": "Personal Access Token",
            "type": "password",
            "secret": True,
            "placeholder": "ghp_...",
            "help": "Create at github.com/settings/tokens with repo + read:user scopes.",
        },
    ],
}


def _normalise_type(type_or_id: str) -> str:
    cid = (type_or_id or "").lower()
    if cid in ("fs", "files"):
        return "filesystem"
    if cid in ("shell", "terminal"):
        return "system"
    if cid in ("gh",):
        return "github"
    return cid


def get_connection_schema(type_or_id: str) -> Dict[str, Any]:
    """Return the dynamic UI schema + current values for a connection type.

    Secret values are never echoed back; instead each secret field gets a
    ``hasValue`` boolean so the UI can show a "configured" hint.
    """
    type_ = _normalise_type(type_or_id)
    fields = _CONNECTION_SCHEMAS.get(type_, [])
    settings = store.get_settings()
    out_fields: List[Dict[str, Any]] = []
    configured = True
    for field in fields:
        item = dict(field)
        key = field["key"]
        if field.get("secret"):
            item["value"] = ""
            item["hasValue"] = bool(settings.get(key))
            if not item["hasValue"]:
                configured = False
        else:
            item["value"] = settings.get(key, "")
            if not item["value"]:
                configured = False
        out_fields.append(item)
    return {
        "type": type_,
        "fields": out_fields,
        "configured": configured if fields else True,
        "requiresConfig": bool(fields),
    }


def save_connection_config(type_or_id: str, values: Dict[str, Any]) -> Dict[str, Any]:
    type_ = _normalise_type(type_or_id)
    fields = _CONNECTION_SCHEMAS.get(type_)
    if fields is None:
        return {"success": False, "error": f"Unknown connection type: {type_}"}
    partial: Dict[str, Any] = {}
    values = values or {}
    for field in fields:
        key = field["key"]
        if key not in values:
            continue
        new_value = values.get(key)
        # Skip empty secret writes so users can leave the field blank to keep
        # the existing keychain entry intact.
        if field.get("secret") and not new_value:
            continue
        partial[key] = new_value
    if partial:
        store.update_settings(partial)
    return {"success": True, "type": type_, "saved": list(partial.keys())}


def _test_filesystem() -> Dict[str, Any]:
    home = Path.home()
    if home.is_dir() and os.access(home, os.R_OK):
        return {"success": True, "message": f"Filesystem reachable ({home})"}
    return {"success": False, "message": f"Cannot read home directory: {home}"}


def _test_system() -> Dict[str, Any]:
    try:
        proc = subprocess.run(
            ["/bin/sh", "-c", "echo ok"],
            capture_output=True, text=True, timeout=5,
        )
    except Exception as exc:
        return {"success": False, "message": f"Shell unavailable: {exc}"}
    if proc.returncode == 0 and "ok" in proc.stdout:
        return {"success": True, "message": "Shell available"}
    return {"success": False, "message": f"Shell exit {proc.returncode}: {proc.stderr.strip()}"}


def _test_github() -> Dict[str, Any]:
    try:
        import requests  # noqa: F401
    except Exception:
        return {"success": False, "message": "Python 'requests' package not installed"}
    token = store.get_settings().get("githubToken") or os.environ.get("GITHUB_TOKEN", "")
    if not token:
        return {
            "success": False,
            "message": "No GitHub token configured. Click Configure to add a personal access token.",
        }
    try:
        data = _gh_get("/user")
    except Exception as exc:
        return {"success": False, "message": f"GitHub auth failed: {exc}"}
    login = data.get("login") if isinstance(data, dict) else None
    if not login:
        return {"success": False, "message": "GitHub responded but did not return a user (token may be invalid)"}
    return {"success": True, "message": f"Authenticated as {login}"}


_CONNECTION_TESTERS: Dict[str, Callable[[], Dict[str, Any]]] = {
    "filesystem": _test_filesystem,
    "system": _test_system,
    "github": _test_github,
}


def test_connection(connection_id: str) -> Dict[str, Any]:
    """Lightweight per-connection health check used by the renderer's
    'Test connection' button. Returns ``{success, message}``.
    """
    tester = _CONNECTION_TESTERS.get(_normalise_type(connection_id))
    if tester is None:
        return {"success": False, "message": f"Unknown connection '{connection_id}'"}
    return tester()
