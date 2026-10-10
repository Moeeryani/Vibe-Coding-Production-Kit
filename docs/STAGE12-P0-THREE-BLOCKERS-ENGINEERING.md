# Stage 12 P0 — three hard blockers: implemented candidates and proof boundary

**Engineering draft (2026-10-10), not accepted or test-ready.**
Full original Stage 12 remains required. `D-01 = DEFERRED`,
`G-FENCE = NO-GO`, `managedV2MutationAuthorized = false`.
The changes below are **construction candidates only**. They were authored
without executing tests, native programs, packaging or user-root mutations.

## 1. Published 0.9.3 writer compatibility (D-01)

The unchanged published npm `vibe-coding-production@0.9.3` already
overwrote post-backup edits and bypassed a directory-shaped update lock
when the manifest was removed. New JavaScript package checks cannot
restrict an arbitrary old CLI running under the **same effective OS
principal** against the **same writable root**.

**Candidate boundary:** the OS must enforce two distinct writer principals
and must deny legacy execute/write operations even if the old CLI is
invoked deliberately using the new-writer principal. Permissions/ACLs
must be tested with actual published binary operations, including
missing/corrupt/present manifest, init --force, update, manage, rollback,
stale metadata and hostile concurrency.

`lib/legacy-writer-fence-contract.mjs` and
`test/stage12-d01-isolation-contract.test.mjs` enumerate mandatory
Linux/native-Windows observations, post-backup user-byte preservation,
root identity, executable restrictions, and independent raw receipts.
The evaluator returns **NO_GO** or
**CANDIDATE_REQUIRES_INDEPENDENT_D01_APPROVAL**, NEVER a writer unlock.

No OS-level enforcement installation or old/new process proof occurred.
An old process elevated into the new process identity remains able to
circumvent a merely descriptive policy. An altered isolation/cutover
invariant requires a *new explicit D-01 maintainer decision*; the
maintainer has not approved one.

## 2. Windows/NTFS namespace durability

Node's directory `fsync` on native NTFS previously returned EPERM.
File `FlushFileBuffers` and `MOVEFILE_WRITE_THROUGH` do not, by
themselves, attest every rename/unlink/mkdir/rmdir crash edge.
Production still rejects native Windows writes **before bootstrap**:
`WINDOWS_NAMESPACE_DURABILITY_UNPROVEN` /
`E_DIRECTORY_SYNC_UNPROVEN`.

A Windows-native, **disposable-root-only diagnostic** was authored at
`scripts/native/stage12-windows-namespace-probe.cpp` (source only).
It probes NTFS file write/flush, `MoveFileExW` write-through,
post-rename file flush and directory-handle flush. It validates an
explicit operator marker and never claims a durability attestation.
No native compile or execution was performed.

`lib/windows-durability-contract.mjs` and tests require independent
replay of actual power-loss, journal, lock, rename, unlink, rmdir
semantics, native provider binary identity and unmodified outsider
bytes before treating a future implementation as a candidate. **Even
all claimed green fields do not authorize production writes.**

Before a real Windows backend replaces `syncContainingDirectory`,
design and review supported APIs and failure semantics for **each**
namespace mutation. Independent native Windows hardware/filesystem
proof is mandatory. Do not suppress EPERM or infer success from a
single write-through flag.

Microsoft sources:
- https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers
- https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw
- https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew

## 3. Orphan journal/lock after recovery

The old candidate cleared `transaction.json`, released
`update.lock` and removed `.vcp` in separate operations. A crash
between these steps destroys the only authoritative ownership record,
leaving a lock of unprovable provenance.

**Candidate architecture:** after exact-byte restoration and complete
owned-tree inventory, preserve the final `cleanup` journal **and**
lock. Move the whole `.vcp` directory as a unit to a fresh, randomly
named sibling forensic archive on the same filesystem, with mandatory
parent-directory sync and exact journal/lock identity rechecks.
`lib/terminal-retirement-v2.mjs` implements the G-FENCE-blocked
candidate and a separately testable reject-by-default evaluation.
`lib/greenfield-recovery-apply.mjs` now calls this candidate rather
than clearing the last journal, and never releases a stale lock path
after an acknowledged state detachment. If sync fails after rename,
the relocated ownership bundle is retained, never discarded.

**Important:** sibling archival **writes outside the selected root**.
This change therefore requires review of the original selected-root
write contract, OS same-volume/no-replace behavior, ACL/junction races,
retention/garbage-collection policy, hostile untrusted parent paths,
and independent crash/restart tests. It must **not** be treated as an
approved behavior change or proof of a fully finalized recovery.

The read-only orphan classifier continues to reject deleting a lock
whose journal has already vanished. Even where the candidate detaches
the bundle, the forensic archive must not be automatically deleted
without proven ownership and a separate safe cleanup protocol.

## Remaining conditions before TEST READY

1. Independently enforce and reproduce full published-v0.9.3 denial on
   Linux and native Windows; submit a new explicit D-01 decision.
2. Implement a native Windows namespace backend for every relevant
   operation and pass NTFS crash/power-loss and adversarial proofs.
3. Accept (or replace) sibling evidence retirement, prove atomic
   detach/no-replace and write-boundary conformance; close its archive
   retention semantics and recovery scans.
4. Complete all full-original AC-001–AC-016/P0/P1 source requirements
   and independent anchor coverage review.
5. Only after construction freezes, hand the **same exact combined HEAD**
   to the independent computer-equipped Testing Agent for all tests.

This packet documents substantial code construction but **NONE of the
three blockers is independently resolved or accepted**. No main merge,
no npm publication, no G-FENCE opening.
