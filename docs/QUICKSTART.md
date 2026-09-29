# Quickstart — from repository to verified AI task

Vibe Coding Production Kit is designed to be driven primarily by your AI coding agent, not by a developer manually filling every template or memorizing every CLI command.

The developer provides intent and approves decisions. The agent inspects the repository, drafts the engineering context, runs VCP gates, implements bounded work, and verifies the result.

## 1. Bootstrap the kit

From an existing repository:

```bash
npx vibe-coding-production init . --agent all --stack auto --yes
```

Preview first if you want to see every managed path before writing:

```bash
npx vibe-coding-production init . --agent all --stack auto --yes --dry-run
```

The initializer does not overwrite framework-managed files unless `--force` is explicitly supplied. Once lifecycle state exists in `.vcp/manifest.json`, use `vcp update` rather than re-running initialization with `--force`.

If you specifically want to run the current GitHub source instead of the published npm package, use:

```bash
npx --yes github:Moeeryani/Vibe-Coding-Production-Kit init . --agent all --stack auto --yes
```

## 2. Let the agent establish the source of truth

Do not start by manually filling every Markdown template. Ask your coding agent to set up VCP for the repository.

Example instruction:

```text
Set up VCP for this repository. Inspect the existing code, package scripts, tests,
architecture, and documentation. Draft the VCP source-of-truth files from repository
evidence. Distinguish discovered facts from proposed decisions, and ask me only for
decisions that require human product or engineering intent. Run VCP Doctor when done.
```

The agent should inspect the repository and draft the relevant files, including:

- `docs/product/PRODUCT-BRIEF.md`
- `docs/product/PRD.md`
- `docs/product/USER-FLOWS.md`
- `docs/architecture/DOMAIN.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/DATA-MODEL.md`
- `docs/security/THREAT-MODEL.md`
- `docs/testing/TEST-STRATEGY.md`
- `AGENTS.md`

Your job is to approve or correct decisions the repository cannot establish safely. The agent should not ask you to write information it can reliably discover or draft itself.

## 3. Start a bounded feature through the agent

Tell your agent what you want in normal product language. For example:

```text
Use VCP and add organization invitation acceptance. The invited verified user should
be able to accept one valid invitation exactly once.
```

The agent should create the task:

```bash
vcp task accept-invite --title "Accept organization invitation"
```

Then it should draft the task contract: outcome, Source of Truth, acceptance criteria, scope, affected boundaries, security/privacy decisions, failure modes, tests, rollout/recovery, and implementation plan.

Before interrupting you, the agent should classify each open question:

- **discoverable** — answer it from repository evidence;
- **proposal-safe** — choose a small reversible engineering default, record the assumption, and continue;
- **human decision required** — ask when the answer changes product behavior, security posture, compatibility policy, data ownership, rollout risk, or another decision the repository cannot establish safely.

The agent should group genuinely blocking human questions instead of asking one question at a time for minor uncertainties.

## 4. Gate planning readiness

The agent runs:

```bash
vcp ready accept-invite --stage plan
```

Blocking findings mean the task is not ready to plan. The agent should resolve findings from repository evidence where possible and ask you only for unresolved human decisions.

## 5. Build the planning context

The agent runs:

```bash
vcp context accept-invite --mode plan
```

The context pack includes repository rules, the task, the planning prompt, and Source of Truth references from the task. It does not dump the whole repository.

The agent produces a bounded implementation plan. For non-trivial work, prefer the smallest coherent **vertical slices**: one testable end-to-end capability at a time, crossing only the domain/data/API/UI boundaries needed for that capability. Avoid plans that first build an entire technical layer before any slice can be accepted or verified.

Each slice should state its acceptance evidence, tests, and dependencies. Dependencies should distinguish work the agent can complete autonomously from decisions that require human input.

You review important product or architectural decisions and approve or correct them.

## 6. Gate implementation readiness

After the plan is explicit, the agent runs:

```bash
vcp ready accept-invite --stage implement
```

The implementation gate is stricter than the planning gate. It also requires the task to contain an executable verification plan, so a task cannot be reported implementation-ready if `vcp verify` would be unable to run.

## 7. Build implementation context

The agent adds only context required by the approved plan. Existing files use `--include`; greenfield paths that do not exist yet use `--planned`:

```bash
vcp context accept-invite \
  --mode implement \
  --include src/invitations/repository.ts \
  --planned src/invitations/service.ts \
  --planned test/invitations/service.test.ts
```

`--include` stays strict so a typo is not silently treated as a future file. `--planned` is explicit, implement-mode only, and records the approved future path without inventing file contents.

The agent implements only the approved task scope. It may proceed through **AFK-safe** work that follows from approved scope and repository evidence, but it should stop before crossing a dependency explicitly classified as **HITL required**. A blocked human decision should not unnecessarily stop unrelated autonomous slices that can still be completed safely.

AFK-safe work never bypasses readiness failures, conflicts, safety rules, verification failures, or another explicit blocker.

## 8. Preview verification

Before executing repository-controlled commands, the agent runs:

```bash
vcp verify accept-invite
```

Preview is safe by default and does not execute commands.

## 9. Run verification and keep evidence

After the command list is known, the agent runs:

```bash
vcp verify accept-invite \
  --run \
  --output .vcp/evidence/accept-invite.json
```

Verification runs sequentially, stops after the first failure, and records mechanical evidence without persisting raw stdout/stderr by default.

## 10. Build independent review context

The agent runs:

```bash
vcp context accept-invite \
  --mode review \
  --include src/invitations/service.ts \
  --include test/invitations/service.test.ts
```

Prefer a fresh agent/context for review rather than relying only on the agent that wrote the change. The reviewer should reconstruct intent from the task, Source of Truth, acceptance criteria, and diff instead of assuming the implementation summary is correct.

Review findings should be classified before scope changes:

- **must fix now** — required for acceptance criteria, correctness, security, compatibility, data integrity, or Definition of Done;
- **follow-up candidate** — useful broader improvement, optional refactor, or newly discovered work that is not required for this bounded task.

Fix must-fix findings before completion. Record follow-up candidates explicitly rather than silently expanding the current task.

## 11. Audit the repository before merge/release

The agent runs:

```bash
vcp doctor .
```

Use `--strict` when warnings should block your team or CI policy. A strict-green report means doctor’s declared checks are green; it does not claim that every installed VCP template is customized. The report states its starter-template coverage explicitly.

## Human experience vs agent workflow

What the developer should experience:

```text
State intent
   ↓
Answer only unresolved human-decision questions
   ↓
Review the proposed vertical-slice plan
   ↓
Review the final result, evidence, and explicit follow-ups
```

What the coding agent should execute behind that experience:

```text
Inspect repository / draft Source of Truth
      ↓
vcp task <slug>
      ↓
Classify open questions: discoverable / proposal-safe / human decision required
      ↓
vcp ready <slug> --stage plan
      ↓
vcp context <slug> --mode plan
      ↓
Plan vertical slices + autonomous/HITL dependencies / human decision approval
      ↓
vcp ready <slug> --stage implement
      ↓
vcp context <slug> --mode implement [--include <existing files>] [--planned <new files>]
      ↓
Implement bounded slices; pause at unresolved HITL or any safety/verification blocker
      ↓
vcp verify <slug>
      ↓
vcp verify <slug> --run --output .vcp/evidence/<slug>.json
      ↓
vcp context <slug> --mode review --include <changed files/tests>
      ↓
Fresh review → must-fix findings / explicit follow-up candidates
      ↓
vcp doctor .
      ↓
Merge / release / observe
```

For a completed worked example, see [`../examples/reference-saas-invite/`](../examples/reference-saas-invite/).
