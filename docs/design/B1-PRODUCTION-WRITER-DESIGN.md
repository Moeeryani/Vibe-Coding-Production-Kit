# B-1 Production Writer — Design Specification

Status: DESIGN DRAFT — not an implementation, not an enablement decision.
D-01 = DEFERRED, G-FENCE = NO-GO, Production Writers = DISABLED.
This document changes no gate state.

## 0. Assumptions and corrections

The task brief listed "D-01 Windows live validation, NTFS fixture proof,
identity isolation, kernel denial proof" as completed. The record says:
- Windows live validation: UNVERIFIED (no Windows host in sandbox).
- NTFS fixture: machinery exists (`scripts/native/vcp-windows-d01-*.cpp`);
  live NTFS execution UNVERIFIED.
- Identity isolation: Linux DAC denial proven live
  (`kernelDacDenialObserved: true`, old uid denied EACCES); Windows UNVERIFIED.
- Kernel denial: Linux EACCES observed; Windows native helper not executed.
- B-3 CLI source fix: DONE (commit 475b24b; regression tests; artifact validated).
- B-6 Linux acceptance: DONE (b36b0997 lane green except pre-existing failures).

This design therefore treats every Windows-side proof as UNVERIFIED and
specifies fail-closed behavior wherever a proof is missing. Nothing in this
document substitutes for those proofs.

---

## Section 1 — Current writer state

```text
Production Writers = DISABLED
```

### Where this is enforced

1. `lib/managed-migration.mjs` — `MANAGED_SCHEMA_MIGRATION_GATE` is a frozen
   constant: `{id:'D-01/G-FENCE', status:'NO_GO', managedV2MutationAuthorized:false}`.
   `assertManagedMigrationGate()` throws `E_G_FENCE_NO_GO` unconditionally.
2. `lib/init.mjs:17` — `initProject()` throws on `force` before any
   filesystem touch; then calls `assertManagedMigrationGate()` before
   `mkdir`, backup, or lock on every path (BLOCKED root, MANAGED root,
   NEW root).
3. `lib/greenfield-apply-v2.mjs` — the candidate Stage12 transaction writer
   calls `assertManagedMigrationGate()` as its first statement ("There must
   be no createBackup(), lock bootstrap or user file write ahead of this
   check").
4. `lib/cli.mjs` — existing-repo adoption prints "No files written." (exit 1);
   `--force` on the new path throws before planning.

Enforcement is layered (CLI → initProject → writer → gate constant), so no
single bypass enables writes.

### Why it is disabled

D-01 is DEFERRED: the published 0.9.3 CLI was proven (7/12 Linux, 8/13
Windows scenarios) to destroy post-backup user edits, ignore locks, and
overwrite `AGENTS.md` via `init --force`. Until a complete compatibility
fence is proven (D-01.json reopen conditions) and G-FENCE is released, any
managed mutation could race with — or be undone by — an old-principal
writer. Writes are disabled to prevent the new writer from creating state
the old CLI can silently corrupt.

### What risk it prevents

- Silent user-data loss from old/new writer interleaving.
- Schema-v2 state that the old 0.9.3 CLI can downgrade or erase.
- Partial migrations with no proven recovery path.
- A false sense of safety: green local tests are not a fence.

---

## Section 2 — Writer responsibilities

The Production Writer is the SOLE component authorized to mutate managed
project state. It is not the CLI: the CLI parses intent and transports
parameters; the writer validates identity, acquires locks, journals,
mutates, verifies, and commits. No other module may write to `.vcp/` or to
managed project files.

### Allowed operations

```
Operation: init (greenfield)
Purpose: Create a new managed project in an EMPTY root.
Required authorization: D-01/G-FENCE gate GO; root classified NEW and empty
  at plan time AND re-verified empty after lock acquisition.
Required evidence: versioned backup identity; journal phases
  prepared→applying→verified→committed with hash chain; manifest content hashes.
Failure behavior: throw before any write; preserve .vcp state for inspection;
  never best-effort-cleanup a failed bootstrap.
```

```
Operation: update (managed migration / version bump)
Purpose: Advance managed state (e.g., schema v1→v2, reader version bump).
Required authorization: D-01/G-FENCE gate GO; MANAGED classification;
  recovery not required (inspectManagedRecovery clean); reader version > 0.9.3.
Required evidence: pre-migration versioned backup; journal with
  minimumReaderVersion; byte-for-byte user-file retention proof.
Failure behavior: abort; backup + journal preserved; recovery-plan (read-only)
  describes repair; never auto-retry a failed migration.
```

```
Operation: manage track / manage ignore (metadata only)
Purpose: Record user intent about managed paths without touching content.
Required authorization: gate GO; MANAGED classification; lock ownership.
Required evidence: journal entry with before/after path sets.
Failure behavior: metadata write is journaled; on failure, journal shows
  the operation as not-committed; no content touched by definition.
```

```
Operation: rollback (restore from versioned backup)
Purpose: Restore the exact byte state captured by a backup ID.
Required authorization: gate GO; backup ID exists and hash-verifies;
  explicit operator confirmation (never implicit).
Required evidence: backup manifest hash; pre-rollback journal entry;
  post-rollback byte comparison receipt.
Failure behavior: if the backup fails hash verification → refuse; if the
  restore is interrupted → journal + original backup preserved; the
  partially restored tree is marked uncommitted until verified.
```

```
Operation: manifest update (as a transaction phase only)
Purpose: Record the committed state (content hashes, schema version).
Required authorization: only inside an open, locked, journaled transaction
  after all content writes verified.
Required evidence: manifest content hash recorded in the journal 'committed'
  phase; manifest mode 0o600.
Failure behavior: manifest is written LAST; if it fails, the transaction is
  not committed and recovery replays from the journal.
```

### Forbidden operations

- Bypassing identity checks: no write without lock-owner == current principal.
- Uncontrolled overwrite: no direct `writeFile` over existing paths; all
  creates are exclusive (`createOwnedPathExclusively`); renames are atomic.
- Destructive mutation outside a transaction: no ad-hoc deletes, no
  truncate-in-place, no `rm -rf` of managed state.
- Silent data loss: every destructive op requires a versioned backup FIRST;
  the backup ID is in the journal before the first mutation.
- Writing when the gate is NO-GO: `assertManagedMigrationGate()` is the
  first statement of every writer entrypoint; it is not catchable for
  retry (callers must not swallow `E_G_FENCE_NO_GO`).
- Touching paths outside the selected root: all paths resolved and
  contained; `..` escape refused; symlinks never followed for writes.
- Writing through reparse points / junctions (Windows): refused; see B-9.
- Disabling or weakening `--force` refusal, durability preflight, or the
  journal hash chain to achieve a green test.

---

## Section 3 — Security model

### Identity

- Who is the writer identity? The OS principal executing the process:
  numeric UID/GID on POSIX; process token user SID on Windows.
- How is it authenticated? By the OS (process credentials). The writer
  additionally reads back its own identity at transaction start
  (`GetTokenInformation(TokenUser)` / `process.getuid()`) and records it
  in the lock file and journal.
- How is it pinned? The lifecycle lock file records owner UID/SID + a
  random lock token. Every transaction phase re-reads the lock and aborts
  on owner mismatch ("stale identity").
- How is impersonation prevented? No setuid/setgid; no token passing
  between processes; no environment-variable identity; lock ownership is
  verified against live OS credentials, not cached values. On Windows,
  the native token inspector (`vcp-windows-d01-token-inspect`) provides
  the SID/DACL ground truth; SID strings alone are never trusted.

### Authorization

- Ownership checks: managed files must be owned by the expected principal
  (writer UID on POSIX; recorded owner SID on Windows). Mismatch → refuse.
- Object identity checks: files/directories are pinned by identity, not
  path: `(dev, ino)` on POSIX, file ID (volume serial + file index) on
  Windows. Re-verify before each transaction phase; mismatch → abort
  (rename/replace attack).
- Namespace checks: every path resolved with `path.resolve`, must stay
  within `root + sep`; `..` segments refused; symlink components refused
  for write paths (`O_NOFOLLOW` / `FILE_FLAG_OPEN_REPARSE_POINT`).
- ACL requirements: on Windows, per-object `AccessCheck` for the dangerous
  rights (DELETE, FILE_DELETE_CHILD, FILE_ADD_FILE/FILE_ADD_SUBDIRECTORY,
  WRITE_OWNER, WRITE_DAC) must be evaluated for the writer token; any grant
  to the legacy principal → refuse (see `lib/d01-principal-boundary.mjs`
  assessment codes).

### Isolation

- Old principals are blocked by OS discretionary access control, proven by
  live kernel-denial probes (Linux: EACCES observed for old uid; receipt
  in the D-01 evidence set). The writer never relies on filename conventions.
- Unauthorized writers are rejected at three layers: gate (`E_G_FENCE_NO_GO`),
  lock ownership (UID/SID mismatch), and per-phase identity re-verification.
- The unchanged published 0.9.3 CLI never calls writer modules; writer
  modules never trust 0.9.3-produced state without re-validation.

---

## Section 4 — Storage model

Managed state lives under `<root>/.vcp/`:
`manifest.json` (0o600), `backups/<id>/`, `stage/`, `transaction.json`
(versioned journal), `update.lock` (lifecycle lock), `.gitignore` (keeps
state out of git). User content lives outside `.vcp/` except baselines.

### Writes

Never direct overwrite. The required pattern per file:
1. Write content to a temp file in the SAME directory (same filesystem →
   rename is atomic).
2. `fsync` the file handle.
3. `fsync` the containing directory (`syncContainingDirectory`) — proves the
   directory entry is durable. On Windows this is UNPROVEN → the write
   transaction must fail closed (`E_DIRECTORY_SYNC_UNPROVEN`).
4. Atomic rename temp → target.
5. Re-verify content hash after rename.

`createOwnedPathExclusively` enforces exclusive create (no clobber).

### Metadata

Ordering (from the existing transaction writer, to be preserved):
journal `prepared` → `applying` → content writes → `verified` →
`committed` (with manifest hash) → manifest.json written LAST →
journal cleared. The journal hash-chains each phase (`previousHash`), so a
torn journal is detectable. The manifest is never updated before content
is verified.

### Failure

- Partial write: temp file without rename → invisible to readers; journal
  `applying` without `committed` → recovery replays or rolls back.
- Interrupted commit: journal shows the last completed phase; recovery
  resumes from there or restores the backup; never deletes the journal to
  "clean up".
- Crash during rename: atomic rename guarantees old-or-new, never torn.
- Failed metadata update: transaction stays uncommitted; backup preserved;
  `read-only recovery-plan` describes repair; operator (not automation)
  decides.

---

## Section 5 — Relation to other blockers

### B-2 Power-loss — what evidence the Writer needs

- Per-mutation directory-fsync proof on the target filesystem (Linux:
  implemented in `file-durability.mjs`; must be proven per deployment).
- Windows: NO directory-fsync proof exists (Node directory fsync fails on
  NTFS) → the Writer MUST refuse write transactions on Windows until a
  native durability implementation is proven. This is B-2's gating proof
  for the Writer.
- Journal + backup must themselves be fsync'd before the commit phase.

### B-4 Atomicity — what guarantees the Writer must expose

- Atomic rename commits (old-or-new, never torn).
- Lock mutual exclusion: one writer per root (lifecycle lock, owner-pinned).
- Journal hash chain gives total ordering of phases; recovery is
  deterministic from any prefix.
- Crash injection tests per phase (see test plan) before enablement.

### B-5 Rollback — how the Writer preserves previous state

- Versioned backup BEFORE the first mutation of any destructive op; backup
  ID embedded in the journal.
- Backups are content-addressed and hash-verified on restore.
- Rollback restores byte-for-byte (receipt with before/after hashes);
  user edits made after the backup are NEVER silently discarded by
  rollback — restore requires explicit operator confirmation and records
  what was replaced.

### B-9 Parent race — how the Writer prevents namespace attacks

- Pin every ancestor directory by file identity (`dev`/`ino`; Windows file
  ID) at lock acquisition; re-verify before each phase; abort on change.
- Refuse to write through symlinks, junctions, or reparse points.
- Exclusive creates only; renames only within the pinned tree.
- The existing `noReparseAncestors` + identity-pin pattern from the D-01
  native helpers is the reference implementation to reuse.

---

## Section 6 — Enablement gate

Exact requirements before `Production Writers = ENABLED`:

| Requirement | Evidence Needed | Status |
|-|-|-|
| D-01 accepted by maintainer | Explicit approval + D-01.json status ACCEPTED | BLOCKED (DEFERRED) |
| G-FENCE released | Published 0.9.3 adversarial proof across platforms incl. concurrency/crash/atomic transition | BLOCKED (NO-GO) |
| Identity proof | OS principal pinning + lock-owner verification, Linux and Windows | PARTIAL (Linux proven; Windows UNVERIFIED) |
| Authorization proof | Ownership/object-identity/namespace/ACL checks green on both platforms | PARTIAL (Linux proven; Windows UNVERIFIED) |
| Atomic commit proof | Crash-injection per journal phase, old-or-new verified | BLOCKED (not run) |
| Recovery proof | Journal replay + backup restore from every interrupted phase, byte-exact | BLOCKED (not run) |
| Durability proof | Directory-fsync per mutation; Windows native implementation | BLOCKED (Windows UNPROVEN by design) |
| Old/new concurrency proof | Old 0.9.3 vs new writer races, no silent loss either direction | BLOCKED (not run) |
| Audit trail | Journal + receipts for every mutation, hash-chained | DESIGNED (code exists, gated) |
| Maintainer approval | Explicit human GO for writer enablement | BLOCKED (not requested) |

Enablement is a maintainer decision, not a code change. Flipping
`managedV2MutationAuthorized` without every row above is forbidden.
