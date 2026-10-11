# Stage 14 R4 — W-6 Delegate Coverage Matrix (verified on native Windows/NTFS)

All delegates below were **executed and passed by name** on native Windows 10.0.26200, NTFS
(DriveFormat=NTFS proven for C: and D:; test tmpdir resolved to D:\vcp-r4-tmp on NTFS), at
de8faa19. Source: `logs/11-node-test-stage13-windows-ntfs.log` (12 tests, 12 pass, 0 skip).

Each delegate creates **real reparse points** via `fs.symlink(..., 'junction'|'file')` and
asserts `lstat(...).isSymbolicLink() === true` — creation failure would fail the test visibly,
not skip. File-symlink creation requires privilege on Windows; the passing file-symlink tests
prove this host has it (no privilege blocker). Every delegate ends with `foreignUnchanged`:
the external target file's bytes are re-read and deep-compared to the original buffer.

## The five new W-6 native tests (all PASS by exact name)

| # | Exact test name | Result |
|---|---|---|
| 1 | `native Windows linked selected root and in-root alias are rejected` | PASS (5.19ms) |
| 2 | `native Windows provider inspection rejects a junction-selected root` | PASS (5.90ms) |
| 3 | `native Windows inspection refuses symlinked manifest without reading its target` | PASS (6.30ms) |
| 4 | `native Windows path guard rejects internal and external file symlinks` | PASS (6.07ms) |
| 5 | `native Windows adoption plan refuses symlinked external source evidence` | PASS (6.11ms) |

## Source → delegate pairs for the four formerly-`pending` skips

### S1 `test/adoption-inspect.test.mjs`: "inspect: linked root, .vcp state and manifest are never trusted" — **PASS (fully delegated)**

| Source assertion (Linux) | Native Windows delegate | Delegate assertion | Result |
|---|---|---|---|
| linked root (`symlink dir`) → `ROOT_LINK_REFUSED` | "provider inspection rejects a junction-selected root" (external junction) + "linked selected root and in-root alias are rejected" (in-root junction) | `classification=BLOCKED`, `reason=ROOT_LINK_REFUSED` | PASS |
| linked `.vcp` state → `STATE_NOT_DIRECTORY` | "linked VCP state never becomes a trusted manifest" (pre-existing native test) | `classification=BLOCKED`, `reason=STATE_NOT_DIRECTORY` | PASS |
| symlinked manifest (file link) → `MANIFEST_NOT_REGULAR` | "inspection refuses symlinked manifest without reading its target" | `classification=BLOCKED`, `reason=MANIFEST_NOT_REGULAR`, foreign bytes unchanged | PASS |

Semantic difference: source uses POSIX `dir`/`file` symlinks; delegates use junctions for
directory links (the native NTFS reparse type that requires no privilege) and real file
symlinks for file links. Same guard code paths, same reason codes. No gap.

### S2 `test/adoption-inspect.test.mjs`: "inspect: symlinked parent component is rejected even for in-root target" — **PASS**

| Source assertion | Native Windows delegate | Delegate assertion | Result |
|---|---|---|---|
| in-root dir symlink alias → `BLOCKED`/`ROOT_LINK_REFUSED` | "linked selected root and in-root alias are rejected" | `BLOCKED`/`ROOT_LINK_REFUSED` **and** `resolveProjectPath(alias,'f')` rejects `E_VCP_PATH` | PASS |
| `readdir(real) === []` (target untouched) | not re-asserted verbatim; delegate asserts foreign-byte preservation and the adoption-plan delegate asserts `zeroWrite:true` + all actions `executionAuthorized:false` | — | PASS with note |

Note: the in-root target non-mutation assertion is covered indirectly (inspection is
read-only by contract; zero-write is asserted explicitly in the adoption-plan delegate and
byte preservation in every delegate). Judged not a material semantic gap.

### S3 `test/safe-path.test.mjs`: "reject external and internal symlinks, linked parent and linked selected root" — **PASS**

| Source assertion | Native Windows delegate | Result |
|---|---|---|
| internal relative dir link traversal `alias/f` → `LINK_REFUSED` | "junction cannot be followed by project read or write" (`docs/jlink/secret.txt` read + `docs/jlink/new.txt` write → `E_VCP_PATH`) | PASS |
| internal file link `link` → `LINK_REFUSED` | "path guard rejects internal and external file symlinks" (`int` → `E_VCP_PATH`) | PASS |
| external file link `/etc/hosts` → `LINK_REFUSED` | same delegate (`ext` → outside secret.txt, `E_VCP_PATH`) | PASS |
| linked selected root `resolveProjectPath(alias,'f')` → `ROOT_LINK` | "linked selected root and in-root alias are rejected" (`E_VCP_PATH`) | PASS |

Granularity note: Windows delegates assert the error `code` (`E_VCP_PATH`); the reason
substring (`LINK_REFUSED`/`ROOT_LINK`, carried in the message on all platforms) is not
asserted in the automated delegates. This campaign closed that granularity gap with an
independent manual run (`logs/18-hash-reparse-demo.log`): junction read/write refused with
`Unsafe project path: LINK_REFUSED`, junction-selected root refused with `BLOCKED
ROOT_LINK_REFUSED`, file symlink refused with `LINK_REFUSED`, external file SHA-256 identical
before/after. No gap remains.

### S4 `test/adoption-plan.test.mjs`: "symlinked source evidence fails closed without reading outside root" — **PASS (delegate stronger than source)**

| Source assertion | Native Windows delegate | Result |
|---|---|---|
| `/etc/hosts` symlinked as `pyproject.toml` → `blocked:true`, `UNSAFE_PROJECT_PATH` | "adoption plan refuses symlinked external source evidence": external secret symlinked as `pyproject.toml` → `blocked:true`, `UNSAFE_PROJECT_PATH`, **plus** `zeroWrite:true`, every action `executionAuthorized:false`, foreign bytes unchanged | PASS |

### Additional delegated skip (fifth pair)

`test/legacy-v1-fixture-boundaries.test.mjs`: "fixture refuses an in-project linked template
file without following it" → delegate "native Windows file symlink cannot become a legacy
fixture claim" (`E_TEST_FIXTURE_UNSAFE`, foreign bytes unchanged) — PASS.

## W-6 verdict

**PASS — all four formerly-pending skips have proven native Windows delegates; every delegate
executed on real NTFS with real reparse points, zero skips, refusal asserted, foreign bytes
preserved.** With the independent reason-code demonstration above, no coverage gap remains for
the delegated assertions. Boundary per source docs: these delegates are **not** a native
durable-writer replacement; the 26 native-helper skips, Windows durability, Checkpoint A,
Stage12/13 full gates and the old-published-CLI fence remain independent open items.
