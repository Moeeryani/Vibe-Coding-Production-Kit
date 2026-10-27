import test from 'node:test';
import assert from 'node:assert/strict';
import { runMechanicalGate, mechanicalGateExitCode } from '../lib/gate-run.mjs';

test('explicit boolean run flag is required',async()=>{
 await assert.rejects(runMechanicalGate({run:'yes'}),{code:'E_GATE_RUN_FLAG'});
});
test('task cannot be an invalid slug or object',async()=>{
 for(const task of ['../escape','CamelCase','has spaces',{},['a']]) {
  await assert.rejects(runMechanicalGate({task}),{code:'E_GATE_TASK'});
 }
});
test('level is bounded by explicit L0–L3 values',async()=>{
 await assert.rejects(runMechanicalGate({minimumLevel:'L4'}),{code:'E_GATE_MINIMUM_LEVEL'});
});
test('only requires a bounded list of nonempty strings',async()=>{
 await assert.rejects(runMechanicalGate({only:['']}),{code:'E_GATE_ONLY'});
 await assert.rejects(runMechanicalGate({only:'CHECK_COMMAND'}),{code:'E_GATE_ONLY'});
});
test('timeouts are bounded and do not permit negative/unbounded delays',async()=>{
 for(const timeoutMs of [0,-1,3600001,1.5]) {
  await assert.rejects(runMechanicalGate({timeoutMs}),{code:'E_GATE_TIMEOUT'});
 }
});
test('any nonblocked result still exits nonzero and can never authorize CI success',()=>{
 assert.equal(mechanicalGateExitCode({status:'EVIDENCE_ONLY_NOT_APPROVED'}),2);
 assert.equal(mechanicalGateExitCode({status:'PREVIEW_ONLY'}),2);
 assert.equal(mechanicalGateExitCode({status:'BLOCKED'}),1);
});
