import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkRequiredCoverage, evaluateStatic, parseRegister, verifyAcceptedRecord } from '../scripts/check-adaptive-contracts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function docs() {
  const [register, S, T] = await Promise.all([
    'docs/ADAPTIVE-VCP-DECISIONS.md',
    'docs/ADAPTIVE-VCP-IMPLEMENTATION-PLAN.md',
    'docs/ADAPTIVE-VCP-CODE-INTEGRATION-ANALYSIS.md'
  ].map(p => readFile(path.join(root, p), 'utf8')));
  return { register, S, T };
}

test('current proposed decision register and S/T regression anchors are coherent', async () => {
  const out = evaluateStatic(await docs());
  assert.deepEqual(out.errors, []);
  assert.equal(out.decisionCount, 12);
  assert.equal(out.checkedContractAnchors, 14);
  assert.equal(out.accepted.length + out.proposed.length + out.deferred.length + out.rejected.length,
    12, 'Every stable ID retains an explicit status');
});

test('D-06: DEFERRED is not PROPOSED, and the executable checker reports every state', async () => {
  const current = await docs();
  const summary = evaluateStatic(current);
  assert.deepEqual(summary.deferred, ['D-01']);
  assert.ok(!summary.proposed.includes('D-01'));
  const result = spawnSync(process.execPath, ['scripts/check-adaptive-contracts.mjs'], {
    cwd: root, encoding: 'utf8', timeout: 10000
  });
  assert.equal(result.status, 0, result.stderr);
  for (const status of ['proposed', 'accepted', 'deferred', 'rejected']) {
    assert.match(result.stdout, new RegExp(status.toUpperCase() + '=' + summary[status].length));
  }
  assert.doesNotMatch(result.stdout, /PENDING=\d+/);

  const changed = current.register
    .replace('| D-02 | **PROPOSED** |', '| D-02 | **ACCEPTED** |')
    .replace('| D-03 | **PROPOSED** |', '| D-03 | **REJECTED** |');
  const mixed = evaluateStatic({ ...current, register: changed });
  assert.deepEqual(mixed.errors, []);
  assert.deepEqual(mixed.accepted, ['D-02']);
  assert.deepEqual(mixed.rejected, ['D-03']);
  assert.deepEqual(mixed.deferred, ['D-01']);
  assert.equal(mixed.proposed.length, 9);
});

test('D-06: complete ACCEPTED-record validator checks independent map, metadata and document', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'vcp-d06-accepted-'));
  try {
    await mkdir(path.join(folder, 'docs/decisions'), { recursive: true });
    await mkdir(path.join(folder, 'docs/fixtures'), { recursive: true });
    const anchor = {
      path: 'docs/fixtures/decision-policy.md',
      heading: '## D-06 policy fixture',
      requiredText: 'Independent affected-location review is required'
    };
    const docFile = path.join(folder, anchor.path);
    const recordFile = path.join(folder, 'docs/decisions/D-06.json');
    const inventory = { schemaVersion: 1,
      decisions: { 'D-06': { coverageReview: 'APPROVED', anchors: [anchor] } } };
    const record = {
      id: 'D-06', status: 'ACCEPTED', owner: 'Test Maintainer',
      decidedAtUtc: '2026-10-09T02:00:00Z',
      chosenOption: 'Require independent affected-location review',
      rationale: 'Maintain decision accountability',
      approvalEvidence: 'Synthetic fixture only, never a real approval',
      rejectedAlternatives: [{ option: 'Unreviewed coverage', reason: 'Cannot prove completeness' }],
      implementationPR: 'https://github.com/Moeeryani/Vibe-Coding-Production-Kit/pull/94',
      provingTests: ['exact-head-test-receipt-fixture'],
      affectedLocations: [anchor]
    };
    await writeFile(docFile, '# Fixture\n\n## D-06 policy fixture\n\nD-06: Independent affected-location review is required.\n');
    await writeFile(recordFile, JSON.stringify(record));
    assert.deepEqual(await verifyAcceptedRecord('D-06', inventory, folder), []);
    const pending = { schemaVersion: 1,
      decisions: { 'D-06': { coverageReview: 'PENDING', anchors: [anchor] } } };
    assert.match((await verifyAcceptedRecord('D-06', pending, folder)).join('\n'),
      /NOT maintainer-reviewed/);
    await writeFile(recordFile, JSON.stringify({ ...record, owner: 'PENDING' }));
    assert.match((await verifyAcceptedRecord('D-06', inventory, folder)).join('\n'),
      /missing acceptance field owner/);
    await writeFile(recordFile, JSON.stringify({ ...record, approvalEvidence: 'PENDING' }));
    assert.match((await verifyAcceptedRecord('D-06', inventory, folder)).join('\n'),
      /missing explicit maintainer approvalEvidence/);
    await writeFile(recordFile, JSON.stringify({ ...record, rejectedAlternatives: [] }));
    assert.match((await verifyAcceptedRecord('D-06', inventory, folder)).join('\n'),
      /rejectedAlternatives must name reviewed options/);
    await writeFile(recordFile, JSON.stringify({ ...record, affectedLocations: [] }));
    assert.match((await verifyAcceptedRecord('D-06', inventory, folder)).join('\n'),
      /required anchor omitted or repeated/);
    await writeFile(recordFile, JSON.stringify(record));
    await writeFile(docFile, '## D-06 policy fixture\n\nD-06: weakened clause\n');
    assert.match((await verifyAcceptedRecord('D-06', inventory, folder)).join('\n'),
      /missing accepted-ID and substantive clause/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('D-03: selected no-follow contract also rejects in-root links and linked parents', async () => {
  const T = await readFile(path.join(root, 'docs/ADAPTIVE-VCP-CODE-INTEGRATION-ANALYSIS.md'), 'utf8');
  const task = await readFile(path.join(root, 'docs/tasks/stage12-safe-adoption-planning.md'), 'utf8');
  assert.match(T, /D-03 no-follow policy rejects in-root symlinks/);
  assert.match(T, /reject untrusted symlink\/junction\/reparse traversal by default even when its target stays inside/);
  assert.match(task, /AC-010 \(D-03 PROPOSED\):[^\n]*even for in-root targets/);
  assert.match(task, /native Windows fixtures required/);
});

test('detect duplicate canonical decision rows', async () => {
  const input = await docs();
  const row = input.register.split(/\r?\n/).find(x => x.startsWith('| D-01 |'));
  assert.ok(row);
  const out = evaluateStatic({ ...input, register: input.register + '\n' + row });
  assert.match(out.errors.join('\n'), /D-01.*(expected one|Duplicate)/);
});

test('detect missing D-12 and regression of explicit old CLI fence', async () => {
  const input = await docs();
  const without12 = input.register.split(/\r?\n/).filter(x => !x.startsWith('| D-12 |')).join('\n');
  assert.match(evaluateStatic({ ...input, register: without12 }).errors.join('\n'), /D-12/);
  assert.match(evaluateStatic({ ...input, S: input.S.replaceAll('G-FENCE', 'HIDDEN-FENCE') })
    .errors.join('\n'), /C-01/);
});

test('local gate runner refuses missing exact SHA/evidence directory before running npm', () => {
  const r = spawnSync(process.execPath, ['scripts/run-adaptive-local-gates.mjs'], {
    cwd: root, encoding: 'utf8', timeout: 10000
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Usage:/);
});

test('local gate runner refuses relative evidence directory', () => {
  const r = spawnSync(process.execPath, [
    'scripts/run-adaptive-local-gates.mjs',
    '--expected-sha', 'a'.repeat(40),
    '--evidence-dir', 'relative-local-evidence'
  ], { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /absolute path/);
});

test('strengthened anchors fail when normative text is removed', async () => {
  const input = await docs();
  // C-05 guards the marker ID grammar, not the example block
  assert.match(evaluateStatic({ ...input, T: input.T.replaceAll('[a-z0-9-]{1,64}', 'ID') })
    .errors.join('\n'), /C-05/);
  // C-09 requires the assetSet-aware resolver, not the bare token
  assert.match(evaluateStatic({ ...input, S: input.S.replaceAll('assetSet-aware', 'assetSet') })
    .errors.join('\n'), /C-09/);
  // C-03 requires migration re-screening language
  assert.match(evaluateStatic({ ...input, S: input.S.replaceAll('re-screen', 'review') })
    .errors.join('\n'), /C-03/);
});

test('C-14 hygiene forbids the phantom A15 amendment ID in either doc', async () => {
  const input = await docs();
  assert.match(evaluateStatic({ ...input, S: input.S + '\nSee amendment A15.\n' })
    .errors.join('\n'), /C-14.*A15/);
  assert.match(evaluateStatic({ ...input, T: input.T + '\nSee amendment A15.\n' })
    .errors.join('\n'), /C-14.*A15/);
  // ...but the fixed A12 reference is fine
  assert.deepEqual(evaluateStatic({ ...input, S: input.S + '\nSee amendment A12.\n' })
    .errors.filter(e => e.startsWith('C-14')), []);
});


test('D-06: independent required-anchor inventory catches missing S/T/Task/Local Gates coverage', async () => {
  const inventory = JSON.parse(await readFile(path.join(root, 'docs/decisions/required-anchors.json'), 'utf8'));
  const anchors = inventory.decisions['D-06'].anchors;
  assert.ok(anchors.length >= 4, 'D-06 must include independently required S, T, task and local gate anchors');
  const approvedFixture = {
    schemaVersion: 1,
    decisions: { 'D-06': { coverageReview: 'APPROVED', anchors } }
  };
  assert.deepEqual(checkRequiredCoverage('D-06', anchors, approvedFixture), []);
  for (const required of anchors) {
    const incomplete = anchors.filter(x => x !== required);
    const defects = checkRequiredCoverage('D-06', incomplete, approvedFixture);
    assert.match(defects.join('\n'), /required anchor omitted or repeated/);
  }
});

test('D-06: acceptance cannot bypass independent coverage review or amend its own expected clause', async () => {
  const inventory = JSON.parse(await readFile(path.join(root, 'docs/decisions/required-anchors.json'), 'utf8'));
  const anchors = inventory.decisions['D-06'].anchors;
  const notReviewed = checkRequiredCoverage('D-06', anchors, inventory);
  assert.match(notReviewed.join('\n'), /NOT maintainer-reviewed/);
  const fakeApproved = {
    schemaVersion: 1,
    decisions: { 'D-06': { coverageReview: 'APPROVED', anchors } }
  };
  const swapped = anchors.map((x, i) => i === 0 ? { ...x, requiredText: 'vague keyword' } : x);
  assert.match(checkRequiredCoverage('D-06', swapped, fakeApproved).join('\n'),
    /differs from independently required clause/);
  assert.match(checkRequiredCoverage('D-06', anchors, { schemaVersion: 1, decisions: {} }).join('\n'),
    /no independently declared required-anchor map/);
  assert.match(checkRequiredCoverage('D-07', [], inventory).join('\n'),
    /no independently declared required-anchor map/);
});

test('D-06: accepted location duplicates cannot count as separate coverage', async () => {
  const inventory = JSON.parse(await readFile(path.join(root, 'docs/decisions/required-anchors.json'), 'utf8'));
  const anchors = inventory.decisions['D-06'].anchors;
  const fakeApproved = {
    schemaVersion: 1,
    decisions: { 'D-06': { coverageReview: 'APPROVED', anchors } }
  };
  assert.match(checkRequiredCoverage('D-06', [...anchors, anchors[0]], fakeApproved).join('\n'),
    /duplicate declared anchor|repeated/);
});


test('D-06: every independently declared required section explicitly names its decision and normative clause', async () => {
  const map = JSON.parse(await readFile(path.join(root, 'docs/decisions/required-anchors.json'), 'utf8'));
  const cache = new Map();
  for (const [id, spec] of Object.entries(map.decisions)) {
    assert.ok(['PENDING', 'APPROVED'].includes(spec.coverageReview), id + ': unknown coverage-review state');
    for (const anchor of spec.anchors) {
      let data = cache.get(anchor.path);
      if (data === undefined) {
        data = await readFile(path.join(root, anchor.path), 'utf8');
        cache.set(anchor.path, data);
      }
      const lines = data.split(/\r?\n/);
      const start = lines.findIndex(line => line.trim() === anchor.heading);
      assert.ok(start >= 0, id + ': missing declared heading ' + anchor.path + ' / ' + anchor.heading);
      const level = anchor.heading.match(/^#+/)[0].length;
      let end = lines.length;
      for (let n = start + 1; n < lines.length; n++) {
        const next = lines[n].match(/^(#{1,6}) /);
        if (next && next[1].length <= level) { end = n; break; }
      }
      const section = lines.slice(start, end).join('\n');
      assert.ok(section.includes(anchor.requiredText),
        id + ': missing substantive requirement at ' + anchor.path + ' / ' + anchor.heading);
      assert.ok(section.includes(id),
        id + ': missing explicit decision reference at ' + anchor.path + ' / ' + anchor.heading);
    }
  }
});

test('D-06: critical D-01 and D-03 roadmap/CLI/update-doc anchors cannot vanish from coverage map', async () => {
  const map = JSON.parse(await readFile(path.join(root, 'docs/decisions/required-anchors.json'), 'utf8'));
  const mustCover = ['docs/ROADMAP.md', 'docs/CLI.md', 'docs/UPDATES.md'];
  for (const id of ['D-01', 'D-03']) {
    const declared = new Set(map.decisions[id].anchors.map(anchor => anchor.path));
    for (const file of mustCover) {
      assert.ok(declared.has(file), id + ': required user-facing contract absent from independent inventory: ' + file);
    }
  }
});


test('D-06: canonical ledger and Stage12 roadmap anchors stay mandatory', async () => {
  const inventory = JSON.parse(await readFile(path.join(root, 'docs/decisions/required-anchors.json'), 'utf8'));
  const anchors = inventory.decisions['D-06'].anchors;
  for (const [file, heading] of [
    ['docs/ADAPTIVE-VCP-DECISIONS.md', '## Normative register rules'],
    ['docs/ROADMAP.md', '### Stage 12 — Safe Adoption Planning']
  ]) {
    assert.ok(anchors.some(a => a.path === file && a.heading === heading),
      'D-06 must map independent normative authority at ' + file + ' / ' + heading);
  }
  const approvedFixture = { schemaVersion: 1, decisions: {
    'D-06': { coverageReview: 'APPROVED', anchors }
  } };
  assert.deepEqual(checkRequiredCoverage('D-06', anchors, approvedFixture), []);
  const incomplete = anchors.filter(a => a.path !== 'docs/ADAPTIVE-VCP-DECISIONS.md');
  assert.match(checkRequiredCoverage('D-06', incomplete, approvedFixture).join('\n'),
    /required anchor omitted or repeated/);
});

test('Stage12 reconciliation: T preserves final #87 checkpoint DONE and polyglot blocks', async () => {
  const T = await readFile(path.join(root, 'docs/ADAPTIVE-VCP-CODE-INTEGRATION-ANALYSIS.md'), 'utf8');
  const blocks = [
    { heading: '### Mechanical checkpoint DONE signals', clauses: [
      "Every checkpoint's Task Pack must define its DONE signal as a checkable",
      'GO/SIMPLIFY/STOP-DEFER decision must be',
      'Checkpoint E) must additionally record deletions made'
    ] },
    { heading: '### Polyglot fallback requirements', clauses: [
      'classify `stack: generic`',
      'record the competing evidence list',
      'install only stack-neutral assets',
      'require an explicit HUMAN DECISION',
      'does not exist until Phase 4'
    ] }
  ];
  for (const block of blocks) {
    const start = T.indexOf(block.heading);
    assert.ok(start >= 0, 'Missing final #87 block: ' + block.heading);
    assert.equal(T.split(block.heading).length - 1, 1,
      'Duplicate final #87 block: ' + block.heading);
    const end = T.indexOf('\n## ', start + block.heading.length);
    const section = T.slice(start, end >= 0 ? end : T.length);
    for (const clause of block.clauses) {
      assert.ok(section.includes(clause), block.heading + ': absent clause: ' + clause);
    }
  }
});
