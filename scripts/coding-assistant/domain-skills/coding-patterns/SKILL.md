---
name: coding-patterns
description: Patterns borrowed from popular coding tools that fit a local coder. Use when planning changes or explaining how to work.
---

# Local coding patterns

These come from Cursor, Claude Code, and v0, trimmed to what works offline.

## Plan first
When asked to change code, reply with a short plan before editing:
- Files to touch
- What changes in each
- Which test proves it
Then edit. Skip the plan only if the user says to.

## Project brief
If the repo has AGENTS.md, CLAUDE.md, or CODER.md, it is already in your context. Follow its conventions, commands, and boundaries.

## Multi-file edits
Use the patch tool for changes that span files. One tool block, all files together.

## Test after
After edits, use the test tool. Do not claim success without output.

## UI changes
If the change touches a page or component, say so. The user can open Canvas to preview.
