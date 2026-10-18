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

test('TAP-04 — classifyFailure distinguishes inconclusive from a real failure', () => {
  assert.equal(classifyFailure('x', 'error: INCONCLUSIVE: BLOCKED / INCONCLUSIVE — …'), 'INCONCLUSIVE');
  assert.equal(classifyFailure('x', "code: 'E_TEST_INCONCLUSIVE'"), 'INCONCLUSIVE');
  assert.equal(classifyFailure('x', "error: 'Lifecycle directory durability is unproven'"), 'FAIL');
  // A skip is a TAP directive on the `ok` line (TAP-07), never a word inside a
  // failure block: `not ok` means the test did not pass, whatever it says.
  assert.equal(classifyFailure('x', '# SKIP symlink unavailable'), 'FAIL',
    'a FAILING test must not be downgraded to SKIPPED because its text mentions skip');
});

// The reviewed downgrade: classification used to be a substring search over the
// whole diagnostic block, so a genuine failure that merely QUOTED an inconclusive
// or platform message was re-labelled as non-failure — and verifyCompleteness
// could not see it, because the row was still non-pass either way.
test('TAP-08 — a real FAIL quoting an inconclusive message stays a FAIL', () => {
  const masked = [
    'not ok 9 - B4-03 — fixture replaced during mutate is refused (2.10ms)',
    '  ---',
    '  failureType: \'testCodeFailure\'',
    "  error: 'expected rejection'",
    "  expected: 'INCONCLUSIVE: mutation unreachable'",
    "  actual: 'did not reach the guard'",
    "  operator: 'strictEqual'",
    '  stack: |-',
    "    at TestContext.<anonymous> (file:///x.mjs:40:5)",
    '  ...',
  ].join('\n');
  const { rows } = parseTap({ stdout: masked, suite: 's' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].verdict, 'FAIL',
    `an assertion diff quoting INCONCLUSIVE must stay FAIL, got ${rows[0].verdict}`);

  // "platform-specific" appearing in a failure message is not a skip.
  assert.equal(
    classifyFailure('x', "error: 'this platform-specific behaviour corrupted the file'"),
    'FAIL');

  // Anything unrecognized defaults to FAIL, including empty diagnostics.
  assert.equal(classifyFailure('x', ''), 'FAIL');
  assert.equal(classifyFailure('x', 'totals: { pass: 0, fail: 1 }'), 'FAIL');

  // The genuine claim still classifies when it is the error's own field, and
  // long stacks no longer truncate the identifying line away.
  const long = ['noise'.repeat(60), "code: 'E_TEST_INCONCLUSIVE'"].join(' | ');
  assert.equal(classifyFailure('x', long), 'INCONCLUSIVE');
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
test('TAP-07b — a failing test cannot be rescued by skip-shaped text', () => {
  // M-L §4 requires platform skips to be declared by the test, never manufactured
  // by the classifier. `not ok` means the test did not pass, whatever it says.
  const src = [
    'not ok 1 - WIN-02 — windows principal self-certification (4.10ms)',
    '  ---',
    "  error: 'SKIP: platform does not apply'",
    "  code: 'ERR_ASSERTION'",
    '  ...',
    '# tests 1', '# pass 0', '# fail 1',
  ].join('\n');
  const { rows } = parseTap({ stdout: src, suite: 's' });
  assert.equal(rows[0].verdict, 'FAIL',
    'a FAIL must never be reported as SKIPPED because of its own text');
});
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
