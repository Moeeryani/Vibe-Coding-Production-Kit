# Stage 12 — bounded safety/read-only acceptance proposal

**Status: HISTORICAL PROPOSAL — REJECTED as the Stage12 delivery target by the maintainer on 2026-10-10T19:02:43Z.**

The maintainer explicitly chose **full original Stage12**, including managed-v2 migration, native Windows durability and versioned recovery. These remain outstanding Stage12 gates; the subset below is NOT a valid completion criterion.
**Date of proposal:** 2026-10-10. **Implementation:** PR #96 plus the contract
lineage in PR #95, assembled into a single exact-head integration candidate.

## Decision request

Stage 12's original task contract includes a live managed schema-v1→schema-v2
migration, greenfield-safe init writer and fully versioned crash recovery.
Those write paths **cannot be accepted**: the published 0.9.3 release was
authenticated and reproducibly erased user edits on both Linux and native
Windows, including lock-blind `init --force` after deleting the manifest.
Native Windows NTFS also returned `E_DIRECTORY_SYNC_UNPROVEN` / `EPERM` for
the current directory fsync primitive. A passing unit suite is not proof of
an old-binary compatibility fence or durable new writer.

**Proposed interim acceptance label:** `STAGE12_READ_ONLY_FOUNDATION`,
distinct from `STAGE12_FULL` and distinct from an npm release approval.
Require explicit maintainer ratification to use this label; do not silently
rename or mark the original task `Status: Done`.

### Eligible for interim acceptance, once tests and decision review pass

- Read-only project/root classification and adoption JSON plans for NEW,
  EXISTING and MANAGED repositories; unmanaged-existing apply is zero-write.
- Strict schema-v1 enumeration; schema-v2 in-memory validation/preview only.
- Content-free / deterministic intent, assetSet and adapter inspection.
- No-follow path boundaries, bounded reads and project-authored byte
  preservation, with honest TOCTOU and native-platform limitations.
- Command-authority observation and execution-time verify guard;
  Doctor install-health reporting must reflect approved D-02 semantics.
- Packaged prompt fallback without fictional source-of-truth documents.
- Historic schema-v1 lifecycle compatibility *within v1*, tested only with
  disposable projects, without pretending the new public init can install v1.
- Published-old-CLI negative witness audit of 12 Linux and 13 Windows
  fixtures, which must always return a NO-GO disposition.

### Explicitly NOT eligible for interim acceptance

- Schema-v2 greenfield apply, managed v1→v2 migration, v2 update apply,
  owned recovery restore, versioned committed cleanup or staging quarantine.
- Live unmanaged brownfield apply / rollback-to-absence (Stage 13).
- Any guarantee that published v0.9.3 cannot modify a v2 repository.
- Claiming a production-ready replacement release for existing v0.9.3.
- Claiming Windows lifecycle directory sync, atomic lock handoff or
  crash/concurrent old-vs-new writer safety.

## Explicit AC disposition relative to original task

| Original AC | Proposed interim disposition | Evidence required |
|---|---|---|
| AC-001 | REQUIRED | Exact clean composite HEAD; Linux and Windows scope identified |
| AC-002 | REQUIRED DECISION | C-01–C-14 semantic location review; D-02/03/04/05/06/12 approval as applicable |
| AC-003 | READ/PREVIEW ONLY | v1/v2 unknown-field, minimumReaderVersion, ownership and assetSet rejects |
| AC-004 | **DEFERRED / FAILING** | Negative old-CLI 7/8-loss evidence remains; never count as green fence |
| AC-005 | AUTHORING/INSPECTION ONLY | Recovery plans read-only; all v2 restoration/cleanup apply gated |
| AC-006 | **DEFERRED** | v1→v2 preview only; v1 lifecycle regression must pass |
| AC-007 | PROPOSAL ONLY | Whole outside-region bytes, BOM, mixed CRLF, ownership conflicts |
| AC-008 | REQUIRED | AssetSet-aware preview and legacy fixture no unintended additions |
| AC-009 | REQUIRED | Explicit agent/GitHub/stack, nested, polyglot, conflict cases |
| AC-010 | REQUIRED FOR READS | Windows junction/links tested; write-time race proof **NOT** claimed |
| AC-011 | REQUIRED | No duplicate authority; no `--yes` human-approval bypass |
| AC-012 | REQUIRED | Content-free prompts, task docs, no invented project facts |
| AC-013 | REQUIRED DECISION | D-02 Doctor strict matrix reviewed and ratified |
| AC-014 | SURFACE PLAN ONLY | Validate source-workflow omission; writer remains disabled |
| AC-015 | REQUIRED | Deterministic, content-free JSON; zero-write brownfield preview |
| AC-016 | REQUIRED FOR INTERIM | Full exact-final-head clean tests/validate/pack; supported-platform receipts; no skipped critical checks |

**Original AC-004/005/006 remain OPEN for `STAGE12_FULL`.** The table above
is a scope proposal, not a reinterpretation of a failed original criterion.

## Required green gates after code freeze

1. Verify PR #95 contracts and PR #96 product are present in *one immutable*
   integration tree; review changed paths, cross-PR dependency lineage,
   independent required-anchor inventory and current decision states.
2. Run `npm ci`, `npm run check`, `npm test`, `npm run validate`,
   `npm run pack:check` and `node scripts/check-adaptive-contracts.mjs`
   from the same fresh clean frozen SHA. Capture exit codes and full raw logs
   outside the checkout; audit the package archive contents.
3. Run native Windows read-only/path/junction conformance on the frozen SHA
   as well as Linux. Platform-unavailable, skipped critical fixtures, or
   negative security changes remain BLOCKED; never convert to PASS.
4. Audit all previously failing v1-init tests: use isolated version-1
   fixtures only for historical downstream tests; public init must prove
   zero user/project writes and deny any attempt to re-enable schema-v2.
5. Distinguish expected D-01 audit exit code 2 (negative witness), tool
   failures exit 3 and ordinary validation success exit 0.
6. Review versioned-journal, lock and recovery source only as guarded
   candidates; their tests must prove refusal prior to mutation, not safety
   of disabled live writes.
7. Explicitly record maintainer decision and scope. Only then may the
   *interim read-only subset* be accepted. Full Stage 12 and release remain
   blocked and require a separately proved new old-binary fence.

## Ownership / release invariant

`D-01 = DEFERRED`, `G-FENCE = NO-GO`,
`MANAGED_SCHEMA_MIGRATION_GATE.managedV2MutationAuthorized === false`.
No alteration to `main`, tag, package publish, or Stage 13 apply is
authorized by this proposal. Do not remove or downgrade any error to
make a test appear green.
