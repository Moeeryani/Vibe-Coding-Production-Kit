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
const contractAnchors = [
  ['C-01', 'G-FENCE', 'G-FENCE'],
  ['C-02', 'installHealth.checks', 'installHealth.checks'],
  ['C-03', 'verify --run', 'verify --run'],
  ['C-04', 'content digest', 'content digest'],
  ['C-05', 'VCP:BEGIN:agent-routing', 'VCP:BEGIN:agent-routing'],
  ['C-06', 'CLAIM', 'CLAIM'],
  ['C-07', 'E_ASSETSET_UNKNOWN', 'E_ASSETSET_UNKNOWN'],
  ['C-08', 'INERT_MANIFEST_FIELDS', 'INERT_MANIFEST_FIELDS'],
  ['C-09', 'assetSet', 'assetSet'],
  ['C-10', 'T §14.9', 'relevant worktree'],
  ['C-11', 'safePath', 'safePath'],
  ['C-12', 'Dependency order', 'Dependency order'],
  ['C-13', paths.register, paths.register],
  ['C-14', 'historical', 'historical']
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
    if (!S.includes(anchorS)) errors.push(id + ': missing S regression anchor');
    if (!T.includes(anchorT)) errors.push(id + ': missing T regression anchor');
  }
  const accepted = rows.filter(row => row.status === 'ACCEPTED').map(row => row.id);
  return { errors, accepted, pending: rows.filter(row => row.status !== 'ACCEPTED').map(row => row.id),
    checkedContractAnchors: contractAnchors.length, decisionCount: rows.length };
}

async function verifyAcceptedRecord(id) {
  const filepath = path.join(root, 'docs', 'decisions', id + '.json');
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
    try { data = await readFile(path.join(root, entry.path), 'utf8'); }
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
  for (const id of summary.accepted) summary.errors.push(...await verifyAcceptedRecord(id));
  if (summary.errors.length) {
    for (const issue of summary.errors) console.error('DOC-CONTRACT-FAIL ' + issue);
    process.exitCode = 1;
  } else {
    console.log('DOC-CONTRACT-STATIC-PASS: ' + summary.checkedContractAnchors + ' focused anchors, ' +
      summary.decisionCount + ' uniquely registered decisions');
    console.log('ACCEPTED=' + summary.accepted.length + ' PENDING=' + summary.pending.length +
      ' ; G-DOCS NOT AUTOMATICALLY APPROVED; human and exact-head gates remain required.');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('DOC-CONTRACT-FAIL ' + error.message); process.exitCode = 1; });
}
