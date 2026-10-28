// Phase 10: the conformance matrix must be structurally valid, its evidence
// files must exist, its unresolved items must be explicit, and it must be
// incapable of claiming overall acceptance or production readiness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CONFORMANCE_MATRIX, CONFORMANCE_STATUSES, validateConformanceMatrix, conformanceSummary,
} from '../lib/conformance-matrix.mjs';
import { generateConformanceDoc } from '../scripts/generate-conformance-doc.mjs';

test('matrix validates: every row has id/area/requirement/status and existing evidence', async () => {
  const result = await validateConformanceMatrix();
  assert.equal(result.valid, true);
  const summary = result.summary;
  assert.equal(summary.total, CONFORMANCE_MATRIX.length);
  assert.equal(summary.COVERED + summary.PARTIAL + summary.UNRESOLVED, summary.total);
  assert.equal(summary.acceptanceClaimed, false);
  // Deliberate change (Batch F, owner decisions D-PC-01/D-PC-02): U-08 resolved
  // to COVERED and U-07 to PARTIAL, so 10 unresolved rows remain.
  assert.ok(summary.UNRESOLVED >= 10, `expected >=10 unresolved rows, got ${summary.UNRESOLVED}`);
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
  // 'L3' and 'L1 readiness' left this list deliberately: U-07 is PARTIAL and
  // U-08 is COVERED after owner decisions D-PC-02/D-PC-01; their rows still
  // name the remaining authorization/persistence blockers.
  for (const must of ['Windows', 'Power-loss', 'D-01', 'G-FENCE', 'PH-06', 'Checkpoint A', 'Checkpoint D', '0.9.4', 'mandatory CI enforcement']) {
    assert.ok(text.includes(must.toLowerCase()), `unresolved rows must mention: ${must}`);
  }
  for (const row of unresolved) assert.ok(row.notes.length > 10, `${row.id} needs a named blocker`);
});

test('the human-readable matrix doc contains every matrix id', async () => {
  const doc = await readFile(path.resolve('docs/VCP-ADAPTIVE-CONFORMANCE-MATRIX.md'), 'utf8');
  assert.ok(doc.includes('NOT ACCEPTED'), 'doc must state acceptance is not claimed');
  for (const row of CONFORMANCE_MATRIX) assert.ok(doc.includes(row.id), `doc missing row ${row.id}`);
});

// Generator repair (independent-validation LOW 7.2): the committed doc was
// produced by an uncommitted one-off script whose lowercase summary keys and
// broken backticks rendered "COVERED undefined" and empty code spans, while
// this test only checked row ids. These tests pin the whole generated
// surface, so header/footer drift is now detected.
test('committed doc is exactly the generated doc (deterministic regeneration)', async () => {
  const committed = await readFile(path.resolve('docs/VCP-ADAPTIVE-CONFORMANCE-MATRIX.md'), 'utf8');
  assert.equal(committed, generateConformanceDoc(), 'regenerate with node scripts/generate-conformance-doc.mjs in the same commit as any matrix change');
  assert.equal(generateConformanceDoc(), generateConformanceDoc(), 'generator must be deterministic');
});

test('header counts are derived from the module and match the known construction values', async () => {
  const summary = conformanceSummary();
  const doc = await readFile(path.resolve('docs/VCP-ADAPTIVE-CONFORMANCE-MATRIX.md'), 'utf8');
  const header = /^Rows: (\d+) — COVERED (\d+), PARTIAL (\d+), UNRESOLVED (\d+)\. Acceptance claimed: (false|true)\.$/m.exec(doc);
  assert.ok(header, 'doc header must carry the counts line');
  assert.equal(Number(header[1]), summary.total);
  assert.equal(Number(header[2]), summary.COVERED);
  assert.equal(Number(header[3]), summary.PARTIAL);
  assert.equal(Number(header[4]), summary.UNRESOLVED);
  assert.equal(header[5], String(summary.acceptanceClaimed));
  // The header line itself must carry numbers, not the old "undefined" placeholders.
  // (The word "undefined" legitimately appears in one row's requirement text.)
  // Tripwire: changing any status classification changes these counts, and
  // must be a deliberate, disclosed change — not silent drift.
  // Deliberate change (Batch F): U-08 COVERED, U-07 PARTIAL, plus new
  // SKL-04 and PKG-02 rows. Counts are derived from the module, not hardcoded.
  // Deliberate change (SC-01, local implementation only, activation
  // pending): new SC-01 PARTIAL row for scoped Task Pack creation.
  assert.equal(summary.total, 45);
  assert.equal(summary.COVERED, 31);
  assert.equal(summary.PARTIAL, 4);
  assert.equal(summary.UNRESOLVED, 10);
  assert.equal(summary.acceptanceClaimed, false);
});

test('doc rows carry the full requirement text, in module order', async () => {
  const doc = await readFile(path.resolve('docs/VCP-ADAPTIVE-CONFORMANCE-MATRIX.md'), 'utf8');
  let cursor = 0;
  for (const row of CONFORMANCE_MATRIX) {
    const cell = `| ${row.id} | ${row.area} | ${row.requirement} |`;
    const at = doc.indexOf(cell, cursor);
    assert.ok(at >= 0, `doc row for ${row.id} must carry its full requirement text`);
    cursor = at + cell.length;
    assert.ok(doc.includes(`| ${row.status} |`), `doc row for ${row.id} must carry status ${row.status}`);
  }
});

test('doc names its source module, generator, and enforcing test files, and they exist', async () => {
  const doc = await readFile(path.resolve('docs/VCP-ADAPTIVE-CONFORMANCE-MATRIX.md'), 'utf8');
  for (const ref of ['lib/conformance-matrix.mjs', 'scripts/generate-conformance-doc.mjs', 'test/conformance-matrix.test.mjs', 'test/conformance-fixtures.test.mjs']) {
    assert.ok(doc.includes(`\`${ref}\``), `doc must reference \`${ref}\` in a code span`);
    await access(path.resolve(ref));
  }
});
