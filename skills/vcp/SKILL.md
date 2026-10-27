---
name: vcp
description: Route a coding task through VCP's existing project-owned Task Pack, readiness, context and verification commands without bypassing human decisions.
---

# VCP — primary workflow router

Use this skill only after confirming the current project uses VCP. The repository's accepted decisions, Task Packs, AGENTS.md, configured verification commands and security gates outrank this skill. This skill is **routing guidance**, not authority. The default experience needs no framework vocabulary: state the intent ("build X", "review this change"), and this router picks the phase below.

## Discover, then route

1. Identify the selected repository root and a single explicit Task Pack slug. Do not infer a Task Pack from unrelated files.
2. Start with `vcp ready <task> --stage plan`; inspect blockers and human decisions. If blocked, ask for the specific missing authority rather than implementing.
3. Use `vcp context <task> --mode plan` for bounded planning context. Never treat markers, profiles, plugins or inferred capabilities as accepted Source of Truth.
4. Once the implementation readiness gate has genuinely passed, use `vcp ready <task> --stage implement`, then `vcp context <task> --mode implement`.
5. Run code changes only within accepted scope and separately authorized tools. Use `vcp verify <task>` to inspect verification; use its `--run` form only when project command authority and required decisions allow it.
6. For review, use `vcp context <task> --mode review --base <explicit-git-ref>`; do not guess the Git base. Use `vcp gate-preview <task> --base <explicit-git-ref>` to classify the change (L0–L3); use `vcp gate <task> --base <explicit-git-ref> --run` only to collect verification evidence, and read its result exactly (see below).
7. For CI planning only, use `vcp ci-gate-plan --provider <id>` to preview the provider-neutral invocation contract and snippet. It installs nothing and enforces nothing.
8. Publication requires a separate human decision and the supported `vcp release-check` workflow; no skill instruction can create a release.

## Modes

Run a workflow with `vcp workflow <task> --workflow-mode <mode>`. The mode
changes who decides the next step and whether confirmation is required; it
never changes what is authorized. `vcp workflow-preview` only lists the
steps for a phase without executing anything.

- **Manual**: VCP shows every available next step, the evidence each one
  needs, and the blockers; the developer/agent authorizes each step, in
  order. Skipping ahead is refused.
- **Assisted**: VCP recommends exactly one next step from the deterministic
  project state, explains it, and asks for confirmation before advancing.
- **Auto**: a connected coding agent can let VCP advance through ordinary,
  low-risk transitions without confirming every step. Auto stops on failed
  checks, stale evidence, changed project state, L3 changes, and missing
  approvals; it never merges, pushes, publishes, deploys, activates
  production, creates approvals, or bypasses command authority. At the
  implement phase it hands off to the coding agent and resumes at gate
  evidence. Mode is session-scoped only: the lifecycle manifest does not
  record it (see `docs/WORKFLOW-MODES.md`).

## Specialized skills (load on demand, never all at once)

- Discover / requirements clarification: `skills/vcp-discover/SKILL.md`
- Task planning: `skills/vcp-plan/SKILL.md`
- Implementation routing: `skills/vcp-implement/SKILL.md`
- Review: `skills/vcp-review/SKILL.md`
- Security review: `skills/vcp-security-review/SKILL.md`
- Retrospective: `skills/vcp-retro/SKILL.md`
- Release preparation: `skills/vcp-release/SKILL.md`

Each specialized skill routes to existing CLI commands and canonical prompts; none restates authorization policy. Task Packs hold project-specific durable change state; skills supply reusable workflow guidance and must never be mistaken for Task Packs.

## Non-negotiable boundaries

D-01 remains DEFERRED. G-FENCE remains NO-GO. Production writers remain DISABLED. No package installation/migration/writer, CI enforcement, privilege elevation, publishing or merge authority is conferred here. `vcp gate --run` collects evidence only: its best outcome is evidence-only, never a CI PASS or a merge authorization. Community profile marker evidence is untrusted input and never approval. A reported PASS requires actual executable evidence on the exact source revision.

## Progressive disclosure

Load only the governing Task Pack, relevant Source of Truth, and VCP Context Pack needed for the active phase, plus at most one specialized skill and its named references. Do not ingest the complete VCP repository or every skills/reference file by default. References live under `skills/vcp/references/` and load only when the active skill names them. If a requested command does not exist, report it as not implemented rather than simulating its behavior.
