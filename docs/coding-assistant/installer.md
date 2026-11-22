# Installer

## Current pin
`Get-CodeAgent.cmd` installs immutable source:

- Commit: `3f7666a77bfed07eac7a85529a2bc8a5d080e37d`
- Archive SHA-256: `aed7ffaa4445237f715d9b9ec0938876d2050fefc1be9629e1dfdb6999de4118`

This pin makes all-in-one setup the default when you run the installer. The updater replaces only the installed Code Agent server; it does not stop a different program using the port.

## How to run
Double-click `Get-CodeAgent.cmd`. It requests Administrator, verifies the zip, installs or updates Code Agent, then checks for missing companion tools. The extracted bundle's `CA-Setup.cmd` does the same using its local source.

## Options
```bat
Get-CodeAgent.cmd /startup
Get-CodeAgent.cmd /model qwen2.5-coder:7b
Get-CodeAgent.cmd /testbrowsers
Get-CodeAgent.cmd /coreonly
```

Setup uses installed Microsoft Edge for Canvas checks. By default, the installer adds missing Playwright Chromium, Firefox, and WebKit plus Docker Desktop, VirtualBox, and Android platform-tools. No flag is needed; `/extras` still works. Use `/coreonly` to skip companion tools or `/testbrowsers` to add only Playwright Chromium. Automatic updates triggered when opening Code Agent use `/coreonly`, so vendor installers don't open unexpectedly.

The installer uses Windows Package Manager (WinGet) for the system tools. It skips installed tools rather than reinstalling or upgrading them and reports tools it couldn't check or install. Review any license or installer prompts yourself; setup does not start containers or configure virtual machines. Docker Desktop may require WSL 2, virtualization, or a reboot. Optional failures are recorded in the setup log without blocking Code Agent.

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
