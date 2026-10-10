import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectStage12ReadOnlyContract} from '../scripts/check-stage12-readonly-contract.mjs';

test('Stage12 subset guard refuses to mistake negative Linux/Windows witness evidence for migration GO',async()=>{
  const report=await inspectStage12ReadOnlyContract();
  assert.equal(report.status,'PASS_READ_ONLY_BOUNDARIES');
  assert.equal(report.gFence,'NO_GO');
  assert.equal(report.stage12FullAccepted,false);
  assert.equal(report.readOnlySubsetAccepted,false);
  assert.equal(report.legacyV1FixtureProductionImports,0);
  assert.deepEqual(report.receipts.map(r=>r.platform),['linux','win32']);
  assert.deepEqual(report.receipts.map(r=>r.scenarios),[12,13]);
  assert.deepEqual(report.receipts.map(r=>r.unsafe),[7,8]);
});
