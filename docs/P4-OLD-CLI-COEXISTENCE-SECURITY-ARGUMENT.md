# P4 Old-CLI Coexistence Security Argument (Linux)

Status: `P4_CONTAINMENT_BLOCKED` for the same-UID operator model.
D-01: DEFERRED. G-FENCE: NO_GO. Production writers: DISABLED.
Release: NO_GO.

This document states what the P4 Linux campaign proved, what it
blocked, and what it did not prove, with the evidence behind each
claim. Nothing here authorizes a production write, a D-01 GO, or a
G-FENCE opening. Every receipt cited lives in the campaign evidence
directory (`~/workspace/vcp-p4-full/evidence/`); the branch carries
the code and this argument, not the raw receipts.

## 1. The question

The published VCP 0.9.3 CLI (`init --force`, `update`, `manage`,
`rollback`) is immutable and uncooperative: no lock file, sentinel,
manifest flag, or `minimumReaderVersion` constrains it, because it
never reads them. The P4 question is whether a *compatibility
containment strategy* exists that lets the new managed lifecycle
coexist with the old CLI without data loss — and if not, what the
blocker is and what partial fence does hold.

## 2. The two principal models

The answer depends on who runs the old CLI. The campaign treats
them as separate models with separate verdicts.

### 2.1 P-LEGACY-SAME-UID — the operator runs the old CLI as the same UID that owns the project

**Verdict: `P4_CONTAINMENT_BLOCKED`. No complete fence exists
under the required assumptions.**

Evidence (C-04, 2026-10-31, disposable fixture, authenticated
0.9.3 tarball staged read-only):

- A disposable project owned by uid 1000, `AGENTS.md` holding
  post-backup user content (`USER EDIT AFTER BACKUP - must
  survive`), was subjected to the real old CLI
  (`init --force`, `--yes --agent all --no-github`) running as
  THE SAME uid (1000) via `setpriv`.
- Result: exit 0. `AGENTS.md` was overwritten with the 0.9.3
  template (`# AGENTS.md — This file defines repository-wide
  operating rules for AI coding agents…`). The user edit is gone.
- This is the D-01 POC loss class reproduced with the real
  published binary, not a simulation: same-UID `init --force`
  destroys post-backup user edits and reports success.

Why no fence can fix this under the required assumptions:

- The old CLI and the project owner are the same kernel
  principal. POSIX discretionary access control cannot
  distinguish two binaries run by the same UID: any file the
  owner can write, the old CLI can write.
- A lock file, sentinel, manifest flag, or
  `minimumReaderVersion` is not proof, because the historical
  CLI never reads them. (The D-01 reopen conditions record a
  proven counterexample for the directory sentinel alone.)
- The only complete fences for this principal are: never run
  the old CLI against the project; mandatory access control
  confinement of the legacy binary (unproven in this sandbox —
  no SELinux/AppArmor profiles are present); or running the old
  CLI as a different UID (which is the other model, §2.2).

Consequence: managed writes stay disabled. The containment gate
(`vcp containment`) has no production allow for any operation in
any state, and the same-UID model is recorded blocked, not
"mitigated".

### 2.2 P-LEGACY-DISTINCT — the old CLI runs as a different, unprivileged UID from the writer

**Verdict: kernel DAC denial PROVEN at the syscall level and
observed from the real old CLI. This is a fence for the
distinct-principal model only — it says nothing about §2.1.**

Evidence:

- **C-02 (DAC probes, 2026-10-31):** 5 fixed probes
  (overwrite, unlink, rename, create-inside, replace-project) ×
  2 projects (with/without manifest), run as nobody (65534)
  against writer-owned (uid 1000) projects. All 10 denied with
  `EACCES`. The writer-positive control completed on both
  projects. `kernelDacDenialObserved: true`, protected bytes
  verified after every probe.
- **C-05 (fenced real-CLI variant, 2026-10-31):** the real old
  CLI run as nobody (65534) against a writer-owned project:
  `init --force` failed with `Error: EACCES: permission denied,
  open '…/without-manifest/AGENTS.md'`, exit 1, bytes unchanged.
  `update` on the manifest-absent project failed with the old
  CLI's own `This repository has no VCP manifest` refusal,
  exit 1, bytes unchanged. (That update refusal is one
  observation on this fixture, not a proof the old CLI always
  refuses update without a manifest.)
- **C-06 (fence integration, 2026-10-31):** the uid-separation
  fence (`planLegacyFence` / `enforceLegacyFence` /
  `verifyLegacyFence` / `releaseLegacyFence`) enforced on a
  disposable project: the real old CLI as nobody failed with
  `EACCES` on `AGENTS.md`, bytes unchanged, `verify` intact.
  A parent-rename of `.vcp` aside (with a fresh `.vcp`
  recreated) was detected by `verify`
  (`E_FENCE_OWNERSHIP_CHANGED`, `E_FENCE_ENTRY_MISSING`,
  `E_FENCE_ROOT_REPLACED`); after restore, `verify` intact;
  `release` restored root ownership. The immutable backend
  honestly refused (`E_FENCE_IMMUTABLE_UNAVAILABLE`) where the
  capability is absent — no fake success.

Scope limits of the distinct-principal fence (stated, not
hidden):

- It covers only unprivileged old-writer execution. Privileged
  old-writer execution, MAC bypasses, user editing, ACLs, and
  crash/power-loss durability remain independently unproved.
- It does not cover Windows (native proof pending) or the
  same-UID model (§2.1).
- The bwrap matrix that would have run the real old CLI inside
  a namespace sandbox (C-03) is BLOCKED in this cell (see §4).

## 3. What the containment gate adds

`vcp containment` (P4-02b) is a read-only decision layer over the
P4-01 hazard detector. It refuses, in order: production scope
(always — no `ALLOW_PRODUCTION` outcome exists in the code),
proven `EXPOSED` hazards, linked roots (OD-3), interrupted /
stray / adoption states (OD-4), missing / unreadable / v1
manifests, non-clean journals, and abnormal locks. Test scope
requires both `--test-scope` and the disposable-fixture opt-in,
and yields only `ALLOW_UNDER_TEST_ONLY`, with residual risks —
including the concurrent-writer hazard H4 / PH-06 — on every
allow. The gate cannot authorize a production write; it can only
refuse, or allow a disposable-fixture run under the controlled
writer lane.

## 4. What is NOT proven (open blockers)

- **C-03 bwrap matrix — BLOCKED (environment).** The D-01
  fixture's bwrap sandbox must run as the old (unprivileged)
  UID, and an unprivileged UID cannot establish the
  user-namespace ID mapping in this cell: writes to
  `/proc/self/setgroups` and `/proc/self/uid_map` fail `EPERM`
  (verified for nobody 65534 and for mapped-range uid 18928
  alike; plain `unshare --user` works, but mapping an ID into
  it does not). The canary fails closed with
  `E_D01_PUBLISHED_SANDBOX_NOT_VERIFIED`, exactly as designed.
  The real old CLI was therefore NOT run inside the bwrap
  namespace sandbox in this campaign. The C-02 DAC probes and
  the C-05 setpriv real-CLI runs are the substitute evidence
  for the distinct-principal model; they do not replace the
  matrix.
- **PH-06 (concurrent writers) — UNRESOLVED.** The lifecycle
  lock serializes lock-holders (PN3-04; P4-02c-08 pins the
  rollback layer: `E_LOCK_ALREADY_HELD` while held). The
  check-then-act race for writers outside the lock has no test
  and no fix in this campaign.
- **Rollback without a post-apply record — residual gap.**
  `rollbackV2` now refuses when a committed Stage13 transaction
  shows a post-backup edit (P4-02c), but without such a record
  (the common update-rollback case) the restore still destroys
  a post-backup edit; the receipt says
  `postApplyCheck: 'not-applicable'` so the residual is visible.
  Closing it needs per-file post-apply hashes in the versioned
  journal — a P5 journal-schema change, not implemented here.
- **Update byte-retention — GAP, not invented.** No testable V2
  update entrypoint exists under the controlled lane
  (`runWriterTransaction` is a generic primitive, not the update
  path; `planAdaptiveManagedUpdate` is a read-only planner; the
  real update-apply is the frozen legacy v1 path). No update
  byte-retention test was fabricated.
- **Windows, MAC confinement, power-loss durability, B-2 —
  NOT_PROVEN.** Linux fixture success is not Windows approval,
  not power-loss durability, and not production authorization.

## 5. Evidence index

| # | Claim | Receipt |
|---|---|---|
| C-01 | 0.9.3 tarball authenticated to the registry `dist.integrity` SHA-512 (168 entries, 260,206 bytes) | `evidence/c01-tarball-authentication.json`, `evidence/vibe-coding-production-0.9.3.tgz` |
| C-02 | Kernel DAC denial, 10/10 probes `EACCES`, writer-positive control passes | `evidence/c02-dac-probes.json` |
| C-03 | bwrap matrix | BLOCKED — canary fails closed `E_D01_PUBLISHED_SANDBOX_NOT_VERIFIED`; cause recorded in `evidence/c04-c05-c06.json` (`c03BlockedReason`) |
| C-04 | Same-UID `init --force` overwrites `AGENTS.md`, exit 0 | `evidence/c04-c05-c06.json` (`c04`), `evidence/c04-c05-c06-logs/c04-*` |
| C-05 | Fenced real CLI: `init --force` `EACCES`, `update` self-refuses, bytes unchanged | `evidence/c04-c05-c06.json` (`c05`), `evidence/c04-c05-c06-logs/c05-*` |
| C-06 | Fence enforce/verify/release + parent-rename detection with the real old CLI; immutable backend honest refusal | `evidence/c04-c05-c06.json` (`c06`), `evidence/c04-c05-c06-logs/c06-*` |
| L-02 | Rollback gap proven (no-record case) | `evidence/probe-rollback-gap.mjs` (re-runnable probe) |

## 6. What would change the verdict

- A MAC confinement proof for the legacy binary (or a
  kernel-enforced execution boundary for the same UID) would
  reopen §2.1. Until then, `P4_CONTAINMENT_BLOCKED` stands.
- A runnable bwrap matrix (a cell where an unprivileged UID can
  map its ID, or a root-run variant the D-01 design accepts)
  would complete C-03.
- Per-file post-apply hashes in the versioned journal (P5)
  would close the no-record rollback gap.
- A V2 update entrypoint under the controlled lane would let
  update byte-retention be tested instead of recorded as a gap.
- Native Windows proof, PH-06 resolution, and B-2 durability
  proof are separate campaigns; none is claimed here.
