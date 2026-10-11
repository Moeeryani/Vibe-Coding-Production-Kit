import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,lstat,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {describeStage13Transaction} from '../lib/stage13-transaction.mjs';
import {inspectStage13AbsentClaims,
  inspectStage13AbsentDirectories} from '../lib/stage13-recovery-provenance.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const id='adopt-'+'6'.repeat(32);
async function fixture(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-stage13-provenance-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'.vcp/stage',id,'files'),{recursive:true});
  await mkdir(path.join(root,'.vcp/backups',id,'rollback-claims'),{recursive:true});
  await mkdir(path.join(root,'.vcp/backups',id,'rollback-directories'),
    {recursive:true});
  return root;
}
const exact=async root=>({
  async statIdentity(_,rel){
    let at;
    try{at=await lstat(path.join(root,...rel.split('/')),{bigint:true});}
    catch(e) {
      if(e?.code==='ENOENT') {
        const err=new Error('E_FS_OS_ERROR: ENOENT');
        err.code='E_FS_OS_ERROR';err.errno='ENOENT';throw err;
      }
      throw e;
    }
    return {devExact:at.dev.toString(),inoExact:at.ino.toString(),
      type:at.isDirectory()?'dir':'file'};
  }
});
function ledger(record,dirs=[]){
  return describeStage13Transaction({
    id,rootIdentity:'a'.repeat(64),consentFingerprint:'b'.repeat(64),
    manifestSha256:'c'.repeat(64),minimumReaderVersion:'0.9.4',
    createdAt:'2026-10-11T00:00:00.000Z',phase:'restoring',
    items:[record],createdDirectories:dirs
  });
}
test('missing claim with staged inode is accounted for before apply',async t=>{
  const root=await fixture(t);
  const data=Buffer.from('untouched staged claim');
  const staged=path.join(root,'.vcp/stage',id,'files','AGENTS.md');
  await writeFile(staged,data);
  const stat=await lstat(staged,{bigint:true});
  const tx=ledger({path:'AGENTS.md',kind:'whole-file',oldSha256:null,
    stagedDev:stat.dev.toString(),stagedIno:stat.ino.toString(),
    newSha256:sha(data),baselineSha256:sha(data)});
  const result=await inspectStage13AbsentClaims(root,tx,{
    missingPaths:new Set(['AGENTS.md']),provider:await exact(root)
  });
  assert.equal(result.classification,'ABSENT_CLAIMS_ACCOUNTED_FOR');
  assert.equal(result.evidence[0].classification,'STAGED_NOT_APPLIED');
});
test('missing claim without stage or forensic archive must BLOCK',async t=>{
  const root=await fixture(t);
  const data=Buffer.from('lost file');
  const tx=ledger({path:'AGENTS.md',kind:'whole-file',oldSha256:null,
    stagedDev:'5',stagedIno:'8',
    newSha256:sha(data),baselineSha256:sha(data)});
  const result=await inspectStage13AbsentClaims(root,tx,{
    missingPaths:new Set(['AGENTS.md']),provider:await exact(root)
  });
  assert.equal(result.classification,'BLOCKED');
  assert.equal(result.issues[0].reason,
    'ABSENT_CLAIM_WITHOUT_STAGING_OR_ARCHIVE_PROOF');
});
test('directory proof never treats absent namespace as safely removed',async t=>{
  const root=await fixture(t);
  // A transaction-created directory must own at least one declared
  // descendant. Keep the directory absent to test forensic refusal,
  // but make the immutable WAL itself valid before calling inspector.
  const record={path:'.github/owned.md',kind:'whole-file',oldSha256:null,
    stagedDev:'5',stagedIno:'8',
    newSha256:'d'.repeat(64),baselineSha256:'d'.repeat(64)};
  const dirs=[{path:'.github',kind:'stage13-created-directory',
    dev:'5',ino:'9'}];
  const result=await inspectStage13AbsentDirectories(root,ledger(record,dirs),{
    missingDirectories:new Set(['.github']),provider:await exact(root)
  });
  assert.equal(result.classification,'BLOCKED');
  assert.equal(result.issues[0].reason,
    'ABSENT_DIRECTORY_WITHOUT_STAGED_OR_ARCHIVE_PROOF');
});
test('archived directory identity is recognized without restoring its name',async t=>{
  const root=await fixture(t);
  const claimed='.github';
  const archival=path.join(root,'.vcp/backups',id,
    'rollback-directories',sha(Buffer.from(claimed))+'.dir');
  await mkdir(archival);
  const stat=await lstat(archival,{bigint:true});
  const record={path:'.github/owned.md',kind:'whole-file',oldSha256:null,
    stagedDev:'5',stagedIno:'8',
    newSha256:'d'.repeat(64),baselineSha256:'d'.repeat(64)};
  const dirs=[{path:claimed,kind:'stage13-created-directory',
    dev:stat.dev.toString(),ino:stat.ino.toString()}];
  const proof=await inspectStage13AbsentDirectories(root,ledger(record,dirs),{
    missingDirectories:new Set([claimed]),provider:await exact(root)
  });
  assert.equal(proof.classification,'ABSENT_DIRECTORIES_ACCOUNTED_FOR');
  assert.equal(proof.evidence[0].classification,'FORENSICALLY_ARCHIVED');
});
