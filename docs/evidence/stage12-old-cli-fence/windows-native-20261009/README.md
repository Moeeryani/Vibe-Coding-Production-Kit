# D-01 Windows-native security proof — evidence set (2026-10-09)

Technical result recorded here: **NO-GO**. `G-FENCE` remains `NO_GO` and decision **D-01 remains
DEFERRED**. Nothing in this directory is a human approval, and no migration, merge, publish or gate
change was performed to produce it.

## What was proven on

| Item | Value |
|---|---|
| OS | Windows 11 Home, `NT 10.0.26200` (build 26200), native — not WSL, no elevation |
| Node / npm / Git | `v24.5.0` (`win32`/`x64`) / `11.5.2` / `2.49.0.windows.1` |
| Filesystems exercised | NTFS on two fixed volumes |
| Product HEAD | `d13de6be11d4c00b3350ccc23fb0708afb703000` (PR #96 head, fresh clone, clean tree) |
| Integration HEAD | `1905671f0882ff40e4fc3f8997376541b0350a16` — merge child of the tested HEAD; all gate-relevant blobs identical at both |
| Subject CLI | published `vibe-coding-production@0.9.3`, SHA-256 `4b78fd413cf5e3508f5a5a34b5b47418d437eacd4343290f03b3ac5126ac9130`, SHA-512 equal to registry `dist.integrity`, freshly downloaded and verified on this host |

Every destructive test ran in a disposable temporary project. No real repository, no working git tree,
and no installed package was modified.

## Files

| File | Role |
|---|---|
| `D01-WINDOWS-NATIVE-SECURITY-REPORT.md` | Full report: environment, provenance, 13-scenario POC results, adversarial results, D-01 answers, remediation, residual risk, classification |
| `EVIDENCE-INDEX.md` | SHA-256 of each artifact plus the exact commands and exit codes |
| `d01-windows-20261009-061043.json` | Published-CLI POC receipt, 13/13 scenarios, `gate=NO_GO__LEGACY_MUTATION_DEMONSTRATED`, process exit 3 |
| `adversarial-d01.mjs` / `adversarial-receipt-run4.json` / `run*` records are in the index | Lock-state, ownership, concurrency, crash and reparse-point harness and its receipt |
| `adversarial-pass2.mjs` / `adversarial-pass2-receipt.json` | Manifest × entrypoint matrix (14 runs), sentinel aging, junction/symlink probes, lock-library probe |
| `gap-tests.mjs` / `gap-out.json` | G1–G4: reader-fence and lock-blind-`init` tests |
| `journal-follow-test.mjs` / `journal-follow-result.json` | Proof that `rollback` follows a v2 journal and destroys it |
| `lockprobe.mjs` | `acquireLifecycleLock` / `syncContainingDirectory` on Windows → `E_DIRECTORY_SYNC_UNPROVEN` (`EPERM`) |
| `sigkill-probe.mjs` | Windows `SIGKILL` = `TerminateProcess` semantics |

## Sanitization

Machine-specific strings were replaced with placeholders before publishing: `<WIN-TEMP>`, `<HOME>`,
`<REPO-CLONE>`, `<SCRATCH>`/`<SCRATCH-ROOT>`, `<HOST>`, `<USER>`, `<MSYS-HOME>`. Only the standard
`C:\Users` prefix remains, which carries no account name. Hashes quoted in the report and index refer to
the **original** local artifacts; these sanitized copies therefore hash differently by design. Raw
unsanitized logs were never committed and contain no secrets.

## Reading order

Report → index (commands/exit codes) → POC receipt → adversarial receipts. Start with §6 and §5.3b: the
Windows durability gap and the journal-follow result are the two findings that most change the shape of
the remaining D-01 work.
