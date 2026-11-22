---
name: systematic-debugging
description: Find the root cause of a bug before proposing a fix. Use when something fails or behaves wrong.
---

# Systematic debugging

Do not guess. Find the cause.

## Steps
1. Reproduce. Get the failure to happen reliably.
2. Minimize. Cut the case down to the smallest input that still fails.
3. Hypothesize. State one cause.
4. Instrument. Add a log or assertion that confirms or kills the hypothesis.
5. Fix the cause, not the symptom.
6. Add a regression test that fails before the fix and passes after.

## Rules
- No fix until you can point at the line and the reason.
- If you cannot reproduce it, say so. Do not patch blind.
