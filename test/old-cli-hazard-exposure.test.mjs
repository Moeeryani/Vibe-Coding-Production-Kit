// P4-01 — Old-CLI (published VCP 0.9.3) hazard-exposure detector tests.
//
// Coverage:
//   - Pure assessment verdict matrix (H1-H5), evidence references, and
//     the UNKNOWN-is-never-safe invariant.
//   - Malformed/adversarial descriptors (no throw, all UNKNOWN).
//   - Pure-core purity: the module performs zero I/O (no fs imports).
//   - Real CLI smoke tests on disposable fixtures, with a full tree
//     hash (bytes + identities) before and after EVERY diagnostic
//     call: no file may be created, modified, deleted, or followed.
//   - Linked roots/markers (no-follow), malformed and interrupted
//     states, and the exact Issue #111 dangerous fixture.
//
// Fixtures are disposable real filesystems under os.tmpdir().
// The published 0.9.3 CLI is never executed by any test here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  lstat, mkdir, mkdtemp, readFile, readdir, symlink, writeFile
} from 'node:fs/promises';
import { lstatSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HAZARD_ENTRYPOINTS, HAZARD_EVIDENCE, assessHazardExposure,
  formatHazardReportText
} from '../lib/old-cli-hazard-exposure.mjs';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';

const execFileAsync = promisify(execFile);
const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..',
  'bin', 'vibe-coding-production.mjs');

async function sandbox(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-p401-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });
  return dir;
}

async function treeHash(root) {
  const hash = createHash('sha256');
  async function walk(dir, rel) {
    const entries = (await readdir(dir)).sort();
    for (const name of entries) {
      const full = path.join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = await lstat(full);
      if (st.isSymbolicLink()) {
        const { readlink } = await import('node:fs/promises');
        hash.update(`link:${r}:${await readlink(full)}\n`);
      } else if (st.isDirectory()) {
        hash.update(`dir:${r}\n`);
        await walk(full, r);
      } else if (st.isFile()) {
        hash.update(`file:${r}:${st.size}:`);
        hash.update(await readFile(full));
        hash.update('\n');
      } else {
        hash.update(`other:${r}\n`);
      }
    }
  }
  await walk(root, '');
  return hash.digest('hex');
}

async function runCli(dir, extraArgs = []) {
  try {
    const { stdout } = await execFileAsync(process.execPath,
      [CLI, 'hazard-exposure', dir, ...extraArgs], { encoding: 'utf8' });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? ''
    };
  }
}

function baseDescriptor(overrides = {}) {
  return {
    root: '/nonexistent/assessed-root',
    classification: 'EXISTING',
    classificationReason: null,
    rootLinked: false,
    manifest: 'absent',
    updateLock: 'absent',
    transactionJson: 'absent',
    vcpDir: 'absent',
    rootManifestStray: false,
    userOwnedContentPresent: false,
    userOwnedSignals: [],
    interruptedState: false,
    adoptionMarkersPresent: false,
    ...overrides
  };
}

function assertUnknownNotSafe(report) {
  for (const name of HAZARD_ENTRYPOINTS) {
    const e = report.entrypoints[name];
    assert.equal(e.concurrency.verdict, 'UNKNOWN', `${name} concurrency`);
    assert.equal(e.concurrency.hazard, 'H4', `${name} concurrency hazard`);
    if (e.verdict === 'UNKNOWN') {
      assert.match(e.reason, /UNKNOWN is not safe/, `${name} says UNKNOWN is not safe`);
    }
    if (e.verdict === 'NOT_EXPOSED') {
      assert.notEqual(e.basis, 'no-evidence',
        `${name}: NOT_EXPOSED must never rest on "no evidence"`);
    }
  }
  assert.ok(report.limitations.some((l) => /UNKNOWN is not safe/.test(l)),
    'limitations state UNKNOWN is not safe');
}

// ---------- Pure assessment ----------

test('pure core performs zero I/O (no filesystem/process imports)', async () => {
  const source = await readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..',
      'lib', 'old-cli-hazard-exposure.mjs'), 'utf8');
  // Check for real I/O capability (imports/requires), not for words
  // in comments: the header legitimately names node:fs and open(O_EXCL)
  // when describing what the module does NOT do.
  assert.equal(/^import\s/m.test(source), false, 'pure module must have no import statements');
  assert.equal(/\brequire\s*\(/.test(source), false, 'pure module must not require()');
  assert.equal(/from\s+['"]node:/.test(source), false, 'pure module must not import node: modules');
  assert.equal(/[^a-zA-Z]import\s*\(/.test(source), false, 'pure module must not dynamically import');
  assert.equal(source.includes('process.'), false, 'pure module must not touch process');
});

test('pure: dangerous fixture state (Issue #111) is EXPOSED H1/H2 on init', () => {
  const report = assessHazardExposure(baseDescriptor({
    classification: 'EXISTING',
    updateLock: 'directory',
    userOwnedContentPresent: true,
    userOwnedSignals: ['AGENTS.md', 'package.json']
  }));
  assert.equal(report.entrypoints.init.verdict, 'EXPOSED');
  assert.deepEqual(report.entrypoints.init.hazards, ['H1', 'H2']);
  assert.deepEqual(report.entrypoints.init.evidence,
    ['EVID-D01-LINUX-POC', 'EVID-D01-WINDOWS-POC']);
  assert.equal(report.entrypoints.init.basis, 'poc-evidence');
  assert.match(report.entrypoints.init.reason, /not that this exact project is guaranteed/);
  assert.deepEqual(report.hazards, ['H1', 'H2']);
  assert.ok(report.warnings.some((w) => /H1\/H2/.test(w) && /EVID-D01/.test(w)));
  assertUnknownNotSafe(report);
});

test('pure: H1 without the directory lock is EXPOSED H1 only', () => {
  const report = assessHazardExposure(baseDescriptor({
    userOwnedContentPresent: true,
    userOwnedSignals: ['AGENTS.md']
  }));
  assert.equal(report.entrypoints.init.verdict, 'EXPOSED');
  assert.deepEqual(report.entrypoints.init.hazards, ['H1']);
  for (const name of ['update', 'manage', 'rollback']) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN');
  }
  assertUnknownNotSafe(report);
});

test('pure: empty directory is NOT_EXPOSED on every entrypoint (precondition-absent)', () => {
  const report = assessHazardExposure(baseDescriptor({ classification: 'NEW' }));
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'NOT_EXPOSED', name);
    assert.equal(report.entrypoints[name].basis, 'precondition-absent', name);
  }
  assertUnknownNotSafe(report);
});

test('pure: manifest present is UNKNOWN on every entrypoint (aggregate evidence only)', () => {
  const report = assessHazardExposure(baseDescriptor({
    classification: 'MANAGED', manifest: 'present', vcpDir: 'directory',
    userOwnedContentPresent: true, userOwnedSignals: ['AGENTS.md']
  }));
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.match(report.entrypoints[name].reason, /aggregate only/, name);
  }
  assertUnknownNotSafe(report);
});

test('pure: malformed / not-regular / unknown manifest is UNKNOWN, never safe', () => {
  for (const manifest of ['malformed', 'not-regular', 'unknown']) {
    const report = assessHazardExposure(baseDescriptor({
      manifest, userOwnedContentPresent: true
    }));
    for (const name of HAZARD_ENTRYPOINTS) {
      assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', `${manifest}/${name}`);
    }
    assertUnknownNotSafe(report);
  }
});

test('pure: interrupted state makes update/manage/rollback UNKNOWN with H3', () => {
  const report = assessHazardExposure(baseDescriptor({
    classification: 'MANAGED', manifest: 'present', vcpDir: 'directory',
    interruptedState: true, userOwnedContentPresent: true
  }));
  for (const name of ['update', 'manage', 'rollback']) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.deepEqual(report.entrypoints[name].hazards, ['H3'], name);
  }
  assert.ok(report.warnings.some((w) => /H3/.test(w)));
  assertUnknownNotSafe(report);
});

test('pure: root manifest stray makes update/manage/rollback UNKNOWN with H3', () => {
  const report = assessHazardExposure(baseDescriptor({
    manifest: 'absent', rootManifestStray: true, userOwnedContentPresent: true
  }));
  assert.equal(report.entrypoints.init.verdict, 'EXPOSED');
  for (const name of ['update', 'manage', 'rollback']) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.deepEqual(report.entrypoints[name].hazards, ['H3'], name);
  }
  assertUnknownNotSafe(report);
});

test('pure: linked root refuses access — all UNKNOWN, H5, never EXPOSED or safe', () => {
  const report = assessHazardExposure(baseDescriptor({
    rootLinked: true, manifest: 'absent', userOwnedContentPresent: true,
    updateLock: 'directory'
  }));
  assert.equal(report.access.refused, true);
  assert.equal(report.access.reason, 'ROOT_LINK_REFUSED');
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.deepEqual(report.entrypoints[name].hazards, ['H5'], name);
  }
  assert.ok(report.warnings.some((w) => /Linked root refused/.test(w)));
  assertUnknownNotSafe(report);
});

test('pure: H4 concurrency is UNKNOWN on every entrypoint in every state', () => {
  const states = [
    baseDescriptor({}),
    baseDescriptor({ userOwnedContentPresent: true }),
    baseDescriptor({ manifest: 'present', classification: 'MANAGED' }),
    baseDescriptor({ rootLinked: true })
  ];
  for (const state of states) {
    const report = assessHazardExposure(state);
    for (const name of HAZARD_ENTRYPOINTS) {
      assert.equal(report.entrypoints[name].concurrency.verdict, 'UNKNOWN');
      assert.deepEqual(report.entrypoints[name].concurrency.evidence, ['EVID-PH06']);
    }
  }
});

test('pure: adoption markers and linked markers warn without changing the verdict rule', () => {
  const report = assessHazardExposure(baseDescriptor({
    adoptionMarkersPresent: true, updateLock: 'symlink',
    transactionJson: 'symlink', userOwnedContentPresent: true
  }));
  assert.equal(report.entrypoints.init.verdict, 'EXPOSED');
  assert.deepEqual(report.entrypoints.init.hazards, ['H1']);
  assert.ok(report.warnings.some((w) => /Adoption markers/.test(w)));
  assert.ok(report.warnings.some((w) => /Linked marker present \(update\.lock/.test(w)));
  assert.ok(report.warnings.some((w) => /Linked marker present \(transaction\.json/.test(w)));
  assertUnknownNotSafe(report);
});

test('pure: every cited evidence ID exists in the evidence table', () => {
  const states = [
    baseDescriptor({}),
    baseDescriptor({ userOwnedContentPresent: true }),
    baseDescriptor({ updateLock: 'directory', userOwnedContentPresent: true }),
    baseDescriptor({ manifest: 'present', classification: 'MANAGED' }),
    baseDescriptor({ interruptedState: true, manifest: 'present' }),
    baseDescriptor({ rootLinked: true })
  ];
  for (const state of states) {
    const report = assessHazardExposure(state);
    for (const name of HAZARD_ENTRYPOINTS) {
      for (const id of report.entrypoints[name].evidence) {
        assert.ok(Object.hasOwn(HAZARD_EVIDENCE, id), `evidence ${id} defined`);
        assert.equal(HAZARD_EVIDENCE[id].id, id);
        assert.ok(HAZARD_EVIDENCE[id].summary.length > 0);
        assert.ok(HAZARD_EVIDENCE[id].source.length > 0);
      }
      for (const id of report.entrypoints[name].concurrency.evidence) {
        assert.ok(Object.hasOwn(HAZARD_EVIDENCE, id), `evidence ${id} defined`);
      }
    }
  }
});

test('pure: malformed descriptors never throw and never report safety', () => {
  const inputs = [null, undefined, 42, 'x', [], {},
    { manifest: 7, updateLock: [], userOwnedContentPresent: 'yes' },
    { manifest: 'ABSENT', rootLinked: 'true', classification: 'MANAGED!' },
    { entrypoints: { init: { verdict: 'NOT_EXPOSED' } } }];
  for (const input of inputs) {
    const report = assessHazardExposure(input);
    for (const name of HAZARD_ENTRYPOINTS) {
      assert.notEqual(report.entrypoints[name].verdict, 'EXPOSED',
        `malformed input must not produce EXPOSED (${JSON.stringify(input)})`);
      assert.equal(report.entrypoints[name].verdict, 'UNKNOWN',
        `malformed input must be UNKNOWN (${JSON.stringify(input)})`);
    }
    assert.equal(report.readOnly, true);
    assertUnknownNotSafe(report);
  }
});

test('pure: text formatter names verdicts, evidence, and the not-safe rule', () => {
  const report = assessHazardExposure(baseDescriptor({
    updateLock: 'directory', userOwnedContentPresent: true
  }));
  const text = formatHazardReportText(report);
  assert.match(text, /init: EXPOSED \(H1, H2\)/);
  assert.match(text, /EVID-D01-LINUX-POC/);
  assert.match(text, /EVID-D01-WINDOWS-POC/);
  assert.match(text, /UNKNOWN is not safe/);
  assert.match(text, /No files written\./);
  assert.match(text, /concurrency \(H4\): UNKNOWN/);
});

// ---------- Real CLI ----------

test('cli: Issue #111 dangerous fixture warns H1/H2 with evidence IDs; tree unchanged', async (t) => {
  const dir = await sandbox(t);
  await writeFile(path.join(dir, 'AGENTS.md'),
    'MY USER EDITS — must survive\nUNIT_TEST_COMMAND=npm test\n');
  await writeFile(path.join(dir, 'package.json'),
    '{"name":"danger-fixture","private":true}\n');
  await mkdir(path.join(dir, 'update.lock'));
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(run.code, 0, run.stderr);
  const after = await treeHash(dir);
  assert.equal(after, before, 'diagnostic must not change the tree');
  const report = JSON.parse(run.stdout);
  assert.equal(report.entrypoints.init.verdict, 'EXPOSED');
  assert.deepEqual(report.entrypoints.init.hazards, ['H1', 'H2']);
  assert.deepEqual(report.entrypoints.init.evidence,
    ['EVID-D01-LINUX-POC', 'EVID-D01-WINDOWS-POC']);
  assert.equal(report.state.updateLock, 'directory');
  assert.equal(report.state.manifest, 'absent');
  assert.equal(report.readOnly, true);
  const text = await runCli(dir, []);
  assert.equal(text.code, 0, text.stderr);
  assert.match(text.stdout, /WARNING: Old VCP 0\.9\.3 init --force would expose/);
  assert.match(text.stdout, /H1\/H2/);
  assert.match(text.stdout, /EVID-D01-LINUX-POC/);
  assert.match(text.stdout, /UNKNOWN is not safe/);
  assert.match(text.stdout, /No files written\./);
  assert.equal(await treeHash(dir), before, 'text run must not change the tree either');
});

test('cli: H1-only fixture (no lock) is EXPOSED H1 only; tree unchanged', async (t) => {
  const dir = await sandbox(t);
  await writeFile(path.join(dir, 'AGENTS.md'), 'user bytes\n');
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(await treeHash(dir), before);
  const report = JSON.parse(run.stdout);
  assert.equal(report.entrypoints.init.verdict, 'EXPOSED');
  assert.deepEqual(report.entrypoints.init.hazards, ['H1']);
});

test('cli: empty directory is NOT_EXPOSED everywhere; tree unchanged', async (t) => {
  const dir = await sandbox(t);
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(await treeHash(dir), before);
  const report = JSON.parse(run.stdout);
  assert.equal(report.classification, 'NEW');
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'NOT_EXPOSED', name);
  }
});

test('cli: managed legacy-v1 project is UNKNOWN everywhere; tree unchanged', async (t) => {
  const dir = await sandbox(t);
  await seedLegacyV1Fixture({ targetDir: dir, agent: 'codex', includeGitHub: false });
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(await treeHash(dir), before);
  const report = JSON.parse(run.stdout);
  assert.equal(report.classification, 'MANAGED');
  assert.equal(report.state.manifest, 'present');
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
  }
  assertUnknownNotSafe(report);
});

test('cli: malformed manifest is BLOCKED/UNKNOWN, exit 1, tree unchanged', async (t) => {
  const dir = await sandbox(t);
  await mkdir(path.join(dir, '.vcp'));
  await writeFile(path.join(dir, '.vcp', 'manifest.json'), '{bad json');
  await writeFile(path.join(dir, 'AGENTS.md'), 'user bytes\n');
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(run.code, 1, 'blocked classification exits 1');
  assert.equal(await treeHash(dir), before);
  const report = JSON.parse(run.stdout);
  assert.equal(report.classification, 'BLOCKED');
  assert.equal(report.state.manifest, 'present');
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
  }
});

test('cli: interrupted state (.vcp transaction.json + tmp) is H3 UNKNOWN; tree unchanged', async (t) => {
  const dir = await sandbox(t);
  await seedLegacyV1Fixture({ targetDir: dir, agent: 'codex', includeGitHub: false });
  await writeFile(path.join(dir, '.vcp', 'transaction.json'), '{"interrupted":true}\n');
  await writeFile(path.join(dir, '.vcp', 'transaction-abc.tmp'), 'partial\n');
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(await treeHash(dir), before);
  const report = JSON.parse(run.stdout);
  assert.equal(report.state.interruptedState, true);
  for (const name of ['update', 'manage', 'rollback']) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.deepEqual(report.entrypoints[name].hazards, ['H3'], name);
  }
  assert.ok(report.warnings.some((w) => /H3/.test(w)));
});

test('cli: root manifest stray makes update/manage/rollback H3 UNKNOWN; tree unchanged', async (t) => {
  const dir = await sandbox(t);
  await writeFile(path.join(dir, 'AGENTS.md'), 'user bytes\n');
  await writeFile(path.join(dir, 'manifest.json'), '{}\n');
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(await treeHash(dir), before);
  const report = JSON.parse(run.stdout);
  assert.equal(report.state.rootManifestStray, true);
  assert.equal(report.entrypoints.init.verdict, 'EXPOSED');
  for (const name of ['update', 'manage', 'rollback']) {
    assert.deepEqual(report.entrypoints[name].hazards, ['H3'], name);
  }
});

test('cli: adoption marker is reported; classification BLOCKED, exit 1, tree unchanged', async (t) => {
  const dir = await sandbox(t);
  await writeFile(path.join(dir, '.vcp-adoption-retired-test'), 'marker\n');
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(run.code, 1, run.stderr);
  assert.equal(await treeHash(dir), before);
  const report = JSON.parse(run.stdout);
  assert.equal(report.state.adoptionMarkersPresent, true);
  assert.ok(report.warnings.some((w) => /Adoption markers/.test(w)));
});

test('cli: symlinked root is refused, never followed; external target untouched', async (t) => {
  const dir = await sandbox(t);
  const real = path.join(dir, 'real');
  await mkdir(real);
  await writeFile(path.join(real, 'AGENTS.md'), 'EXTERNAL TARGET BYTES\n');
  const before = await treeHash(real);
  const link = path.join(dir, 'linked-root');
  await symlink(real, link);
  const run = await runCli(link, ['--json']);
  assert.equal(run.code, 1, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.access.refused, true);
  assert.equal(report.access.reason, 'ROOT_LINK_REFUSED');
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.deepEqual(report.entrypoints[name].hazards, ['H5'], name);
  }
  assert.equal(await treeHash(real), before, 'external target must be untouched');
  assert.equal(lstatSync(link).isSymbolicLink(), true);
});

test('cli: symlinked .vcp is never followed; trap manifest ignored; external target untouched', async (t) => {
  const dir = await sandbox(t);
  const outside = path.join(dir, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'manifest.json'),
    '{"schemaVersion":1,"installedVersion":"0.9.3","install":{},"managedFiles":{}}\n');
  const outsideBefore = await treeHash(outside);
  await writeFile(path.join(dir, 'AGENTS.md'), 'user bytes\n');
  await symlink(outside, path.join(dir, '.vcp'));
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(run.code, 1, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.state.vcpDir, 'symlink');
  assert.equal(report.state.manifest, 'unknown', 'trap manifest must not be read');
  assert.equal(report.classification, 'BLOCKED');
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
  }
  assert.ok(report.warnings.some((w) => /Linked marker present \(\.vcp/.test(w)));
  assert.equal(await treeHash(outside), outsideBefore, 'external target untouched');
  assert.equal(await treeHash(dir), before);
});

test('cli: dangling symlink update.lock is recorded, not followed; init still H1', async (t) => {
  const dir = await sandbox(t);
  await writeFile(path.join(dir, 'AGENTS.md'), 'user bytes\n');
  await symlink(path.join(dir, 'does-not-exist'), path.join(dir, 'update.lock'));
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(await treeHash(dir), before);
  const report = JSON.parse(run.stdout);
  assert.equal(report.state.updateLock, 'symlink');
  assert.equal(report.entrypoints.init.verdict, 'EXPOSED');
  assert.deepEqual(report.entrypoints.init.hazards, ['H1']);
  assert.ok(report.warnings.some((w) => /Linked marker present \(update\.lock/.test(w)));
});

test('cli: mutating flags are rejected and change nothing', async (t) => {
  const dir = await sandbox(t);
  await writeFile(path.join(dir, 'AGENTS.md'), 'user bytes\n');
  const before = await treeHash(dir);
  for (const flags of [['--force'], ['--dry-run'], ['--yes'], ['--strict']]) {
    const run = await runCli(dir, flags);
    assert.notEqual(run.code, 0, `--${flags} must fail`);
    assert.match(run.stderr, /always read-only/, `flag rejection message for ${flags}`);
  }
  assert.equal(await treeHash(dir), before);
});

test('cli: missing root is refused with exit 1 and changes nothing', async (t) => {
  const dir = await sandbox(t);
  const missing = path.join(dir, 'does-not-exist');
  const run = await runCli(missing, ['--json']);
  assert.equal(run.code, 1, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.classification, 'BLOCKED');
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
  }
});
