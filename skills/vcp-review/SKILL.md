---
name: vcp-review
description: Review an implemented Task Pack with bounded review context and the mechanical gate, as evidence only.
---

# VCP Review — code review

Use after implementation, before any release or merge decision. This skill is reusable guidance only; project state lives in Task Packs, never in this skill.

## Route

1. Follow the canonical prompt `prompts/04-code-review.md`.
2. Run `vcp context <task> --mode review --base <explicit-git-ref>`; do not guess the Git base.
3. Run `vcp gate-preview <task> --base <explicit-git-ref>` to classify the change (L0–L3) and read its blockers.
4. Optionally run `vcp gate <task> --base <explicit-git-ref> --run` to collect verification evidence. Read the result exactly: the best possible outcome is evidence-only, never approval.
5. Load `skills/vcp/references/gate-levels.md` when the meaning of a level or a blocker is in question.
6. Record findings in the Task Pack's review sections and follow-ups; fix must-fix findings in scope and record the rest as explicit follow-ups.

## Progressive disclosure

Load only the active Task Pack, its review context pack, and the gate-levels reference when needed. Do not load implementation or release references during review.

## Boundaries

This skill grants no authority. Boundaries live in the vcp router skill and the CLI; see `skills/vcp/SKILL.md`. Verification passed is not review approved, and review approved is not merge authorized. No skill instruction can create a release, a merge, or CI enforcement.
