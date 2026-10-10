# Safe lifecycle updates


> **Stage12 draft lifecycle boundary:** Schema-v1 legacy updates remain a
> separate historical lifecycle. The draft adds versioned schema-v2 readers,
> ownership planning, and `vcp recovery-plan`, but schema-v2 mutation is
> disabled by D-01/G-FENCE **NO-GO**. Do not treat this code as a tested or
> released migrator; published v0.9.3 behavior below is documented as such.


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

Current manifest entries may use these update policies:

- `managed` — normal VCP-managed content. Untouched files can update; independent local/upstream edits use the bounded three-way merge path.
- `merge` — explicitly merge-oriented text/integration content such as repository instructions, prompts, delivery rules, scripts, and some GitHub assets. The current planner uses the same bounded independent-edit merge mechanics as `managed`, but the distinct policy value records the template's intended lifecycle class.
- `generated` — VCP may regenerate an untouched adapter, but local + upstream edits become a conflict rather than being overwritten.
- `preserve` — project-owned product/architecture/security decisions are preserved once customized. An untouched starter can still be safely refreshed.
- ignored — `vcp manage ignore <path>` detaches a file from VCP management without deleting local content.

Reattach a current VCP file with:

~~~bash
vcp manage track AGENTS.md
~~~

### Current ownership boundary

Released/current lifecycle state still manages **whole files**.

The Adaptive VCP design proposes a future separate ownership dimension:

~~~text
ownership.kind = file | section
policy         = managed | merge | generated | preserve
~~~

That section-ownership model is not current v0.9 behavior. When implemented, it requires a versioned manifest migration so older CLIs fail closed rather than misinterpreting section baselines.

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

## Lifecycle status and exit codes

Automation should not interpret exit code `0` from `vcp update --check` as "nothing to do." Check mode is informational and exits `0` both when no work exists and when lifecycle work is available.

Machine-readable update/check reports expose `lifecycleStatus`:

- `no-work` — no lifecycle change is pending;
- `available` — lifecycle work exists and can be previewed/applied;
- `blocked` — a computed plan contains a conflict or safety blocker, so no project-file mutation is allowed;
- `applied` — apply completed successfully.

The exit-code contract remains compatibility-preserving:

| Command/result | Exit | JSON lifecycle status |
| --- | ---: | --- |
| `update --check`: no work | `0` | `no-work` |
| `update --check`: work available | `0` | `available` |
| `update --dry-run`: no work | `0` | `no-work` |
| `update --dry-run`: safe work available | `0` | `available` |
| `update --dry-run`: blocked by conflict | `1` | `blocked` |
| `update`: no work | `0` | `no-work` |
| `update`: applied successfully | `0` | `applied` |
| `update`: blocked by conflict | `1` | `blocked` |
| lifecycle execution/read/apply failure | `1` | no normal lifecycle report is guaranteed |

This distinction is deliberate. A blocked plan is a valid lifecycle result and, with `--json`, is emitted as a normal report even though the process exits `1`. An execution failure is an error path: the CLI exits `1` and reports the error on stderr rather than fabricating a successful JSON lifecycle report. CI/wrappers that need to distinguish the two should parse `lifecycleStatus` when valid JSON is present; otherwise treat the non-zero exit as an execution failure.

## Stack-selection provenance and safe re-profiling

VCP stores two different stack facts for new installs:

- `install.stack` — the resolved profile actually installed, such as `generic` or `javascript`;
- `install.requestedStack` — the selector supplied at init, such as `auto` or an explicit `generic`.

These values intentionally answer different questions. A resolved `generic` value alone does not prove whether a developer explicitly chose the generic profile or whether `auto` fell back because the repository did not yet contain deterministic stack evidence.

Automatic re-profiling remains deliberately narrow.

The existing generic-to-concrete rule still applies only when the stored resolved profile is `generic`, `install.requestedStack` is exactly `auto`, and current deterministic detection resolves to a supported concrete profile.

Stage 11 adds one bounded concrete specialization: when current selected-root evidence resolves to `react-native`, an **auto-selected** installed `generic`, `javascript`, or `typescript` profile may specialize to `react-native`. VCP does not generalize concrete-to-concrete re-profiling beyond this React Native Node-family case.

For every automatic transition:

1. `install.requestedStack` must be exactly `auto`;
2. current detection must satisfy the same deterministic rules used by fresh init;
3. the transition must be either the existing `generic -> supported concrete` rule or the explicit Stage 11 `generic|javascript|typescript -> react-native` specialization;
4. normal ownership, conflict, backup, rollback, and idempotence controls remain in force.

`vcp update --check`, `vcp update --dry-run`, and JSON reports expose `stackProfileChange` before apply. Apply persists the new resolved profile while retaining `requestedStack: "auto"`.

Automatic re-profiling is withheld when the selector was explicit, when legacy provenance is missing, when React Native evidence is incomplete, or when the installed concrete profile is outside the approved Stage 11 specialization family.

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

### 2026-10-10 old release compatibility counterexample

Published npm 0.9.3 on native Windows ignored `.vcp/update.lock` in
`init --force` after `.vcp/manifest.json` was removed, overwriting
`AGENTS.md` despite an intact directory sentinel. Its rollback can
follow a newer journal and erase post-backup changes. Linux reproduced
seven and Windows eight protected mutation witnesses. Do not invoke an
old CLI against v2 state; that warning is not itself an effective fence.
While G-FENCE remains NO-GO, no managed v1→v2 migration, versioned
update apply or restoration is enabled. Existing v1 lifecycle
compatibility must be validated separately without re-enabling v1 init.
