# OD-1 Scoped Task Pack Creation — Security Acceptance Matrix

**Status: DESIGN ONLY. No implementation. No approval recorded.**

- Baseline: `d4fb3ce` / tree `e7119fa2`. Design:
  `VCP-OD1-SCOPED-TASK-CREATION-DESIGN.md`. Threats:
  `VCP-OD1-THREAT-MODEL.md`.
- This matrix is the contract and test specification for the
  implementation follow-up. It modifies no existing test and no
  implementation. Every case names its fixture, action, expected
  result (exact refusal code where applicable), classification,
  and the invariant it proves. "Adversarial" means the test
  drives a hostile or racy filesystem state, not merely an
  invalid input.
- Classifications: **U** unit (pure/isolated logic),
  **I** integration (real filesystem + real modules, disposable
  fixtures), **A** adversarial (fault injection, swaps, races),
  **L** Linux-native, **W** Windows-native (gated on a future
  Windows campaign; recorded UNPROVEN until then).
- The fence-preservation gate (§3) is load-bearing: the scoped
  implementation must not change the outcome of any existing
  refusal test.

## 1. Test specification

### 1.1 Eligibility — NEW and EXISTING projects

| ID | Fixture / action | Expected result | Class | Proves |
|---|---|---|---|---|
| SC-T01 | Empty directory (NEW), `vcp task demo` via `createTaskPack` | Creates `docs/tasks/demo.md`; `inspectProject` still reports `NEW`-family state (no `.vcp`); tree diff is exactly one added file | I/L | E1, INV-3 |
| SC-T02 | Non-empty plain project: `AGENTS.md` + `package.json`, no `.vcp` (EXISTING), `vcp task demo` | Creates; commands in the pack match `AGENTS.md` declarations; no other file changed (hash comparison) | I/L | E1, INV-3, T10 |
| SC-T03 | EXISTING project with `docs/` already present (empty) | Creates `docs/tasks/demo.md`; existing `docs/` untouched (identity + mtime unchanged) | I/L | E7, T6 |
| SC-T04 | EXISTING project with `docs/tasks/` already present (other tasks inside) | Creates alongside; sibling files byte-identical; sibling identities unchanged | I/L | E7, T4 |
| SC-T05 | `vcp task demo --dry-run` on an eligible project | No file created; output is the dry-run report; project byte-identical | I/L | §2.6, dry-run unchanged |

### 1.2 Refusals — MANAGED, BLOCKED, state markers

| ID | Fixture / action | Expected result | Class | Proves |
|---|---|---|---|---|
| SC-T06 | Seeded legacy-v1 fixture (`.vcp/manifest.json`, MANAGED) | Refuses: scoped reason, then `E_G_FENCE_NO_GO`; zero bytes written; tree unchanged | I/L | E1, T1, fence preserved |
| SC-T07 | `.vcp/` present with only `backups/` (no manifest) | Refuses (`MANIFEST_MISSING` family → gate); nothing written | I/L | E1/E2, T7 |
| SC-T08 | `.vcp/` present, empty | Refuses (manifest missing); nothing written | I/L | E2, T7 |
| SC-T09 | `.vcp` is a regular file / a symlink | Refuses (`STATE_NOT_DIRECTORY`); nothing written | I/L | E2, T2/T7 |
| SC-T10 | `.vcp/manifest.json` is a symlink / oversized / invalid JSON / schema 99 / failing field validation (one case each, parameterized) | Refuses (`BLOCKED` reason per case → gate); nothing written | I/L | T8, inspector strictness |
| SC-T11 | `.vcp/update.lock` present (stale, dead PID) alongside a valid manifest | Refuses (`ACTIVE_OR_STALE_LOCK` → gate) | I/L | E1, T7 |
| SC-T12 | `.vcp/transaction.json` present, uncommitted (recovery needed) | Refuses (`MANAGED_RECOVERY_REQUIRED` → gate) | I/L | E1, T7 |
| SC-T13 | `.vcp-adoption-retired-*` entry at root | Refuses (`RETIRED_ADOPTION_EVIDENCE_PRESENT` → gate) | I/L | E1, T7 |
| SC-T14 | Root-level `update.lock` / `transaction.json` stray files, no `.vcp` | Refuses (`E_SCOPED_RECOVERY_STATE_PRESENT` → gate) | I/L | E4, T7 |
| SC-T15 | `.vcp/` created between classification and creation (fault-injection harness: classify, plant `.vcp`, then invoke the write operation) | Refuses (E2 re-validation); nothing written | A/L | §2.3 phase 3, T1/T7 |
| SC-T16 | Manifest deleted mid-inspection (fault injection) | Refuses (`BLOCKED`); nothing written | A/L | T8, inspector re-checks |

### 1.3 Symlinks and namespace swaps

| ID | Fixture / action | Expected result | Class | Proves |
|---|---|---|---|---|
| SC-T17 | Selected root is a symlink | Refuses (`ROOT_LINK_REFUSED` → gate) | I/L | E5, T2 |
| SC-T18 | An ancestor of the root is a symlink | Refuses (`ROOT_LINK`); nothing written | I/L | E5, T2 |
| SC-T19 | `docs/` is a symlink (to inside and to outside the root, two cases) | Refuses (`E_SCOPED_PARENT_UNSAFE` / `LINK_REFUSED`); link target untouched | I/L | E7, T2 |
| SC-T20 | `docs/tasks/` is a symlink | Refuses; target untouched | I/L | E7, T2 |
| SC-T21 | Destination pre-planted as a symlink to `AGENTS.md` | Refuses (`O_NOFOLLOW` / `DESTINATION_EXISTS`); `AGENTS.md` byte-identical | A/L | T2/T5 |
| SC-T22 | Root directory swapped (rename-swap) between classify and create (fault injection) | Refuses (`E_SCOPED_NAMESPACE_CHANGED`); nothing written to either tree | A/L | §2.3 pins, T3 |
| SC-T23 | `docs/` swapped between re-validation and open (fault injection: rename in a raced helper) | Detected at post-sync check at the latest; file left for inspection, error reported, no silent success | A/L | T3/R-1 (detection, honest limit) |
| SC-T24 | Parent identity changed after directory sync (fault injection) | Refuses/reports; file left for inspection, never silently removed | A/L | T3, §2.5 |

### 1.4 Duplicates, concurrency, parents

| ID | Fixture / action | Expected result | Class | Proves |
|---|---|---|---|---|
| SC-T25 | 50 paired concurrent creations, same slug | Exactly one winner per pair; loser `E_SCOPED_ALREADY_EXISTS`; winner file complete and parseable; zero truncations across all pairs | A/L | T4, `O_EXCL` mechanism |
| SC-T26 | Concurrent creations, different slugs, `docs/` absent | Both succeed; parents created once; no `E_EXCLUSIVE_PARENT_RACE` escape (handled internally) | A/L | T4, parent loop |
| SC-T27 | Sequential duplicate creation (same slug twice) | Second refuses `E_SCOPED_ALREADY_EXISTS`; first file byte-identical | I/L | INV-5, T5 |
| SC-T28 | Existing destination is a directory / a symlink / a read-only file | Refuses in all three cases; existing object untouched (hash/identity) | I/L | INV-5, T5 |
| SC-T29 | `--force` with existing destination | Overwrite path (preimage-checked), unchanged behavior; `--force` with absent destination in an ineligible project still refuses via the gate | I/L | §2.6, force cannot bypass eligibility |
| SC-T30 | Parent creation fails at `docs/` (permission-denied fixture, root-owned parent) | Refuses; no partial parent left unreported; ledger cleanup verified (or leftover reported) | A/L | T6, §2.5 |
| SC-T31 | Parent creation fails at `docs/tasks/` (file named `docs/tasks` blocks the directory) | Refuses (`PARENT_NOT_DIRECTORY` family); no file created | I/L | E7, T6 |
| SC-T32 | Concurrent process fills a ledger directory during cleanup (fault injection) | Cleanup leaves the non-empty directory, reports it; original error preserved | A/L | T6, §2.5 |
| SC-T33 | Failure after file creation (directory-sync failure injection) | File left in place; error reported with path; next creation refuses `ALREADY_EXISTS` | A/L | §2.4/§2.5, no evidence destruction |

### 1.5 Crash / partial-write handling

| ID | Fixture / action | Expected result | Class | Proves |
|---|---|---|---|---|
| SC-T34 | Crash simulated mid-write (fault-injected write failure after partial bytes) | Partial file exists; re-creation refuses `ALREADY_EXISTS`; manual-removal recovery documented and exercised (remove → create succeeds) | A/L | §2.4 honest crash semantics, R-4 |
| SC-T35 | Crash simulated after close, before directory sync | File exists; behavior as SC-T33 (reported, left in place) | A/L | §2.4 |

### 1.6 Path traversal and untrusted input

| ID | Fixture / action | Expected result | Class | Proves |
|---|---|---|---|---|
| SC-T36 | Slug battery: `../x`, `a/b`, `a\\b`, absolute path, `CON`, `a.`, `a `, NUL, empty, uppercase, overlong | Every invalid slug refuses before any filesystem mutation; valid kebab-case slugs create | U/I/L | T9, `validateSlug` + `resolveProjectPath` |
| SC-T37 | Title containing separators / `../` / absolute path | Title affects content only; created path is still exactly `docs/tasks/<slug>.md` | I/L | T9 |
| SC-T38 | Case-variant components (`.VCP`, `Docs`, `.Git`) on a case-sensitive FS | `.VCP` first component refused for `write-new`; traversal rules apply as coded | I/L | T9 |
| SC-T39 | Hostile `AGENTS.md` declaring destructive commands (`rm -rf …`, exfiltration) | Pack is created with the commands as text; a marker proves no command executed during creation | A/L | T10, non-execution |
| SC-T40 | Hostile capability evidence (fake stack, fake paths) | Rendered as labeled evidence text only; no file created outside `docs/tasks/`; no path from evidence is opened for writing | A/L | T10 |

### 1.7 State purity and fence preservation

| ID | Fixture / action | Expected result | Class | Proves |
|---|---|---|---|---|
| SC-T41 | After a successful scoped creation: full tree diff + `inspectProject` re-run | Exactly one added file; classification unchanged; no `.vcp`, no lock, no manifest, no `AGENTS.md` modification, no git change | I/L | INV-3, INV-10, T11 |
| SC-T42 | Full existing refusal suite: all 42 F1 tests + gate tests + `E_G_FENCE_NO_GO` assertion files | **Zero outcome changes** — every test refuses exactly as at baseline (verified by set-wise failure comparison; the scoped fixtures are MANAGED, see Design §1.9) | I/L | Fence preserved; §3 gate |
| SC-T43 | Command-authority boundary probe re-run (Phase 1 probe: exact match / one-char difference / undeclared / TYPECHECK trap) | Identical results (13/13 pattern); authority code untouched | I/L | INV-7 |
| SC-T44 | D-03 no-follow suite + symlink refusal tests | All pass unchanged; no `safe-path` behavior change | I/L | INV-7, T2 |
| SC-T45 | Import-graph check: scoped module's transitive imports | Contains no `safe-create`, lifecycle-lock, production-writer, migration, or recovery module | U | INV-2 |
| SC-T46 | Diff check: `lib/safe-create.mjs`, `lib/managed-migration.mjs`, `lib/command-authority.mjs`, `lib/safe-path.mjs`, `lib/adoption-inspect.mjs` | Byte-identical to baseline (hash comparison in the acceptance run) | U | INV-1 |

### 1.8 Cross-platform (Windows-native — gated, UNPROVEN until a Windows campaign)

| ID | Fixture / action | Expected result | Class | Proves |
|---|---|---|---|---|
| SC-T47 | Scoped creation on native Windows/NTFS (principal provider present) | Refuses via durability preflight until Windows proof exists; if a future decision activates Windows, the full T1–T41 battery re-runs natively | W | §3, T12 |
| SC-T48 | Windows junction fixtures (directory junction as `docs/`, reparse point as destination) + directory-sync proof | Refusal (or, post-proof, correct behavior) demonstrated natively; no Linux analogy cited | W | T2/T12 |
| SC-T49 | Windows concurrent-creation + namespace-swap harness on NTFS | Same serialization/detection properties proven natively, or the Windows scope stays closed | W | T4/T3 on NTFS |

## 2. Contract summary (for reviewers)

The implementation contract, in one place:

1. One new module, one call site, no changes to any gated,
   authority, path, inspection, lock, writer, migration, or
   recovery file (SC-T45/SC-T46 enforce this mechanically).
2. Predicate E1–E10 (Design §2.2), re-validated inside the
   write operation (Design §2.3). No caller-level check
   substitutes.
3. Exclusive creation via direct `O_EXCL` (+ `O_NOFOLLOW`,
   fixed mode, fsync, directory sync) with the honest crash
   semantics of Design §2.4.
4. Parent loop + ledger cleanup per Design §2.5; never
   recursive removal; never remove pre-existing entries.
5. Error families: scoped refusals (`E_SCOPED_*`) distinct
   from `E_G_FENCE_NO_GO`; fall-through-to-gate ordering on
   ineligibility; refusal messages name the scoped reason and
   the standing fence state.
6. Linux-only v1 via the existing durability preflight;
   Windows refuses until native proof (SC-T47–SC-T49).
7. No new CLI surface; `--force` cannot bypass eligibility;
   `--dry-run` unchanged.

## 3. Independent acceptance gates

All gates must pass before activation. "Activation" means the
scoped path is reachable in a built artifact; mere merging of
the implementation (itself requiring owner approval) does not
activate anything without the decision record (Decision
Proposal §4).

- **G1 — Diff review.** The implementation diff contains only
  the new module, the single call-site hunk, tests, the
  decision record, and doc updates. SC-T46 hashes match.
- **G2 — Full suite.** `npm test` on Linux: the failing set is
  the baseline 49-set minus zero (no F1 change) plus zero new
  failures from the scoped tests themselves (all SC-T01–SC-T46
  pass). Syntax + Stage 12/13/14 contracts pass.
- **G3 — Adversarial validation.** An independent validator
  (not the implementer) re-runs SC-T15/T16/T22–T26/T32–T35
  with fresh fixtures and a namespace-swap/concurrent harness,
  and confirms the T1–T12 invariants hold. The validator's
  report is evidence, not a rubber stamp: any predicate bypass
  found is a BLOCKER (see rollback criteria).
- **G4 — Old-CLI artifact check.** SC-T41 passes: post-creation
  tree diff is exactly one file; classification unchanged.
- **G5 — Decision record.** `docs/decisions/SC-01.json` (draft
  in the Decision Proposal) is recorded with owner approval,
  and D-01.json is byte-identical (DEFERRED unchanged).
- **G6 — Documentation.** Conformance matrix regenerated
  (NEG-02 note retired), CLI docs describe the eligible scope
  and the Linux-only + no-coexistence statements.

## 4. Rollback criteria (stop conditions)

Implementation or activation stops — and any merged-but-
unactivated code is reverted — if any of the following occurs:

- **R-STOP-1:** any test or probe demonstrates a predicate
  bypass (a MANAGED/BLOCKED/recovery-pending project accepts
  a scoped creation, or a symlink is followed for writing).
- **R-STOP-2:** any existing refusal test changes outcome
  (SC-T42 fails), for any reason.
- **R-STOP-3:** the implementation touches a gated, authority,
  path, inspection, lock, writer, migration, or recovery file
  (SC-T46 fails).
- **R-STOP-4:** a Windows divergence is found and the response
  is to widen the platform allow-list without native proof.
- **R-STOP-5:** the decision record is amended to imply D-01
  GO, or the scoped ruling's language is broadened beyond the
  exact operation/predicate/platform in the approved draft.
- **R-STOP-6:** the owner withdraws or does not grant approval
  (the design then remains a design; no code is kept "just in
  case" on a shared branch without a new decision).

Rollback itself is a revert of the implementation commit(s);
because the scoped operation creates no managed state, there is
no data migration to undo and no project state to repair —
Task Pack files created during any evaluation window remain
plain Markdown files.

— End of acceptance matrix —
