# Safe lifecycle updates

VCP v0.9 introduces repository-native lifecycle state so a project can evolve with the kit without blindly overwriting project decisions.

## The contract

`vcp init` creates `.vcp/manifest.json` plus baseline snapshots for files VCP manages. The manifest records the installed VCP version, install profile, ownership policy, baseline hash, baseline path, file mode, and template version. New installs also preserve the requested stack selector separately from the resolved stack profile so lifecycle code can distinguish automatic detection from an explicit human stack choice.

Runtime-only update artifacts are ignored through `.vcp/.gitignore`:

- `backups/`
- `stage/`
- `update.lock`
- `transaction.json`

The manifest and baselines are intentionally persistent. They are the evidence needed to distinguish upstream template changes from project-local changes.

`stage/` is intentionally transient. A successful update removes its transaction-specific staged subtree and removes `.vcp/stage/` itself when the directory becomes empty. Recovery from an interrupted transaction does the same after a successful rollback. Cleanup is conservative: VCP never recursively removes unrelated non-empty stage content merely to make the parent directory disappear.

## Ownership policies

VCP does not treat every file the same.

- `managed` — VCP may update an untouched file and three-way merge independent local/upstream edits.
- `generated` — VCP may regenerate an untouched adapter, but local + upstream edits become a conflict rather than being overwritten.
- `preserve` — project-owned product/architecture/security decisions are preserved once customized. An untouched starter can still be safely refreshed.
- ignored — `vcp manage ignore <path>` detaches a file from VCP management without deleting local content.

Reattach a current VCP file with:

```bash
vcp manage track AGENTS.md
```

## Check for lifecycle changes

```bash
vcp update . --check
```

The command compares the installed manifest version, the running CLI, and—unless `--offline` is used—the latest npm version. It also reports an eligible stack-profile transition when VCP has enough provenance to make that decision safely.

Machine-readable form:

```bash
vcp update . --check --json
```

With `--offline`, VCP does not claim to know the npm registry's latest version. It compares the project only with the running CLI and reports `registryChecked: false` in JSON.

A newer npm version is not applied by an older CLI. VCP prints a version-pinned `npx` command so the target templates and migration code come from the version being installed. If the running CLI is already newer than the registry version, VCP never recommends downgrading to the registry copy. The delegated command targets the project path that was actually checked rather than assuming the current directory.

## Stack-selection provenance and safe re-profiling

VCP stores two different stack facts for new installs:

- `install.stack` — the resolved profile actually installed, such as `generic` or `javascript`;
- `install.requestedStack` — the selector supplied at init, such as `auto` or an explicit `generic`.

These values intentionally answer different questions. A resolved `generic` value alone does not prove whether a developer explicitly chose the generic profile or whether `auto` fell back because the repository did not yet contain deterministic stack evidence.

Automatic re-profiling is therefore deliberately narrow. VCP considers a profile transition only when all of the following are true:

1. the stored resolved profile is `generic`;
2. `install.requestedStack` is exactly `auto`;
3. the current repository now satisfies the same deterministic stack-detection rules used by fresh init;
4. detection resolves to a concrete supported profile instead of `generic`.

When those conditions hold, `vcp update --check`, `vcp update --dry-run`, and JSON reports expose a `stackProfileChange` such as `generic -> javascript`. Apply persists the concrete resolved profile while retaining `requestedStack: "auto"`, so the provenance is not lost after the transition.

Two cases do **not** re-profile automatically:

- an explicit `requestedStack: "generic"`, because that is a human choice;
- a legacy manifest with no `requestedStack`, because historical `generic` provenance cannot be reconstructed safely.

For provenance-unknown legacy installs, historical profile identity wins. VCP does not infer that `generic` meant automatic merely because newer repository evidence now detects JavaScript, TypeScript, Python, or Go. This is intentionally conservative and avoids rewriting an explicit decision that older manifests cannot distinguish from fallback behavior.

A profile transition still uses the normal ownership and merge rules. Customized `preserve` documents are not rewritten merely because stack detection changed, and any conflicting managed/generated file blocks apply before project files are changed.

## Preview before writing

```bash
vcp update . --dry-run
```

The planner classifies each path as one of:

- `NOOP`
- `ADD`
- `UPDATE`
- `MERGE`
- `RENAME`
- `DELETE`
- `ADOPT`
- `DETACH`
- `PRESERVE`
- `IGNORED`
- `CONFLICT`

`--json` intentionally omits file contents and desired-template contents so update plans can be stored in CI logs without copying project text into the report.

## Apply

```bash
vcp update .
```

The apply path is transactional:

1. acquire `.vcp/update.lock`;
2. create a backup of every path the transaction may touch plus the manifest/baselines;
3. write transaction state;
4. stage new file content;
5. apply safe filesystem operations;
6. rebuild baseline state;
7. write the new manifest;
8. verify applied paths;
9. clear transaction state and release the lock.

A plan containing any `CONFLICT` is blocked before project files are changed.

If apply fails after backup creation, VCP attempts an automatic rollback and reports if rollback itself cannot complete.

## Roll back

Restore the newest VCP backup:

```bash
vcp rollback .
```

The optional backup id may be used to name that same newest recovery point explicitly:

```bash
vcp rollback . --backup <latest-id>
```

If an interrupted transaction exists, rollback is pinned to the backup recorded by that transaction. VCP refuses a different backup id in that state.

VCP v0.9 intentionally does **not** allow jumping directly to an older historical backup. A backup captures the files touched by its update plus the manifest/baselines; later updates may have changed additional managed paths. Restoring an older delta snapshot directly could therefore create a manifest/filesystem mismatch. Older backup directories are retained for inspection, but the supported rollback contract is the newest backup or the interrupted transaction's backup.

Rollback restores the backed-up files, the manifest, and baseline snapshots. It also clears interrupted transaction/lock state. Rollback itself acquires the update lock so it cannot race a live updater.

## Three-way merge

For mergeable files VCP compares:

- baseline: the VCP version originally installed;
- local: the current project file;
- target: the new VCP template.

Independent edits can merge automatically. Overlapping edits are reported as `CONFLICT`; VCP does not choose a winner or silently overwrite project changes. Final-newline intent is merged with the same three-way semantics instead of being forced on or off by either side.

Automatic merge work is bounded. Files large enough to make the line-based LCS merge unreasonably expensive are reported as `CONFLICT` for manual resolution rather than allowing unbounded memory use.

## Deleted and renamed files

Version migrations explicitly declare renames/removals. A managed file disappearing from a target package without an explicit migration removal is treated as `CONFLICT`, not as permission to delete it.

When a removal is explicitly declared, an unmodified managed file can be deleted safely. A locally modified or `preserve` file is detached instead of deleted.

A rename refuses to overwrite an unrelated destination and treats overlapping local/upstream edits as a conflict. Rename chains across multiple migrations are composed so a project can move across more than one historical version without requiring intermediate files to exist in the original manifest.

## Recovery and Doctor

`vcp doctor` checks lifecycle state in addition to the normal engineering-system checks. It can surface:

- missing manifests for legacy/uninitialized projects;
- corrupt manifests as failures;
- unsupported manifest schema versions;
- baseline integrity problems;
- interrupted update transactions;
- corrupt transaction state.

If a previous update was interrupted, inspect the repository and use `vcp rollback` before starting another update.

## Safety boundaries

Update paths are repository-relative and validated against traversal and symlink escapes. VCP state paths under `.vcp` receive the same no-symlink treatment.

A lock prevents update and rollback processes from mutating the same project concurrently. A lock owned by a dead process on the same host can be reclaimed immediately for recovery. A lock from another host, or malformed lock metadata, is only reclaimed after the configured stale interval so VCP does not guess that a remote writer has disappeared.
