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
| AC-002 | Canonical decision ledger and S/T contract PR #95 | Independent full-anchor review and actual decision ratification |
| AC-003 | manifest-v1-guard, manifest-v2, schema contract fixtures | Reader/writer minVersion and unknown-field cases on exact head |
| AC-004 | PR #89 historical 12-case Linux evidence; `scripts/audit-d01-evidence.mjs` confirms internal 7-witness NO-GO; 13th missing-Manifest+sentinel fixture authored | Independent published 0.9.3 SHA512 provenance, native Windows, concurrency, crash, atomic transition and maintainer D-01 acceptance remain UNVERIFIED |
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

The investigative published-old-CLI harness was authored on draft PR #89,
at source SHA 2e8e098924e0c01d7b02bf93b1c82205acb50f32, and copied
without executing it. Its historical Linux failures are NOT an exact-head
pass. On an explicitly approved disposable environment, later proof must
use independently authenticated npm v0.9.3 archives and compare all user
file bytes before/after old update, manage, rollback and init, including
stale/dead/foreign locks, post-backup edits, concurrent new/old writers,
interrupted processes, native Windows junctions, and POSIX. Record a
distinct unverified result when a platform is unavailable.

## Test execution and governance

Do not run npm check/test/validate/pack, syntax runners, package smoke or
native conformance before authoring is complete. At code freeze, run the
entire suite against one combined exact head, retaining raw output,
exit codes and independently checked Git state. A failed or unavailable
required gate leaves Stage 12 Plan/Blocked. Maintainer D-01 acceptance
must be recorded in the authoritative decision register, followed by
any gated-writer activation and a brand-new exact-head acceptance run.

No Stage 13 adoption apply, main merge, tag or publication is approved.
