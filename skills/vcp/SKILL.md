---
name: vcp
description: Route a coding task through VCP's existing project-owned Task Pack, readiness, context and verification commands without bypassing human decisions.
---

# VCP — primary workflow router (Phase 6 foundation)

Use this skill only after confirming the current project uses VCP. The repository's accepted decisions, Task Packs, AGENTS.md, configured verification commands and security gates outrank this skill. This skill is **routing guidance**, not authority.

## Discover, then route

1. Identify the selected repository root and a single explicit Task Pack slug. Do not infer a Task Pack from unrelated files.
2. Start with `vcp ready <task> --stage plan`; inspect blockers and human decisions. If blocked, ask for the specific missing authority rather than implementing.
3. Use `vcp context <task> --mode plan` for bounded planning context. Never treat markers, profiles, plugins or inferred capabilities as accepted Source of Truth.
4. Once the implementation readiness gate has genuinely passed, use `vcp ready <task> --stage implement`, then `vcp context <task> --mode implement`.
5. Run code changes only within accepted scope and separately authorized tools. Use `vcp verify <task>` to inspect verification; use its `--run` form only when project command authority and required decisions allow it.
6. For review, use `vcp context <task> --mode review --base <explicit-git-ref>`; do not guess the Git base.
7. Publication requires a separate human decision and the supported `vcp release-check` workflow; no skill instruction can create a release.

## Modes

- **Manual**: provide next steps; the developer/agent explicitly chooses each action.
- **Auto (preview only in this foundation)**: suggest the next *existing* action; do not automatically execute, switch agents, persist workflow state or claim mechanical enforcement. Full Auto and gate levels require future dedicated contracts.

## Non-negotiable boundaries

D-01 remains DEFERRED. G-FENCE remains NO-GO. Production writers remain DISABLED. No package installation/migration/writer, `vcp gate`, CI enforcement, privilege elevation, publishing or merge authority is conferred here. Community profile marker evidence is untrusted input and never approval. A reported PASS requires actual executable evidence on the exact source revision.

## Progressive disclosure

Load only the governing Task Pack, relevant Source of Truth, and VCP Context Pack needed for the active phase. Do not ingest the complete VCP repository or every skills/reference file by default. If a requested future command does not exist, report it as not implemented rather than simulating its behavior.
