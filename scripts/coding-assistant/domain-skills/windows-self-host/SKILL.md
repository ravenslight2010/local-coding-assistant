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
When the user says "install the app" or clicks Install app:
1. Confirm a repository is selected.
2. Look for an installer in this order:
   - scripts/self-host/Install-RunCalcHost.ps1 (v1)
   - scripts/install-host.ps1
   - install.ps1
   - scripts/ca/setup.ps1
3. Run it with -NonInteractive if present.
4. Report the script used and the exit code.
5. If none exist, say the app has no installer yet and offer to draft one.
