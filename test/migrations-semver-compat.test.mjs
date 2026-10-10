import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, MIGRATIONS, resolveMigrationPath } from '../lib/migrations.mjs';
test('migrations remain bounded to existing released Schema-v1 chain', () => {
  assert.equal(MIGRATIONS.length, 4);
  assert.deepEqual(MIGRATIONS.map(m=>[m.from,m.to]),[
    ['0.8.0','0.9.0'], ['0.9.0','0.9.1'],['0.9.1','0.9.2'],['0.9.2','0.9.3']
  ]);
  assert.equal(resolveMigrationPath('0.9.0','0.9.3').length,3);
  assert.deepEqual(resolveMigrationPath('0.9.3','0.9.3'),[]);
  assert.throws(()=>resolveMigrationPath('0.9.3','1.0.0'),/No migration path/);
  assert.throws(()=>resolveMigrationPath('0.9.3','0.9.2'),/Downgrades are not supported/);
});
test('legacy compareVersions delegates to strict new comparator', () => {
  assert.equal(compareVersions('0.9.3-beta','0.9.3'),-1);
  assert.equal(compareVersions('0.9.3+build1','0.9.3+build2'),0);
  assert.throws(()=>compareVersions('0.9.03','0.9.3'),/Invalid semantic version/);
});
