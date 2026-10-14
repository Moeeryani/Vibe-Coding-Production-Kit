#!/usr/bin/env node
// Strict Linux root-only disposable D-01 DAC experiment. NEVER run as part
// of npm test, npm validate, migration, adoption, doctor or release.
// Requires an operator opt-in and distinct *numeric* Linux OS principals.
//
// The published 0.9.3 CLI is attempted only with an independently
// SHA512-pinned archive and a separate explicit bwrap approval.
// These observations alone cannot prove old writer exclusion.
// A passing diagnostic is NOT a D-01 approval or a durability certificate.
import {writeFile,readFile,lstat} from 'node:fs/promises';
import {provisionD01LinuxFixture,probeD01LinuxFixture,
  stageD01VerifiedOldCliArchive,probeD01PublishedLegacyCli}
  from '../lib/d01-linux-isolation-fixture.mjs';

function refuse(code){
  console.error('E_D01_FIXTURE_INPUT: '+code);
  process.exit(2);
}
const allow=new Set([
  '--old-uid','--old-gid','--writer-uid','--writer-gid','--setpriv',
  '--legacy-tgz','--legacy-sha512',
  '--run-published-in-sandbox','--bwrap'
]);
const args={};
for(let i=2;i<process.argv.length;i+=2){
  const k=process.argv[i],v=process.argv[i+1];
  if(!allow.has(k)||!v||Object.hasOwn(args,k))
    refuse('Only explicit old/writer UID/GID and setpriv options are accepted');
  args[k]=v;
}
function integer(key){
  const value=args[key];
  if(!/^[1-9][0-9]*$/.test(value??''))
    refuse('Must specify '+key+' as a nonzero decimal Linux identity');
  const n=Number(value);
  if(!Number.isSafeInteger(n))refuse('Unsafe UID/GID value');
  return n;
}
if(process.env.VCP_D01_DISPOSABLE_ISOLATION!=='I_UNDERSTAND_DISPOSABLE_ONLY')
  refuse('Set VCP_D01_DISPOSABLE_ISOLATION=I_UNDERSTAND_DISPOSABLE_ONLY');
if(Boolean(args['--legacy-tgz'])!==Boolean(args['--legacy-sha512']))
  refuse('--legacy-tgz and independently supplied --legacy-sha512 are required together');
const runPublished=args['--run-published-in-sandbox']===
  'I_ACCEPT_ISOLATED_OFFLINE_OLD_CLI_EXECUTION';
if(args['--run-published-in-sandbox']&&!runPublished)
  refuse('Published CLI execution requires exact second explicit confirmation');
if(runPublished&&(!args['--legacy-tgz']||
   process.env.VCP_D01_ALLOW_PUBLISHED_CLI_IN_BWRAP!==
     'I_ACCEPT_NETWORK_AND_MOUNT_ISOLATED_EXECUTION'))
  refuse('Published CLI needs staged pinned tarball and second isolation opt-in');
const options={
  oldUid:integer('--old-uid'),oldGid:integer('--old-gid'),
  writerUid:integer('--writer-uid'),writerGid:integer('--writer-gid'),
  setprivPath:args['--setpriv']??'/usr/bin/setpriv'
};
let fixture;
try{
  fixture=await provisionD01LinuxFixture(options);
  const proof=await probeD01LinuxFixture(fixture);
  let staged=null;
  if(args['--legacy-tgz']){
    const archivePath=args['--legacy-tgz'];
    if(!archivePath.startsWith('/')||
       !/^[a-f0-9]{128}$/.test(args['--legacy-sha512']))
      refuse('Supply an absolute .tgz path and independent lower-case SHA512 hex');
    const archiveStat=await lstat(archivePath);
    if(!archiveStat.isFile()||archiveStat.isSymbolicLink()||
       archiveStat.nlink!==1||archiveStat.size>16*1024*1024)
      refuse('Archive path must be a bounded nonlinked regular file');
    const bytes=await readFile(archivePath);
    staged=await stageD01VerifiedOldCliArchive(fixture,{
      archiveBytes:bytes,expectedSha512:args['--legacy-sha512']
    });
  }
  const published=runPublished?
    await probeD01PublishedLegacyCli(fixture,staged,{
      bwrapPath:args['--bwrap']??'/usr/bin/bwrap'
    }):null;
  const combined=Object.freeze({...proof,
    packageStage:staged,publishedCliObservations:published,
    publishedCliEntrypointsTested:false,
    publishedArtifactExecutionAttempted:runPublished,
    publishedArtifactExecutionConfirmed:false,
    managedMutationAuthorized:false,
    d01Approval:false});
  // Receipt is kept inside newly allocated, root-owned evidence namespace.
  // Do not delete fixtures after a failure; forensic contents matter.
  await writeFile(fixture.root+'/isolation-receipt.json',
    JSON.stringify(combined,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify(combined,null,2));
  if(!proof.kernelDacDenialObserved)
    console.error('E_D01_KERNEL_DENIAL_UNPROVEN');
}catch(error){
  console.error(JSON.stringify({
    status:'NO_GO',code:error?.code??'E_D01_FIXTURE_FAILED',
    error:String(error?.message),fixtureRoot:fixture?.root??null,
    cleanupAuthorized:false
  }));
}
// Always exit NO-GO, even when all test-principal DAC probes were blocked.
// A positive standalone diagnostic never certifies the published 0.9.3 CLI.
process.exitCode=3;
