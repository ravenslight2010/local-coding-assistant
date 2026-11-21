# Installer

## Current pin
`Get-CodeAgent.cmd` installs immutable source:

- Commit: `22c442f6b70fdd7ab4c5f7450db155bcd83ee52f`
- Archive SHA-256: `73cc816c244b709390f35dbafcf3b537fd720511b45f0d2c4eb6e0d0ef1c51b0`

This pin includes folder shortcuts and GitHub cloning in the repository picker, along with the Windows launcher, optional browser downloads, and **Install app** fixes.

## How to run
Double-click `Get-CodeAgent.cmd`. It requests Administrator, verifies the zip, then runs setup.

## Options
```bat
Get-CodeAgent.cmd /startup
Get-CodeAgent.cmd /model qwen2.5-coder:7b
Get-CodeAgent.cmd /testbrowsers
```

Setup uses installed Microsoft Edge for Canvas checks. Run `Get-CodeAgent.cmd /testbrowsers` to download Playwright’s Chromium, Firefox, and WebKit during setup. Failed optional browser downloads do not stop Code Agent setup.

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
