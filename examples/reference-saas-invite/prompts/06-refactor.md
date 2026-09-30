# Prompt: Safe Refactor

```text
Goal: improve internal structure without changing externally observable behavior unless explicitly listed.

Before editing:
1. state the behavior that must remain invariant;
2. identify current tests that protect it;
3. identify missing characterization tests;
4. define the smallest refactor boundary;
5. list any public API/schema risks.

Then:
- add characterization tests first if needed;
- refactor in small mechanical steps;
- do not mix new features into the refactor;
- keep commits/diff reviewable;
- run all relevant verification after changes;
- compare before/after behavior and public contracts.

Report any behavior change separately and do not hide it as cleanup.
```
