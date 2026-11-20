# Installer

## Current pin
`Get-CodeAgent.cmd` installs immutable source:

- Commit: `4a3a9b5e1326f76bcabea74bcecf5aa9ff42007c`
- Archive SHA-256: `19dc5561206b772340f061b35e3537b93ad9724200dbc7adb1576d94f07a0a64`

This pin includes Auto mode, secret store, workflows, testing ladder, and include-in-current-task.

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
