# D-01 Windows-native evidence index (2026-10-09)

Host: native Windows 11 Home build 26200, Node v24.5.0, x64, NTFS (C: and D:), no elevation, no WSL.
Product HEAD under test: `d13de6be11d4c00b3350ccc23fb0708afb703000` (PR #96 head; fresh clone, clean tree).
Integration branch HEAD `1905671f0882ff40e4fc3f8997376541b0350a16` matches the task reference value and is a
merge child of the tested HEAD; every gate-relevant executable blob is identical at both HEADs.
Published package `vibe-coding-production@0.9.3`, SHA-256
`4b78fd413cf5e3508f5a5a34b5b47418d437eacd4343290f03b3ac5126ac9130`, SHA-512 equal to the registry
`dist.integrity` `sha512-Ielotp4W44vUq1YRqYuQlmC2ztopoQHLN8ypb6ymE8pvI3VCAfGYOIB7uYm9+Df7sMttN9bkznbOqP3iirzcTg==`.

Artifacts live under `%LOCALAPPDATA%\Temp\d01-win-20261009b` and `%LOCALAPPDATA%\Temp\d01-windows-20261009`.
No repository file was modified; no secret is contained in any artifact. Fixture scratch lived under
`<SCRATCH>` and is deleted. Receipts embed per-file SHA-256 before/after each protected run.

## Report

| File | SHA-256 |
|---|---|
| `D01-WINDOWS-NATIVE-SECURITY-REPORT.md` | `1f0369f435402a2d4bb5674fb93ce7393a660465b0e515173390851c2d8e0b2d` |

## Published-CLI 13-scenario POC (earlier run at this HEAD, same authenticated tarball)

| File | SHA-256 |
|---|---|
| `../d01-windows-20261009/d01-windows-20261009-061043.json` | `a077d078d04dcfd3ab3006a328927358cd16c5ec2a43b5f67e6e9264eeb8f6ba` |
| `../d01-windows-20261009/vibe-coding-production-0.9.3.tgz` | `4b78fd413cf5e3508f5a5a34b5b47418d437eacd4343290f03b3ac5126ac9130` |

## Adversarial pass 1 — locks, ownership, concurrency, crash, reparse

| File | SHA-256 |
|---|---|
| `adversarial-d01.mjs` | `0f0b7425598b6802db31d014bf199d72d20f5abe9627b6d54b8e5d41633a57c7` |
| `adversarial-receipt-run4.json` | `58990e807962f8e3daa3916a7be98701fe406a1476dd8849b62dac285cc45e5b` |
| `run4-stdout.log` | `9d34ebcbd6116ff82cfd2b10a3916dc97e173782841373eafd484845dc348e17` |
| `run4-stderr.log` | `5e7f9855d5b63949a91864a9d65153db5f7d7294457a0e91b4bda615fe7c3112` |

## Adversarial pass 2 — manifest x entrypoint matrix, sentinel aging, junctions, lock library

| File | SHA-256 |
|---|---|
| `adversarial-pass2.mjs` | `730875e09ca2c5170f5326c1e4a98e14976f2f880f680a151c93b5a450e42204` |
| `adversarial-pass2-receipt.json` | `515a22c41db196ded37961df289d6fa588a8876a0a7b612b3be22b88954e1ce1` |
| `pass2b-stdout.log` | `48dc43e6dc1688b700aca5bf579f8eae9170156a070f73d2bd357a0f789bcfdd` |
| `lockprobe.mjs` | `33d614d740a32bf1e7ad9a9387fb7d12e726cc5bc46ae9423595a3d7bd32aee4` |

## Reader-fence gap tests (G1-G4)

| File | SHA-256 |
|---|---|
| `gap-tests.mjs` | `0f7e8ebe6bfbe30ceb2331b5f82f4aaf36bc3ba1100dc6face2163ab1043a6e1` |
| `gap-out.json` | `ff516684ff2457779a424c47ab9e2b1967dc8b11845c19a319d69620bac4d318` |

## v2 journal follow test

| File | SHA-256 |
|---|---|
| `journal-follow-test.mjs` | `4a8442347268345f75d2ddc5b43ba979004c86e79712f3a12f8098e791d315f5` |
| `journal-follow-result.json` | `1210e2710782d64793a92a2c08471acf244bcd833b52284dd1341c39abb930af` |

## Windows signal semantics

| File | SHA-256 |
|---|---|
| `sigkill-probe.mjs` | `2002bf1b66ac878992dd4a74f8532178ffb5ea385c0e24b17071fd1f3ffda6f0` |
| `sigchild.js` | `1fe5d3bafc0f92a358ff70e5d41993b34eeed05b442267fde79b1326f9b06f74` |

## Harness self-verification

| File | SHA-256 |
|---|---|
| `harness-test.log` | `56a96c414694856355f420ab4b2a8294a1aa3610ad5ce2f4870617800d6e1f73` |
| `audit-windows.log` | `38699198edea034b575d5453fda807a76ab91ceb57eb831d1a5ddb39670d9ba8` |
| `audit-linux.log` | `e1a1f923f6d49893e0b0ce3380b3850cb2776d1b0e59078a413aff5eedf24dc0` |

## Authenticated package identity

| File | SHA-256 |
|---|---|
| `vcp-093.tgz` | `4b78fd413cf5e3508f5a5a34b5b47418d437eacd4343290f03b3ac5126ac9130` |
| `pkg.json` | `ebb1c5586277de7a24f9ae73e6105f22a968781b5ee42cda096cc7da52718f50` |

## Commands and exit codes actually run

| Command | Exit |
|---|---|
| `npm view vibe-coding-production@0.9.3 dist.integrity dist.tarball` | 0 |
| `certutil -hashfile vcp-093.tgz SHA256` and `SHA512` | 0 / 0 |
| `node scripts/poc-old-cli-fence.mjs --self-test` | 0 (`HARNESS_SELF_TEST_PASS`) |
| `node --test test/poc-old-cli-fence-harness.test.mjs` | 0 (3 pass, 0 fail) |
| `node scripts/poc-old-cli-fence.mjs --tarball ... --expected-integrity ... --scenario all --evidence ...` (earlier run) | 3 |
| `node adversarial-d01.mjs` (final pass) | 0, 16 tests recorded |
| `node adversarial-pass2.mjs` | 0, 14 matrix + 5 other tests |
| `node gap-tests.mjs` | 0 |
| `node journal-follow-test.mjs` | 0 (subject rollback exit 0) |
| `node lockprobe.mjs` | 0 |
| `node scripts/audit-d01-evidence.mjs <windows 13-scenario receipt>` | 3 (`receipt provenance or scenario count`) |
| `node scripts/audit-d01-evidence.mjs docs/evidence/.../linux-observations-20261009.json` | 2 |

## Decision state recorded by this evidence

`G-FENCE` remains `NO_GO`; `MANAGED_SCHEMA_MIGRATION_GATE` was not modified; no schema-v2 writer was
activated; no merge, push, tag or publish was performed. Technical recommendation for D-01: **NO-GO**.
Maintainer approval is a separate human decision.
