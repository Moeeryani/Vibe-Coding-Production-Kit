# Stage 12 / PR12.1a — read-only foundation preflight (DRAFT / BLOCKED for product implementation)

**Status: EXECUTABLE BASELINE TESTS ADDED; NO PRODUCT-CODE APPROVAL.**
**Branch/PR:** `test/stage12-1a-preflight-readonly-20261009` (draft, stacked on #90 → #87 → #86).
**Audited current main baseline:** `8ccb276545fdb3cc301ce7ce324812eb4c314586` (v0.9.3).
**Scope:** minimal isolated characterization tests and a bounded PR12.1a implementation contract. **No migration, v2 writer, v2 reader, CLI behavior change or data mutation has been introduced.**

## Why the first Stage12 deliverable is a safe characterization

PR #89's real published v0.9.3 Linux POC proves 7 unsafe mutations in 12 hostile-release scenarios. The newest-v2 backup restores older user content; a separate `lifecycle.lock` is ignored; a stale legacy lock can be reaped. Directory sentinel blocked old rollback/update/manage on Linux only, but old init with a missing manifest plus sentinel, native Windows, atomic installation, old/new concurrency and crash recovery have not been proven. **G-FENCE = NO-GO**. Never use the positive Linux sentinel subcases as an authorization to migrate a managed project.

PR #90 provides a *cooperative local* exact-SHA gate and partially focused documentation regression checks, not trusted branch merge protection. Its last committed local receipt is for the predecessor SHA `a865d941...` while the evidence commit is `e4006e66...`; it requires an independently executed final-head receipt. G-DOCS / D-06 remain unapproved. Stage12 Task Pack in #86 remains Plan/BLOCKED.

This PR starts Stage12 work by freezing **current, zero-write baseline behavior** in disposable fixtures. A later PR12.1a product-code implementation can be reviewed only after its own dependency decisions and exact-head gates are approved. Adding tests is *not* an approval of those decisions.

## Concrete delivered tests

`test/stage12-1a-preflight-safety.test.mjs` defines seven isolated Node test cases:

| ID | Current behavior characterized | Invariant |
|---|---|---|
| ST12-PF-01 | Schema-v1 manifest reader | Read from managed root does not change any byte or mode |
| ST12-PF-02 | Unsupported far-future manifest schema | Fail closed and preserve entire synthetic root |
| ST12-PF-03 | Malformed JSON manifest | Error without rewriting corrupt state |
| ST12-PF-04 | Unmanaged EXISTING root, `initProject(dryRun:true)` | Deterministic nonmutating legacy preview; `.vcp` not created |
| ST12-PF-05 | User-authored `AGENTS.md` collision | No silent overwrite; complete tree unchanged |
| ST12-PF-06 | Managed-path normalization | Reject parent traversal and reserved `.vcp` state |
| ST12-PF-07 | Linked-directory path escape | Existing helper rejects symlinks, includes native junction attempt (skip explicitly if host forbids link) |

Fixture properties: all projects are under temporary directories created using `mkdtemp`; no real project paths; SHA256 byte hashes, modes, directory entries and symlink targets checked before/after; fixture cleanup on completion. The native Windows junction case is **UNVERIFIED until executed**; skips must be disclosed, not silently accepted.

**IMPORTANT:** These tests characterize existing v0.9.3 behavior. They are NOT a Stage12 smart-init planner, v2 reader, transactional migration, provenance catalog, section owner or advanced path resolver. Preserve ST12-PF-02 when implementing v2 by checking a schema *above the highest supported version*, not by hardcoding 'v2 always refuses'.

## PR12.1a future product implementation — acceptance contract (NOT YET AUTHORIZED)

**After** documented D-03 (no-follow policy), D-06 (canonical accepted-ID registry and local-gate procedure), B-05/S/T normative correction acceptance and G-ENTRY exact-head validation:

1. Add a single purpose-aware selected-root path validator; no implicit parent/sibling authority, no symlink/junction following by default; document bounded TOCTOU limitation. Preserve existing 0.9.3 managed paths and sentinel behavior while making errors explicit.
2. Add a single real SemVer comparator used consistently by manifest read and runtime minimum version check. Tests for release/pre-release/build metadata and malformed input, no external-network dependency.
3. Add a centralized *read-only* manifest schema metadata reader for v1 and prospective v2, with `INERT_MANIFEST_FIELDS` enumeration and fail-closed unknown semantic fields. Define minimumReaderVersion, missing/present/unknown assetSet rules, and immutable input buffer semantics **before** changing writers.
4. Keep all schema2 write paths, v1→v2 conversion, auto-restore, stale transaction rewrite, CLI mutation and migration feature flags OFF. The full-version backup+journal recovery and D-01 old-CLI fence belong to separately gated PR12.1b/1c, not smuggled into 1a.
5. Add deliberate reader-only negative fixtures (unknown/future schema, semantic field, missing metadata, duplicate/invalid value, corrupt JSON, Windows junction). Ensure no `.vcp` directory or user file changes from preview/inspection.
6. Run tests on current exact head and native Windows when available. Do not claim Windows support from Linux success. Record failing dependencies separately as BLOCKED rather than weakening assertions.

**Additional decisions:** D-02 required before Doctor behavior; D-04 before planner JSON; D-05 before section composition; D-12 before execution-time `verify --run` gates. D-07..D-10 remain Phase5/7; D-11 Stage13.

## Local execution — agent instructions

On an independently fetched, clean detached checkout of THIS PR's latest full SHA, Node >=22:

```bash
node --check test/stage12-1a-preflight-safety.test.mjs
node --test test/stage12-1a-preflight-safety.test.mjs
npm ci
npm run validate
npm run pack:check
node scripts/run-adaptive-local-gates.mjs --expected-sha <exact-current-PR-HEAD-40-hex> --evidence-dir <fresh-absolute-directory-outside-repo>
```

Capture individual exit codes, exact SHA, OS/build/architecture, Node/npm/Git versions and complete raw stdout/stderr. Avoid double-counting duplicate `npm validate` runs. A failed scenario is evidence, not permission to loosen a test. Do not commit receipts to the same branch then claim the previous SHA is still the final HEAD: upload receipts in PR discussion or a stable external location.

## Exit condition for this specific preflight

- [ ] The 7 characterization cases run and pass or have explicit scientifically meaningful skips, with every path/byte violation a test failure.
- [ ] Last-head local gates run and full receipt/raw logs attached or linked independently.
- [ ] Platform scope and unresolved Windows limitations recorded.
- [ ] Maintainer independently reviews scope and confirms no Schema-v2 write or product-code changes.
- [ ] G-FENCE remains NO-GO, D-01/D-03/D-06 remain PROPOSED pending explicit decisions.
- [ ] Task Pack remains Plan/BLOCKED for product implementation; THIS review is preparatory, not a Stage12 completion sign-off.

## Dependency map

````text
#86 decision register / Task Pack --PROPOSED--> #87 S/T corrections --DRAFT--> #90 interim local gates
                                                                              |
                                                                              +--> THIS PR: PR12.1a preflight only
#88 legacy test harness --> #89 real published v0.9.3 results: D-01 G-FENCE NO-GO --> PR12.1b/1c migration BLOCKED
````

**Decision needed from maintainer (separately):** Accept or reject D-03 and D-06 with reasons, affected anchors and evidence; review #86/#87 G-DOCS correction coverage. Do not infer approval from the request to start Stage12.
