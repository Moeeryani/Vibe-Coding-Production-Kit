# B-1 Production Writer — Implementation Plan

Status: PLAN DRAFT — no code written, no gates changed.
D-01 = DEFERRED, G-FENCE = NO-GO, Production Writers = DISABLED.
Design input: `docs/design/B1-PRODUCTION-WRITER-DESIGN.md`,
`docs/design/B1-PRODUCTION-WRITER-TEST-PLAN.md`.

## 1. Implementation Map

Existing mutation paths, what they do now, what must change, and the risk
of each change.

| File | Current responsibility | Required change | Risk |
|-|-|-|-|
| `lib/init.mjs` (`initProject`) | Entry routing; throws on `--force`; calls `assertManagedMigrationGate()` before any write | None (already the writer facade for init). Keep as the single init entrypoint. | Low — behavior locked by `test/init-force-safety.test.mjs`. |
| `lib/greenfield-apply-v2.mjs` (`applyAdaptiveGreenfield`) | Candidate v2 transaction writer: lock → backup → journal (prepared→applying→verified→committed) → exclusive creates → manifest last → journal cleared; gate-first | Add per-phase identity re-verification + ancestor pinning (Phase 1); keep gate-first. This becomes the reference writer implementation. | Medium — touches the most complete writer; changes must not weaken the gate-first ordering. |
| `lib/stage13-apply.mjs` (`applyStage13SmartInit`) | Stage13 existing-repo adoption apply; 2 gate calls | Route all mutations through the shared writer core (Phase 2); deduplicate its transaction logic with greenfield-apply-v2. | Medium — adoption has distinct preconditions (EXISTING root); dedup must not lose them. |
| `lib/managed-schema-migrator.mjs` (`applyVersionedManagedSchemaMigration`, `replaceManifestAtomically`) | v1→v2 migration + atomic manifest replace; both gate-first | Keep gate-first; migrate `replaceManifestAtomically` to the shared temp+fsync+rename primitive (Phase 3). | Low — already gated; change is mechanical. |
| `lib/update-apply.mjs` (`applyUpdate`) | Legacy v1 update; uses `acquireUpdateLock`; **no gate call** | Route through writer facade: add gate check + identity verification before lock acquisition (Phase 2). v1 behavior must remain byte-identical when the gate is NO-GO (i.e., still refuse). | High — legacy path with the most callers/tests; 63 pre-existing failures live nearby. Change nothing observable until enablement. |
| `lib/update-apply.mjs` (`rollbackProject`) | Legacy v1 rollback; refuses schema-v2; **no gate call** | Add gate check (Phase 2); implement v2 rollback separately (Phase 4) — do NOT extend the legacy function to v2. | High — rollback is the most dangerous op; legacy semantics frozen. |
| `lib/manage.mjs` (`ignorePath`, `trackPath`) | Legacy v1 metadata ops via `withStateLock`; direct `writeManifest`; **no gate call** | Route manifest writes through the writer's journaled metadata path (Phase 2); keep `withStateLock` semantics. | Medium — metadata-only today, but direct `writeManifest` bypasses the journal. |
| `lib/versioned-journal.mjs` | Journal primitives: write/clear/hash-chain/transition asserts | None (foundation exists). Add crash-injection hooks for tests (Phase 5). | Low. |
| `lib/versioned-backup.mjs` | Backup creation (`createManagedSchemaBackup`, `createGreenfieldRecoveryBackup`) | None. Add hash-verified restore helper for v2 rollback (Phase 4). | Low. |
| `lib/lifecycle-lock-v2.mjs` | v2 lifecycle lock; durability preflight | Add owner UID/SID pinning + per-phase re-verification API (Phase 1). | Medium — lock semantics are security-critical. |
| `lib/safe-create.mjs` (`createOwnedPathExclusively`) | Exclusive file creation | None. Extend with temp+rename variant for updates (Phase 3). | Low. |
| `lib/file-durability.mjs` | Directory fsync; Windows fail-closed | None. Windows native implementation is Phase 5 evidence work, not a code change to rush. | Low (do not weaken). |
| `lib/managed-recovery-v2.mjs` | Recovery planning (read-only) | Add journal-replay executor (Phase 4); planner stays read-only. | Medium — replay must be idempotent. |
| `lib/d01-principal-boundary.mjs` | Principal/ACL assessment (read-only) | None. Consumed by authorization checks (Phase 1). | Low. |

Lifecycle boundaries: CLI (`lib/cli.mjs`) → `initProject`/operation entry →
gate → writer core → lock → journal → mutations → verify → commit.
Locks: legacy `acquireUpdateLock` (v1 paths) vs `acquireLifecycleLock`
(v2 paths) — Phase 2 unifies behind one writer-owned lock API.
State machines: journal phases (prepared→applying→verified→committed);
recovery replays from any prefix.

## 2. Writer Architecture Mapping

Design concept → existing code location (→ gap to implement):

- Identity pinning → `lib/lifecycle-lock-v2.mjs` (owner-identity comment),
  `lib/d01-principal-boundary.mjs` (assessment) → GAP: per-phase
  re-verification API not implemented.
- Atomic commit → `lib/greenfield-apply-v2.mjs` (journal phases +
  exclusive creates) → GAP: temp+fsync+rename for updates not unified.
- Manifest last → `lib/greenfield-apply-v2.mjs` (manifest after `verified`),
  `lib/managed-schema-migrator.mjs:44` (`replaceManifestAtomically`) →
  no gap in ordering; GAP: legacy `manage.mjs` writes manifest directly.
- Journal → `lib/versioned-journal.mjs` (write/clear/hash-chain) → no gap.
- Rollback → `lib/update-apply.mjs:228` (legacy v1 ONLY, refuses v2),
  `lib/versioned-backup.mjs` (backups) → GAP: no v2 rollback implementation.
- Exclusive create → `lib/safe-create.mjs` → no gap.
- Durability preflight → `lib/file-durability.mjs` → no gap (fail-closed).
- Gate → `lib/managed-migration.mjs` → no gap.
- Recovery plan (read-only) → `lib/managed-recovery-v2.mjs` → GAP:
  replay executor not implemented.

## 3. Implementation Phases

### Phase 1 — Foundation (identity, locks, no behavior change)

Files: `lib/lifecycle-lock-v2.mjs` (owner pinning + re-verify API),
`lib/greenfield-apply-v2.mjs` (call re-verify per phase),
`lib/d01-principal-boundary.mjs` (consumed, unchanged).
Tests: new `test/writer-identity.test.mjs` — wrong principal refused,
stale identity aborts, lock owner mismatch at each phase.
Dependencies: none (pure addition behind the gate).

### Phase 2 — Mutation routing (single writer facade)

Files: `lib/update-apply.mjs`, `lib/manage.mjs`, `lib/stage13-apply.mjs`
— route through the writer core; add gate checks to legacy paths;
unify on one writer-owned lock API.
Tests: existing suites must show zero behavior change while gate is NO-GO
(all refusals identical); new `test/writer-routing.test.mjs` proves every
mutation path hits the gate.
Dependencies: Phase 1.

### Phase 3 — Atomic commit (unified write primitive)

Files: `lib/safe-create.mjs` (temp+fsync+dir-fsync+rename+verify),
`lib/managed-schema-migrator.mjs` (use it), `lib/greenfield-apply-v2.mjs`
(use it).
Tests: `test/writer-atomic-commit.test.mjs` — torn-write impossible,
post-rename hash verified, directory-fsync failure aborts pre-mutation.
Dependencies: Phase 2.

### Phase 4 — Recovery (replay + v2 rollback)

Files: `lib/managed-recovery-v2.mjs` (replay executor, planner stays
read-only), `lib/versioned-backup.mjs` (hash-verified restore),
new v2 rollback operation (NOT in `update-apply.mjs`).
Tests: `test/writer-recovery.test.mjs` — replay from every journal prefix,
idempotent double-replay, v2 rollback byte-exact with user-edit listing.
Dependencies: Phase 3.

### Phase 5 — Enablement evidence (proofs, not features)

Files: test-only — crash-injection harness, concurrency harness,
Windows native helpers (`scripts/native/`), power-loss rig scripts.
Tests: the full Section 7 plan (security/reliability/concurrency/
recovery/durability). Platform matrix: Linux runs; Windows marked
UNVERIFIED until a host exists.
Dependencies: Phases 1–4. This phase produces evidence for the Section 6
enablement table; it does NOT flip the gate.

## 4. Test Implementation Plan

Map each future test to its phase and target:

Security:
- wrong principal → Phase 1 (`test/writer-identity.test.mjs`)
- stale identity → Phase 1
- token mismatch (Windows) → Phase 5 (needs host; specified, not run)

Reliability:
- crash per journal phase → Phase 5 (injection harness)
- partial write / torn rename → Phase 3 (`test/writer-atomic-commit.test.mjs`)
- recovery replay → Phase 4 (`test/writer-recovery.test.mjs`)

Concurrency:
- competing writers (lock exclusion) → Phase 2 (`test/writer-routing.test.mjs`)
- old/new race → Phase 5 (needs OS principal separation proof)
- stale lock handling → Phase 2

Durability:
- fsync proof per mutation → Phase 3 (Linux); Windows → Phase 5, fail-closed until proven
- failure behavior (ENOSPC, EPERM injection) → Phase 3/5

## 5. Risk Review

Architecture risks:
- Two lock systems (legacy `acquireUpdateLock` vs v2 `acquireLifecycleLock`)
  must unify without breaking 63-failure-adjacent legacy tests → mitigate
  by facade, not rewrite; legacy semantics frozen.
- Legacy v1 paths gain gate checks → risk of behavior drift in the 0.9.3-
  compatible surface → mitigate with byte-identical refusal tests.

Migration risks:
- v1→v2 migration (`applyVersionedManagedSchemaMigration`) is the first
  real writer workload → keep it behind the gate until Phase 5 evidence.

Compatibility risks:
- Published 0.9.3 binary is external and immutable → the writer cannot
  fence it; D-01 fence work is independent of B-1 implementation.

Release risks:
- The frozen gate constant must never become a config flag → code review
  rule: any diff touching `MANAGED_SCHEMA_MIGRATION_GATE` requires
  maintainer approval.
- Phase ordering is load-bearing: Phase 5 evidence before any enablement
  discussion; implementation order does not imply release order.
