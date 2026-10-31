// P4-01 — Old-CLI (published VCP 0.9.3) hazard-exposure assessment.
//
// PURE CORE: this module performs zero I/O. It imports nothing from
// node:fs, never opens, reads, writes, renames, or executes anything,
// and never imports any writer, journal, recovery, lock, or command
// module. It maps a caller-supplied project-state descriptor to a
// per-entrypoint hazard report. The caller (the CLI reader) is
// responsible for building the descriptor with no-follow inspection;
// this module validates the descriptor defensively and treats any
// missing, mistyped, or unknown field as insufficient evidence.
//
// Verdict semantics (owner-authorized, Issue #111):
//   EXPOSED     — a matching evidence-established hazard class applies
//                 to this exact assessed state. It means the hazard
//                 class is real, NOT that this exact project is
//                 guaranteed to lose bytes.
//   NOT_EXPOSED — direct evidence, or the absence of the hazard's
//                 precondition, supports safety in this exact state.
//                 "No known hazard" is never treated as safety.
//   UNKNOWN     — the available evidence is insufficient to decide.
//                 UNKNOWN is explicitly NOT safe, and is reported as
//                 such on every verdict that carries it.
//
// H4 (concurrent old/new writers, PH-06) is UNKNOWN on every
// entrypoint: no exclusivity has been demonstrated for journal
// creation, and the lifecycle lock is the stated serialization
// mechanism, not a proof. H3 (interrupted/partial state) is UNKNOWN
// wherever the state is unsupported.

export const HAZARD_ENTRYPOINTS = Object.freeze([
  'init', 'update', 'manage', 'rollback'
]);

export const HAZARD_IDS = Object.freeze(['H1', 'H2', 'H3', 'H4', 'H5']);

// Evidence table. Every ID cites its source so a verdict's evidence
// list is checkable without trusting this module. The POC loss counts
// are aggregate records from the canonical D-01 program (master plan
// and Issue #109); this build did not re-run the published 0.9.3 CLI
// and does not claim a per-case breakdown it has not read.
export const HAZARD_EVIDENCE = Object.freeze({
  'EVID-D01-LINUX-POC': Object.freeze({
    id: 'EVID-D01-LINUX-POC',
    summary: 'Published VCP 0.9.3 loses post-backup user edits in 7 of 12 Linux POC cases (old init/update/manage/rollback entrypoints).',
    source: 'D-01 POC campaign, PR #89 evidence (Linux proof at 2e8e098, as recorded in the canonical master plan); Issue #109; scenario matrix lib/d01-linux-isolation-fixture.mjs D01_PUBLISHED_OLD_CLI_MATRIX (old-init-force, old-update, old-manage-ignore, old-manage-track, old-rollback).'
  }),
  'EVID-D01-WINDOWS-POC': Object.freeze({
    id: 'EVID-D01-WINDOWS-POC',
    summary: 'Published VCP 0.9.3 loses post-backup user edits in 8 of 13 native Windows POC cases; a directory-shaped update.lock does NOT fence old init --force when no manifest exists (proven counterexample).',
    source: 'D-01 POC campaign, Windows evidence branch 97110131 (as recorded in the canonical master plan); Issue #109; docs/decisions/D-01.json reopenConditions ("directory sentinel alone has a proven counterexample").'
  }),
  'EVID-D01-REOPEN': Object.freeze({
    id: 'EVID-D01-REOPEN',
    summary: 'D-01 reopen conditions require a complete compatibility fence for all published 0.9.3 entrypoints even with the manifest absent, plus atomic transition/lock ownership, concurrent old/new writer and crash/partial-journal recovery proofs, and byte-for-byte retention of post-backup user changes.',
    source: 'docs/decisions/D-01.json (status DEFERRED), reopenConditions.'
  }),
  'EVID-SC01-OD-STRAYS': Object.freeze({
    id: 'EVID-SC01-OD-STRAYS',
    summary: 'The check-to-open race was demonstrated at open granularity for update.lock and transaction.json: a marker can appear between the last eligibility observation and open(O_EXCL). The final check narrows the window; it does not atomically eliminate it.',
    source: 'VCP-SC01-OD-STRAYS-INDEPENDENT-ACCEPTANCE.md (candidate 03f40dd, 3,068 ladder trials, 2 demonstrated at-open races).'
  }),
  'EVID-PH06': Object.freeze({
    id: 'EVID-PH06',
    summary: 'PH-06 concurrent journal creation: two writers can both succeed (check-then-act between the previous-hash check and the rename). The lifecycle lock is the implementation\'s stated serialization mechanism; the PH-06 test passes only a test capability and no lock, so the race is reachable in exactly that mode.',
    source: 'lib/versioned-journal.mjs writeVersionedJournal (code reading); independent G3 observed both writers succeeding once; PH-06 remains UNRESOLVED.'
  })
});

const UNKNOWN_NOT_SAFE =
  'UNKNOWN is not safe: the available evidence is insufficient to decide. Do not treat this entrypoint as safe.';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function verdict(verdictValue, hazards, evidence, basis, reason, concurrencyNote = true) {
  const out = {
    verdict: verdictValue,
    hazards: Object.freeze([...hazards]),
    evidence: Object.freeze([...evidence]),
    basis,
    reason
  };
  if (concurrencyNote) {
    out.concurrency = Object.freeze({
      verdict: 'UNKNOWN',
      hazard: 'H4',
      evidence: Object.freeze(['EVID-PH06']),
      reason: 'Concurrent old/new writers have no demonstrated exclusivity (PH-06 UNRESOLVED). ' + UNKNOWN_NOT_SAFE
    });
  }
  return Object.freeze(out);
}

function normalizeDescriptor(input) {
  const d = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  const pick = (value, allowed, fallback) =>
    (typeof value === 'string' && allowed.includes(value)) ? value : fallback;
  return {
    root: isNonEmptyString(d.root) ? d.root : null,
    classification: pick(d.classification,
      ['NEW', 'EXISTING', 'MANAGED', 'BLOCKED'], 'UNKNOWN'),
    classificationReason: isNonEmptyString(d.classificationReason) ? d.classificationReason : null,
    rootLinked: d.rootLinked === true,
    manifest: pick(d.manifest,
      ['absent', 'present', 'not-regular'], 'unknown'),
    updateLock: pick(d.updateLock,
      ['absent', 'file', 'directory', 'symlink', 'other'], 'unknown'),
    transactionJson: pick(d.transactionJson,
      ['absent', 'file', 'directory', 'symlink', 'other'], 'unknown'),
    vcpDir: pick(d.vcpDir,
      ['absent', 'directory', 'symlink', 'other'], 'unknown'),
    rootManifestStray: d.rootManifestStray === true,
    userOwnedContentPresent: d.userOwnedContentPresent === true,
    userOwnedSignals: Array.isArray(d.userOwnedSignals)
      ? Object.freeze(d.userOwnedSignals.filter((s) => typeof s === 'string')) : Object.freeze([]),
    interruptedState: d.interruptedState === true,
    adoptionMarkersPresent: d.adoptionMarkersPresent === true
  };
}

function assessEntrypoint(name, d) {
  // Linked-root refusal takes precedence over every other rule: the
  // target was not assessed, so no entrypoint may be reported as safe
  // or as exposed on evidence about a different tree.
  if (d.rootLinked) {
    return verdict('UNKNOWN', ['H5'], ['EVID-D01-REOPEN'], 'no-evidence',
      'Not assessed: the selected root (or a parent component) is a symbolic link and was refused without being followed. Following it could reach an external target. ' + UNKNOWN_NOT_SAFE);
  }
  if (name === 'init') {
    if (d.manifest === 'absent' && d.userOwnedContentPresent) {
      const hazards = d.updateLock === 'directory' ? ['H1', 'H2'] : ['H1'];
      const evidence = ['EVID-D01-LINUX-POC', 'EVID-D01-WINDOWS-POC'];
      const reason = d.updateLock === 'directory'
        ? 'EXPOSED (H1/H2): no manifest exists, user-owned content is present, and update.lock is directory-shaped. The published 0.9.3 init --force hazard class applies, and a directory-shaped lock is a proven non-fence for old init --force with no manifest. This means the hazard class is established for this state, not that this exact project is guaranteed to lose bytes.'
        : 'EXPOSED (H1): no manifest exists and user-owned content is present. The published 0.9.3 init --force hazard class (loss of post-backup user edits) applies to this state. This means the hazard class is established for this state, not that this exact project is guaranteed to lose bytes.';
      return verdict('EXPOSED', hazards, evidence, 'poc-evidence', reason);
    }
    if (d.manifest === 'absent' && !d.userOwnedContentPresent) {
      return verdict('NOT_EXPOSED', [], [], 'precondition-absent',
        'No user-owned content exists in the assessed directory, so the documented loss class (loss of pre-existing user bytes) has no precondition here. Old init --force on an empty directory can only write VCP-owned files. This is a precondition argument, not a claim that old init is safe in general.');
    }
    // Manifest present (a regular file exists; its validity is carried
    // by the classification/reason, not re-derived here), not-regular,
    // or unknown: the POC loss counts are aggregate only, with no
    // per-case breakdown available to this build attributing a loss
    // or a safe outcome to this exact state. Do not guess.
    return verdict('UNKNOWN', [], ['EVID-D01-LINUX-POC', 'EVID-D01-WINDOWS-POC'], 'no-evidence',
      'Insufficient evidence: the manifest is present (or its state is unknown/malformed), and the POC loss counts are aggregate only. No per-case breakdown available to this build attributes a loss or a safe outcome to this exact state. ' + UNKNOWN_NOT_SAFE);
  }
  // update / manage / rollback
  if (d.manifest === 'absent' && !d.userOwnedContentPresent) {
    return verdict('NOT_EXPOSED', [], [], 'precondition-absent',
      'No manifest and no user-owned content exist: there is no VCP state to update, manage, or roll back, and no user bytes to lose. This is a precondition argument, not a claim that the old CLI is safe in general.');
  }
  if (d.interruptedState || d.rootManifestStray) {
    return verdict('UNKNOWN', ['H3'], ['EVID-D01-REOPEN'], 'no-evidence',
      'Insufficient evidence (H3): interrupted or stray recovery state is present. Unsupported states are UNKNOWN by rule. ' + UNKNOWN_NOT_SAFE);
  }
  if (d.manifest === 'absent') {
    return verdict('UNKNOWN', [], ['EVID-D01-LINUX-POC', 'EVID-D01-WINDOWS-POC'], 'no-evidence',
      'Insufficient evidence: no manifest exists, but user-owned content is present. The old update/manage/rollback path without a manifest is uncharacterized in the available POC evidence; do not assume it refuses. ' + UNKNOWN_NOT_SAFE);
  }
  return verdict('UNKNOWN', [], ['EVID-D01-LINUX-POC', 'EVID-D01-WINDOWS-POC', 'EVID-D01-REOPEN'], 'no-evidence',
    'Insufficient evidence: the POC loss counts are aggregate only, with no per-case breakdown available to this build attributing a loss or a safe outcome to this exact state for this entrypoint. ' + UNKNOWN_NOT_SAFE);
}

export function assessHazardExposure(input) {
  const d = normalizeDescriptor(input);
  const entrypoints = {};
  for (const name of HAZARD_ENTRYPOINTS) {
    entrypoints[name] = assessEntrypoint(name, d);
  }
  const hazards = [...new Set(HAZARD_ENTRYPOINTS.flatMap((n) => entrypoints[n].hazards))];
  const warnings = [];
  if (d.rootLinked) {
    warnings.push('Linked root refused (H5): the selected root or a parent component is a symbolic link. It was not followed. Assess the real target directly instead.');
  }
  if (entrypoints.init.verdict === 'EXPOSED') {
    warnings.push('Old VCP 0.9.3 init --force would expose this project to loss of post-backup user edits (H1' + (entrypoints.init.hazards.includes('H2') ? '/H2: directory-shaped update.lock does not fence old init --force' : '') + '). Evidence: EVID-D01-LINUX-POC, EVID-D01-WINDOWS-POC.');
  }
  if (d.interruptedState) {
    warnings.push('Interrupted or stray recovery state present (H3): update/manage/rollback exposure is UNKNOWN. Do not run the old CLI against this state.');
  }
  if (d.adoptionMarkersPresent) {
    warnings.push('Adoption markers (.vcp-adoption-*) are present; the new CLI treats this state as blocked. Old-CLI behavior in this state is UNKNOWN.');
  }
  for (const [name, shape] of [['.vcp', d.vcpDir], ['update.lock', d.updateLock], ['transaction.json', d.transactionJson]]) {
    if (shape === 'symlink') {
      warnings.push(`Linked marker present (${name} is a symbolic link): it was not followed. Old-CLI behavior with a linked ${name} is UNKNOWN.`);
    }
  }
  return Object.freeze({
    tool: 'vcp-hazard-exposure',
    version: 1,
    root: d.root,
    readOnly: true,
    classification: d.classification,
    classificationReason: d.classificationReason,
    access: Object.freeze({
      refused: d.rootLinked,
      reason: d.rootLinked ? 'ROOT_LINK_REFUSED' : null
    }),
    state: Object.freeze({
      manifest: d.manifest,
      updateLock: d.updateLock,
      transactionJson: d.transactionJson,
      vcpDir: d.vcpDir,
      rootManifestStray: d.rootManifestStray,
      userOwnedContentPresent: d.userOwnedContentPresent,
      userOwnedSignals: d.userOwnedSignals,
      interruptedState: d.interruptedState,
      adoptionMarkersPresent: d.adoptionMarkersPresent
    }),
    entrypoints: Object.freeze(entrypoints),
    hazards: Object.freeze(hazards),
    warnings: Object.freeze(warnings),
    limitations: Object.freeze([
      'EXPOSED means a matching evidence-established hazard class applies to this state, not that this exact project is guaranteed to lose bytes.',
      'NOT_EXPOSED is reported only where the hazard precondition is absent (no user-owned content) or direct evidence supports safety in the exact assessed state. "No known hazard" is never treated as safety.',
      'UNKNOWN is not safe. Every UNKNOWN verdict means the available evidence is insufficient; do not run the old CLI on the strength of an UNKNOWN.',
      'H4 (concurrent old/new writers) is UNKNOWN on every entrypoint: PH-06 is UNRESOLVED and no journal-creation exclusivity has been demonstrated.',
      'This diagnostic never executes the published 0.9.3 CLI, never writes to the assessed project, and never follows a symbolic link. A verdict describes the assessed state only; it says nothing about a state that changes afterwards.'
    ]),
    noWriteGuarantee: 'This diagnostic performs no writes; it only reads the target directory (lstat, no-follow).'
  });
}

export function formatHazardReportText(report) {
  const lines = [];
  lines.push(`VCP old-CLI 0.9.3 hazard exposure: ${report.root ?? '(unknown root)'}`);
  lines.push(`Classification: ${report.classification}${report.classificationReason ? ` (${report.classificationReason})` : ''}`);
  if (report.access.refused) {
    lines.push(`Access refused: ${report.access.reason}. The target was not followed and no entrypoint was assessed.`);
  }
  for (const name of HAZARD_ENTRYPOINTS) {
    const e = report.entrypoints[name];
    lines.push(`  ${name}: ${e.verdict}${e.hazards.length ? ` (${e.hazards.join(', ')})` : ''} — ${e.reason}`);
    if (e.evidence.length) lines.push(`    evidence: ${e.evidence.join(', ')}`);
    lines.push(`    concurrency (H4): UNKNOWN — no demonstrated exclusivity (PH-06 UNRESOLVED).`);
  }
  if (report.warnings.length) {
    lines.push('Warnings:');
    for (const w of report.warnings) lines.push(`  WARNING: ${w}`);
  }
  lines.push('UNKNOWN is not safe: an UNKNOWN verdict means the evidence is insufficient, never that the entrypoint is safe.');
  lines.push('No files written.');
  return lines.join('\n');
}
