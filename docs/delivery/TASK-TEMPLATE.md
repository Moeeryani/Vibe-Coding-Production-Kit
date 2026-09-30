# Legacy Task Template Compatibility

This path is retained for lifecycle and documentation compatibility, but it is **not** the canonical Task Pack template for current VCP projects.

## Canonical Task Pack convention

Create current Task Packs with:

```bash
vcp task <slug>
```

VCP owns the canonical location:

```text
docs/tasks/<slug>.md
```

The generated Task Pack contains the current readiness, Source-of-Truth, security, verification, review, and completion contract. Do not copy this `docs/delivery/TASK-TEMPLATE.md` file to start new machine-readable tasks.

## Existing `docs/delivery/TASK-*` files

Historical/user-authored files under `docs/delivery/TASK-*` are not silently deleted, migrated, or auto-discovered as a second task namespace.

`vcp ready`, `vcp context`, and `vcp verify` continue to accept an explicit task file path. Therefore an existing file at a legacy location may still be addressed explicitly **if its contents satisfy the current Task Pack contract**. Its location alone does not make an older document a current machine-readable Task Pack.

VCP does not automatically prefer, merge, or reconcile a legacy delivery task with `docs/tasks/<slug>.md`. When adopting the current workflow, create or deliberately migrate to one canonical `docs/tasks/<slug>.md` artifact and preserve historical files only when they remain useful documentation.
