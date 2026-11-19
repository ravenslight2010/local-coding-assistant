---
name: a11y-testing
description: Run accessibility checks on UI changes with axe and keyboard paths.
---

# Accessibility testing

## Automated
- Use @axe-core/playwright when Playwright is present
- Tags: wcag2a, wcag2aa
- Fail on violations; list rule id and node

## Manual checks to mention
- Tab order reaches the new control
- Focus is visible
- Reduced motion is respected
- Error text is associated with the field

## Do not
- Claim full WCAG compliance from axe alone
- Test against a cloud URL unless asked
