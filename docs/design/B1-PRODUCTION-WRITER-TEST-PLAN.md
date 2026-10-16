# B-1 Production Writer — Test Plan

Status: DESIGN DRAFT — tests are specified, not implemented. They may only
run against the writer while the D-01/G-FENCE gate remains NO-GO in
hardened disposable fixtures; none of them enables production writes.

Conventions: every test records (scenario, principal UIDs/SIDs, file
identity pins, journal hashes, byte receipts). A test that cannot run on
the current platform SKIPS with an explicit reason — never simulates.

## Security tests

- Wrong identity: run the writer as uid B while the lock is owned by uid A
  → every phase refuses with lock-owner mismatch; zero writes.
- Stale identity: acquire lock as uid A, then attempt phases after the lock
  file is replaced (new owner) → abort on re-verification.
- Token mismatch (Windows): writer token SID differs from lock SID →
  refuse. (UNVERIFIED until Windows host.)
- Legacy principal write attempt: old-principal uid attempts each writer
  operation → OS denies (EACCES); writer never consulted.
- Symlink swap: replace a managed path with a symlink mid-transaction →
  write refused (`O_NOFOLLOW` / reparse-point check).
- Parent rename race: rename an ancestor directory mid-transaction →
  identity re-verification aborts before the next phase.
- `--force` regression: `init --force` on modified AGENTS.md → refused
  before any write; file byte-identical (see `test/init-force-safety.test.mjs`).
- ACL grant to legacy principal (Windows): DACL granting old SID any
  dangerous right → authorization refuses. (UNVERIFIED until Windows host.)

## Reliability tests

- Crash during write: kill the process between temp-write and rename →
  temp file invisible; journal shows `applying` uncommitted; recovery
  replays cleanly.
- Interrupted commit: kill between `verified` and `committed` → journal
  prefix deterministic; recovery either completes or restores backup;
  manifest never half-written (written last, single rename).
- Crash during rename: atomic rename → old-or-new verified by content hash;
  never torn.
- Failed metadata update: manifest write fails (ENOSPC injection) →
  transaction uncommitted; backup preserved; read-only recovery-plan
  describes repair.
- Power loss per phase (B-2): for each journal phase, power-cycle the
  fixture → on reboot, state is either pre-transaction or committed, with
  journal+backup intact. (Requires power-loss rig; UNVERIFIED.)
- Directory-fsync failure: make `syncContainingDirectory` fail →
  transaction aborts before first mutation (`E_DIRECTORY_SYNC_UNPROVEN`).

## Concurrency tests

- Two writers: second `acquireLifecycleLock` while first holds it → refuses;
  no interleaved phases.
- Conflicting writes: two sequential transactions touching the same file →
  second sees the first's committed manifest hash; no lost update.
- Old/new race: published 0.9.3 CLI and the new writer operate on the same
  root concurrently → either the old op is denied by OS policy or the new
  writer aborts on identity/lock mismatch; byte receipts prove no silent
  loss in either direction. (Requires OS-enforced principal separation;
  per D-01 fence contract.)
- Stale lock: lock file from a dead PID → stale-lock detection refuses new
  transactions until explicit, audited recovery (never auto-reaps into a
  downgrade — cf. D-01 0.9.3 findings).

## Recovery tests

- Restart: kill mid-transaction, restart process → `read-only recovery-plan`
  describes exact resume point from journal prefix.
- Repair: corrupt the journal's last entry → hash chain detects the tear;
  recovery falls back to the versioned backup; torn entry quarantined, not
  deleted.
- Replay: re-run recovery twice → idempotent; second replay is a no-op
  with identical receipts.
- Rollback: restore from backup ID → byte-for-byte receipt (before/after
  hashes); user edits after the backup are listed, never silently dropped;
  restore requires explicit confirmation.
- Backup hash failure: tampered backup → restore refused before any write.

## Platform matrix

| Test group | Linux | Windows |
|-|-|-|
| Security (POSIX) | RUN | N/A (adapt) |
| Security (token/ACL) | N/A | UNVERIFIED — needs host |
| Reliability (crash) | RUN | UNVERIFIED — needs host |
| Reliability (power-loss) | UNVERIFIED — needs rig | UNVERIFIED — needs rig+host |
| Concurrency | RUN (POSIX) | UNVERIFIED — needs host |
| Recovery | RUN | UNVERIFIED — needs host |
| Durability preflight | RUN (fsync probe) | FAIL-CLOSED by design (`E_DIRECTORY_SYNC_UNPROVEN`) |

## Entry criteria (before the first test runs)

- Writer code paths remain behind `assertManagedMigrationGate()`; tests run
  with the gate enforced (negative paths) or in disposable fixtures with
  explicit, audited, single-test opt-in (positive paths).
- No test enables `managedV2MutationAuthorized`, flips the frozen gate
  constant, or weakens `syncContainingDirectory`.
