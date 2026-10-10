#!/usr/bin/env node
// Static Stage13 construction contract. This script MUST NOT be executed
// until the user-declared final test phase. Source checks are NOT proofs of
// filesystem atomicity, Windows NTFS durability, old-CLI compatibility or
// adoption approval. It cannot turn D-01/G-FENCE into GO.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>readFile(path.join(root,...relative.split('/')),'utf8');
function fail(message){
  const error=new Error('E_STAGE13_CONSTRUCTION_CONTRACT: '+message);
  error.code='E_STAGE13_CONSTRUCTION_CONTRACT';throw error;
}
function includes(source,need,file) {
  if(!source.includes(need))fail(file+' lost required boundary: '+need);
}
export async function inspectStage13ConstructionContract() {
  const files=[
    'lib/managed-migration.mjs',
    'lib/stage13-brownfield-preflight.mjs',
    'lib/stage13-materialize.mjs',
    'lib/stage13-directory-ownership.mjs',
    'lib/stage13-transaction.mjs',
    'lib/stage13-apply.mjs',
    'lib/stage13-recovery-contract.mjs',
    'lib/stage13-recovery-plan.mjs',
    'lib/stage13-recovery-apply.mjs',
    'lib/stage13-finalize.mjs',
    'lib/stage13-identity.mjs',
    'lib/lifecycle-lock-v2.mjs',
    'lib/adoption-inspect.mjs',
    'lib/cli.mjs',
    'scripts/native/vcp-linux-fsops.cpp'
  ];
  const contents=new Map(await Promise.all(files.map(async name=>
    [name,await read(name)])));
  const part=name=>contents.get(name);
  includes(part(files[0]),"status:'NO_GO'",files[0]);
  includes(part(files[0]),'managedV2MutationAuthorized:false',files[0]);
  includes(part(files[1]),'EXPLICIT_ADOPTION_DECISION_REQUIRED',files[1]);
  includes(part(files[1]),'intentFingerprint',files[1]);
  includes(part(files[2]),'composeInitialManagedSection',files[2]);
  includes(part(files[2]),'E_STAGE13_PREIMAGE_CHANGED',files[2]);
  includes(part(files[3]),'firstMissingAncestor',files[3]);
  includes(part(files[3]),'requiresStagedNativeNoReplace',files[3]);
  includes(part(files[4]),'createdDirectories',files[4]);
  includes(part(files[4]),'E_STAGE13_CHANGED_LEDGER',files[4]);
  includes(part(files[5]),'assertManagedMigrationGate();',files[5]);
  includes(part(files[5]),"mode:'adopt'",files[5]);
  includes(part(files[5]),'stage13ClaimStagingPath',files[5]);
  includes(part(files[5]),'provider.moveNoReplace',files[5]);
  includes(part(files[5]),'E_STAGE13_SECTION_ATOMIC_CAS_UNAVAILABLE',files[5]);
  if(part(files[5]).includes('await rename('))
    fail('Stage13 adopted a racy plain rename fallback');
  includes(part(files[6]),'CREATED_INODE_NOT_OWNED',files[6]);
  includes(part(files[6]),'CREATED_DIRECTORY_REPLACED',files[6]);
  includes(part(files[7]),'exactNativeIdentity',files[7]);
  includes(part(files[8]),'assertManagedMigrationGate();',files[8]);
  includes(part(files[8]),'removeEmptyDirectory',files[8]);
  if(part(files[8]).includes('recursive:true'))
    fail('Stage13 recovery adopted unbounded recursive deletion');
  includes(part(files[9]),'inspectCommittedStage13',files[9]);
  includes(part(files[9]),"'.vcp/transaction.json'",files[9]);
  includes(part(files[10]),'9007199254740993',files[10].includes('9007199254740993')?
    files[10]:'test/stage13-nested-recovery.test.mjs');
  includes(part(files[11]),'inspectOwnedAdoptionBootstrap',files[11]);
  includes(part(files[12]),'ownedBootstrapLock',files[12]);
  includes(part(files[13]),'--confirm-adoption',files[13]);
  includes(part(files[13]),'--adopt',files[13]);
  includes(part(files[14]),'devExact',files[14]);
  includes(part(files[14]),'inoExact',files[14]);
  return Object.freeze({
    status:'STAGE13_SOURCE_CONSTRUCTION_PRESENT_ONLY',
    fullStage13Accepted:false,
    approvalRequired:true,gFence:'NO_GO',testEvidenceProvided:false,
    sourceFilesInspected:files.length
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  inspectStage13ConstructionContract().then(report=>{
    console.log(JSON.stringify(report,null,2));
  }).catch(error=>{console.error(error.message);process.exitCode=1;});
