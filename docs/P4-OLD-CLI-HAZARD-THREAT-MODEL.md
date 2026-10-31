# P4-01 — Historical VCP 0.9.3 hazard-exposure diagnostic

**Scope:** native Linux; read-only metadata inspection of an explicitly selected project. This command does not run the old CLI, repair a project, create a lock, block a writer, or authorize any managed lifecycle operation. D-01=DEFERRED, G-FENCE=NO_GO, and all production-writing gates are unchanged.

## Evidence basis and hazard classes

| Class | Historical evidence | Diagnostic meaning |
|---|---|---|
| H1 | D-01 0.9.3 post-backup user-edit-loss reproductions, Linux 7/12 (PR #89, 2e8e098) and Windows 8/13 (97110131 evidence branch) | An AGENTS.md file with no root manifest.json matches a potentially exposed old init --force shape; metadata alone cannot prove post-backup edits. |
| H2 | D-01 Windows counterexample: directory-shaped root update.lock with absent manifest does not fence 0.9.3 init --force | Even a lock-looking root directory does not justify a safe classification. |
| H3 | F5/F5b interrupted/corrupted journal and rollback failures, incomplete recovery acceptance | update / rollback results stay UNKNOWN without a phase-specific independent proof. |
| H4 | PH-06 lock-free journal check/rename race; independently observed both-won | No generic conclusion for an old-CLI entrypoint or specific project: UNKNOWN. |
| H5 | D-03 linked-root refusal (ROOT_LINK) | A linked directory component is not traversed and all entrypoint verdicts remain UNKNOWN. |

EXPOSED means an evidence-backed *hazard class* matches the inspected metadata, **not** a prediction of certain data loss. NOT_EXPOSED requires independent evidence for precisely the assessed state; P4-01 deliberately does **not** issue this verdict based on absence of indicators. UNKNOWN is never safe. Every entrypoint (init, update, manage, rollback) has an explicit verdict; H4 is tracked separately because its applicability is not established.

## Inspection and limits

The assessor is pure (descriptor to result). The CLI inventory uses lstat, not reads of project-file contents. The inventory rejects any symlink in the selected path's components without traversing it; entry symlinks are observed as symlinks. The root identity is compared before and after fixed-name metadata observations. These userland checks are **not** atomic against concurrent root replacement, and do not constitute race-free sandboxing. Do not run it on untrusted concurrently mutable namespaces with an expectation of path confinement. For unreadable/non-directory targets the CLI fails closed with E_HAZARD_READ_FAILED and exit 1.

No 0.9.3 code is executed; no new write, migration, lock, journal, rollback, managed recovery, production-writer, Windows, or CI action is enabled. Results are diagnostic only and cannot serve as a green security or release gate.
