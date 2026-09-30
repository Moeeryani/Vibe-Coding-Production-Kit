# Source-of-Truth Freshness

Authority: ACCEPTED

VCP keeps engineering truth repository-native. Source-of-Truth freshness adds a small explicit authority marker so agents can distinguish current governing material from drafts and retained history without introducing a document database, revision graph, or embedded decision engine.

## Project-local vs workspace-qualified references

A Task Pack belongs to one selected VCP project root. Governing Source-of-Truth references are project-local by default:

```text
docs/product/PRD.md
```

For a nested project inside a Git worktree, a Task Pack may explicitly opt into a governing document from the enclosing Git worktree root with:

```text
workspace:docs/platform/API-POLICY.md
```

The qualifier is deliberate authority, not inheritance.

- unqualified paths always resolve from the selected VCP project root;
- `workspace:<path>` resolves only from the enclosing Git worktree root;
- VCP never searches parent directories for a matching document;
- root documents do not become package authority merely because they exist;
- sibling-package documents do not become authority automatically;
- workspace-qualified paths must remain inside the enclosing worktree after canonical filesystem resolution, including symlink/junction handling;
- workspace qualification requires the selected project to be inside an accessible Git worktree;
- Context Packs preserve the portable `workspace:<path>` identity rather than host-specific absolute paths.

`workspace:` is supported for governing references declared in a Task Pack's `## Source of truth` section. It is not a general cross-root path escape hatch: `vcp context --include`, `--planned`, `--output`, verification output, and verification cwd remain scoped to the selected VCP project root.

This keeps shared root authority explicit and bounded in monorepos without introducing hidden nearest-file lookup, root inheritance, sibling imports, package discovery, or a workspace scheduler.

## Marker

A Markdown Source-of-Truth document may declare exactly one top-level authority line:

```text
Authority: DRAFT
Authority: ACCEPTED
Authority: SUPERSEDED
Authority: ARCHIVED
```

Use exactly one of the four values when a document opts into explicit authority. Matching is case-insensitive, but canonical documents should use uppercase values.

A document with no `Authority:` marker is a **legacy current document** for backward compatibility. Existing projects do not need a migration merely to keep readiness or context working.

If an explicit marker is present but unknown, or more than one `Authority:` marker exists, VCP fails visibly instead of silently falling back to legacy behavior.

## State semantics

### `DRAFT`

Work in progress that may inform planning but is not accepted authority for implementation.

- plan readiness/context may use it;
- implementation readiness must fail if a governing Task Pack reference points to it;
- implementation/review/security/release context must not present it as governing Source of Truth.

### `ACCEPTED`

Current governing authority.

- plan and implementation readiness may use it;
- context may include it normally;
- accepted negative decisions and explicit exclusions belong here when they remain current engineering truth.

### `SUPERSEDED`

Retained history that has been replaced by newer authority.

- it cannot satisfy a governing Task Pack Source-of-Truth reference;
- it is not included as current context merely because a task still references it;
- agents may inspect it deliberately with `vcp context --include <path>` when historical comparison is required.

### `ARCHIVED`

Retained material that is no longer active authority.

It follows the same governing-reference restrictions as `SUPERSEDED`. Archival does not delete the file or erase its historical value.

## Governing references vs explicit historical inspection

Task Pack references under `## Source of truth` mean **this document governs the task**. VCP therefore applies freshness rules to those references, whether they are project-local or explicitly workspace-qualified.

`--include` has a different meaning: the caller is deliberately asking for extra project-local context. Explicit includes remain available for historical inspection of project-local material, including `SUPERSEDED` and `ARCHIVED` documents. `workspace:` qualification is intentionally not supported by `--include`; cross-root governing authority must be declared in the Task Pack instead of smuggled in as ad hoc extra context.

## Backward compatibility

Legacy unmarked Source-of-Truth documents remain usable as current authority. This is intentional: freshness is additive and does not require a migration or backfill across existing repositories.

Existing unqualified Task Pack references remain project-local exactly as before. Nested projects opt into shared root authority only by adding an explicit `workspace:` reference.

Projects can opt in document-by-document. Once a document declares an explicit authority marker, VCP enforces it deterministically.

## Negative decisions

Freshness must not erase rejected choices that still constrain current work. Preserve durable negative decisions in the current `ACCEPTED` document (or another current accepted governing document), even when older proposal documents are later `SUPERSEDED` or `ARCHIVED`.

A fresh agent should be able to reconstruct both:

- what is currently approved; and
- which material alternatives were explicitly rejected and remain out of scope.

## Non-goals

This contract does not add:

- automatic supersession inference from Git history;
- a document index/database;
- revision chains or version IDs;
- automatic project/package discovery;
- implicit root or sibling-package Source-of-Truth inheritance;
- a scheduler or task graph engine;
- automatic human-intent decisions;
- deletion or rewriting of historical documents.

Authority is explicit repository evidence. VCP validates and transports that evidence; it does not invent it.
