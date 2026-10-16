# B-4/B-5 Controlled Test Lane — Security Design

Status: DESIGN for the isolated testing mechanism. No production gate
changed. D-01 DEFERRED, G-FENCE NO-GO, Production Writers DISABLED.

## Architecture

```
Production entrypoints (CLI, lib/init.mjs, ...)
  → NEVER pass testCapability
  → ALWAYS hit assertManagedMigrationGate() → DENY (unchanged)

Test-only composition layer (test/helpers/)
  → controlled-writer-fixture.mjs: creates + verifies disposable fixture
  → controlled-writer-capability.mjs: mints fixture-scoped capabilities
  → passes testCapability into the EXISTING writer core
  → writer core verifies capability INSTEAD OF the production gate
  → mutations confined to the verified disposable fixture
```

The production authorization result is never modified. There is no
environment variable, no flag, no generic bypass. The test capability is
a separate authorization path that only the test helpers can mint, and it
is strictly narrower than the production gate (one fixture, one process,
revocable).

## 1. How test capabilities are created

`mintTestCapability({fixture})` in `test/helpers/controlled-writer-capability.mjs`:
- Called ONLY by `createControlledFixture()` after the fixture passes all
  verification (Section 2).
- Creates a capability record `{id, fixtureRoot, fixtureId, deviceInoPin,
  mintedAt, mintedPid, allowedOperations, revoked:false}`.
- Registers it in a module-scoped `WeakSet` (unforgeable within the process;
  capabilities are never serialized, never leave the process).
- Returns the capability object to the test. Tests pass it as
  `testCapability` to writer core functions.

## 2. How capabilities are restricted to one disposable root

- The capability embeds the exact fixture root path AND its device/inode pin.
- Every use re-verifies: `path.resolve(root) === capability.fixtureRoot`
  AND current device/inode matches the pin (detects replacement).
- The capability lists allowed operations (e.g., `['concurrency-test']`);
  any other operation is denied.
- Capabilities are process-bound (`mintedPid === process.pid`); a capability
  cannot be used from another process.

## 3. How real project roots are excluded

`createControlledFixture()` refuses unless ALL hold:
- The fixture is created fresh by the helper under
  `os.tmpdir()/vcp-controlled-<random>/` (the ONLY approved location).
  Pre-existing directories are never adopted.
- Walking up from the fixture: no `.git` directory, no `.vcp` directory,
  no `package.json` with a `vibe-coding-production` reference (real repo markers).
- The fixture is not `/`, not the home directory, not an ancestor of either.
- The resolved path stays within `os.tmpdir()` (no escape via symlinked tmp).
- A fixture identity file `.vcp-controlled-fixture.json` is written with a
  unique ID; its presence + content match is required on every use.

## 4. How filesystem identity is verified

- At creation: `lstat` device/inode of the fixture root is pinned.
- Before each mutation: the writer core re-pins and compares (via
  `verifyPathIdentity`). Mismatch → `E_WRITER_IDENTITY_CHANGED` → DENY.
- The fixture identity file is re-read and its ID compared to the
  capability's `fixtureId`. Tampering → DENY.
- TOCTOU: the check-then-use window is narrowed by re-verifying inside the
  writer core immediately before mutation (not just at fixture creation).

## 5. How authorization is rechecked before each mutation

The writer core functions accept an optional `testCapability` parameter:
- If absent → existing production authorization runs unchanged (gate for v2).
- If present → `verifyTestCapability(cap, {root, operation})` runs INSTEAD,
  performing ALL checks in Sections 2–4 plus revocation + process + operation
  checks, immediately before the mutation.
- There is no path where both are skipped: the parameter is either absent
  (production gate) or present-and-verified (test capability).

## 6. How symlink, hardlink, junction, path-traversal attacks are rejected

- Symlink components: `verifyNamespaceContained` lstates each path component;
  any symlink → `E_WRITER_NAMESPACE_UNSAFE`.
- Path traversal: `..` components rejected; resolved target must stay within
  the fixture root (`E_WRITER_NAMESPACE_ESCAPE`).
- Hardlinks: the device/inode pin detects replacement; hardlinking a fixture
  path to outside content changes identity → DENY. (Hardlink creation itself
  requires write access the test process has, but the identity pin catches
  the substitution.)
- Junctions/reparse points (Windows): refused by the existing namespace
  checks; Windows lane is out of scope (no host).

## 7. How stale capabilities are invalidated

- `teardownControlledFixture()` sets `capability.revoked = true` and removes
  the capability from the valid set BEFORE deleting the fixture directory.
- Any use after revocation → `E_TEST_CAPABILITY_REVOKED` → DENY.
- Capabilities are never persisted; process exit invalidates all of them.

## 8. How concurrent operations are isolated

- Each fixture gets a unique capability; two fixtures cannot share.
- The writer core's existing lock (`acquireLifecycleLock`) provides mutual
  exclusion within a fixture; lock ownership is verified per the B-1 design.
- Cross-fixture interference is impossible: capabilities are root-pinned.

## 9. How test code is excluded from production entrypoints and artifacts

- Test helpers live in `test/helpers/` — NOT in `package.json` `files`
  (verified: `files` lists `bin/`, `lib/`, `docs/`, etc., but not `test/`).
  They are excluded from the published npm artifact.
- No production module imports from `test/` (verified by grep in review).
- The CLI (`bin/`, `lib/cli.mjs`) has no code path that constructs or
  accepts a `testCapability`.
- `scripts/validate-controlled-writer-lane.mjs` is a validation script, not
  a production entrypoint.

## 10. How failures safely terminate execution

- Any verification failure throws before any mutation (fail-closed).
- The writer core's existing `finally` blocks release locks.
- Fixture teardown verifies identity before deleting (never broad `rm -rf`
  on unverified paths).
- A failed test leaves the fixture for inspection; teardown is explicit.

## Threat model: malicious or misconfigured test vs real repository

| Attack | Defense | Result |
|-|-|-|
| Test passes real repo path to fixture helper | Helper verifies: not under tmpdir / is inside git repo / has `.vcp` → refuse | DENIED at creation |
| Test forges a capability object | `WeakSet` membership check fails | DENIED at use |
| Test reuses capability after teardown | `revoked` flag | DENIED at use |
| Test symlinks fixture to real repo | Device/inode pin mismatch; symlink component rejection | DENIED at use |
| Test modifies fixture identity file | ID mismatch | DENIED at use |
| Test replaces fixture dir between check and use | Re-verification inside writer core before mutation | DENIED at use |
| Test imports capability minter directly | Minter still runs full fixture verification | DENIED unless fixture valid |
| Production code path receives testCapability | No production path constructs or forwards it | Gate still applies |
| Test helper shipped in npm artifact | `test/` excluded from `files` | Not exposed |

Residual risk: a test running in the same process could, in principle,
import the minter and create a VALID fixture (it would still be a disposable
fixture under tmpdir — the damage is confined to a temp dir). The production
gate is never bypassed for real roots because the fixture verification
cannot be satisfied by a real root.
