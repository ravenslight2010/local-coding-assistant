---
name: full-test-suite
description: Plan and run the full test ladder for an app. Use when asked to test, verify, or prove a change.
---

# Full test ladder

Run from cheapest to most expensive. Stop and report at the first real failure.

## 1. Static
- Typecheck (`tsc` / `pnpm check`)
- Lint
- Schema / gold-set validation if the change touches imports

## 2. Unit
- Run the package's unit tests that cover the changed files
- Prefer `node --test` or the repo's `test` script
- Do not invent tests that need private fixtures the machine does not have

## 3. API
- Hit the local server's health and the endpoints the change touches
- Check status, shape, and error cases
- Never send real customer data

## 4. Gold set
- For import changes, run the parser against the gold fixture
- Diff expected vs actual
- Missing cells stay missing; do not coerce to zero

## 5. E2E
- Prefer an existing Playwright spec
- Run against localhost only
- Use locators, not sleeps
- Capture the failing assertion, not a full video, unless asked

## 6. Accessibility
- If the change touches UI, run axe on the affected page
- Check keyboard path and contrast
- Honor reduced motion

## 7. Visual
- Only if a baseline exists
- Compare on the same OS/browser the baseline was taken on
- Do not update baselines unless the user approves

## Report
Return:
- What ran
- Pass / fail counts
- First failure with file and assertion
- What was not run and why
