#!/usr/bin/env node
// Static, fail-closed protection for the deliberately reduced Stage12 candidate.
// Does not execute any writer and cannot authorize D-01 or release approval.
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditHistoricalD01Evidence} from './audit-d01-evidence.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const load=relative=>readFile(path.join(root,...relative.split('/')),'utf8');
function deny(message){const e=new Error('E_STAGE12_BOUNDARY: '+message);e.code='E_STAGE12_BOUNDARY';throw e;}
const required=[
  'docs/STAGE12-SAFE-SUBSET-ACCEPTANCE-PROPOSAL.md',
  'docs/STAGE12-HISTORICAL-FAILURE-TRIAGE.md',
  'docs/evidence/stage12-old-cli-fence/linux-observations-20261009.json',
  'docs/evidence/stage12-old-cli-fence/windows-observations-20261009.json',
  'test/stage12-init-gate.test.mjs',
  'test/stage12-preview-security.test.mjs',
  'test/legacy-v1-fixture-boundaries.test.mjs'
];

export async function inspectStage12ReadOnlyContract(){
  const [gate,init,writer,scope,...remaining]=await Promise.all([
    load('lib/managed-migration.mjs'),load('lib/init.mjs'),
    load('lib/greenfield-apply-v2.mjs'),
    ...[...required].map(load)
  ]);
  // The sources array includes scope first; no validation is a release gate.
  const allDocs=[scope,...remaining];
  if(!/status:\s*'NO_GO'/.test(gate)||
    !/managedV2MutationAuthorized:\s*false/.test(gate)||
    !/function assertManagedMigrationGate\(\)/.test(gate))
    deny('hard migration gate declaration changed');
  const lastInitGate=init.lastIndexOf('assertManagedMigrationGate();');
  const write=init.indexOf('await mkdir(target,{recursive:true})');
  if(lastInitGate<0||write<=lastInitGate||
    !init.includes('Stage13 owns first adoption apply'))
    deny('public init writes before gate or enables brownfield apply');
  if(writer.indexOf('assertManagedMigrationGate();')<0||
    writer.indexOf('assertManagedMigrationGate();')>writer.indexOf('await prepareAdaptiveGreenfield'))
    deny('v2 greenfield writer no longer fail-closed');
  if(!allDocs[0].includes('Status: DRAFT')||
    !allDocs[0].includes('Stage13')||
    !allDocs[0].includes('AC-004/005/006'))
    deny('scope exclusions missing or altered');
  const receipts=await Promise.all([
    load('docs/evidence/stage12-old-cli-fence/linux-observations-20261009.json'),
    load('docs/evidence/stage12-old-cli-fence/windows-observations-20261009.json')
  ]);
  const audited=receipts.map(x=>auditHistoricalD01Evidence(JSON.parse(x)));
  if(audited[0].scenarios!==12||audited[0].postBackupUserEditLossWitnesses.length!==7||
    audited[1].scenarios!==13||audited[1].postBackupUserEditLossWitnesses.length!==8||
    audited.some(x=>x.gFenceGoAuthorized||x.artifactAttested))
    deny('D-01 failure witnesses modified, missing or mischaracterized');
  const dirs=['lib','bin','scripts'];
  for(const dir of dirs){
    const names=await readdir(path.join(root,dir));
    for(const name of names.filter(n=>n.endsWith('.mjs'))){
      const source=await load(dir+'/'+name);
      if(source.includes("from '../test/helpers/legacy-v1-fixture.mjs'")||
         source.includes("from './test/helpers/legacy-v1-fixture.mjs'"))
        deny('test-only v1 fixture imported by production source: '+dir+'/'+name);
    }
  }
  return Object.freeze({status:'PASS_READ_ONLY_BOUNDARIES',
    gFence:'NO_GO',stage12FullAccepted:false,
    readOnlySubsetAccepted:false,
    legacyV1FixtureProductionImports:0,
    receipts:audited.map(x=>({platform:x.historicalPlatform,
      scenarios:x.scenarios,unsafe:x.postBackupUserEditLossWitnesses.length,
      conclusion:x.conclusion}))});
}

async function main(){
  const value=await inspectStage12ReadOnlyContract();
  console.log(JSON.stringify(value,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
