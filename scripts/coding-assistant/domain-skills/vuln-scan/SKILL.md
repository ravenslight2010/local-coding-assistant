---
name: vuln-scan
description: Dependency and known-CVE scan for the app.
---

# Vulnerability scan

## Commands
- `pnpm audit --prod` or the repo's audit script
- Dependabot alerts if GitHub access is available
- Note outdated majors separately from vulnerable packages

## Rules
- Prefer the lockfile audit over a live registry guess
- Do not auto-upgrade majors
- A denied GHCR push or missing private fixture is not a vulnerability

## Output
List package, severity, and whether a patched version exists.
