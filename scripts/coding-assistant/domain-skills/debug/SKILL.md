---
name: debug
description: Diagnose a failing test or runtime bug before editing.
---

# Debug

## Order
1. Reproduce. Run the failing test or read the stack.
2. Locate. Search for the function and its callers.
3. Explain the cause in one or two sentences.
4. Propose the smallest fix.
5. Add or adjust a test that would have caught it.

## Do not
- Guess a fix before reading the failure.
- Silence the error without fixing the cause.
- Claim a test passed without its output.
