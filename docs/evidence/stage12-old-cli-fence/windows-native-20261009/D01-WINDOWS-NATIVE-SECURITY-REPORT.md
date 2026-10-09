# D-01 Windows-native security proof report — VCP Stage 12 (G-FENCE)

**Report date:** 2026-10-09 (UTC recorded per receipt)
**Host:** native Windows 11 Home, `<HOST>`
**Classification:** `NOT_A_MIGRATION_APPROVAL`
**Final technical recommendation:** **NO-GO** — `G-FENCE` stays `NO_GO`, D-01 stays `DEFERRED`.
**Author:** coding agent (fresh-context review); maintainer approval is a separate human decision.

All destructive tests ran only in disposable temp fixtures. The repository was never used as a test
subject, was never modified, and the published 0.9.3 package was never patched or replaced.

---

## 1. Environment and immutable identities

| Item | Value |
|---|---|
| OS | Windows 11 Home, `Microsoft Windows NT 10.0.26200.0` (build 26200) |
| Node.js | `v24.5.0`, `C:\Program Files\nodejs\node.exe` (native, not WSL) |
| `process.platform` / `arch` | `win32` / `x64` (`os.type()=Windows_NT`, `os.release()=10.0.26200`) |
| npm | `11.5.2` |
| Git | `2.49.0.windows.1`, `C:\Program Files\Git\mingw64\bin\git.exe` |
| WSL environment variables | absent (`WSL_DISTRO_NAME`, `WSL_INTEROP` unset) |
| Filesystem | C: NTFS Fixed Healthy; D: NTFS Fixed Healthy (fixture roots `<SCRATCH>`, `C:\Users\...\AppData\Local\Temp`) |
| User | `PARALLEL_SPACE\<USER>`, not domain-joined; **no elevation used** |
| Product HEAD under test | `d13de6be11d4c00b3350ccc23fb0708afb703000` (detached, tree clean, `git status --porcelain` empty) |
| Checkout | fresh clone `<REPO-CLONE>` |
| PR #96 live head | `d13de6be…` (re-read with `gh pr view 96 --json headRefOid`), base `8ccb2765…`, branch `feat/stage12-readonly-inspect-20261009`, state OPEN |
| Integration branch HEAD | `refs/heads/integration/stage12-build-candidate-20261009` = `1905671f0882ff40e4fc3f8997376541b0350a16` — **matches the reference value** |

**Relationship between the two HEADs.** `1905671f` is a merge commit
(`tree 33dbb9b2…`, parents `670e7ff7…` + `d13de6be…`) that incorporates the tested product HEAD and is
100 commits ahead of it; the two are **not** diverged. The local clone is shallow, so git-based ancestry
queries are unreliable there — ancestry was established through the GitHub compare API instead.
For every gate-relevant executable file the two HEADs are byte-identical
(`scripts/poc-old-cli-fence.mjs` blob `6b34c48df5` at both, `lib/lifecycle-lock-v2.mjs` `095af244fc`,
`scripts/audit-d01-evidence.mjs` `56fbec2fb3`, `docs/evidence/stage12-old-cli-fence/D01-NEGATIVE-PROOF-20261009.md` `9d7bc15304`).
The 100-commit delta is docs, `package.json` and adaptive-gate scripts. Consequence: this Windows
evidence applies to the same executable code as the integration build candidate.

## 2. Independent authentication of published `vibe-coding-production@0.9.3` (Windows)

Registry metadata read natively on this host:

```
npm view vibe-coding-production@0.9.3 dist.integrity
  -> sha512-Ielotp4W44vUq1YRqYuQlmC2ztopoQHLN8ypb6ymE8pvI3VCAfGYOIB7uYm9+Df7sMttN9bkznbOqP3iirzcTg==
npm view vibe-coding-production@0.9.3 dist.tarball
  -> https://registry.npmjs.org/vibe-coding-production/-/vibe-coding-production-0.9.3.tgz
```

Fresh download to a new evidence directory (`Invoke-WebRequest`), then `certutil`:

| Check | Result |
|---|---|
| SHA-256 of the downloaded `.tgz` | `4b78fd413cf5e3508f5a5a34b5b47418d437eacd4343290f03b3ac5126ac9130` |
| Historical reference SHA-256 | `4b78fd413cf5e3508f5a5a34b5b47418d437eacd4343290f03b3ac5126ac9130` → **MATCH** |
| SHA-512 (`certutil`) | `21e968b6…abcdc4e` = base64 of the registry `dist.integrity` → **MATCH** |
| Identity inside the tarball | `package/package.json` → `name=vibe-coding-production`, `version=0.9.3`, `engines.node=>=22`, 168 entries |
| Cross-check with the earlier POC run | the tarball in `d01-windows-20261009/` hashes to the same SHA-256 |

**Provenance is proven on Windows.** All conclusions below therefore stand on the real published CLI,
not on GitHub source.

## 3. Harness self-verification before any conclusion

* `node scripts/poc-old-cli-fence.mjs --self-test` → `HARNESS_SELF_TEST_PASS`, exit 0.
* `node --test test/poc-old-cli-fence-harness.test.mjs` → 3 tests, 3 pass, 0 fail.
* The POC refuses to run without both `--tarball` and an independent `--expected-integrity`, and
  re-verifies the sha512 before extracting (verified by the third unit test).

## 4. The 13-scenario published-CLI POC on native Windows

Receipt: `d01-windows-20261009-061043.json` (SHA-256 `a077d078d04dcfd3ab3006a328927358cd16c5ec2a43b5f67e6e9264eeb8f6ba`),
recorded `2026-10-09T06:10:48Z`, `platform=win32`, `arch=x64`, `node=v24.5.0`,
`tarballSha256=4b78fd41…`, `baseline=8ccb2765…`.
Result: **`gate = NO_GO__LEGACY_MUTATION_DEMONSTRATED`, 8 unsafe mutations / 13 scenarios,
1 unexpected observation, process exit 3.**

| # | Scenario | CLI command | Exit | Protected bytes changed | Schema after | Post-backup user edit survived | Lock before → after | Assessment |
|---|---|---|---|---|---|---|---|---|
| 1 | `rollback-v1-backup` | `rollback` | 0 | yes (2) | 1 | **no** | absent → absent | FAIL for user-data safety (mutation) |
| 2 | `rollback-v2-erases-user-edit` | `rollback` | 0 | yes (1) | 2 | **no** | absent → absent | FAIL (edit erased) |
| 3 | `rollback-stale-transaction` | `rollback` | 0 | yes (3) | 1 | **no** | absent → absent | FAIL (followed stale legacy transaction) |
| 4 | `dead-pid-file-lock` | `rollback` | 0 | yes (2) | 1 | **no** | regular-file → absent | FAIL (reclaimed foreign lock) |
| 5 | `separate-lifecycle-lock` | `rollback` | 0 | yes (2) | 1 | **no** | absent → absent | FAIL (independent lock ignored) |
| 6 | `directory-sentinel-rollback` | `rollback` | 1 | none | 2 | yes | directory → directory | PASS (refusal) |
| 7 | `directory-sentinel-update` | `update --offline` | 1 | none | 2 | yes | directory → directory | PASS (refusal) |
| 8 | `directory-sentinel-manage` | `manage ignore` | 1 | none | 2 | yes | directory → directory | PASS (refusal) |
| 9 | `fresh-malformed-lock` | `rollback` | 1 | none | 2 | yes | regular-file → regular-file | PASS (refusal) |
| 10 | `aged-malformed-lock` | `rollback` | 0 | yes (2) | 1 | **no** | regular-file → absent | FAIL (aged malformed lock reclaimed) |
| 11 | `intact-v2-old-init` | `init --force` | 1 | none | 2 | yes | absent → absent | PASS (refusal) |
| 12 | `deleted-manifest-old-init` | `init --force` | 0 | yes (2) | 1 | **no** | absent → absent | FAIL |
| 13 | `deleted-manifest-directory-sentinel-old-init` | `init --force` | **0** | **yes (2: `.vcp/manifest.json`, `AGENTS.md`)** | 1 | **no** | directory → directory | **FAIL — the proposed sentinel mitigation is disproven** |

All seven Linux post-backup-edit-loss witnesses reproduce on native Windows in kind, and case 13 — the
one added specifically to test the proposed directory-sentinel fence — mutates on Windows.

**Cross-platform comparison.** For the 12 scenarios that exist on both receipts
(`docs/evidence/stage12-old-cli-fence/linux-observations-20261009.json`, Linux, node v24.20.0, same
`tarballSha256 4b78fd41…`), Windows reproduces the same outcome, exit code, mutation flag, lock
transition and user-edit result in **12 of 12** cases. Case 13 exists only in the Windows run. The
adversarial states in §5 (aged directory sentinel, foreign-host aged lock, pid-less lock, mid-run lock
swap, restore-primitive release, manifest×entrypoint matrix, reparse points) have **no Linux counterpart
yet** — they are new Windows-side observations, not confirmations.

## 5. Windows-native adversarial results (independent harnesses, this session)

Four harnesses were written and executed against the same authenticated published package (`adversarial-d01.mjs`, `adversarial-pass2.mjs`, `gap-tests.mjs`, `journal-follow-test.mjs`).
Raw receipts: `adversarial-receipt-run4.json`, `adversarial-pass2-receipt.json`, `gap-out.json`.

### 5.1 Mechanism found in the published 0.9.3 code (not speculation)

`lib/state.mjs` in the published tarball:

* `acquireUpdateLock()` writes `{pid, host, startedAt}` with flag `wx`. On `EEXIST` it
  JSON-parses the file, and treats the lock as **stale** when `existing.host !== os.hostname()` and the
  file is older than `staleMs` (1 hour default), **or** when parsing yields no usable `pid` and the file
  is older than `staleMs`, **or** immediately when `pid` is absent/invalid. It then calls
  `rm(file, { force: true })` and retries. It has **no knowledge of `version`, `mode` or `token`**.
* `releaseUpdateLock()` is `rm(lockFile(root), { force: true })` — **no ownership check at all**.
* `restoreBackup()` calls `releaseUpdateLock()` unconditionally at its end, whether or not the caller
  held the lock.
* `init.mjs` contains **zero** calls to `acquireUpdateLock`/`releaseUpdateLock`: the `init` entrypoint is
  completely lock-blind. Only `update`/`rollback` (`update-apply.mjs`) and `manage` take the lock.

### 5.2 Lock and ownership probes (A-series)

| ID | Test | Exit | Result | Interpretation |
|---|---|---|---|---|
| A1 | empty directory sentinel aged 2 h, `rollback` | 1 | refused with `Path is a directory: rm returned EISDIR`; sentinel intact; edit survived | the stale-reclaim path reaches `rm(force:true)` on a directory and **fails closed on Windows**. **No Linux comparison is available for this state** — the Linux receipt never aged a directory sentinel — so this is a Windows observation, not a proven platform difference |
| A2 | fresh directory sentinel containing an `owner.json` token, `rollback` | 1 | refused "Another VCP update appears to be running"; token file untouched | sentinel holds while fresh |
| A3 | regular-file lock with a live same-host PID | 1 | refused | liveness check works on one host |
| A4 | lock claiming another host, fresh | 1 | refused (age-based rule not yet triggered) | — |
| A5 | lock claiming another host, aged 2 h | **0** | **mutation**, schema 2→1, user edit erased | cross-host ownership is unverifiable; old CLI acts on an unverifiable owner |
| A6 | malformed payload variants | — | `{host, no pid}` and `{pid:null}` → **exit 0, mutation, edit erased within the 1 h window**; empty / `not json` / `[1,2,3]` → refused | a v2-shaped record that ever lacks a usable `pid` is destroyed immediately, not after an hour |
| A7 | two old-CLI `rollback` processes started together | A 0 / B 1 | A mutated (edit lost), B refused | the legacy lock does serialize **old-vs-old**; that is not old-vs-new protection |
| B1 | published `restoreBackup()` called while a v2-shaped lock is held by another writer | n/a | lock **deleted**, manifest rewritten, user edit erased | `FOREIGN_LOCK_STOLEN_BY_OLD_RESTORE` |
| D3 | live old-CLI `update` run whose own lock was replaced mid-run by a different writer's lock | 1 | replacement lock **deleted** by the old CLI's cleanup | `OLD_CLI_STOLE_REPLACEMENT_LOCK`; observed directly in a running process, not by direct function call |

### 5.3 Manifest / state matrix across old entrypoints (14 runs)

| Manifest state | `init --force` | `rollback` |
|---|---|---|
| intact schema 1 | refused (exit 1) | mutated (edit lost) |
| **missing** | **mutated** (schema 2→1; `.vcp/manifest.json` and `AGENTS.md` rewritten over the user's edit) | mutated (edit lost) |
| corrupt (`{ truncated`) | refused | mutated (edit lost) |
| schema **3** | refused | refused |
| missing + v2 journal/backup present | **mutated**; journal and v2 backup files survived | refused — **incidentally only**, because that backup had no `files/AGENTS.md`; see §5.3b |
| missing + directory sentinel | **mutated** | refused |
| missing + v2 journal + directory sentinel | **mutated** | refused |

Two structural facts follow:

* `init --force` is gated only by "does `.vcp/manifest.json` exist". No lock, sentinel, journal or
  reader-version field is consulted. **Every lock-shaped fence is inert for `init`.**
* `rollback` respects a schema-3 manifest but **not** a schema-2 manifest with
  `minimumReaderVersion: 999.0.0` (G4 below).

### 5.4 Reader-fence gap tests (G-series)

| ID | Setup | Command | Exit | Outcome |
|---|---|---|---|---|
| G1 | intact schema-2 manifest, `minimumReaderVersion 999.0.0`, no lock | `init --force` | 1 | refused ("already initialized") — **because the manifest exists** |
| G2 | same + fresh directory sentinel | `init --force` | 1 | refused (manifest is the guard, not the sentinel) |
| G3 | same + v2-shaped lock with a live PID | `init --force` | 1 | refused; lock file left untouched (init never looked at it) |
| G4 | intact schema-2 manifest, `minimumReaderVersion 999.0.0` | `rollback` | **0** | **schema 2 → 1, user edit erased** |

G4 is the important one for D-01: **the v2 manifest reader-version field is not a fence for `rollback`.**
Removing that field from the v2 format would remove the only fence that currently works for that
entrypoint.

### 5.5 Crash, interruption and durability

| ID | Test | Result |
|---|---|---|
| D1 | `SIGKILL` sent 180 ms into `rollback` | the child had already completed (exit 0, restore finished, edit lost, no lock/transaction/stage left). Windows delivers `SIGKILL` as `TerminateProcess`: it kills, but it cannot stop a process that already finished; **no genuine mid-write interruption was demonstrated** |
| SIGKILL semantics probe | separate CPU-bound Node child | `kill()` returned true, `close` reported `signal=SIGKILL`, writes stopped — the mechanism works, but the window was not hit |
| D2 | long-path (`ENAMETOOLONG`) write-failure simulation | the deep `mkdir` succeeded, so the trigger never fired → **UNVERIFIED** |
| E4 | `.vcp/backups/<id>` deleted by another process while `rollback` ran | exit 0, schema 1, user edit erased | 
| Permission-error and real `ENOSPC` injection | not attempted safely | **UNVERIFIED** |

`file-durability.mjs` documents the correct posture — a directory-entry durability failure must fail
closed — but see §6: on this host it fails closed **always**, so durability is not merely unproven, the
whole writer path is inoperable on Windows.

### 5.6 Reparse points, links and path handling (Windows-native)

| ID | Test | Result |
|---|---|---|
| E1-junction | `cmd /c mklink /J` placed over the backup `files/` directory, pointing at an outside tree containing a poisoned `AGENTS.md` | junction created and resolving; old CLI **refused**: `Refusing to follow symlink in VCP state path`. Outside file untouched, injected content never reached the project → PASS (refusal) |
| E1-symlink | project-managed `AGENTS.md` replaced by a symlink to an outside file, then `rollback` | refused: `Refusing to follow symlink in managed path`; outside target byte-identical afterwards → PASS (refusal) |
| E2 | `.vcp/manifest.json` replaced by a symlink to an outside manifest, then `init --force` | exit 1, no changes; outside manifest content unchanged → **symlink not followed**; PASS with a corrected label (the first pass's verdict string was computed from a faulty predicate and is superseded by the recorded content) |
| E3 | case-variant path (`…\d01-pass2-x7al8y\…` requested against `…\d01-pass2-x7aL8Y\…`) | exit 0, mutation, edit erased: NTFS case-insensitivity is handled normally, no differential behavior observed |
| Symlink privilege | `mklink` (non-junction) creation succeeded on this host without elevation | not BLOCKED — no privilege caveat applies |

**No out-of-root write through a link was demonstrated for the published 0.9.3 CLI.** Its
`assertInternalPath` link refusal is, unlike its lock, an effective guard.

### 5.3b v2 journal is **not** a fence (dedicated test, `journal-follow-test.mjs`)

A v2-shaped crash journal (`formatVersion 2`, `phase: verified`, `backupId: op-2026-0002`) pointing at a
v2-shaped backup whose `files/AGENTS.md` exists with pre-migration content, on a schema-2 project with a
post-backup user edit:

```
node <published-0.9.3> rollback <project>
  exit 0
  stdout: "Restored VCP backup op-2026-0002. Project state returned to undefined."
  resultingSchema: 1
  userEditSurvived: false
  stalePreMigrationContentWritten: true
  transaction.json after: removed
```

The old CLI parsed the v2 journal, followed it to the v2 backup, wrote stale pre-migration content over
the user's newer edit, downgraded the manifest to schema 1, and **deleted the v2 crash journal**. The
earlier matrix refusal for the journal case was therefore incidental: it happened only because that
fixture's v2 backup had no `files/AGENTS.md` on disk. A v2 journal must not be counted as protection,
and its deletion also destroys the future writer's recovery evidence.

## 5.7 Direct answers to the D-01 fence questions

| # | Question | Answer with evidence |
|---|---|---|
| 1 | Does the *existing* fence actually stop 0.9.3? | **No.** The Stage-12 lock is the same path (`.vcp/update.lock`) as the legacy lock but with extra fields 0.9.3 ignores; 0.9.3 reclaims it on age or on an unverifiable foreign host (A5, A6), deletes it without owning it (B1, D3), and `init` never reads it (G1–G3) |
| 2 | Does a directory sentinel cover all old entrypoints, incl. `init` with a missing manifest? | **No.** It covers `rollback`/`update`/`manage` while fresh (POC 6–8, A2), and POC 13 plus the matrix rows "missing + sentinel" show `init --force` mutating straight through it |
| 3 | Can the file lock transition to a new barrier without a race window? | **UNVERIFIED, and untestable here.** No implementation performs such a transition, and the writer cannot run on Windows at all (§6) |
| 4 | Does protection survive a crash? | **Not proven.** The new writer is fail-closed and never steals locks (`lifecycle-lock-v2.mjs` has no stale stealing), but durability of directory entries is unsupported on Windows (§6) and no genuine mid-write crash was injected (D1) |
| 5 | Does the solution stop an old backup being restored over newer user edits? | **No.** G4, §5.3b and POC 1–5/10/12: post-backup edits are erased; `rollback` honors neither `minimumReaderVersion` at schema 2 nor the v2 journal as a stop signal |
| 6 | Is there a material Linux/Windows difference? | **Yes.** Directory fsync `EPERM` on Windows blocks the entire v2 writer path (§6); POSIX-only signal semantics make Windows crash injection weaker; the 12 shared POC scenarios are otherwise identical 12/12 |
| 7 | Is there a rollback path that loses user files? | **Yes.** Legacy rollback downgrades schema 2 → 1 and rewrites `AGENTS.md` from the backup; `init --force` on a missing manifest rewrites the managed state over the user's schema-2 project; E4 shows a backup deleted mid-run still completing with exit 0 |
| 8 | Does the evidence prove the production writer, or only fixtures? | Danger is proven against the **real published 0.9.3** (authenticated tarball). The **new** writer is proven only at library level (`lifecycle-lock-v2.mjs`, `versioned-journal.mjs` probes) — `previewManagedSchemaMigration()` returns `blocked/zeroWrite` and `assertManagedMigrationGate()` throws by design, so no end-to-end old-vs-new production run exists |

## 6. Decisive Windows finding: the Stage-12 writer cannot run here

Direct probe of the product's own lock library (`lockprobe.mjs`, `D01_REPO` = `d13de6be`):

```
INIT_ACQUIRE_FAILED   code=E_DIRECTORY_SYNC_UNPROVEN  cause=EPERM
UPDATE_ACQUIRE_FAILED code=E_DIRECTORY_SYNC_UNPROVEN
DIRECTORY_SENTINEL_ACQUIRE_BLOCKED code=E_VCP_PATH
DIR_SYNC_BLOCKED      code=E_DIRECTORY_SYNC_UNPROVEN  causeCode=EPERM   (C: NTFS)
DIR_SYNC_BLOCKED_ON_D code=E_DIRECTORY_SYNC_UNPROVEN  causeCode=EPERM   (D: NTFS)
```

and an isolated raw probe: opening a directory handle succeeds, but `FileHandle.sync()` on that handle
fails `EPERM` (`errno -4048`), while `sync()` on a regular file succeeds.

Consequences:

1. `acquireLifecycleLock()` — used by `managed-schema-migrator.mjs` and `greenfield-apply-v2.mjs` —
   throws before it can create any state. The production v2 writer is **inoperable on native Windows**,
   so it would fail closed rather than endanger user data, but Stage 12 also cannot execute here.
2. The old-vs-new concurrency proof (C1) is **BLOCKED on Windows by the platform gap**, not by my
   harness. `G-FENCE` was never touched to attempt it.
3. A directory-shaped lock is fail-closed for the new writer (`E_VCP_PATH` / `EEXIST`), so the new writer
   would never be fooled by a sentinel — but a fence the writer cannot operate is not a compatibility
   proof.

## 7. Hash comparison summary

| Artifact | SHA-256 | Comparison |
|---|---|---|
| freshly downloaded npm 0.9.3 `.tgz` (this session) | `4b78fd413cf5e3508f5a5a34b5b47418d437eacd4343290f03b3ac5126ac9130` | equals the historical Linux reference and the tarball used by the Windows POC receipt |
| Windows POC receipt | `a077d078d04dcfd3ab3006a328927358cd16c5ec2a43b5f67e6e9264eeb8f6ba` | 13/13 scenarios recorded, exit 3 |
| adversarial pass 1 receipt (run 4) | `58990e807962f8e3daa3916a7be98701fe406a1476dd8849b62dac285cc45e5b` | 16 tests recorded |
| adversarial pass 2 receipt | `515a22c41db196ded37961df289d6fa588a8876a0a7b612b3be22b88954e1ce1` | 14 matrix runs + 5 other tests |
| gap tests output | `ff516684ff2457779a424c47ab9e2b1967dc8b11845c19a319d69620bac4d318` | G1–G4 |
| harnesses | `adversarial-d01.mjs` `0f0b7425…`, `adversarial-pass2.mjs` `730875e0…`, `gap-tests.mjs` `0f7e8ebe…`, `lockprobe.mjs` `33d614d7…`, `sigkill-probe.mjs` `2002bf1b…` | reproducible |

Per-file hashes of every protected fixture file before and after each run are inside the receipts.

## 8. Demonstrated vulnerabilities (all on the authenticated published 0.9.3, native Windows)

1. **User-data loss through the ordinary v1-compatible state path.** `rollback` restores a legacy backup
   over a schema-2 state and erases the post-backup user edit, including when
   `minimumReaderVersion` is set beyond the old CLI (G4, and POC cases 1–5, 10, 12).
2. **`init --force` is lock-blind.** It consults only manifest existence. No directory sentinel, no v2
   lock, no journal stops it (G1–G3, POC 13, matrix rows "missing + sentinel", "missing + v2 journal").
3. **Ownership-blind release.** `releaseUpdateLock()` = `rm(force:true)` with no `dev`/`ino`/token check,
   reached through a real CLI process (D3) and through the restore primitive (B1). A lock the old CLI
   never owned can be deleted by the old CLI.
4. **Stale-reclaim of locks it cannot verify.** Foreign-host ownership is unverifiable, and a record
   without a usable `pid` is destroyed immediately (A5, A6). A future fence that writes any
   pid-less or malformed-looking state is unsafe against 0.9.3.
5. **No version/token awareness.** The old CLI never reads `version`, `mode` or `token`, so a
   token-only lock separation cannot work against it (POC 5, and `separate-lifecycle-lock`).
6. **The v2 crash journal is followed, not refused — and is destroyed.** With a v2 journal pointing at a
   v2 backup whose file entries exist, `rollback` exits 0, writes stale pre-migration content over the
   user's newer edit, downgrades the manifest to schema 1 and deletes `transaction.json` (§5.3b). This
   both erases user data and removes the future writer's recovery evidence.

## 9. Unverified / blocked (no PASS claimed for any of these)

* Real old-vs-new concurrent writers on Windows — **BLOCKED** by §6 (`E_DIRECTORY_SYNC_UNPROVEN`), and
  blocked independently by `G-FENCE = NO_GO` which was not opened.
* Atomic file→directory lock handoff without a racing window — **UNVERIFIED**; the current production
  writer only ever creates a regular-file lock, so there is no implemented transition to test.
* Genuine mid-write crash injection on Windows — **UNVERIFIED** (`SIGKILL` maps to `TerminateProcess`;
  D1 did not interrupt a write).
* `ENOSPC` and permission-error write-failure behavior — **UNVERIFIED** (no safe isolated trigger found;
  D2's long-path proxy did not fire).
* Directory-entry durability (`fsync` semantics) on Windows — **proven unsupported** on this host, which
  is itself the blocking finding of §6.
* `scripts/audit-d01-evidence.mjs` — it is hardcoded to the historical Linux 12-scenario receipt; it
  rejects the Windows 13-scenario receipt ("provenance or scenario count", exit 3). That rejection is a
  limitation of the audit script, **not** a Windows failure, and it must not be read either way.
* Stage 12 acceptance beyond D-01 — not evaluated here; a green POC-harness self-test is not Stage 12
  completion.

## 10. Proposed remediation (engineering direction only; no code was changed)

Ordered by how much of §8 they close against the *already published, unchangeable* 0.9.3:

1. **Keep the v2 manifest's `schemaVersion` above the legacy supported value for every state the old CLI
   must not touch, and keep the manifest present.** This is the only fence observed to work across
   `init`, `update` and `manage`. It fails for `rollback` at schema 2 (G4) but refuses at schema 3 — the
   asymmetry must be resolved by a design decision, not discovered again later.
2. **Fix Windows durability first.** Give `syncContainingDirectory()` a Windows-adequate primitive (for
   example a `CreateFile`/`FlushFileBuffers`-based directory handle, or an explicitly documented
   durability-equivalent substitute) or accept that Stage 12 cannot run on Windows at all.
3. **Never rely on a lock alone.** `init --force` proves a lock-shaped fence is entrypoint-partial.
4. **Make the future writer's release ownership-checked in a way 0.9.3 cannot imitate** — 0.9.3 deletes
   any lock file unconditionally, so a fence that depends on the old CLI *not* deleting the lock is
   unimplementable.
5. **Avoid pid-less or non-object lock records**, and treat cross-host PID claims as unverifiable (A5/A6).
6. If a sentinel is still wanted, note that on this Windows host an **empty** directory survived the
   stale-reclaim only because `rm(force:true)` returned `EISDIR` (A1); a non-empty sentinel survived the
   fresh path (A2). Whether the same aged-empty state behaves differently on Linux is **untested** — it
   must not be assumed either way, and a fence cannot rest on a platform accident in `rm` semantics.

## 11. Residual risks

* The published 0.9.3 cannot be retrofitted; every mitigation is only about *what state it finds*, not
  about *what it does* — so residual risk stays material for `init --force` and `rollback`.
* Windows and Linux differ in mechanisms this fence depends on: directory-entry durability is **proven
  absent on Windows** (§6), and `SIGKILL` on Windows is `TerminateProcess` rather than a POSIX signal.
  Whether `syncContainingDirectory()` succeeds on Linux was **not** re-tested here — the Linux receipts
  contain no writer-side probe — so that asymmetry is asserted only for Windows, not compared.
  Cross-platform equivalence of the *danger* is established for the 12 shared POC scenarios (12/12
  identical outcomes); cross-platform equivalence of the *mitigations* is not established at all.
* The evidence in this report is produced by throwaway harnesses outside the repository. They are
  reproducible but not maintained, so they can drift from the repo's own POC.

## 12. Final D-01 classification

**NO-GO.**

`NO-GO` is the correct class rather than `UNVERIFIED` because unsafe modification of user files was
*positively demonstrated* on native Windows with the independently authenticated published 0.9.3:
8 of 13 POC scenarios mutate protected bytes and erase post-backup user edits, the adversarial matrix
adds further mutating paths, and the specific proposed mitigation (a directory sentinel) is disproven for
`init --force` on this platform. In addition, the mechanism that would have to provide the safe fence
cannot run on Windows at all (§6).

Per the task's governing rule — user files matter more than a green result — `G-FENCE` remains `NO_GO`
and D-01 remains `DEFERRED`. **This report is not a human approval and does not reopen D-01.**

### What still remains before Stage 12 / D-01 could be reconsidered

1. A Windows-working durability primitive, or an explicit decision that Stage 12 is Linux/macOS-only.
2. A fence design that covers **all** old entrypoints including lock-blind `init --force`, with the
   reader-version asymmetry (G4) resolved in the v2 format.
3. A gap-free file→directory (or equivalent) handoff proof, including crash-into-partial-state tests
   with genuine mid-write interruption on Windows.
4. Real old-vs-new concurrency evidence once (1) exists.
5. Byte-for-byte post-backup user-edit preservation in every rollback/update/init path.
6. An updated `scripts/audit-d01-evidence.mjs` that accepts a 13-scenario Windows receipt instead of only
   the historical Linux 12-scenario one.
7. Explicit maintainer acceptance recorded against a pinned HEAD (human decision; out of scope here).
