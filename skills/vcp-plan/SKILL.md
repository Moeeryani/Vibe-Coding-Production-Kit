---
name: vcp-plan
description: Turn clarified requirements into one bounded VCP Task Pack with a vertical plan and explicit human decisions.
---

# VCP Plan — task planning

Use when requirements are clarified and a bounded change needs a Task Pack and an implementation plan. This skill is reusable guidance only; project state lives in Task Packs, never in this skill.

## Route

1. Create or update exactly one bounded Task Pack: `vcp task <slug> [--title <text>]`.
2. Follow the canonical prompt `prompts/02-plan-task.md`: outcome, acceptance criteria, scope boundaries, affected boundaries, invariants, security and privacy, failure modes, observability, test plan, rollout and recovery, and a bounded implementation plan.
3. Run `vcp ready <task> --stage plan`; resolve what repository evidence can resolve and ask the developer only for remaining human-intent decisions.
4. Run `vcp context <task> --mode plan` for bounded planning context. Structure the plan as the smallest coherent vertical slices, each with acceptance evidence.
5. Do not start implementation while plan-stage blockers remain.

## Progressive disclosure

Load only the active Task Pack, its Source of Truth, and the context pack for the plan phase. Do not load implementation or review references yet. Load `skills/vcp/references/task-pack-anatomy.md` only when the shape of a Task Pack itself is in question.

## Boundaries

This skill grants no authority. Boundaries live in the vcp router skill and the CLI; see `skills/vcp/SKILL.md`. A proposal is not approval: nothing in a plan becomes accepted merely because this skill drafted it. Task Packs hold project-specific durable change state; this skill supplies reusable workflow guidance and must never be mistaken for a Task Pack.
