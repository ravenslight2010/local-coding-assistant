---
name: visual-regression
description: Compare UI screenshots to baselines. Use only when baselines exist.
---

# Visual regression

## Rules
- Same OS and browser as the baseline
- Wait for fonts and animations
- Tag visual tests so they can be skipped in fast runs
- Never update a baseline without explicit approval

## Report
- Which screenshot differed
- Pixel or percentage delta if available
- Whether the difference is layout or content
