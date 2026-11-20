# Installer

## Current pin
`Get-CodeAgent.cmd` installs immutable source:

- Commit: `e2ed5dbe71b7ed897f8fa6ee4899b60dfa8470af`
- Archive SHA-256: `d84bc2c5fb213dc3fd0551393f7a1c53126bcdc895de8e2e66c82e22e53da1fa`

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
