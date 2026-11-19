# Default repository

The assistant can point at any local checkout. Set a default and change it when you switch versions.

## Set the default
Create `C:\runcalc\agent\config\default-repo.json`:

```json
{
  "path": "C:\\src\\Replit-v2-main",
  "label": "V2"
}
```

## Change it later
- From the chat UI, use the repo switcher on the session.
- Or edit `default-repo.json` and start a new session.

## Suggested labels
| Label | Path |
|-------|------|
| V2 | the Replit-v2-main checkout |
| V1 | Production-run-calculator |
| Coder | local-coding-assistant |

The session remembers its own repo. Changing the default only affects new sessions.
