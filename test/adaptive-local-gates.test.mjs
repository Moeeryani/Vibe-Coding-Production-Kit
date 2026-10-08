import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluateStatic, parseRegister } from '../scripts/check-adaptive-contracts.mjs';

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
  assert.equal(out.accepted.length + out.pending.length, 12, 'Every stable ID retains an explicit status');
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
