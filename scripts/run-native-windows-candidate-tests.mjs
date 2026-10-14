// Explicit native Windows/NTFS scratch smoke runner. Not a product
// durability acceptance or an authorization to enable managed mutations.
// The executed EXE must match the C++ source and an immediately preceding
// successful local MSVC build receipt. A stale helper is never accepted.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

function fail(reason){
  console.error('E_WINDOWS_SCRATCH_BUILD_UNVERIFIED: '+reason);
  process.exit(2);
}
if(process.platform!=='win32')
  fail('Genuine native Windows/NTFS required; WSL is not Windows.');

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outputDir=path.join(repo,'build','native-windows');
const source=path.join(repo,'scripts','native','vcp-windows-fsops.cpp');
const exe=path.join(outputDir,'vcp-windows-fsops.exe');
const receiptPath=path.join(outputDir,'build-receipt.json');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

let receipt,sourceBytes,exeBytes,exeStat;
try{
  [sourceBytes,exeBytes,exeStat]=await Promise.all([
    readFile(source),readFile(exe),lstat(exe)
  ]);
  receipt=JSON.parse(await readFile(receiptPath,'utf8'));
}catch(e){fail('Missing/broken build receipt or helper: '+String(e.code??e.message));}
if(!exeStat.isFile()||exeStat.isSymbolicLink()||
   receipt.kind!=='VCP_WINDOWS_NATIVE_SCRATCH_BUILD'||
   receipt.platform!=='win32'||
   receipt.executableRelativePath!=='build/native-windows/vcp-windows-fsops.exe'||
   receipt.sourceSha256!==sha256(sourceBytes)||
   receipt.executableSha256!==sha256(exeBytes)||
   receipt.executableBytes!==exeBytes.length||
   receipt.nativeRuntimeAccepted!==false||
   receipt.directoryDurabilityProven!==false||
   receipt.managedMutationAuthorized!==false||
   receipt.d01Approved!==false)
  fail('Source/EXE mismatch, unverified build or unsafe receipt claims. Rebuild with npm run build:native-windows.');

console.log('Native scratch helper SHA256:',receipt.executableSha256);
console.log('Matching C++ source SHA256:',receipt.sourceSha256);
const result=spawnSync(process.execPath,[
  '--test','test/stage12-windows-native-scratch.test.mjs'
],{
  cwd:repo,shell:false,stdio:'inherit',windowsHide:true,
  env:{...process.env,VCP_TEST_REQUIRE_NATIVE_WINDOWS_SCRATCH:'1'}
});
if(result.error)
  fail('Native scratch test runner failed: '+String(result.error.message));
process.exit(result.status??1);
