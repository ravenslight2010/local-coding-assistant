# Local Coding Assistant

A local coding assistant that runs on your machine with Ollama. Inference requires no cloud API key.

## What it includes
- Versioned Windows setup with verified Node.js and Ollama downloads
- Chat UI with streaming, sessions, and tool approval cards
- Bounded coding loop: inspect repository files, propose edits, run approved tests, and use results to continue
- Domain skills, a task queue, optional web search, persistent memory, and an opt-in context pack
- Local checkout selection for coding tasks

## Coding loop
Turn on **Code loop** to let the assistant search and read relevant repository files, propose focused edits, then use approved command results to continue. Repository reads are bounded and skip dependency/build folders and credential-like files. File edits and shell commands require approval; shell commands are disabled unless the server is launched with `CA_ALLOW_SHELL=1`. Edit approvals are bound to the prepared session, repository, and file SHA-256; stale approvals return `409` without overwriting newer content. Approved edits use atomic replacement. Up to 200 outcome-only edit/command audit records are kept in `agent/audit/tool-actions.json`; source changes and command text are not recorded. Chat streaming honors client disconnects and response backpressure.

## Quick start (Windows)
1. Download and double-click [Get-CodeAgent.cmd](https://raw.githubusercontent.com/ravenslight2010/local-coding-assistant/main/Get-CodeAgent.cmd).
2. Approve Administrator. Setup downloads a commit-pinned source archive and verifies its SHA-256 before running it.
3. Setup installs missing prerequisites, selects a model from detected RAM/GPU capacity, verifies the model, and creates the **Code Agent** shortcut.

Launch **Code Agent** from the Desktop or Start Menu. It opens in a dedicated Microsoft Edge app window when Edge is installed and falls back to your default browser otherwise. This is a desktop-style browser window, not a self-contained `.exe`.

Use `Get-CodeAgent.cmd /startup` to add the assistant to Windows Startup. Re-running setup preserves project memory and uses versioned source folders rather than replacing an existing source installation.

## Manual or offline-source install
Extract the full source bundle into a short path and run:

```bat
CA-Setup.cmd
CA-Setup.cmd /startup
CA-Setup.cmd /nolaunch
```

Build the canonical bundle on Linux/macOS with:

```bash
bash scripts/ca/pack-windows-bundle.sh ./CodeAgent-Windows-Setup.zip
```

The command also writes a `.sha256` file. No .NET SDK, npm dependencies, or build tools are required to install or run the assistant.

## Tested runtime
- Node.js 22.23.5; missing Node is installed from the official MSI after SHA-256 verification
- Ollama 0.40.16 when Ollama is absent; an existing Ollama installation is not replaced
- Hardware-selected Ollama coding model; setup fails if the selected model cannot be verified

## Using it with other repositories
Use **Repo → Select** in the browser to set the current session's repository. The canonical path is saved with that session and restored when the session is reopened; changing another session does not change it. A repository must contain `package.json` or `.git`. Set `RUNCALC_REPO` when launching the server to choose the default for new sessions.

Repository path checks are segment-aware: `.github` and filenames containing `..` are allowed, while traversal and `.git` metadata are blocked. Credential-like files are excluded from the file browser, coding reads/search, selected chat context, and edits.

Memory and imported research context are stored separately for each canonical repository under `agent/repositories/<repository-hash>/`. The research pack is off by default and is included only when **Pack** is enabled for that session. Existing server-wide memory/context files are not automatically migrated or injected into repositories.

One total prompt budget (12,000 estimated tokens by default, configurable with `CA_PROMPT_TOKEN_BUDGET`) covers instructions, memory, the opt-in pack, skills, selected files, attachments, and history. The latest request is prioritized; oversized optional content is truncated and reported. The browser meter calls the same server prompt builder and therefore uses actual content rather than selected filenames. The `~` count is a consistent UTF-8 byte-based estimate, not an exact model-specific tokenizer count.

## Verification
```bash
node --test scripts/coding-assistant/tests/*.test.mjs
```

The suite builds the canonical ZIP, checks its manifest and hash, and starts its packaged server. A physical clean-machine run is still required to qualify native Ollama installation, hardware detection, model download, and Edge launching; see `docs/coding-assistant/pilot-runbook.md`.

## Folders
- `scripts/ca/` — canonical setup, model selection, and bundle builder
- `scripts/coding-assistant/` — chat UI, server, and domain skills
- `docs/coding-assistant/context/` — optional project research context
