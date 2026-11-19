---
name: playwright-check
description: Verify UI changes with a local Playwright run when the app is up.
---

# Playwright check

- Prefer an existing e2e test over a new script.
- Run against localhost only.
- Capture the failing assertion, not a full trace, unless asked.
- Do not log cookies or auth headers.
