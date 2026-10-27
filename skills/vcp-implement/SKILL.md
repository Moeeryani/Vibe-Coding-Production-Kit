---
name: vcp-implement
description: Route an approved Task Pack through implementation readiness, bounded context, and verification.
---

# VCP Implement — implementation routing

Use after plan approval, when a Task Pack is ready to be built. This skill is reusable guidance only; project state lives in Task Packs, never in this skill.

## Route

1. Run `vcp ready <task> --stage implement`. Do not implement while blocking findings remain.
2. Run `vcp context <task> --mode implement`, including only the affected paths the approved plan needs (`--include` for existing files, `--planned` for approved greenfield paths).
3. Follow the canonical prompt `prompts/03-implement-task.md`. Implement only the approved scope, proceeding autonomously through AFK-safe work and stopping before unresolved human-decision boundaries.
4. Preview verification first: `vcp verify <task>`. Run it only with explicit `--run` when project command authority and required decisions allow it, and retain the evidence.
5. If scope changes, return to the plan skill; do not silently extend the Task Pack.

## Progressive disclosure

Load only the active Task Pack, its Source of Truth, and the implementation context pack. Do not load review or release references during implementation.

## Boundaries

This skill grants no authority. Boundaries live in the vcp router skill and the CLI; see `skills/vcp/SKILL.md`. Verification commands execute only through the CLI's command-authority checks; this skill cannot authorize a command, a migration, a publication, or a merge.
