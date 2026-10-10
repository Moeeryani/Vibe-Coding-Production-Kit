# Stage 12 — integrated acceptance and D-01 proof matrix (DRAFT)

Status: BUILD ONLY / NOT ACCEPTED. This document is neither a test receipt
nor a maintainer decision. D-01/G-FENCE must remain NO-GO until independently
verified published-release evidence and explicit human approval.

## Exact integrated head rule

Draft contract PR #95 and implementation PR #96 must be assembled into a
single exact integration head. Author all implementation and test fixtures
before running the full acceptance suite. A subsequent code, test or
documentation edit changes the head and invalidates any prior receipt.
Old individual-branch green receipts cannot be borrowed.

## Acceptance criteria

| Criterion | Authored code / evidence | Still required |
|---|---|---|
| AC-001 | Contract-lineage local gate runner | Fresh combined SHA, clean tree, OS/Node/npm/Git receipts |
| AC-002 | Maintainer accepted D-02/D-03/D-04/D-05/D-06/D-12 policies on 2026-10-10; D-01 remains DEFERRED | Independent full-anchor review, actual implementation conformance and exact-head proof |
| AC-003 | manifest-v1-guard, manifest-v2, schema contract fixtures | Reader/writer minVersion and unknown-field cases on exact head |
| AC-004 | Authentic published v0.9.3 verified independently on Linux and native Windows; old CLI has 7 Linux and 8 Windows post-backup user-edit loss witnesses. Case 13 disproves directory-sentinel protection for old init on missing manifest. Product auditor now consumes both 12/13-case redacted receipts | **NO-GO proven.** Safe alternate fence, atomic handoff, concurrency, mid-write crash injection, Windows durability design and explicit maintainer acceptance remain BLOCKED/UNVERIFIED |
| AC-005 | managed-recovery-v2, versioned-journal, stale-journal-plan, committed-cleanup-plan | Crash by phase, exact byte proof, quarantine and native durability |
| AC-006 | managed-schema-migrator, managed-recovery-plan and versioned recovery | v1-to-v2 normal update, rollback/idempotence, G-FENCE release |
| AC-007 | managed-markdown, section-lifecycle | BOM/CRLF/mixed EOL, malformed markers, outside bytes unchanged |
| AC-008 | asset-catalog, adaptive-update-plan, adaptive-manage-plan | Correct legacy/full, new/safe, brownfield/minimal persistence |
| AC-009 | adoption-inspect, adoption-plan, CLI | Raw agent/GitHub/stack intent and ambiguous/polyglot projects |
| AC-010 | safe-path, safe-read, safe-create, safe-replace | Native Windows junction/reparse-point and hostile rename cases |
| AC-011 | command-authority, readiness and verify | Destructive effect receipts, policy version and runtime recheck |
| AC-012 | prompt-resolver, context, task | Correct fallback and no fictional brownfield starter docs |
| AC-013 | doctor, ownership-health, adapter-provenance | New/minimal/legacy install-health and strict exit truth table |
| AC-014 | template, asset-catalog | Safe new-install CI excludes source-only validate.yml |
| AC-015 | adoption-plan, CLI | Stable zero-write, content-free existing-repository JSON plan |
| AC-016 | authored test files, local gates and release tooling | Syntax, test, validate, pack, old-release smoke, platform proofs and final-head rerun |

## G-FENCE remains an external acceptance blocker

Candidate schema-v2 greenfield init, managed migration, recovery finalization,
and staging quarantine all require D-01 acceptance. The code deliberately
throws E_G_FENCE_NO_GO before opening project write paths. NEW init usability
is therefore NOT complete despite its authored writer, nor is managed-v2
mutation through normal update. Neither stage completion nor release approval
can be inferred from static code or planned tests.

## 2026-10-10 repair pass (AUTHORED, NOT YET TESTED)

- Public `initProject()` now checks the hard D-01 gate **before** creating a
  missing project root; dry-run and unmanaged brownfield continue to be read-only.
- A disposable **test-only** schema-v1 fixture builder prepares realistic managed
  state and baselines under the host temporary directory without calling
  `vcp init`, which must remain fail-closed. Downstream tests of doctor,
  task, readiness, context, verify, community plugins, React Native, workspace,
  update and CLI update are being switched to that builder.
- Legacy init-force regression now requires exact no-write refusal.
- Release-check tests now expect failure of the D-01 managed migration
  safety check even for an otherwise valid candidate.
- A redacted native Windows 13-scenario receipt has been copied from
  `evidence/stage12-d01-windows-native-20261009` at commit
  `9711013177900b4834906069491e5a1c6b2f8f45`.
  Receipt consistency is not a release tarball attestation or G-FENCE GO.
- The previous Linux run (`d13de6be`) had **469 tests: 331 pass, 137 fail,
  1 skip**. No replacement success totals may be claimed before an exact
  frozen combined HEAD run. Each remaining failed test needs classification;
  do not defer all failures to Stage 13.

**Native Windows discovery:** `syncContainingDirectory()` fails with
`EPERM` on NTFS (`E_DIRECTORY_SYNC_UNPROVEN`), causing the v2 writer
to stop before application. This fail-closed behavior MUST NOT be weakened
to achieve a green test. A genuinely Windows-safe durability implementation
remains future work, as does an old-binary fence that covers lock-blind
`init --force`.

The investigative published-old-CLI harness was authored on draft PR #89,
at source SHA 2e8e098924e0c01d7b02bf93b1c82205acb50f32, and copied
without executing it. Its historical Linux failures are NOT an exact-head
pass. Existing Linux and Windows proofs reproduced unsafe release behavior. Future *alternate-fence* proof must
use independently authenticated npm v0.9.3 archives and compare all user
file bytes before/after old update, manage, rollback and init, including
stale/dead/foreign locks, post-backup edits, concurrent new/old writers,
interrupted processes, native Windows junctions, and POSIX. Record a
distinct unverified result when a platform is unavailable.

## P0/P1 construction pass — 2026-10-10 (UNEXECUTED)

- The historical limited-scope proposal in
  `docs/STAGE12-SAFE-SUBSET-ACCEPTANCE-PROPOSAL.md` was rejected as final
  delivery by the maintainer on 2026-10-10. **FULL ORIGINAL STAGE12 SCOPE**
  is binding, including AC-004/005/006, Windows durability and v1→v2
  migration. D-01/G-FENCE still blocks activation, not candidate authoring.
- Every historical test failure from the `d13de6be` 469-test Linux run
  is individually inventoried in `docs/STAGE12-HISTORICAL-FAILURE-TRIAGE.md`:
  **112 D-01-gated init, 24 EXISTING brownfield-init rejection,
  1 release-check expectation**, total 137. These classifications do not
  constitute a new PASS.
- `test/helpers/legacy-v1-fixture.mjs` now preflights every intended path
  and schema-v1 field before initial writes, refuses linked ancestors and
  roots outside isolated `vcp-*` OS-temp directories and never claims
  existing user-owned bytes. The original public CLI remains gated.
- The schema-v2 malformed metadata test now passes its `readerVersion` so
  it cannot pass because a reader option is omitted. Native-Windows
  symlink test uses an actual skip with return rather than continuing.
- `lib/stacks.mjs` and `lib/doctor.mjs` now route stack evidence and
  Doctor document reads through no-follow read boundaries; added
  `test/stage12-preview-security.test.mjs`,
  `test/legacy-v1-fixture-boundaries.test.mjs` and
  `test/stage12-doctor-paths.test.mjs` for content-free read-only planning,
  fixture integrity, in-root/external links and Windows junction controls.
- These fixes are **authored only**, not evidence of a clean test run.
  Race-free safety, general Windows durability and full managed schema-v2
  lifecycle remain unproven and fenced.

## Final source-authoring checklist (still no executed checks)

- After D-02 policy acceptance, the public `doctorExitCode` candidate
  was modified to consume applicable `installHealth`, separate from
  governance findings. This is authored, **not yet executed or validated**.
  Test fixtures describe absent brownfield starter assets as not applicable.
- `scripts/check-stage12-readonly-contract.mjs` is included through the
  new `npm run check:stage12-contract` step inside `npm run validate`.
  It statically enforces continued NO-GO, no pre-gate mkdir, negative 12/13
  scenario witness identities and no production import of test-only fixtures.
- The new linked-root and package-marker Doctor tests cover real symlinks
  and opt-in Windows junctions, returning an explicit skip only when the
  Windows host lacks permission to create the fixture.
- `docs/decisions/stage12-p0-review-packet-20261010.md` records the six
  reviewed policies. Maintainer choices D-02/D-03/D-04/D-05/D-06/D-12
  are **ACCEPTED as decisions**; D-01 remains DEFERRED. All required-anchor
  coverage reviews remain PENDING and no implementation test has passed.
- A fresh combined final-head test execution is mandatory before any
  acceptance; no "137 failures fixed" assertion is authorized here.

## Test execution and governance

Do not run npm check/test/validate/pack, syntax runners, package smoke or
native conformance before authoring is complete. At code freeze, run the
entire suite against one combined exact head, retaining raw output,
exit codes and independently checked Git state. A failed or unavailable
required gate leaves Stage 12 Plan/Blocked. Maintainer D-01 acceptance
must be recorded in the authoritative decision register, followed by
any gated-writer activation and a brand-new exact-head acceptance run.

No Stage 13 adoption apply, main merge, tag or publication is approved.

## 2026-10-10 continued construction — NOT A PASS RECEIPT

After the initial integrated candidate, code was authored and merged into
the Stage12 integration line for these **build-only** changes:

- `lib/manifest-v1-guard.mjs` and `lib/manifest-v2.mjs`: strict
  pre-conversion v1 field validation, portable alias and file/parent
  collisions across managed and ignored ownership.
- `lib/managed-recovery-v2.mjs` and `lib/owned-tree-inventory.mjs`:
  normalized ownership-ledger collision checks, backup modes, reserved
  Windows names and ambiguous file-vs-directory ownership.
- `lib/managed-schema-migrator.mjs` and `lib/versioned-recovery-apply.mjs`:
  bounded no-follow Manifest reads, locked exact source-byte identity,
  exact restored digest requirement before journal clearance.
- `lib/file-durability.mjs`, `lib/lifecycle-lock-v2.mjs` and
  `lib/safe-replace.mjs`: operating-system durability preflight before
  initial lock bootstrap or non-lifecycle replacement staging. Windows
  remains explicitly **UNSUPPORTED / NO-GO** pending a native proof.
- `lib/versioned-backup.mjs`, `lib/versioned-journal.mjs`,
  `lib/safe-create.mjs` and the low-level manifest replacement:
  direct-call D-01 guards prevent independent imports from authorizing
  selected-root mutations. The static source boundary checker now pins
  these guards and durability-preflight calls.
- Extended `test/stage12-schema-contract.test.mjs` and
  `test/stage12-recovery-invariants.test.mjs` with negative cases.
  **These test cases have been written but never executed in this pass.**

**Cannot close yet:** AC-004 universal published-old-binary zero-write
fence remains contradicted by Linux/Windows loss witnesses; an OS-enforced
alternate or independently approved changed cutover invariant is required.
AC-005/006 recovery/migration cannot be declared successful without
fenced-writer release and crash/platform proof. AC-010 requires hostile
rename/junction proof. Windows directory-entry durability remains unproven.
AC-001/016 need full frozen combined-head test and release gates. D-01 is
DEFERRED, G-FENCE NO-GO, all independent decision-anchor coverage
reviews PENDING. Full original Stage12 remains required.

The test agent must use only a later frozen, fully integrated commit. No
result from the historical `d13de6be` run or previous branch-specific
CI may be promoted to a receipt for this construction pass.

## Continued Stage12 construction — recovery lineage and deletion durability

Integration commit `f13ceb11759c6d31041a9fe3454684e8610119b8`
combines further **unexecuted** implementation changes:

- Greenfield recovery now requests directory synchronization after each
  owned-file unlink, empty-directory removal, and final state-directory
  removal. A successful per-file hash before unlink is not enough to
  acknowledge persistence of a namespace deletion. This still does not
  solve hostile rename races or unsupported native Windows durability.
- Versioned init journals must enumerate exactly named VCP manifest and
  gitignore controls even if the operation crashed before creating them;
  a ledger omitting these required planned outputs is never an accepted
  recovery ownership proof.
- Managed recovery preview validates the entire backup's historical
  schema-v1 allowlist and verifies `priorInstalledVersion` provenance
  instead of trusting two superficial v1 fields.
- Versioned backup, journal, manifest and v1→v2 preview refuse a
  `minimumReaderVersion` of 0.9.3 or below. The current local
  package remains 0.9.3; the migration preview reports
  `ADAPTIVE_READER_NOT_RELEASED` without filesystem writes.
- Authored regression fixtures cover incomplete init ledgers, the
  preserved prior-version witness and refusal of 0.9.3 as v2 reader.

**Known open crash-resume defect:** `greenfield-recovery-apply` still
deletes its backup metadata/directory before clearing the owned journal.
An interruption in that gap can leave an incomplete journal without its
backup provenance, so repeat invocation cannot prove a safe resume.
Reordering multi-file cleanup alone creates the inverse orphan-control
problem; an explicitly crash-restartable terminal cleanup protocol with
owned markers and independent test evidence remains a P0 requirement.
Do not call AC-005 complete, activate this writer or classify a partial
recovery receipt as a pass.

No tests, syntax checker, local acceptance runner, native Windows
conformance or published-old-binary execution were run in this pass.
`D-01 = DEFERRED`, `G-FENCE = NO-GO`, no main merge or release.
