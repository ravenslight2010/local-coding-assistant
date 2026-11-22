---
name: tdd
description: Test-driven development. Use when building a feature or fixing a bug. Write the failing test first.
---

# TDD

Red, then green. One slice at a time.

## Loop
1. Name the behavior and the seam you will test.
2. Write one failing test for that behavior.
3. Run it. Confirm it fails for the right reason.
4. Write only enough code to make it pass.
5. Run it. Confirm it passes.
6. Next behavior. Do not batch tests.

## Rules
- Test behavior through the public interface, not internals.
- One test, then the code that makes it pass. Not all tests first.
- Do not claim done until the test output is shown.
- If the repo has no test runner, say so and ask before inventing one.
