# Mobile Profiles

Authority: ACCEPTED

Stage 11 defines deterministic first-party mobile profiles. The first built-in profile is **React Native**.

This contract is intentionally narrower than "mobile support" in general. Flutter, native iOS, and native Android are not built-in Stage 11 profiles and require separate design/evidence before support can be claimed.

## 1. Authority boundary

First-party mobile profiles are core VCP behavior. They are not community plugins.

The Stage 10 community-plugin model remains additive:

- a selected community plugin may add bounded guidance and verification proposals only within its granted capabilities;
- plugin guidance cannot override stack detection, first-party profile rules, readiness, security, lifecycle, Source-of-Truth, or release policy;
- verification proposals remain proposals and are not copied into project verification state automatically;
- Stage 11 never rewrites or removes a project's `docs/plugins/PLUGINS.json` selection merely because built-in React Native support exists.

The existing `examples/community-profile-react-native/` fixture remains Stage 10 plugin dogfood. It is not the Stage 11 first-party mobile fixture.

## 2. Selected project root

Mobile detection is bounded to the selected VCP project root.

The existing Stage 5 contract remains authoritative:

- `--dir` selects the VCP project root;
- enclosing Git worktree provenance does not widen project authority;
- sibling packages/apps do not contribute detection evidence to the selected project;
- a monorepo with a nested React Native app must run VCP against that app/workspace root when that nested app is the intended VCP project.

Stage 11 does not add recursive repository-wide app discovery.

## 3. React Native detection contract

React Native is a Node-family specialization. Detection inserts one specific rule before the existing TypeScript/JavaScript fallback rules while preserving the existing Go/Python precedence.

Detection order:

1. `go.mod` → `go`;
2. any existing Python marker (`pyproject.toml`, `requirements.txt`, or `uv.lock`) → `python`;
3. React Native evidence contract below → `react-native`;
4. `tsconfig.json` → `typescript`;
5. `package.json` → `javascript`;
6. otherwise → `generic`.

A selected project root is detected as `react-native` only when **both** conditions are true:

### Package evidence

`package.json` parses as JSON and contains a non-empty string value at:

```text
dependencies["react-native"]
```

`peerDependencies["react-native"]` alone is not application evidence and does not activate the built-in profile. A dev-only reference does not activate the profile.

### Application marker

At least one selected-root application marker exists:

```text
android/
ios/
app.json
app.config.js
app.config.cjs
app.config.mjs
app.config.ts
```

This conjunction is deliberate:

- a generic JavaScript/TypeScript repository with an app-like file but no React Native runtime dependency remains JavaScript/TypeScript;
- a React Native library declaring only a peer dependency remains JavaScript/TypeScript;
- an incomplete/stale `react-native` dependency without a mobile application marker does not become first-party mobile authority;
- an Expo-managed app is eligible when it still declares the React Native runtime dependency and has an app config marker;
- TypeScript React Native apps resolve to `react-native`, not `typescript`, because the mobile profile is the more specific first-party behavior while still honoring an explicit repository typecheck script.

If Go/Python markers coexist at the same selected root, the existing Go/Python precedence remains unchanged. The user should select the actual nested mobile project with `--dir` rather than asking VCP to infer a primary project from a mixed repository root.

Malformed `package.json` is never evidence for React Native. Stage 11 does not guess from directory names, repository names, README text, transitive dependencies, lockfile package entries, or installed `node_modules`.

## 4. Explicit stack selection

Stage 11 adds `react-native` as an explicit supported stack/profile selector alongside the existing choices.

```text
auto
generic
javascript
typescript
python
go
react-native
```

Explicit selection remains a human choice:

- `--stack react-native` requests the React Native profile directly;
- `--stack javascript`, `--stack typescript`, or `--stack generic` is never silently replaced by React Native detection;
- `auto` is the only selector that allows evidence-driven profile resolution/re-profiling.

## 5. Verification discovery contract

React Native verification uses the existing Node package-manager/script evidence model. VCP does not invent native tool commands.

Package manager selection remains evidence-based from the selected root lockfiles.

The React Native profile maps only existing `package.json` scripts:

| VCP slot | Repository evidence |
|---|---|
| `INSTALL_COMMAND` | existing npm/pnpm/Yarn/Bun lock/package evidence using the existing Node install rules |
| `FORMAT_CHECK_COMMAND` | `format:check` if present, otherwise `n/a` |
| `LINT_COMMAND` | `lint` if present; if only `check` exists, lint remains `n/a` |
| `TYPECHECK_COMMAND` | `typecheck` if present; otherwise `<define or n/a>` when `tsconfig.json` exists, else `n/a` |
| `CHECK_COMMAND` | `check` if present, otherwise `n/a` |
| `UNIT_TEST_COMMAND` | `test:unit`, then `test`; otherwise unresolved `<define>` |
| `INTEGRATION_TEST_COMMAND` | `test:integration` if present, otherwise `n/a` |
| `BUILD_COMMAND` | `build` if present, otherwise `<define or n/a>` so applicability remains explicit |
| `E2E_COMMAND` | `test:e2e`, then `e2e`; otherwise `<define or n/a>` so device/journey coverage is not silently declared irrelevant |

VCP must not synthesize commands such as:

```text
npx react-native ...
npx expo ...
gradlew / gradle
xcodebuild
pod install
adb
simctl
fastlane
store upload / publish commands
signing commands
```

Configuring or discovering a command does **not** authorize its execution. The current `vcp verify --run` runner executes configured Task Pack commands after readiness checks and general `--run` consent; it does not add a separate effect-aware approval gate for signing, publication, deployment, device-farm, credential-bearing, or destructive native actions.

Therefore Stage 11 must keep those sensitive actions **out of general verification commands**. If a project requires one of them, the Task Pack must label it as a separate HUMAN DECISION/manual action and require explicit human authorization at execution time rather than allowing ordinary `vcp verify --run` to invoke it. Repository configuration or plugin proposal state alone is not sufficient authorization.

## 6. First-party React Native guidance

The built-in profile may add first-party engineering rules to the managed `AGENTS.md` profile appendix. Guidance must remain bounded to engineering concerns and must not claim framework-specific behavior that repository evidence does not establish.

Minimum guidance areas:

- keep shared/domain logic independent from platform/UI glue where practical;
- isolate platform-specific behavior behind explicit interfaces and test both platform branches when changed;
- treat native-module/bridge boundaries and external runtime data as untrusted interfaces;
- preserve Android/iOS parity intentionally rather than assuming one platform proves the other;
- handle app lifecycle, offline/retry, deep-link/navigation input, and permission-denied paths when relevant to the task;
- never commit signing keys, keystores, certificates, provisioning profiles, store credentials, private service files, or secret environment values;
- do not run signing, store publication, deployment, device-farm, or destructive native commands without explicit human authorization;
- keep verification evidence grounded in configured project scripts.

## 7. Lifecycle and safe re-profiling

Fresh `--stack auto` installs use the detection contract above.

Existing managed projects may automatically specialize to `react-native` only when historical provenance proves the prior profile was auto-selected.

Eligible transitions:

```text
generic    -> react-native
javascript -> react-native
typescript -> react-native
```

For every transition:

1. `install.requestedStack` must be exactly `auto`;
2. current selected-root detection must resolve to `react-native`;
3. the installed stack must be one of `generic`, `javascript`, or `typescript`;
4. the normal lifecycle planner/ownership/conflict/backup/rollback/idempotence contracts remain in force.

Withheld transitions:

- explicit `requestedStack: generic|javascript|typescript|react-native|python|go`;
- legacy manifest with missing `requestedStack`;
- installed `go` or `python`;
- any project whose current detection does not satisfy the exact React Native evidence contract.

After a successful automatic specialization, VCP persists `install.stack: "react-native"` while retaining `install.requestedStack: "auto"`.

Stage 11 does not generalize re-profiling into arbitrary concrete-to-concrete transitions. The JavaScript/TypeScript → React Native transition is a narrowly defined Node-family specialization backed by the new, more specific evidence contract.

## 8. Doctor and inspection

Stage 11 reuses Doctor as the read-only inspection surface rather than adding a second stack-inspection command.

Human and JSON Doctor output must make it possible to distinguish:

- detected stack/profile;
- installed lifecycle stack, when managed;
- requested selector, when recorded;
- whether a React Native specialization is eligible;
- the specialization target and reason.

A detected React Native project that is explicitly pinned to JavaScript/TypeScript/generic must not be described as silently wrong; Doctor should explain that detection and installed/requested lifecycle state are distinct facts.

## 9. Security and privacy boundary

React Native profile support does not authorize VCP to read, store, copy, display, or infer sensitive signing/deployment material.

Sensitive examples include:

- Android keystores and signing passwords;
- iOS certificates, private keys, provisioning profiles, team credentials;
- App Store Connect / Play Console credentials or tokens;
- private service-account files;
- device identifiers when they are sensitive in the project context;
- secret environment/configuration values.

Profile guidance may point developers/reviewers to these trust boundaries without reading secret values.

Mobile permission/privacy guidance is engineering guidance only and must not assert legal/regulatory compliance.

## 10. Stage 10 plugin coexistence

Built-in React Native support and community plugins can coexist.

Precedence:

1. core VCP safety/readiness/lifecycle/release rules;
2. first-party built-in stack/mobile profile;
3. explicitly selected Stage 10 community guidance/proposals.

A plugin cannot:

- change the detected/installed stack;
- replace first-party profile rules;
- suppress a core/Doctor/readiness failure;
- mutate `AGENTS.md`;
- turn a verification proposal into an approved command.

Stage 11 does not automatically remove the Stage 10 React Native-readiness fixture/selection from existing repositories. Project owners may remove redundant community guidance deliberately after review.

## 11. Conformance fixtures

Stage 11 implementation must add a distinct first-party fixture, separate from the Stage 10 community-plugin fixture:

```text
examples/mobile-react-native/
```

The positive fixture should be network-independent for VCP conformance and contain enough repository evidence to prove:

- exact React Native detection;
- optional TypeScript marker without losing React Native specialization;
- concrete local verification scripts that VCP can discover;
- bounded context/profile guidance;
- no community plugin selection required.

Negative/ambiguous lanes may use isolated test fixtures and must include at least:

1. generic JavaScript project + `app.json`, no React Native dependency → JavaScript;
2. React Native peer dependency only → JavaScript/TypeScript library, not mobile app;
3. `dependencies.react-native` with no application marker → JavaScript/TypeScript;
4. application marker with malformed `package.json` → not React Native;
5. explicit `--stack javascript` on React Native evidence → explicit JavaScript preserved;
6. legacy missing `requestedStack` → no automatic specialization;
7. auto-selected JavaScript/TypeScript managed project → eligible React Native specialization;
8. selected nested React Native app does not consume sibling/root markers beyond its project boundary;
9. existing Stage 10 React Native community plugin remains additive and cannot override the built-in profile.

## 12. Implementation slices

After this design contract is merged, product implementation proceeds in bounded slices:

1. **Detection + inspection** — `react-native` stack choice, exact evidence detector, Doctor/lifecycle inspection, negative lanes.
2. **First-party guidance + context** — React Native profile appendix and explicit plugin authority separation.
3. **Verification discovery** — Node-script-derived React Native commands and command-invention regressions.
4. **Nested/lifecycle conformance** — Stage 5 root/workspace preservation plus safe auto specialization and idempotence.
5. **Security + realistic dogfood** — first-party fixture, secret/signing boundaries, package surface, full fresh-clone exact-head gate.

Each slice must preserve existing non-mobile regressions. A later slice may refine earlier code only when a material review/gate finding requires it.

## 13. Release boundary

Stage 11 starts after immutable `v0.9.3`. It does not modify the `v0.9.3` tag, published package, or GitHub Release.

No next package version is implied by this design document. Version/release-candidate preparation remains a later explicit release task.
