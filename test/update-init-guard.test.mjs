import assert from 'node:assert/strict';
import { mkdtemp,readFile,readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { initProject } from '../lib/init.mjs';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';

test('init --force refuses a managed repository without replacing manifest or user files', async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-init-guard-'));
  await seedLegacyV1Fixture({targetDir:root,agent:'generic',stack:'generic',includeGitHub:false});
  const beforeManifest=await readFile(path.join(root,'.vcp/manifest.json'));
  const beforeAgents=await readFile(path.join(root,'AGENTS.md'));
  const beforeEntries=await readdir(root);
  await assert.rejects(initProject({targetDir:root,force:true}),
    /Destructive vcp init --force is disabled/);
  assert.deepEqual(await readFile(path.join(root,'.vcp/manifest.json')),beforeManifest);
  assert.deepEqual(await readFile(path.join(root,'AGENTS.md')),beforeAgents);
  assert.deepEqual(await readdir(root),beforeEntries);
});
