import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLegacyManifestFields } from '../lib/manifest-v1-guard.mjs';
import {
  previewV1ToV2, constructAdaptiveManifest, validateAdaptiveManifest
} from '../lib/manifest-v2.mjs';
import {
  describeVersionedBackup, decodeBackupMetadata,
  describeVersionedTransaction, decodeManagedTransaction
} from '../lib/managed-recovery-v2.mjs';

const READER='1.0.0',DIGEST='a'.repeat(64),TARGET='b'.repeat(64);
function legacy() {
  return {
    schemaVersion:1,installedVersion:'0.9.3',
    installedAt:'2026-01-01T00:00:00.000Z',
    updatedAt:'2026-01-01T00:00:00.000Z',
    install:{agent:'generic',stack:'generic',includeGitHub:true},
    ignoredFiles:[],
    managedFiles:{
      'AGENTS.md':{
        policy:'merge',origin:'core',mode:0o644,baselineHash:DIGEST,
        baselinePath:'.vcp/baselines/AGENTS.md',templateVersion:'0.9.3'
      }
    }
  };
}
function oldManagedBackup() {
  return describeVersionedBackup({
    id:'backup-1',operationId:'backup-1',operation:'update',
    minimumReaderVersion:READER,restoredManifestHash:DIGEST,
    preLockSnapshot:{
      vcpDirectoryExisted:true,manifestExisted:true,
      baselinesExisted:true,installedVersion:'0.9.3',
      lockBootstrapCreatedVcpDirectory:false
    },entries:[]
  });
}
function journal(phase='prepared') {
  return describeVersionedTransaction({
    operationId:'backup-1',backupId:'backup-1',operation:'update',
    minimumReaderVersion:READER,phase,startedAt:'2026-10-09T00:00:00Z',
    plannedManifestHash:TARGET,
    ...(phase==='committed'?{
      committedAt:'2026-10-09T00:00:01Z',committedManifestHash:TARGET
    }:{})
  });
}

test('legacy v1 is strictly enumerable and preserves installed whole-file ownership',()=>{
  const input=legacy();
  assert.equal(validateLegacyManifestFields(input).inertUnknownFields,0);
  const result=previewV1ToV2(input,{readerVersion:READER});
  const descriptor=validateAdaptiveManifest(result,{readerVersion:READER});
  assert.equal(descriptor.assetSet,'legacy-full-v1');
  assert.deepEqual(result.ownership,{'AGENTS.md':{kind:'whole-file'}});
  assert.equal(result.managedFiles['AGENTS.md'].baselinePath,
    '.vcp/baselines/AGENTS.md');
  assert.equal(result.minimumReaderVersion,READER);
  assert.equal(input.schemaVersion,1);
});

test('legacy manifest refuses unrecognized behavior fields and redirected baseline',()=>{
  const extension=legacy();
  extension.install.unknownDesiredAdapter=['claude'];
  assert.throws(()=>validateLegacyManifestFields(extension),{
    code:'E_V1_UNENUMERATED_INSTALL_FIELD'
  });
  const redirected=legacy();
  redirected.managedFiles['AGENTS.md'].baselinePath=
    '.vcp/baselines/CLAUDE.md';
  assert.throws(()=>validateLegacyManifestFields(redirected),{
    code:'E_V1_OWNERSHIP_SHAPE'
  });
});

test('v2 validator rejects unknown fields at root, install, file and ownership',()=>{
  const original=previewV1ToV2(legacy(),{readerVersion:READER});
  for(const mutate of [
    obj=>{obj.unrecognizedBehavior=true;},
    obj=>{obj.install.futureAuthority=true;},
    obj=>{obj.managedFiles['AGENTS.md'].futureOverride=true;},
    obj=>{obj.ownership['AGENTS.md'].futureSectionRule=true;}
  ]) {
    const variant=structuredClone(original);
    mutate(variant);
    assert.throws(()=>validateAdaptiveManifest(variant,{readerVersion:READER}));
  }
});

test('v2 reader blocks older reader and missing or malformed ownership metadata',()=>{
  const manifest=previewV1ToV2(legacy(),{readerVersion:READER});
  assert.throws(()=>validateAdaptiveManifest(manifest,{readerVersion:'0.9.3'}),{
    code:'E_MINIMUM_READER'
  });
  for(const mutate of [
    x=>{delete x.managedFiles;},
    x=>{delete x.ownership;},
    x=>{x.ownership['AGENTS.md'].kind='future-kind';}
  ]) {
    const v=structuredClone(manifest);
    mutate(v);
    assert.throws(()=>validateAdaptiveManifest(v,{readerVersion:READER}));
  }
});

test('explicit adapter provenance is a separate owner claim, never mere observation',()=>{
  const old=legacy();
  old.install.agent='claude';
  old.managedFiles['CLAUDE.md']={
    ...old.managedFiles['AGENTS.md'],
    baselinePath:'.vcp/baselines/CLAUDE.md'
  };
  const result=constructAdaptiveManifest({
    legacyShape:old,readerVersion:READER,assetSet:'greenfield-safe-v1',
    agentIntent:'claude',githubIntent:'unspecified'
  });
  validateAdaptiveManifest(result,{readerVersion:READER});
  assert.equal(result.install.requestedAdapterIntent,'claude');
  assert.deepEqual(result.install.managedAdapterSurface,[{
    path:'CLAUDE.md',ownership:'whole-file',reason:'explicit-request'
  }]);
  const unclaimed=structuredClone(result);
  delete unclaimed.managedFiles['CLAUDE.md'];
  assert.throws(()=>validateAdaptiveManifest(unclaimed,{readerVersion:READER}));
});

test('schema migration backup identity and prior-state must match operation',()=>{
  const backup=oldManagedBackup();
  assert.equal(decodeBackupMetadata(backup,{readerVersion:READER}).operation,'update');
  assert.throws(()=>decodeBackupMetadata({...backup,unexpected:true},{
    readerVersion:READER
  }),{code:'E_BACKUP_UNKNOWN_FIELDS'});
  assert.throws(()=>decodeBackupMetadata({...backup,id:'../escaped'},{
    readerVersion:READER
  }));
  assert.throws(()=>decodeBackupMetadata({
    ...backup,priorManifestExisted:false
  },{readerVersion:READER}));
});

test('schema update transaction requires one exact target manifest digest',()=>{
  const prepared=journal();
  assert.equal(decodeManagedTransaction(prepared,{readerVersion:READER}).phase,
    'prepared');
  assert.equal(decodeManagedTransaction(journal('committed'),{
    readerVersion:READER
  }).committed,true);
  assert.throws(()=>decodeManagedTransaction({
    ...prepared,plannedManifestHash:undefined
  },{readerVersion:READER}),{code:'E_MANAGED_TARGET_HASH_REQUIRED'});
  assert.throws(()=>decodeManagedTransaction({
    ...prepared,backupId:'foreign-1'
  },{readerVersion:READER}),{code:'E_TRANSACTION_BACKUP_IDENTITY'});
  assert.throws(()=>decodeManagedTransaction({
    ...prepared,createdFiles:[{path:'src/a.js',hash:DIGEST,futurePermission:true}]
  },{readerVersion:READER}),{code:'E_CREATED_FILE_UNRECOGNIZED'});
});

test('versioned backup and journal reject case-colliding owned paths',()=>{
  const backup=oldManagedBackup();
  const entry=relative=>({path:relative,exists:true,mode:0o644});
  for(const names of [
    ['docs/README.md','docs/README.md'],
    ['docs/README.md','docs/readme.md']
  ]) {
    assert.throws(()=>decodeBackupMetadata({
      ...backup,entries:names.map(entry)
    },{readerVersion:READER}),{code:'E_BACKUP_ENTRY'});
    assert.throws(()=>decodeManagedTransaction({
      ...journal(),createdFiles:names.map(relative=>({path:relative,hash:DIGEST}))
    },{readerVersion:READER}),{code:'E_TRANSACTION_CREATED'});
  }
});

test('new versioned writers remain disabled before any filesystem interaction',async()=>{
  const {applyAdaptiveGreenfield}=await import('../lib/greenfield-apply-v2.mjs');
  const {applyVersionedManagedSchemaMigration}=
    await import('../lib/managed-schema-migrator.mjs');
  const {recoverInterruptedGreenfield}=
    await import('../lib/greenfield-recovery-apply.mjs');
  for(const invoke of [
    ()=>applyAdaptiveGreenfield({targetDir:'/path/not-created'}),
    ()=>applyVersionedManagedSchemaMigration({targetDir:'/path/not-created'}),
    ()=>recoverInterruptedGreenfield({targetDir:'/path/not-created'})
  ]) {
    await assert.rejects(invoke,{code:'E_G_FENCE_NO_GO'});
  }
});
