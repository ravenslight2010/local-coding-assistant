---
name: refactor
description: Safe refactors. Use when renaming, extracting, or simplifying code.
---

# Refactor

## Rules
1. Read every call site before renaming.
2. Change behavior only if the user asked.
3. Prefer one logical change per patch.
4. Keep the public API stable unless asked to break it.
5. Update the test that covers the change in the same patch.

## Steps
- Find the symbol and its callers.
- Propose the new shape.
- Apply the smallest complete edit.
- Run the focused test.
