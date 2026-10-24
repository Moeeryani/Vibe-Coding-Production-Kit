# Phase N+3 Design — Secure Lock, Journal & Recovery

Status: engineering design + implementation record.
Base: Phase N+2 candidate `8f721f7` (independently validated).
Scope: R-2 completion for the lifecycle lock and versioned journal,
and the recovery ownership/provenance contract left open by the
Phase N+2 validation (reapStaging proves namespace + continuity,
not original ownership).

## 1. Trust-boundary map (pre-N+3 state)

| Operation | Authorization | Identity point (before) | Mutation (before) | Gap |
|---|---|---|---|---|
| Lock create | gate/capability via callers | lstat of `.vcp` | `open(O_EXCL)` by path | check/use window between lstat and open; payload read by path |
| Lock assert | in-process WeakMap mint | lstat pair | — (read by path) | path read after lstat |
| Lock release | minted lock object | lstat + fd stat | `unlink` by path | re-stat then unlink by path — substitution between check and unlink wins |
| Journal write | gate/capability | `.vcp` pin (N+2) + digest | fd write to staging path; `rename` by path | rename not bound to staged identity or namespace inside the mutation |
| Journal clear | gate/capability + hash | digest + pin | `unlink` by path | same check/use shape |
| Staging reap | provider | anchor at reap start | bound unlink (N+2) | ownership unproven (pattern ≠ provenance) |
| Audit append | writer flow | anchor (N+2) | native append op (N+2) | lock mode not recorded |

Root ancestors remain unauthenticated throughout (R-6, unchanged):
the root path itself is resolved by the OS per spawn; the anchor
authenticates the root OBJECT and everything below it.

## 2. The anchored-mode rule (one rule, three modules)

When the secure native provider is **available** — helper binary
built and trusted — the lifecycle lock, the versioned journal and
the provenance registry run **descriptor-bound**: every mutation
carries the transaction anchor (root + `.vcp` identities, plus the
target file identity where one exists) into the native helper,
which verifies its pinned descriptors before the syscall.

When the helper is **absent** (unbuilt tree), the pre-N+3 path
implementation runs and the lock reports `anchored: false`. When
the helper is **present but invalid**, construction throws and the
operation refuses — presence-with-corruption never falls back
(the Finding 003 rule, applied uniformly). Production deployments
build the helper as a package build step, so the production
condition is the anchored one.

A new native op, `read-file`, closes the read side: the helper
opens through the pinned walk, verifies root/parent/file
expectations against the OPEN descriptor, and returns the content
read from that pinned object (with a pre/post fstat stability
check). Lock payloads and journal descriptors are therefore
verified from the authorized namespace, not re-resolved by path.
Provider additions: `readFileVerified`,
`renameReplaceBound`, and an expectations parameter on
`removeEmptyDirectory`.

## 3. Lock contract (anchored mode)

- Bootstrap: `.vcp` created by provider `mkdir-sync`; EEXIST maps
  to the existing `E_STATE_BOOTSTRAP_RACE`.
- The transaction anchor is captured before creation and checked
  against the path-side state proof.
- Creation: provider `writeFileSynced` (staged, fsynced,
  rename-noreplace) — `E_FS_DESTINATION_EXISTS` maps to
  `E_LOCK_ALREADY_HELD`; a foreign lock file is never removed
  (no stale-lock stealing, unchanged).
- Assertion: `readFileVerified` with root+state+lock expectations;
  identity failure maps to `E_LIFECYCLE_LOCK_INODE_CHANGED`;
  payload semantics (version, mode, token, pid, operationId)
  unchanged — with one normalization: an absent `operationId` in
  the record compares equal to a null lock operationId (plain
  update locks carry neither; adopt/recovery ids remain strict).
- Release: state-dir identity re-verified through the provider,
  payload read bound, then `unlink-sync` carrying FULL
  root+parent+file expectations — the helper refuses inside the
  mutation if any identity moved, so the object unlinked is
  provably the object verified. There is no check/use window.
- `cleanupBootstrapIfEmpty`: provider list/stat/rmdir with the
  root expectation; semantics unchanged.

Crash states: a crash after creation leaves the lock file, as
before; ownership is provable by the next acquirer's refusal, and
recovery never deletes a lock it cannot prove (unchanged policy).

## 4. Journal contract (anchored mode)

- Reads (previous/current/committed digests) go through
  `readFileVerified` with the anchor; the returned identity is
  carried alongside the digest.
- Commit: staging via `writeFileSynced`; the concurrent-change
  digest check runs; **provenance is recorded** (see §5) for the
  staged inode under the journal's name; the commit rename is
  `rename-replace` with root+parent+staged-file expectations;
  the N+2 namespace pin is re-asserted after the rename; the
  committed digest is verified through a bound read.
- Clear: bound read (digest + identity), terminal-clearance rules
  unchanged, **provenance check** (below), second bound read, pin
  assert, then `unlink-sync` with full expectations; provenance
  forgotten only after the proven removal.
- Format: unchanged (no migration). The journal descriptor gains
  no fields; provenance lives in the registry, not the journal.

## 5. Recovery ownership / provenance contract

`lib/staging-provenance.mjs` maintains
`.vcp/staging-provenance.json` (written via `replaceFileAtomic`)
with entries `{name, transactionId, dev, ino, recordedAt}`.

- Recording happens at staging time, BEFORE the artifact becomes
  live (for the journal: before the commit rename — rename
  preserves the inode, so the staged identity IS the committed
  identity). A crash in the record→commit window leaves a registry
  entry naming an inode the live name does not hold: recovery
  sees an identity mismatch and deletes nothing (safe direction).
- `recoveryCleanupStaging(root, {transactionId})` deletes ONLY
  entries of the recovered transaction whose CURRENT identity,
  measured through the anchor, still equals the record; the unlink
  carries full expectations. Mismatches and stat failures are
  reported in `skipped[]` with reasons; entries are forgotten only
  after proven removal. Repeat runs are stable no-ops.
- `listUnknownStaging` reports pattern-matching artifacts with NO
  entry. Recovery never deletes from that list.
- Anchored journal clear consults the registry: a recorded
  journal whose current identity differs from the record refuses
  with `E_JOURNAL_CHANGED` — a byte-identical journal in a copied
  namespace has a different inode than its recorded creation.
  Journals with no record (pre-provenance or legacy-written) clear
  on digest alone, as before (compatibility, documented).
- `reapStaging` keeps its N+2 namespace-cleanup contract; the
  registry is the ownership layer above it for
  recovery-controlled artifacts.

Recovery state model (unchanged semantics, now identity-bound):
prepared → staged → committed → durability-confirmed (directory
sync inside the provider ops) → evidence recorded (anchored audit
append; the entry now also records `lockAnchored`). An unknown
outcome is never reinterpreted as success: failed identity,
digest, or provenance checks refuse or skip with a classification,
never a success receipt.

## 6. Audit integration (§6)

`recordWriterEvidence` accepts the transaction's lock and records
`lockAnchored` next to the N+2 namespace + helper hash, so audit,
journal and lock state describe the same transaction and mode.

## 7. Discovered baseline constraint (not changed)

`clearVersionedJournal` decodes the journal with the installed
CLI version (`0.9.3`) as reader, while format-valid journals
require `minimumReaderVersion > 0.9.3` and `reader >= minimum`.
At package `0.9.3` no format-valid journal can pass clear-time
decode — in legacy and anchored modes alike (pre-existing; no
prior test ever cleared successfully). Phase N+3 does not alter
decode semantics; the provenance layer fires before decode, and
the constraint is recorded as a remaining finding for a future
phase (a version-handling decision belongs to the owner).

## 8. Residuals

- R-2: lock + journal are descriptor-bound in anchored mode; the
  legacy mode (helper absent) retains the N+2 pin checks but not
  descriptor binding — by the availability rule above, not by
  silent weakening (the mode is reported on the lock object and
  in audit evidence).
- R-4, R-5, R-6, X-05 (incl. verification-to-exec window):
  unchanged, NOT closed.
- FULL_TRANSACTION_CONTAINMENT remains NOT_PROVEN until the
  remaining register closes; B-2 power-loss unproven; B9-01b
  INCONCLUSIVE.
