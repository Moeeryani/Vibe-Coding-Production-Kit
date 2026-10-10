import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectProject } from '../lib/adoption-inspect.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repository, 'bin/vibe-coding-production.mjs');

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-inspect-'));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  return root;
}

function v1(overrides = {}) {
  return { schemaVersion: 1, installedVersion: '0.9.3',
    install: { agent: 'generic', stack: 'generic', includeGitHub: false },
    managedFiles: {}, ignoredFiles: [], ...overrides };
}

async function manifest(root, value) {
  await mkdir(path.join(root, '.vcp'), { recursive: true });
  await writeFile(path.join(root, '.vcp/manifest.json'),
    typeof value === 'string' ? value : JSON.stringify(value));
}

function invoke(root, ...extra) {
  return spawnSync(process.execPath, [cli, 'inspect', root, '--json', ...extra],
    { encoding: 'utf8', timeout: 10000 });
}

test('inspect: completely empty root is NEW and has zero side effects', async t => {
  const root = await fixture(t);
  const before = await readdir(root);
  assert.deepEqual(before, []);
  const result = await inspectProject(root);
  assert.equal(result.classification, 'NEW');
  assert.equal(result.readOnly, true);
  assert.deepEqual(await readdir(root), before);
  assert.equal(result.reason, null);
});

test('inspect: existing unmanaged files remain byte-identical and unclaimed', async t => {
  const root = await fixture(t);
  const file = path.join(root, 'AGENTS.md');
  const original = Buffer.from([0xef, 0xbb, 0xbf, 0x41, 0x0d, 0x0a, 0x42, 0x0a]);
  await writeFile(file, original);
  const beforeNames = await readdir(root);
  const report = await inspectProject(root);
  assert.equal(report.classification, 'EXISTING');
  assert.deepEqual(await readdir(root), beforeNames);
  assert.deepEqual(await readFile(file), original);
});

test('inspect: valid managed schema-v1 root returns only approved metadata', async t => {
  const root = await fixture(t);
  // Genuine released-0.9.3 shape: enumerated fields only. The report must
  // contain exactly the approved metadata keys — nothing else.
  const original = v1();
  await manifest(root, original);
  const report = await inspectProject(root);
  assert.deepEqual(report, { root, classification: 'MANAGED', readOnly: true,
    reason: null, schemaVersion: 1, installedVersion: '0.9.3', assetSet: null });
  assert.deepEqual(Object.keys(report).sort(),
    ['assetSet', 'classification', 'installedVersion', 'readOnly', 'reason', 'root', 'schemaVersion']);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, '.vcp/manifest.json'), 'utf8')), original);
});

test('inspect: unrecognized v1 metadata is blocked, never silently tolerated', async t => {
  const root = await fixture(t);
  const original = v1({ userSecretField: 'DO_NOT_LEAK' });
  await manifest(root, original);
  const report = await inspectProject(root);
  assert.equal(report.classification, 'BLOCKED');
  assert.doesNotMatch(JSON.stringify(report), /DO_NOT_LEAK/);
});

test('inspect: v1 install.assetSet is refused (never a released-0.9.3 field)', async t => {
  const root = await fixture(t);
  const original = v1({ install: { agent: 'generic', stack: 'generic', includeGitHub: false, assetSet: 'legacy-full-v1' } });
  await manifest(root, original);
  const report = await inspectProject(root);
  assert.equal(report.classification, 'BLOCKED');
  assert.equal(report.reason, 'METADATA_UNSUPPORTED');
});

test('inspect CLI: JSON and human output, blocked states return nonzero', async t => {
  const root = await fixture(t);
  const ok = invoke(root);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).classification, 'NEW');
  const human = spawnSync(process.execPath, [cli, 'inspect', root],
    { encoding: 'utf8', timeout: 10000 });
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /No files written/);
  await manifest(root, '{not-json');
  const bad = invoke(root);
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).reason, 'MANIFEST_INVALID_JSON');
  assert.equal((await readFile(path.join(root, '.vcp/manifest.json'), 'utf8')), '{not-json');
});

test('inspect: partial, corrupt, future and ambiguous managed states fail closed', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, '.vcp'));
  assert.equal((await inspectProject(root)).reason, 'MANIFEST_MISSING');
  for (const [value, reason] of [
    ['[1]', 'MANIFEST_INVALID'],
    // v1-shaped document claiming schemaVersion 2 fails v2 field validation
    // with its specific code; still fail-closed.
    [v1({ schemaVersion: 2 }), 'E_MANIFEST_VERSION'],
    [v1({ schemaVersion: 0 }), 'MANIFEST_INVALID'],
    [v1({ installedVersion: '01.2.3' }), 'MANIFEST_INVALID'],
    [v1({ install: { assetSet: 'from-unknown-plugin' } }), 'ASSETSET_UNKNOWN'],
    [v1({ minimumReaderVersion: '2.0.0' }), 'METADATA_UNSUPPORTED'],
    [v1({ assetSet: 'legacy-full-v1' }), 'METADATA_UNSUPPORTED'],
    [v1({ managedFiles: [] }), 'MANIFEST_INVALID'],
  ]) {
    await manifest(root, value);
    const report = await inspectProject(root);
    assert.equal(report.classification, 'BLOCKED', JSON.stringify(value));
    assert.equal(report.reason, reason);
    assert.equal(report.readOnly, true);
  }
});

test('inspect: non-directory and oversized manifest fail closed', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, '.vcp'), 'not state');
  assert.equal((await inspectProject(root)).reason, 'STATE_NOT_DIRECTORY');
  await rm(path.join(root, '.vcp'));
  await manifest(root, 'x'.repeat(256 * 1024 + 1));
  assert.equal((await inspectProject(root)).reason, 'MANIFEST_TOO_LARGE');
});

test('inspect: linked root, .vcp state and manifest are never trusted', async t => {
  if (process.platform === 'win32') t.skip('Native Windows reparse/junction conformance pending');
  const root = await fixture(t);
  const linkedRoot = root + '-alias';
  t.after(async () => { await rm(linkedRoot, { force: true }); });
  await symlink(root, linkedRoot, 'dir');
  assert.equal((await inspectProject(linkedRoot)).reason, 'ROOT_LINK_REFUSED');

  const target = path.join(root, 'state-target');
  await mkdir(target);
  await symlink(target, path.join(root, '.vcp'), 'dir');
  assert.equal((await inspectProject(root)).reason, 'STATE_NOT_DIRECTORY');
  await rm(path.join(root, '.vcp'));

  await mkdir(path.join(root, '.vcp'));
  const foreign = path.join(root, 'not-managed.json');
  await writeFile(foreign, JSON.stringify(v1()));
  await symlink(foreign, path.join(root, '.vcp/manifest.json'));
  assert.equal((await inspectProject(root)).reason, 'MANIFEST_NOT_REGULAR');
});

test('inspect: symlinked parent component is rejected even for in-root target', async t => {
  if (process.platform === 'win32') t.skip('Native Windows reparse/junction conformance pending');
  const root = await fixture(t);
  await mkdir(path.join(root, 'real'));
  await symlink(path.join(root, 'real'), path.join(root, 'alias'), 'dir');
  const result = await inspectProject(path.join(root, 'alias'));
  assert.equal(result.classification, 'BLOCKED');
  assert.equal(result.reason, 'ROOT_LINK_REFUSED');
  assert.deepEqual(await readdir(path.join(root, 'real')), []);
});

test('inspect: mutating CLI flags are rejected before touching files', async t => {
  const root = await fixture(t);
  for (const flag of ['--force', '--run', '--dry-run', '--check']) {
    const result = invoke(root, flag);
    assert.equal(result.status, 1, flag);
    assert.match(result.stderr, /always read-only/);
  }
  assert.deepEqual(await readdir(root), []);
});
