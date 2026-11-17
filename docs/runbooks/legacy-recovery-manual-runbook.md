# VCP P5 — Legacy Recovery Manual Runbook

**Branch:** `fix/p5-review-findings` (review fixes line; this runbook is published on the docs branch `docs/p5-review-doc-fixes`)
**Base HEAD:** `f5fa12903999e4a75fa3f89bf7a8431de28c5e9e`
(Tree `1ec166b89c158cf723c799f52791d3b0673e3063`)
Written for the P5 candidate `b4d7bf4`; updated for the fixes line (see §10). Legacy recovery code is byte-identical between the two heads.
**Status:** D-01 DEFERRED, G-FENCE NO_GO, production writers DISABLED, release NO_GO.
This runbook is for operators and maintainers working with VCP-managed projects under
those gates. It covers diagnosis and manual recovery only. It does not authorize
production activation, a D-01 GO, or any writer behavior beyond what is already gated.

## 0. Safety rules — read first

These rules are absolute. If a step below seems to conflict with one of them, the rule wins.

1. **Never delete an unknown lock or journal.** A `.vcp/update.lock` or
   `.vcp/transaction.json` you do not understand is evidence, not clutter. Deleting it
   destroys the only record of what was in flight. The automated paths never delete a
   journal they cannot prove terminal (see §5).
2. **Never overwrite uncertain content.** If you cannot prove what the current bytes are
   and what the backup bytes are, do not restore, do not "fix" files by hand, and do not
   re-run an update to "get past" the state.
3. **Never hand-edit managed state as though it were safe.** `.vcp/manifest.json`,
   `.vcp/transaction.json`, `.vcp/backups/*/backup.json`, and `.vcp/writer-audit.log`
   are managed state. Reading them is safe. Editing them by hand is not a recovery
   procedure — it is evidence tampering. The only sanctioned write to a backup record is
   the automated rollback-consume marker (see §4.6), performed by `rollbackV2` itself.
4. **Never reinterpret an unknown transaction as absent.** "I cannot read the journal"
   means "the transaction state is unknown", not "there is no transaction". Every
   destructive operation must refuse in that state (see §3).
5. **Preserve before you act.** Copy the whole `.vcp` directory (and the project's
   user files you care about) to a safe location and record hashes BEFORE any recovery
   step that mutates anything (see §2).
6. **Stop at the stop conditions (§6).** If you reach one, stop and escalate (§7). Do not
   improvise a workaround.

## 1. What you need

- Read access to the project root and its `.vcp` directory.
- A shell with `node` (v24), `sha256sum`, and `cp -a` (or equivalent).
- The VCP repository checkout at the P5 branch (for the diagnostic library functions).
- Nothing else. In particular you do NOT need the old 0.9.3 CLI, a database, or network
  access. Manual recovery is a local, read-first procedure.

Useful read-only checks (from the repository root):

```bash
# List managed state (read-only)
ls -la <project>/.vcp/
ls -la <project>/.vcp/backups/
# Hash everything before touching it (see §2)
find <project>/.vcp -type f -exec sha256sum {} + | sort
```

Diagnostic entry points (Node, read-only — they never mutate):

```js
import { classifyJournalCrashState } from './lib/versioned-journal.mjs';
import { inspectManagedRecovery } from './lib/managed-recovery-v2.mjs';
import { inspectLifecycleLock } from './lib/lock-inspect-v2.mjs';
import { inspectProject } from './lib/adoption-inspect.mjs';

const crash = await classifyJournalCrashState(projectRoot);
const recovery = await inspectManagedRecovery(projectRoot);
const lock = await inspectLifecycleLock(projectRoot);
const project = await inspectProject(projectRoot);
```

## 2. Evidence collection (do this FIRST, every time)

Before any recovery step that mutates anything:

1. Copy the managed state aside (preserving permissions and symlinks — do not follow them):
   ```bash
   cp -a <project>/.vcp /tmp/vcp-evidence-<date>/.vcp
   cp -a <project>/AGENTS.md /tmp/vcp-evidence-<date>/ 2>/dev/null || true
   ```
2. Record hashes of the copy and the live state:
   ```bash
   (cd /tmp/vcp-evidence-<date> && find . -type f -exec sha256sum {} + | sort > MANIFEST.sha256)
   (cd <project> && find .vcp -type f -exec sha256sum {} + | sort > /tmp/vcp-evidence-<date>/LIVE.sha256)
   ```
3. Record the classification (§3) and the exact error code and message that brought you
   here (copy the full receipt, not a paraphrase).
4. Note the operator, the date/time, the VCP version (`node -e "import('./lib/version.mjs').then(m=>m.getCliVersion().then(console.log))"`),
   and what was happening when the state was discovered (update, rollback, crash, power loss).

If the project is on a failing disk or the copy itself errors, stop and escalate (§7) —
do not attempt recovery on a deteriorating medium.

## 3. Diagnosis — what state is this?

Run the four read-only diagnostics from §1 and match the outcome to this table.

| `classifyJournalCrashState` | Meaning | Automated path |
|---|---|---|
| `absent` | No journal and no staging temps. | No transaction to replay. If a rollback is needed, it uses the backup record directly (and the P5-02 evidence rule still applies). |
| `complete` (phase `prepared` / `applying` / `verified`) | An interrupted v2 transaction. | `replayVersionedJournal` with a restore handler (restores from the backup, transitions to `recovering`, clears the journal). |
| `complete` (phase `committed` / `cleanup`) | A completed v2 transaction awaiting finalization. | `replayVersionedJournal` finalizes and clears it. |
| `complete` (formatVersion 3) | A Stage 13 adoption transaction. | Stage 13 recovery plan (`planStage13Recovery`); do not treat it as a v2 journal. |
| `staged-interrupted` | Staging temps exist but no journal (creator crashed before commit). | Reap the staging temps (`reapStaging`); the journal was never claimed, so a later creator may claim it. No transaction to replay. |
| `partial-malformed` | Journal bytes exist but do not parse or decode. | **Stop.** Automated replay refuses `E_RECOVERY_JOURNAL_TORN`. The journal is quarantined, not deleted. Go to §4.2. |
| `legacy` | A formatVersion 1 journal (old CLI era). | **Stop.** Automated replay refuses `E_RECOVERY_LEGACY_JOURNAL`. Go to §4.1. |
| `symlinked` | The journal path (or `.vcp` itself) is a symlink. | **Stop.** Nothing may follow the link. Go to §4.4. |
| `unreadable` | The journal is present but cannot be read within bounds. | **Stop.** Go to §4.4. |
| `cleanup-interrupted` | A `cleanup`-phase journal whose terminal preconditions are unmet. | **Stop.** Do not clear it by hand. Go to §4.5. |
| `unknown` | The classifier itself could not determine the state. | **Stop and escalate.** Do not proceed on an unknown state. |

`inspectManagedRecovery` adds the backup side of the picture: `transaction` (the decoded
journal, or `null`), `backup` (the decoded backup record, or `null`), `needsRecovery`
(true when a non-committed transaction exists), and `blocked` + `reason` when the state
cannot be trusted. If `blocked` is true, the reason names the problem
(`E_BACKUP_ID_MISMATCH`, `E_BACKUP_MISSING`, `E_COMMITTED_STATE_UNPROVEN`, …) — treat
a blocked inspection as "unknown state" for recovery purposes and go to §4.

`inspectLifecycleLock` reports whether a lock is present, its mode, whether the owner
process is alive (`LIVE_OWNER` / `OWNER_PROCESS_NOT_PRESENT` / `OWNER_NOT_VERIFIABLE`),
and the required action. `retirementAuthorized` is always `false`: no lock may be
retired by this runbook alone (see §4.7).

`inspectProject` reports the project's classification (`MANAGED`, `EXISTING`,
`BLOCKED`, …) and schema version. A `BLOCKED` classification with reason
`MANIFEST_MISSING` / `MANIFEST_INVALID` / `SCHEMA_UNSUPPORTED` means the manifest side
is untrustworthy; do not attempt a manifest-dependent recovery.

## 4. Per-state procedures

### 4.1 Legacy v1 journal or backup (classifier `legacy`)

A legacy record is **read-only visible, never silently upgraded**.

1. Confirm the classification (§3) and copy the evidence (§2).
2. Read the legacy journal (`formatVersion` absent, `id`/`phase`/`backupId` present) and
   the legacy backup record (no `formatVersion` field). Note the backup ID and the
   operation (`update`).
3. **Do not run automated replay.** It refuses `E_RECOVERY_LEGACY_JOURNAL` by design.
4. **Do not run live `vcp rollback` against v2 state.** The frozen v1 `rollbackProject`
   refuses schema-v2 state and versioned-journal state; if the project is genuinely
   v1-only (schemaVersion 1 manifest, v1 backup, v1 journal), the v1 rollback path is
   the sanctioned one — but only for the newest backup, and only when
   `inspectManagedRecovery` is not blocked.
5. Decide with the maintainer: the legacy transaction's intent must be reconstructed
   from the journal bytes, the backup contents, and the project's current files. The
   usual outcomes are (a) the pre-update files are intact in the backup and the
   operator restores them deliberately, file by file, verifying hashes; or (b) the
   project is re-initialized from a known-good state. Either way, the legacy journal
   file is preserved as evidence.
6. If the decision is a file-by-file restore: for each file, compare the current bytes
   with the backup bytes (`sha256sum` both). Restore a file only when you can state,
   in writing, why the backup bytes are the right ones and what post-backup change
   (if any) is being discarded. Keep the list as part of the evidence.

### 4.2 Malformed / torn journal (classifier `partial-malformed`)

1. Confirm the classification and copy the evidence (§2). The journal bytes are
   quarantined — they stay where they are.
2. Try to determine what the journal was: the first bytes often show whether it is a
   truncated v2 journal (starts with `{"formatVersion":2`), a truncated Stage 13 tx
   (`{"formatVersion":3`), or foreign content. Record the observation; do not "repair"
   the JSON by hand.
3. **Do not delete the journal.** Automated replay refuses `E_RECOVERY_JOURNAL_TORN`
   and keeps it. Deleting it would destroy the only record of the interrupted
   transaction's identity (its `id`/`backupId` link the backup).
4. Recover from the backup instead: identify the backup by the journal's `backupId`
   if it is legible; otherwise by listing `.vcp/backups/` and matching the newest
   backup whose `backup.json` decodes and whose manifest hash verifies
   (`loadBackup` semantics: `record.id` matches the directory name and
   `sha256(manifest.json)` equals `restoredManifestHash`).
5. If no backup can be verified, stop and escalate (§7) — there is no safe automatic
   restore.
6. If a backup verifies, restore it deliberately (file by file, hash-verified, as in
   §4.1 step 6), and record that the journal was torn so the restore is manual, not
   a replay.

### 4.3 Interrupted v2 transaction (classifier `complete`, phase not committed)

This is the normal case and the only one with a sanctioned automated path.

1. Confirm the classification, the backup ID (`transaction.backupId`), and that
   `inspectManagedRecovery` is not blocked and the backup decodes.
2. Run the replay with a restore handler (`replayVersionedJournal`). It restores from
   the backup, transitions the journal to `recovering`, cleans staging provenance, and
   clears the journal against its measured digest. The receipt reports
   `journalTransition`, `journalCleared`, and `journalRetained` — check all three.
3. If the replay receipt says `journalRetained: true` with a `journalError`, do NOT
   re-run it blindly. Read the error: a retained journal means the transition or the
   clear refused, and the journal is still there for a reason. Copy the evidence
   again (§2) and go to §6 if the error is not understood.
4. A second replay after a successful first returns `{recovered: false, reason:
   'NO_JOURNAL'}` — that is the idempotent outcome, not an error.

### 4.4 Symlinked or unreadable journal / state

1. Confirm the classification and copy the evidence (§2) — copy with `cp -a` without
   following symlinks, and hash the copy. Record the symlink target (do not follow it
   and do not read through it).
2. **Stop.** No automated path follows a symlink, and no manual step in this runbook
   follows one either. The external target is outside the managed project and must
   never be read as project state, written, or deleted.
3. Escalate (§7) with the symlink target, the lstat output, and the hashes. The
   maintainer decides whether the link is benign (e.g., a misconfigured mount) or
   hostile, and how to re-establish a real `.vcp` directory.

### 4.5 Cleanup-interrupted (classifier `cleanup-interrupted`)

A `cleanup`-phase journal may only be cleared when the terminal preconditions hold:
the root contains only `.vcp`, and `.vcp` contains only `transaction.json`,
`update.lock`, and (transiently) `staging-provenance.json`.

1. Confirm the classification and list the root and `.vcp` entries. Record which
   entries violate the preconditions.
2. Do NOT clear the journal by hand to "satisfy" the preconditions, and do NOT delete
   the extra entries to make the state look terminal. The extra entries are evidence
   that the cleanup was interrupted before the state was empty.
3. Escalate (§7) with the entry lists. The maintainer decides whether the extra
   entries are legitimate project content (in which case the cleanup was never valid
   for this state) or leftovers of the interrupted operation.

### 4.6 Rollback refusals (P5-02 evidence rule)

When `rollbackV2` refuses, the receipt and the error name the reason. Match it here.

| Refusal | Meaning | What to do |
|---|---|---|
| `E_ROLLBACK_POST_APPLY_EDITS` | A file (or the manifest) differs from its recorded post-apply hash: a user edit (or deletion) after the apply. | The edit is protected. Do NOT force the restore. Decide with the file owner: keep the edit (abandon the rollback), or have the owner deliberately discard it (record the decision, the file, and the hashes). |
| `E_ROLLBACK_EVIDENCE_MISSING` | A file changed and no post-apply evidence accounts for it (no record, malformed record, legacy record, journal without `postApplyFiles`, or a record covering only other files). The `reason` field names the cause. | The change is unaccounted. Do NOT restore anyway. Reconstruct what changed it (audit log, file timestamps, operator recall) and decide deliberately per file, as in §4.1 step 6. |
| `E_ROLLBACK_STALE_TRANSACTION` | A record exists but cannot vouch for the current state (uncommitted, wrong root, journal not committed, backup/manifest mismatch). | The record is stale. Do NOT trust it. Reconstruct the current state from the backup + the live files, as in §4.1 step 6. |
| `E_ROLLBACK_BACKUP_TAMPERED` | The backup manifest hash does not match the backup record. | The backup is untrustworthy. Do NOT restore from it. Escalate (§7). |
| `E_ROLLBACK_ENTRY_TAMPERED` | A backup file entry's hash does not match the record. | Same as above for that entry. Do not restore that entry. |
| `E_ROLLBACK_CONFIRMATION_REQUIRED` | The rollback was called without explicit confirmation. | Re-issue it with explicit confirmation. This is not a state problem. |
| `E_LOCK_ALREADY_HELD` | Another holder owns the lifecycle lock. | Wait for the holder, or (if the owner process is verifiably gone — see §4.7) escalate. Never delete the lock. |

**Already-completed.** A repeat `rollbackV2` after a successful first returns
`{rolledBack: false, alreadyCompleted: true, postApplyCheck: 'already-completed'}`.
That is the expected outcome, not an error. The backup record carries the consume
marker (`rollbackCompletedAt`, `rollbackCompletedManifestSha256`); the transaction
itself was never deleted or mutated. No further action is needed unless the operator
intended a *different* rollback, in which case a new backup (from a new operation) is
required.

**Manifest deleted after apply (R14).** The receipt says `passed` with
`manifestChecked: false, manifestReason: 'deleted-after-apply'`. The file content is
safe; the manifest was restored from the tamper-checked backup. No manual step is
needed, but the receipt's transparency note should be kept with the rollback record.

### 4.7 Lock held, lock corrupt, or lock owner gone

1. Run `inspectLifecycleLock`. Record `present`, `mode`, `assessment`
   (`LIVE_OWNER` / `OWNER_PROCESS_NOT_PRESENT` / `OWNER_NOT_VERIFIABLE`), and the lock
   hash (`lockSha256`).
2. If the assessment is `LIVE_OWNER`, wait. The holder is a live process; do not
   interfere with it.
3. If the assessment is `OWNER_PROCESS_NOT_PRESENT`, the owner process is gone but the
   lock remains. **Do not delete the lock.** `retirementAuthorized` is always `false`
   for a reason: a dead PID is not, by itself, permission to unlink (PID reuse and
   foreign-host locks require an independent exact-identity, human-owned recovery
   decision). Escalate (§7) with the lock record (mode, token hash, PID, host,
   `startedAt`) and the evidence from §2. The maintainer decides retirement based on
   the lock's exact identity and the journal state, not on the PID alone.
4. If the lock is corrupt (`E_LOCK_CORRUPT`, `E_LOCK_FORMAT`, `E_LOCK_UNSAFE`),
   preserve the lock bytes as evidence and escalate. Do not "fix" the JSON by hand.

## 5. What the automated paths guarantee (and do not)

- `replayVersionedJournal` on an interrupted v2 transaction: restores from the backup,
  transitions the journal, clears it against its measured digest. A failed transition
  or clear retains the journal and reports it — it never masquerades as completion.
- `rollbackV2`: refuses before mutation whenever the evidence rule cannot prove the
  restore safe. A successful rollback leaves the transaction byte-identical and marks
  the backup consumed (marker in the backup record). A repeat returns
  `already-completed`.
- Neither path deletes a journal it cannot prove terminal, follows a symlink, or
  overwrites an unrelated journal. The journal-creation race (PH-06) is closed for
  creation (atomic exclusive commit); lock-free *transitions* of an existing journal
  keep a documented residual micro-window — a transition loser detects the loss via
  post-commit verification in the common case, but the window is not eliminated.
  Treat any transition anomaly as a §6 stop condition.
- Nothing here proves power-loss durability (B-2: NOT_PROVEN). A process-kill test is
  not a power-cut proof. Do not claim a recovered state is power-loss-durable.

## 6. Safe stop conditions — stop and escalate when

- The classifier returns `unknown`, `symlinked`, or `unreadable`.
- `inspectManagedRecovery` returns `blocked: true` and the reason is not understood.
- No backup can be verified (hash mismatch, missing record, or no backup at all).
- The journal is torn/malformed and its `backupId` is not legible.
- A lock owner is gone but the lock cannot be retired by identity (see §4.7).
- A replay or rollback retains the journal with an error you do not understand.
- The evidence copy (§2) itself fails (failing disk, permission loss).
- Two operators disagree about what the current bytes should be.
- Anything in this runbook seems to conflict with the safety rules in §0.

Stopping is a successful outcome. An escalated unknown state is better than a
confident wrong restore.

## 7. Escalation — what to include

Send the maintainer:

1. The evidence bundle from §2 (hashes, classification output, the exact error code
   and message, the receipt if any).
2. The project path, the VCP version, the operator, and the date/time.
3. What was happening when the state was discovered (update / rollback / crash /
   power loss / unknown).
4. What you have already done (copies made, commands run, and their output) — and
   what you have NOT done (no deletions, no hand-edits).
5. The specific question: which of the §4 procedures applies, or whether the state
   is outside this runbook.

## 8. Worked examples

### 8.1 Manifest deleted after apply (R14)

Symptom: a rollback succeeds, receipt says `passed`, but
`manifestChecked: false, manifestReason: 'deleted-after-apply'`.
Meaning: the manifest was deleted after the apply; the file comparison passed and
the manifest was restored from the tamper-checked backup. Action: none required.
Keep the receipt with the rollback record.

### 8.2 No-record rollback refusal

Symptom: `rollbackV2` refuses `E_ROLLBACK_EVIDENCE_MISSING`
(reason `no-post-apply-record`); a user edit to `AGENTS.md` survives.
Meaning: the backup exists but no post-apply record accounts for the edit, so the
restore would have destroyed it. Action: do not force the restore. Decide with the
file owner whether the edit is kept (abandon the rollback) or deliberately discarded
(record the decision and hashes). If the edit is kept and the rollback is still
wanted, a new operation (with its own backup and post-apply record) is required.

### 8.3 Legacy journal

Symptom: classifier `legacy`; replay refuses `E_RECOVERY_LEGACY_JOURNAL`.
Meaning: an old-CLI-era transaction. Action: §4.1. Preserve the journal; reconstruct
the intent from the journal bytes + the backup + the live files; restore file by
file with hash verification, or re-initialize from a known-good state.

## 9. Error-code reference (P5)

| Code | Where | Meaning |
|---|---|---|
| `E_JOURNAL_ALREADY_EXISTS` | journal creation | A journal already exists; the exclusive commit refused deterministically. Exactly one creator wins. |
| `E_JOURNAL_CHANGED` | journal write/clear | The journal changed between read and write; re-read and retry from a fresh digest. |
| `E_JOURNAL_WRITE_NOT_DURABLE` | journal write | Post-commit verification failed; the write did not land as claimed. |
| `E_JOURNAL_NAMESPACE_CHANGED` | journal write/clear | The `.vcp` namespace changed under the transaction. |
| `E_JOURNAL_COMMIT_NAMESPACE_CHANGED` | journal write | The commit landed in a namespace that is no longer at this path (root replaced mid-transition). The write is durable in the detached tree; retry against the live path. |
| `E_JOURNAL_COMMIT_NOT_DURABLE` | journal write | The commit is visible at the live path but the sync did not complete; durability unproven. Do not assume it survived a crash. |
| `E_RECOVERY_LEGACY_JOURNAL` | replay | Legacy v1 journal; manual recovery required. |
| `E_RECOVERY_JOURNAL_TORN` | replay | Journal is not valid JSON; quarantined, not deleted. |
| `E_RECOVERY_UNKNOWN_PHASE` | replay | Unknown journal phase; manual recovery required. |
| `E_ROLLBACK_POST_APPLY_EDITS` | rollback | A file differs from its recorded post-apply hash. |
| `E_ROLLBACK_EVIDENCE_MISSING` | rollback | A change has no accounting post-apply record. |
| `E_ROLLBACK_STALE_TRANSACTION` | rollback | A record exists but cannot vouch for the current state. |
| `E_ROLLBACK_BACKUP_TAMPERED` / `E_ROLLBACK_ENTRY_TAMPERED` | rollback | Backup integrity failure; do not restore. |
| `E_ROLLBACK_CONFIRMATION_REQUIRED` | rollback | Explicit confirmation missing. |
| `E_LOCK_ALREADY_HELD` | rollback / lock | Another holder owns the lifecycle lock. |
| `E_D01_PUBLISHED_SANDBOX_NOT_VERIFIED` | old-CLI probe | The bwrap sandbox (or its canary) did not verify; no old-CLI probe ran. |

## 10. Revision note

This runbook fulfills OD-4 (fail closed on ambiguous legacy state + actionable manual
recovery contract) as the P5-03 deliverable. It does not modify any D-01 decision
record, production gate policy, or canonical SC-01 authorization. Updated 2026-11-17
for the fixes line (`f5fa129`): header re-pointed from the P5 candidate and the two
new journal codes (`E_JOURNAL_COMMIT_NAMESPACE_CHANGED`,
`E_JOURNAL_COMMIT_NOT_DURABLE`) added to the code table. If the line HEAD changes,
update the header (§0) to the frozen HEAD and re-verify the error codes against that
tree before citing this runbook as current.
