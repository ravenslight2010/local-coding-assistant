---
name: code-review
description: Review a change before it is called done. Check standards and whether it matches the request.
---

# Code review

Two checks before done.

## Standards
- Does it follow the repo's existing style and patterns?
- Any secrets, hardcoded credentials, or unsafe input handling?
- Is the change as small as it can be?

## Spec
- Does it do what was asked?
- Are the tests covering the new behavior?
- Anything asked that is missing?

## Output
List findings as: file, what is wrong, why it matters. If clean, say so and show the test output.
