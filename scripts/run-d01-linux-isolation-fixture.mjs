#!/usr/bin/env node
// Strict Linux root-only disposable D-01 DAC experiment. NEVER run as part
// of npm test, npm validate, migration, adoption, doctor or release.
// Requires an operator opt-in and distinct *numeric* Linux OS principals.
//
// No published 0.9.3 CLI is executed by this diagnostic; testing old real
// package entrypoints under isolated identities is a separate gate.
// A passing diagnostic is NOT a D-01 approval or a durability certificate.
import {writeFile} from 'node:fs/promises';
import {provisionD01LinuxFixture,probeD01LinuxFixture}
  from '../lib/d01-linux-isolation-fixture.mjs';

function refuse(code){
  console.error('E_D01_FIXTURE_INPUT: '+code);
  process.exit(2);
}
const allow=new Set([
  '--old-uid','--old-gid','--writer-uid','--writer-gid','--setpriv'
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
const options={
  oldUid:integer('--old-uid'),oldGid:integer('--old-gid'),
  writerUid:integer('--writer-uid'),writerGid:integer('--writer-gid'),
  setprivPath:args['--setpriv']??'/usr/bin/setpriv'
};
let fixture;
try{
  fixture=await provisionD01LinuxFixture(options);
  const proof=await probeD01LinuxFixture(fixture);
  // Receipt is kept inside newly allocated, root-owned evidence namespace.
  // Do not delete fixtures after a failure; forensic contents matter.
  await writeFile(fixture.root+'/isolation-receipt.json',
    JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify(proof,null,2));
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
