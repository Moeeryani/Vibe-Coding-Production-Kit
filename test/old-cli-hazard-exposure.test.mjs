import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, lstat, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assessOldCliHazardExposure, inspectOldCliHazardExposure, formatOldCliHazardExposure } from '../lib/old-cli-hazard-exposure.mjs';

async function fixture(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-p4-01-'));
  try { return await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}
async function snapshot(root) {
  const data = [];
  async function visit(p, rel = '') {
    for (const name of (await readdir(p)).sort()) {
      const abs = path.join(p, name), key = path.join(rel, name), st = await lstat(abs);
      if (st.isDirectory()) { data.push([key, 'directory', st.mode]); await visit(abs,key); }
      else if (st.isFile()) { data.push([key, 'file', st.mode, (await readFile(abs)).toString('hex')]); }
      else data.push([key, 'other', st.mode]);
    }
  }
  await visit(root);
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

test('H1: no manifest + AGENTS.md is an evidence-cited exposure class, never certain loss', async () => fixture(async root => {
  await writeFile(path.join(root, 'AGENTS.md'), 'PRIVATE USER EDIT');
  const before = await snapshot(root), r = await inspectOldCliHazardExposure(root);
  assert.equal(r.verdicts.init.status, 'EXPOSED');
  assert.deepEqual(r.verdicts.init.hazards, ['H1']);
  assert.match(r.verdicts.init.evidence[0], /7\/12/);
  assert.match(r.verdicts.init.reason, /NOT prove/);
  assert.equal(await snapshot(root), before);
}));

test('H2: directory lock does not imply old init --force safety', async () => fixture(async root => {
  await writeFile(path.join(root,'AGENTS.md'),'USER');
  await mkdir(path.join(root,'update.lock'));
  const before=await snapshot(root), r=await inspectOldCliHazardExposure(root);
  assert.deepEqual(r.verdicts.init.hazards,['H1','H2']);
  assert.equal(r.verdicts.init.status,'EXPOSED');
  assert.equal(await snapshot(root),before);
}));

test('H3/H4: unknown, not safe; no unsupported NOT_EXPOSED', async () => fixture(async root => {
  await writeFile(path.join(root,'transaction.json'),'{}');
  const before=await snapshot(root), r=await inspectOldCliHazardExposure(root);
  assert.equal(r.verdicts.update.status,'UNKNOWN');
  assert.equal(r.verdicts.rollback.status,'UNKNOWN');
  assert.equal(r.unresolvedConcurrency.status,'UNKNOWN');
  assert.equal(r.verdicts.manage.status,'UNKNOWN');
  assert.equal(await snapshot(root),before);
}));

test('H5: linked root is not traversed, even when target has sensitive files', async () => fixture(async root => {
  await mkdir(path.join(root,'target'));
  await writeFile(path.join(root,'target','AGENTS.md'),'SENSITIVE');
  await symlink(path.join(root,'target'),path.join(root,'link'));
  const before=await snapshot(root), r=await inspectOldCliHazardExposure(path.join(root,'link'));
  assert.equal(r.pathTrust,'ROOT_LINK_REFUSED');
  for (const e of Object.values(r.verdicts)) assert.equal(e.status,'UNKNOWN');
  assert.equal(await snapshot(root),before);
}));

test('empty state remains UNKNOWN, and linked entries are not dereferenced', async () => fixture(async root => {
  let r=await inspectOldCliHazardExposure(root);
  assert.ok(Object.values(r.verdicts).every(x=>x.status==='UNKNOWN'));
  await symlink('/nonexistent/target',path.join(root,'AGENTS.md'));
  const before=await snapshot(root);
  r=await inspectOldCliHazardExposure(root);
  assert.equal(r.verdicts.init.status,'UNKNOWN');
  assert.equal(await snapshot(root),before);
}));

test('pure assessment and formatter, no safety claim', () => {
  const state={pathTrust:'DIRECTORY',entries:{'AGENTS.md':'file','manifest.json':'missing','update.lock':'directory','.vcp':'missing'}};
  const frozen=JSON.stringify(state);
  const r=assessOldCliHazardExposure(state);
  assert.equal(JSON.stringify(state),frozen);
  assert.equal(r.verdicts.init.status,'EXPOSED');
  assert.match(formatOldCliHazardExposure(r),/UNKNOWN is not safe/);
  assert.throws(()=>assessOldCliHazardExposure(null),TypeError);
});

test('non-directory target refuses instead of inspecting file contents', async()=>fixture(async root=>{
  const f=path.join(root,'file');await writeFile(f,'KEEP');
  await assert.rejects(inspectOldCliHazardExposure(f),{code:'E_HAZARD_READ_FAILED'});
  assert.equal(await readFile(f,'utf8'),'KEEP');
}));


test('managed marker is never misreported as old init exposure solely from an AGENTS.md file', async () => fixture(async root => {
  await mkdir(path.join(root,'.vcp'));
  await writeFile(path.join(root,'AGENTS.md'),'managed');
  const before=await snapshot(root), r=await inspectOldCliHazardExposure(root);
  assert.equal(r.verdicts.init.status,'UNKNOWN');
  assert.equal(await snapshot(root),before);
}));
