# Coder capabilities

## Secrets
Encrypted local store under `C:\runcalc\agent\config\`. Use the Secrets button to set, get, or delete by name. Values are never written to chat or session export.

## Memory
- Hot: MEMORY.md per repo
- Warm: searchable notes via Recall
Save a note from chat; search before re-explaining import or sync rules.

## Workflows
Workflows button runs a named recipe:
- gold-set
- ci-green
- version-diff
- bug-intake

## Context
Old turns are trimmed before they reach the model. Session export still keeps the full history.

## Repo SHA
`/api/repo/sha` records the last seen commit so the next session can tell what changed.

## Skills doctor
`/api/skills/doctor` flags skills over 8 KB.
