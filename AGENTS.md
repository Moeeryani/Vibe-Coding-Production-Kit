# AGENTS.md

This file defines repository-wide operating rules for AI coding agents. Project-specific rules should override generic guidance only when explicitly documented.

## 1. Read before changing code

Before implementing a task, read:

1. this file;
2. the relevant product requirement and acceptance criteria;
3. affected architecture/domain/data documents;
4. relevant ADRs;
5. existing code and tests in the affected area.

Do not modify files during the planning phase unless the user explicitly requests implementation immediately.

## 2. Planning contract

Before implementation, provide a concise plan containing:

- requirement restatement;
- assumptions that materially affect implementation;
- affected modules/files;
- proposed approach;
- data/API/migration impact;
- security and privacy impact;
- edge cases and failure modes;
- tests to add or update;
- architecture conflicts, if any.

Before asking the developer a question, classify the uncertainty:

- **DISCOVERABLE** — resolve it from repository evidence, existing contracts, tests, or documentation;
- **PROPOSABLE** — propose the smallest reversible engineering default, state it explicitly as a proposal/assumption, and proceed only when doing so does not cross a material human-decision boundary;
- **HUMAN DECISION** — ask when the answer changes intended product behavior, security posture, compatibility policy, data ownership, rollout risk, architecture direction, destructive migration policy, risk acceptance, or another decision that cannot be inferred safely.

Group genuinely blocking human questions instead of interrupting for every minor uncertainty. Explain what decision is blocked and why repository evidence is insufficient.

When a task spans multiple boundaries, plan the smallest coherent **vertical slices** that produce testable end-to-end behavior. Prefer slices that cross the necessary domain/data/API/UI boundaries for one capability over broad phases such as “build all data code, then all service code, then all UI.” Each slice should have explicit acceptance evidence and verification.

Classify execution dependencies as either:

- **autonomous / AFK-safe** — the agent can proceed from approved scope and repository evidence without further human intent;
- **HITL required** — work must stop before crossing an unresolved human-decision boundary.

If autonomous work can proceed safely while another dependency awaits human input, keep those dependencies explicit rather than treating the entire task as blocked. AFK-safe autonomy never overrides readiness failures, conflicts, safety rules, verification failures, or another explicit blocker.

If the requested change violates an ADR, architecture boundary, security rule, or acceptance criterion, surface the conflict instead of silently working around it.

## 3. Scope discipline

- Implement only the requested task.
- Do not mix feature work with unrelated refactors.
- Do not rename/reformat unrelated files.
- Do not add a dependency unless it is necessary and justified.
- Prefer the smallest coherent diff that fully satisfies acceptance criteria.
- If a safe implementation requires a broader change, explain why and isolate it when practical.
- Fix review findings in the current task when they are required for acceptance criteria, correctness, security, compatibility, data integrity, or the agreed Definition of Done.
- Record broader improvements, optional refactors, and newly discovered work as explicit follow-ups instead of silently expanding the current task.

## 4. Architecture

Adapt these rules to the project's architecture document:

- Keep business rules out of transport/UI/framework glue.
- Respect module boundaries and dependency direction.
- Access another module through its public contract, not its internals.
- Avoid circular dependencies.
- Prefer explicit domain types for meaningful concepts over raw strings/numbers.
- Important architectural decisions require an ADR.
- New abstractions require demonstrated value; avoid speculative generalization.

## 5. Data and migrations

- All persistent schema changes require versioned migrations.
- Never edit an already-released migration to change production history.
- Consider forward/backward compatibility for rolling deployments.
- Identify data backfills separately from schema changes when risk warrants it.
- Document rollback or recovery strategy for destructive or high-risk changes.
- Preserve invariants at appropriate layers; do not rely solely on UI validation.

## 6. APIs and integrations

- Validate untrusted input at trust boundaries.
- Keep API contracts explicit and versioned when appropriate.
- Do not make silent breaking changes.
- Use idempotency for retryable write operations when the domain requires it.
- Define timeouts, retries, and failure handling for external calls.
- Never expose internal errors, stack traces, secrets, or sensitive implementation details to clients.

## 7. Security

- Authentication and authorization are distinct; implement both where required.
- Authorization must be enforced server-side and be resource/action specific.
- Never log secrets, credentials, session tokens, private keys, or passwords.
- Minimize PII collection and logging.
- Use secure secret storage; never commit real secrets.
- Treat file uploads, URLs, templates, queries, redirects, and serialized data as untrusted input.
- Consider injection, XSS, CSRF, SSRF, broken access control, tenant isolation, rate limiting, replay, and abuse where relevant.
- Security-sensitive changes require explicit negative-path tests.

## 8. Error handling

- Do not silently swallow failures.
- Prefer typed/structured errors where the language supports them.
- Separate user-facing errors from diagnostic details.
- Make retryability explicit where useful.
- Preserve causal context when wrapping errors.

## 9. Observability

For important production flows, consider:

- structured logs;
- correlation/request identifiers;
- metrics;
- traces;
- domain/audit events;
- actionable alerts.

Observability must not leak secrets or unnecessary PII.

## 10. Testing

Choose tests by risk and contract, not by coverage percentage alone.

Expected layers may include:

- unit tests for isolated business rules;
- integration tests for databases/queues/external adapters;
- contract tests for service/API boundaries;
- E2E tests for critical user journeys;
- regression tests for fixed defects.

Tests should verify behavior, include meaningful negative paths, and avoid coupling to irrelevant implementation details.

## 11. Required verification commands

Replace placeholders below with the real project commands before relying on this file:

```text
INSTALL_COMMAND=<define>
FORMAT_CHECK_COMMAND=<define>
LINT_COMMAND=<define>
TYPECHECK_COMMAND=<define or n/a>
UNIT_TEST_COMMAND=<define>
INTEGRATION_TEST_COMMAND=<define>
BUILD_COMMAND=<define>
E2E_COMMAND=<define or n/a>
```

Before declaring a task complete, run every relevant configured command. Never claim a command passed if it was not executed successfully.

## 12. Self-review before handoff

Review the final diff for:

- correctness against acceptance criteria;
- architecture violations;
- authorization/security issues;
- data integrity and migration hazards;
- race conditions/concurrency problems;
- missing validation/error handling;
- duplicated or dead code;
- unnecessary complexity;
- backward compatibility;
- missing tests;
- stale docs;
- accidental unrelated changes.

After implementation self-review, obtain a **fresh review context or independent reviewer when practical**. The fresh reviewer should reconstruct intent from the task, Source of Truth, acceptance criteria, and diff rather than assuming the implementation author's summary is correct.

Classify each review finding by what it is:

- `BLOCKER` — acceptance cannot safely proceed until resolved;
- `DEFECT` — concrete incorrect behavior or contract violation;
- `RISK` — credible residual hazard or uncertainty requiring explicit handling;
- `FOLLOW-UP` — useful work outside the bounded acceptance need;
- `NO ACTION` — reviewed concern does not require a change.

Then assign current-task disposition separately:

- **must fix now** — required for acceptance criteria, correctness, security, compatibility, data integrity, or Definition of Done;
- **follow-up candidate** — valuable broader work that is not required for this bounded task.

Do not turn every review suggestion into implicit scope expansion.

## 13. Definition of Done

A task is not done until relevant items in `docs/delivery/DEFINITION-OF-DONE.md` are satisfied.

At minimum:

- acceptance criteria are satisfied;
- tests are added/updated and pass;
- required validation passes;
- security impact is addressed;
- documentation/contracts are updated;
- no unrelated changes are included.

## 14. Communication

When reporting completion, include:

1. what changed;
2. why;
3. tests/verification actually run;
4. migrations or operational impact;
5. remaining risks/known limitations;
6. follow-up work created or recommended.

Never hide uncertainty. Never report inferred success as verified success.

## 15. VCP agent-first workflow

The developer should make product and engineering decisions; the coding agent should do the repository inspection, drafting, bookkeeping, and VCP command execution that can be derived safely from evidence.

### When setting up VCP

- Inspect the repository before asking the developer to fill templates.
- Discover stack, package scripts, module structure, tests, existing contracts, and documented decisions from repository evidence.
- Draft project-specific product, architecture, security, testing, and agent guidance from that evidence.
- Distinguish clearly between **discovered facts**, **agent-proposed decisions**, and **human decisions required**.
- Ask the developer only for choices that require product intent, risk tolerance, policy, or an architectural decision that cannot be established safely from evidence.
- Record approved decisions in the appropriate Source of Truth file rather than leaving them only in chat.
- Run `vcp doctor .` after onboarding and resolve avoidable warnings before feature work.

### When the developer requests a feature or change

- Create or update one bounded VCP task instead of asking the developer to manually fill the task template.
- Draft the outcome, acceptance criteria, scope, affected boundaries, invariants, security/privacy considerations, failure modes, observability, test plan, rollout/recovery, and an implementation plan from available evidence.
- Classify open questions as **DISCOVERABLE**, **PROPOSABLE**, or **HUMAN DECISION** before interrupting the developer. A PROPOSABLE item may become `PROPOSED`; it does not become `APPROVED` merely because the agent suggested it.
- Run `vcp ready <task> --stage plan`; resolve what can be resolved from the repository and ask the developer only for remaining human-intent decisions.
- Build the planning context with `vcp context <task> --mode plan` and produce a bounded plan before code changes.
- Structure non-trivial plans as the smallest coherent vertical slices, each with acceptance evidence, tests, and explicit autonomous/HITL dependencies.
- After plan approval, run `vcp ready <task> --stage implement` and do not implement while blocking findings remain.
- Build implementation context with only the affected paths needed by the approved plan: use `--include` for files that already exist and `--planned` for approved greenfield paths that do not exist yet.
- Implement only the approved scope, proceeding autonomously through AFK-safe work and stopping before unresolved HITL boundaries.
- Preview `vcp verify <task>` before execution, then run verification with explicit `--run` and retain evidence when useful.
- Build review context and perform an independent fresh review before claiming completion.
- Fix must-fix review findings in scope; record non-blocking broader improvements as explicit follow-up work rather than silently extending the task.

### Human decision boundary

Do not ask the developer to manually write information the agent can reliably discover or draft. Ask for human input when the answer changes intended product behavior, security posture, compatibility policy, data ownership, rollout risk, architecture direction, destructive migration policy, risk acceptance, or another decision that cannot be inferred safely.

If repository evidence conflicts, surface the conflict and ask for a decision instead of silently choosing one.
