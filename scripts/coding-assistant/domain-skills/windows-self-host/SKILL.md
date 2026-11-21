---
name: windows-self-host
description: Help package and run the production app as a Windows service or tray host on a local network. Use for self-host, installer, or LAN deploy questions.
---

# Windows self-host

## Goal
Keep the web clients as they are. Only the server becomes a Windows process.

## Checklist
- Node LTS present
- Database local (Postgres or SQLite) and not pointed at a cloud instance by accident
- Service or tray app starts the API and worker
- Clients reach it by LAN URL
- Updates can be pulled from GitHub without wiping local data
- Secrets stay in env or a local secret store, never in the repo

## Do not
- Bundle V1 credentials into V2
- Expose the API beyond the LAN unless the user asks
- Store tokens in the installer script


## Install current app
The coder has a universal installer. When the user clicks Install app or says "install the app":
1. Confirm a repository is selected.
2. Detect how to install it, in order:
   - Known script (scripts/self-host/Install-RunCalcHost.ps1, scripts/install-host.ps1, install.ps1)
   - Docker (docker-compose.yml / compose.yml / Dockerfile)
   - Node (package.json; uses pnpm/yarn/npm based on lockfile; runs start or dev)
   - Python (requirements.txt or pyproject.toml)
   - Static (index.html; serves on port 3000)
3. Run the detected plan and report the kind, command, and exit code.
4. If nothing matches, say the repo type is not recognized.
