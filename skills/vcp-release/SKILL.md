---
name: vcp-release
description: Prepare a release from a reviewed Task Pack through the release-check workflow, as a separate human decision.
---

# VCP Release Preparation

Use when a reviewed change is proposed for release. Publication requires a separate human decision; this skill never makes it. This skill is reusable guidance only; project state lives in Task Packs, never in this skill.

## Route

1. Follow the canonical prompt `prompts/07-release-review.md`.
2. Run `vcp context <task> --mode release` for release context.
3. Run `vcp release-check <version> [--policy <path>]` to inspect release readiness; run its `--run` form only when explicitly authorized.
4. Run `vcp gate-preview <task> --base <explicit-git-ref>` as a final classification check. A gate evidence-only result is not release authorization.
5. Confirm all review findings are fixed or recorded as explicit follow-ups, and that the release decision itself is recorded by a human — not inferred from a check result.

## Progressive disclosure

Load only the active Task Pack, its release context pack, and the release policy when one is named. Do not load implementation references during release preparation.

## Boundaries

This skill grants no authority. Boundaries live in the vcp router skill and the CLI; see `skills/vcp/SKILL.md`. No check result, skill instruction, or gate outcome can create a release, a tag, a publication, or a merge. CI enforcement, where it exists at all, comes from platform branch protection, never from this skill.
