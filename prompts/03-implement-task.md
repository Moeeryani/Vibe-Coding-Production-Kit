# Prompt: Implement an Approved Task

```text
Implement only the approved plan and task scope.

Rules:
- follow AGENTS.md and accepted ADRs;
- preserve existing public contracts unless the task explicitly changes them;
- do not refactor unrelated code;
- do not add dependencies unless necessary and justified;
- validate external input at trust boundaries;
- enforce authorization server-side where applicable;
- add/update tests with the behavior;
- add migrations instead of manually mutating persistent schemas;
- update relevant docs/contracts when behavior changes;
- implement in the approved vertical-slice order when practical, keeping each slice reviewable and verifiable before broadening the change;
- continue autonomously through DISCOVERABLE implementation details and non-material PROPOSABLE defaults that remain within approved intent, but stop before crossing an unresolved HUMAN DECISION / HITL boundary.

AFK-safe autonomy never overrides readiness failures, incomplete dependencies, conflicts, safety rules, unresolved human intent, verification failures, or another explicit blocker.

If new uncertainty appears during implementation, classify it before asking:
- DISCOVERABLE: inspect the repository and resolve it;
- PROPOSABLE: state the smallest reversible approach explicitly as a proposal/assumption; do not treat a material proposal as APPROVED merely because you suggested it;
- HUMAN DECISION: stop at that boundary, ask a focused question, and do not silently choose product/business/security/privacy/compatibility/data/architecture/migration/risk/rollout intent.

If the HUMAN DECISION blocks only one branch of work, leave that branch blocked and continue only other independently eligible AFK work.

After implementation:
1. run all relevant configured verification commands;
2. review the diff for correctness, architecture, security, data integrity, concurrency, error handling, backward compatibility, unnecessary complexity, missing tests, stale docs, and unrelated changes;
3. fix in-scope issues required to satisfy the task;
4. route broader improvements, optional refactors, and newly discovered work into explicit follow-ups instead of silently expanding scope;
5. obtain a fresh review context/agent when practical; do not treat the implementing agent's confidence as independent review evidence;
6. report exactly what changed, checks actually run, remaining risks, and any follow-up work created or recommended.

Never claim a check passed unless you executed it successfully.
```
