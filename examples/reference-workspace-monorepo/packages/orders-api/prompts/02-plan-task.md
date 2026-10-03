# Prompt: Plan a Task Before Coding

```text
Read:
- AGENTS.md
- the task/issue
- relevant PRD acceptance criteria
- relevant architecture/domain/data/security documents
- applicable ADRs
- existing implementation and tests in the affected area

Do not modify code yet.

Before asking the developer a question, classify it:
- DISCOVERABLE: answer it from repository evidence;
- PROPOSABLE: state a small reversible/default engineering approach explicitly as a proposal/assumption; a material proposal is not APPROVED merely because the agent suggested it;
- HUMAN DECISION: ask only when the answer changes intended product behavior, security/privacy posture, compatibility policy, data ownership, architecture direction, destructive migration policy, risk acceptance, rollout, or another non-inferable decision.

Group genuinely blocking human questions instead of interrupting for every minor uncertainty. State the affected decision, what it blocks, and why repository evidence is insufficient.

Produce a bounded implementation plan containing:
1. requirement restatement;
2. discovered facts, proposed decisions/assumptions, approved decisions, and unresolved HUMAN DECISION items that affect the design;
3. affected modules/files and why;
4. proposed implementation slices, ordered as the smallest end-to-end user/domain-visible increments rather than broad technical layers;
5. for each slice, its acceptance evidence, tests, and dependencies;
6. API/data/migration impact;
7. security/privacy/authorization impact;
8. concurrency/idempotency/failure-mode concerns where relevant;
9. edge cases;
10. tests to add/update by layer;
11. verification commands to run;
12. architecture or requirement conflicts;
13. explicit out-of-scope / negative decisions;
14. execution dependencies classified as autonomous/AFK-safe or HITL required.

For each proposed slice, distinguish execution mode from readiness: AFK-safe does not mean the slice is currently executable. A slice remains blocked while dependencies, unresolved human intent, readiness failures, safety/conflict gates, or required verification prevent execution.

Prefer the smallest coherent change. Do not propose unrelated refactors. If an autonomous slice can proceed safely while another decision is blocked on human input, keep those dependencies explicit rather than treating the whole task as blocked.
```
