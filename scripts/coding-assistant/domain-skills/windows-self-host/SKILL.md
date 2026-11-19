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
