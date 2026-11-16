# Local Coding Assistant

A fully local coding assistant that runs on your machine with Ollama. No cloud token limits, no API keys required for inference.

## What it includes
- One-click Windows installer
- Chat UI with streaming, sessions, and tool approval cards
- Domain skills (imports, QC, sync, security, accessibility, releases, etc.)
- Task queue for bug reports, alerts, and feedback
- Optional web search (off by default)
- Persistent memory and research context pack
- Multi-repo support (point it at v1, v2, or any checkout)

## Quick start (Windows)
1. Download and double-click:  
   https://raw.githubusercontent.com/ravenslight2010/local-coding-assistant/main/Get-CodeAgent.cmd
2. Approve Administrator.
3. It installs Node.js LTS, Ollama, a coding model, and launches the chat UI at http://127.0.0.1:7843/

### Options
```bat
Get-CodeAgent.cmd /startup
```
Adds the assistant to Windows Startup.

## Manual install
If you already have the repo:
```bat
CA-Setup.cmd
CA-Setup.cmd /repair
CA-Setup.cmd /startup
```

## Runtime requirements
- Node.js LTS (installed by the setup script)
- Ollama (installed by the setup script)
- A local model (default: qwen2.5-coder:7b)

No npm dependencies. The server uses only Node built-ins.

## Using it with other repos
The assistant can work against any local checkout. Set the repo path when launching, or use the multi-repo support in the UI. It is designed to help with Production-run-calculator (v1), Lucias-production-assistant-v2, and future versions.

## Folders
- `scripts/ca/` — installer and helpers
- `scripts/coding-assistant/` — chat UI, server, domain skills
- `docs/coding-assistant/context/` — research docs loaded into every session
