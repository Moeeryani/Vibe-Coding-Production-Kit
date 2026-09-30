# Source-of-Truth Freshness

Authority: ACCEPTED

VCP keeps engineering truth repository-native. Source-of-Truth freshness adds a small explicit authority marker so agents can distinguish current governing material from drafts and retained history without introducing a document database, revision graph, or embedded decision engine.

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

Task Pack references under `## Source of truth` mean **this document governs the task**. VCP therefore applies freshness rules to those references.

`--include` has a different meaning: the caller is deliberately asking for extra context. Explicit includes remain available for historical inspection, including `SUPERSEDED` and `ARCHIVED` material. This preserves inspectability without allowing stale material to masquerade as current authority.

## Backward compatibility

Legacy unmarked Source-of-Truth documents remain usable as current authority. This is intentional: freshness is additive and does not require a migration or backfill across existing repositories.

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
- a scheduler or task graph engine;
- automatic human-intent decisions;
- deletion or rewriting of historical documents.

Authority is explicit repository evidence. VCP validates and transports that evidence; it does not invent it.
