---
name: multi-file-edit
description: Change several related files in one approved patch.
---

# Multi-file edit

Use when a change spans a route, its client, and a test.

## Rules
- List every file before editing.
- Each file gets an exact old/new or a full create.
- One approval covers the set.
- If any file fails to apply, stop and report which ones landed.
