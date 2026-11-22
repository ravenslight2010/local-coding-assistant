---
name: git-bisect
description: Find the commit that introduced a regression. Use when something used to work and now fails.
---

# Git bisect

Binary search the history. Do not read every commit.

## Steps
1. Confirm it is a regression: it worked at some older commit.
2. Find a known-good commit (git log, or ask the user).
3. Run: git bisect start <bad> <good>
4. At each step, run the failing test. Mark good or bad.
5. When bisect finishes, it names the first bad commit.
6. Read that commit's diff. That is the cause or the place to look.

## Rules
- Automate the test if you can: git bisect run <test-command>
- Reset with git bisect reset when done.
- If the test is flaky, bisect will lie. Confirm the test is stable first.
