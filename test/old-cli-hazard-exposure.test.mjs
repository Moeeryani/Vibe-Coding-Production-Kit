// P4-01 — Old-CLI (published VCP 0.9.3) hazard-exposure detector tests.
//
// Coverage:
//   - Pure assessment verdict matrix (H1-H5), evidence references, and
//     the UNKNOWN-is-never-safe invariant.
//   - 2026-10-31 verdict hardening: NOT_EXPOSED is retired. Every
//     corrected verdict (empty/nested-empty dirs, zero-byte AGENTS.md,
//     transaction.json-only, directory-shaped lock alone, interrupted
//     and adoption states with no user content, .vcp without manifest,
//     docs/-only, package.json-only, malformed fields) is UNKNOWN, and
//     a property test asserts no entrypoint ever returns NOT_EXPOSED.
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
    // Hardening (2026-10-31): NOT_EXPOSED is retired. No entrypoint
    // may ever return it, on any descriptor.
    assert.notEqual(e.verdict, 'NOT_EXPOSED',
      `${name}: NOT_EXPOSED is retired; no state returns it`);
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
  // Report-level hazards are the union across entrypoints: init
  // contributes H1/H2, and update/manage/rollback contribute H3 for
  // the directory-shaped lock (a root lock stray, rule 3).
  assert.deepEqual(report.hazards, ['H1', 'H2', 'H3']);
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

test('pure: empty directory is UNKNOWN on every entrypoint (no direct safety evidence)', () => {
  const report = assessHazardExposure(baseDescriptor({ classification: 'NEW' }));
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.equal(report.entrypoints[name].basis, 'no-evidence', name);
  }
  assert.match(report.entrypoints.init.reason, /no direct evidence supports safety/, 'init');
  for (const name of ['update', 'manage', 'rollback']) {
    assert.match(report.entrypoints[name].reason, /without a manifest is uncharacterized/, name);
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
    manifest: 'absent', rootManifestStray: true, userOwnedContentPresent: true,
    userOwnedSignals: ['AGENTS.md']
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
    transactionJson: 'symlink', userOwnedContentPresent: true,
    userOwnedSignals: ['AGENTS.md']
  }));
  assert.equal(report.entrypoints.init.verdict, 'EXPOSED');
  assert.deepEqual(report.entrypoints.init.hazards, ['H1']);
  for (const name of ['update', 'manage', 'rollback']) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.deepEqual(report.entrypoints[name].hazards, ['H3'], name);
  }
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
    { entrypoints: { init: { verdict: 'NOT_EXPOSED' } } },
    // Hardening: a mistyped or missing user-content flag must never
    // produce a safe verdict. Before the hardening these normalized
    // to userOwnedContentPresent=false and returned NOT_EXPOSED.
    { manifest: 'absent', userOwnedContentPresent: 'yes' },
    { manifest: 'absent', userOwnedContentPresent: 1 },
    { manifest: 'absent', userOwnedContentPresent: true, userOwnedSignals: 'AGENTS.md' },
    { manifest: 'absent', userOwnedContentPresent: true, userOwnedSignals: [7, null] }];
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
    updateLock: 'directory', userOwnedContentPresent: true,
    userOwnedSignals: ['AGENTS.md']
  }));
  const text = formatHazardReportText(report);
  assert.match(text, /init: EXPOSED \(H1, H2\)/);
  assert.match(text, /EVID-D01-LINUX-POC/);
  assert.match(text, /EVID-D01-WINDOWS-POC/);
  assert.match(text, /UNKNOWN is not safe/);
  assert.match(text, /No files written\./);
  assert.match(text, /concurrency \(H4\): UNKNOWN/);
});

// ---------- Verdict hardening (2026-10-31): every corrected verdict ----------

test('pure: docs-only is UNKNOWN on init (loss mechanism is AGENTS.md-only)', () => {
  const report = assessHazardExposure(baseDescriptor({
    userOwnedContentPresent: true, userOwnedSignals: ['docs/']
  }));
  assert.equal(report.entrypoints.init.verdict, 'UNKNOWN');
  assert.deepEqual(report.entrypoints.init.hazards, []);
  assert.ok(report.entrypoints.init.evidence.includes('EVID-D01-FIXTURE-SHAPE'));
  assert.match(report.entrypoints.init.reason, /AGENTS\.md user edits only/);
  for (const name of ['update', 'manage', 'rollback']) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
  }
  assertUnknownNotSafe(report);
});

test('pure: package.json-only is UNKNOWN on init', () => {
  const report = assessHazardExposure(baseDescriptor({
    userOwnedContentPresent: true, userOwnedSignals: ['package.json']
  }));
  assert.equal(report.entrypoints.init.verdict, 'UNKNOWN');
  assert.ok(report.entrypoints.init.evidence.includes('EVID-D01-FIXTURE-SHAPE'));
  assert.match(report.entrypoints.init.reason, /package\.json/);
  for (const name of ['update', 'manage', 'rollback']) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
  }
  assertUnknownNotSafe(report);
});

test('pure: docs plus package.json without AGENTS.md is UNKNOWN on init', () => {
  const report = assessHazardExposure(baseDescriptor({
    userOwnedContentPresent: true, userOwnedSignals: ['docs/', 'package.json']
  }));
  assert.equal(report.entrypoints.init.verdict, 'UNKNOWN');
  assert.ok(report.entrypoints.init.evidence.includes('EVID-D01-FIXTURE-SHAPE'));
  assertUnknownNotSafe(report);
});

test('pure: AGENTS.md content with docs and package.json stays EXPOSED H1 (control)', () => {
  const report = assessHazardExposure(baseDescriptor({
    userOwnedContentPresent: true,
    userOwnedSignals: ['AGENTS.md', 'docs/', 'package.json']
  }));
  assert.equal(report.entrypoints.init.verdict, 'EXPOSED');
  assert.deepEqual(report.entrypoints.init.hazards, ['H1']);
  assert.equal(report.entrypoints.init.basis, 'poc-evidence');
  assertUnknownNotSafe(report);
});

test('pure: transaction.json-only is UNKNOWN, H3 on update/manage/rollback', () => {
  for (const shape of ['file', 'directory', 'symlink', 'other']) {
    const report = assessHazardExposure(baseDescriptor({ transactionJson: shape }));
    assert.equal(report.entrypoints.init.verdict, 'UNKNOWN', `${shape}/init`);
    assert.match(report.entrypoints.init.reason, /transaction\.json/, `${shape}/init reason`);
    for (const name of ['update', 'manage', 'rollback']) {
      assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', `${shape}/${name}`);
      assert.deepEqual(report.entrypoints[name].hazards, ['H3'], `${shape}/${name}`);
    }
    assertUnknownNotSafe(report);
  }
});

test('pure: directory-shaped update.lock alone is UNKNOWN H2 on init, H3 elsewhere', () => {
  const report = assessHazardExposure(baseDescriptor({ updateLock: 'directory' }));
  assert.equal(report.entrypoints.init.verdict, 'UNKNOWN');
  assert.deepEqual(report.entrypoints.init.hazards, ['H2']);
  assert.deepEqual(report.entrypoints.init.evidence, ['EVID-D01-WINDOWS-POC']);
  assert.match(report.entrypoints.init.reason, /proven non-fence/);
  for (const name of ['update', 'manage', 'rollback']) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.deepEqual(report.entrypoints[name].hazards, ['H3'], name);
  }
  assertUnknownNotSafe(report);
});

test('pure: file-shaped update.lock alone is UNKNOWN everywhere, no hazard', () => {
  const report = assessHazardExposure(baseDescriptor({ updateLock: 'file' }));
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.deepEqual(report.entrypoints[name].hazards, [], name);
  }
  assertUnknownNotSafe(report);
});

test('pure: interrupted state with no user content is UNKNOWN, H3 elsewhere', () => {
  const report = assessHazardExposure(baseDescriptor({ interruptedState: true }));
  assert.equal(report.entrypoints.init.verdict, 'UNKNOWN');
  assert.match(report.entrypoints.init.reason, /interrupted state is present/, 'init names the interruption');
  for (const name of ['update', 'manage', 'rollback']) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.deepEqual(report.entrypoints[name].hazards, ['H3'], name);
  }
  assert.ok(report.warnings.some((w) => /H3/.test(w)));
  assertUnknownNotSafe(report);
});

test('pure: adoption markers with no user content are UNKNOWN, H3 elsewhere', () => {
  const report = assessHazardExposure(baseDescriptor({ adoptionMarkersPresent: true }));
  assert.equal(report.entrypoints.init.verdict, 'UNKNOWN');
  assert.match(report.entrypoints.init.reason, /adoption markers/, 'init names the markers');
  for (const name of ['update', 'manage', 'rollback']) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.deepEqual(report.entrypoints[name].hazards, ['H3'], name);
  }
  assert.ok(report.warnings.some((w) => /Adoption markers/.test(w)));
  assertUnknownNotSafe(report);
});

test('pure: root manifest stray with no user content is UNKNOWN, H3 elsewhere', () => {
  const report = assessHazardExposure(baseDescriptor({ rootManifestStray: true }));
  assert.equal(report.entrypoints.init.verdict, 'UNKNOWN');
  assert.match(report.entrypoints.init.reason, /root manifest\.json stray/, 'init names the stray');
  for (const name of ['update', 'manage', 'rollback']) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.deepEqual(report.entrypoints[name].hazards, ['H3'], name);
  }
  assertUnknownNotSafe(report);
});

test('pure: .vcp directory without manifest or user content is UNKNOWN everywhere', () => {
  const report = assessHazardExposure(baseDescriptor({
    vcpDir: 'directory', manifest: 'absent'
  }));
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
  }
  assert.match(report.entrypoints.init.reason, /\.vcp directory exists without a manifest/);
  assertUnknownNotSafe(report);
});

test('pure: zero-byte AGENTS.md state is UNKNOWN (reader emits no AGENTS.md signal)', () => {
  // The reader signals AGENTS.md only for a regular file with size > 0,
  // so a zero-byte AGENTS.md reaches the pure core as no signal. The
  // verdict must be UNKNOWN, never a safe verdict on "no bytes to lose".
  const report = assessHazardExposure(baseDescriptor({}));
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
  }
  assertUnknownNotSafe(report);
});

test('pure: inconsistent caller claim (content present, no signals) is UNKNOWN', () => {
  const report = assessHazardExposure(baseDescriptor({
    userOwnedContentPresent: true, userOwnedSignals: []
  }));
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
  }
  assertUnknownNotSafe(report);
});

test('pure: report version is 2 (verdict hardening)', () => {
  const report = assessHazardExposure(baseDescriptor({}));
  assert.equal(report.version, 2);
  assert.ok(report.limitations.some((l) => /NOT_EXPOSED was retired/.test(l)));
});

test('pure: no entrypoint ever returns NOT_EXPOSED (property over the verdict matrix)', () => {
  const states = [
    baseDescriptor({}),
    baseDescriptor({ classification: 'NEW' }),
    baseDescriptor({ userOwnedContentPresent: true, userOwnedSignals: ['docs/'] }),
    baseDescriptor({ userOwnedContentPresent: true, userOwnedSignals: ['package.json'] }),
    baseDescriptor({ userOwnedContentPresent: true, userOwnedSignals: ['AGENTS.md'] }),
    baseDescriptor({ updateLock: 'directory', userOwnedContentPresent: true, userOwnedSignals: ['AGENTS.md', 'package.json'] }),
    baseDescriptor({ updateLock: 'directory' }),
    baseDescriptor({ updateLock: 'file' }),
    baseDescriptor({ updateLock: 'symlink' }),
    baseDescriptor({ updateLock: 'other' }),
    baseDescriptor({ updateLock: 'unknown' }),
    baseDescriptor({ transactionJson: 'file' }),
    baseDescriptor({ transactionJson: 'directory' }),
    baseDescriptor({ transactionJson: 'symlink' }),
    baseDescriptor({ transactionJson: 'other' }),
    baseDescriptor({ transactionJson: 'unknown' }),
    baseDescriptor({ interruptedState: true }),
    baseDescriptor({ interruptedState: true, userOwnedContentPresent: true, userOwnedSignals: ['AGENTS.md'] }),
    baseDescriptor({ adoptionMarkersPresent: true }),
    baseDescriptor({ rootManifestStray: true }),
    baseDescriptor({ rootManifestStray: true, userOwnedContentPresent: true, userOwnedSignals: ['AGENTS.md'] }),
    baseDescriptor({ vcpDir: 'directory', manifest: 'absent' }),
    baseDescriptor({ vcpDir: 'directory', manifest: 'absent', userOwnedContentPresent: true, userOwnedSignals: ['AGENTS.md'] }),
    baseDescriptor({ vcpDir: 'symlink', manifest: 'unknown' }),
    baseDescriptor({ manifest: 'present', classification: 'MANAGED', vcpDir: 'directory', userOwnedContentPresent: true, userOwnedSignals: ['AGENTS.md'] }),
    baseDescriptor({ manifest: 'not-regular', vcpDir: 'directory' }),
    baseDescriptor({ manifest: 'unknown' }),
    baseDescriptor({ rootLinked: true }),
    baseDescriptor({ classification: 'BLOCKED', adoptionMarkersPresent: true }),
    baseDescriptor({ classification: 'BLOCKED', manifest: 'present', vcpDir: 'directory', userOwnedContentPresent: true, userOwnedSignals: ['AGENTS.md'] }),
    { manifest: 'absent', userOwnedContentPresent: 'yes' },
    { manifest: 'absent', userOwnedContentPresent: 1 },
    { manifest: 'absent', userOwnedSignals: 'AGENTS.md' },
    null, undefined, {}, []
  ];
  for (const state of states) {
    const report = assessHazardExposure(state);
    assert.equal(report.version, 2);
    for (const name of HAZARD_ENTRYPOINTS) {
      const e = report.entrypoints[name];
      assert.notEqual(e.verdict, 'NOT_EXPOSED',
        `NOT_EXPOSED must never be returned (${name}, ${JSON.stringify(state)})`);
      assert.ok(e.verdict === 'EXPOSED' || e.verdict === 'UNKNOWN',
        `${name} verdict is EXPOSED or UNKNOWN`);
      if (e.verdict === 'UNKNOWN') {
        assert.match(e.reason, /UNKNOWN is not safe/, `${name} says UNKNOWN is not safe`);
        assert.equal(e.basis, 'no-evidence', `${name} UNKNOWN basis`);
      }
      if (e.verdict === 'EXPOSED') {
        assert.equal(e.basis, 'poc-evidence', `${name} EXPOSED basis`);
        assert.equal(name, 'init', 'only init can be EXPOSED');
      }
    }
    assertUnknownNotSafe(report);
  }
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

test('cli: empty directory is UNKNOWN everywhere; tree unchanged', async (t) => {
  const dir = await sandbox(t);
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(await treeHash(dir), before);
  const report = JSON.parse(run.stdout);
  assert.equal(report.classification, 'NEW');
  assert.equal(report.version, 2);
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.equal(report.entrypoints[name].basis, 'no-evidence', name);
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
  // Hardening: an adoption-marker state with no user content is UNKNOWN,
  // H3 on update/manage/rollback — never a safe verdict.
  assert.equal(report.entrypoints.init.verdict, 'UNKNOWN');
  for (const name of ['update', 'manage', 'rollback']) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.deepEqual(report.entrypoints[name].hazards, ['H3'], name);
  }
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

// ---------- Real CLI: verdict hardening (2026-10-31) ----------

test('cli: zero-byte AGENTS.md (F10) is UNKNOWN everywhere; tree unchanged', async (t) => {
  const dir = await sandbox(t);
  await writeFile(path.join(dir, 'AGENTS.md'), '');
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(await treeHash(dir), before);
  const report = JSON.parse(run.stdout);
  assert.deepEqual(report.state.userOwnedSignals, []);
  assert.equal(report.state.userOwnedContentPresent, false);
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
  }
  assertUnknownNotSafe(report);
});

test('cli: docs-only (F11) is UNKNOWN everywhere; tree unchanged', async (t) => {
  const dir = await sandbox(t);
  await mkdir(path.join(dir, 'docs'));
  await writeFile(path.join(dir, 'docs', 'notes.md'), 'notes\n');
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(await treeHash(dir), before);
  const report = JSON.parse(run.stdout);
  assert.deepEqual(report.state.userOwnedSignals, ['docs/']);
  assert.equal(report.entrypoints.init.verdict, 'UNKNOWN');
  assert.ok(report.entrypoints.init.evidence.includes('EVID-D01-FIXTURE-SHAPE'));
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
  }
  assertUnknownNotSafe(report);
});

test('cli: package.json-only is UNKNOWN everywhere; tree unchanged', async (t) => {
  const dir = await sandbox(t);
  await writeFile(path.join(dir, 'package.json'), '{"name":"pkg-only","private":true}\n');
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(await treeHash(dir), before);
  const report = JSON.parse(run.stdout);
  assert.deepEqual(report.state.userOwnedSignals, ['package.json']);
  assert.equal(report.entrypoints.init.verdict, 'UNKNOWN');
  assert.ok(report.entrypoints.init.evidence.includes('EVID-D01-FIXTURE-SHAPE'));
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
  }
  assertUnknownNotSafe(report);
});

test('cli: transaction.json-only is UNKNOWN, H3 on update/manage/rollback; tree unchanged', async (t) => {
  const dir = await sandbox(t);
  await writeFile(path.join(dir, 'transaction.json'), '{"interrupted":true}\n');
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(await treeHash(dir), before);
  const report = JSON.parse(run.stdout);
  assert.equal(report.state.transactionJson, 'file');
  assert.deepEqual(report.state.userOwnedSignals, []);
  assert.equal(report.entrypoints.init.verdict, 'UNKNOWN');
  assert.match(report.entrypoints.init.reason, /transaction\.json/);
  for (const name of ['update', 'manage', 'rollback']) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.deepEqual(report.entrypoints[name].hazards, ['H3'], name);
  }
  assertUnknownNotSafe(report);
});

test('cli: directory-shaped update.lock alone is UNKNOWN H2 on init, H3 elsewhere; tree unchanged', async (t) => {
  const dir = await sandbox(t);
  await mkdir(path.join(dir, 'update.lock'));
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(await treeHash(dir), before);
  const report = JSON.parse(run.stdout);
  assert.equal(report.state.updateLock, 'directory');
  assert.deepEqual(report.state.userOwnedSignals, []);
  assert.equal(report.entrypoints.init.verdict, 'UNKNOWN');
  assert.deepEqual(report.entrypoints.init.hazards, ['H2']);
  assert.deepEqual(report.entrypoints.init.evidence, ['EVID-D01-WINDOWS-POC']);
  for (const name of ['update', 'manage', 'rollback']) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.deepEqual(report.entrypoints[name].hazards, ['H3'], name);
  }
  assertUnknownNotSafe(report);
});

test('cli: interrupted .vcp tmp with no user content is UNKNOWN, H3 elsewhere; tree unchanged', async (t) => {
  const dir = await sandbox(t);
  await mkdir(path.join(dir, '.vcp'));
  await writeFile(path.join(dir, '.vcp', 'transaction-abc.tmp'), 'partial\n');
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  assert.equal(await treeHash(dir), before);
  const report = JSON.parse(run.stdout);
  assert.equal(report.classification, 'BLOCKED');
  assert.equal(report.classificationReason, 'MANIFEST_MISSING');
  assert.equal(report.state.interruptedState, true);
  assert.equal(report.state.manifest, 'absent');
  assert.deepEqual(report.state.userOwnedSignals, []);
  assert.equal(report.entrypoints.init.verdict, 'UNKNOWN');
  assert.match(report.entrypoints.init.reason, /interrupted state is present/);
  for (const name of ['update', 'manage', 'rollback']) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
    assert.deepEqual(report.entrypoints[name].hazards, ['H3'], name);
  }
  assertUnknownNotSafe(report);
});

test('cli: .vcp directory without manifest or user content is UNKNOWN everywhere; tree unchanged', async (t) => {
  const dir = await sandbox(t);
  await mkdir(path.join(dir, '.vcp'));
  const before = await treeHash(dir);
  const run = await runCli(dir, ['--json']);
  // A .vcp directory without a manifest classifies BLOCKED
  // (MANIFEST_MISSING), so the CLI exits 1 — the report is still
  // printed, and every verdict is UNKNOWN.
  assert.equal(run.code, 1, run.stderr);
  assert.equal(await treeHash(dir), before);
  const report = JSON.parse(run.stdout);
  assert.equal(report.classification, 'BLOCKED');
  assert.equal(report.classificationReason, 'MANIFEST_MISSING');
  assert.equal(report.state.vcpDir, 'directory');
  assert.equal(report.state.manifest, 'absent');
  assert.deepEqual(report.state.userOwnedSignals, []);
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
  }
  assert.match(report.entrypoints.init.reason, /\.vcp directory exists without a manifest/);
  assertUnknownNotSafe(report);
});

test('cli: nested empty subdirectory (F14) is UNKNOWN everywhere; parent not assessed; tree unchanged', async (t) => {
  const dir = await sandbox(t);
  await writeFile(path.join(dir, 'AGENTS.md'), 'user bytes\n');
  await mkdir(path.join(dir, 'docs'));
  const target = path.join(dir, 'docs', 'empty-sub');
  await mkdir(target);
  const before = await treeHash(dir);
  const run = await runCli(target, ['--json']);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(await treeHash(dir), before, 'parent tree must be untouched');
  const report = JSON.parse(run.stdout);
  assert.equal(report.classification, 'NEW');
  assert.deepEqual(report.state.userOwnedSignals, []);
  for (const name of HAZARD_ENTRYPOINTS) {
    assert.equal(report.entrypoints[name].verdict, 'UNKNOWN', name);
  }
  assertUnknownNotSafe(report);
});
