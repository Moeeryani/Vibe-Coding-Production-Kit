# Stage 13 — Independent Smart Init Apply Test Handoff

**BUILD CONSTRUCTION IN PROGRESS — NOT AN EXECUTION RECEIPT.**

Source branch: `feat/stage13-smart-init-apply-20261011`.
Stage12 parent: `61373569fd50a5a3a153e39bfcd721a94b4f22d2`.
The independent Testing Agent **must use the final frozen HEAD**, not any
historical SHA written in this document. Record its exact commit/tree hashes
and compare all evidence and test artifacts to that SHA.

## Hard rules

- **Do not run these commands during the build phase.** The maintainer's
  workflow is **build everything, freeze, run independent tests at the end**.
- No main merge, tag, package publication, or production project mutation.
- `D-01=DEFERRED`, `G-FENCE=NO-GO`,
  `managedV2MutationAuthorized:false` until new explicit owner approval.
  A green or mocked Stage13 test **never** overrides this. Published 0.9.3
  cross-CLI behavior and Windows native durability remain separately gated.
- Test against disposable Git repositories and disposable OS users only.
  Any test requiring a simulated GO state must be isolated, explicitly
  marked **synthetic**, must not change product gate or published package
  metadata, and cannot count as real D-01 authorization.
- Exact evidence required: test host, kernel/build, mount/filesystem, user
  UID/GID, Node version, C++ compiler, Git HEAD, native helper SHA-256,
  OS error/receipt fields, command, exit code, stdout/stderr, before/after
  byte SHA-256, directory identities, results and preserved-artifact paths.

## Run only after freeze

On Linux, in a **disposable fresh checkout** at the frozen SHA:

```bash
npm ci
npm run build:native-linux
npm run check
npm run check:stage12-contract
npm run check:stage13-contract
npm run test:stage13
npm test
npm run validate
git status --short
```

Capture individual exit codes. The historical broad `npm test` failures
must be attributed by exact test and error, not automatically dismissed as
a single pre-existing fixture issue. Compare to the **reachable baseline
HEAD** before deferring unrelated faults. Re-run on the integrated frozen
SHA after any source fix. Native helper compilation or test execution is
**not authorized during Stage13 construction**.

## Stage 13 original acceptance contract

| ID | Scenario | Required result |
|---|---|---|
| A13-01 | Existing unmanaged root, `init --dry-run --json` | ZERO writes; rooted intent and exact proposed actions; source docs untouched |
| A13-02 | `--adopt` absent / `--yes` alone / stale or changed fingerprint | Deny; preserve exact user and `.vcp` bytes |
| A13-03 | Symlink, junction, Git/workspace and case/Unicode aliases | Block before any unsafe file or root mutation |
| A13-04 | Adopt lock and bootstrap first-write interruption | Complete cleanup if exact owned empty bootstrap; otherwise bounded forensic BLOCKED |
| A13-05 | Post-lock planner, stack evidence and user intent changes | Refuse stale preview; lock is not a consent shortcut |
| A13-06 | No previous VCP state | Backup/ledger proves old `.vcp` absence; native archive preserves complete interrupted evidence |
| A13-07 | New asset CLAIM | Exact staged bytes, mode and dev/inode, kernel RENAME_NOREPLACE, no overwrite even with racing contender |
| A13-08 | New parent directories | Stage missing subtree atomically; verify every created directory inode; never recursively remove foreign files |
| A13-09 | Existing AGENTS/vendor instructions | Preserve byte-for-byte preimage, controlled section with uniquely delimited ownership, no unapproved wholesale replacement |
| A13-10 | Linux managed-section exchange | Native RENAME_EXCHANGE preserves BOTH inodes; no application without independently verified writer-isolation gate |
| A13-11 | v3 journal | Immutable operation/root/consent/created-file/created-directory ledger; correct phases only |
| A13-12 | Interrupted apply and original project-file edit | Refuse destructive rollback; any unknown replacement retained in forensic evidence |
| A13-13 | Interrupted rollback | Idempotent; archive owned claims, preserve foreign content and refuse inode impostors |
| A13-14 | Old adopt/recovery lock after crash | Dead-owner proof and explicit owner approval; native no-replace archive of original lock before new recovery lock |
| A13-15 | Commit followed by crash before release | Manifest and backup/inode proof; no guess-based stale lock stealing |
| A13-16 | Interrupted prejournal staging | Correct Stage13 operation-ID-only scan; foreign controls/links BLOCK; no auto deletion |
| A13-17 | Existing section rollback | Restore exact original inode by exchange, retain VCP candidate inode in evidence; blocked without MAC/OS isolation proof |
| A13-18 | Native 64-bit identities | Use exact uint64 string fields; reject rounded JSON integers and bitwise collisions |
| A13-19 | POSIX umask, fsync and namespace receipts | Mode correct after pinned fchmod; fsync files and both directory parents; no EXDEV silent fallback |
| A13-20 | Windows/NTFS selected root | Explicit fail-closed until native independent implementation and proof; never infer Linux parity |
| A13-21 | Published old-CLI behavior | D-01 remains DEFERRED until full old/new independent proof and new owner authorization |
| A13-22 | No unintended side effects | No unapproved GitHub workflows, source docs, package updates, tags, main merges or release |

## Fault-injection matrix

Inject process termination and I/O faults immediately **before and after**
these points, never only on a happy-path run:

1. `.vcp` bootstrap mkdir (before lock exists, unknowable ownership)
2. Locked operation ID/consent receipt persisted
3. Backup operation directory created
4. User section preimages saved and fsynced
5. File and directory stages saved (before any project file modified)
6. Full backup metadata and transaction **snapshotted** journal persisted
7. Transition to **staged** and **applying**
8. Directory `RENAME_NOREPLACE` and file `RENAME_NOREPLACE`
9. Section `RENAME_EXCHANGE` (only inside proven writer isolation)
10. Every baseline and committed manifest write
11. **verified** → **committed** transition
12. Staging archiving, journal clear, and lock release
13. Recovery lock dead-owner archival and new exclusive lock
14. Recovery file/directory forensic archival
15. Final `.vcp` no-replace retirement

For each point collect selected-root tree inventory and exact original
user-document bytes. Failure **must not silently erase changes**. A
blocked transaction is a valid safety outcome, not an accepted full feature.
An injected SIGKILL result is NOT a power-loss persistence proof.

## Current explicit gaps: never auto-upgrade their status

- The OS-enforced exclusive-writer token for section changes cannot be
  minted in the current product. This is an **intentional fail-closed**
  boundary. Source for atomic exchange/restore exists, but it is **not
  product-authorized**.
- Linux native provider, kernel sync, and old CLI fence evidence do not
  establish native Windows durability. No Windows release GO.
- The CLI package is still version 0.9.3, which cannot claim v2 reader
  compatibility; no release/version bump without owner approval.
- Original full Stage12 P0/P1 acceptance is a separate condition.
  Stage13 tests must not silently declare those gates passed.

## Test Agent report

Produce a concise itemized A13-01–A13-22 matrix with exactly one status per
item: PASS / FAIL / BLOCKED / UNVERIFIED / NOT RUN. Include every tested
commit, host and source evidence path. Specify which findings require an
implementation fix, which are external GO gates, and which are regression
to pre-Stage13. The final gate is **NO-GO** when any required proof is missing.

No assertion in this document is evidence that the tests have run.
