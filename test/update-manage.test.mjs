import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ignorePath, trackPath } from '../lib/manage.mjs';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-manage-'));
}

test('track is a no-op for an already managed path', async () => {
  const root = await tempDir();
  await mkdir(path.join(root, '.vcp/baselines/docs'), { recursive: true });
  await writeFile(path.join(root, 'docs.md'), 'local\n', 'utf8');
  const baseline = '.vcp/baselines/docs.md';
  await writeFile(path.join(root, baseline), 'template\n', 'utf8');
  await writeFile(path.join(root, '.vcp/manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    installedVersion: '0.9.0',
    installedAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
    install: { agent: 'generic', stack: 'generic', includeGitHub: false },
    ignoredFiles: [],
    managedFiles: {
      'docs.md': {
        policy: 'managed',
        origin: 'template',
        mode: 420,
        baselineHash: '948c69c10315a69b585e79dd4757c4b5fea80ac116d8d2b48017e9e06e9caa6c',
        baselinePath: baseline,
        templateVersion: '0.9.0'
      }
    }
  }, null, 2)}\n`, 'utf8');

  const result = await trackPath({ targetDir: root, relativePath: 'docs.md' });
  assert.equal(result.changed, false);
  assert.equal(result.alreadyTracked, true);
  const manifest = JSON.parse(await readFile(path.join(root, '.vcp/manifest.json'), 'utf8'));
  assert.equal(manifest.managedFiles['docs.md'].baselineHash, '948c69c10315a69b585e79dd4757c4b5fea80ac116d8d2b48017e9e06e9caa6c');
});

test('ignore commits detachment before a baseline cleanup failure', async () => {
  const root = await tempDir();
  const outside = await tempDir();
  await mkdir(path.join(root, '.vcp'), { recursive: true });
  await symlink(outside, path.join(root, '.vcp/baselines'));
  await writeFile(path.join(root, '.vcp/manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    installedVersion: '0.9.0',
    installedAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
    install: { agent: 'generic', stack: 'generic', includeGitHub: false },
    ignoredFiles: [],
    managedFiles: {
      'docs/file.md': {
        policy: 'managed',
        origin: 'template',
        mode: 420,
        baselineHash: '2c2d0a88283e1971b993499a69c18fdae57573cb492ee62174573a0401d0e1bf',
        baselinePath: '.vcp/baselines/docs/file.md',
        templateVersion: '0.9.0'
      }
    }
  }, null, 2)}\n`, 'utf8');

  await assert.rejects(
    ignorePath({ targetDir: root, relativePath: 'docs/file.md' }),
    /Refusing to follow symlink/
  );

  const manifest = JSON.parse(await readFile(path.join(root, '.vcp/manifest.json'), 'utf8'));
  assert.equal(Boolean(manifest.managedFiles['docs/file.md']), false);
  assert.ok(manifest.ignoredFiles.includes('docs/file.md'));
});
