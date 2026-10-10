#!/usr/bin/env node
// Historical read-only boundary check retained for FULL original Stage12.
// Source inspection is not a test receipt and cannot authorize D-01 or release.
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
  // Guard the otherwise directly-importable Stage12 write primitives.
  // These are static tripwires only; native filesystem testing remains
  // mandatory on the frozen combined head.
  const protectedExports=[
    ['lib/versioned-backup.mjs','createManagedSchemaBackup'],
    ['lib/versioned-backup.mjs','createGreenfieldRecoveryBackup'],
    ['lib/versioned-journal.mjs','writeVersionedJournal'],
    ['lib/versioned-journal.mjs','clearVersionedJournal'],
    ['lib/safe-create.mjs','createOwnedPathExclusively'],
    ['lib/managed-schema-migrator.mjs','replaceManifestAtomically']
  ];
  for(const [file,exported] of protectedExports) {
    const source=await load(file);
    const declaration=source.indexOf('export async function '+exported+'(');
    if(declaration<0)deny('versioned write primitive missing: '+file+'#'+exported);
    const untilNext=source.indexOf('export async function ',declaration+1);
    const scope=source.slice(declaration,untilNext<0?undefined:untilNext);
    if(!scope.includes('assertManagedMigrationGate();'))
      deny('direct primitive bypasses D-01 gate: '+file+'#'+exported);
  }
  const [durability,lock,replace]=await Promise.all([
    load('lib/file-durability.mjs'),
    load('lib/lifecycle-lock-v2.mjs'),load('lib/safe-replace.mjs')
  ]);
  if(!durability.includes('WINDOWS_NAMESPACE_DURABILITY_UNPROVEN')||
    !durability.includes('assertLifecycleDurabilitySupported')||
    !lock.includes('await assertLifecycleDurabilitySupported(root);')||
    !replace.includes('await assertLifecycleDurabilitySupported(root);')) {
    deny('lifecycle or replacement durability preflight missing');
  }
  const greenRecovery=await load('lib/greenfield-recovery-apply.mjs');
  const phaseProof=greenRecovery.indexOf("phase:'recovering'");
  const firstDeletion=greenRecovery.indexOf('for(const action of actions)await unlinkMatching');
  if(phaseProof<0||firstDeletion<0||phaseProof>firstDeletion||
    !greenRecovery.includes('await syncContainingDirectory(data.file);')) {
    deny('first-init recovery lost its pre-deletion journal or durable unlink');
  }
  const terminalPlanner=await load('lib/greenfield-recovery-plan.mjs');
  const terminalReader=await load('lib/managed-recovery-v2.mjs');
  const phaseWriter=await load('lib/versioned-journal.mjs');
  const checkpointAt=greenRecovery.indexOf("phase:'cleanup'");
  const backupDeleteAt=greenRecovery.indexOf('await unlinkMatching(root,metadataRel');
  if(checkpointAt<0||backupDeleteAt<0||checkpointAt>=backupDeleteAt||
    !terminalPlanner.includes("classification:'TERMINAL_CLEANUP_CANDIDATE'")||
    !terminalPlanner.includes('CREATED_FILE_STILL_PRESENT')||
    !terminalPlanner.includes('CREATED_DIRECTORY_STILL_PRESENT')||
    !terminalPlanner.includes('MAX_PLAN_FILE_BYTES=64*1024*1024')||
    !terminalPlanner.includes('plannedFileAbsent(root,entry.path)')||
    !terminalReader.includes('cleanupBackupHash')||
    !phaseWriter.includes("recovering:['cleanup']")) {
    deny('restartable terminal greenfield control cleanup proof is missing');
  }
  const dirs=['lib','bin','scripts'];
  for(const dir of dirs){
    const names=await readdir(path.join(root,dir));
    for(const name of names.filter(n=>n.endsWith('.mjs'))){
      const source=await load(dir+'/'+name);
      if(source.split('\n').some(line=>
        /^\s*import\s+.*\bfrom\s+['"][^'"]*legacy-v1-fixture\.mjs['"]/.test(line)))
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
