// Direct probe: can the Stage-12 production lock library run on native Windows?
import { lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquireLifecycleLock } from 'file:///<REPO-CLONE>/lib/lifecycle-lock-v2.mjs';
import { syncContainingDirectory } from 'file:///<REPO-CLONE>/lib/file-durability.mjs';

const roots = [];
const fresh = async () => { const r = await mkdtemp(path.join(os.tmpdir(), 'd01-lockprobe-')); roots.push(r); return r; };

console.log('platform=' + process.platform + ' node=' + process.version);

let r1;
try { r1 = await acquireLifecycleLock(await fresh(), { mode: 'init' }); }
catch (e) { console.log('INIT_ACQUIRE_FAILED code=' + e.code + ' message=' + e.message + ' cause=' + (e.cause && e.cause.code || e.cause && e.cause.message || 'none')); }

const root2 = await fresh();
await mkdir(path.join(root2, '.vcp'));
try {
  const r = await acquireLifecycleLock(root2, { mode: 'update' });
  const st = await lstat(r.lockPath);
  console.log('UPDATE_ACQUIRE_OK kind=' + (st.isFile() ? 'regular-file' : 'other') +
    ' payload=' + (await readFile(r.lockPath, 'utf8')).trim().slice(0, 90));
  await r.release();
  console.log('UPDATE_RELEASE_OK gone=' + !(await lstat(r.lockPath).catch(() => false)));
} catch (e) { console.log('UPDATE_ACQUIRE_FAILED code=' + e.code + ' message=' + e.message); }

const root3 = await fresh();
await mkdir(path.join(root3, '.vcp'));
await mkdir(path.join(root3, '.vcp', 'update.lock'));
try {
  const r = await acquireLifecycleLock(root3, { mode: 'update' });
  console.log('DIRECTORY_SENTINEL_ACQUIRE_OK__SENTINEL_NOT_HONOURED kind=' + (await lstat(r.lockPath)).isFile());
  await r.release();
} catch (e) { console.log('DIRECTORY_SENTINEL_ACQUIRE_BLOCKED code=' + e.code); }

// raw directory-handle capability on this filesystem
const root4 = await fresh();
try { await syncContainingDirectory(path.join(root4, 'x')); console.log('DIR_SYNC_OK'); }
catch (e) { console.log('DIR_SYNC_BLOCKED code=' + e.code + ' message=' + e.message + ' causeCode=' + (e.cause && e.cause.code)); }

// same probe on a D: (NTFS) scratch path, in case tmpdir filesystem differs
const root5 = path.join('<SCRATCH>', 'lockprobe-' + Date.now());
await mkdir(root5, { recursive: true });
roots.push(root5);
try { await syncContainingDirectory(path.join(root5, 'x')); console.log('DIR_SYNC_OK_ON_D'); }
catch (e) { console.log('DIR_SYNC_BLOCKED_ON_D code=' + e.code + ' causeCode=' + (e.cause && e.cause.code)); }

for (const r of roots) await rm(r, { recursive: true, force: true }).catch(() => {});
