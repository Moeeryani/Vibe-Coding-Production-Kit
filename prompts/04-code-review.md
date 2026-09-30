# Prompt: Independent Code Review

Use a fresh context/agent when practical. The reviewer should reconstruct intent from the task, Source of Truth, accepted decisions, acceptance criteria, actual diff, tests, and verification evidence rather than inheriting the implementation agent's confidence or summary as fact.

```text
Review this change as a senior engineer. Start from the task requirements and acceptance criteria, then inspect the actual changed area. Do not assume the implementation author's summary is correct.

Look for concrete problems in:
- functional correctness;
- missing acceptance criteria;
- architecture/module-boundary violations;
- authorization and trust-boundary validation;
- data integrity/migration risk;
- race conditions and idempotency;
- error handling/retry behavior;
- API/backward compatibility;
- performance/resource leaks where material;
- duplicated or unnecessary complexity;
- test quality and missing negative paths;
- observability gaps;
- stale or misleading documentation;
- accidental scope expansion or hidden follow-up work.

For every concern, first assign a finding class:
- BLOCKER — acceptance cannot safely proceed until resolved;
- DEFECT — concrete incorrect behavior or contract violation;
- RISK — credible residual hazard or uncertainty that requires explicit handling;
- FOLLOW-UP — valuable work outside the current bounded acceptance need;
- NO ACTION — reviewed concern does not require a change.

For actionable findings report:
- finding class;
- severity where applicable: critical / high / medium / low;
- file and line/area;
- concrete failure scenario or evidence;
- why it matters;
- recommended correction;
- current-task disposition: must fix in this task / follow-up candidate.

Finding class and current-task disposition are separate concepts. For example, a low-severity DEFECT may still be must-fix if it violates acceptance criteria, while a useful FOLLOW-UP should not silently expand the current task.

Use `must fix in this task` when the issue is required for acceptance criteria, correctness, security, compatibility, data integrity, or the agreed Definition of Done. Use `follow-up candidate` for broader improvements, optional refactors, or newly discovered work that is valuable but not required for this bounded task.

Before declaring review complete, persist concise material findings in the Task Pack's `## Independent review evidence` section when that section is available. For each material finding preserve:
- class;
- current-task disposition;
- concise finding/evidence;
- resolution or follow-up reference;
- residual risk where applicable.

Do not persist the full reviewer conversation. Do not duplicate requirements already governed by Source of Truth. Routine NO ACTION checks may be summarized instead of logged one by one. If an older explicit task file lacks the review-evidence section, add the same bounded evidence to its task/completion record rather than creating a separate review database.

A review is not restartable merely because a chat message says it completed. A fresh continuation agent must be able to reconstruct what was found, what was fixed, what became follow-up work, and what residual risks remain from repository/VCP evidence alone.

Do not give style-only feedback unless it affects readability, maintainability, correctness, or agreed conventions. If you find no blocking issue, state what you verified, any NO ACTION concerns you checked, and residual risks rather than merely saying “LGTM”.
```
