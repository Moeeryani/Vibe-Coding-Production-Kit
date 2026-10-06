# Stack Profiles

Stack profiles adapt the generic engineering rules in `AGENTS.md` to the technology already present in a repository.

The goal is not to guess a framework. The CLI only fills commands when repository files provide enough evidence.

## Usage

Automatic detection is the default:

```bash
npx vibe-coding-production init . --agent all --stack auto
```

You can also choose explicitly:

```bash
vcp init . --stack javascript
vcp init . --stack typescript
vcp init . --stack python
vcp init . --stack go
vcp init . --stack react-native
vcp init . --stack generic
```

## React Native

React Native is the first built-in Stage 11 mobile profile.

Detection requires both:

1. valid selected-root `package.json` with a non-empty string `dependencies["react-native"]`;
2. at least one selected-root application marker: `android/`, `ios/`, `app.json`, or `app.config.{js,cjs,mjs,ts}`.

Symlinks do not satisfy the React Native application-marker contract. Peer/dev dependency references, lockfile entries, `node_modules`, repository names, README text, or only one side of the evidence conjunction do not activate the profile.

Detection precedence is:

```text
go -> python -> react-native -> typescript -> javascript -> generic
```

The profile reuses the selected-root Node package manager and maps only configured project scripts into VCP verification:

- `format:check` -> `FORMAT_CHECK_COMMAND`;
- `lint` -> `LINT_COMMAND`;
- `typecheck` -> `TYPECHECK_COMMAND`;
- `check` -> `CHECK_COMMAND`;
- `test:unit`, then `test` -> `UNIT_TEST_COMMAND`;
- `test:integration` -> `INTEGRATION_TEST_COMMAND`;
- `build` -> `BUILD_COMMAND`;
- `test:e2e`, then `e2e` -> `E2E_COMMAND`.

Missing build/E2E decisions remain `<define or n/a>`. A TypeScript React Native project with `tsconfig.json` but no `typecheck` script also remains `<define or n/a>`; VCP never invents `tsc`.

Configuration is not authorization. Scripts whose visible command text clearly indicates signing, publication, deployment, store submission, release upload, external device-farm distribution, or similar sensitive mobile effects are deliberately **not auto-imported** into general verification. Nested script behavior can still hide effects, so project review remains responsible for command semantics before `vcp verify --run`.

The generated React Native profile guidance covers platform parity, native-module boundaries, lifecycle/offline/permissions/deep links, secret/signing material, and the separate HUMAN DECISION boundary for signing/deploy/store/device-farm actions.

Auto-selected managed projects may specialize from `generic`, `javascript`, or `typescript` to `react-native` when the exact current evidence contract becomes true. Explicit selectors and legacy manifests without `requestedStack` are preserved. The transition uses the normal update conflict, backup, rollback, and idempotence contract.

## JavaScript / Node.js

Detection: `package.json` when no TypeScript marker is present.

The profile:

- detects npm, pnpm, Yarn, or Bun from lockfiles;
- reads `package.json` scripts;
- maps an existing `lint` script to `LINT_COMMAND`;
- maps a repository-defined general `check` script to the separate `CHECK_COMMAND` slot instead of pretending that every `check` script is lint;
- detects `test`, `test:unit`, `test:integration`, `build`, `test:e2e`, and `e2e` when present;
- marks clearly non-applicable checks such as TypeScript type checking as `n/a` instead of forcing the developer to fill irrelevant placeholders;
- adds JavaScript/Node-specific rules around runtime validation, module contracts, environment dependence, and regression tests.

A generic `check` script is never copied into `LINT_COMMAND`. For backward-compatible Doctor behavior, a Node profile that has `check` but no dedicated `lint` records `LINT_COMMAND=n/a` and `CHECK_COMMAND=<configured check>`. If neither `lint` nor `check` exists, `LINT_COMMAND` remains `<define>` so a genuinely unresolved lint decision is still visible.

## TypeScript

Detection: `tsconfig.json`.

The profile:

- detects npm, pnpm, Yarn, or Bun from lockfiles;
- reads `package.json` scripts;
- maps `lint` and general `check` to their distinct verification slots;
- fills only commands backed by existing scripts such as `typecheck`, `test`, `build`, `test:integration`, and `test:e2e`;
- adds TypeScript-specific rules around strictness, runtime validation, module boundaries, and async behavior.

A check-only TypeScript project uses the same compatibility rule: `LINT_COMMAND=n/a` plus the concrete `CHECK_COMMAND`. If neither `lint` nor `check` exists, lint remains `<define>`. Optional generic `CHECK_COMMAND` is `n/a` when no repository `check` script exists.

## Python

Detection: `pyproject.toml`, `requirements.txt`, or `uv.lock`.

The profile can recognize evidence for:

- uv, Poetry, or requirements-based installation;
- Ruff formatting/linting;
- mypy type checking;
- pytest tests.

It also adds Python-specific rules for exceptions, resource cleanup, runtime validation, type hints, and framework/domain boundaries.

## Go

Detection: `go.mod`.

Go has stable standard tooling, so the profile can provide stronger defaults:

```text
INSTALL_COMMAND=go mod download
FORMAT_CHECK_COMMAND=test -z "$(gofmt -l .)"
LINT_COMMAND=go vet ./...
TYPECHECK_COMMAND=go test ./...
CHECK_COMMAND=n/a
UNIT_TEST_COMMAND=go test ./...
BUILD_COMMAND=go build ./...
```

The profile also adds rules for error wrapping, `context.Context`, goroutine lifecycle, interfaces, and shared state.

## Generic project checks

`CHECK_COMMAND` represents a required project-defined validation command that does not accurately fit format, lint, typecheck, test, build, or E2E.

Examples include repository syntax validation or a project-specific aggregate check. It is additive: existing Task Packs using older verification keys remain valid, and VCP does not reinterpret an existing `LINT_COMMAND` automatically.

## Why evidence-based detection matters

A professional bootstrapper should not silently assume that every Node project uses the same scripts, every Python project uses pytest, or every repository has the same tooling. Wrong automation is worse than an explicit placeholder.

The invariant is:

> Detect what can be proven. Ask the developer only for decisions that repository evidence cannot safely establish.
