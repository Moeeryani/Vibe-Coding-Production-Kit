import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve('.');
const bin = path.join(repoRoot, 'bin', 'vibe-coding-production.mjs');
const referenceRoot = path.join(repoRoot, 'examples', 'reference-saas-invite');

async function run(args, cwd = repoRoot) {
  return execFileAsync(process.execPath, [bin, ...args], { cwd });
}

async function copyReference() {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vcp-stage8-cli-'));
  await cp(referenceRoot, target, { recursive: true });
  return target;
}

test('fitness CLI passes the reference SaaS and exposes deterministic JSON', async () => {
  const { stdout, stderr } = await run([
    'fitness',
    '--dir',
    referenceRoot,
    '--json'
  ]);

  assert.equal(stderr, '');
  const report = JSON.parse(stdout);
  assert.equal(report.success, true);
  assert.equal(report.analyzer, 'javascript-static-imports');
  assert.equal(report.summary.sourceFiles, 4);
  assert.equal(report.summary.modules, 3);
  assert.equal(report.summary.violations, 0);
  assert.deepEqual(report.dependencies.map((item) => [item.from, item.to]), [['application', 'domain']]);
});

test('fitness CLI human report exposes module ownership and dependency direction', async () => {
  const { stdout, stderr } = await run(['fitness', '--dir', referenceRoot]);

  assert.equal(stderr, '');
  assert.match(stdout, /Architecture fitness: PASS/);
  assert.match(stdout, /domain — owner membership-domain/);
  assert.match(stdout, /dependency application -> domain/);
  assert.match(stdout, /Summary: 0 violation\(s\)/);
});

test('fitness CLI returns non-zero JSON report for a public-contract violation', async () => {
  const target = await copyReference();
  const file = path.join(target, 'src', 'application', 'invitation-service.mjs');
  const content = await readFile(file, 'utf8');
  await writeFile(file, content.replace("../domain/index.mjs", "../domain/invitation.mjs"), 'utf8');

  await assert.rejects(
    run(['fitness', '--dir', target, '--json']),
    (error) => {
      assert.equal(error.code, 1);
      const report = JSON.parse(error.stdout);
      assert.equal(report.success, false);
      assert.ok(report.violations.some((item) => item.code === 'non-public-contract-import'));
      return true;
    }
  );
});

test('fitness CLI refuses to invent architecture when config is absent', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vcp-stage8-cli-no-config-'));

  await assert.rejects(
    run(['fitness', '--dir', target, '--json']),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /does not infer architecture automatically/);
      return true;
    }
  );
});

test('fitness --config accepts an explicit project-relative configuration path', async () => {
  const target = await copyReference();
  const config = await readFile(path.join(target, 'docs', 'architecture', 'FITNESS.json'), 'utf8');
  await writeFile(path.join(target, 'custom-fitness.json'), config, 'utf8');

  const { stdout } = await run([
    'fitness',
    '--dir',
    target,
    '--config',
    'custom-fitness.json',
    '--json'
  ]);
  const report = JSON.parse(stdout);

  assert.equal(report.success, true);
  assert.equal(report.configPath, 'custom-fitness.json');
});

test('fitness requires project root through --dir instead of ambiguous positional semantics', async () => {
  await assert.rejects(
    run(['fitness', referenceRoot]),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /must be supplied with --dir/);
      return true;
    }
  );
});
