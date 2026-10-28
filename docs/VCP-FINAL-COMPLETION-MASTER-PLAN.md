# VCP — Final Completion Master Plan

**Plan ID:** VCP-FCP-2026-10-28  
**Plan status:** ACTIVE EXECUTION PLAN (documentation/tracking only; NOT an implementation or release authorization)  
**Tracker:** [GitHub Issue #109](https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/109)  
**Planning branch:** `planning/vcp-final-completion-20261028`  
**Last planning review:** 2026-10-28  
**Owner:** VCP maintainer (explicit decisions and acceptance)  
**Delivery approach:** complete bounded construction first → end-of-batch testing → independent validation → evidence-based acceptance → next dependency.  
**Applies to:** VCP CLI, Adaptive workflows, managed lifecycle/security, Linux/Windows, acceptance, and the next releasable candidate. This is NOT a commitment to ship every optional future feature.

> **Important source distinction:** At this plan's creation, GitHub `main` is `8ccb276545fdb3cc301ce7ce324812eb4c314586` (2026-10-06). The latest independently accepted *local* engineering candidate, reported by separate Linux build/validation agents, is `d4fb3ceec55113b56aa0cfa7e4885ac00d8a1e17`, tree `e7119fa2c778110d2475aaeb7ad7f2275d7a4bcd`. That commit was NOT found on the GitHub remote when this plan was created. **Do not claim the implementation exists on remote GitHub or merge this planning branch as though it contains that code.** P0 resolves this gap. Historical GitHub `docs/ROADMAP.md` represents the older released/main stage roadmap; this document is the controlling NEXT-EXECUTION plan for the new completion campaign.

## 1. What “finished VCP” means

VCP is a repository-native, deterministic engineering control plane for AI coding agents—not a generic skill bundle, LLM runtime, cloud scheduler, or multi-agent platform. A supported user should be able to install it, inspect/adopt a project, generate a task, pass plan/implementation readiness, use Manual/Assisted/Auto workflows, execute only authorized verification, independently review, recover safely, and complete a release gate with honest evidence.

**Definition of Done for full product/release scope:**

1. Supported platform(s) are explicitly declared. Install/first-run and a complete REAL user workflow work on an exact packaged artifact, without private seeders or manual repair.
2. Managed lifecycle writes are SAFE and authorized, or the product is explicitly scoped as a non-managed/evaluation edition **with a separately approved public release contract**. Do not silently rebrand a fenced preview as production-ready.
3. All critical/high security findings closed; no bypass of D-01, no unproved Windows parity, no invented L3 reviewer identity or CI enforcement.
4. Transaction/recovery/durability behavior matches the documented guarantee and has independent platform-specific proof. Any unsupported guarantee remains disclaimed; B-2 must not be called proven without a power-loss rig.
5. Security and negative tests are retained. Any changed failing test has a documented root cause, approved contract, and independent review; no “green by skipping.”
6. Checkpoints A–E have real evidence and owner decisions for the applicable product claim; unperformed checkpoint != PASS.
7. Exact candidate HEAD/tree, source-to-package identity, native Linux/Windows (as supported) evidence, changelog/docs, conformance matrix, install/update/rollback smoke, release check, and human GO/NO-GO are preserved.
8. Only AFTER explicit owner release authorization: immutable tag, npm publication, GitHub Release, registry install smoke. Never publish as a side effect of a passed test.

## 2. Verified engineering baseline — evidence, not percentages

| Surface | Last independently accepted status | Important boundary |
|---|---|---|
| Adaptive L0–L3 classification | Functional/independent tests accepted | Semantic file-content classification is NOT claimed; classifier uses path/extension/Git status |
| Workflow modes + resumable sessions | F-D5/F-D4a accepted at local `738a022` | Persisted gate claims re-execute; L3 authorization still disabled |
| Skills/CLI/context/readiness/gate | Core implementation exists, bounded validation passed | End-to-end first-run via ordinary CLI not yet accepted |
| Linux helper npm packaging/consumer | D1/D2 independently validated | No Windows helper/product parity implied |
| Release Readiness Phase 1 | Corrective acceptance at local `d4fb3ce` | Test-only fixes; NO production-code fix or release acceptance |
| SC-01 — scoped Task Pack create | Design committed locally `68a5da5`; owner conditionally approved LOCAL BUILD | Implementation/G1–G6/G3/parent-swap acceptance NOT yet reported; no activation |
| Full suite at `d4fb3ce` | 1,371: 1,306 PASS / 49 FAIL / 16 SKIP; 15 resolved, 0 new | 42 intentional MANAGED G-FENCE refusals, 1 F6 env, 6 other decision-bound; PH-06 intermittent outside the 49 |
| Product adoption checkpoints | A/B/D/E NOT PERFORMED; C PARTIAL (SIMPLIFY) | Protocols prepared, not results |
| Release readiness | FAIL / NO-GO | `vcp init` and managed lifecycle paths fenced; Windows and durability unproven |

**Identity chain (local reports, must be reconciled before remote development):**

`d16dcff` product completion → `0a374d5` D1–D5 closure → `738a022` F-D5/F-D4a closure → `14b36ef` → `d4fb3ce` Release Readiness Phase 1.  
SC-01 design: `68a5da5` on local `design/od1-scoped-task-pack-creation`, based on `d4fb3ce`. SC-01 implementation is a NEXT action, not proven complete.

**Inherited 49 failure families:** F1 managed fence 42; F3 ROOT_LINK 1; F4 D-06 anchor coverage 1; F5/F5b legacy doctor/rollback 3; F6 non-traversable TMPDIR 1; F7 B9-01b inconclusive 1. PH-06: separate intermittent lock-free journal create race, code-established; never count a passing run as a fix.

## 3. Execution sequence — single plan, explicit dependencies

Statuses are one of `NOT_STARTED`, `BUILDING`, `BUILT_UNVALIDATED`, `VALIDATING`, `ACCEPTED`, `BLOCKED`, `DEFERRED`. Historical accepted evidence is not a fresh current release gate.

| Phase | Title | Initial status | Dependency | Owner-facing result |
|---|---|---|---|---|
| **P0** | Source and evidence reconciliation | **BLOCKED: local code not on remote** | None | Exact SHA chain and evidence archived on approved candidate refs; no main merge |
| **P1** | SC-01 Linux scoped Task Pack creation | **BUILD AUTHORIZED / RESULT PENDING** | Local `d4fb3ce`, SC-01 conditional approval; P0 needed before GitHub PR | Real non-managed `vcp task` + independent G1–G6, with D-01 still closed |
| **P2** | Read-only product measurement B/E + C fixture | **READY IN PARALLEL** | Fixed candidate/corpus; no D-01 write GO | Measured adaptation accuracy, ablation decisions, C fixture re-measurement |
| **P3** | Owner decision and contract resolution | **NOT_STARTED** | Root-cause reports; P0; independent reviews | Decisions OD-2,3,4,6 and scoped activation vs full D-01/Windows/CI |
| **P4** | Old-CLI containment + managed lifecycle D-01 safety | **BLOCKED ON OWNER-APPROVED DESIGN** | P3, 0.9.3 hazard threat model, Linux/Windows proof plan | Safe init/update/migrate/recovery design and independently verified behavior; D-01 remains closed until separate GO |
| **P5** | Journal/recovery/transaction/durability | **BLOCKED ON DESIGN AND TEST RIG** | P3 PH-06/legacy decisions, P4 safety boundaries | PH-06 resolved by approved contract, legacy recovery defined, B-2 + full containment evaluated |
| **P6** | Native Windows/NTFS security acceptance | **BLOCKED ON NATIVE WINDOWS ENV/APPROVAL** | P3/P4/P5 as applicable | Principal provider, namespace/lock/durability, B9-01b and Windows parity proven natively |
| **P7** | Real-user product acceptance, review identity, CI | **PARTIALLY PREPARABLE** | P1/P2 then P4/P6 to cover full init lifecycle | A/C/D user trials + B/E decisions, L3/CI decision evidence |
| **P8** | Integrated release-candidate acceptance | **NOT_STARTED** | P1–P7 mandatory release scope closed | One exact-head candidate, final QA & independent GO/NO-GO report |
| **P9** | Human-approved publication | **BLOCKED/NO-GO** | P8 owner GO | Immutable tag, npm publish, GitHub Release, clean registry smoke |

### P0 — Reconcile source and preserve every accepted commit (IMMEDIATE, NON-OPTIONAL)

**Why:** The remote default branch is older than the accepted local engineering work; planning documentation must not be mistaken for code integration.

**Tasks:** obtain the actual local Git checkout; independently run `git rev-parse HEAD`, `git cat-file -t` for the exact reported SHAs, `git merge-base --is-ancestor`, tree hash and clean-state checks; inspect unpushed commits/branches and submitted Markdown reports; verify no branch was rebased or overwritten. Upload the accepted commit chain to NEW named remote candidate branches **only after explicit approval for a code push** and independently compare remote SHAs. Archive the 4 SC-01 documents and test reports as evidence (no forged approval records). Identify and preserve the source-of-truth docs delta between local code and old `main`.

**DONE:** Candidate SHA/tree exists on remote unchanged + evidence manifest + branch map + documented dependency graph. **No merge to main.** If local commits cannot be found, status stays BLOCKED and reconstruct only from authenticated source/evidence; never fabricate SHAs.

### P1 — SC-01 scoped creation: finish build, then independent G3

**Authorized now:** Local Linux-only engineering on a new branch starting exactly at `d4fb3ce`. SC-01 is an **approval to build and validate locally**, NOT approval to activate, publish or merge.

**Build contract:** caller-scoped `lib/scoped-task-create.mjs`; one `lib/task.mjs` create-branch call; only exclusive `docs/tasks/<slug>.md` for NEW/EXISTING projects with no `.vcp` or recovery/lock markers. Shared gated helper, safety/authority, lifecycle, writer, migration, and recovery modules byte-identical. Linux preflight. `O_EXCL`, no-follow, parent identity checks, rollback ledger, honest crash semantics; never fall through to a second write after mutation. No Windows scope.

**Acceptance:** SC-T01–SC-T46 Linux cases; Windows SC-T47–T49 UNPROVEN; 42 MANAGED F1 tests KEEP REFUSING; no new stable failure names; builder report + fresh independent G3 adversarial evidence + G1–G6 + exact residual parent-swap disposition and a **separate owner activation decision**. A failed predicate or parent-swap containment assertion is a STOP, not a prompt to change D-01. SC-01 alone does NOT resolve the 42 F1 failures and DOES NOT make 0.9.4 releasable.

### P2 — Real measurements that require no managed writes (PARALLEL WITH P1)

- **Checkpoint B:** 8–12 genuine disposable-copy projects across JS/TS, Python, Go, React Native, generic; blind ground-truth reviewer, precision/recall target >=90%; detection, command proposals, unknowns, context budgets; denominators + hashes; no copy mutation. User/owner approval of corpus and acceptance still required.
- **Checkpoint E:** independently perform recorded ablation/injected-failure experiments, compare failed-test catch rate with/without each removable surface. Do not disable a safety control in shared/production code. All keep/remove decisions evidence-backed; implementation of removal requires separate approval.
- **Checkpoint C fixture half:** rerun current classification/false-high/override refusal fixture measurements. NOT a substitute for real-user dogfood.
- **DONE:** raw log + ground truth + machine-checkable measurement sheets + independent report. No “Checkpoint PASS” from a single smoke demonstration.

### P3 — Close decisions in safe order (OWNER GATES)

| Decision | Initial recommendation for review (NOT approval) | Required proof/next action |
|---|---|---|
| **OD-1 / SC-01** | Local-build approval exists; activation is pending | G1–G6, independent G3, owner parent-swap residual acceptance; full D-01 GO is separate |
| **OD-2 / D-06** | Do not fabricate coverageReviews | Independently inspect all six D-02/D-03/D-04/D-05/D-06/D-12 anchor maps, then owner approve/reject with reason |
| **OD-3 / ROOT_LINK** | Preserve D-03 no-follow refusal by default | Document contract and update only old tests if formally approved; any exception needs threat model |
| **OD-4 / legacy recovery** | Preserve fail-closed now | Choose blocked-state/manual-recovery contract vs independently designed legacy-compatible validation |
| **OD-5 / B9-01b** | Remain INCONCLUSIVE | True production authorization path/native principal provider or formally reviewed test capability |
| **OD-6 / PH-06** | Do not rewrite journal without design | Choose atomic exclusive commit vs explicitly lock-required semantics; prove Linux + Windows equivalence or restrict supported guarantee |
| **OD-7 / 0.9.4 release** | NO-GO | Full release evidence, no auto tag/publish |
| **OD-8 / mandatory CI** | DISABLED | Checkpoint C GO, accepted review identity, observed branch protection and explicit owner enablement |

**Decision persistence:** The maintainer records each accepted decision in the existing repo decision schema. Proposed text, passing tests, and agent recommendations are NEVER owner approval.

### P4 — D-01 and the real managed end-to-end path (CRITICAL PATH)

A narrowly scoped SC-01 is NOT the real managed `init` solution. Build a security argument for old published CLI 0.9.3 hazards: incompatible rollback/downgrade, post-backup user-edit erasure, stale-backup precedence, lock recovery and `init --force` mutations. Define the safe old/new migration/coexistence or credible fail-closed prevention strategy, with explicit no-data-loss criteria, adversarial swaps/partial journals, multiple-versions and cross-platform preconditions. Use independent exact-head evidence. Stage designs and tests without enabling the fence. **D-01=DEFERRED and G-FENCE=NO-GO until all specified reopen conditions are proven and owner grants separate GO.**

**DONE:** authorized managed lifecycle works on the declared supported platform and has independent safety proof, or this phase remains BLOCKED. Do not mark “works” based on fixture seeders.

### P5 — Finish correctness and durability instead of chasing counts

- **PH-06:** document the existing lock-free check-then-act creation race; apply the explicitly selected owner contract, test no double success, replay and crash windows on relevant platforms.
- **Legacy Recovery (F5/F5b):** fulfill OD-4 with safe blocked-state behavior or proven compatible recovery; verify no overwriting user edits.
- **B-2:** run an independent power-cut/power-loss rig before calling power-loss durability proven.
- **Full transaction containment:** finish proof of root/parent/file identity and journal/backup chain across failed operations; disallow speculative “production writer ready.”
- **F6 environment:** use a traversable dedicated disposable TMPDIR for unprivileged child tests or a verified EACCES probe-and-skip; no global chmod or privilege downgrade.
- **D-06/ROOT_LINK/B9-01b:** do not mask required refusals as tests passing.

### P6 — Native Windows security lane (parallel after approved designs)

Dedicated Windows tester with native NTFS, MSVC, controlled principal identities. Prove native principal provider, namespace and lock semantics, signed provenance/evidence as required, rollback/durability, Windows-equivalent journal semantics, B9-01b layer-attribution under legitimate authorizations. No Linux result is Windows proof; no fake provider or test-only authorization for production. Windows feature claim stays BLOCKED if native proof cannot be produced. Do not widen SC-01 Linux-only scope by analogy.

### P7 — Full user and CI acceptance

**A:** adoption plan/apply/re-plan/rollback/first productive feature on 3–5 independent users across brownfield+greenfield, byte-identical rollback and instruction/CI preservation. Managed writes require an approved path; do not substitute hand-written fixture seeds as live adoption.  
**B/E:** adopt independent evidence from P2, with scope/owner decisions.  
**C:** 2–4 developers × >=5 tasks each, actual L0–L3 routing, interruption/false-positive/override metrics, L1 bar and L3 reviewer identity decision; mandatory CI remains disabled until explicitly approved.  
**D:** 3–5 unfamiliar users, task-cycle / stale evidence / command authority recovery, blocker comprehension and terminology count; no contrived “easy” score.  
**Review/CI:** distinguish L3 evidence-only from approval; independently verified reviewer identity required before any live L3 authorization. Branch protection evidence before mandatory CI.  
**DONE:** measurement sheets + mechanical artifacts + independent evaluation + owner checkpoint decisions.

### P8 — Unified integration and release gate

Require **one** feature-complete exact-head branch, not disparate green branches. Verify entire ancestry; ensure all required approved fixes are present together. Native packaging (from fresh archive), installed CLI and helper trust, cross-platform installation if advertised, first-run lifecycle smoke, task/ready/context/verify/review/doctor/update/rollback smoke on disposable real projects. Full suite and security negative/adversarial tests; no unknown regressions, all deferred decisions either closed or explicitly excluded by an approved product-scope decision. Confirm conformance matrix including obsolete NEG-02 note, docs, README, changelog, license/version, human release-check (no actual publish). Produce final independent GO/NO-GO.

### P9 — Publication (SEPARATE EXPLICIT HUMAN DECISION)

ONLY after P8 GO and a new owner approval tied to exact HEAD/tree and exact version: create immutable tag; publish to npm; create GitHub Release; verify registry identity and install/upgrade/rollback from registry; record rollback/support plan. Do not move old `v0.9.3` tags or silently override released artifacts. If gates remain closed, public 0.9.4 stays NO-GO.

## 4. Working method & branch policy (mandatory)

1. **One accepted integration base.** Each next ticket branches from the most recent independently accepted source commit/branch. Never base code work on `planning/*` (documents only) or an unverified agent branch. While GitHub code push is pending, local `d4fb3ce` remains a reported local baseline, not remote truth.
2. **One ticket = one owned implementation branch; sequential dependency.** Implementation completes and is frozen locally; tests at the end of the bounded build; independent validator uses a fresh clone and verifies exact HEAD/tree. Next dependent ticket starts from the latest accepted **integrated** candidate, not parallel divergent heads. Parallelism only for truly independent read-only studies (B/E) or native Windows validation with explicit interfaces.
3. **No subagents.** Linux builder and separate test agent work in distinct controlled environments. No Docker or GitHub Actions in these campaigns; Windows proof needs a native Windows machine.
4. **No hidden writes.** Do not push code, merge, create PR for code, publish, activate, or alter security decision records without explicit owner scope. This plan/issue are documentation-tracking work only.
5. **Approval gates:** `DESIGNED → OWNER_AUTHORIZED_BUILD → BUILDING → BUILT_UNVALIDATED → INDEPENDENT_VALIDATION → OWNER_ACCEPTED_SCOPE`; security activation and release are different owner decisions. A builder “PASS” is not independent acceptance.
6. **Reproducibility:** log full SHA/tree, exact toolchain, clean status, command/exit, named test failures (not just counts), hashes of evidence, affected files, and documented environment anomalies. Keep historical artifacts and failed probes, don't silently discard.
7. **Stop rules:** any managed predicate bypass, security invariant regression, data-loss evidence, unproven cross-platform claim, or hidden test suppression stops activation and requires owner review. No “patch and ship.”
8. **Review the plan on every handoff:** record latest phase status and evidence URL in Issue #109 and the plan; don't claim deferred tasks finished. After a phase is independently accepted, select the next unblocked dependency, issue a single master prompt, and continue.

### Suggested branch convention

- `planning/vcp-final-completion-20261028`: tracking docs only (this plan).
- `feat/sc01-scoped-task-pack-creation`: SC-01 local builder branch from `d4fb3ce`, not yet observed/accepted.
- `integration/vcp-completion-candidate`: proposed future integration branch ONLY when authorized, based on accepted code SHAs (not `main` by assumption).
- `feat/vcp-<ticket-id>-<short-name>`, `fix/vcp-<ticket-id>-<short-name>`, `validation/vcp-<phase>-<date>`: future branches.
- Each branch remains separate until evidence permits integration; never rebase a frozen accepted SHA.

## 5. Acceptance evidence template (every ticket)

```markdown
### Ticket <ID> — <title>
Status: NOT_STARTED / BUILDING / BUILT_UNVALIDATED / VALIDATING / ACCEPTED / BLOCKED / DEFERRED
Base commit/tree:
New commit/tree:
Local/remote (specify):
Scope + changed files:
Owner decision(s) required / status:
Implemented capability / negative cases:
Focused tests:
Full suite (PASS/FAIL/SKIP + normalized failing-name SHA256):
Independent validator + exact-head result:
Security restrictions unchanged:
Residual risks + OPEN decisions:
Evidence paths / hashes:
Next dependency / NO-GO conditions:
```

## 6. Initial next action (do not get distracted)

**NOW: P0 branch reconciliation**, while the already authorized Linux builder completes **P1 SC-01 locally**. Do not wait for checkpoint/user-recruitment work before the source chain is preserved. The next decision-bearing handoff is the SC-01 builder's HEAD/tree/test report; only then commission independent G3. P2 read-only corpus preparation may occur in parallel without any new production code changes.

**Update cadence:** each independently validated completion, discovered blocker, or owner decision immediately updates Issue #109. A no-change week does not justify falsely checking boxes.

## 7. Source and limits

This master plan synthesizes the independently validated reports supplied by the owner in the 2026-10-28 planning discussion:

- VCP-SESSION-INTEGRITY-INDEPENDENT-ACCEPTANCE.md
- VCP-RELEASE-READINESS-BASELINE-REPORT.md
- VCP-INHERITED-FAILURE-ROOT-CAUSE-MATRIX.md
- VCP-ACCEPTANCE-CHECKPOINT-PROTOCOLS.md
- VCP-RELEASE-READINESS-PHASE1-INDEPENDENT-VALIDATION.md
- VCP-OD1-SCOPED-TASK-CREATION-DESIGN.md
- VCP-OD1-THREAT-MODEL.md
- VCP-OD1-SECURITY-ACCEPTANCE-MATRIX.md
- VCP-OD1-OWNER-DECISION-PROPOSAL.md

These files were supplied in conversation and may not yet be present on the remote repository. P0 must reconcile and archive them before using remote document paths as proof.

**Unchanged security states:** D-01 DEFERRED; G-FENCE NO-GO; B-2 NOT_PROVEN; full transaction containment NOT_PROVEN; Windows principal provider null; production writers DISABLED; L3 live authorization DISABLED; mandatory CI enforcement DISABLED. None is reopened by writing this document.
