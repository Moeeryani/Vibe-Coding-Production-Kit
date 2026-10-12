# Stage 12 D-01: Windows two-principal NTFS fixture (construction only)

**Status: Draft / NO-GO.** No code here enables production managed v2 writes, D-01 approval, deployment, or selected-project changes. This is not Windows durability acceptance.

## Trust model

A true compatibility fence needs two **different Windows security principals**, not two executable names under one SID. Even a read-only `AccessCheck` cannot prove exclusion when a token is elevated, shares an Administrators-group membership, can change ownership or ACLs, or can use `FILE_DELETE_CHILD` on a parent. The published `vibe-coding-production@0.9.3` must later be exercised with its independently authenticated package bytes, including missing-manifest `init --force`, update, manage, rollback and post-backup user edits. That proof is **not part of this fixture creator**.

The native source `scripts/native/vcp-windows-d01-fixture.cpp` is a **new-only** elevated provisioner:

- Requires exact operator opt-in `VCP_D01_WINDOWS_DISPOSABLE=I_ACCEPT_NEW_PROGRAMDATA_FIXTURE_ONLY`.
- Takes only `--old-sid` and `--writer-sid`; both must resolve as existing Windows **user** accounts. They must differ and neither may be the elevated provisioner's own SID.
- Locates OS-known `FOLDERID_ProgramData` (not a caller-provided path), requires NTFS, refuses reparse ancestors, generates a cryptographic 128-bit random leaf `vcp-win-d01-isolation-*`, and uses `CreateDirectoryW` **exclusively**.
- Applies a protected DACL **at initial creation** through `SECURITY_ATTRIBUTES` (SYSTEM and Administrators full; writer SID full; old SID file-read/traverse). Creates only a marker, two project directories, `AGENTS.md`, `.vcp`, and a manifest in the *with-manifest* project. It does not edit an existing ACL, project or account.
- Returns the fixture root, three NTFS IDs, two SIDs and explicit false authorization fields. **The expected process exit is 3, not 0**; no GO claim. Never automatically deletes even a partially created fixture; preserve its forensic evidence.

The native `vcp-windows-d01-token-inspect.cpp` reads actual running process TokenUser SID, derives an impersonation token, and observes each dangerous NTFS right separately, including `DELETE`, `FILE_DELETE_CHILD`, write data/new files/new directories, `WRITE_DAC` and `WRITE_OWNER`. It emits the root and project file IDs and checks them before returning. It is read-only, returns 3, and DOES NOT execute old npm binaries.

## Future operator workflow (do not run as a final acceptance campaign yet)

Use **a new clean checkout at an exact frozen SHA** on native Windows x64 with Visual Studio's **x64 Developer Command Prompt**, not ordinary Git Bash. Complete construction and an independent test plan first.

1. Build with MSVC:
   `npm run build:native-windows-d01-fixture:verify-repro`
   and `npm run build:native-windows-d01-readonly:verify-repro`.
   Store the build output and `build-receipt.json` files. Both native executables stay outside the npm files whitelist.
2. Independently establish the SID of an old-CLI user and a writer user. An administrator running the provisioner must be **neither** one. Review both account tokens for elevation, effective groups, privileges and service memberships; `SidTypeUser` alone does not attest them.
3. Set the explicit opt-in **only in the intended elevated fixture-provisioning session**. Execute the just-built `build/native-windows/d01-fixture/vcp-windows-d01-fixture.exe --old-sid <OLD_SID> --writer-sid <WRITER_SID>`. Expect exit 3 and a JSON receipt. Save stdout as an intact BOM-free UTF-8 JSON file; no write to the project or repository.
4. As **the actual old Windows account**, run `npm run inspect:d01-windows-fixture -- --fixture-receipt <RECEIPT_JSON> --role old --variant with-manifest`, then `without-manifest`. As **the actual writer account**, run the same two commands with `--role writer`. Save the four JSON stdout objects separately, preserving their original bytes and the shell's exit codes. Each complete observation exits 3. The wrapper verifies the native inspector binary SHA-256/source SHA-256 against its build receipt and fails closed if the current token's SID or NTFS IDs differ.
5. From a trusted non-mutating analysis account run `npm run review:d01-windows-fixture -- --fixture <FIXTURE_JSON> --with-old <FILE1> --with-writer <FILE2> --without-old <FILE3> --without-writer <FILE4>`. The review validates distinct SIDs, both manifest variants, identical native binary hashes and exact NTFS object identities. It **always** returns NO-GO/exit 3.

**Do not put account passwords in command-line arguments, comments, artifacts, scripts or GitHub.** If either account cannot read the helper checkout, relocate only the verified source/binary/build receipt through a separately reviewed read-only mechanism; never disable permissions or bypass identity checks to make the report green.

## Boundaries still unproved

- A root in `ProgramData` may be replaceable by an old token with rights on **ProgramData itself**, even when the root DACL looks restrictive. Root and ancestor `FILE_DELETE_CHILD` rights must be independently verified.
- A user belonging to Administrators may exercise more authority than its individual SID's ACE implies. Current ACL snapshots are not complete token-privilege attestations.
- This construction step does not provision Windows accounts, automate elevation, execute the published 0.9.3 CLI, verify a published npm tarball, exercise concurrency, or verify NTFS power-loss durability.
- This mechanism does not provide users an approved edit workflow for writer-owned production content. Such an interface requires its own authorization boundary.
- No use of R3's scratch-only absolute rename workaround is authorized for selected projects. `D-01=DEFERRED`, `G-FENCE=NO-GO`, `managedV2MutationAuthorized=false`, `WINDOWS_NAMESPACE_DURABILITY_UNPROVEN`.

The next independent evidence must be **actual protected-byte comparisons before and after every original old-CLI lifecycle command under real Windows tokens**, followed by concurrency and crash/recovery evidence. Matching build/ACL receipts alone cannot open D-01.

## Bounded native kernel-denial witness (constructed, not accepted)

This is a **separate manually authorized test** from the read-only four-token ACL review. Its source is `scripts/native/vcp-windows-d01-kernel-denial.cpp`; it does not execute the published npm CLI and is never used against a selected project.

The operator must build the new helper with `npm run build:native-windows-d01-kernel-denial:verify-repro` on **MSVC Windows x64** and preserve its source, EXE SHA-256, and build receipt. Compile/runtime success has not yet been verified on a native Windows machine for this HEAD. Its EXE is stored exclusively under the ignored `build/native-windows/d01-kernel-denial/`.

As the real **old CLI Windows user** (not the provisioner or writer), after independently inspecting the disposable ProgramData fixture:

```cmd
set VCP_D01_WINDOWS_OLD_DENIAL=I_ACCEPT_DISPOSABLE_ONLY
npm run probe:d01-windows-kernel-denial -- --fixture-receipt C:\absolute\evidence\fixture.json --variant with-manifest
npm run probe:d01-windows-kernel-denial -- --fixture-receipt C:\absolute\evidence\fixture.json --variant without-manifest
```

These commands deliberately return **exit 3/NO-GO**, not shell-green. The wrapper verifies the native source/EXE SHA-256 against the matching build receipt, validates the exact fixture root and project's NTFS volume/file IDs, and runs the helper only under the running old SID recorded in the fixture. A second explicit environment opt-in is enforced **inside the native EXE** for direct invocation. The helper refuses elevated/Administrators tokens or tokens holding specified sensitive privileges. This is not a complete OS authorization proof.

For each project it first checks the exact original marker and AGENTS.md bytes, and where present the exact manifest bytes. It then requests ten discrete kernel access rights with `OPEN_EXISTING` (file write/append/delete/owner/DACL, directory new entry/delete child/delete, root and ProgramData delete child). A successful permission request is **not** counted as denial. Only if every dangerous request fails with `ERROR_ACCESS_DENIED` does it attempt two bounded mutations:

- `CreateFileW(CREATE_NEW)` at `.vcp\vcp-d01-old-create-probe.bin`, a previously nonexistent, fixed scratch-only leaf.
- If creation is denied, `MoveFileExW` from `AGENTS.md` to `AGENTS.md.vcp-d01-old-moved` in the **same disposable project**, with no replace flag and no fallback to another path.

Afterward it verifies exact original bytes, the protected file identities, root/project identities and absence of both witness names. If either attempt **succeeds**, or any result is ambiguous, it records NO-GO; **no automatic deletion, rollback, rerun or cleanup** is allowed. A native crash, a non-v3-style protocol error or a missing receipt may conceal a completed mutation. Preserve the fixture and inspect before any further execution.

Success of these *disposable kernel attempts* does **NOT** establish denial to `vibe-coding-production@0.9.3` or demonstrate actual execution of its `init --force`, `update`, `manage` or `rollback` write paths. This remains separately required on Linux and Windows, along with true parent-namespace confinement, elevated-token bypass analysis, concurrent operations, and Windows power-loss recovery. `D-01=DEFERRED` and `G-FENCE=NO-GO` remain unchanged.
