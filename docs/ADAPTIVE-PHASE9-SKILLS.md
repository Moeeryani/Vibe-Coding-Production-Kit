# Adaptive Phase 9 — Skills UX

**Status:** source built, not independently accepted. Skills are routing guidance, never authority.

## Installation and packaging

Skills ship inside the package: `package.json` `"files"` includes `"skills/"`, so installing the package installs every skill. There is no separate skill installer and no skill execution engine. Conformance is mechanical: `lib/skill-inventory.mjs` enumerates `skills/*/SKILL.md` and `test/skill-inventory.test.mjs` pins the rules below. A real pack dry-run listing is part of the Phase 7–10 completion evidence.

## Inventory

| Skill | Route (CLI + canonical prompt) |
|---|---|
| `skills/vcp/SKILL.md` (router, default entry point) | Full workflow route; specialized skills on demand |
| `skills/vcp-discover/SKILL.md` | `prompts/01-discovery.md`, `vcp ready --stage plan`, `vcp context --mode plan` |
| `skills/vcp-plan/SKILL.md` | `prompts/02-plan-task.md`, `vcp task`, `vcp ready --stage plan`, `vcp context --mode plan` |
| `skills/vcp-implement/SKILL.md` | `prompts/03-implement-task.md`, `vcp ready --stage implement`, `vcp context --mode implement`, `vcp verify [--run]` |
| `skills/vcp-review/SKILL.md` | `prompts/04-code-review.md`, `vcp context --mode review`, `vcp gate-preview`, `vcp gate --run` (evidence only) |
| `skills/vcp-security-review/SKILL.md` | `prompts/05-security-review.md`, `vcp context --mode security`, `vcp gate-preview`, `vcp gate --run` (evidence only; L3 refuses) |
| `skills/vcp-retro/SKILL.md` | Task Pack evidence, `vcp context --mode review` |
| `skills/vcp-release/SKILL.md` | `prompts/07-release-review.md`, `vcp context --mode release`, `vcp release-check`, `vcp gate-preview` |

Shared references (load only when the active skill names them): `skills/vcp/references/task-pack-anatomy.md`, `skills/vcp/references/gate-levels.md`.

## Design rules (pinned by tests)

- Thin: every skill ≤ 100 lines.
- No policy duplication: only the router states authorization boundaries; specialized skills reference the router and contain no `D-01` / `G-FENCE` literals.
- Real routes only: every `vcp <command>` in a skill must exist in the CLI; every `prompts/*.md` must exist; every reference must exist.
- Task Packs vs skills: every specialized skill states that project state lives in Task Packs, never in the skill.
- Progressive disclosure: the default experience needs no framework vocabulary ("build X", "review this change"); the router loads one specialized skill at most, plus its named references.
- Prompt-eval: the canonical suite grew from 4 to 6 scenarios with `security-review-boundaries` (05-security-review) and `release-decision-boundary` (07-release-review), each with a reference-pass record bound to the current suite blob SHA.

## Known limits

- Workflow mode is a session preview; the lifecycle manifest does not record it (unchanged from Phase 6).
- `vcp gate --run` evidence-only is the best gate outcome; no skill can turn it into approval, merge, release, or CI enforcement.
- Checkpoint D (complexity actually hidden for users who have not studied VCP) and Checkpoint E (model/tool capability audit) are separate manual/empirical acceptances, not covered by these fixtures.
