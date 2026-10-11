import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {buildManifest} from '../lib/state.mjs';
import {constructAdaptiveManifest} from '../lib/manifest-v2.mjs';
import {inspectStage13CommittedOrphanLock,
  retireStage13CommittedOrphanLock
} from '../lib/stage13-committed-orphan-lock.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const ID='adopt-'+'7'.repeat(32);
const consent='9'.repeat(64);
const content=Buffer.from('Guide project.\n');
const provider={async statIdentity(_,relative) {
  if(relative!=='AGENTS.md')throw Error('unexpected identity lookup');
  return {devExact:'4',inoExact:'9007199254740993',type:'file'};
}};
async function fixture(t) {
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-stage13-final-orphan-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'.vcp/backups',ID),{recursive:true});
  await mkdir(path.join(root,'.vcp/baselines'));
  await writeFile(path.join(root,'AGENTS.md'),content);
  await writeFile(path.join(root,'.vcp/baselines/AGENTS.md'),content);
  const entries=new Map([['AGENTS.md',{
    content:content.toString('utf8'),mode:0o644,policy:'managed',
    origin:'brownfield-routing-v1'
  }]]);
  const legacy=buildManifest({version:'0.9.4',agent:'generic',
    stack:'generic',includeGitHub:false,files:entries});
  legacy.install.requestedStack='auto';
  const manifest=constructAdaptiveManifest({legacyShape:legacy,
    assetSet:'brownfield-minimal-v1',readerVersion:'0.9.4'});
  const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
  await writeFile(path.join(root,'.vcp/manifest.json'),manifestBytes);
  const lock=JSON.stringify({version:2,mode:'adopt',pid:process.pid,
    host:os.hostname(),token:'a'.repeat(48),operationId:ID,
    consentFingerprint:consent,bootstrapPriorVcpAbsent:true,
    startedAt:new Date().toISOString()})+'\n';
  await writeFile(path.join(root,'.vcp/update.lock'),lock);
  const rootInfo=await lstat(root);
  const rootIdentity=sha(Buffer.from(root+'|'+rootInfo.dev+'|'+rootInfo.ino));
  await writeFile(path.join(root,'.vcp/backups',ID,'backup.json'),
    JSON.stringify({kind:'stage13-complete-recovery-point',formatVersion:3,
      id:ID,previousVcpAbsent:true,rootIdentity,
      consentFingerprint:consent,minimumReaderVersion:'0.9.4',
      manifestSha256:sha(manifestBytes),createdDirectories:[],
      items:[{path:'AGENTS.md',kind:'whole-file',oldSha256:null,
        newSha256:sha(content),baselineSha256:sha(content),
        stagedDev:'4',stagedIno:'9007199254740993'}]
    },null,2)+'\n');
  return root;
}
test('Stage13 committed orphan recognizes valid manifest, ledger and still-live lock',async t=>{
  const root=await fixture(t);
  const before=await readFile(path.join(root,'AGENTS.md'));
  const report=await inspectStage13CommittedOrphanLock(root,{provider});
  assert.equal(report.classification,'LOCK_OWNER_MAY_BE_ALIVE');
  assert.equal(report.writeAuthorized,false);
  assert.equal(report.verifiedManagedFiles,1);
  assert.equal(report.manifestSha256.length,64);
  assert.deepEqual(await readFile(path.join(root,'AGENTS.md')),before);
  assert.ok((await readdir(path.join(root,'.vcp'))).includes('update.lock'));
});
test('Stage13 committed orphan refuses changed original user document',async t=>{
  const root=await fixture(t);
  await writeFile(path.join(root,'AGENTS.md'),'foreign user edit');
  const report=await inspectStage13CommittedOrphanLock(root,{provider});
  assert.equal(report.classification,'BLOCKED');
  assert.equal(report.reason,'FINALIZED_ADOPTION_USER_FILE_CHANGED');
});
test('Stage13 committed orphan never authorizes releasing the live lock',async t=>{
  const root=await fixture(t);
  await assert.rejects(()=>retireStage13CommittedOrphanLock({
    targetDir:root,approval:{kind:'RETIRE_COMMITTED_STAGE13_ORPHAN_LOCK',
      root,explicitConsent:true}
  }),{code:'E_G_FENCE_NO_GO'});
  assert.equal((await readdir(path.join(root,'.vcp'))).includes('update.lock'),
    true);
});
