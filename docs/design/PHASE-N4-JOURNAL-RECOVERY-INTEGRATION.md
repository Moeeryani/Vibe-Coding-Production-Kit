# Phase N+4 — Journal Compatibility & End-to-End Recovery Integration

Base: Phase N+3 candidate `748dd65` (tree `1ae1fbe8`).
Status: engineering candidate; independent validation not yet run.
Gates unchanged: D-01 DEFERRED, G-FENCE NO-GO, B-2 NOT_PROVEN,
WINDOWS_PRINCIPAL_PROVIDER null, PRODUCTION_WRITERS DISABLED.

## 1. Version compatibility (0.9.4)

The N+3 validator's BLOCKED finding: at package 0.9.3 no format-valid
v2 journal can clear, because clear decodes with the CLI version as
reader while the format floor requires minimumReaderVersion > 0.9.3.

Decision: development package version 0.9.4 (`package.json` +
`package-lock.json`, top-level and `packages['']`), with an identity
migration entry `0.9.3-to-0.9.4-journal-compatibility` (no renames,
removals, or manifest change — the v2 journal format, manifest
schema, and format floor are all unchanged). Rationale and bounds:

- The format was evidently designed for the next release; 0.9.4 is
  the smallest version satisfying the existing floor rule.
- The floor is NOT lowered, and no journal is decoded by trusting
  its self-declared minimum as the CLI's capability: every decode
  uses the executing CLI's own version (or a caller-supplied reader
  version) as the reader.
- This is a development version step, not a release: no tag, no
  npm publish, no release notes, no GitHub Release.
- The migration entry is part of the same step because the CLI
  update flow requires a path for every version bump; without it,
  updating a 0.9.3 project to 0.9.4 fails ("No migration path").
  The release-policy snapshots were updated alongside, preserving
  the policy itself: the chain snapshot grows by one entry, and
  the "candidate without migration" release-check fixture moves to
  0.9.5, a version with genuinely no entry, so it keeps proving
  that a candidate without a chain fails.
- Side effect, as designed: `greenfield-prepare`'s
  `ADAPTIVE_READER_NOT_RELEASED` gate (CLI <= 0.9.3) now passes at
  0.9.4. Managed mutations remain gated by G-FENCE NO-GO.

Second, adjacent defect found during N+4: `writer-recovery`'s
`readJournal` decoded with NO reader version at all, so a v2
journal could never decode there at any package version. Fixed:
it now decodes with `getCliVersion()` (the executing CLI's
capability, not the journal's claim).

## 2. Cross-call continuity (the N+3 residual)

Within one anchored call the namespace pin holds; across calls it
did not, because production apply paths acquired a lock but did
not uniformly assert it before each journal write. Fix: the
journal API now takes the transaction's acquired lock, and the
authorization lattice in `writeVersionedJournal` /
`clearVersionedJournal` is:

1. Test capability, when given, is verified (existing regime).
2. A transaction lock, when given, is asserted per call
   (`assertOwnedLifecycleLock`, anchored, identity-bound) BEFORE
   any read or mutation. A `.vcp` swap between calls is caught
   here — the lock's acquire-time anchor no longer matches.
3. With neither, the production gate decides (throws while
   G-FENCE is NO-GO). A lock alone never bypasses the gate.
4. Past the gate (post-GO future), an unbound mutation in
   anchored mode refuses `E_JOURNAL_UNBOUND`; legacy mode
   proceeds on the gate alone.

The gate call sits literally inside both function bodies (the
Stage12 static tripwire requires it). All 15 production journal
calls now pass their in-scope lock: greenfield-apply-v2 (1 write
helper + 1 clear), managed-schema-migrator (4 writes + 1 clear),
writer-recovery (1 write + 1 clear), writer-rollback-v2 (1 + 1),
greenfield-recovery-apply (2 writes), versioned-recovery-apply
(1 clear), committed-cleanup-apply (1 clear). A same-root lock
authorizes that root's lifecycle (serialization); a different
root's, released, or copied-payload lock refuses.

## 3. Provenance integration

Inventory (production artifact types):

| Artifact | Recorded? | Recovery deletion authority |
|---|---|---|
| Journal (`.vcp/transaction.json`) | Yes (N+3, staged inode before rename) | Terminal clear ONLY — see guard |
| Writer destination temps (`.<name>.vcp-*.tmp`) | No — they are pre-commit staging, never committed outputs | N+2 `reapStaging` pattern+identity sweep (unchanged; NOT replaced) |
| Writer committed outputs | No — committed outputs are not staging and must never become recovery-deletable | None |
| Recovery/rollback staging | Via `recordStagingCreation` by callers that stage | `recoveryCleanupStaging`, transaction-scoped |

Changes:

- **Control-artifact guard** (`CONTROL_ARTIFACTS`): recovery
  cleanup never deletes `.vcp/transaction.json`,
  `.vcp/update.lock`, `.vcp/writer-audit.log`, or
  `.vcp/staging-provenance.json`, even with a matching entry
  (the critical hazard: the journal's own entry identifies its
  committed inode). Skipped as `CONTROL_ARTIFACT`, retained.
- **Content check**: entries carrying `size`/`sha256` (new
  optional fields on `recordStagingCreation`) are verified
  against current bytes before unlink — a recycled inode under
  the same name does not authorize deleting different content.
- **Vanished-entry pruning**: an ENOENT stat for the recovered
  transaction's entry forgets the entry (nothing remains to
  delete); ambiguous failures retain it. This corrects the
  N+3 validator's comment/code mismatch (comment said vanished
  entries are forgotten; code retained them).
- **Corrupt registry fails closed**: a non-JSON registry now
  throws `E_PROVENANCE_FORMAT` (previously a raw SyntaxError
  escaped the module's error contract); full registry (4096)
  still refuses new recordings.
- **Production wiring**: `writer-recovery` now runs
  `recoveryCleanupStaging` for the recovered transaction after
  restore/complete and before the `recovering` journal
  transition; the result is reported in the receipt as
  `stagingCleanup` (failure reported, never mistaken for
  restore success/failure). The journal survives this step via
  the control guard and leaves only via terminal clear.
- Trust boundary preserved: the registry is unauthenticated
  JSON — it proves namespace+identity continuity, not
  authorship. An actor with `.vcp` write access could forge an
  entry, but could also delete the file directly.

## 4. Terminal clearance and the registry

`assertTerminalJournalClearance` (cleanup phase) required
exactly `{transaction.json, update.lock}` in `.vcp` — but every
anchored write creates `staging-provenance.json` as a third
entry, making anchored terminal clear unreachable. Fix: the
registry is accepted as a third state entry (it is system
state, not transaction output, and the clear forgets the
journal's entry after proven removal). Root must still contain
exactly `.vcp`; operation must still be `init`; cleanup-phase
decode evidence (`cleanupBackupHash`) unchanged.

## 5. §6 findings disposition

- Anchored release masked helper-trust failures as
  `E_STATE_BOOTSTRAP_CHANGED`: FIXED — trust codes
  (`E_NATIVE_HELPER_UNTRUSTED`, `E_NATIVE_HELPER_MISSING`,
  `E_SECURE_PROVIDER_UNVERIFIED`, `E_SECURE_PROVIDER_UNAVAILABLE`)
  now propagate from both the state re-verification and the
  bound payload read; the operation still refuses safely.
- Acquire post-creation path-based cleanup unlink (negligible
  window, N+3 §3): HARDENED for anchored mode — cleanup now
  uses expectation-bound `deleteFile`; legacy path unchanged.
- `readVersionedJournalDigest` content-only: DOCUMENTED in
  place, plus new `inspectVersionedJournal` (digest + measured
  identity + provenance status) as the recovery-inspection
  path. Digest is never an ownership proof.
- X-05 verification-to-exec window: OPEN, unchanged (bounded,
  per-spawn re-verification; no pinned-copy execution).
- R-4, R-5, R-6: OPEN, unchanged. B-2: NOT_PROVEN. B9-01b:
  INCONCLUSIVE (unchanged; in the byte-identical failing set).
- `writer-recovery`'s clear call carries no expected hash and
  its failure is swallowed (pre-existing shape, unchanged):
  the journal remains in `recovering` phase for follow-up
  recovery. Not reinterpreted as success — the receipt reports
  the restore action, and PN4-10 asserts the journal is
  retained. A follow-up may tighten this; it is out of N+4
  scope to change recovery receipts.

## 6. Tests and mutations

Suite `test/writer-journal-recovery-integration.test.mjs`,
PN4-01..PN4-13 (13/13): lifecycle at 0.9.4, older-reader and
forged-descriptor refusal, illegal transitions, legacy-shaped
digest clear, cross-call swap refusal before mutation,
foreign/released/copied locks, unbound refusal + source order,
committed-journal protection, content/vanished/corrupt/full
registry, writer-recovery integration, release trust
unmasking, multi-step transitions, terminal clearance.

Mutations (disposable copies, byte-exact SHA-256 restoration,
13/13 re-pass after each restore): MN4-A lock assert removed
→ PN4-05+PN4-06 fail; MN4-B control guard removed → PN4-08
fails; MN4-C terminal clearance neutered → PN4-13 fails;
MN4-D content check removed → PN4-09 fails; MN4-E unbound
branch removed → PN4-07 fails. All load-bearing.

PN3-06 updated: its second half previously asserted the 0.9.3
decode refusal (`E_JOURNAL_UNREADABLE_FOR_CLEAR`); with 0.9.4
the genuine clear now succeeds, and the test asserts removal
plus provenance forgotten. This is the fix working, not a
relabel: the old expectation was the bug's symptom.

## 7. Regression

Same Linux environment, filesystem, and TMPDIR discipline for
candidate and baseline (workspace TMPDIR; /tmp is a 512 MB
tmpfs and an earlier run was cut off by test temps filling it
— evidence moved to `~/workspace/vcp-n4-evidence/`).

| Version | Total | PASS | FAIL | SKIPPED | `npm test` exit |
|---|---:|---:|---:|---:|---:|
| Phase N+3 reference (`748dd65`) | 1045 | 965 | 64 | 16 | 1 |
| Phase N+4 candidate | 1058 | 978 | 64 | 16 | 1 |
| **Delta** | **+13** | **+13** | **0** | **0** | same |

Failing-name set byte-identical to the N+3 reference
(SHA-256 `2b1a0821…`); no new failures, none fixed by
relabeling. Check 165 modules OK. Native helper binary
unchanged from N+3 (`a81be07f…`; N+4 changed no C++ source).

## 8. Remaining risks and acceptance blockers

- JOURNAL_VERSION_COMPAT is fixed in this tree by the 0.9.4
  development step, but that step is NOT a release: no tag,
  publish, or release notes accompany it. The owner decision
  that remains is the 0.9.4 release itself (which the migration
  entry now makes coherent).
- FULL_TRANSACTION_CONTAINMENT remains NOT_PROVEN: cross-call
  journal continuity is now enforced for journal calls, but
  non-journal transaction mutations (file writes, manifest
  replacement) were not re-audited for lock assertion in this
  phase; X-05, R-4/R-5/R-6, B-2 remain open.
- The provenance registry remains unauthenticated JSON
  (continuity, not authorship).
- Writer destination temps remain under the N+2 pattern sweep,
  not provenance — by design, but a future phase may record
  them at staging time for uniform cleanup.
- `writer-recovery`'s hash-less clear swallow (see §5) is a
  known follow-up, not a silent success.

## 9. Independent Linux acceptance requirements

Fresh clones of the frozen candidate vs the N+3 baseline;
PN/PN1/PN2/PN3/PN4 suites; independent cross-call interposition
(swap between every journal call, including swap-back before
release); lock-ownership matrix (foreign/released/copied);
committed-journal deletion attempt via recovery cleanup;
terminal-clearance matrix; mutations MN4-A..E re-run with
byte-exact restoration; full regression with exact
failing-name comparison; explicit judgment on whether
JOURNAL_VERSION_COMPAT may now be recorded closed for this
development tree, and whether FULL_TRANSACTION_CONTAINMENT
remains NOT_PROVEN. No push, merge, release, or gate change
in validation scope.
