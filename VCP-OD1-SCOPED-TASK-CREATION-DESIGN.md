# OD-1 Scoped Task Pack Creation — Security Design

**Status: DESIGN ONLY. No implementation. No approval recorded.**

- Baseline: branch `feat/vcp-release-readiness-baseline`, HEAD
  `d4fb3ceec55113b56aa0cfa7e4885ac00d8a1e17`, tree
  `e7119fa2c778110d2475aaeb7ad7f2275d7a4bcd`.
- Design branch: `design/od1-scoped-task-pack-creation` (this document
  lives on that branch; no product code or test was changed).
- D-01 remains DEFERRED. G-FENCE remains NO-GO. All immutable
  restrictions in §3 remain in force. Nothing in this document
  authorizes, activates, or implements the exception it designs.
- Companion documents: `VCP-OD1-THREAT-MODEL.md`,
  `VCP-OD1-SECURITY-ACCEPTANCE-MATRIX.md`,
  `VCP-OD1-OWNER-DECISION-PROPOSAL.md`.
- All code citations are to the baseline tree above, verified by
  direct inspection for this design. Function names are cited;
  line numbers are given only where verified.

## 1. Verified implementation map

### 1.1 `createTaskPack` (`lib/task.mjs`)

The single entry point for Task Pack creation, reached from the CLI
(`lib/cli.mjs`, `task` command handler) and from tests. Its behavior
at baseline:

1. `validateSlug` — kebab-case only; rejects anything else before
   any filesystem access beyond `path.resolve`.
2. `relative` is fixed by construction:
   `docs/tasks/<slug>.md` (POSIX join). The slug cannot carry a
   separator, so the relative path has exactly three components.
3. If the destination already exists and `--force` was not given,
   refuse before any other work. If it exists and `--force` was
   given, the prior bytes are read through `readProjectBytes`
   (no-follow read path) for the preimage check.
4. `resolveProjectPath(target, relative, {purpose: 'read-existing' |
   'write-new'})` — validates the root ancestry and the path
   components (see §1.4). This is a *validation*, not a write.
5. `inspectProject(target)` — classification only (see §1.3). A
   `BLOCKED` classification refuses here, before any content is
   rendered or written.
6. `readProjectCommandAuthority` — reads `AGENTS.md` only. Command
   conflicts block creation. Missing `AGENTS.md` input is tolerated
   (`MISSING_INPUT`); any other read error propagates. **Creation
   never writes `AGENTS.md`, never executes a command, and never
   consults Git.** (No Git invocation exists in `lib/task.mjs`,
   `lib/adoption-inspect.mjs`, or `lib/capability-discovery.mjs`.)
7. `discoverProjectCapabilities` / `normalizeCapabilityEvidence` —
   read-only detection; results are rendered into the pack as
   evidence text.
8. `renderTaskPack` — pure string rendering. The pack is a Markdown
   document; it creates no manifest, no state, and no machine
   identity. It is not managed state.
9. Write branch (only when `!dryRun`):
   - destination exists → `replaceProjectFileIfUnchanged` with the
     SHA-256 preimage of the bytes read in step 3;
   - destination absent → `createOwnedPathExclusively`, which
     throws `E_G_FENCE_NO_GO` unconditionally at baseline.

**Consequence for this design:** the *only* fenced operation in
Task Pack creation is the create-new-file branch. The overwrite
branch is already outside the fence by an earlier, bounded design
(see §1.5). The scoped operation replaces *only* the create branch,
*only* when the eligibility predicate (§2.2) holds, and *only* via a
new caller-scoped helper. Every other step above is unchanged.

### 1.2 The shared gated helper (`lib/safe-create.mjs`)

`createOwnedPathExclusively(root, relative, bytes, {mode,
managedState})`:

- Calls `assertManagedMigrationGate()` **first, before any mkdir
  or file creation** (verified line 17). The gate throws
  `E_G_FENCE_NO_GO` unconditionally.
- Enforces byte-size (≤ 8 MiB) and mode bounds.
- Validates the full root hierarchy via `resolveProjectPath`,
  then walks the parent segments: each existing parent must be a
  real directory and not a symlink (`E_EXCLUSIVE_PARENT`); missing
  parents are created one at a time with `mkdir` mode `0o700` plus
  `syncContainingDirectory`, with `EEXIST` mapped to
  `E_EXCLUSIVE_PARENT_RACE`.
- Re-validates the destination, then opens it with
  `O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW`, writes, `fsync`s, closes,
  and syncs the containing directory. Mode is set on the new handle
  only — never `chmod` after close (the comment states why: a
  swapped name could change an unrelated file).

**Design constraint (non-negotiable):** this helper must remain
gated and unchanged. It is also used by `greenfield-apply-v2` for
managed writes; any exception placed inside it would leak to
managed operations. The scoped path therefore lives in a *new*
module and is *not* a modification of this helper.

### 1.3 Classification (`lib/adoption-inspect.mjs`)

`inspectProject` is documented read-only: it never calls
mkdir/write/rename and authorizes nothing. Verified behavior:

| Observation | Classification |
| --- | --- |
| Any root ancestor is a symlink / not a directory / missing | `BLOCKED` (`ROOT_LINK_REFUSED` / `ROOT_NOT_DIRECTORY` / `ROOT_MISSING`) |
| A `.vcp-adoption-(retired\|bootstrap-retired)-*` entry exists | `BLOCKED` (`RETIRED_ADOPTION_EVIDENCE_PRESENT`) |
| No `.vcp` entry, root empty | `NEW` |
| No `.vcp` entry, root non-empty | `EXISTING` |
| `.vcp` is a symlink or not a directory | `BLOCKED` (`STATE_NOT_DIRECTORY`) |
| `.vcp/manifest.json` missing / not a regular file / too large / invalid JSON / invalid schema | `BLOCKED` (`MANIFEST_MISSING` / `MANIFEST_NOT_REGULAR` / `MANIFEST_TOO_LARGE` / `MANIFEST_INVALID_JSON` / `MANIFEST_INVALID` / `SCHEMA_UNSUPPORTED` / `METADATA_UNSUPPORTED` / `ASSETSET_UNKNOWN`) |
| Manifest valid, schema v1 or v2 | `MANAGED` (with `schemaVersion`, `assetSet`, `lifecycleMutationAllowed: false`) |
| `MANAGED` + recovery blocked / recovery needed | `BLOCKED` (`MANAGED_RECOVERY_REQUIRED` or the recovery reason) |
| `MANAGED` + `.vcp/update.lock` present | `BLOCKED` (`ACTIVE_OR_STALE_LOCK`) |

Supporting facts verified in the same module:

- `verifySelectedRoot` walks **every** ancestor from the selected
  root to the filesystem root, `lstat`-ing each.
- `readTrustedManifest` opens the manifest with `O_RDONLY |
  O_NOFOLLOW`, re-checks identity (dev/ino/size/mtime) before and
  after the read, and caps size at 256 KiB. Parent-directory races
  are explicitly unproven, especially on Windows.
- After reading the manifest, the `.vcp` directory identity is
  re-checked (`STATE_CHANGED` on any dev/ino change).
- The `ownedBootstrapLock` exception applies only to a
  same-process live branded adoption lock and only when it is the
  sole control file. **The scoped path must call `inspectProject`
  with the default (`ownedBootstrapLock: null`) so no exception
  applies.**
- All managed state in the codebase lives under `.vcp/`
  (verified inventory: `backups/`, `transaction.json`,
  `manifest.json`, `stage/`, `update.lock`, `baselines/`,
  `staging-provenance.json`, `evidence/`, `writer-audit.log`,
  `quarantine/`, `.gitignore`, `prompt-eval/`). `lib/state.mjs`
  defines `VCP_DIR = '.vcp'` as the single state directory. No
  legacy marker outside `.vcp/` was found. **Therefore the
  classification `EXISTING`/`NEW` (no `.vcp` entry) is exactly
  equivalent to "no managed or legacy state present at
  classification time."** The design's remaining work is to make
  that statement hold *at creation time* (§2.3).

### 1.4 Path validation (`lib/safe-path.mjs`)

`resolveProjectPath(root, relative, {purpose, mustExist})`,
purposes `read-existing` / `write-new` / `managed-state`:

- Rejects NUL bytes, backslashes, absolute paths (POSIX and
  Win32), drive/UNC prefixes; rejects empty, `.`, `..`, `.git`,
  colon-bearing, trailing-dot/space, and Windows-reserved-name
  components.
- `.vcp` as first component is refused unless purpose is
  `managed-state`; `managed-state` requires `.vcp` as first
  component (`RESERVED_STATE` / `STATE_SCOPE`).
- Walks the root ancestry to the filesystem root: every component
  must exist, be a directory, and not be a symlink
  (`ROOT_MISSING` / `ROOT_LINK` / `ROOT_NOT_DIRECTORY`).
- Walks the relative components: symlinks refused (`LINK_REFUSED`),
  non-directory parents refused (`PARENT_NOT_DIRECTORY`); for
  `write-new`, an existing final component refuses
  (`DESTINATION_EXISTS`); for `read-existing`, a missing component
  refuses (`MISSING_INPUT`).
- **Limitation the design must cover itself:** for `write-new`
  with missing parents, deeper components are skipped unchecked
  (`missingParent` flag). The scoped helper must therefore perform
  its own per-parent validation/creation loop (mirroring
  `safe-create.mjs`), not rely on `resolveProjectPath` alone for
  not-yet-existing parents. `resolveProjectPath` also checks type
  at one instant only; it does not pin identities across the
  classify→create gap (§2.3).

### 1.5 Overwrite branch (`lib/safe-replace.mjs`)

`replaceProjectFileIfUnchanged` does **not** call the migration
gate. Its header documents why: it is exact-preimage replacement
for explicit user-approved non-lifecycle output, outside the
managed transaction boundary, bounded by preimage/postimage hash
re-checks, identity re-checks (dev/ino/mode), and a staging file
created with `O_EXCL` and removed afterwards. It explicitly "does
not carry the production writer's containment contract and must not
be cited as doing so," and notes the Windows junction/rename TOCTOU
limitation as unproven.

**Design consequence:** the overwrite branch is an established
precedent for a bounded non-lifecycle write, but its safety comes
from the *preimage* (the file already exists and its exact bytes
were reviewed). A create branch has no preimage; its safety must
come from the *predicate* (§2.2) plus *exclusivity* (§2.4). The two
mechanisms are different and must not be conflated in review.

### 1.6 Lifecycle locks (`lib/lifecycle-lock-v2.mjs`) — unusable here, by design

- `acquireLifecycleLock` creates `.vcp/update.lock` (and the `.vcp`
  directory) and requires Linux directory durability. Acquiring a
  lock would **create the very managed state the eligibility
  predicate forbids**. The scoped path therefore cannot use
  lifecycle locks for serialization.
- `assertOwnedLifecycleLock` requires a same-process minted lock
  object (WeakSet) and verifies lock/state dev/ino identity plus
  payload — the *pattern* (pin dev/ino, re-verify) is reusable;
  the *mechanism* is not.
- Serialization for the scoped path comes from `O_EXCL` atomicity
  alone (§2.4). This is sufficient for a single-file exclusive
  create and insufficient for multi-file transactions — which is
  why the scoped operation is strictly single-file.

### 1.7 Durability (`lib/file-durability.mjs`)

- `syncContainingDirectory` syncs the parent directory and
  re-verifies its dev/ino identity before and after. It refuses on
  any platform outside the allow-list `['linux']`
  (`E_DIRECTORY_SYNC_UNPROVEN`, reason
  `WINDOWS_NAMESPACE_DURABILITY_UNPROVEN` on win32). Directory
  fsync on Windows/NTFS is documented as already having failed
  natively.
- `assertLifecycleDurabilitySupported` is a preflight that refuses
  on unproven platforms before any mutation.
- **Design consequence:** if the scoped operation requires the
  directory sync (it should, for the same reason `safe-create`
  does), it is **Linux-only** until a Windows durability proof
  exists. The Windows refusal is then automatic and fail-closed
  via the existing preflight — no new platform branch is needed,
  and no Windows behavior may be inferred from Linux evidence.

### 1.8 Gate and migration surface (`lib/managed-migration.mjs`)

- `MANAGED_SCHEMA_MIGRATION_GATE` is frozen: `NO_GO`,
  `managedV2MutationAuthorized: false`.
- `assertManagedMigrationGate()` throws `E_G_FENCE_NO_GO`
  unconditionally with a fixed message.
- `previewManagedSchemaMigration` is zero-write and stays gated.
- Gate call sites (verified by search): `lib/init.mjs`,
  `lib/greenfield-apply-v2.mjs`, `lib/greenfield-recovery-apply.mjs`,
  `lib/committed-cleanup-apply.mjs`, `lib/lifecycle-lock-v2.mjs`
  (adopt mode), `lib/managed-schema-migrator.mjs`,
  `lib/production-writer.mjs`, `lib/safe-create.mjs`,
  `lib/stage13-apply.mjs`, `lib/stage13-bootstrap-retire.mjs`,
  `lib/stage13-committed-orphan-lock.mjs`,
  `lib/stage13-finalize.mjs`, `lib/cli.mjs` (Stage 13 recovery).
  None of these call sites is touched by this design.

### 1.9 What `createTaskPack` callers exist

- CLI: `lib/cli.mjs` `task` command only (plus tests). No other
  production caller of `createTaskPack` was found. The scoped
  behavior is therefore reachable from exactly one production call
  site, which bounds review.
- Tests calling `createTaskPack` use the legacy-v1 seeder, which
  **always** writes `.vcp/manifest.json` (verified in
  `test/helpers/legacy-v1-fixture.mjs`: `writeManifest` is
  unconditional, plus baselines and a `.gitignore`). Every such
  fixture classifies MANAGED. **Consequence: the 42 fenced tests
  exercise MANAGED fixtures and keep refusing under the scoped
  design; none of them changes outcome.** New tests for the scoped
  path need a new fixture class (plain project, no `.vcp`) — see
  the Acceptance Matrix.

## 2. Proposed scoped write path

### 2.1 Operation and placement (proposed)

- **New module** (proposed name): `lib/scoped-task-create.mjs`.
  It must not import `safe-create.mjs`'s gated helper for the
  write, must not import the lifecycle-lock module, and must not
  import any production-writer or migration module. Allowed
  imports: `safe-path.mjs` (validation), `file-durability.mjs`
  (sync/preflight), `adoption-inspect.mjs` (classification),
  `node:fs`/`node:fs/promises`, `node:path`.
- **Single caller:** the create branch of `createTaskPack` in
  `lib/task.mjs`. The call site is specified as:

  > If the destination does not exist, first attempt the scoped
  > path: run the eligibility validation of §2.2–§2.3 inside the
  > write operation. If validation passes, create via §2.4. If
  > validation refuses for any reason, fall through to the
  > existing gated helper (which refuses with `E_G_FENCE_NO_GO`)
  > — never to a silent success, never to a weaker helper. The
  > scoped refusal reason must be preserved in the error chain
  > (as `cause` or a structured `reason` field) so operators can
  > distinguish "ineligible for the scoped path" from "fence
  > refusal", while the user-facing outcome remains a refusal.

  Rationale for fall-through-to-gate (rather than throwing the
  scoped reason directly): the gate is the default-deny posture;
  a bug in the new predicate can then only *fail closed* (the
  gate still refuses), never *fail open*. The scoped reason is
  retained for diagnosis, not for authorization. Reviewers must
  confirm this ordering in the implementation diff.
- **No new CLI flags.** `vcp task` gains no flag; `--force` and
  `--dry-run` semantics are unchanged (§2.6). No new command.
- **Size/mode bounds** mirror the gated helper: bytes must be a
  `Buffer` ≤ 8 MiB; mode fixed at `0o644` (no caller-supplied
  mode; Task Packs are user-readable documents, never executable).

### 2.2 Eligibility predicate (all must hold; any failure refuses)

Evaluated inside the write operation, in this order. `E1`–`E4`
are the classification predicate; `E5`–`E10` are the
write-time re-validations (§2.3). Proposed refusal codes use an
`E_SCOPED_` prefix, distinct from `E_G_FENCE_NO_GO`, so the two
refusal families are never confused in tests or logs.

| # | Predicate | Refusal (proposed code) |
|---|---|---|
| E1 | `inspectProject(root)` (default options, no bootstrap exception) returns classification `NEW` or `EXISTING`. | `E_SCOPED_INELIGIBLE_STATE` (with the inspection `reason`, e.g. `MANAGED`, `BLOCKED`, `STATE_NOT_DIRECTORY`, `ACTIVE_OR_STALE_LOCK`, `MANAGED_RECOVERY_REQUIRED`, `RETIRED_ADOPTION_EVIDENCE_PRESENT`) |
| E2 | No `.vcp` entry exists at the root at validation time — checked by direct `lstat` in the write operation, not only via E1. Any entry (directory, file, or symlink) refuses. | `E_SCOPED_MANAGED_STATE_PRESENT` |
| E3 | No manifest file exists anywhere the inspector would read one: `.vcp/manifest.json` is already excluded by E2; additionally, no `manifest.json` at the project root and no `.vcp`-named entry of any kind. (Defense in depth against a partially-created state directory appearing between E1 and E2.) | `E_SCOPED_MANAGED_STATE_PRESENT` |
| E4 | No legacy/active lock or recovery marker: no `.vcp/update.lock` (excluded by E2), no `update.lock` at the root, no `.vcp-adoption-*` entry at the root, no `transaction.json` at the root. | `E_SCOPED_RECOVERY_STATE_PRESENT` |
| E5 | The selected root and every ancestor to the filesystem root are real directories, not symlinks, with identities (dev, ino) pinned at first observation and unchanged at re-verification (§2.3). | `E_SCOPED_NAMESPACE_CHANGED` / `E_VCP_PATH` (`ROOT_LINK`) |
| E6 | The relative path is exactly `docs/tasks/<slug>.md` with a validated kebab-case slug (already enforced by `createTaskPack`); `resolveProjectPath` with purpose `write-new` accepts it and the final component does not exist. | `E_VCP_PATH` (existing reasons) / `E_SCOPED_ALREADY_EXISTS` |
| E7 | Every existing parent component (`docs`, `docs/tasks`) is a real directory, not a symlink, with pinned identity matching §2.3; missing parents are created only by the loop in §2.5. | `E_SCOPED_PARENT_UNSAFE` |
| E8 | The durability preflight (`assertLifecycleDurabilitySupported`) passes — on current evidence this restricts the operation to Linux. | `E_DIRECTORY_SYNC_UNPROVEN` (existing code/reason) |
| E9 | The content is a `Buffer` ≤ 8 MiB (already true from `renderTaskPack`, re-asserted at the boundary). | `E_SCOPED_BYTES` |
| E10 | No lifecycle lock is held or acquired for this operation, and no `.vcp` directory is created at any point (including on failure paths). | Internal invariant; violation is a defect, not a refusal code. Verified by test (see Matrix SC-T41). |

**Explicitly NOT eligibility criteria** (do not add without a new
decision): Git presence or cleanliness (creation reads no Git
state); package manager or stack detection outcome (capability
evidence is rendered text, not authorization); file count or
project size; user identity or privilege level (the operation
runs with the invoker's existing filesystem rights; it must not
escalate, drop, or check privilege).

### 2.3 Classify → validate → create transition (with re-validation)

A CLI-level eligibility check alone is **not sufficient**: the
filesystem can change between classification and creation. The
transition is therefore specified as five phases, with validation
*inside* the write operation at the moment of creation:

1. **Classify (read-only).** Call `inspectProject` (default
   options). Record classification, reason, and the pinned
   identities: for the root and every ancestor, and for each
   existing parent component, record `(dev, ino)` from `lstat`
   (bigint where available, matching the lock module's practice).
   Record also the absence proof: `lstat('.vcp')` → `ENOENT`.
   If classification is not `NEW`/`EXISTING`, refuse (E1).
2. **Render (pure).** Render the pack content in memory. No
   filesystem mutation in this phase. (Already the case in
   `createTaskPack`; the scoped helper receives finished bytes.)
3. **Re-validate (immediately before creation).** Re-run the
   *cheap, decisive* checks, in order: (a) re-`lstat` root and
   ancestors, compare dev/ino to the pins — any difference refuses
   (`E_SCOPED_NAMESPACE_CHANGED`); (b) re-`lstat` `.vcp` — any
   entry refuses (E2); (c) re-`lstat` the lock/marker paths (E4);
   (d) re-run `resolveProjectPath` for the destination with
   `write-new` — any refusal propagates; (e) re-run the durability
   preflight (E8). The full `inspectProject` is **not** re-run
   (its manifest parsing is unnecessary once `.vcp` absence is
   re-proven, and re-running it would widen the window); the
   re-validation checks are exactly the state that could have
   changed into managed state.
4. **Create (§2.4–§2.5).** Parent loop, then exclusive open, write,
   fsync, close, directory sync. After the directory sync,
   re-verify the parent directory identity once more (mirroring
   `syncContainingDirectory`'s own after-check) and verify the
   created file's identity matches the opened handle's
   `(dev, ino)`; any mismatch refuses and the file is left in
   place for manual inspection (never silently removed — see
   §2.5 cleanup rules; a mismatched file is evidence, not trash).
5. **Report.** Return `{file, relative, size, sha256}` mirroring
   the gated helper's return shape (plus the eligibility record:
   classification observed and predicate version, for audit).
   The CLI output format is unchanged.

**Namespace-swap protection, stated honestly:** pinning
`(dev, ino)` across phases 1→3→4 detects swaps that change the
identity of any checked directory. It does *not* provide the
atomicity of `openat2`/`RESOLVE_NO_SYMLINKS` descriptor-relative
operations, and it does not close the window between the final
re-validation and the `open` call — that window is closed by
`O_EXCL` + `O_NOFOLLOW` on the final open itself (the destination
cannot be a pre-planted symlink, and cannot already exist). A swap
of a *parent* directory in that final micro-window could still
redirect the created file into a different directory tree; the
post-sync identity re-verification detects it after the fact, and
the created file is then a *new file in the wrong tree* — the
design's mitigation is that the operation creates only a Markdown
document containing no secrets and no executable content, in a
tree the invoker could already write to (see Threat Model T3 for
the full analysis and the Windows caveat). No stronger guarantee
is claimed. Descriptor-pinned creation via the native helper is
recorded as a follow-up hardening (§6), not a v1 requirement.

**Concurrent mutation:** two concurrent scoped creations for the
same slug race on `O_EXCL`: exactly one wins; the other gets
`EEXIST` → `E_SCOPED_ALREADY_EXISTS` (mapped from the existing
`DESTINATION_EXISTS` semantics). Two creations for *different*
slugs in the same new project race on parent creation: the parent
loop treats `EEXIST` on `mkdir` as "re-verify and continue" (never
as success-by-assumption); a parent that appears as a symlink or
non-directory refuses. Concurrent *managed-state* creation (an
old CLI `init`, a lifecycle lock, a `.vcp` directory appearing)
between phases 3 and 4 is detected only if it changes a pinned
identity or creates `.vcp` before phase 3; a `.vcp` created after
phase 3 but before the file open is **not** detected by this
design — recorded as a residual risk (Threat Model T7/R-3):
the created file is still only a task document, and the managed
state itself is untouched. The design does not claim
old/new-writer mutual exclusion; D-01's reopen conditions still
require that proof for full GO.

### 2.4 Exclusive-creation semantics (proposed primitive: direct `O_EXCL`)

Mirror `createOwnedPathExclusively`'s final open exactly:

```text
open(destination, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o644)
  → write all bytes → fsync → close → syncContainingDirectory(destination)
```

Justification: it is the codebase's existing exclusive-create
primitive; `O_EXCL` makes creation atomic with respect to
existence (the kernel decides); `O_NOFOLLOW` refuses a swapped-in
symlink at the final component on POSIX; mode is fixed on the new
handle; no `chmod` after close. On Windows, `O_NOFOLLOW` is 0
(Node constant absent) and junction behavior is unproven — the
operation is therefore Linux-only in v1 via the durability
preflight (§1.7), and Windows behavior must not be inferred.

**Crash/partial-write semantics (honest):** a crash during the
write leaves a *partial file that exists*. The scoped path never
overwrites, so a later creation for the same slug refuses
(`E_SCOPED_ALREADY_EXISTS`) and the user must remove the partial
file manually (or use the existing `--force` overwrite path, which
requires reviewing the file and passes the preimage check). The
partial file contains only rendered pack text (no secrets — the
pack contains no credentials; command strings come from the
project's own `AGENTS.md`). This residual is accepted explicitly
as a UX cost, not hidden. The alternative — stage-temp +
`link(2)` atomic commit (the PH-06 design-A primitive) — would
leave only temp orphans on crash, but needs a new native-helper
operation for the anchored path and a Windows equivalent; it is
specified as follow-up hardening F-H1 (§6), not v1 scope.

**What is NOT guaranteed:** atomicity of the multi-step sequence
(parent creation + file creation + directory sync) as a whole;
durability across power loss beyond what `fsync` +
directory-sync provide on the host filesystem (B-2 remains
NOT_PROVEN — no power-loss rig exists); any behavior on
filesystems without POSIX `O_EXCL` semantics.

### 2.5 Parent directories and cleanup

Parent loop (for `docs`, then `docs/tasks`), mirroring
`safe-create.mjs`:

- For each parent, `lstat`: if it exists, it must be a real
  directory, not a symlink, with identity matching the pin (or,
  if unpinned because it did not exist at phase 1, record its
  identity now and verify it is a directory); else refuse
  (`E_SCOPED_PARENT_UNSAFE`).
- If it does not exist (`ENOENT`): `mkdir` with mode `0o700`
  (matching the gated helper; parent dirs of task packs are
  project-internal), then `syncContainingDirectory` for the
  grandparent, then re-`lstat` and verify directory + identity.
  `EEXIST` from a concurrent creator is handled by re-`lstat`
  and re-verification, never by assuming success.
- Record every directory *this call* created, in order, in a
  created-parents ledger.

Cleanup on failure:

- If failure occurs *before* the file is created: remove, in
  reverse order, only ledger directories that are still empty
  and whose identity still matches the ledger; use `rmdir`
  (which refuses non-empty directories — never recursive
  removal). If a ledger directory is non-empty or its identity
  changed, leave it and report it. Never remove a pre-existing
  directory. Never remove the destination file on the grounds
  that creation "failed" after the file exists — see §2.4.
- If failure occurs *after* the file is created (e.g. directory
  sync fails): leave the file in place, report the failure with
  the file path and the sync error, and refuse to claim success.
  The file's existence is a fact the next invocation observes
  (`E_SCOPED_ALREADY_EXISTS`); deleting it would destroy
  evidence and re-open the race it just won.
- Cleanup failures are reported, never swallowed: the returned
  error carries the original failure plus a `cleanup` note
  listing leftover ledger directories.

### 2.6 CLI and flag semantics

- `vcp task <slug>` (no `--force`, destination absent, eligible
  project): creates via the scoped path; output unchanged.
- `vcp task <slug> --dry-run`: no write, as today; eligibility
  is still evaluated and reported in the dry-run output only as
  today (the dry-run path does not reach the write operation, so
  no predicate evaluation is required there — do not add one).
- `vcp task <slug> --force`, destination exists: overwrite path,
  unchanged (preimage-checked). `--force` never bypasses
  eligibility: if the destination does not exist and the project
  is ineligible, the scoped path refuses and the gate refuses,
  with or without `--force`.
- Ineligible project (any classification/state): refusal message
  must name the scoped reason *and* the standing fence state
  (D-01 DEFERRED / G-FENCE NO-GO), so users are never led to
  believe the fence was lifted. Exact wording is an
  implementation detail for review; the invariant is that no
  success or fence-lifting message is ever printed for a refusal.
- Exit codes: refusal → non-zero (matching current fence
  behavior: the CLI surfaces the thrown error). No new exit-code
  contract is proposed.

### 2.7 Invariants (normative; each must have a test — see Acceptance Matrix)

- INV-1: The gate function and the shared helper are byte-identical
  before and after implementation (verified by diff).
- INV-2: No managed write path (init, update apply, migration,
  recovery-apply, production writer, lifecycle-lock acquisition,
  Stage 13 apply/finalize) becomes reachable through the scoped
  operation; the scoped module imports none of their modules.
- INV-3: The scoped operation writes exactly one file,
  `docs/tasks/<slug>.md`, and creates only its parent directories
  (`docs`, `docs/tasks`). It never writes a manifest, `.vcp`
  entry, lock file, backup, `AGENTS.md`, or any file outside
  `docs/tasks/`.
- INV-4: Eligibility is re-validated inside the write operation
  (phases 3–4); no CLI-level or caller-level check substitutes
  for it.
- INV-5: Creation is exclusive (`O_EXCL`); an existing destination
  of any kind (file, directory, symlink) refuses; nothing is ever
  overwritten by the scoped path.
- INV-6: Symlinked roots, ancestors, parents, or destinations
  refuse; no symlink is ever followed for writing.
- INV-7: Command-authority and no-follow contracts are unchanged
  (no authority code is touched; the pack's commands still come
  from `AGENTS.md` and still require exact match at readiness).
- INV-8: On Windows (and any non-Linux platform), the operation
  refuses via the existing durability preflight until a
  Windows-native proof exists. Linux evidence never implies
  Windows behavior.
- INV-9: A failure never leaves the project in a state the
  scoped path would misread as eligible-managed confusion: no
  partial managed state is ever created; leftover ledger
  directories are empty plain directories, reported, and
  re-checked on the next invocation.
- INV-10: The operation creates no authorization: no gate, CI,
  merge, release, or production-writer decision may cite a
  scoped-created Task Pack as evidence of anything beyond "a
  Markdown file exists."

## 3. Security contracts preserved

| Restriction | How preserved | Evidence |
|---|---|---|
| D-01 DEFERRED | `docs/decisions/D-01.json` untouched; no migration/init/update path opened; scoped ruling recorded separately (see Decision Proposal) | Decision-record diff; gate tests unchanged |
| G-FENCE NO-GO | Gate function unchanged; all 15+ gate call sites unchanged; scoped path does not call the gate's bypass (there is none) and falls through to it on ineligibility | Diff; 42 F1 tests still refuse (§1.9) |
| Shared helper gated | `lib/safe-create.mjs` byte-identical; scoped helper is a separate module | Diff hash |
| Production writers DISABLED | `lib/production-writer.mjs` untouched; scoped module does not import it; no transaction/journal/lock primitive is used | Import graph check in review |
| Schema-v2 migration refused | `lib/managed-schema-migrator.mjs` untouched; no manifest is read for writing or written | Diff; MANAGED fixtures still refuse |
| Recovery-apply refused | `lib/greenfield-recovery-apply.mjs`, `lib/stage13-*` untouched; recovery markers are refusal triggers (E4) | Diff; F5/F5b tests unchanged and still failing as designed |
| Lifecycle-lock acquisition refused | Scoped path acquires no lock and creates no `.vcp/update.lock`; lock module not imported | Import graph; test SC-T41 |
| L3 authorization DISABLED | Untouched; Task Pack creation involves no review evidence | No L3 code in the call path (verified) |
| Mandatory CI enforcement DISABLED | Untouched; no CI code in the call path | No CI code in the call path (verified) |
| Symlink/no-follow (D-03) | `resolveProjectPath` + per-parent `lstat` + `O_NOFOLLOW` + identity pins; D-03 selected policy unchanged | Threat Model T2; Matrix symlink cases |
| Command authority | `lib/command-authority.mjs` untouched; readiness still enforces exact match | Diff; boundary probe re-run in acceptance |
| Old/new CLI coexistence | **Not authorized.** The design creates no managed state and installs no v2 assets; coexistence safety is neither claimed nor implied (§4) | Decision language (§6 / Decision Proposal) |

## 4. Historical old-CLI data-loss proof — assessment

The D-01 record (owner Moeeryani, 2026-10-09, Option C) rests on
an authenticated POC against published `vibe-coding-production@0.9.3`:
7/12 Linux and 8/13 native Windows scenarios lost post-backup user
edits or mutated state unsafely, including: silent v2→v1 rollback
downgrade; erasure of post-backup user edits by old rollback; stale
`transaction.backupId` outranking the newest backup; dead-PID/aged
locks stale-reaped before downgrade; old CLI ignoring the separate
`lifecycle.lock`; and old `init --force` recreating a v1 manifest
and overwriting `AGENTS.md` (including with a directory-shaped
`update.lock` and absent manifest — the counterexample that killed
the directory-sentinel fence). A later source-level fix (B-3)
eliminated the `init --force` defect class in the *new* CLI; the
published 0.9.3 artifact remains hazardous and D-01 remains
DEFERRED. All of this is unchanged by this design.

**Why the scoped path does not recreate the POC conditions:**

1. The POC harm requires *managed state* for the old CLI to
   misinterpret: a manifest, `.vcp/` contents, backups, locks, or
   `AGENTS.md` under management. The scoped operation creates
   none of these (INV-3, INV-10). A `docs/tasks/*.md` file is
   plain Markdown the old CLI never reads, writes, or backs up.
2. The POC's destructive operations are old-CLI *lifecycle*
   operations (init/update/rollback) acting on managed projects.
   The scoped path is not a lifecycle operation and does not
   change any project's lifecycle state: an EXISTING project is
   EXISTING before and after, with one added document.
3. The one shared surface is `AGENTS.md`: old `init --force`
   overwrote it. The scoped path never writes `AGENTS.md`, so it
   cannot create the post-backup-edit-loss condition for that
   file. (If the user later runs old `init --force` on the
   project, the old CLI's behavior is unchanged and unendorsed —
   see below.)

**What is NOT claimed:** that old and new CLIs can safely
coexist on the same project; that a scoped-created Task Pack
survives an old-CLI lifecycle operation (it may be ignored,
never backed up, and is regenerable — that is the residual, and
it must be documented to users, not hidden); or that the
predicate eliminates concurrent old/new-writer races (it does
not — §2.3 residual R-3). Any product messaging that implies
coexistence safety is a defect in review.

## 5. Implementation plan (for the owner-approved follow-up only)

Vertical slices, in order. No slice begins before the owner
decision (Decision Proposal) and the acceptance gates (Matrix)
are satisfied for the preceding slice.

1. **S1 — New module + call site.** Add `lib/scoped-task-create.mjs`
   implementing §2 (predicate, pins, parent loop, O_EXCL create,
   cleanup, error codes). Wire the single call site in
   `lib/task.mjs` with fall-through-to-gate ordering. No other
   production file changes. Add the decision record
   (`docs/decisions/SC-01.json`, draft in the Decision Proposal)
   in the same change set, so the code and its authorization
   travel together.
2. **S2 — Tests.** Implement the Acceptance Matrix cases
   (SC-T01…SC-T49) including the new unmanaged-project fixture
   helper. Confirm the 42 F1 tests are untouched and still
   refuse; confirm no existing test file is modified except
   where the Matrix explicitly requires a new expectation (none
   is expected — see §1.9).
3. **S3 — Independent validation.** Adversarial probe campaign
   against the implementation (fresh fixtures, namespace-swap
   harness, concurrent-creation harness), plus re-run of the
   Phase 1 boundary probe and the full suite. Linux only.
4. **S4 — Documentation.** Regenerate the conformance matrix doc
   (including retiring the stale NEG-02 note, follow-up F-1 from
   Phase 1), update `docs/CLI.md` task-command behavior for
   eligible projects, and record the Linux-only scope and the
   old-CLI coexistence non-authorization in user-facing docs.

Estimated scope: one new module (~200 lines), one call-site
hunk, one decision record, one fixture helper, ~49 tests. No
dependency, no schema, no migration, no new CLI surface.

## 6. Open questions and follow-up hardenings (not decided here)

- **Q1 (owner):** Is Linux-only v1 acceptable, with Windows
  refusing via the existing preflight, or must Windows proof
  precede any activation? Recommendation: Linux-only v1 (see
  Decision Proposal).
- **Q2 (reviewer):** Error-code naming — `E_SCOPED_*` prefix vs
  reusing `E_VCP_PATH` reasons. Recommendation: distinct prefix
  for refusal-family separation in tests/logs.
- **F-H1:** Stage-temp + `link(2)` atomic commit (PH-06 design A)
  to eliminate partial-file-on-crash. Requires native-helper
  work; defer until after v1 validation.
- **F-H2:** Descriptor-pinned creation via the native helper
  (`openat2`-style) to close the final parent-swap micro-window.
  Requires helper + Windows proof; defer.
- **F-H3:** Conformance-matrix regeneration (F-1) and CLI doc
  updates, in S4.

— End of design —
