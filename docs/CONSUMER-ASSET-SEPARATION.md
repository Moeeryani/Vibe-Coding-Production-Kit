# Stage 14 — Consumer asset and standing-context separation

**Status:** BUILD ONLY / source constructed, independent acceptance PENDING.
**Tracking:** [#103](https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/103);
[Draft PR #104](https://github.com/Moeeryani/Vibe-Coding-Production-Kit/pull/104).
**Normative phase:** Adaptive Implementation Plan Phase 2. The development label
"Stage 14" does not waive the required post-Stage13 **Checkpoint A** decision.

## Why this exists

The historic `legacy-full-v1` template copied provider/framework reference
material into the application repository, including a VCP-source-specific npm
workflow, long instruction files, canonical prompts and validators. This makes
an established project appear to be missing files it never opted to own, and
makes upgrading unclear. New safe consumers should receive only material
that belongs to their project.

VCP is an external deterministic CLI, not an embedded AI model, scheduler or
permission system. Its package contains reference material; a consumer's
Source of Truth is authored and approved by that consumer.

## The four categories

| Class | Meaning | Example |
|---|---|---|
| `runtime-required` | Persistent routing/adapter chosen for that consumer | `AGENTS.md`, explicitly requested `CLAUDE.md` |
| `greenfield-starter` | Product/architecture/security/testing starter templates useful only for a **new** project | `docs/product/PRD.md`, `docs/testing/TEST-STRATEGY.md` |
| `optional-hygiene` | Explicit GitHub convenience scaffolding, not CI | `.github/PULL_REQUEST_TEMPLATE.md` |
| `package-only` | Canonical procedural prompts, provider framework docs, validator programs, historical compatibility/migration assets | `prompts/02-plan-task.md`, `docs/ROADMAP.md`, `scripts/validate-framework.mjs`, historic `.github/workflows/validate.yml` |

The exact safe inventory is in `lib/asset-catalog.mjs` as
`STAGE14_SAFE_CONSUMER_PATHS`. Unsafe paths, case/NFC collisions,
file/directory collisions, drive/UNC forms, and unknown `assetSet` values
refuse before selection. Package-only is **not** a synonym for safe deletion.
It says the current desired safe consumer does not receive that package file.

## Persisted asset sets (unchanged semantic names)

- **`legacy-full-v1`**: historical full v1 surface and its original selection
  rules remain available *inside the package* as upgrade, rollback and
  compatibility input. Existing installs retain original ownership/baselines
  and CI semantics; this work does not upgrade or erase them.
- **`greenfield-safe-v1`**: short standing instructions plus explicit
  starter documentation and requested adapter/GitHub hygiene. It never
  installs VCP source reference docs, canonical prompts, source validator,
  source npm workflow, or example framework scaffolding just because they
  exist in the provider package. Greenfield initialization currently remains
  blocked by D-01 and requires a compatible reader **greater than 0.9.3**.
- **`brownfield-minimal-v1`**: short scoped routing, requested adapters and
  optional issue/PR hygiene only. It does not install placeholder Product,
  Architecture, Threat, Testing or CI files; project-authored documents and
  existing instruction sections remain owned by their original authors.
  The actual Stage13 mutating adoption writer is separately G-FENCE blocked.

`includeGitHub` means historical GitHub assets for old legacy-full; for
safe sets it means optional issue/PR hygiene only, **not CI coverage**.
An existing `.github/workflows/validate.yml` is preserved as user state on
new safe surfaces, not automatically claimed or deleted.

## Standing-context contract

`lib/greenfield-routing.mjs` renders a short, always-on rule set. Real
engineering decisions, Source-of-Truth references, review and task evidence
stay in project docs and Task Packs. The framework's full procedures remain
package-owned and are loaded through the existing bounded Context Pack and
canonical prompt resolver. The renderer exposes nine verification command
slots as evidence placeholders, **not permission**.

Existing `legacy-full-v1` `AGENTS.md` and bespoke instruction/adapter
content do not get silently replaced with this new short text. The
versioned manifest ownership ledger still controls each managed file and
section; unowned or customized text is not implicitly claimed.

## Canonical prompt resolution

The resolver accepts a fixed canonical prompt allowlist. Its precedence is:

1. Verified, bounded, non-symlink selected-project prompt override;
2. Same-named canonical prompt bundled in the installed VCP npm package.

Project content remains byte-preserved. Fallback provides actual bytes and
explicit provenance, and counts in the Context Pack budget. A packaged prompt
is **execution guidance**, never an accepted project Source-of-Truth record.
An unknown mode path, linked parent/file or unsafe override refuses rather
than silently falling back to another project's bytes.

## Read-only legacy retirement planning

The new `vcp asset-plan` command is an **inventory** command, not a
migration or cleanup API:

```text
vcp asset-plan . --asset-set greenfield-safe-v1 --json
vcp asset-plan . --asset-set brownfield-minimal-v1 --json
```

It requires a provably managed `legacy-full-v1` source and explicit target.
For every manifest-owned path it compares the exact saved baseline hash and
current content through the existing bounded, no-follow path trust boundary.
It distinguishes:

- `KEEP_CONSUMER`: still part of the consumer surface;
- `RETIRE_CANDIDATE`: package-only path is exactly baseline-identical;
- `PRESERVE_USER_EDIT`: local contents differ from baseline; never delete;
- `RETAIN_ABSENT`: user already removed the path; no recreation;
- `CONFLICT`: untrusted path, missing/corrupt baseline, or section ownership
  requiring different transaction semantics.

Every item has `executionAuthorized:false`. The overall report is
`readOnly:true`; any conflict is `blocked:true`. There is no corresponding
delete, unlink, detach, migrate or "apply this report" command. Even a clean
candidate would require **new** exact-path owner proof, human intent,
OS-enforced isolation from published v0.9.3, native durable writers,
validated versioned backup/journal and crash recovery before a future
version can safely offer a destructive operation. A preview cannot act as
durable or atomic state.

**D-01 remains DEFERRED, G-FENCE remains NO-GO,
`managedV2MutationAuthorized=false`.** No unsafe old published binary is
stopped merely by shipping a new manifest/catalog or returning BLOCKED from
new code.

## Doctor, CLI and CI evidence

Doctor exposes `assetSet`, catalog snapshot, count of manifest-owned files
by class, and CI coverage as `unassessed`. A safe asset set does not warn that
it omitted VCP's source npm workflow or framework validator. Missing project
starter documents are not automatically an install-health failure in an
unmanaged mature repository. A real manifest/ownership conflict still fails
closed. No tool claims that finding any CI config proves VCP coverage.

The provider's `scripts/validate-framework.mjs` remains a **package-source
validator**. It is not an installed consumer requirement for safe sets. The
legacy workflow and validator scripts stay shipped for historical rollback
inputs. Do not rewrite old project CI while adding new safe surfaces.

## Final checkpoint and gate (not executed yet)

Build includes exact catalog selection, negative inputs, prompt precedence,
legacy v1 user bytes, child workspace, and native Windows junction tests.
Acceptance must be run once against the fully integrated frozen SHA on
computer-equipped Linux and **native Windows/NTFS** agents, with full stdout/
stderr and checksums. The existing Stage12/13 tests, package smoke, native
old-CLI witness and recovery/rollback matrix are **not silently treated as
green**. Checkpoint A is a separate mechanical dogfood decision for Stage13
actual brownfield adoption and rollback; it remains PENDING because the
lifecycle writer cannot safely run with D-01 NO-GO. Future phases include
provider-neutral CI inspection (Phase 3), capability profiles and UX router.

No merge to `main`, npm publication, version bump, tag, G-FENCE activation
or claim of Stage12/13/14 full GO is approved by this source construction.
