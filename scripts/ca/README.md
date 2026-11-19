# Code Agent Windows setup

## One-click
Download `Get-CodeAgent.cmd` from the repository and double-click it. The launcher downloads an immutable commit archive, verifies its SHA-256, and invokes the canonical setup script.

## From a checkout or ZIP bundle
Extract the full source tree to a short path and run `CA-Setup.cmd` from its root.

Options:
- `/startup` — create a login Startup shortcut
- `/nolaunch` — install and verify without opening the app window

Setup:
1. Installs Node.js 22.23.5 only when a supported Node 22 runtime is absent; the official MSI is hash-verified.
2. Installs Ollama 0.40.16 only when Ollama is absent; the official installer is hash-verified and an existing installation is not replaced.
3. Selects a coding model using RAM/GPU capacity and fails if the model cannot be pulled and verified.
4. Copies the complete UI, writes the launcher, and creates Desktop/Start Menu shortcuts.
5. Preserves `C:\runcalc\agent\config\MEMORY.md` and uses versioned source directories.

Logs: `C:\runcalc\agent\logs\setup-*.log`

No .NET SDK, Node SDK, npm install, or manually installed build tools are needed. Re-run `CA-Setup.cmd` to refresh the installed payload; there is no separate `/repair` mode.

## Build the canonical bundle
```bash
bash scripts/ca/pack-windows-bundle.sh ./CodeAgent-Windows-Setup.zip
```

The bundle contains the same `CA-Setup.cmd` and `setup.ps1` path used by a source checkout. It includes `chat-stream.mjs` and `open-app.ps1`, and its server is exercised by the bundle regression test.
