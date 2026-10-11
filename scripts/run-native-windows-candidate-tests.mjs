// Opt-in test runner: native Windows/NTFS scratch checks must NOT pass via
// platform skip or an absent compiled helper. This switch controls testing
// only; it is never consulted by any production lifecycle writer.
import {spawnSync} from 'node:child_process';
if(process.platform!=='win32'){
  console.error('Native Windows/NTFS host required; no WSL or Linux substitution.');
  process.exit(2);
}
const result=spawnSync(process.execPath,[
  '--test','test/stage12-windows-native-scratch.test.mjs'
],{
  shell:false,stdio:'inherit',windowsHide:true,
  env:{...process.env,VCP_TEST_REQUIRE_NATIVE_WINDOWS_SCRATCH:'1'}
});
if(result.error){
  console.error('Native scratch test runner could not execute:',result.error.message);
  process.exit(2);
}
process.exit(result.status??1);
