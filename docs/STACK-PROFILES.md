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

## React Native — Stage 11 detection/inspection slice

Detection is more specific than the TypeScript/JavaScript fallback and requires **both**:

1. valid `package.json` with a non-empty string `dependencies["react-native"]`;
2. at least one selected-root application marker: `android/`, `ios/`, `app.json`, or `app.config.{js,cjs,mjs,ts}`.

A peer dependency, dev dependency, transitive lockfile entry, `node_modules`, repository name/README text, an application marker without the runtime dependency, or the runtime dependency without an application marker is not enough.

Detection precedence is:

```text
go -> python -> react-native -> typescript -> javascript -> generic
```

This first Stage 11 slice intentionally implements detection and Doctor/lifecycle inspection only. A detected or explicitly selected `react-native` profile preserves the generic `AGENTS.md` content in this slice; it does **not** fall through to another stack and does not synthesize React Native, Expo, Gradle, Xcode, simulator/device, signing, deployment, or publication commands. First-party React Native guidance and repository-script verification mapping are added in later bounded Stage 11 slices.

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
