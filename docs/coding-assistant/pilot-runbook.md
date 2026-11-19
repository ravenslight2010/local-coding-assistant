# Coding assistant setup and qualification runbook

## Install on Windows

Use `Get-CodeAgent.cmd` for a one-click download, or extract the full canonical bundle and run `CA-Setup.cmd`. Both paths invoke `scripts/ca/setup.ps1` and require no .NET SDK, npm dependencies, or manual build tools.

The launcher verifies the source archive hash. Setup verifies official Node/Ollama installers, selects a coding model from host capacity, verifies that Ollama reports the model, and checks the complete application payload before reporting success.

The installed app is loopback-only at `http://127.0.0.1:7843/`; Ollama uses `127.0.0.1:11434`. The desktop shortcut opens an Edge app window when available and otherwise uses the default browser. It is not a native `.exe`.

## Repository and write safety

Set `RUNCALC_REPO` explicitly when launching the server to choose the default for new sessions. Use **Repo → Select** to change only the current session's repository; reopening a session restores its saved canonical path. Coding-mode reads are bounded and all repository file entry points reject credential-like paths. `.github` is readable, but traversal and `.git` metadata are blocked. Edit and shell tools require approval and remain bound to the preparing session's repository. Shell stays disabled unless `CA_ALLOW_SHELL=1`; enabling it does not remove per-command approval. Edit approvals also bind the file SHA-256, reject stale content with `409`, and replace files atomically. The bounded audit at `agent/audit/tool-actions.json` retains at most 200 outcomes with relative edit paths and command hashes, never edit contents or command text. Browser disconnects abort Ollama streams; Windows shell timeouts invoke `taskkill /t /f` for process-tree cleanup.

Memory and imported context are repository-scoped under `agent/repositories/<repository-hash>/`; the research pack requires the session's **Pack** opt-in. One `CA_PROMPT_TOKEN_BUDGET` (default 12,000 estimated tokens) bounds instructions, memory, pack, skills, selected files, attachments, and history together. The browser's `~` meter is based on the actual server-built content but is not an exact model-tokenizer count. Legacy global memory/context is retained on disk but not auto-migrated or injected.

The older scripts under `scripts/ca/helpers/` are compatibility tools, not the canonical installer. Do not use helpers that patch application source or enable a separate write API.

## Automated verification

With Node 22:

```bash
node --test scripts/coding-assistant/tests/*.test.mjs
bash scripts/ca/pack-windows-bundle.sh /tmp/CodeAgent-Windows-Setup.zip
```

The bundle regression checks the manifest/hash and starts the packaged server. Windows PowerShell parsing and extracted-package launch checks belong in the Windows CI qualification job.

## Physical clean-machine qualification

Run this checklist on a newly reset supported Windows machine with no Node, Ollama, Code Agent, .NET SDK, or npm tooling preinstalled:

- [ ] Download only `Get-CodeAgent.cmd`; do not manually install prerequisites.
- [ ] Confirm the displayed source commit is the intended release.
- [ ] Run setup as Administrator and confirm archive/dependency hash checks complete without disabling SmartScreen, TLS validation, firewall protection, or machine execution policy.
- [ ] Confirm setup installs Node and Ollama, selects a model appropriate to detected RAM/GPU capacity, and exits zero.
- [ ] Open **Code Agent** from Desktop and Start Menu; confirm the UI loads without console errors or missing module requests.
- [ ] Send a short non-sensitive prompt and receive a complete streamed response.
- [ ] Select a disposable source repository; verify read/search, `.github` workflow reads, and credential-path rejection.
- [ ] Propose an edit, modify the file before approval, and confirm stale approval is rejected without overwriting the file.
- [ ] Approve a focused test command only in a disposable repository; confirm timeout/cancellation leaves no child process.
- [ ] Reboot and use the optional Startup shortcut; confirm no duplicate server or model download is started.

Record Windows edition/build, RAM/GPU, selected model, setup log path, and any failure. Until those results are captured, native setup and Edge launching are **implemented but not physically qualified**. CI is not a substitute for GPU/model and real-installer evidence.

## Optional OpenCode pilot

OpenCode is a separate read-only integration and is not installed by the canonical chat UI setup. See `bootstrap-local.mjs` and `opencode-readonly.example.json`; retain its fail-closed profile checks and do not represent it as part of the one-click chat installer.
