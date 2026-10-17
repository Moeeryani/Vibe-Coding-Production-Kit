// Runs the Windows writer suites and classifies every test as
// PASS / FAIL / INCONCLUSIVE (guard pre-empted) / SKIPPED (platform).
// A blocked test is never counted as passing. Exit code is 0 only when no
// test is a genuine FAIL — inconclusive results are reported, not hidden.
import { spawnSync } from 'node:child_process';
import { writeFileSync, appendFileSync, existsSync } from 'node:fs';
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
];
const INCONCLUSIVE_MARK = 'INCONCLUSIVE:';
const outDir = process.env.VCP_MATRIX_OUT || '.';
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
    node: process.version, tally, rows }, null, 2) + '\n');
for (const row of rows)
  appendFileSync(path.join(outDir, 'windows-writer-matrix.jsonl'),
    JSON.stringify(row) + '\n');

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
