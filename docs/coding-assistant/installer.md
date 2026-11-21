# Installer

## Current pin
`Get-CodeAgent.cmd` installs immutable source:

- Commit: `d1682b79fff7b5423069b2d2c1b488d1b4e8be05`
- Archive SHA-256: `1deb2f10202ac1d1494324c3c283c35b29323ca23e828f3d9c19d75b6690028f`

This pin includes the **Install app** confirmation and background launch fixes, as well as the local Canvas/browser check and approval-gated coding tools.

## How to run
Double-click `Get-CodeAgent.cmd`. It requests Administrator, verifies the zip, then runs setup.

## Options
```bat
Get-CodeAgent.cmd /startup
Get-CodeAgent.cmd /model qwen2.5-coder:7b
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
