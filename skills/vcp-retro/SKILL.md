---
name: vcp-retro
description: Run a retrospective over a completed Task Pack from its own recorded evidence and follow-ups.
---

# VCP Retrospective

Use after a Task Pack reaches review or completion, to learn from its own evidence rather than from memory. This skill is reusable guidance only; project state lives in Task Packs, never in this skill.

## Route

1. Re-read the Task Pack: outcome, acceptance criteria, implementation plan, verification evidence, review findings, and follow-ups. Do not reconstruct history from chat; the Task Pack is the record.
2. Run `vcp context <task> --mode review --base <explicit-git-ref>` when the change range itself is in question.
3. Answer, from evidence: what was predicted vs what happened, which readiness or gate blockers fired and whether each was a true positive, which follow-ups remain open, and what one process change the next Task Pack should carry.
4. Write the retrospective into the Task Pack's follow-ups or a linked note. Do not rewrite history: record corrections as corrections, and leave superseded claims visible.

## Progressive disclosure

Load only the completed Task Pack and its evidence. Do not load other tasks, other skills, or the whole repository to run a retrospective.

## Boundaries

This skill grants no authority. Boundaries live in the vcp router skill and the CLI; see `skills/vcp/SKILL.md`. A retrospective changes no code, no Task Pack status, and no gate outcome; it only records learning and follow-ups for a human to act on.
