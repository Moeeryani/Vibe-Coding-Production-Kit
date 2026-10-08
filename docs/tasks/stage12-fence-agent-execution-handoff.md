# Handoff to computer-enabled engineering agent — Stage 12 G-FENCE POC

**STATUS: EXECUTION REQUEST / DRAFT / NO-GO FOR SCHEMA-V2 MIGRATION.**
**Repository:** `Moeeryani/Vibe-Coding-Production-Kit`.
**Review stack:** #86 (decision register + Stage12 Task), #87 (S/T corrections), #88 (published-old-CLI POC harness), and this agent-handoff PR.
**Explicit constraint:** GitHub Actions are unavailable for this account. Do NOT depend on Actions, fake checks, or lower release acceptance criteria. Instead perform independent LOCAL computer executions and attach reviewable raw evidence to this PR.

## YOUR ASSIGNMENT (read before changing anything)

You are an execution/validation agent with a computer and GitHub write access. Your task is to **execute, debug and independently evidence the published-v0.9.3 old-CLI mutation-fence POC**; not to approve D-01, merge PRs, or implement/enable schema-v2 migration.

1. Read this file, `docs/POC-OLD-CLI-FENCE.md`, `scripts/poc-old-cli-fence.mjs`, `test/poc-old-cli-fence-harness.test.mjs`, and #86/#87/#88 descriptions. Confirm the current PR HEAD SHA and that `main` is still at the audited SHA or record/reconcile any deviation.
2. On a **fresh detached checkout of THIS HANDOFF PR HEAD** (not `main`, not a simulated release), run manual baseline `npm ci`, `npm run validate`, `npm run pack:check`, Node syntax and dedicated harness tests with unmasked exit codes and logs. Target Node >=22 (use Node 24 when available). Investigate failures; don't call failing tests green.
3. Independently retrieve npm Registry `dist.integrity` for **exact** `vibe-coding-production@0.9.3`, download the published `.tgz`, and match SHA-512 **before executing any old binary**. Archive its SHA-256, exact npm package name/version, registry URL, fetch UTC timestamp and `npm view` output. Do not substitute repository code, dist-tag `latest`, or reconstructed archives.
4. Execute all **12 scenarios** using the actual tarball on native **Linux AND Windows**, if both hosts are available. Use disposable test projects only. Save each machine's JSON receipt and the complete raw invocation transcript with correct exit codes.
5. Inspect each result (actual old CLI exit/status, full changed path list, schema after, post-backup edit survival, legacy lock kind before/after). The harness returns code 2 when **unsafe old mutation is reproduced**; that is scientifically valuable negative evidence, and G-FENCE stays NO-GO.
6. Review the harness carefully: if any scenario setup fails, expected behavior is wrong, file-content snapshots miss a protected path, platform portability fails, or a command is not truly from the authenticated tarball, fix **only the POC runner/tests/docs on this branch**. Record the failure before fix and new HEAD afterward. Do not silently relax assertions or delete failing scenarios.
7. Investigate the **unproven cases** separately in new isolated test helpers, if feasible: file-lock to directory-sentinel handoff without any writable gap; old/new concurrent writer lock behavior; stale `transaction.backupId`; dead/foreign locks, PID reuse; process crash at lock and journal transitions. Do not treat synthetic new-writer simulations as proof that the production migration writer is safe. If not implementable at this stage, mark each UNVERIFIED with rationale.
8. Publish a signed-off **engineering observation report**, evidence index and recommendation to this PR. You may commit bounded new POC tests/evidence and post a PR comment, but you must NOT mark decisions ACCEPTED, mark G-FENCE PASS, merge PRs, enable v2 writes, or rewrite the immutable v0.9.3 package.

## Safety limits and scope

- Never run the legacy rollback, update, manage, or init mutators on an actual user/project repository. The runner itself creates temporary directories. Do not use absolute real-project paths with the published CLI.
- Use independently integrity-verified published release only. Reject any altered or unauthenticated `.tgz`.
- Do not modify `lib/state.mjs`, `lib/update-apply.mjs`, production `lib/**`, project migrations, lock design, tags or npm release.
- A directory sentinel that blocks three old entrypoints once **does not** prove it can be installed atomically while old processes run. Lock separation and newest-v2-backup alone also do not provide a zero-write fence.
- Do not let `--yes`, tests, or this handoff approve maintainer architectural decisions (D-01–D-12 remain proposals).
- The historical Stage11 exact-finalization-head Windows rerun gap cannot be retroactively closed by these tests.
- Do not upload user data or secrets. All fixtures are synthetic; redact workstation personal paths from published logs only if the redaction is declared and raw unredacted files are retained securely.

## Exact checkout and manual validation

Clone or fetch the repo; in the same checkout verify you're testing the SHA shown on this PR:

```bash
git fetch origin
git checkout --detach origin/docs/stage12-fence-agent-handoff-20261009
git rev-parse HEAD
git status --porcelain
node --version
npm --version
git --version
npm ci
npm run validate
npm run pack:check
node --check scripts/poc-old-cli-fence.mjs
node --test test/poc-old-cli-fence-harness.test.mjs
git status --porcelain
```

**Important:** These commands are illustrative. Capture each command's stdout/stderr and its **own exit code** in raw log files outside the checkout. Under POSIX avoid pipeline status masking; use `$?` immediately. Under PowerShell save `$LASTEXITCODE` immediately after each native command. Nonzero is a real failure. Note OS build and Node/npm/Git versions. If the PR branch receives fixes, re-fetch and rerun on its new exact SHA. Do not claim a previous SHA test covers a changed runner.

## Published package authentication and POC run — Linux/macOS

Run only in a fresh detached checkout on a machine with npm Registry access. Prefer a new unique local scratch directory OUTSIDE the checkout. Do not reuse an evidence filename:

```bash
scratch="$(mktemp -d)"
integrity="$(npm view vibe-coding-production@0.9.3 dist.integrity --registry=https://registry.npmjs.org)"
printf 'registry_integrity=%s\n' "$integrity"
npm pack vibe-coding-production@0.9.3 --pack-destination "$scratch" --registry=https://registry.npmjs.org
tarball="$scratch/vibe-coding-production-0.9.3.tgz"
sha256sum "$tarball"
node scripts/poc-old-cli-fence.mjs --tarball "$tarball" --expected-integrity "$integrity" --scenario all --evidence "$scratch/linux-poc-evidence.json"
poc_exit=$?
printf 'POC_EXIT=%s\n' "$poc_exit"
```

Interpret `poc_exit=2` as a potentially successful **negative security reproduction**, not a safe migration. Save the scratch JSON and raw transcript outside the checkout before cleanup. If a command before POC fails, STOP and report it; do not execute from a missing or unauthenticated archive.

## Published package authentication and POC run — native Windows PowerShell

Use native Windows with Node >=22, npm and a working `tar` executable. Do not report WSL-on-Windows as native Windows:

```powershell
$scratch = Join-Path $env:TEMP ('vcp-fence-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch | Out-Null
$integrity = (npm view vibe-coding-production@0.9.3 dist.integrity --registry=https://registry.npmjs.org | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $integrity) { throw 'npm registry lookup failed' }
npm pack vibe-coding-production@0.9.3 --pack-destination $scratch --registry=https://registry.npmjs.org
if ($LASTEXITCODE -ne 0) { throw 'published npm tarball download failed' }
$tarball = Join-Path $scratch 'vibe-coding-production-0.9.3.tgz'
Get-FileHash $tarball -Algorithm SHA256 | Format-List
$receipt = Join-Path $scratch 'windows-poc-evidence.json'
node scripts/poc-old-cli-fence.mjs --tarball $tarball --expected-integrity $integrity --scenario all --evidence $receipt
$pocExit = $LASTEXITCODE
Write-Host "POC_EXIT=$pocExit"
Write-Host "EVIDENCE=$receipt"
```

If PowerShell native-command nonzero behavior interrupts a step, use explicit `$LASTEXITCODE` capture rather than a pipe or success-looking wrapper. A security reproducer that returns `2` must still have its JSON receipt reviewed, not discarded.

## Mandatory observation matrix

Run every existing case from the harness and report exact result, not just expected intent:

| Group | Scenarios | Minimum acceptance of evidence |
|---|---|---|
| Old rollback | `rollback-v1-backup`, `rollback-v2-erases-user-edit`, `rollback-stale-transaction` | Selected backup, before/after bytes, resulting manifest schema, user post-backup edit survival |
| Old lock | `dead-pid-file-lock`, `separate-lifecycle-lock`, `fresh-malformed-lock`, `aged-malformed-lock` | Lock kind before/after, real CLI exit, changed paths; no 'regular file is a permanent fence' claim |
| Directory proposal | `directory-sentinel-rollback`, `directory-sentinel-update`, `directory-sentinel-manage` | Released CLI behavior on both OS; directory remains a directory afterward |
| Old init | `intact-v2-old-init`, `deleted-manifest-old-init` | Whether old --force refuses or recreates v1 and mutates files |
| Follow-up adversarial POC | atomic handoff, concurrent old/new, killed process, PID reuse, ENOSPC/EACCES, Windows junctions | Separate executable fixture receipts or explicitly UNVERIFIED |

## What to commit / report (review artifacts)

1. Commit a **small evidence index** to `docs/evidence/stage12-old-cli-fence/README.md`: tested code SHA(s), platform names, UTC timestamps, published tarball hash/integrity, command list and exit codes, per-case result links, observed mutation list, blockers and **G-FENCE=NO-GO or UNVERIFIED**. Avoid sensitive hostnames or temp user directories in public evidence.
2. Attach sanitized JSON receipts as `docs/evidence/stage12-old-cli-fence/<platform>-observations.json` if suitably small and free of private paths. Preserve genuine raw logs securely and provide retrievable references or a redacted excerpt with declared redactions. **Never include the downloaded npm tarball in git.**
3. Post a comment on THIS PR with a compact matrix: `test SHA`, `OS`, `Node/npm`, `tarball sha256`, `integrity verified`, `npm validate exit`, `pack check exit`, `12 cases: per-name observed result`, `unsafe mutations`, `unexpected observations`, `atomic/concurrency/crash coverage`, `next proposed test`, and evidence paths.
4. If fixing test scripts, make minimal source changes on this PR branch, explain the failing pre-fix observation, and rerun **all applicable fixtures** on final HEAD; do not mark failures skipped to get green.
5. End with one of **(a) NO-GO: unsafe old mutation demonstrated**, **(b) UNVERIFIED: incomplete published/platform/handoff proof**, or **(c) EVIDENCE FOR MAINTAINER REVIEW: bounded experiment favorable, production atomic-conversion/recovery still pending**. Only the maintainer can approve D-01; never state G-FENCE PASS solely on this POC.

## Definition of Done for THIS execution handoff

- [ ] Real published-v0.9.3 identity and SHA-512 validated independently (not only npm package version string).
- [ ] Raw exact-HEAD local Node/npm baseline + harness tests collected (no fake Actions green).
- [ ] Native Linux and native Windows 12-case outputs collected, or missing platform marked **UNVERIFIED** with reason.
- [ ] Result per scenario includes changed files, whether post-backup edits survived, old-lock kind and exit status.
- [ ] Any harness defect corrected only after recording reproduction; complete rerun on resulting HEAD.
- [ ] Additional atomic/concurrency/crash tests completed or explicitly unproven.
- [ ] Evidence index / receipts committed safely and summary posted to this PR; Git remains clean before test runs.
- [ ] Maintain **schema-v2 migration disabled**, no PR merged, no D-01 signoff invented.

**STOP:** Test setup failures, absent registry SHA-512, unexpected actor access to real projects, or uncertain mutation boundaries must stop the run and be reported immediately. A standalone isolated experiment cannot prove the full migration's crash/concurrency contract.
