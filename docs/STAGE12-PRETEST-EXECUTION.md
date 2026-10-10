# Stage 12 P0/P1 — frozen-head validation handoff

**Status:** PRETEST PLAN ONLY / NOT EXECUTED / NOT ACCEPTED.
**Acceptance target:** full original Stage12 only, explicitly selected by maintainer 2026-10-10. Original AC-004/005/006 remain BLOCKED; no reduced-scope substitute is authorized. This plan is for future exact-head execution and is NOT a passing test receipt.

## Required preconditions

1. Check the live GitHub HEAD for PR #96 and
   `integration/stage12-build-candidate-20261009`. Use the integration
   full 40-character SHA (PR #95 contracts + PR #96 implementation).
2. Compare the integration tree against the exact product HEAD and the
   PR #95 contract lineage. Inspect all overlapping changed paths.
3. Use a new clean checkout detached at the frozen integration SHA.
   Confirm `git status --porcelain` is empty before *and after* execution.
4. Store receipts and stdout/stderr outside the checkout in a fresh
   absolute evidence directory, never overwriting earlier runs.

## One coordinated Linux validation batch

Run *after authoring freeze*, not as multiple intermediate green claims:

```bash
git fetch origin
git switch --detach <FROZEN_INTEGRATION_FULL_SHA>
git status --porcelain
node scripts/run-adaptive-local-gates.mjs \
  --expected-sha <FROZEN_INTEGRATION_FULL_SHA> \
  --evidence-dir /absolute/fresh/outside-checkout/stage12-evidence
```

The helper performs `npm ci`, contract guard, `npm run validate`
(which includes `npm run check`, the read-only boundary check and
all `npm test` suites) and `npm run pack:check`. Independently
record actual exit codes and full raw logs; inspect the entire
test failure listing and the resulting package contents.
Do not use pipeline masking such as `|| true` to manufacture green.

Run the published-old-cli historical audits separately, expecting exit
**2** for coherent *negative witnesses*, not success/GO:

```bash
node scripts/audit-d01-evidence.mjs \
  docs/evidence/stage12-old-cli-fence/linux-observations-20261009.json
node scripts/audit-d01-evidence.mjs \
  docs/evidence/stage12-old-cli-fence/windows-observations-20261009.json
```

`exit 2`: historic unsafe mutations corroborated; `exit 3`: malformed
receipt; `exit 0` is NOT expected from this negative auditor.

## Native Windows conformance

Use a real Windows/NTFS checkout of the **same frozen SHA**, not WSL.
Capture Windows build, Node/npm/Git, `process.platform`, disk type
and clean Git state. Run `npm ci`, the entire unchanged test suite,
`npm run validate`, `npm run pack:check`, and separate
`test/stage12-doctor-paths.test.mjs`,
`test/stage12-preview-security.test.mjs`,
`test/stage12-recovery-invariants.test.mjs` conformance.
Windows junction creation disabled by host policy means
**UNVERIFIED**, not a PASS for the critical junction guarantee.
Preserve byte hashes for all rejected linked paths. Any v2 writer
EPERM must stay fail-closed; never weaken directory-sync durability.

## Comparison and gating

- Reconcile all 137 historical failures enumerated in
  `docs/STAGE12-HISTORICAL-FAILURE-TRIAGE.md` against the new results.
  Do not claim they passed just because fixture imports changed.
- Reject any test that passes for the wrong reason (e.g. absent
  `readerVersion` instead of invalid schema metadata).
- Require no failed tests, no unexplained skips, no dirty checkout,
  no unsafe protected-byte changes and truthful expected D-01 negative
  witnesses. Native Windows remains a separate mandatory evidence scope.
- Run source/document decision guard and review required anchor coverage;
  passing static tokens are not independent semantic ratification.
- If a code, docs, test or finalization edit moves the SHA, rerun
  the same complete batch at the new exact final HEAD.

## Decision and release boundary

Before labeling full Stage12 accepted, complete the independent
anchor coverage review and all original technical safety gates documented in `docs/decisions/stage12-p0-review-packet-20261010.md`
and separately record applicable D-ID statuses with independent
anchor reviews. `D-01 = DEFERRED`, `G-FENCE = NO-GO` remain fixed.
Full Stage12's managed-v2 migration, crash recovery and new greenfield
writer are **not** cleared by these tests. Do not merge main, tag
or publish merely from green subset receipts.
