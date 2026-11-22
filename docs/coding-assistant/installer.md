# Installer

## Current pin
`Get-CodeAgent.cmd` installs immutable source:

- Commit: `17fd41261dd9beebdc169fb7eb8591c5f5baf76a`
- Archive SHA-256: `cac9dd60cead270215c6cf1a46e82e831772c652fa142539d4feb4c42435265f`

This pin adds `/extras` without changing routine updates. The updater replaces only the installed Code Agent server; it does not stop a different program using the port.

## How to run
Double-click `Get-CodeAgent.cmd`. It requests Administrator, verifies the zip, then runs setup.

## Options
```bat
Get-CodeAgent.cmd /startup
Get-CodeAgent.cmd /model qwen2.5-coder:7b
Get-CodeAgent.cmd /testbrowsers
Get-CodeAgent.cmd /extras
```

Setup uses installed Microsoft Edge for Canvas checks. Use `/testbrowsers` to add Playwright Chromium only, or `/extras` to add Playwright Chromium, Firefox, and WebKit plus Docker Desktop, VirtualBox, and Android platform-tools. The extracted bundle supports `CA-Setup.cmd /extras` too.

`/extras` uses Windows Package Manager (WinGet) for the system tools. It skips installed tools and reports tools it couldn't check or install. Review any license or installer prompts yourself; setup does not start containers or configure virtual machines. Docker Desktop may require WSL 2, virtualization, or a reboot. Optional failures are recorded in the setup log without blocking Code Agent.

If the application payload is already installed, add the browsers without rerunning setup. Run this in Command Prompt under the Windows account that will run the tests:

```bat
node "C:\runcalc\agent\app\ui\node_modules\playwright-core\cli.js" install chromium firefox webkit
```

## Updating later
Do not point the installer at floating `main`.
To move the pin:
1. Pick a reviewed commit.
2. Download `https://codeload.github.com/ravenslight2010/local-coding-assistant/zip/<sha>`.
3. Record the SHA-256.
4. Update `VERSION` and `EXPECTED` together.

## Model choice
Setup shows RAM, GPU, and VRAM, then a numbered list.
The recommended model is marked. Press Enter to accept it, or type a number.
`/model` on the command line skips the menu.

## Model menu
Options now include Qwen2.5-Coder, Qwen3.5 9B, gpt-oss 20B, Qwen3.8 27B, Devstral Small 2, and Qwen3-Coder 30B.
Recommendation:
- under 8 GB → 1.5B
- 16 GB → 7B
- NVIDIA 8 GB+ → Qwen3.5 9B
- 24 GB VRAM or 32 GB RAM → Qwen3.8 27B

## Updater
If `C:\\runcalc\\agent\\app` already exists, the same file updates it.
Config, memory, and secrets are kept. App files are replaced.
