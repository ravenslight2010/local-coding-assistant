---
name: secret-handling
description: Read named secrets at runtime without echoing them. Use when a tool needs a token.
---

# Secret handling

- Secrets live in the local encrypted store, not in chat or MEMORY.md.
- Ask the host for a secret by name. Never print the value.
- Do not write secrets into files, commits, or session exports.
- If a secret is missing, stop and ask the user to set it.
