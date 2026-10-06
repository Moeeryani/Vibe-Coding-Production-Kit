# Task — Stage 11 Slice 1 React Native detection and Doctor inspection

Status: In progress
Slug: `stage11-react-native-detection`

## Outcome

VCP deterministically recognizes React Native applications at the selected project root, accepts `react-native` as an explicit first-party stack selector without inventing mobile commands, and exposes React Native specialization state through Doctor while preserving existing lifecycle behavior.

## Source of truth

| Source | Reference |
|---|---|
| Accepted mobile contract | `docs/MOBILE-PROFILES.md` |
| Stage 11 Slice 1 issue | https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/84 |
| Completed design issue | https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/82 |
| Design PR | https://github.com/Moeeryani/Vibe-Coding-Production-Kit/pull/83 |
| Released baseline | `v0.9.3` / `dc3c6a6572e1b86994de5a46cfb8fc815ed45378` |
| Current implementation base | `a56e576b8fba452b1467d25e4caffeda134e828d` |

## Requirement restatement

Implement only the first bounded product slice from the accepted React Native-first design: exact detection and read-only inspection. Do not add first-party React Native guidance, verification-command mapping, lifecycle application of concrete-to-concrete specialization, native execution, signing, deployment, or a first-party mobile example fixture in this slice.

## Acceptance criteria

- [ ] AC-001 — `STACK_CHOICES` accepts explicit `react-native`.
- [ ] AC-002 — positive detection requires both a valid `dependencies["react-native"]` non-empty string and an application marker.
- [ ] AC-003 — TypeScript React Native application resolves to `react-native`.
- [ ] AC-004 — marker-only Node application remains JavaScript/TypeScript.
- [ ] AC-005 — peerDependency-only React Native library remains JavaScript/TypeScript.
- [ ] AC-006 — dependency-only project without an application marker remains JavaScript/TypeScript.
- [ ] AC-007 — malformed `package.json` never activates React Native detection.
- [ ] AC-008 — existing Go/Python precedence remains unchanged.
- [ ] AC-009 — Doctor human/JSON output exposes React Native specialization eligibility separately from existing generic re-profile eligibility.
- [ ] AC-010 — explicit non-auto lifecycle selections are not specialization-eligible.
- [ ] AC-011 — legacy missing `requestedStack` is not specialization-eligible.
- [ ] AC-012 — existing JavaScript/TypeScript/Go/Python/generic behavior remains regression-covered.
- [ ] AC-013 — explicit `react-native` selection cannot fall through to Go or synthesize native commands.
- [ ] AC-014 — no native execution/signing/deploy/device-farm command surface is added.
- [ ] AC-015 — focused tests, syntax check, full validation, fresh review, and exact-head gate are retained before merge.

## Scope

### In scope

- React Native detector in `lib/stacks.mjs`;
- explicit `react-native` selector recognition;
- safe detection-only profile behavior until later guidance/verification slices;
- React Native specialization assessment fields in `lib/stack-provenance.mjs`;
- Doctor human/JSON inspection;
- focused detection/Doctor tests;
- stack-profile documentation needed to explain the partial slice contract.

### Out of scope

- React Native AGENTS guidance appendix;
- React Native verification mapping;
- `vcp verify` execution changes;
- lifecycle planner/apply for JavaScript/TypeScript -> React Native;
- nested/monorepo conformance fixture;
- first-party `examples/mobile-react-native/`;
- signing/deployment/device-farm behavior;
- Flutter/native iOS/native Android;
- Dependency Graph Engine.

## Detection contract

Precedence remains:

```text
go -> python -> react-native -> typescript -> javascript -> generic
```

React Native requires both:

1. valid `package.json` with a non-empty string `dependencies["react-native"]`;
2. at least one selected-root application marker:
   - `android/`
   - `ios/`
   - `app.json`
   - `app.config.js`
   - `app.config.cjs`
   - `app.config.mjs`
   - `app.config.ts`.

A peer dependency, dev dependency, transitive lockfile entry, `node_modules`, README/name text, or one side of the conjunction is not enough.

## Inspection contract

Existing generic re-profile fields remain backward-compatible and continue to describe the currently implemented generic-auto lifecycle transition.

Slice 1 adds separate specialization inspection fields for React Native:

- `specializationEligible`;
- `specializationTarget`;
- `specializationState`;
- `specializationReason`.

These fields are read-only in this slice. They do **not** authorize or apply JavaScript/TypeScript -> React Native lifecycle updates.

## Explicit selector safety

Until later Stage 11 guidance/verification slices implement the React Native managed appendix, an explicit/detected `react-native` selection must preserve the generic AGENTS content unchanged rather than falling through to another stack profile. This is deliberate detection-only behavior and must be documented/tested.

## Security / authorization

This slice never adds Gradle, Xcode, Expo, React Native CLI, simulator/device, signing, deployment, publication, or credential-bearing commands.

The accepted design remains authoritative: configuring/discovering a command is not sensitive-action authorization.

## Test plan

### Focused

- exact detector positives/negatives;
- Go/Python precedence;
- explicit selector no-Go-fallthrough;
- Doctor specialization eligibility for auto-selected generic/JavaScript/TypeScript states;
- explicit selector and legacy provenance withholding.

### Regression

- existing stack/CLI tests;
- existing Doctor stack-provenance tests;
- full `npm run validate`.

## Verification commands

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `node --test test/react-native-detection.test.mjs test/doctor-stack-profile.test.mjs test/cli.test.mjs`
- full gate: `npm run validate`
- package surface: `npm run pack:check`

## Independent review evidence

| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |
|---|---|---|---|---|
| NO ACTION | accepted design boundary | React Native detection and inspection are bounded by the merged `Authority: ACCEPTED` mobile contract. | Implement only Slice 1. | Guidance, verification mapping, lifecycle apply, nested conformance, and realistic fixture remain later slices. |
| SECURITY | preserved boundary | Current generic verifier does not have an effect-aware sensitive-action gate. | Add no native/sensitive execution commands in this slice. | Existing generic verifier behavior remains outside this slice. |
| RISK | non-blocking | #69 Linux/hosted conformance remains open. | Use accepted exact-head Windows evidence channel. | Cross-OS proof remains pending. |
| RISK | non-blocking | #73 concurrent local filesystem replacement remains unresolved. | Do not widen filesystem trust guarantees. | Concurrent replacement remains outside current guarantee. |

## Finalization

- [ ] Acceptance criteria complete.
- [ ] Focused tests green.
- [ ] Full validation green.
- [ ] Fresh changed-surface review complete.
- [ ] Exact-head pre-final gate green.
- [ ] Task Pack-only finalization performed.
- [ ] Same complete gate rerun on finalization head.
