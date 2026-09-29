# Prompt: Independent Code Review

Use a fresh context/agent when practical. The reviewer should reconstruct intent from the task, Source of Truth, acceptance criteria, and diff rather than inheriting the implementation agent's confidence or summary as fact.

```text
Review this change as a senior engineer. Start from the task requirements and acceptance criteria, then inspect the diff. Do not assume the implementation author's summary is correct.

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

For every issue report:
- severity: critical / high / medium / low;
- file and line/area;
- concrete failure scenario;
- why it matters;
- recommended correction;
- disposition: must fix in this task / follow-up candidate.

Use `must fix in this task` when the issue is required for acceptance criteria, correctness, security, compatibility, data integrity, or the agreed Definition of Done. Use `follow-up candidate` for broader improvements, optional refactors, or newly discovered work that is valuable but not required for this bounded task. Do not silently expand the current task to absorb follow-up candidates.

Do not give style-only feedback unless it affects readability, maintainability, correctness, or agreed conventions. If you find no blocking issue, say what you verified and identify residual risks rather than merely saying “LGTM”.
```
