// Phase 10: the conformance matrix must be structurally valid, its evidence
// files must exist, its unresolved items must be explicit, and it must be
// incapable of claiming overall acceptance or production readiness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CONFORMANCE_MATRIX, CONFORMANCE_STATUSES, validateConformanceMatrix, conformanceSummary,
} from '../lib/conformance-matrix.mjs';

test('matrix validates: every row has id/area/requirement/status and existing evidence', async () => {
  const result = await validateConformanceMatrix();
  assert.equal(result.valid, true);
  const summary = result.summary;
  assert.equal(summary.total, CONFORMANCE_MATRIX.length);
  assert.equal(summary.COVERED + summary.PARTIAL + summary.UNRESOLVED, summary.total);
  assert.equal(summary.acceptanceClaimed, false);
  assert.ok(summary.UNRESOLVED >= 12, `expected >=12 unresolved rows, got ${summary.UNRESOLVED}`);
});

test('the status vocabulary cannot express acceptance', () => {
  assert.ok(!CONFORMANCE_STATUSES.includes('ACCEPTED'));
  assert.ok(!CONFORMANCE_STATUSES.includes('PASS'));
  assert.ok(!CONFORMANCE_STATUSES.includes('PRODUCTION_READY'));
  assert.deepEqual([...CONFORMANCE_STATUSES].sort(), ['COVERED', 'PARTIAL', 'UNRESOLVED']);
});

test('unresolved rows name their blockers explicitly', async () => {
  const unresolved = CONFORMANCE_MATRIX.filter((r) => r.status === 'UNRESOLVED');
  const text = unresolved.map((r) => `${r.id} ${r.requirement} ${r.notes}`).join('\n').toLowerCase();
  for (const must of ['Windows', 'Power-loss', 'D-01', 'G-FENCE', 'PH-06', 'L3', 'L1 readiness', 'Checkpoint A', 'Checkpoint D', '0.9.4', 'mandatory CI enforcement']) {
    assert.ok(text.includes(must.toLowerCase()), `unresolved rows must mention: ${must}`);
  }
  for (const row of unresolved) assert.ok(row.notes.length > 10, `${row.id} needs a named blocker`);
});

test('the human-readable matrix doc contains every matrix id', async () => {
  const doc = await readFile(path.resolve('docs/VCP-ADAPTIVE-CONFORMANCE-MATRIX.md'), 'utf8');
  assert.ok(doc.includes('NOT ACCEPTED'), 'doc must state acceptance is not claimed');
  for (const row of CONFORMANCE_MATRIX) assert.ok(doc.includes(row.id), `doc missing row ${row.id}`);
});
