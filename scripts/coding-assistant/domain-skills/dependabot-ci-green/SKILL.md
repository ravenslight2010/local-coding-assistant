---
name: dependabot-ci-green
description: Merge or rebase Dependabot PRs and fix red main checks. Use when CI is red or dependency PRs are open.
---

# Dependabot and CI green

## Order
1. Merge clean Dependabot PRs.
2. Rebase dirty ones with `@dependabot rebase`.
3. If main goes red after a merge, fix the failure before merging more.
4. Common public-CI failures: missing private workbooks, stale generated clients, GHCR push permission.

## Fixes that have worked
- Set `CI_PUBLIC_SOURCE=1` and skip corpus tests when `attached_assets` is absent.
- Regenerate API client after an orval bump.
- Build composite libs before typecheck.
- Build Docker images without pushing if GHCR write is denied.
