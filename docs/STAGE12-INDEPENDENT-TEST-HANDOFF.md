# Stage 12 — independent computer Testing Agent handoff (BUILD DRAFT)

**State:** AUTHORING / NOT TEST READY / NO ACCEPTANCE. This document prepares
the independent computer-equipped Testing Agent for a **single final test
campaign after full construction**. It does not authorize tests today.

## Nonnegotiable safety and workflow contract

1. Stage 12 has the **full original scope**, AC-001 through AC-016. No
   read-only subset, Stage 13 substitution, or partial acceptance is valid.
2. The maintainer approved D-02/D-03/D-04/D-05/D-06/D-12 as **policy choices**,
   not tested implementations. D-01 is explicitly DEFERRED and
   `G-FENCE = NO-GO`, with `managedV2MutationAuthorized:false`.
3. **Build completely first. Test only at the end.** The build agent may
   inspect source and record proposed negative tests, but must not execute
   syntax, npm checks, npm tests, validate, pack, CLI smoke, old-bin POC,
   or native conformance during construction.
4. No main merge, release tag, npm publication, managed-v2 activation,
   G-FENCE opening or review-signature fabrication is allowed.
5. Any source/test/doc change after the test freeze creates a **new SHA**,
   invalidates the prior full-head acceptance receipts, and requires a
   fresh complete campaign. Reports from isolated PRs are not transferable.

## Preflight before the Testing Agent receives control

The build engineer must deliver a *single immutable full SHA* for
`integration/stage12-build-candidate-20261009`, with the exact source,
tests, scripts, docs and decision anchors all present. Include the
review-ready decision packet, canonical D-ID records, complete required
anchors, D-01 negative witness corpus and a detailed unresolved-defect list.

The testing agent must refuse the handoff if the head is still actively
changing, a required proof is unavailable, or any developer claims green
tests without reproducible raw evidence. All coverageReview values remain
PENDING until real independent reviewer signoff.

## Exact-head local gates (after and only after freeze)

Capture the following **before** and **after** the entire test session:
`git rev-parse HEAD`, `git status --porcelain=v1 --untracked-files=all`,
`git remote -v`, OS edition, architecture, Node/npm/Git versions,
filesystem type, locale, case sensitivity and machine identity redacted
for publication. The git tree must be clean and equal to the selected SHA.
Use disposable projects and an evidence directory **outside the repo**.

Recommended full baseline commands, without claiming they have run:

```sh
npm ci --no-audit --no-fund
npm run check
npm run check:stage12-contract
npm run validate
npm run pack:check
node scripts/run-adaptive-local-gates.mjs --expected-sha FULL_40_HEX_SHA --evidence-dir ABSOLUTE_FRESH_DIRECTORY_OUTSIDE_REPO
```

The local gate runner repeats npm steps by design. Keep each raw stdout,
stderr, command/args, process signal, exit status and receipt SHA. On native
Windows use the host-appropriate executable shell; do not pretend WSL is
native NTFS.

## Required real-platform scenario matrix

### Published old CLI v0.9.3 — AC-004 / D-01

- Independently authenticate the **actual registry-published** npm archive
  via exact SHA-512 registry integrity and SHA-256 archive hash; never
  substitute this branch's source as the old CLI. Preserve tarball and
  provenance evidence locally.
- Repeat all Linux 12 and native Windows 13 witness scenarios in
  `scripts/poc-old-cli-fence.mjs` on disposable trees. Include
  `deleted-manifest-directory-sentinel-old-init`, proven historically to
  bypass the sentinel on Windows.
- Enumerate old `init --force` with present/missing/corrupt Manifest,
  `update`, `manage` and `rollback`; dead/stale/foreign/aged locks;
  stale and malicious backup/journal names; user post-backup modifications.
- Run genuine **old vs. new process concurrency**, interrupted old/new
  processes, PID reuse, lock rename/replacement, manifest removal and
  missing-control recoveries. Capture user-file byte identities both
  before and after, even when the process exits nonzero.
- A shared writable root for the same process security principal does not
  magically restrict published legacy code. If OS-based process/UID/SID/ACL
  separation is proposed, the real native access-denial proof must be
  independently repeated. If isolation/cutover alters the original
  guarantee, stop and request **new explicit maintainer D-01 approval**.

**Any user-edit loss, unjustified mutation, absent binary attestation,
missing required platform or missing separate D-01 approval = NO-GO.**

### Windows / NTFS durability — AC-005/006/010/016

- Use **native Windows** (not Linux, containers, or WSL standing in for
  Windows) and record NTFS volume and host capabilities. Reproduce the
  `E_DIRECTORY_SYNC_UNPROVEN` / `EPERM` directory-sync finding.
- Verify preflight refuses writes **before** lock bootstrap, backup or
  temporary state creation on unsupported platforms. This negative
  no-write result is **not** successful Windows writer durability.
- A later approved native implementation must specify exact Win32 APIs,
  required handle permissions, namespace rename/unlink flush semantics,
  storage device and crash/power-loss boundaries. File data flush by itself
  is not sufficient evidence for durable directory-entry transitions.
- Test native junctions/reparse points, in-root and external symlinks,
  hostile parent replacement, file vs directory collisions, aliasing,
  case folds, Unicode normalization and simultaneous writers. Require
  preserved outsider bytes and defensible race characterization.
- Unavailable native durability provider or a failed power-loss guarantee
  stays UNVERIFIED/NO-GO; do not suppress the error to obtain green tests.

### Migration and recovery — AC-003/005/006/007/008

- Exercise an authentic schema-v1 managed project and every boundary of
  v1→v2 preview, backup, exact-byte restore and journal phase transitions.
- Reject unrecognized fields, unknown ownership, path aliases, file/dir
  ledger collisions, corrupt modes, wrong operation, wrong backup, forged
  minimumReaderVersion and old 0.9.3 compatibility assertions.
- Inject an interruption **before and after** each durable file/directory
  creation, staged journal rename, Manifest replacement, committed ACK,
  `recovering` transition, `cleanup` transition, each owned-file deletion,
  empty-dir deletion, backup metadata deletion, journal clearance,
  lock release and final `.vcp` retirement.
- On every restart, run the read-only planner first, record whether
  classification is RECOVERABLE, TERMINAL_CLEANUP, BLOCKED or orphan/foreign.
  Re-enter only when safe, and never delete a user-modified, unowned,
  linked or ambiguous file. Retain original journal and backup metadata
  until their controlled successor evidence is proven.
- Test the **terminal orphan** case: journal already absent, lock or empty
  state directory remaining. The diagnostic is read-only and must never
  authorize deleting an unproved foreign lock. This remains a known
  unresolved full-completion seam until a stronger finalization contract
  and independent evidence exist.
- Verify exact SHA-256 manifest and user-tree bytes on success/failure,
  not only schema/version labels. Include BOM, CRLF, mixed EOL, partial
  managed sections, ignored paths, foreign nested empty directories and
  files appearing between scans.

### Remaining policy and package conformance — AC-001/002/009–016

- D-02 Doctor install-health non-strict/strict truth table independent of
  governance warnings, preserving minimal/new/legacy semantics.
- D-03 secure selected-root read/write purposes and Windows junctions.
- D-04 deterministic `init --plan --json` with content-free proposals,
  zero writes and no Stage13 unmanaged adoption apply.
- D-05 exact managed section authority, markers, digest and outside bytes.
- D-06 canonical decision/anchor reconciliation, independent reviewer
  approval and no borrowed prior green check.
- D-12 runtime verify re-read of authority, destructive-command fingerprints,
  human receipts, duplicate-key conflict and `--yes` insufficiency.
- P0/P1 task pack and every AC-001–AC-016 requirement individually linked
  to source location, test, platform, raw evidence and reviewer.

## Evidence and stopping rules

For every mandatory gate, record: exact HEAD, platform, expected/actual
command, UTC run time, raw stdout/stderr, exit status, fixture before/after
cryptographic hashes, crash trigger and reviewer. Evidence must not expose
personal files or secrets in published logs.

Outcomes are **PASS, FAIL, BLOCKED or UNVERIFIED**, never a fabricated pass.
The historical `d13de6be` run (469 tests: 331 pass / 137 fail / 1 skip)
is a triage input, not a result for any new integrated HEAD.

Only after an exact-head full pass on all mandatory platforms, separately
approved D-01, completed independent anchor review and maintainer final
acceptance may Stage 12 be labelled COMPLETE. Until then keep Plan/Blocked
and avoid merging main or publishing.
