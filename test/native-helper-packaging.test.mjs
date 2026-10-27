// Batch E: native helper build/packaging contract — platform binding,
// fail-closed verification, setup script, and fresh-checkout behavior.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { verifyNativeHelper } from '../lib/native-helper-trust.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REAL_HELPER = path.join(ROOT, 'scripts', 'native', 'vcp-linux-fsops');
const REAL_SOURCE = REAL_HELPER + '.cpp';
const REAL_MANIFEST = REAL_HELPER + '.manifest.json';
const SETUP = path.join(ROOT, 'scripts', 'setup-native-helper.mjs');

const sha256File = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function fixtureHelper({ manifestPatch = null, tamper = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcp-helper-'));
  const helper = path.join(dir, 'vcp-linux-fsops');
  fs.copyFileSync(REAL_HELPER, helper);
  fs.copyFileSync(REAL_SOURCE, helper + '.cpp');
  const manifest = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf8'));
  if (manifestPatch) manifestPatch(manifest);
  fs.writeFileSync(helper + '.manifest.json', JSON.stringify(manifest, null, 2));
  fs.chmodSync(helper, 0o755);
  if (tamper) {
    const bytes = fs.readFileSync(helper);
    bytes[bytes.length - 1] ^= 0xff;
    fs.writeFileSync(helper, bytes);
    fs.chmodSync(helper, 0o755);
  }
  return helper;
}

function throwsCode(fn, code) {
  assert.throws(fn, error => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

test('verifyNativeHelper: missing helper fails closed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcp-helper-missing-'));
  throwsCode(() => verifyNativeHelper(path.join(dir, 'vcp-linux-fsops')), 'E_NATIVE_HELPER_MISSING');
});

test('verifyNativeHelper: real checkout helper is trusted with platform binding', () => {
  const identity = verifyNativeHelper(REAL_HELPER);
  const manifest = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf8'));
  assert.equal(manifest.platform, 'linux');
  assert.equal(manifest.arch, process.arch);
  assert.equal(identity.sha256, manifest.binarySha256);
  assert.equal(identity.sourceSha256, manifest.sourceSha256);
});

test('verifyNativeHelper: fixture copy of the real helper verifies', () => {
  const identity = verifyNativeHelper(fixtureHelper());
  assert.equal(identity.sha256, JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf8')).binarySha256);
});

test('verifyNativeHelper: tampered binary is refused', () => {
  throwsCode(() => verifyNativeHelper(fixtureHelper({ tamper: true })), 'E_NATIVE_HELPER_UNTRUSTED');
});

test('verifyNativeHelper: manifest without platform binding is refused', () => {
  throwsCode(() => verifyNativeHelper(fixtureHelper({
    manifestPatch: m => { delete m.platform; delete m.arch; },
  })), 'E_NATIVE_HELPER_UNTRUSTED');
});

test('verifyNativeHelper: manifest naming another platform is refused', () => {
  assert.throws(() => verifyNativeHelper(fixtureHelper({
    manifestPatch: m => { m.platform = 'win32'; },
  })), /platform\/arch mismatch/);
});

test('verifyNativeHelper: manifest naming another architecture is refused', () => {
  const otherArch = process.arch === 'x64' ? 'arm64' : 'x64';
  assert.throws(() => verifyNativeHelper(fixtureHelper({
    manifestPatch: m => { m.arch = otherArch; },
  })), /platform\/arch mismatch/);
});

test('setup script --check trusts the real checkout helper', () => {
  const run = spawnSync(process.execPath, [SETUP, '--check'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const manifest = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf8'));
  assert.match(run.stdout, new RegExp(manifest.binarySha256));
});

test('setup script --check --json reports the measured identity', () => {
  const run = spawnSync(process.execPath, [SETUP, '--check', '--json'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  const manifest = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf8'));
  assert.equal(out.ok, true);
  assert.equal(out.identity.sha256, manifest.binarySha256);
  assert.equal(out.identity.sourceSha256, manifest.sourceSha256);
});

test('setup script fails closed with a compiler hint when no compiler is on PATH', () => {
  const emptyBin = fs.mkdtempSync(path.join(os.tmpdir(), 'vcp-nobin-'));
  const run = spawnSync(process.execPath, [SETUP], {
    encoding: 'utf8',
    env: { ...process.env, PATH: emptyBin },
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stdout + run.stderr, /C\+\+ compiler is required/);
  assert.match(run.stdout + run.stderr, /g\+\+/);
});

test('.npmignore states the helper inclusion and excludes Windows artifacts', () => {
  const npmignore = fs.readFileSync(path.join(ROOT, '.npmignore'), 'utf8');
  assert.match(npmignore, /!scripts\/native\/vcp-linux-fsops\n/);
  assert.match(npmignore, /!scripts\/native\/vcp-linux-fsops\.manifest\.json/);
  assert.match(npmignore, /^scripts\/native\/vcp-windows-fsops\.exe$/m);
  assert.match(npmignore, /^scripts\/native\/vcp-windows-fsops\.obj$/m);
});

// NOTE: this test archives HEAD, so the Batch E files must be committed
// before it runs. It simulates a fresh clone: no helper, no manifest.
test('fresh checkout: setup builds and verifies the helper; pack ships it, never a Windows exe', { timeout: 120_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcp-fresh-'));
  const archive = spawnSync('git', ['archive', 'HEAD'], { cwd: ROOT, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(archive.status, 0, archive.stderr?.toString());
  const extract = spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout });
  assert.equal(extract.status, 0, extract.stderr?.toString());
  const freshHelper = path.join(dir, 'scripts', 'native', 'vcp-linux-fsops');
  assert.equal(fs.existsSync(freshHelper), false, 'fresh tree must not contain a helper binary');
  assert.equal(fs.existsSync(freshHelper + '.manifest.json'), false, 'fresh tree must not contain a manifest');

  const setup = spawnSync(process.execPath, [path.join(dir, 'scripts', 'setup-native-helper.mjs')], {
    cwd: dir, encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(setup.status, 0, setup.stdout + setup.stderr);
  assert.equal(fs.existsSync(freshHelper), true);
  const manifest = JSON.parse(fs.readFileSync(freshHelper + '.manifest.json', 'utf8'));
  assert.equal(manifest.platform, 'linux');
  assert.equal(manifest.arch, process.arch);
  assert.equal(manifest.binarySha256, sha256File(freshHelper));
  assert.equal(manifest.sourceSha256, sha256File(freshHelper + '.cpp'));

  const pack = spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts'], { cwd: dir, encoding: 'utf8', timeout: 60_000 });
  assert.equal(pack.status, 0, pack.stderr);
  const listing = pack.stdout + pack.stderr;
  assert.match(listing, /scripts\/native\/vcp-linux-fsops\n/);
  assert.match(listing, /scripts\/native\/vcp-linux-fsops\.manifest\.json/);
  assert.doesNotMatch(listing, /vcp-windows-fsops\.exe/);
});
