# Task Pack anatomy (reference — load only when the shape of a Task Pack is in question)

A Task Pack is the project-specific durable change state for one bounded change. It is not a skill: skills supply reusable workflow guidance, Task Packs hold the actual decisions, evidence, and follow-ups for one change.

## Where it lives

`docs/tasks/<slug>.md`, created by `vcp task <slug>`. The slug is lowercase letters, digits, and single hyphens.

## Sections (in order)

Outcome; Source of truth (a table of references, not prose claims); Acceptance criteria; Scope (in scope / out of scope); Affected boundaries (modules/files, contract, data/schema, integration); Domain invariants; Security and privacy (authentication, authorization, tenant isolation, trust boundaries, secrets/PII, abuse/replay, threat IDs); Failure modes and edge cases; Observability; Test plan (unit, integration/contract, E2E/regression, negative/security); Rollout, migration, and recovery; Implementation plan; Verification commands.

## Lifecycle markers

- `Status: Review` (or Draft / Done) near the top — the gate reads exactly one status line.
- `HUMAN DECISION` mentions mark decisions only a human may make; they are never inferred from a proposal.
- Verification commands name configured AGENTS.md commands; the CLI's command-authority checks decide whether a command may execute. A Task Pack listing a command does not authorize it.

## What a Task Pack is not

It is not approval, not a release record, and not a merge authorization. Readiness (`vcp ready --stage plan|implement`), context (`vcp context --mode ...`), verification (`vcp verify`), and the gate (`vcp gate-preview`, `vcp gate --run`) each read the Task Pack and report their own verdicts.
