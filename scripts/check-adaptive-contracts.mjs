#!/usr/bin/env node
// Offline editorial guard. This is not a maintainer approval or a remote merge gate.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const paths = {
  register: 'docs/ADAPTIVE-VCP-DECISIONS.md',
  S: 'docs/ADAPTIVE-VCP-IMPLEMENTATION-PLAN.md',
  T: 'docs/ADAPTIVE-VCP-CODE-INTEGRATION-ANALYSIS.md'
};
// These are regression anchors, NOT an exhaustive audit of every normative clause.
// Anchor derivation (independent map, 2026-10-09): each token was verified to sit
// in normative S/T text for its correction, not in examples or passing mentions:
//  C-01 G-FENCE ................ old-CLI fence open decision + POC gate (S §3.5, T §4.8)
//  C-02 installHealth.checks ... Doctor-minimum split + D-02 strict truth table
//  C-03 re-screen .............. v1→v2 migration MUST re-screen adopted commands (not just the verify--run boundary)
//  C-04 content digest ......... fingerprint is SHA-256 over resolved guidance bytes, package version excluded
//  C-05 [a-z0-9-]{1,64} ........ normative marker ID grammar (example presence alone proves nothing)
//  C-06 CLAIM .................. init action vocabulary + versioned plan JSON
//  C-07 E_ASSETSET_UNKNOWN ..... fail-closed unknown assetSet before mutation
//  C-08 INERT_MANIFEST_FIELDS .. reader-guard allowlist (minimumReaderVersion/default-raise/enumeration nearby)
//  C-09 assetSet-aware ......... prompt resolver takes assetSet (bare 'assetSet' passes trivially)
//  C-10 T §14.9 / relevant worktree ... S normatively cites T §14.9 as authoritative
//  C-11 safePath ................ single hardened path helper (three copies consolidated)
//  C-12 Dependency order ....... normative intra-Stage-12 implementation order
//  C-13 docs/ADAPTIVE-VCP-DECISIONS.md ... canonical registry cited from both docs
//  C-14 (forbidden \\bA15\\b) .. hygiene: the phantom amendment ID must never reappear
//     in either normative doc (positive 'historical' matched 18/19 unrelated hits).
const contractAnchors = [
  ['C-01', 'G-FENCE', 'G-FENCE'],
  ['C-02', 'installHealth.checks', 'installHealth.checks'],
  ['C-03', 're-screen', 're-screen'],
  ['C-04', 'content digest', 'content digest'],
  ['C-05', '[a-z0-9-]{1,64}', '[a-z0-9-]{1,64}'],
  ['C-06', 'CLAIM', 'CLAIM'],
  ['C-07', 'E_ASSETSET_UNKNOWN', 'E_ASSETSET_UNKNOWN'],
  ['C-08', 'INERT_MANIFEST_FIELDS', 'INERT_MANIFEST_FIELDS'],
  ['C-09', 'assetSet-aware', 'assetSet-aware'],
  ['C-10', 'T §14.9', 'relevant worktree'],
  ['C-11', 'safePath', 'safePath'],
  ['C-12', 'Dependency order', 'Dependency order'],
  ['C-13', paths.register, paths.register],
  ['C-14', null, null],
];
// Tokens that must NOT appear in either normative doc. C-14 is a hygiene
// correction (dangling refs, the A15→A12 slip); its regression mode is
// reintroduction, so it is guarded negatively.
const forbiddenAnchors = [
  ['C-14', /\bA15\b/],
];

export function parseRegister(markdown) {
  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\|\s*(D-\d{2})\s*\|\s*\*\*(PROPOSED|ACCEPTED|DEFERRED|REJECTED)\*\*\s*\|/);
    if (match) rows.push({ id: match[1], status: match[2] });
  }
  return rows;
}

function sectionText(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === heading);
  if (start < 0 || !/^#{1,6} /.test(heading)) return null;
  const level = heading.match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const candidate = lines[i].match(/^(#{1,6}) /);
    if (candidate && candidate[1].length <= level) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function safeDocPath(relative) {
  return typeof relative === 'string'
    && /^docs\/[a-zA-Z0-9/_-]+\.md$/.test(relative)
    && !relative.split('/').includes('..');
}

export function evaluateStatic({ register, S, T }) {
  const errors = [];
  const rows = parseRegister(register);
  const counts = new Map();
  for (const item of rows) counts.set(item.id, (counts.get(item.id) || 0) + 1);
  for (let number = 1; number <= 12; number++) {
    const id = 'D-' + String(number).padStart(2, '0');
    if (counts.get(id) !== 1) errors.push(id + ': expected one canonical row');
  }
  for (const id of counts.keys()) {
    if (!/^D-(0[1-9]|1[0-2])$/.test(id)) errors.push('Unknown decision ID: ' + id);
    if (counts.get(id) !== 1) errors.push('Duplicate decision row: ' + id);
  }
  for (const [id, anchorS, anchorT] of contractAnchors) {
    if (anchorS !== null && !S.includes(anchorS)) errors.push(id + ': missing S regression anchor');
    if (anchorT !== null && !T.includes(anchorT)) errors.push(id + ': missing T regression anchor');
  }
  for (const [id, pattern] of forbiddenAnchors) {
    if (pattern.test(S)) errors.push(id + ': forbidden token reappeared in S: ' + pattern);
    if (pattern.test(T)) errors.push(id + ': forbidden token reappeared in T: ' + pattern);
  }
  const statuses = ['PROPOSED', 'ACCEPTED', 'DEFERRED', 'REJECTED'];
  const byStatus = Object.fromEntries(statuses.map(status => [
    status.toLowerCase(), rows.filter(row => row.status === status).map(row => row.id)
  ]));
  return { errors, ...byStatus,
    checkedContractAnchors: contractAnchors.length, decisionCount: rows.length };
}

// An accepted record does not get to define its own completeness boundary.
// The independent map is maintained and reviewed separately from record JSON.
export function checkRequiredCoverage(id, declaredLocations, inventory) {
  const errors = [];
  const spec = inventory?.decisions?.[id];
  if (!spec || !Array.isArray(spec.anchors) || spec.anchors.length === 0) {
    return [id + ': no independently declared required-anchor map (fail closed)'];
  }
  if (spec.coverageReview !== 'APPROVED') {
    errors.push(id + ': independent anchor map is NOT maintainer-reviewed (coverageReview must be APPROVED)');
  }
  if (!Array.isArray(declaredLocations)) {
    return [...errors, id + ': acceptance affectedLocations must be an array'];
  }
  const identities = new Set();
  for (const item of declaredLocations) {
    const key = typeof item?.path === 'string' && typeof item?.heading === 'string'
      ? item.path + '\0' + item.heading : null;
    if (key === null) continue;
    if (identities.has(key)) errors.push(id + ': duplicate declared anchor: ' + item.path + ' / ' + item.heading);
    identities.add(key);
  }
  const expectedIdentities = new Set();
  for (const anchor of spec.anchors) {
    if (!anchor || !safeDocPath(anchor.path) || typeof anchor.heading !== 'string' ||
        !/^#{1,6} /.test(anchor.heading) ||
        typeof anchor.requiredText !== 'string' || !anchor.requiredText.trim()) {
      errors.push(id + ': invalid independently required anchor entry');
      continue;
    }
    const key = anchor.path + '\0' + anchor.heading;
    if (expectedIdentities.has(key)) errors.push(id + ': duplicate required anchor: ' + anchor.path + ' / ' + anchor.heading);
    expectedIdentities.add(key);
    const matches = declaredLocations.filter(item => item?.path === anchor.path && item?.heading === anchor.heading);
    if (matches.length !== 1) {
      errors.push(id + ': required anchor omitted or repeated: ' + anchor.path + ' / ' + anchor.heading);
    } else if (matches[0].requiredText !== anchor.requiredText) {
      errors.push(id + ': accepted record differs from independently required clause: ' + anchor.path + ' / ' + anchor.heading);
    }
  }
  return errors;
}

export async function verifyAcceptedRecord(id, inventory, repositoryRoot = root) {
  const filepath = path.join(repositoryRoot, 'docs', 'decisions', id + '.json');
  let record;
  try { record = JSON.parse(await readFile(filepath, 'utf8')); }
  catch { return [id + ': ACCEPTED requires parseable docs/decisions/' + id + '.json']; }
  const errors = [];
  for (const field of ['owner', 'decidedAtUtc', 'chosenOption', 'rationale', 'implementationPR']) {
    if (typeof record[field] !== 'string' || !record[field].trim() || /^(pending|todo|tbd)$/i.test(record[field].trim())) {
      errors.push(id + ': missing acceptance field ' + field);
    }
  }
  if (record.id !== id || record.status !== 'ACCEPTED') errors.push(id + ': incorrect accepted record identity');
  if (!Number.isFinite(Date.parse(record.decidedAtUtc)) || !/(Z|[+-]\d\d:\d\d)$/.test(record.decidedAtUtc)) {
    errors.push(id + ': decidedAtUtc must include a time zone');
  }
  if (!Array.isArray(record.provingTests) || !record.provingTests.length ||
      record.provingTests.some(x => typeof x !== 'string' || !x.trim())) {
    errors.push(id + ': provingTests must list concrete evidence IDs');
  }
  errors.push(...checkRequiredCoverage(id, record.affectedLocations, inventory));
  if (!Array.isArray(record.affectedLocations) || !record.affectedLocations.length) {
    errors.push(id + ': affectedLocations must have concrete documentation anchors');
    return errors;
  }
  for (const entry of record.affectedLocations) {
    if (!entry || !safeDocPath(entry.path) || typeof entry.heading !== 'string' ||
        typeof entry.requiredText !== 'string' || !entry.requiredText.trim()) {
      errors.push(id + ': invalid affected location entry');
      continue;
    }
    let data;
    try { data = await readFile(path.join(repositoryRoot, entry.path), 'utf8'); }
    catch { errors.push(id + ': cannot read ' + entry.path); continue; }
    const section = sectionText(data, entry.heading);
    if (!section || !section.includes(entry.requiredText) || !section.includes(id) ||
        entry.requiredText.trim() === id) {
      errors.push(id + ': missing accepted-ID and substantive clause at ' + entry.path + ' / ' + entry.heading);
    }
  }
  return errors;
}

async function main() {
  if (process.argv.length !== 2) throw new Error('No arguments accepted: offline repository guard only');
  const [register, S, T] = await Promise.all(
    [paths.register, paths.S, paths.T].map(p => readFile(path.join(root, p), 'utf8'))
  );
  const summary = evaluateStatic({ register, S, T });
  // No accepted ID can pass with a missing, unreviewed or self-declared-only map.
  let inventory;
  try {
    inventory = JSON.parse(await readFile(path.join(root, 'docs/decisions/required-anchors.json'), 'utf8'));
  } catch (error) {
    console.error('DOC-CONTRACT-FAIL Cannot load required-anchor inventory: ' + error.message);
    process.exitCode = 1;
    return;
  }
  if (inventory?.schemaVersion !== 1 || !inventory.decisions || Array.isArray(inventory.decisions)) {
    console.error('DOC-CONTRACT-FAIL Invalid independent required-anchor inventory');
    process.exitCode = 1;
    return;
  }
  for (const id of summary.accepted) summary.errors.push(...await verifyAcceptedRecord(id, inventory));
  if (summary.errors.length) {
    for (const issue of summary.errors) console.error('DOC-CONTRACT-FAIL ' + issue);
    process.exitCode = 1;
  } else {
    console.log('DOC-CONTRACT-STATIC-PASS: ' + summary.checkedContractAnchors + ' focused anchors, ' +
      summary.decisionCount + ' uniquely registered decisions');
    console.log('PROPOSED=' + summary.proposed.length + ' ACCEPTED=' + summary.accepted.length +
      ' DEFERRED=' + summary.deferred.length + ' REJECTED=' + summary.rejected.length +
      ' ; G-DOCS NOT AUTOMATICALLY APPROVED; human and exact-head gates remain required.');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('DOC-CONTRACT-FAIL ' + error.message); process.exitCode = 1; });
}
