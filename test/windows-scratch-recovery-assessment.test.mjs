import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessWindowsScratchRecovery}
  from '../lib/windows-scratch-recovery-assessment.mjs';

const absent={exists:false,kind:'ABSENT',identity:'',sizeBytes:'0'};
const src={exists:true,kind:'REGULAR',identity:'a'.repeat(24),sizeBytes:'24'};
const collision={exists:true,kind:'REGULAR',identity:'b'.repeat(24),sizeBytes:'18'};
const dir={exists:true,kind:'DIRECTORY',identity:'c'.repeat(24),sizeBytes:'0'};
const flags=r=>{
  assert.equal(r.status,'NO_GO');
  assert.equal(r.readOnly,true);
  assert.equal(r.managedMutationAuthorized,false);
  assert.equal(r.safeToRetry,false);
  assert.equal(r.safeToRollback,false);
  assert.equal(r.safeToDelete,false);
  assert.equal(r.powerLossSurvivalProven,false);
};

test('same-file-id observed rename is NOT durability or authorization proof',()=>{
  const r=assessWindowsScratchRecovery({
    operation:'rename-no-replace',
    before:{source:src,destination:absent},
    after:{source:absent,destination:src},
    nativeOutcomeUnknown:true
  });
  assert.equal(r.assessment,'OBSERVED_RENAMED_SAME_FILE_ID');
  assert.equal(r.nativeOutcomeUnknown,true);
  flags(r);
});

test('refused rename collision preserves source and destination identity without granting retry',()=>{
  const r=assessWindowsScratchRecovery({
    operation:'rename-no-replace',
    before:{source:src,destination:collision},
    after:{source:src,destination:collision}
  });
  assert.equal(r.assessment,'OBSERVED_NO_VISIBLE_CHANGE');
  flags(r);
});

test('overwrite, split rename and file-ID mismatch stay indeterminate',()=>{
  for(const after of [
    {source:src,destination:src},
    {source:absent,destination:collision},
    {source:absent,destination:absent}
  ]){
    const r=assessWindowsScratchRecovery({
      operation:'rename-no-replace',
      before:{source:src,destination:absent},after
    });
    assert.equal(r.assessment,'INDETERMINATE_RENAME');
    flags(r);
  }
});

test('new entry observed after a partial write NEVER proves its bytes',()=>{
  const r=assessWindowsScratchRecovery({
    operation:'write-exclusive',before:{source:absent},
    after:{source:src},nativeOutcomeUnknown:true
  });
  assert.equal(r.assessment,'OBSERVED_NEW_ENTRY_CONTENT_UNVERIFIED');
  flags(r);
});

test('disappearance of a file or empty directory does not prove power-loss persistence',()=>{
  for(const [operation,before] of [['unlink',src],['rmdir-empty',dir]]){
    const r=assessWindowsScratchRecovery({
      operation,before:{source:before},after:{source:absent}
    });
    assert.equal(r.assessment,'OBSERVED_NAME_ABSENT');
    flags(r);
  }
});

test('wrong OS evidence, malformed identity and unexpected destination fail closed',()=>{
  const badValues=[
    {exists:true,kind:'REGULAR',identity:'INVALID',sizeBytes:'1'},
    {exists:false,kind:'ABSENT',identity:'b'.repeat(24),sizeBytes:'0'},
    {exists:true,kind:'REGULAR',identity:'a'.repeat(24),sizeBytes:'-1'},
    {exists:true,kind:'REGULAR',identity:'a'.repeat(24),sizeBytes:'1e9'},
    {exists:true,kind:'REGULAR',identity:'a'.repeat(24),
      sizeBytes:'18446744073709551616'}
  ];
  for(const source of badValues){
    assert.throws(()=>assessWindowsScratchRecovery({
      operation:'unlink',before:{source},after:{source:absent}
    }),{code:'E_WINDOWS_RECOVERY_OBSERVATION_INVALID'});
  }
  assert.throws(()=>assessWindowsScratchRecovery({
    operation:'unlink',before:{source:src,destination:absent},
    after:{source:absent}
  }),{code:'E_WINDOWS_RECOVERY_UNEXPECTED_DESTINATION'});
  assert.throws(()=>assessWindowsScratchRecovery({
    operation:'rename-no-replace',before:{source:src},
    after:{source:absent}
  }),{code:'E_WINDOWS_RECOVERY_OBSERVATION_INVALID'});
  assert.throws(()=>assessWindowsScratchRecovery({
    operation:'overwrite',before:{source:src},after:{source:src}
  }),{code:'E_WINDOWS_RECOVERY_OPERATION_UNSUPPORTED'});
});

test('a validated inspection-style receipt remains insufficient for automatic mutation',()=>{
  const receipt={kind:'VCP_WINDOWS_SCRATCH_NAMESPACE_CANDIDATE',
    protocolVersion:3,operation:'inspect-entry',completed:true,
    fileFlushReturned:false,directoryFlushReturned:false,
    mayHaveMutated:false,lastWin32Error:0,
    managedMutationAuthorized:false,directoryDurabilityProven:false,
    powerLossAttested:false,entry:src};
  const r=assessWindowsScratchRecovery({
    operation:'unlink',before:{source:receipt},after:{source:absent}
  });
  assert.equal(r.assessment,'OBSERVED_NAME_ABSENT');
  flags(r);
  assert.throws(()=>assessWindowsScratchRecovery({
    operation:'unlink',before:{source:{...receipt,powerLossAttested:true}},
    after:{source:absent}
  }),{code:'E_WINDOWS_RECOVERY_OBSERVATION_INVALID'});
  assert.throws(()=>assessWindowsScratchRecovery({
    operation:'unlink',before:{source:{...receipt,mayHaveMutated:true}},
    after:{source:absent}
  }),{code:'E_WINDOWS_RECOVERY_OBSERVATION_INVALID'});
});
