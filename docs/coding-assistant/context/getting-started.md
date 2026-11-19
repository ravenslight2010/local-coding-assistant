# Getting started with the coding assistant

The files in this documentation directory are references, not an automatic prompt pack. Runtime context is repository-scoped and is included only after you import it for that repository and enable **Pack** for the session.

## What the assistant can help with
- Reading and explaining code in the selected local repository
- Drafting and reviewing focused changes
- Diagnosing application issues with repository evidence
- Security, accessibility, and release checklists
- Processing task queue items

## How to give it context
- Select files from the repository tree
- Activate skills from the Skills panel
- Use **Context** to import repository-specific markdown, then enable **Pack**
- Use **Memory** for short persistent notes for the selected repository

All prompt categories share one bounded budget. The meter estimates actual included content and reports truncation; it is not an exact model-tokenizer count.

## Offline first
The model runs locally via Ollama. Search is optional and off by default.
