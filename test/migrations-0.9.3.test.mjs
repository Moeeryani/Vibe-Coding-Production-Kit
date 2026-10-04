import assert from 'node:assert/strict';
import test from 'node:test';
import { MIGRATIONS, resolveMigrationPath } from '../lib/migrations.mjs';

test('0.9.2 projects have an explicit migration path to 0.9.3', () => {
  const path = resolveMigrationPath('0.9.2', '0.9.3', MIGRATIONS);
  assert.deepEqual(path.map((migration) => migration.id), [
    '0.9.2-to-0.9.3-control-plane-evidence'
  ]);
});

test('0.9.1 projects compose through 0.9.2 to 0.9.3', () => {
  const path = resolveMigrationPath('0.9.1', '0.9.3', MIGRATIONS);
  assert.deepEqual(path.map((migration) => migration.id), [
    '0.9.1-to-0.9.2-agent-workflow-followups',
    '0.9.2-to-0.9.3-control-plane-evidence'
  ]);
});

test('0.8.0 projects compose through the complete retained chain to 0.9.3', () => {
  const path = resolveMigrationPath('0.8.0', '0.9.3', MIGRATIONS);
  assert.deepEqual(path.map((migration) => migration.id), [
    '0.8.0-to-0.9.0-foundation',
    '0.9.0-to-0.9.1-dogfood-fixes',
    '0.9.1-to-0.9.2-agent-workflow-followups',
    '0.9.2-to-0.9.3-control-plane-evidence'
  ]);
});
