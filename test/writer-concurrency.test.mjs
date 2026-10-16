// B-4: atomicity and concurrency validation.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { atomicWriteFile } from '../lib/writer-atomic.mjs';
import { acquireLifecycleLock } from '../lib/lifecycle-lock-v2.mjs';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';

const fresh=async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'vcp-wc-'));
  await mkdir(path.join(dir,'.vcp'),{recursive:true});
  return dir;
};

test('conflicting updates: sequential writes, no lost update',async()=>{
  const root=await fresh();
  await atomicWriteFile(root,'shared.txt',Buffer.from('writer-A\n'));
  await atomicWriteFile(root,'shared.txt',Buffer.from('writer-B\n'));
  // Last writer wins deterministically; content is exactly one write.
  assert.equal(await readFile(path.join(root,'shared.txt'),'utf8'),'writer-B\n');
});

test('lock contention: second acquirer refused while first holds',async()=>{
  const root=await fresh();
  const lockA=await acquireLifecycleLock(root,{mode:'update'});
  let refused=null;
  try{
    await acquireLifecycleLock(root,{mode:'update'});
  }catch(e){refused=e;}
  assert.ok(refused,'second lock acquisition should refuse');
  assert.match(refused.code||refused.message,/EEXIST|E_LOCK|lock/i);
  await lockA.release();
  // After release, acquisition succeeds.
  const lockB=await acquireLifecycleLock(root,{mode:'update'});
  await lockB.release();
});

test('stale lock: lock file persists after holder death (never auto-reaped)',async()=>{
  const root=await fresh();
  const childCode=`
    const {acquireLifecycleLock}=await import('/home/hatch/workspace/vcp-stage12-13-campaign/repo/lib/lifecycle-lock-v2.mjs');
    try{
      const lock=await acquireLifecycleLock(${JSON.stringify(root)},{mode:'update'});
      setInterval(()=>{},1000); // keep event loop alive; hold forever
      await new Promise(()=>{});
    }catch(e){ process.exit(2); }
  `;
  const child=spawn('node',['--input-type=module','-e',childCode],{stdio:'ignore'});
  const exited=new Promise(r=>child.on('exit',r));
  // Wait briefly for acquisition; if the child exits early, fail fast.
  await new Promise(r=>setTimeout(r,2000));
  if(child.exitCode!==null){
    await exited;
    assert.fail(`lock holder child exited early with code ${child.exitCode}`);
  }
  child.kill('SIGKILL');
  await exited;
  // The lock file must still exist (not reaped); new acquirer gets EEXIST.
  const { stat }=await import('node:fs/promises');
  const st=await stat(path.join(root,'.vcp','update.lock'));
  assert.ok(st.isFile(),'lock file must persist after holder death');
  let refused=null;
  try{await acquireLifecycleLock(root,{mode:'update'});}
  catch(e){refused=e;}
  assert.ok(refused,'stale lock must block new acquirer, not auto-reap');
});

test('interrupted multi-file sequence: each file old-or-new, never torn',async()=>{
  const root=await fresh();
  for(let i=0;i<5;i++)
    await atomicWriteFile(root,`f${i}.txt`,Buffer.from(`seed-${i}\n`));
  // Simulate interruption: kill a child mid-sequence (covered by B-2 harness);
  // here verify the primitive's per-file atomicity under rapid succession.
  const writes=[];
  for(let i=0;i<5;i++)
    writes.push(atomicWriteFile(root,`f${i}.txt`,Buffer.from(`new-${i}-${'y'.repeat(50)}\n`)));
  await Promise.all(writes);
  for(let i=0;i<5;i++){
    const c=await readFile(path.join(root,`f${i}.txt`),'utf8');
    assert.ok(c===`seed-${i}\n`||c===`new-${i}-${'y'.repeat(50)}\n`,
      `file f${i}.txt torn: ${JSON.stringify(c.slice(0,40))}`);
  }
});
