// Runs the Windows writer suites and classifies every test as
// PASS / FAIL / INCONCLUSIVE (guard pre-empted) / SKIPPED (platform).
// A blocked test is never counted as passing. Exit code is 0 only when no
// test is a genuine FAIL — inconclusive results are reported, not hidden.
import { spawnSync } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseTap, verifyCompleteness } from './tap-matrix-parser.mjs';

const SUITES = [
  'writer-layer-assertion', 'writer-layer-reachability', 'no-replace-capability',
  'writer-durability-guard', 'windows-durability-proof', 'writer-child-kill',
  'writer-fixture-ownership',
  'writer-identity', 'writer-identity-replacement', 'writer-boundary',
  'writer-parent-namespace', 'writer-controlled-concurrency',
  'writer-controlled-rollback', 'writer-controlled-security',
  'writer-authorization-injection', 'writer-atomic',
  'writer-transaction-identity', 'writer-recovery',
  // Added after the baseline/head comparison: these two suites assert mutation
  // success too, and leaving them out made "0 genuine FAIL" a claim about a
  // narrower surface than the campaign actually touched.
  'writer-concurrency', 'writer-journal-previoushash',
  // Added after the 2026-10-18 independent review (F11): every remaining
  // writer/native-Windows suite is now classified, so the headline covers the
  // whole surface the campaign could have broken, not 20 suites of 35.
  'windows-d01-fixture-cli', 'windows-d01-fixture-evidence',
  'windows-d01-fixture-matrix', 'windows-d01-kernel-denial',
  'windows-d01-namespace-inventory', 'windows-d01-protected-snapshot',
  'windows-d01-readonly-source', 'windows-d01-token-evidence',
  'windows-scratch-protocol', 'windows-scratch-recovery-assessment',
  'writer-capability-adversarial', 'writer-harness-lifecycle',
  'writer-journal-authorization', 'writer-operation-scope',
  'writer-rollback-validation',
];
const INCONCLUSIVE_MARK = 'INCONCLUSIVE:';
const outDir = path.resolve(process.env.VCP_MATRIX_OUT || '.');
// Resolve the output directory BEFORE running anything. It used to be touched
// only after all suites had executed, so a mistyped path threw at the last
// moment and the whole run was wasted.
try { mkdirSync(outDir, { recursive: true }); }
catch (e) { console.error(`cannot write matrix output to ${outDir}: ${e.message}`); process.exit(2); }
const rows = [];

for (const suite of SUITES) {
  const file = path.join('test', `${suite}.test.mjs`);
  if (!existsSync(file)) { rows.push({ suite, name: '(missing)', verdict: 'FAIL', detail: '' }); continue; }
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {
    encoding: 'utf8', timeout: 180_000, windowsHide: true,
  });
  const parsed = parseTap({ stdout: r.stdout, stderr: r.stderr, suite });
  rows.push(...parsed.rows);
  rows.push(...verifyCompleteness({
    rows: parsed.rows, declared: parsed.declared, sawSummary: parsed.sawSummary, suite }));
}

const tally = {};
for (const row of rows) tally[row.verdict] = (tally[row.verdict] ?? 0) + 1;
writeFileSync(path.join(outDir, 'windows-writer-matrix.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), platform: process.platform,
    node: process.version,
    scope: `only the ${SUITES.length} suites listed in SUITES; NOT a substitute for `
      + "'npm test'. A PASS row is this classifier's verdict, not the repo's required "
      + 'verification command passing',
    tally, rows }, null, 2) + '\n');
// Rewritten per run. It used to be APPENDED, so a stale row from an earlier run
// could be read as current evidence for this tree.
writeFileSync(path.join(outDir, 'windows-writer-matrix.jsonl'),
  rows.map((row) => JSON.stringify(row)).join('\n') + '\n');

const width = Math.max(...rows.map((r) => r.name.length), 12);
for (const row of rows)
  console.log(row.verdict.padEnd(13), row.name.slice(0, width),
    row.verdict === 'FAIL' || row.verdict === 'INCONCLUSIVE' ? row.detail.slice(0, 110) : '');
console.log('\nTALLY:', JSON.stringify(tally));
const genuine = tally.FAIL ?? 0;
console.log(genuine === 0
  ? 'RESULT: no genuine product failures; INCONCLUSIVE rows are guard-blocked, not passes.'
  : `RESULT: ${genuine} genuine failure(s).`);
process.exit(genuine === 0 ? 0 : 1);
