import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditHistoricalD01Evidence} from '../scripts/audit-d01-evidence.mjs';

const receiptUrl=new URL('../docs/evidence/stage12-old-cli-fence/linux-observations-20261009.json',import.meta.url);
const load=async()=>JSON.parse(await readFile(receiptUrl,'utf8'));

test('historical published-v0.9.3 Linux receipt proves seven unsafe old-CLI witnesses, never GO',async()=>{
  const report=auditHistoricalD01Evidence(await load());
  assert.equal(report.scenarios,12);
  assert.equal(report.postBackupUserEditLossWitnesses.length,7);
  assert.equal(report.nonMutatingOneFixtureObservations.length,5);
  assert.equal(report.conclusion,'NO_GO__LEGACY_USER_EDIT_LOSS_WITNESSES');
  assert.equal(report.artifactAttested,false);
  assert.equal(report.newPublishedBinaryExecution,false);
  assert.equal(report.gFenceGoAuthorized,false);
});

test('historical receipt tampering cannot turn missing old-CLI negative witness into approval',async()=>{
  const old=await load();
  const modified=structuredClone(old);
  modified.unsafeMutationCount=0;
  assert.throws(()=>auditHistoricalD01Evidence(modified),/INCONSISTENT HISTORICAL RECEIPT/);
  const forged=structuredClone(old);
  forged.results[1].postBackupEditSurvived=true;
  assert.throws(()=>auditHistoricalD01Evidence(forged),/INCONSISTENT HISTORICAL RECEIPT/);
});
