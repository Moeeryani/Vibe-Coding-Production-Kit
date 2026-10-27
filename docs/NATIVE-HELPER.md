# Native helper: build, trust, and platform support

The Linux native helper (`scripts/native/vcp-linux-fsops`) performs the
anchored filesystem operations the Linux filesystem provider needs. It is
built locally from in-tree C++ source. There is no prebuilt binary download,
no Docker image, and no network step anywhere in this flow.

## Fresh-checkout setup

```sh
git clone <repo>
cd Vibe-Coding-Production-Kit
npm run setup:native-helper
```

That command checks prerequisites, builds the helper, writes the trust
manifest, and verifies the result. Verify-only mode:

```sh
npm run setup:native-helper -- --check
```

If the helper is missing or untrusted, anchored filesystem operations fail
closed with `E_NATIVE_HELPER_MISSING` or `E_NATIVE_HELPER_UNTRUSTED`. They
never silently fall back to an unanchored path. Re-run the setup command;
do not copy a helper binary from another machine.

## Prerequisites

- Linux (x64 or arm64). The setup script refuses any other platform.
- A C++ compiler (`c++`, C++17). Debian/Ubuntu: `sudo apt install g++`.
  Fedora: `sudo dnf install gcc-c++`. If no compiler is present, setup
  fails with that exact instruction and downloads nothing.
- Node.js (the version the project already requires).

The build is deterministic in the sense that matters: the same source, the
same compiler, and the same flags produce the same binary (the reference
binary hash in this repository's history is reproducible). Different compiler
versions may produce different bytes; that is fine, because the trust
manifest binds whatever was built on this machine (see below).

## Trust model

`scripts/native/vcp-linux-fsops.manifest.json` is written by the build and
records:

| Field | Meaning |
| --- | --- |
| `artifact` / `sourceFile` | Which helper, built from which source file. |
| `sourceSha256` | SHA-256 of the in-tree C++ source at build time. |
| `binarySha256` | SHA-256 of the built binary. |
| `platform` / `arch` | `linux` and the host architecture (for example `x64`). |
| `compiler` | Compiler identification string, for reproducibility notes. |
| `builtAtUtc` | Build timestamp. |

Every spawn re-verifies (`lib/native-helper-trust.mjs`): the binary must be
a regular, non-symlink, executable, non-world-writable file owned by root or
the process user; the manifest must be well-formed; the binary hash must
match the manifest; the in-tree source hash must match the manifest; and the
manifest's platform/arch must match the host. A manifest without platform
binding (written by an older build) is refused: rebuild it.

Stated residual: an actor who can consistently rewrite the binary, the
manifest, and the in-tree source (full install-tree write access) is outside
this threat model. There is no signed-release or external-hash trust root,
and none is pretended.

## Platform support statements

- **Linux: supported.** The helper in this document is the Linux helper.
  It is built by `npm run build:native-linux` (or the setup command) and
  shipped in the published tarball (see below).
- **Windows: not supported by this helper.** The Windows native helper is a
  separate candidate (`scripts/native/vcp-windows-fsops.cpp`), gated by
  D-01 and the deferred Windows security acceptance. Its principal provider
  is null. A Linux binary must never be presented as satisfying a Windows
  requirement, and a Windows executable must never be trusted as the Linux
  helper: the manifest platform binding refuses both directions.
- **Other platforms: unsupported.** The setup script refuses non-Linux
  hosts rather than building something untested.

## Packaging

The helper binary and its manifest are gitignored build artifacts ("never
committed"), but they ship in the published tarball: package.json `files`
lists `scripts/`, and `files` entries cannot be excluded by `.gitignore`.
`.npmignore` states the inclusion explicitly with negations and, more
importantly, explicitly excludes the Windows candidate artifacts, so a
locally built Windows executable can never leak into a tarball. `prepublishOnly` builds the helper before validation,
so a published tarball cannot silently omit it; if no compiler is present,
publishing fails instead of shipping a helper-less package. An installed
consumer runs the same verification as a development checkout and fails
closed if the helper is missing or tampered with.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `E_NATIVE_HELPER_MISSING` | No helper/manifest in the tree. | `npm run setup:native-helper` |
| `E_NATIVE_HELPER_UNTRUSTED`, platform/arch mismatch | Stale manifest, or a binary from another platform/arch. | Rebuild on this machine; never copy binaries across machines. |
| `E_NATIVE_HELPER_UNTRUSTED`, hash mismatch | Tampered binary, manifest, or source. | Rebuild from a trusted checkout; investigate the tampering. |
| Setup reports no compiler | `c++` not on PATH. | Install `g++` (see Prerequisites); no download fallback exists. |

## Related gates (unchanged)

D-01 remains DEFERRED, G-FENCE remains NO-GO, production writers remain
DISABLED, and the Windows security acceptance remains deferred. Nothing in
this document activates any of them.
