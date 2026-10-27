# Gate levels (reference — load only when a level or blocker is in question)

Levels come from `vcp gate-preview` classification of the Git diff between an explicit base and head. The CLI and the gate contract own the policy; this reference only summarizes what the commands report.

## Levels

- **L0 — documentation-only candidate.** README/CHANGELOG/docs changes that are not governing docs, security docs, decisions, or architecture records. No task required; no verification executes.
- **L1 — project governing doc.** Changes under `docs/product|architecture|delivery|testing|tasks/`. A task is required; readiness is checked; no verification command executes.
- **L2 — material change.** Source, test, schema, and unknown file changes. A task is required; readiness must pass; configured verification commands execute through command-authority checks.
- **L3 — sensitive boundary.** Workflows, CI configs, package manifests, agent instructions, security/decision/plugin docs, and auth/security/crypto/native/release/gate/manifest/journal/lifecycle/rollback/recovery/safe-path/command-authority paths. Preview is always BLOCKED with `HIGH_RISK_INDEPENDENT_REVIEW_REQUIRED`; `vcp gate --run` refuses before executing anything.

## Conservative floors (policy, not errors)

Renames and copies floor at L2; deletions floor at L1; type changes and unmerged entries are L3. Unknown file types floor at L2. These floors are deliberate: path identity and unknown content are treated as material until proven otherwise.

## Outcomes (read exactly)

- `PREVIEW_READY` — inputs suffice for a reviewable plan only. Never a pass.
- `EVIDENCE_ONLY_NOT_APPROVED` — the best possible `vcp gate --run` outcome (exit code 2). Evidence was collected; nothing was approved.
- `BLOCKED` (exit code 1) — a stated blocker must be fixed and the gate rerun.
- Verification passed is not review approved; review approved is not merge authorized. CI enforcement, where it exists, comes from platform branch protection requiring the stable gate job — never from the gate output alone.
