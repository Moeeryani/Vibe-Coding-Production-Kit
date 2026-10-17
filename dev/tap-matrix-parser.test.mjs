// Tests for the matrix TAP parser. These encode the two real bugs this parser
// shipped with: dropping `not ok` rows, and flushing a failure block on a
// blank line that came from interleaved stderr (losing rows to the wrong suite).
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTap, classifyFailure, verifyCompleteness } from './tap-matrix-parser.mjs';

const SAMPLE = [
  'ok 1 - A-01 — passes (3.10ms)',
  '# Subtest: B',                      // stderr header, interleaved
  'not ok 2 - B-01 — blocked case (6.06ms)',
  '  ---',
  '  duration_ms: 6.0641',
  '  failureType: \'testCodeFailure\'',
  '  error: \'INCONCLUSIVE: BLOCKED / INCONCLUSIVE — intended X, preempted by Y\'',
  "  code: 'E_TEST_INCONCLUSIVE'",
  '  stack: |-',
  '    at helper (file:///x.mjs:1:1)',   // indented with 4 spaces
  '',                                     // blank line INSIDE the block
  '    at async Test.run (node:internal:2:2)',
  '  ...',
  'ok 3 - C-01 — also passes',
  '# tests 3',
  '# pass 2',
  '# fail 1',
].join('\n');

test('TAP-01 — parses every result line, including not ok with a duration suffix', () => {
  const { rows, declared, sawSummary } = parseTap({ stdout: SAMPLE, suite: 's' });
  assert.equal(rows.length, 3, `expected 3 rows, got ${rows.length}`);
  assert.deepEqual(rows.map((r) => r.verdict), ['PASS', 'INCONCLUSIVE', 'PASS']);
  assert.equal(sawSummary, true);
  assert.equal(declared.tests, 3);
  assert.equal(declared.fail, 1);
});

test('TAP-02 — a blank line inside a failure block does not truncate or misroute it', () => {
  const { rows } = parseTap({ stdout: SAMPLE, stderr: '', suite: 'suiteX' });
  const blocked = rows.find((r) => r.verdict === 'INCONCLUSIVE');
  assert.ok(blocked, 'the INCONCLUSIVE row must survive the blank line');
  assert.equal(blocked.suite, 'suiteX');
  assert.match(blocked.detail, /preempted by Y/);
  assert.match(blocked.detail, /node:internal/, 'stack lines after the blank must still be collected');
});

test('TAP-03 — stderr-only summary is still seen', () => {
  const { rows, declared, sawSummary } = parseTap({
    stdout: 'ok 1 - A-01\nnot ok 2 - B-01\n  ---\n  error: boom\n  ...\n',
    stderr: '# Subtest: s\n# tests 2\n# pass 1\n# fail 1\n',
    suite: 's',
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[1].verdict, 'FAIL');
  assert.equal(sawSummary, true);
  assert.equal(declared.tests, 2);
});

test('TAP-04 — classifyFailure distinguishes inconclusive, skipped and real failure', () => {
  assert.equal(classifyFailure('x', 'error: INCONCLUSIVE: BLOCKED / INCONCLUSIVE — …'), 'INCONCLUSIVE');
  assert.equal(classifyFailure('x', "code: 'E_TEST_INCONCLUSIVE'"), 'INCONCLUSIVE');
  assert.equal(classifyFailure('x', '# SKIP symlink unavailable'), 'SKIPPED');
  assert.equal(classifyFailure('x', "error: 'Lifecycle directory durability is unproven'"), 'FAIL');
});

test('TAP-05 — completeness check reports disagreement instead of hiding it', () => {
  const { rows, declared, sawSummary } = parseTap({ stdout: SAMPLE, suite: 's' });
  assert.deepEqual(verifyCompleteness({ rows, declared, sawSummary, suite: 's' }), [],
    'a correct parse must not raise a disagreement');
  const dropped = rows.filter((r) => r.verdict !== 'INCONCLUSIVE');
  const bad = verifyCompleteness({ rows: dropped, declared, sawSummary, suite: 's' });
  assert.equal(bad.length, 1);
  assert.equal(bad[0].verdict, 'FAIL');
  assert.match(bad[0].detail, /parsed 2\/3/);
});

test('TAP-06 — a missing summary is surfaced as inconclusive, never as success', () => {
  const { rows, declared, sawSummary } = parseTap({ stdout: 'ok 1 - A-01\n', suite: 's' });
  const out = verifyCompleteness({ rows, declared, sawSummary, suite: 's' });
  assert.equal(out.length, 1);
  assert.equal(out[0].verdict, 'INCONCLUSIVE');
});

// Regression: node:test emits skipped tests as
//   ok 1 - name # SKIP reason
// with NO duration suffix. An earlier version of this parser classified those
// as PASS, which would have hidden every platform skip from the matrix.
test('TAP-07 — "# SKIP" and "# TODO" results are never counted as PASS', () => {
  const src = [
    'ok 1 - posix-only case # SKIP posix uid semantics do not exist on win32',
    'ok 2 - another # SKIP constructs a fake posix uid; win32 has no uid',
    'ok 3 - deferred case # TODO not implemented yet',
    'ok 4 - plain pass (1.20ms)',
    'ok 5 - plain pass with no duration',
    '# tests 5',
    '# pass 5',
    '# fail 0',
  ].join('\n');
  const { rows } = parseTap({ stdout: src, suite: 's' });
  assert.deepEqual(rows.map((r) => r.verdict),
    ['SKIPPED', 'SKIPPED', 'SKIPPED', 'PASS', 'PASS']);
  assert.equal(rows[0].name, 'posix-only case', 'the reason must not leak into the name');
  assert.equal(rows[2].name, 'deferred case');
});
