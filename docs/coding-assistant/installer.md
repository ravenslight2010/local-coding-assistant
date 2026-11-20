# Installer

## Current pin
`Get-CodeAgent.cmd` installs immutable source:

- Commit: `0d660ef85bb17ff6a0a5a5160e0368b874f8df1b`
- Archive SHA-256: `4039137c8675cd2c3743057d832dc6e6da7eed1531c209c482c2b0e1336a06c4`

This pin includes Auto mode, secret store, workflows, testing ladder, include-in-current-task, and the hardware model menu.

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
