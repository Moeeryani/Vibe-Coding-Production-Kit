# Historical PR #96 failure inventory (source-only triage)

**Source receipt:** evidence branch `evidence/pr96-stage12-d13de6be` at
`844edd5a4d6efac918665b2664593a4bbf98f59d`, log
`docs/evidence/pr96-stage12-d13de6be/full-suite-after-fixes.log`,
executed **before** the 2026-10-10 fixture refactor at product `d13de6be`.
**This is not a new test execution** and no item is marked resolved without
an exact-final-head rerun. Last recorded: 469 tests, 331 pass, 137 fail, 1 skip.

## Cause classification from each failed TAP block

- `BROWNFIELD_GATED_INIT`: 24 historical failures
- `D01_GATED_INIT`: 112 historical failures
- `RELEASE_GATE_EXPECTATION`: 1 historical failures

Each row is a unique `test at test/...` TAP failure. The two bulk categories
are setup failures where older tests invoked public init, which is now
intentionally gated; assertion and command failures require separate exact-head
review. Earlier 2026-10-10 edits introduced a disposable v1 fixture to seed
downstream tests, but do not prove those tests pass or that v1 writer safety
has changed. The fixture is not Stage13 unmanaged adoption.

| # | Test source | Original failed test | Triage | Required disposition |
|---|---|---|---|---|
| 1 | `test/check-command.test.mjs` | JavaScript package check script is represented as CHECK_COMMAND in generated tasks | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 2 | `test/check-command.test.mjs` | JavaScript profile keeps lint unresolved when neither lint nor general check is configured | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 3 | `test/check-command.test.mjs` | verify executes and persists CHECK_COMMAND alongside unit tests | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 4 | `test/cli.test.mjs` | installs the core framework and GitHub assets | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 5 | `test/cli.test.mjs` | adds thin adapters only when the selected tool needs them | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 6 | `test/cli.test.mjs` | refuses to overwrite existing managed paths without --force | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 7 | `test/cli.test.mjs` | merges into existing directories when individual framework files do not conflict | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 8 | `test/cli.test.mjs` | auto-detects TypeScript and fills commands proven by package scripts | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 9 | `test/cli.test.mjs` | auto-detects JavaScript package projects and imports existing check/test scripts | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 10 | `test/cli.test.mjs` | Go stack installs stable verification commands | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 11 | `test/cli.test.mjs` | auto-detects Python tooling only when configuration provides evidence | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 12 | `test/cli.test.mjs` | doctor warns for untouched templates but passes structural checks after init | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 13 | `test/cli.test.mjs` | doctor reports explicit stack commands as resolved | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 14 | `test/cli.test.mjs` | task generator creates a bounded task and imports configured verification commands | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 15 | `test/cli.test.mjs` | task generator does not turn reasoned n/a decisions into executable commands | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 16 | `test/cli.test.mjs` | task generator refuses overwrite and supports dry-run | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 17 | `test/community-plugins.test.mjs` | context composes selected guidance and labels verification commands as proposals without mutating AGENT | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 18 | `test/community-plugins.test.mjs` | built-in React Native profile and Stage 10 community plugin remain separate additive authorities | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 19 | `test/community-plugins.test.mjs` | guidance is mode-bounded while plugin identity and proposals remain visible | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 20 | `test/community-plugins.test.mjs` | plugin guidance participates in the normal context budget and manifest | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 21 | `test/community-plugins.test.mjs` | Doctor passes old projects with no declaration and passes valid pinned selections | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 22 | `test/community-plugins.test.mjs` | Doctor fails tampered selected plugins instead of silently dropping them | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 23 | `test/community-plugins.test.mjs` | init and update lifecycle do not invent or manage project plugin declarations/bundles | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 24 | `test/context.test.mjs` | context pack bundles task, repository rules, mode prompt, and source-of-truth documents | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 25 | `test/context.test.mjs` | context pack supports explicit includes and safe repository-local output | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 26 | `test/context.test.mjs` | implement context supports explicit planned paths for greenfield files | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 27 | `test/context.test.mjs` | planned paths are implement-only and must not already exist | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 28 | `test/context.test.mjs` | context pack rejects repository escape paths and enforces the context budget | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 29 | `test/context.test.mjs` | context pack exposes portable slash-separated paths on every OS | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 30 | `test/context.test.mjs` | context CLI emits a usable bounded pack with planned paths | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 31 | `test/doctor-coverage.test.mjs` | doctor strict can be green while explicitly reporting unassessed decision templates | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 32 | `test/doctor-stack-profile.test.mjs` | doctor reports auto-selected generic profile as eligible when concrete evidence appears | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 33 | `test/doctor-stack-profile.test.mjs` | doctor explains that explicit generic provenance preserves the installed profile | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 34 | `test/doctor-stack-profile.test.mjs` | doctor explains that legacy unknown provenance preserves generic conservatively | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 35 | `test/git-review-context.test.mjs` | review context binds task and Source of Truth to an explicit Git base/head surface | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 36 | `test/git-review-context.test.mjs` | review context surfaces dirty working-tree state separately from the committed comparison | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 37 | `test/git-review-context.test.mjs` | Git comparison options are review-only, non-blank, and head requires an explicit base | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 38 | `test/git-review-context.test.mjs` | invalid Git base fails visibly instead of producing an incomplete review surface | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 39 | `test/git-review-context.test.mjs` | Git-aware review fails clearly outside a Git worktree | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 40 | `test/git-review-context.test.mjs` | Git review evidence counts against the existing context byte budget | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 41 | `test/git-review-context.test.mjs` | binary changes are identified by Git rather than represented as complete text content | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 42 | `test/git-review-context.test.mjs` | committed gitlink changes remain visible when repository config ignores submodules | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 43 | `test/git-review-context.test.mjs` | context CLI forwards explicit Git base/head into review mode | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 44 | `test/react-native-detection.test.mjs` | react-native is an explicit supported stack and generates its first-party profile without Go fallthroug | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 45 | `test/react-native-detection.test.mjs` | explicit JavaScript selection is preserved even when React Native evidence is present | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 46 | `test/react-native-detection.test.mjs` | first-party React Native fixture dogfoods init, task verification, and bounded context without plugins | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 47 | `test/react-native-detection.test.mjs` | Doctor reports auto-selected JavaScript as React Native specialization and lifecycle-transition eligibl | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 48 | `test/react-native-detection.test.mjs` | Doctor reports auto-selected TypeScript and generic profiles as React Native specialization eligible | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 49 | `test/react-native-detection.test.mjs` | Doctor withholds specialization for explicit and legacy-unknown lifecycle choices | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 50 | `test/readiness.test.mjs` | fresh generated task is not ready for planning | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 51 | `test/readiness.test.mjs` | core-complete task can enter planning while operational gaps remain warnings | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 52 | `test/readiness.test.mjs` | implementation-ready task passes but warns when referenced source docs are still starter templates | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 53 | `test/readiness.test.mjs` | customized source docs remove starter-template readiness warnings | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 54 | `test/readiness.test.mjs` | implementation readiness fails when verify cannot build an executable plan | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 55 | `test/readiness.test.mjs` | readiness rejects duplicate task sections instead of parsing an ambiguous first copy | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 56 | `test/readiness.test.mjs` | ready detects unsafe source references and CLI supports JSON output | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 57 | `test/release-check-cli.test.mjs` | release-check preview is exposed through the public CLI as structured evidence | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 58 | `test/release-check-cli.test.mjs` | release-check human output states that release approval remains a human decision | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 59 | `test/release-check.test.mjs` | preview validates a clean candidate while retaining tag/publish HUMAN_DECISION boundaries | RELEASE_GATE_EXPECTATION | Require release NO-GO / nonzero exit |
| 60 | `test/release-portability.test.mjs` | task creation reports a portable repository-relative path | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 61 | `test/release-portability.test.mjs` | readiness and verification reports expose slash-separated task paths | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 62 | `test/release-portability.test.mjs` | task and ready CLIs print slash-separated paths on every host OS | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 63 | `test/security-profiles.test.mjs` | security context includes baseline plus selected project-sensitive profiles and manifest identities | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 64 | `test/security-profiles.test.mjs` | missing profile declaration remains backward compatible and still applies baseline | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 65 | `test/security-profiles.test.mjs` | packaged baseline fallback works when an older project lacks Stage 6 local assets | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 66 | `test/security-profiles.test.mjs` | security profiles are not auto-included outside security mode | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 67 | `test/security-profiles.test.mjs` | explicit invalid profile state fails security context instead of silently falling back | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 68 | `test/security-profiles.test.mjs` | draft security profile declaration cannot govern security review | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 69 | `test/security-profiles.test.mjs` | security profile document identity must match the selected profile | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 70 | `test/security-profiles.test.mjs` | doctor exposes active profiles and baseline fallback without warning old projects | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 71 | `test/security-profiles.test.mjs` | doctor fails visibly for invalid explicit security profile state | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 72 | `test/security-profiles.test.mjs` | invalid security declaration remains isolated from non-security context modes | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 73 | `test/security-profiles.test.mjs` | update planning adds Stage 6 assets to a simulated pre-Stage-6 project | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 74 | `test/security-profiles.test.mjs` | update planning preserves project-owned security profile selection | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 75 | `test/source-truth-references.test.mjs` | readiness does not interpret Source-of-Truth prose code spans as repository paths | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 76 | `test/source-truth-references.test.mjs` | context includes only explicit Source-of-Truth files from mixed prose | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 77 | `test/update-cli.test.mjs` | CLI init creates versioned update state | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 78 | `test/update-cli.test.mjs` | CLI update check works offline without registry access | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 79 | `test/update-cli.test.mjs` | CLI update check reports eligible automatic stack profile changes | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 80 | `test/update-cli.test.mjs` | CLI update dry-run is machine-readable and write-free | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 81 | `test/update-cli.test.mjs` | CLI dry-run exits non-zero on conflicts without repairing them silently | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 82 | `test/update-cli.test.mjs` | CLI manage ignore and track preserve local content | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 83 | `test/update-cli.test.mjs` | CLI update and rollback restore the previous manifest version | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 84 | `test/update-init-guard.test.mjs` | init refuses to replace an already initialized VCP project even with --force | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 85 | `test/update-lifecycle.test.mjs` | fresh auto install records requested stack separately from resolved stack | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 86 | `test/update-lifecycle.test.mjs` | fresh v0.9 install is update-idempotent | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 87 | `test/update-lifecycle.test.mjs` | proven automatic generic install re-profiles when deterministic evidence appears | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 88 | `test/update-lifecycle.test.mjs` | automatic re-profiling does not overwrite a local verification-command decision | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 89 | `test/update-lifecycle.test.mjs` | explicit generic install stays generic when new stack evidence appears | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 90 | `test/update-lifecycle.test.mjs` | legacy generic install with unknown stack provenance stays generic | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 91 | `test/update-lifecycle.test.mjs` | auto-selected generic specializes transactionally to React Native and is idempotent | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 92 | `test/update-lifecycle.test.mjs` | auto-selected JavaScript and TypeScript specialize to React Native while retaining auto provenance | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 93 | `test/update-lifecycle.test.mjs` | explicit and legacy-unknown concrete selections do not specialize to React Native | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 94 | `test/update-lifecycle.test.mjs` | auto-selected Go and Python profiles are not generalized into React Native specialization | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 95 | `test/update-lifecycle.test.mjs` | React Native specialization respects local AGENTS verification decisions and blocks on conflict | BROWNFIELD_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 96 | `test/update-lifecycle.test.mjs` | local AGENTS edits are preserved on same-version planning | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 97 | `test/update-lifecycle.test.mjs` | manage ignore and track change ownership without deleting local content | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 98 | `test/update-lifecycle.test.mjs` | doctor fails when an existing VCP manifest is corrupted | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 99 | `test/update-lifecycle.test.mjs` | doctor fails when update transaction state is corrupted | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 100 | `test/update-lifecycle.test.mjs` | doctor fails when an interrupted update transaction is present | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 101 | `test/update-lifecycle.test.mjs` | 0.8 manifest migrates transactionally to the current 0.9 release and can roll back | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 102 | `test/update-stage-cleanup.test.mjs` | successful update removes its stage subtree and the empty stage directory | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 103 | `test/update-stage-cleanup.test.mjs` | interrupted-update rollback removes its staged subtree and empty stage directory | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 104 | `test/update-stage-cleanup.test.mjs` | stage cleanup never sweeps unrelated non-empty stage content | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 105 | `test/update-status.test.mjs` | update check exits zero and reports no-work when nothing is pending | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 106 | `test/update-status.test.mjs` | update check exits zero and reports available when lifecycle work is pending | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 107 | `test/update-status.test.mjs` | dry-run reports available without changing the existing zero exit contract | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 108 | `test/update-status.test.mjs` | blocked dry-run exits one with a valid blocked lifecycle report | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 109 | `test/update-status.test.mjs` | successful apply reports applied and exits zero | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 110 | `test/update-status.test.mjs` | execution failure exits one through the error channel, not a normal lifecycle report | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 111 | `test/verification-scope.test.mjs` | non-Git verification preserves execution and reports project-only scope | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 112 | `test/verification-scope.test.mjs` | Git provenance remains deterministic under a localized caller environment | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 113 | `test/verification-scope.test.mjs` | Git workspace root project is represented by portable dot project path | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 114 | `test/verification-scope.test.mjs` | nested project verification runs in selected project root and persists workspace-relative evidence | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 115 | `test/verification-scope.test.mjs` | symlinked project paths canonicalize for Git provenance without changing the selected target | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 116 | `test/verification-scope.test.mjs` | Git-backed evidence records dirty state before verification without blocking execution | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 117 | `test/verification-scope.test.mjs` | preview refuses active external clean filters before Git status can execute them | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 118 | `test/verification-scope.test.mjs` | dirty submodule is visible even when .gitmodules requests ignore=all | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 119 | `test/verify.test.mjs` | verify preview does not execute repository commands | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 120 | `test/verify.test.mjs` | verify run records passing evidence and can write JSON inside the repo | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 121 | `test/verify.test.mjs` | verify stops after the first failed command | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 122 | `test/verify.test.mjs` | verify CLI supports explicit execution and JSON output | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 123 | `test/verify.test.mjs` | verify refuses an existing evidence path before executing commands | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 124 | `test/verify.test.mjs` | verify refuses to run a task that has not passed implementation readiness | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 125 | `test/workspace-path-reservation.test.mjs` | workspace qualifier is rejected for planned project-local paths | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 126 | `test/workspace-path-reservation.test.mjs` | leading whitespace cannot bypass workspace qualifier rejection for planned paths | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 127 | `test/workspace-path-reservation.test.mjs` | workspace qualifier is rejected for project-local output paths | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 128 | `test/workspace-path-reservation.test.mjs` | leading whitespace cannot bypass workspace qualifier rejection for output paths | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 129 | `test/workspace-path-reservation.test.mjs` | leading whitespace preserves the dedicated workspace include refusal | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 130 | `test/workspace-source-truth.test.mjs` | project-local references preserve existing selected-project behavior | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 131 | `test/workspace-source-truth.test.mjs` | nested project can explicitly use accepted workspace authority without inheriting unrelated root or sib | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 132 | `test/workspace-source-truth.test.mjs` | workspace-qualified starter templates still trigger the existing readiness warning | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 133 | `test/workspace-source-truth.test.mjs` | workspace freshness rules match project-local governing authority rules | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 134 | `test/workspace-source-truth.test.mjs` | workspace reference fails clearly when selected project is outside Git | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 135 | `test/workspace-source-truth.test.mjs` | workspace references reject traversal and filesystem symlink or junction escape | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 136 | `test/workspace-source-truth.test.mjs` | workspace root discovery ignores ambient Git directory/worktree overrides | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |
| 137 | `test/workspace-source-truth.test.mjs` | workspace qualifier is not a general cross-root include escape hatch | D01_GATED_INIT | Use historical v1-only disposable setup; leave D-01 gate closed |

## Closure instructions

After source freeze, compare this 137-row inventory to the new failing tests
by test name and file, not by total alone. Review any changed assertion
against the *actual* public CLI contract. A failure to seed v1 state
is not a reason to re-enable the public legacy initializer. The only
allowable final status is evidence-backed from exact SHA; unresolved or
new failures remain blocking. Native Windows remains separately required
for path/junction coverage and may not be inferred from Linux.
