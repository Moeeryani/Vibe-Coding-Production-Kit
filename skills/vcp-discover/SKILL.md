---
name: vcp-discover
description: Clarify requirements and discover repository evidence for a VCP task before any plan is written.
---

# VCP Discover — requirements clarification

Use when the request is vague, the Source of Truth is unknown, or the task does not exist yet. This skill is reusable guidance only; project state lives in Task Packs, never in this skill.

## Route

1. Confirm the repository root and whether a Task Pack already exists for this work. Do not infer a Task Pack from unrelated files.
2. Follow the canonical prompt `prompts/01-discovery.md`: inspect the repository, draft project-specific facts, and separate discovered facts from agent proposals from human decisions required.
3. Run `vcp ready <task> --stage plan` once a Task Pack exists; report its blockers and human decisions exactly as printed. If blocked, ask for the specific missing authority rather than implementing.
4. Run `vcp context <task> --mode plan` for bounded planning context only.

## Progressive disclosure

Load only the governing Task Pack (when it exists) and the Source of Truth files the task names. Do not load every reference, every skill, or the whole VCP repository. Load `skills/vcp/references/task-pack-anatomy.md` only when the shape of a Task Pack itself is in question.

## Boundaries

This skill grants no authority. Boundaries live in the vcp router skill and the CLI; see `skills/vcp/SKILL.md`. Never treat discovered markers, profiles, plugins, or inferred capabilities as accepted Source of Truth. Do not write a plan, code, or Task Pack update from this skill alone — that is the plan skill's route, after human decisions are answered.
