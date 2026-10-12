import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

test('D-01 inspection CLI never exits 0 and does not mutate protected fixture',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-d01-inspect-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'.vcp'));
  const manifest=path.join(root,'.vcp','manifest.json');
  const bytes=Buffer.from('EXISTING USER BYTES; DO NOT EDIT\n');
  await writeFile(manifest,bytes);
  const args=['scripts/inspect-d01-boundary.mjs','--root',root,
    '--protected','.vcp','--protected','.vcp/manifest.json'];
  if(process.platform==='win32'){
    args.push('--legacy-sid','S-1-5-21-100-200-300-1001',
      '--writer-sid','S-1-5-21-100-200-300-1002');
  }else{
    args.push('--legacy-uid','1100','--legacy-gids','1100',
      '--writer-uid','2200');
  }
  const run=spawnSync(process.execPath,args,{
    cwd:path.resolve('.'),shell:false,encoding:'utf8'
  });
  assert.equal(run.error,undefined);
  assert.equal(run.status,3,run.stderr);
  const report=JSON.parse(run.stdout);
  assert.equal(report.status,'NO_GO');
  assert.equal(report.readOnly,undefined); // no invented signed attestation
  assert.equal(report.productionWriterAuthorized,false);
  assert.equal(report.oldPackageExecutionVerified,false);
  assert.equal(report.acceptanceDecision,'NO_GO');
  assert.deepEqual(await readFile(manifest),bytes);
});

test('D-01 inspection requires an explicit root instead of falling back to cwd',()=>{
  const run=spawnSync(process.execPath,['scripts/inspect-d01-boundary.mjs'],{
    cwd:path.resolve('.'),shell:false,encoding:'utf8'
  });
  assert.equal(run.status,2);
  assert.match(run.stderr,/E_D01_INSPECT_USAGE/);
});
