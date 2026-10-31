# P4 — Old-CLI (published VCP 0.9.3) Hazard Threat Model

**Scope:** P4-01 read-only hazard-exposure detector (`vcp
hazard-exposure`). This document defines the hazard classes, the
evidence each verdict rests on, and the exact limits of what the
detector claims. It is a diagnostic threat model, not a safety
fence: nothing in it authorizes a managed write, a migration,
a recovery, or any change to D-01/G-FENCE.

**Standing gates:** D-01 DEFERRED, G-FENCE NO-GO, B-2
NOT_PROVEN, FULL_TRANSACTION_CONTAINMENT NOT_PROVEN,
production writers DISABLED, L3 authorization DISABLED,
mandatory CI DISABLED, PH-06 UNRESOLVED. Windows evidence is
Linux-only here; no Windows parity is claimed.

## 1. Threat: the published old CLI, run by a legitimate operator

The adversary is not a person. It is the published VCP 0.9.3
CLI, run by a legitimate operator against a project that has
been edited since its backup. The old CLI's lifecycle commands
(`init --force`, `update`, `manage ignore/track`, `rollback`)
were written before the D-01 compatibility fence existed, and
they can overwrite or discard user bytes that were written
after the backup the old CLI relies on.

The detector never executes the old CLI. It reports exposure
from the evidence table in §3, applied to the assessed
project's observable state.

## 2. Hazard classes

| ID | Hazard | Entry points |
|---|---|---|
| H1 | Old `init --force` loses post-backup user edits when no manifest exists | init |
| H2 | A directory-shaped `update.lock` does not fence old `init --force` with no manifest | init |
| H3 | Interrupted or stray recovery state (partial journal, staged subtree, root manifest/lock strays, adoption markers) makes old update/manage/rollback behavior unsupported | update, manage, rollback |
| H4 | Concurrent old/new writers: two journal writers can both succeed; no exclusivity demonstrated | all |
| H5 | Linked root or parent: following a symlink/junction could reach an external target | all (access) |

## 3. Evidence table

Every verdict cites one or more of these IDs. The POC loss
counts are aggregate records from the canonical D-01 program;
this build did not re-run the published 0.9.3 CLI and does
not claim a per-case breakdown it has not read.

| ID | Statement | Source |
|---|---|---|
| EVID-D01-LINUX-POC | Published 0.9.3 loses post-backup user edits in 7 of 12 Linux POC cases across the old init/update/manage/rollback entrypoints. | D-01 POC campaign, PR #89 evidence (Linux proof at `2e8e098`, as recorded in the canonical master plan); Issue #109; scenario matrix `lib/d01-linux-isolation-fixture.mjs` `D01_PUBLISHED_OLD_CLI_MATRIX` (old-init-force, old-update, old-manage-ignore, old-manage-track, old-rollback). |
| EVID-D01-WINDOWS-POC | Published 0.9.3 loses post-backup user edits in 8 of 13 native Windows POC cases; a directory-shaped `update.lock` does NOT fence old `init --force` when no manifest exists (proven counterexample). | D-01 POC campaign, Windows evidence branch `97110131` (as recorded in the canonical master plan); Issue #109; `docs/decisions/D-01.json` reopenConditions. |
| EVID-D01-FIXTURE-SHAPE | The D-01 POC fixture projects contain AGENTS.md as their only user-owned file (`createProject` writes "PROTECTED ORIGINAL USER BYTES" to AGENTS.md; no `package.json`, `docs/`, `transaction.json`, or `update.lock` in any fixture project); the published-CLI matrix manage scenarios target AGENTS.md; `D-01.json` records loss of post-backup AGENTS.md user edits only. No POC case demonstrates loss of `docs/` or `package.json` bytes, and none demonstrates their safety either. | `lib/d01-linux-isolation-fixture.mjs` `createProject` + `D01_PUBLISHED_OLD_CLI_MATRIX`; `docs/decisions/D-01.json` rationale/provingTests. |
| EVID-D01-REOPEN | D-01 reopen requires a complete compatibility fence for all published 0.9.3 entrypoints even with the manifest absent, atomic transition/lock ownership, concurrent old/new writer and crash/partial-journal recovery proofs, and byte-for-byte retention of post-backup user changes. | `docs/decisions/D-01.json` (status DEFERRED), `reopenConditions`. |
| EVID-SC01-OD-STRAYS | The check-to-open race was demonstrated at open granularity for `update.lock` and `transaction.json`: a marker can appear between the last eligibility observation and `open(O_EXCL)`. | `VCP-SC01-OD-STRAYS-INDEPENDENT-ACCEPTANCE.md` (candidate `03f40dd`, 3,068 ladder trials, 2 demonstrated at-open races). |
| EVID-PH06 | PH-06 concurrent journal creation: two writers can both succeed (check-then-act between the previous-hash check and the rename). The lifecycle lock is the implementation's stated serialization mechanism; the PH-06 test passes only a test capability and no lock. | `lib/versioned-journal.mjs` `writeVersionedJournal` (code reading); independent G3 observed both writers succeeding once; PH-06 UNRESOLVED. |

## 4. Verdict rules

The detector assesses four entrypoints (`init`, `update`,
`manage`, `rollback`) against the project state. The rules,
in order:

1. **Linked root (H5) refuses access.** If the selected root
   or any parent component is a symbolic link, the target is
   not followed and no entrypoint is assessed. All verdicts
   are UNKNOWN with reason "not assessed — linked root
   refused". The report carries `access.refused: true` and
   the CLI exits 1.
2. **init, manifest absent, AGENTS.md file with content →
   EXPOSED (H1).** The documented loss class applies: the
   demonstrated mechanism is loss of post-backup AGENTS.md
   user edits (EVID-D01-FIXTURE-SHAPE), so H1 requires the
   `AGENTS.md` signal — a regular AGENTS.md file with size
   greater than zero — not merely any user-owned content. If
   `update.lock` is directory-shaped, H2 is added: the
   directory sentinel is a proven non-fence
   (EVID-D01-WINDOWS-POC). EXPOSED means the hazard class
   is established for this state, not that this exact
   project is guaranteed to lose bytes.
3. **H3 states → UNKNOWN with H3 on update/manage/rollback.**
   Interrupted state, a root `manifest.json` stray, adoption
   markers, a root `transaction.json` in any non-absent shape,
   or a non-file `update.lock` (directory, symlink, other)
   makes update/manage/rollback UNKNOWN with hazard H3.
   For init the same states are UNKNOWN with a reason naming
   the H3 condition (H3 stays scoped to update/manage/rollback
   in the table above); the directory-shaped-lock case carries
   H2 on init instead (rule 4). H3 is checked before any
   manifest reasoning, so an H3 state is never reported as
   safe on the strength of having no user content.
4. **Directory-shaped `update.lock`, no AGENTS.md content →
   UNKNOWN with H2 on init.** The sentinel is a proven
   non-fence (EVID-D01-WINDOWS-POC), but the H1 loss class
   needs AGENTS.md content, so neither EXPOSED nor safety can
   be asserted. Update/manage/rollback are UNKNOWN with H3
   (rule 3).
5. **Manifest absent, user-owned content without AGENTS.md
   content → UNKNOWN.** Docs/-only and package.json-only
   states (or both) are UNKNOWN: the loss mechanism is
   demonstrated for AGENTS.md only (EVID-D01-FIXTURE-SHAPE),
   so H1 cannot be asserted — and no direct evidence
   demonstrates safety for these file classes either.
6. **Every other state → UNKNOWN.** In particular: empty
   directories, nested empty directories, a zero-byte
   AGENTS.md, a file-shaped lock alone, a `.vcp` directory
   without a manifest and without AGENTS.md content,
   manifest present (any validity), malformed or unknown
   manifest state, and malformed or unknown descriptor
   fields. The POC counts are aggregate only; without a
   per-case breakdown attributable to the exact assessed
   state, the detector does not guess. UNKNOWN is explicitly
   not safe, and every UNKNOWN verdict says so.

**NOT_EXPOSED is retired (2026-10-31 hardening, report
version 2).** The old rule 3 ("manifest absent, no
user-owned content → NOT_EXPOSED, precondition-absent") is
removed. No assessed state carries direct evidence
supporting safety in the exact assessed state: all POC
evidence is hazard evidence, non-loss outcomes are aggregate
counts with no per-case safety attribution, and Issue #111
holds that a precondition argument alone is insufficient.
No entrypoint returns NOT_EXPOSED. The detector's `basis`
field now distinguishes two grounds: `poc-evidence`
(rule 2) and `no-evidence` (rules 3–6).

## 5. What the detector reads (and does not)

The reader (`readHazardState` in `lib/cli.mjs`) uses only
`lstat` (no-follow) and `readdir` on fixed names under the
assessed root, plus the existing read-only `inspectProject`
classification. It never opens a file, never follows a
symlink, never reads outside the root, never executes a
project command, and never writes. Children of `.vcp` are
inspected only when `.vcp` itself is a real directory, so a
symlinked `.vcp` is never followed into an external target.
Manifest validity is not re-derived by the reader: the
descriptor records only whether a regular manifest file
exists, and the classification/reason carries validity.

The pure core (`lib/old-cli-hazard-exposure.mjs`) performs
zero I/O: it imports no filesystem, writer, journal,
recovery, lock, or command module. It maps a descriptor to
a report. The H1 rule keys on the specific `AGENTS.md`
signal in `userOwnedSignals` (a regular AGENTS.md file with
size greater than zero, as recorded by the reader), not on
the summary boolean `userOwnedContentPresent`, which is
informational only. Any missing, mistyped, or unknown
descriptor field is normalized to UNKNOWN, never to a safe
verdict — there is no safe verdict left to normalize to:
the only non-EXPOSED verdict is UNKNOWN, and EXPOSED
requires the exact string `manifest: 'absent'` plus the
`AGENTS.md` signal. The pure core never throws on a
malformed descriptor.

A verdict describes the assessed state only. A project that
changes after assessment (new manifest, new user edits, a
marker appearing) needs a fresh assessment. The check-to-open
residual (EVID-SC01-OD-STRAYS) applies here too: assessment
is not an atomic snapshot.

## 6. Explicit limitations

- The detector reports exposure classes, not per-project
  loss predictions. An EXPOSED project may in fact survive
  an old-CLI run; an UNKNOWN project may in fact lose bytes.
  Neither verdict authorizes running the old CLI.
- NOT_EXPOSED is retired (rule 6 above, report version 2):
  no assessed state carries direct evidence of safety, so
  the detector never reports a state as not exposed. Older
  reports that carry NOT_EXPOSED predate the hardening.
- The H1 loss class is demonstrated for post-backup AGENTS.md
  user edits only. Docs/-only and package.json-only states
  are UNKNOWN until a POC case demonstrates loss of — or
  safety for — those file classes; that work is outside
  P4-01.
- The POC evidence is aggregate. Per-entrypoint safety for
  manifest-present states is UNKNOWN until a per-case POC
  breakdown is produced and reviewed — that work is outside
  P4-01.
- H4 is UNKNOWN on every entrypoint until OD-6's atomic
  exclusive journal creation is designed, implemented, and
  independently validated. The P3 pack records this as the
  OD-6 design direction only.
- H3 is UNKNOWN for every unsupported state until OD-4's
  legacy-compatible recovery design exists (the current
  decision is fail-closed blocked-state plus a manual
  runbook).
- Windows behavior is not assessed: the detector runs on
  Linux and reports the Windows POC evidence only as
  evidence, never as a claim about the current host.
- Durability (B-2) is NOT_PROVEN: nothing here claims
  crash or power-loss safety.

## 7. Exit codes and output

- `vcp hazard-exposure [directory] [--json]`, exit 0 when a
  report is produced (even when an entrypoint is EXPOSED —
  exposure is information, and the text output carries a
  prominent WARNING).
- Exit 1 when access is refused (linked root, missing root,
  non-directory root) or the target classification is
  BLOCKED (the report is still printed, so the refusal
  reason is visible).
- `--json` emits the full report object, including the
  evidence IDs, the basis of every verdict, the H4
  concurrency note on every entrypoint, and the
  limitations. Any other flag is rejected: the command is
  always read-only and accepts no mutating or planning
  flags.
