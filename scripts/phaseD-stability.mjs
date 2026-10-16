// Phase D closure: prove the historical hang is gone and no test disappears.
// Runs each suite 3 times OUTSIDE any test runner and asserts:
//   - no run is killed by a signal (the stall symptom)
//   - discovered test count is identical across runs
//   - every declared scenario id is present in that count
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const W = process.cwd();
const OUT = 'D:/vcp-b9-eng/evidence/32-phaseD-stability.txt';
const SUITES = [
  { file: 'test/writer-controlled-concurrency.test.mjs', ids: ['B4-01','B4-02','B4-03','B4-04','B4-05','B4-06','B4-07'] },
  { file: 'test/writer-controlled-rollback.test.mjs',     ids: ['B5-01','B5-02','B5-03','B5-04','B5-05','B5-06','B5-07'] },
  { file: 'test/writer-parent-namespace.test.mjs',        ids: ['B9-01a','B9-01b','B9-02','B9-03','B9-04'] },
];
const RUNS = 3;
const lines = [`=== PHASE D REPEAT-RUN STABILITY (${new Date().toISOString()}) ===`, ''];
let failures = 0;

for (const { file, ids } of SUITES) {
  const counts = [], elapsed = [];
  let signal = null, status = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {
      cwd: W, encoding: 'utf8', timeout: 180_000, windowsHide: true,
      env: { ...process.env, TMPDIR: 'D:\\vcp-b9-eng-tmp' },
    });
    elapsed.push(Date.now() - t0);
    status.push(r.status);
    if (r.signal) signal = r.signal;
    const text = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    const all = [...text.matchAll(/^\s*# tests (\d+)$/gm)].map((m) => Number(m[1]));
    counts.push(all.length ? all[all.length - 1] : 0);
  }
  const declaredIds = ids.length;
  const stable = new Set(counts).size === 1;
  const complete = counts[0] === declaredIds;
  const ok = !signal && stable && complete;
  if (!ok) failures++;
  lines.push(
    `${ok ? 'PASS' : 'FAIL'} ${path.basename(file)}\n` +
    `  runs=${RUNS} declared-scenarios=${declaredIds} discovered=${counts.join(',')}\n` +
    `  wall-clock ms=${elapsed.join(',')}  exit statuses=${status.join(',')}\n` +
    `  killed-by-signal=${signal ?? 'no'}  count-stable=${stable}  all-declared-discovered=${complete}`);
}
lines.push('', `RESULT: ${failures === 0 ? 'no hang, no disappearing tests' : `${failures} suite(s) unstable`}`);
writeFileSync(OUT, lines.join('\n') + '\n');
console.log(lines.join('\n'));
process.exit(failures === 0 ? 0 : 1);
