// Pure source-level D-01 old CLI entrypoint matrix contract.
// This does NOT assert that an old binary reached its mutation path.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {D01_PUBLISHED_OLD_CLI_MATRIX}
  from '../lib/d01-linux-isolation-fixture.mjs';
import {MANAGED_SCHEMA_MIGRATION_GATE}
  from '../lib/managed-migration.mjs';

test('published old CLI matrix covers fixed init/update/manage/rollback commands',()=>{
  assert.deepEqual(D01_PUBLISHED_OLD_CLI_MATRIX.map(x=>x.scenario),[
    'old-init-force','old-update','old-manage-ignore',
    'old-manage-track','old-rollback'
  ]);
  for(const scenario of D01_PUBLISHED_OLD_CLI_MATRIX){
    assert.equal(Object.isFrozen(scenario),true);
    assert.equal(scenario.args.includes('/work'),true);
    assert.equal(scenario.args.includes('--dry-run'),false);
    assert.equal(scenario.args.includes('--check'),false);
    assert.equal(scenario.args.includes('--allow-unsafe-writes'),false);
    assert.equal(scenario.args.every(x=>typeof x==='string'),true);
  }
  assert.equal(MANAGED_SCHEMA_MIGRATION_GATE.status,'NO_GO');
  assert.equal(MANAGED_SCHEMA_MIGRATION_GATE.managedV2MutationAuthorized,false);
});
