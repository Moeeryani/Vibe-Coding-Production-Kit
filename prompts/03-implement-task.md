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
- continue autonomously through discoverable and proposal-safe details, but stop before crossing a dependency explicitly classified as requiring human input (HITL).

AFK-safe autonomy never overrides readiness failures, conflicts, safety rules, verification failures, or another explicit blocker.

If new uncertainty appears during implementation, classify it before asking:
- discoverable: inspect the repository and resolve it;
- proposal-safe: choose the smallest reversible approach, record the assumption, and continue;
- human decision required: stop at that boundary, ask a focused question, and do not silently choose product/security/compatibility/risk intent.

After implementation:
1. run all relevant configured verification commands;
2. review the diff for correctness, architecture, security, data integrity, concurrency, error handling, backward compatibility, unnecessary complexity, missing tests, stale docs, and unrelated changes;
3. fix in-scope issues required to satisfy the task;
4. route broader improvements, optional refactors, and newly discovered work into explicit follow-ups instead of silently expanding scope;
5. obtain a fresh review context/agent when practical; do not treat the implementing agent's confidence as independent review evidence;
6. report exactly what changed, checks actually run, remaining risks, and any follow-up work created or recommended.

Never claim a check passed unless you executed it successfully.
```
