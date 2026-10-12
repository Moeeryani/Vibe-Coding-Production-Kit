// Stage12 Windows D-01 read-only native helper source boundary.
// Static checks are tripwires, NOT a substitute for native MSVC/NTFS testing.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const cpp='scripts/native/vcp-windows-d01-token-inspect.cpp';
const build='scripts/build-windows-d01-readonly.mjs';

test('D-01 token inspector observes ACLs but never contains a Win32 mutation primitive',async()=>{
  const src=await readFile(cpp,'utf8');
  assert.match(src,/GetSecurityInfo\(/);
  assert.match(src,/AccessCheck\(/);
  assert.match(src,/OpenProcessToken\(/);
  assert.match(src,/FILE_FLAG_OPEN_REPARSE_POINT/);
  assert.match(src,/FILE_READ_ATTRIBUTES\|READ_CONTROL/);
  assert.match(src,/OPEN_EXISTING/);
  assert.match(src,/FILE_ADD_FILE/); // rights INSPECTION only
  assert.match(src,/status\":\"NO_GO|status\\":\\"NO_GO|NO_GO/);
  for(const mutator of [
    /\bSetNamedSecurityInfoW\s*\(/,/\bSetSecurityInfo\s*\(/,
    /\bSetFileInformationByHandle\s*\(/,/\bMoveFileExW\s*\(/,
    /\bReplaceFileW\s*\(/,/\bDeleteFileW\s*\(/,
    /\bRemoveDirectoryW\s*\(/,/\bCreateDirectoryW\s*\(/,
    /\bWriteFile\s*\(/,/\bFILE_FLAG_DELETE_ON_CLOSE\b/,
    /\bCREATE_NEW\b/,/\bCREATE_ALWAYS\b/,/\bTRUNCATE_EXISTING\b/,
    /\bOPEN_ALWAYS\b/,/\bFILE_WRITE_DATA\s*\|\s*GENERIC_WRITE\b/
  ])assert.doesNotMatch(src,mutator);
});

test('Windows D-01 native inspector build stays in unshipped build folder',async()=>{
  const src=await readFile(build,'utf8');
  assert.match(src,/process\.platform!=='win32'/);
  assert.match(src,/build','native-windows','d01-readonly'/);
  assert.match(src,/sourceSha256/);
  assert.match(src,/executableSha256/);
  assert.match(src,/verifiedRepeatBuild/);
  assert.match(src,/managedMutationAuthorized:false/);
  assert.match(src,/d01Approved:false/);
  if(process.platform!=='win32'){
    const run=spawnSync(process.execPath,[build],{
      cwd:path.resolve('.'),shell:false,encoding:'utf8'
    });
    assert.equal(run.status,2);
    assert.match(run.stderr,/E_D01_WINDOWS_BUILD/);
  }
});
