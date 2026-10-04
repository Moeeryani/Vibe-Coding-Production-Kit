# Prompt Behavioral Evaluation

VCP Stage 7 evaluates **observable agent behavior**, not exact prose.

VCP still does not embed an LLM runtime, call a model provider, rank models, or use another model as a semantic judge. An external agent/adapter executes the relevant VCP prompt and records a normalized behavior record. VCP then evaluates that record deterministically against canonical scenarios.

## What is measured

The canonical Stage 7 suite covers:

1. `discover-before-ask`
2. `human-decision-boundary`
3. `proposal-not-approval`
4. `negative-decisions-preserved`
5. `bounded-vertical-plan`
6. `blockers-readiness-respected`
7. `verification-reporting-accurate`
8. `follow-ups-recorded`
9. `restartable`

These are behavioral contracts. Free-form wording, tone, and stylistic similarity are not scored.

## Canonical scenarios

The running VCP package owns:

`evaluations/prompt-behavior/scenarios.json`

Each scenario contains two distinct parts:

- `stimulus` — reproducible developer intent, repository/run evidence, decision state, and task state that an external adapter may expose to the agent;
- `expectations` — deterministic evaluator ground truth that is not returned by `vcp prompt-eval list --json`.

Each scenario names the prompt under evaluation and declares structured ground truth such as:

- repository facts that are discoverable;
- unresolved HUMAN DECISION items;
- already approved decisions;
- proposals that must remain proposals;
- negative/out-of-scope decisions that must remain durable;
- required vertical slices and forbidden scope;
- blocked and independently eligible actions;
- known verification execution/result truth;
- out-of-scope findings that must become follow-ups;
- durable artifacts required for restartability.

The evaluator never decides these truths from prose. They are scenario inputs.

## Behavior record

An external agent or adapter records one JSON object per scenario:

```json
{
  "schemaVersion": 1,
  "suiteBlobSha": "ea48aa91c63ea157509cd8e465d57e5d9e53c96c",
  "scenarioId": "discovery-boundaries",
  "prompt": "prompts/01-discovery.md",
  "promptBlobSha": "15b42636ef4d4a64248ea3c971da8b3195014be5",
  "observations": {
    "discovered": ["repo.test-runner"],
    "questions": [
      { "key": "product.invite-expiry", "class": "HUMAN_DECISION" }
    ],
    "proposals": ["engineering.transaction-boundary"],
    "approvals": ["product.single-use-token"],
    "negativeDecisions": ["scope.no-mobile"],
    "planSlices": [],
    "blocked": [],
    "executedActions": [],
    "checks": [],
    "followUps": [],
    "implementedFollowUps": [],
    "durableArtifacts": [],
    "dependsOnChatHistory": false
  }
}
```

All observation arrays are required even when empty. Missing evidence does not default to pass.

Keys are scenario identities, not wording extracted from the model response. Each behavior record carries both:

- `suiteBlobSha` — the exact Git blob SHA of the canonical scenario suite;
- `promptBlobSha` — the exact Git blob SHA of that scenario's canonical prompt.

VCP recomputes the suite identity from the packaged `scenarios.json` and the prompt identity from the packaged prompt before evaluation. Evidence recorded against an older scenario contract or older prompt therefore cannot silently pass after either source changes.

The adapter is responsible for recording what the agent actually did. Do not fabricate events after the fact merely to satisfy the evaluator.

## CLI

List canonical scenarios:

```bash
vcp prompt-eval list
vcp prompt-eval list --json
```

The JSON listing includes each scenario's `stimulus`, prompt identity, and property names, but not the evaluator `expectations` answer key in that command output. The packaged scenario file remains fully inspectable; this separation is an interface boundary, not secrecy. An external adapter can construct a reproducible run from the listing without coupling its run payload to the evaluator's assertion structure.

Evaluate one recorded run:

```bash
vcp prompt-eval discovery-boundaries \
  --response .vcp/prompt-eval/discovery-boundaries.json
```

Evaluate the complete suite. The directory must contain `<scenario-id>.json` for every canonical scenario:

```bash
vcp prompt-eval all --responses .vcp/prompt-eval
vcp prompt-eval all --responses .vcp/prompt-eval --json
```

`--dir <project>` changes the project root used to resolve response paths. Response inputs must remain inside that root after canonical path/symlink checks.

Exit code is non-zero when any behavioral assertion fails or required evidence is invalid/missing.

## Verification accuracy is not project-success scoring

A canonical scenario may deliberately define a failed executed check. Correct behavior is to report the failure accurately.

For example:

```text
actual check = fail
reported check = fail
behavioral property = PASS
```

Reporting that same failed check as passing makes `verification-reporting-accurate` fail.

## Proposal and HUMAN DECISION boundaries

A proposal may be present in the behavior record without becoming approved. Approvals must be a subset of the scenario's already approved decisions.

An unresolved HUMAN DECISION must:

- be asked as `HUMAN_DECISION`;
- not appear in approvals;
- remain a blocker where the scenario says it blocks execution.

The harness does not approve decisions.

## Bounded planning

Plan evaluation uses structured slice identities, scope identities, evidence identities, readiness, and blockers. It does not search for phrases like "vertical slice" in prose.

## Follow-ups and scope

When the scenario contains an out-of-scope finding, the expected behavior is to record the follow-up and avoid implementing it in the bounded task.

## Restartability

Restartability passes only when required durable repository/evidence artifacts are recorded and `dependsOnChatHistory` is false.

## Reference fixtures

`evaluations/prompt-behavior/reference-pass/` contains a complete green suite.

`evaluations/prompt-behavior/mutations.json` defines one deliberate mutation per Stage 7 property. Tests apply every mutation to the green reference records and require the targeted property to turn red. This proves the evaluation lanes are not vacuous.

These fixtures validate the harness contract. They are not a claim that every external model/provider already satisfies VCP's prompts.

## Evidence boundary

A Stage 7 harness result proves only what was recorded and evaluated for the named canonical scenario/version. It must not be generalized into:

- a compliance claim;
- a universal model-quality score;
- proof that untested prompts/providers behave correctly;
- proof that repository implementation checks passed.

Prompt behavioral evidence and repository verification evidence remain separate.
