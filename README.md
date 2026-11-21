# Local Coding Assistant

A local coding assistant that runs on your machine with Ollama. Inference requires no cloud API key.

## What it includes
- Versioned Windows setup with verified Node.js and Ollama downloads
- Chat UI with streaming, sessions, and tool approval cards
- Canvas preview for local apps with a screenshot and browser-error check
- Bounded coding loop: inspect repository files, propose edits, run approved tests, and use results to continue
- Domain skills, a task queue, optional web search, persistent memory, and an opt-in context pack
- Local checkout selection for coding tasks

## Coding loop
Turn on **Code loop** to let the assistant search and read relevant repository files, propose focused edits, then use approved command and Git results to continue. Repository reads are bounded and skip dependency/build folders and credential-like files. Create/edit/patch tools can auto-apply only when **Auto** is enabled; shell and every Git tool require explicit approval. Shell is on by default (`CA_ALLOW_SHELL=1` in the generated run script). Git tools include status, pull, push, clone, and pull-request creation; `GITHUB_TOKEN` is read from Secrets for GitHub HTTPS pull/push and PR creation. Edit approvals are bound to the prepared session, repository, and file SHA-256; stale approvals return `409` without overwriting newer content. Approved edits use atomic replacement. Up to 200 outcome-only edit/command audit records are kept in `agent/audit/tool-actions.json`; source changes and command text are not recorded. Chat streaming honors client disconnects and response backpressure.

## Canvas preview and browser check
Open **Canvas** to preview an app at `http://127.0.0.1:<port>` in desktop, tablet, or phone width. **Check page** opens it in a fresh headless browser, captures a screenshot, and reports HTTP status, title, JavaScript console errors, and uncaught page errors. The browser has no saved cookies; it blocks cross-origin and non-GET/HEAD requests, limits a check to 100 requests and one active run, and does not click or automate controls. Windows uses installed Microsoft Edge; on other systems set `CA_TEST_BROWSER_PATH` to a Chromium-based browser executable.

## Quick start (Windows)
1. Download and double-click [Get-CodeAgent.cmd](https://raw.githubusercontent.com/ravenslight2010/local-coding-assistant/main/Get-CodeAgent.cmd).
2. Approve Administrator. Setup downloads a commit-pinned source archive and verifies its SHA-256 before running it.
3. Setup installs missing prerequisites, selects a model from detected RAM/GPU capacity, verifies the model, and creates the **Code Agent** shortcut.

Launch **Code Agent** from the Desktop or Start Menu. It opens in a dedicated Microsoft Edge app window when Edge is installed and falls back to your default browser otherwise. This is a desktop-style browser window, not a self-contained `.exe`.

Use `Get-CodeAgent.cmd /startup` to add the assistant to Windows Startup. Re-running setup preserves project memory and uses versioned source folders rather than replacing an existing source installation.

## Install an app from a selected repository
Select the repository, click **Install app**, and review the detected commands before confirming. Only install projects you trust; setup and dependency scripts run with your permissions. The button supports recognized PowerShell installers, Docker, Node projects with a `start` or `dev` script, Python projects that launch with `python -m app`, and static sites. It reports when it launches a long-running app without waiting for it to close. Check the app’s URL or port to confirm readiness. To install Code Agent itself on Windows, use `CA-Setup.cmd` instead.

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

The command also writes a `.sha256` file. No .NET SDK or build tools are required; setup automatically installs the pinned Playwright Core runtime used by Canvas.

## Tested runtime
- Node.js 22.23.5; missing Node is installed from the official MSI after SHA-256 verification
- Ollama 0.40.16 when Ollama is absent; an existing Ollama installation is not replaced
- Hardware-selected Ollama coding model; setup fails if the selected model cannot be verified

## Using it with other repositories
Use **Repo → Browse** to navigate local folders. **Jump to a location** lists available shortcuts such as your current repository, Documents, Downloads, and OneDrive. You can also paste an absolute local path into the **Repo** field and click **Select**. A repository must contain `package.json` or `.git`.

If the repository is still on GitHub, choose **Repo → Browse → Clone from GitHub**, paste its HTTPS repository URL, and click **Clone and open**. Leave **Save inside folder** blank to use Code Agent's `repositories` folder, or enter an absolute destination path. Code Agent creates the missing destination and repository folders. If the named folder already contains a checkout of the same GitHub repository, Code Agent opens it without modifying it; a different existing folder is left untouched. New clones are shallow. Public repositories need only Git and internet access; private repositories also require Code Agent's existing GitHub token configuration with read access.

The selected path is saved with the session and restored when it is reopened. Set `RUNCALC_REPO` when launching the server to choose the default for new sessions.

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

## Task drop folder
Drop a JSON file in `C:\runcalc\agent\tasks\` and the assistant picks it up.

Example: [docs/coding-assistant/examples/task-drop.json](docs/coding-assistant/examples/task-drop.json)

## Default repo
See [docs/coding-assistant/default-repo.md](docs/coding-assistant/default-repo.md).

## Model
The installer remembers the last model used. Override with:

```bat
Get-CodeAgent.cmd /model qwen2.5-coder:7b
```

Or set `CA_MODEL` before running setup.


## New in this build
- Shell on by default. Git status/pull/push/clone/PR tools (token from Secrets as GITHUB_TOKEN).
- Auto-update check on launch.
- Self-test button.
- Background tasks (type=background) are logged when idle.
