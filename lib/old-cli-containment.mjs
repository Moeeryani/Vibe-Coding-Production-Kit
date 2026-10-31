// P4-02b — Old-CLI (published VCP 0.9.3) containment gate.
//
// PURE CORE: this module performs zero I/O. It imports nothing from
// node:fs, never opens, reads, writes, renames, or executes anything,
// and never imports any writer, journal, recovery, lock, or command
// module. It maps a caller-supplied containment request — a requested
// managed operation, a scope, a P4-01 hazard report (version 2), and a
// managed-state descriptor — to a single decision.
//
// Decision semantics (Issue #113; P4 design, ~/workspace/vcp-p4-full/design.md):
//   REFUSE               — the operation must not proceed. The decision
//                          names the blocking rule and the evidence.
//                          This is the default: anything unrecognized,
//                          partially known, or unsupported refuses.
//   ALLOW_UNDER_TEST_ONLY — the operation may proceed ONLY inside an
//                          explicitly authorized disposable-test fixture
//                          (the controlled writer lane), with the listed
//                          residual risks accepted for that fixture.
//                          This is NOT a safety verdict about the old
//                          CLI: it records that the hazard report shows
//                          no PROVEN loss for this operation, the fixture
//                          is disposable, and the old CLI is not running
//                          concurrently. UNKNOWN stays UNKNOWN in the
//                          underlying report.
//
// There is NO allow-production outcome in this module. Any scope other
// than 'disposable-test' refuses (rule G0). D-01 is DEFERRED, G-FENCE
// is NO_GO, and production writers are DISABLED; this gate cannot
// authorize a production managed write under any input.
//
// H4 (concurrent old/new writers, PH-06) is a residual risk on every
// ALLOW_UNDER_TEST_ONLY, never a refusal in test scope: the test
// scope runs a single writer by construction and the old CLI is not
// running concurrently in the fixture. In production scope everything
// refuses via G0 regardless. H4 is never upgraded to safe.

export const CONTAINMENT_OPERATIONS = Object.freeze([
  'init', 'update', 'manage', 'rollback'
]);

export const CONTAINMENT_VERSION = 1;

const UNKNOWN_NOT_SAFE =
  'UNKNOWN is not safe: the available evidence is insufficient to decide. Do not treat this entrypoint as safe.';

const RESIDUAL_RISKS = Object.freeze([
  'H4/PH-06: concurrent old/new writer exclusivity is UNRESOLVED; this decision holds only because the disposable-test scope runs a single writer and the old CLI is not running concurrently in the fixture.',
  'Crash/power-loss windows are unproven (B-2 NOT_PROVEN; PH-06 UNRESOLVED). An interrupted test operation leaves the fixture in the OD-4 blocked/manual-recovery contract.',
  'Same-UID old CLI: no in-project mechanism can stop the published 0.9.3 CLI run by the project owner (P4_CONTAINMENT_BLOCKED for that principal). This decision holds only because the old CLI is not invoked in the fixture.',
  'No Windows proof: this decision is Linux-only (P6). No MAC confinement proof: SELinux/AppArmor enforcement of the legacy binary is unproven in this sandbox.',
  'ALLOW_UNDER_TEST_ONLY is not a production authorization and not a safety verdict about the old CLI. The underlying hazard report still carries UNKNOWN wherever the evidence is insufficient.'
]);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function normalizeManaged(input) {
  const m = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  const pick = (value, allowed) =>
    (typeof value === 'string' && allowed.includes(value)) ? value : 'unknown';
  return {
    manifest: pick(m.manifest,
      ['absent', 'present-v1', 'present-v2', 'not-regular', 'unknown']),
    journal: pick(m.journal, ['absent', 'clean', 'partial', 'unknown']),
    lock: pick(m.lock,
      ['absent', 'file', 'directory', 'symlink', 'other', 'unknown']),
    isEmptyDir: m.isEmptyDir === true
  };
}

function normalizeHazard(input) {
  const h = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  const entrypoints = {};
  for (const name of CONTAINMENT_OPERATIONS) {
    const e = (h.entrypoints && typeof h.entrypoints === 'object' &&
      !Array.isArray(h.entrypoints)) ? h.entrypoints[name] : null;
    entrypoints[name] = {
      verdict: (e && typeof e.verdict === 'string') ? e.verdict : 'UNKNOWN',
      hazards: Array.isArray(e?.hazards)
        ? e.hazards.filter((x) => typeof x === 'string') : [],
      evidence: Array.isArray(e?.evidence)
        ? e.evidence.filter((x) => typeof x === 'string') : []
    };
  }
  const s = (h.state && typeof h.state === 'object' && !Array.isArray(h.state))
    ? h.state : {};
  const shape = (value, allowed) =>
    (typeof value === 'string' && allowed.includes(value)) ? value : 'unknown';
  return {
    version: h.version,
    rootLinked: h.access?.refused === true || s.rootLinked === true,
    entrypoints,
    state: {
      interruptedState: s.interruptedState === true,
      rootManifestStray: s.rootManifestStray === true,
      adoptionMarkersPresent: s.adoptionMarkersPresent === true,
      transactionJson: shape(s.transactionJson,
        ['absent', 'file', 'directory', 'symlink', 'other']),
      updateLock: shape(s.updateLock,
        ['absent', 'file', 'directory', 'symlink', 'other'])
    }
  };
}

// An H3 trigger in the hazard state: interrupted, stray, or abnormal
// recovery/lock state. Mirrors the P4-01 H3 definition (threat-model
// rule 3): a root transaction.json in any non-absent shape is a stray
// recovery file; a non-file update.lock is a root lock stray.
function h3Triggers(state) {
  const found = [];
  if (state.interruptedState) found.push('interrupted state');
  if (state.rootManifestStray) found.push('root manifest.json stray');
  if (state.adoptionMarkersPresent) found.push('adoption markers (.vcp-adoption-*)');
  if (state.transactionJson !== 'absent') {
    found.push(`transaction.json at the root is ${state.transactionJson}`);
  }
  if (['directory', 'symlink', 'other'].includes(state.updateLock)) {
    found.push(`update.lock is ${state.updateLock}`);
  }
  return found;
}

function refuse({ operation, scope, code, reasons, evidence, managed, hazard }) {
  return Object.freeze({
    tool: 'vcp-containment',
    version: CONTAINMENT_VERSION,
    operation,
    scope,
    decision: 'REFUSE',
    code,
    reasons: Object.freeze([...reasons]),
    evidence: Object.freeze([...evidence]),
    blockers: Object.freeze([...reasons]),
    residualRisks: Object.freeze([]),
    hazard: Object.freeze({
      entrypointVerdict: hazard.entrypoints[operation]?.verdict ?? 'UNKNOWN',
      entrypointHazards: Object.freeze([...(hazard.entrypoints[operation]?.hazards ?? [])]),
      entrypointEvidence: Object.freeze([...(hazard.entrypoints[operation]?.evidence ?? [])])
    }),
    managed: Object.freeze({ ...managed }),
    noWriteGuarantee: 'This diagnostic performs no writes; it only reads the target directory (lstat, no-follow).'
  });
}

function allowUnderTest({ operation, scope, reasons, managed, hazard }) {
  return Object.freeze({
    tool: 'vcp-containment',
    version: CONTAINMENT_VERSION,
    operation,
    scope,
    decision: 'ALLOW_UNDER_TEST_ONLY',
    code: null,
    reasons: Object.freeze([...reasons]),
    evidence: Object.freeze([
      ...new Set([
        ...(hazard.entrypoints[operation]?.evidence ?? []),
        'EVID-PH06', 'EVID-D01-REOPEN'
      ])
    ]),
    blockers: Object.freeze([]),
    residualRisks: RESIDUAL_RISKS,
    hazard: Object.freeze({
      entrypointVerdict: hazard.entrypoints[operation]?.verdict ?? 'UNKNOWN',
      entrypointHazards: Object.freeze([...(hazard.entrypoints[operation]?.hazards ?? [])]),
      entrypointEvidence: Object.freeze([...(hazard.entrypoints[operation]?.evidence ?? [])])
    }),
    managed: Object.freeze({ ...managed }),
    noWriteGuarantee: 'This diagnostic performs no writes; it only reads the target directory (lstat, no-follow).'
  });
}

export function assessContainment(input) {
  const req = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  const operation = isNonEmptyString(req.operation) ? req.operation : null;
  const scope = isNonEmptyString(req.scope) ? req.scope : null;
  const hazard = normalizeHazard(req.hazardReport);
  const managed = normalizeManaged(req.managedState);
  const base = { operation, scope, managed, hazard };

  // Malformed request: no operation, or an unknown operation. Fail
  // closed — a decision for an operation that cannot be named is a
  // refusal, never an allow.
  if (!CONTAINMENT_OPERATIONS.includes(operation)) {
    return refuse({
      ...base,
      code: 'E_CONTAINMENT_UNKNOWN_OPERATION',
      reasons: ['REFUSE: the requested operation is missing or not one of init/update/manage/rollback. Fail-closed default.'],
      evidence: ['EVID-D01-REOPEN']
    });
  }
  // The gate only trusts P4-01 report version 2 semantics (NOT_EXPOSED
  // retired, H1 keys on the AGENTS.md signal, H3 covers stray/abnormal
  // states). An older or unrecognized report version cannot support a
  // decision.
  if (hazard.version !== 2) {
    return refuse({
      ...base,
      code: 'E_CONTAINMENT_STALE_HAZARD_REPORT',
      reasons: [`REFUSE: the hazard report is not version 2 (got ${hazard.version ?? 'missing'}). Only P4-01 report version 2 semantics are trusted by this gate.`],
      evidence: ['EVID-D01-REOPEN']
    });
  }
  // G0: production (or any non-test scope) always refuses. There is
  // no allow-production outcome in this module.
  if (scope !== 'disposable-test') {
    return refuse({
      ...base,
      code: 'E_CONTAINMENT_PRODUCTION_REFUSED',
      reasons: ['REFUSE: production scope (or an unrecognized scope) is never allowed by this gate. D-01 is DEFERRED, G-FENCE is NO_GO, production writers are DISABLED. Only an explicitly authorized disposable-test fixture may proceed, and only under test.'],
      evidence: ['EVID-D01-REOPEN']
    });
  }
  // G1: a proven hazard for the requested entrypoint refuses.
  const entry = hazard.entrypoints[operation];
  if (entry.verdict === 'EXPOSED') {
    const ev = entry.evidence.length ? entry.evidence.join(', ') : 'EVID-D01-LINUX-POC';
    return refuse({
      ...base,
      code: 'E_CONTAINMENT_HAZARD_EXPOSED',
      reasons: [`REFUSE: the hazard report marks ${operation} EXPOSED (${entry.hazards.join(', ') || 'hazard class'}). The published 0.9.3 CLI hazard class is established for this state. Evidence: ${ev}.`],
      evidence: [...entry.evidence]
    });
  }
  // G2: a linked root or parent refuses (OD-3 ROOT_LINK refusal).
  if (hazard.rootLinked) {
    return refuse({
      ...base,
      code: 'E_CONTAINMENT_LINKED_ROOT',
      reasons: ['REFUSE: the selected root (or a parent component) is a symbolic link and was refused without being followed (H5, OD-3). The real target must be assessed directly.'],
      evidence: ['EVID-D01-REOPEN']
    });
  }
  // G3: any H3 trigger (interrupted/stray/abnormal state) refuses
  // (OD-4 fail-closed / manual recovery).
  const triggers = h3Triggers(hazard.state);
  if (triggers.length) {
    return refuse({
      ...base,
      code: 'E_CONTAINMENT_INTERRUPTED_STATE',
      reasons: [`REFUSE: interrupted, stray, or abnormal recovery/lock state is present (H3): ${triggers.join('; ')}. Unsupported states are UNKNOWN by rule and fail closed (OD-4).`],
      evidence: ['EVID-D01-REOPEN']
    });
  }
  // G4: managed-state failures refuse.
  if (managed.manifest === 'not-regular' || managed.manifest === 'unknown') {
    return refuse({
      ...base,
      code: 'E_CONTAINMENT_MANIFEST_UNREADABLE',
      reasons: [`REFUSE: the managed manifest is ${managed.manifest} (malformed, non-regular, or unreadable). Its state cannot be established, so the operation fails closed.`],
      evidence: ['EVID-D01-REOPEN']
    });
  }
  if ((operation === 'update' || operation === 'manage' || operation === 'rollback') &&
      managed.manifest === 'absent') {
    return refuse({
      ...base,
      code: 'E_CONTAINMENT_MANIFEST_ABSENT',
      reasons: [`REFUSE: ${operation} requires a managed manifest and none exists. The old ${operation} path without a manifest is uncharacterized; do not assume it refuses.`],
      evidence: ['EVID-D01-LINUX-POC', 'EVID-D01-WINDOWS-POC']
    });
  }
  if (managed.manifest === 'present-v1') {
    return refuse({
      ...base,
      code: 'E_CONTAINMENT_LEGACY_MANIFEST',
      reasons: [`REFUSE: the managed manifest is schema v1. A v2 lifecycle operation on a v1 project is the D-01-deferred migration; it is not authorized by this gate.`],
      evidence: ['EVID-D01-REOPEN']
    });
  }
  if (managed.journal === 'partial' || managed.journal === 'unknown') {
    return refuse({
      ...base,
      code: 'E_CONTAINMENT_JOURNAL_NOT_CLEAN',
      reasons: [`REFUSE: the managed journal is ${managed.journal} (in-flight, interrupted, unparseable, or unreadable). A transaction is outstanding or its state cannot be established; the operation fails closed (OD-4).`],
      evidence: ['EVID-D01-REOPEN']
    });
  }
  if (['directory', 'symlink', 'other', 'unknown'].includes(managed.lock)) {
    return refuse({
      ...base,
      code: 'E_CONTAINMENT_LOCK_ABNORMAL',
      reasons: [`REFUSE: the managed lifecycle lock (.vcp/update.lock) is ${managed.lock} (abnormal shape or unreadable). The lock state cannot be established, so the operation fails closed.`],
      evidence: ['EVID-D01-REOPEN']
    });
  }
  // G6: no refusal above. The operation may proceed ONLY inside the
  // authorized disposable-test fixture, with the residual risks
  // accepted for that fixture. H4 (concurrency) is a residual risk,
  // never a refusal in test scope: the test runs a single writer and
  // the old CLI is not running concurrently in the fixture.
  const reasons = [
    `ALLOW_UNDER_TEST_ONLY: no proven hazard for ${operation} in the hazard report (${entry.verdict}), no H3 trigger, and the managed state is clean (manifest ${managed.manifest}, journal ${managed.journal}, lock ${managed.lock}). The operation may proceed ONLY inside the explicitly authorized disposable-test fixture, under the controlled writer lane. ${UNKNOWN_NOT_SAFE} — the underlying hazard report still carries UNKNOWN wherever the evidence is insufficient.`
  ];
  if (operation === 'init' && !managed.isEmptyDir) {
    reasons.push('Init target is not empty: the new CLI init path never performs a destructive --force overwrite (it is disabled; existing repositories go through explicit Stage13 adoption). The fixture is disposable; user bytes in it are test data only.');
  }
  return allowUnderTest({ ...base, reasons });
}

export function formatContainmentDecisionText(decision) {
  const lines = [];
  lines.push(`VCP old-CLI 0.9.3 containment: ${decision.operation} — ${decision.decision}`);
  lines.push(`Scope: ${decision.scope}`);
  for (const r of decision.reasons) lines.push(`  ${r}`);
  if (decision.evidence.length) lines.push(`  evidence: ${decision.evidence.join(', ')}`);
  if (decision.code) lines.push(`  code: ${decision.code}`);
  if (decision.residualRisks.length) {
    lines.push('Residual risks (accepted for the disposable-test fixture only):');
    for (const r of decision.residualRisks) lines.push(`  - ${r}`);
  }
  lines.push('No files written.');
  return lines.join('\n');
}
