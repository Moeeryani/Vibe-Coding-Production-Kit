---
name: vcp-security-review
description: Security-review an implemented Task Pack with the bounded security context and the mechanical gate.
---

# VCP Security Review

Use when a change touches trust boundaries, authentication, authorization, secrets, data handling, or any sensitive path. This skill is reusable guidance only; project state lives in Task Packs, never in this skill.

## Route

1. Follow the canonical prompt `prompts/05-security-review.md`.
2. Run `vcp context <task> --mode security --base <explicit-git-ref>`; do not guess the Git base.
3. Run `vcp gate-preview <task> --base <explicit-git-ref>` and check whether the change classifies at L3 (sensitive boundary). Load `skills/vcp/references/gate-levels.md` when the meaning of a level or a blocker is in question.
4. Optionally run `vcp gate <task> --base <explicit-git-ref> --run` to collect verification evidence. An L3 change is refused before verification executes; that refusal is the correct outcome, not a failure to work around.
5. Record security findings, negative paths, and follow-ups in the Task Pack. Do not downgrade a level, edit classification inputs, or re-run with a weaker base to obtain a better-looking result.

## Progressive disclosure

Load only the active Task Pack, its security context pack, and the gate-levels reference when needed. Do not load implementation or release references during security review.

## Boundaries

This skill grants no authority. Boundaries live in the vcp router skill and the CLI; see `skills/vcp/SKILL.md`. A security review records findings; it does not approve, authorize, or enforce anything, and it cannot open a production writer, a gate bypass, or a merge.
