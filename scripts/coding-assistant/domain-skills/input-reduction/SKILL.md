---
name: input-reduction
description: Shrink a failing input to the smallest case that still fails. Use before digging into code.
---

# Input reduction

Smaller input, smaller search.

## Steps
1. Get a failing input. Save it.
2. Delete half. Rerun the failing test.
3. If it still fails, keep the half. If it passes, restore and try the other half.
4. Repeat until removing any single piece makes it pass.
5. Debug against the reduced input, not the original.

## Rules
- The reduced case must still fail for the same reason.
- If the failure needs two distant pieces, keep both. Do not force it into one half.
- Save the reduced case as a regression test once fixed.
