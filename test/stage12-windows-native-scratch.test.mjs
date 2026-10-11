// Native Windows-only, disposable scratch-namespace conformance.
// Run after "npm run build:native-windows" on a genuine NTFS host.
// The productive Stage12/13 writer remains G-FENCE NO-GO; this suite never
// opens an existing user project or pretends successful directory flush
// attests power-loss durability.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,lstat,symlink,access,link,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {
  WindowsNamespaceScratchCandidate,DEFAULT_WINDOWS_SCRATCH_HELPER,
  WINDOWS_NATIVE_SCRATCH_MARKER,windowsNativeCandidateStatus
} from '../lib/windows-fs-provider-candidate.mjs';
import {MANAGED_SCHEMA_MIGRATION_GATE} from '../lib/managed-migration.mjs';

test('Windows native candidate never authorizes managed writes',async t=>{
  assert.equal(windowsNativeCandidateStatus().mutationAuthorized,false);
  assert.equal(windowsNativeCandidateStatus().productionBackendConnected,false);
  assert.equal(MANAGED_SCHEMA_MIGRATION_GATE.managedV2MutationAuthorized,false);
  if(process.platform!=='win32'){
    assert.throws(()=>new WindowsNamespaceScratchCandidate({
      root:os.tmpdir()
    }),{code:'E_WINDOWS_NATIVE_REQUIRED'});
    return t.skip('native Windows NTFS required for scratch filesystem operations');
  }
  if(process.env.VCP_TEST_REQUIRE_NATIVE_WINDOWS_SCRATCH!=='1'){
    return t.skip('native scratch candidate requires explicit test:native-windows-candidate');
  }
  // Explicit Windows acceptance cannot skip a missing native binary. The
  // compiled helper must exist and the next call must emit a valid receipt.
  await access(DEFAULT_WINDOWS_SCRATCH_HELPER);
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-win-native-scratch-'));
  const foreign=await mkdtemp(path.join(os.tmpdir(),'vcp-win-native-foreign-'));
  t.after(async()=>{
    await rm(root,{recursive:true,force:true});
    await rm(foreign,{recursive:true,force:true});
  });
  const foreignPath=path.join(foreign,'user.txt');
  const foreignBytes=Buffer.from('OUTSIDER USER BYTES\r\n');
  await writeFile(foreignPath,foreignBytes);
  // Even a deliberate invocation of the C++ EXE must refuse another
  // TEMP child that is not named as its disposable scratch namespace.
  // A marker copied into an unrelated directory does NOT grant trust.
  await writeFile(path.join(foreign,'VCP-STAGE12-DISPOSABLE-ONLY.marker'),
    WINDOWS_NATIVE_SCRATCH_MARKER);
  const unauthorized=spawnSync(DEFAULT_WINDOWS_SCRATCH_HELPER,[
    '--scratch-root',foreign,'--op','write-exclusive','vcp-stage12-evil.bin'
  ],{input:Buffer.from('UNAUTHORIZED'),encoding:'utf8',windowsHide:true});
  assert.equal(unauthorized.error,undefined);
  assert.equal(unauthorized.status,3);
  await assert.rejects(()=>lstat(path.join(foreign,'vcp-stage12-evil.bin')),
    {code:'ENOENT'});
  assert.deepEqual(await readFile(foreignPath),foreignBytes);
  await writeFile(path.join(root,'VCP-STAGE12-DISPOSABLE-ONLY.marker'),
    WINDOWS_NATIVE_SCRATCH_MARKER);
  const candidate=new WindowsNamespaceScratchCandidate({root});
  assert.equal((await candidate.inspectScratchRoot()).disposableOnly,true);
  const caps=await candidate.capabilities();
  assert.equal(caps.completed,true);
  assert.equal(caps.managedMutationAuthorized,false);
  assert.equal(caps.directoryDurabilityProven,false);

  async function mutating(call){
    try{
      const receipt=await call();
      assert.equal(receipt.completed,true);
      assert.equal(receipt.managedMutationAuthorized,false);
      assert.equal(receipt.directoryDurabilityProven,false);
    }catch(e){
      if(e?.code!=='E_DIRECTORY_SYNC_UNPROVEN')throw e;
      // The filesystem operation HAS completed and is not necessarily
      // durable; never convert this exception into a success receipt.
      assert.equal(e.nativeReceipt.completed,true);
      assert.equal(e.nativeReceipt.directoryFlushReturned,false);
    }
  }

  const bytes=Buffer.from('NATIVE DISPOSABLE FILE\r\n');
  const src='vcp-stage12-owned.bin',dst='vcp-stage12-moved.bin';
  await mutating(()=>candidate.writeExclusive(src,bytes));
  assert.deepEqual(await readFile(path.join(root,src)),bytes);
  await mutating(()=>candidate.renameNoReplace(src,dst));
  assert.deepEqual(await readFile(path.join(root,dst)),bytes);
  // A duplicate CREATE_NEW must preserve both the old bytes and the
  // "no mutation" receipt. Distinguish this from partial write failure.
  await assert.rejects(()=>candidate.writeExclusive(dst,
    Buffer.from('ATTACKER REPLACEMENT')),e=>{
      assert.equal(e.code,'E_WINDOWS_SCRATCH_OPERATION_FAILED');
      assert.equal(e.nativeReceipt?.completed,false);
      assert.equal(e.nativeReceipt?.mayHaveMutated,false);
      assert.equal(e.requiresForensicInspection,false);
      return true;
    });
  assert.deepEqual(await readFile(path.join(root,dst)),bytes);

  // A no-replace collision is never a license to remove/overwrite either
  // side. The outcome is conservatively classified as "attempted".
  const collision='vcp-stage12-collision.bin';
  const collisionBytes=Buffer.from('PREEXISTING USER BYTES\r\n');
  await mutating(()=>candidate.writeExclusive(collision,collisionBytes));
  await assert.rejects(()=>candidate.renameNoReplace(dst,collision),e=>{
    assert.equal(e.code,'E_WINDOWS_SCRATCH_OPERATION_FAILED');
    assert.equal(e.nativeReceipt?.completed,false);
    assert.equal(e.nativeReceipt?.mayHaveMutated,true);
    assert.equal(e.requiresForensicInspection,true);
    return true;
  });
  assert.deepEqual(await readFile(path.join(root,dst)),bytes);
  assert.deepEqual(await readFile(path.join(root,collision)),collisionBytes);

  // A hard link aliases the exact foreign file identity without being a
  // reparse point. The native DELETE-capable handle must reject nNumberOfLinks
  // > 1 before disposition or rename, preserving both names and all bytes.
  const hardAlias='vcp-stage12-hardlink.bin';
  await link(foreignPath,path.join(root,hardAlias));
  await assert.rejects(()=>candidate.unlink(hardAlias),e=>{
    assert.equal(e.code,'E_WINDOWS_SCRATCH_HELPER_PROTOCOL');
    assert.equal(e.nativeOutcomeUnknown,true);
    assert.equal(e.requiresForensicInspection,true);
    return true;
  });
  assert.deepEqual(await readFile(path.join(root,hardAlias)),foreignBytes);
  assert.deepEqual(await readFile(foreignPath),foreignBytes);

  // A directory disposition must refuse an occupied folder at the OS
  // boundary. There must be no recursive deletion or fallback cleanup.
  const occupied='vcp-stage12-occupied';
  await mkdir(path.join(root,occupied));
  const occupant=path.join(root,occupied,'unowned-user-file.txt');
  const occupantBytes=Buffer.from('UNOWNED DIRECTORY CONTENTS\r\n');
  await writeFile(occupant,occupantBytes);
  await assert.rejects(()=>candidate.rmdirEmpty(occupied),e=>{
    assert.equal(e.code,'E_WINDOWS_SCRATCH_OPERATION_FAILED');
    assert.equal(e.nativeReceipt?.mayHaveMutated,true);
    assert.equal(e.requiresForensicInspection,true);
    return true;
  });
  assert.deepEqual(await readFile(occupant),occupantBytes);
  await assert.rejects(()=>candidate.unlink('../FOREIGN.txt'),{
    code:'E_WINDOWS_SCRATCH_NAME'
  });
  await mutating(()=>candidate.mkdirExclusive('vcp-stage12-emptydir'));
  await mutating(()=>candidate.rmdirEmpty('vcp-stage12-emptydir'));
  await mutating(()=>candidate.unlink(dst));
  await mutating(()=>candidate.unlink(collision));
  // Test-only cleanup of an exactly created, known hardlink name. The
  // candidate itself deliberately refuses to delete linked objects.
  await rm(path.join(root,hardAlias));
  await assert.rejects(()=>lstat(path.join(root,dst)),{code:'ENOENT'});

  // Extra, untrusted root entry must block ALL operations, including
  // capabilities. Never read through or delete the linked target.
  await symlink(foreignPath,path.join(root,'vcp-stage12-linked'),'file');
  await assert.rejects(()=>candidate.capabilities(),{
    code:'E_WINDOWS_SCRATCH_HELPER_PROTOCOL'
  });
  assert.deepEqual(await readFile(foreignPath),foreignBytes);
});
