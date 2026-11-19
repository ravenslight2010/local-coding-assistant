---
name: gold-set-workflow
description: Create and review gold sets for product and inventory imports. Use when building expected JSON for spec, premix, cheese, sauce, dough, or shipping imports.
---

# Gold-set workflow

## When to use
- Creating expected output for an import family
- Reviewing a parser result against a known-good fixture
- Adding a new gold set for a workbook layout

## Families
| Family | Typical source | Key fields |
|--------|----------------|------------|
| Spec | Pizza spec workbook | product, sizes, dough, sauce, cheese, toppings |
| Premix | Premix sheets | mix name, components, batch size |
| Cheese | Cheese mix specs | mix name, ingredients, oz per pizza |
| Sauce | Sauce guides | sauce name, ingredients, yield |
| Dough | Dough procedures | dough type, flour, water, yeast, times |
| Shipping | Shipping guides | item, case pack, units |

## Rules
1. One gold set per distinct layout, not per customer file.
2. Expected JSON must be deterministic: same input always yields the same output.
3. Do not invent values. If a cell is blank, the gold set records it as missing.
4. Include a short note of what the fixture is meant to catch (merge, rename, unit conversion, etc.).
5. Keep gold sets small. Prefer a minimal row set that exercises the rule.

## Output shape
```json
{
  "family": "spec",
  "source": "fixture-name.xlsx",
  "notes": "what this fixture proves",
  "expected": {}
}
```

## Review checklist
- [ ] Family matches the source
- [ ] No guessed numbers
- [ ] Units are explicit
- [ ] Missing cells are marked missing, not zero
- [ ] Rename/merge cases include both old and new names
