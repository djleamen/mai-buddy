# Mai Buddy

A customizable, personal desktop AI agent powered by **Anthropic Claude**, built on **pywebview**. Runs in your menu bar, ships with built-in MCP-style tools (filesystem, shell, GitHub), and is summoned with a global hotkey.

## Features

- **Anthropic Claude** chat (default `claude-sonnet-4-5`, configurable in settings)
- **Persistent conversation history** stored locally in your application support directory
- **System tray / menu-bar icon** for show / hide / quit
- **Global hotkey** (`Cmd+Shift+M`) to toggle the window
- **Frameless, transparent, always-on-top** window with a draggable title bar
- **Built-in MCP tools** the AI can call autonomously:
  - `filesystem`: `read_file`, `write_file`, `list_directory` (writes restricted to your home directory)
  - `system`: `execute_command` (shell)
  - `github`: list repos, get repo, list issues, search code
- **Markdown-rendered responses** in the chat (sanitized via DOMPurify)
- **Secure secret storage** via the macOS keychain (`keyring`)

## Requirements

- macOS (primary target — pywebview/WKWebView. Linux/Windows should work but are untested in this iteration.)
- Python **3.10+**
- An Anthropic API key

## Quick Start

```bash
git clone https://github.com/djleamen/mai-buddy.git
cd mai-buddy/python

python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python main.py
```

On first launch, click the **gear icon** to open Settings and paste your Anthropic API key. Optionally add a GitHub personal access token to enable the GitHub tools.

### Environment variables (optional)

Create a `.env` at the repo root:

```dotenv
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
```

Settings entered in the UI take precedence and are stored in the macOS keychain.

## macOS Permissions

The global hotkey relies on `pynput` and requires **Accessibility** permission for the process running Python (your terminal or IDE). Grant it under:

> System Settings → Privacy & Security → Accessibility

If permission is denied the app still runs — only the global hotkey is disabled.

## Hotkeys

| Shortcut         | Action                  |
| ---------------- | ----------------------- |
| `Cmd+Shift+M`    | Show / hide the window  |

## Project Layout

```
python/
  main.py                 # pywebview entry point
  api.py                  # JS ⇄ Python IPC dispatcher
  services/
    ai_service.py         # Anthropic Claude wrapper + tool-use loop
    history_store.py      # Persistent conversation history (JSON)
    mcp_tools.py          # Built-in tools (filesystem, shell, GitHub)
    store.py              # Settings + keychain secret storage
    tray_service.py       # Menu-bar icon (pystray)
    hotkey_service.py     # HTML/CSS/JS UI loaded by pywebview
assets/                   # Icons
```
> The legacy Electron source under `src/main/` is no longer used and will be removed in a future commit.

## License

MIT — see [LICENSE](LICENSE).
