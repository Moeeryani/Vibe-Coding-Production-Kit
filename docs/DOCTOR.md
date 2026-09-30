# Doctor

`vcp doctor` is a read-only audit for repositories using the Vibe Coding Production Kit. It answers a different question from the initializer:

> Is the engineering system actually configured, or were the template files merely copied?

## Run it

From a published/local install:

```bash
vcp doctor .
```

From this GitHub repository:

```bash
npx --yes --package=github:Moeeryani/Vibe-Coding-Production-Kit vibe-coding-production doctor .
```

Machine-readable output:

```bash
vcp doctor . --json
```

Strict CI mode:

```bash
vcp doctor . --strict
```

Default mode exits non-zero only when a `FAIL` exists. `--strict` also exits non-zero when warnings remain.

## What it checks

The doctor currently inspects:

- target directory readability;
- deterministic repository stack detection;
- installed lifecycle stack profile and stack-selection provenance when a VCP manifest is available;
- repository-wide `AGENTS.md`;
- unresolved verification-command slots in `AGENTS.md`;
- presence of core product, architecture, security, testing, and delivery documents;
- known starter-template markers for Product Brief, PRD, Architecture, Threat Model, and Test Strategy;
- presence of Definition of Ready and Definition of Done;
- framework validation CI;
- local validation script;
- planning and independent-review prompts;
- VCP lifecycle state, manifest/version alignment, baseline integrity, and interrupted update transactions.

## Detected stack vs installed lifecycle profile

Doctor reports two different stack facts when lifecycle state is available:

- **Detected stack** — what the current repository evidence deterministically identifies now.
- **Installed profile** — the stack profile recorded in `.vcp/manifest.json` and currently owned by the lifecycle system.

These facts may legitimately differ.

For example, a legacy project may have an installed `generic` profile while current repository evidence detects `javascript`. Doctor must not imply that the stored profile is wrong or automatically mutable. The lifecycle provenance policy remains authoritative:

- `install.stack: generic` + `install.requestedStack: auto` + concrete current detection → re-profiling is eligible through the normal `vcp update` path;
- explicit `install.requestedStack: generic` → the generic profile is preserved even when current detection is concrete;
- missing `install.requestedStack` on a legacy generic install → historical intent is unknown, so re-profiling is intentionally withheld rather than inferred;
- already-concrete installed profiles are not automatically re-profiled by this generic-to-concrete rule.

Human-readable Doctor output therefore labels the detected stack, installed profile, requested selector, and re-profile state separately.

JSON output preserves the historical top-level `stack` field as the **detected** stack and adds `lifecycleStack` when a readable lifecycle manifest exists. `lifecycleStack` includes:

- `detectedStack`;
- `installedStack`;
- `requestedStack` (`null` when legacy provenance is unavailable);
- `reprofileEligible`;
- `reprofileTarget`;
- `reprofileState`;
- `reason`.

This reporting is informational and does not weaken conservative lifecycle provenance rules. Explicit-generic and unknown-provenance preservation are not Doctor warnings by themselves, so `doctor --strict` does not become red merely because VCP is correctly preserving lifecycle intent.

## Strict-mode coverage boundary

A green `vcp doctor . --strict` means **all checks currently defined by doctor are green**. It does not mean every VCP-installed document has been customized.

Doctor intentionally reports its starter-template coverage in both human-readable and JSON output. In v0.9.2:

- starter-template markers are checked for 5 core decision documents;
- Definition of Ready and Definition of Done are presence-only core checks;
- `docs/product/USER-FLOWS.md`, `docs/architecture/DOMAIN.md`, and `docs/architecture/DATA-MODEL.md` are not assessed for template completeness by doctor.

Those unassessed documents can be important for a specific project, but VCP does not make them universally mandatory because some projects legitimately have no meaningful data model, user flow, or separate domain document. Task readiness and human/agent review must decide when they are required by the work.

This coverage boundary prevents a strict-green report from being interpreted as a claim that every installed template is complete.

## Result semantics

### PASS

Evidence for the expected engineering control was found.

### WARN

The repository can continue, but a project-specific decision is still missing or a recommended control was not found. Examples include an untouched product brief, an unresolved test command, or missing CI scaffolding.

### FAIL

A foundational control is missing or unusable, such as an absent `AGENTS.md` or a missing core source-of-truth document.

## Important limitation

Doctor does **not** certify that a project is secure, correct, compliant, production-ready, or that every VCP-installed artifact has been customized. It validates visible engineering signals within its declared coverage. Human review, real tests, threat analysis, operational evidence, task-specific Source of Truth, and context-specific judgment remain necessary.

## Why there is no readiness score

A single percentage would hide important differences between projects and can create false confidence. Doctor reports concrete checks, coverage, and remediation instead, so teams can decide which warnings and unassessed artifacts matter for their context.
