# Release Automation

Stage 9 automates repeatable **release-candidate evidence** without automating human release approval.

## Core rule

```text
green candidate evidence ≠ approval to publish
```

`vcp release-check` never runs `npm publish`, never creates or moves Git tags, never creates a GitHub release, and never deploys.

## Repository release policy

The VCP repository owns:

```text
.github/release-policy.json
```

The policy declares:

- package identity;
- changelog and release-note paths;
- exact retained previous release version/tag identity;
- required CLI aliases;
- required package-surface files.

The policy is repository-specific and is **not** installed as a managed template into consumer projects.

## Preview

```bash
vcp release-check 0.9.3 --dir .
```

Preview performs no npm packaging/install/update commands. It checks static contracts such as:

- clean exact Git revision;
- package + lockfile candidate version;
- one dated changelog release heading;
- empty `[Unreleased]` release bullets;
- candidate release-note HUMAN DECISION marker;
- migration continuity from the retained previous release;
- immutable previous tag object + peeled commit;
- candidate tag state.

If `v0.9.3` is missing, the report records `HUMAN_DECISION`; it does not create the tag.

## Execute candidate mechanics

```bash
vcp release-check 0.9.3 --dir . --run
```

Run mode additionally:

1. creates a temporary local candidate tarball with `npm pack --json`;
2. inspects package name/version and required runtime surface;
3. runs `npm publish --dry-run --json` — nothing is published;
4. installs the candidate tarball into a clean temporary consumer and checks both CLI aliases plus `--version`;
5. creates a temporary detached worktree at the retained previous release tag;
6. packs/installs that previous release locally;
7. initializes a clean managed project with the previous CLI;
8. previews and applies the candidate lifecycle update offline from the candidate tarball;
9. requires zero update conflicts, a backup, post-update Doctor with zero failures, copied framework validation, and an idempotent second update preview;
10. deletes temporary worktrees/tarballs/consumers.

No registry package is used for install/update smoke.

## Retain evidence

Optionally write JSON evidence:

```bash
vcp release-check 0.9.3 \
  --dir . \
  --run \
  --output .vcp/evidence/releases/0.9.3.json
```

Output is preflighted **before** executable mechanics:

- path must stay inside the selected repository;
- Git metadata is forbidden;
- symlink traversal is refused;
- overwrite requires `--force`.

Evidence records exact Git revision/clean state, check outcomes, candidate package artifact identity, migration/update summary, and HUMAN_DECISION items. Command stdout/stderr is not retained.

## Evidence schema

Current release evidence uses:

```text
schemaVersion: 1
kind: release-candidate
mode: preview | run
revision
previousRelease
candidateTag
checks[]
humanDecisions[]
package
lifecycle
summary
success
releaseApproved: false
published: false
```

`releaseApproved` and `published` remain false because this command cannot make those decisions/actions.

## Immutable tags

The previous release tag identity is part of repository policy.

If a candidate tag already exists, `release-check` requires it to resolve to the exact candidate revision. A mismatched existing tag is a failure; the command never “fixes” it by moving or recreating it.

## Boundaries

Stage 9 does not claim:

- registry publication succeeded;
- GitHub release creation succeeded;
- deployment succeeded;
- Linux/hosted compatibility is proven;
- a release is approved merely because mechanics are green.

Those remain separate evidence or human decisions.
