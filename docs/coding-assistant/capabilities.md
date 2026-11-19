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

## Testing
Test button builds a ladder from the repo:
1. Static (typecheck/lint)
2. Unit
3. API probes
4. Gold sets (if present and imports changed)
5. Playwright e2e (if present and UI changed)
6. Accessibility (axe)
7. Visual (only with baselines)

Skills: full-test-suite, api-testing, a11y-testing, visual-regression, playwright-check, playwright-debugger.
